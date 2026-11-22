import type { Entity, Project } from './model/types'
import { WORLD_DOC } from './world'
import { mapOf } from './location/schema'
import { mapNav } from './location/analysis'
import { PLAYER_DEFAULTS, SAVE_STATES, type SaveState } from '../modules/technical'
import { DEFAULT_DAMAGE_FORMULA } from './combatFormula'
import { parseFormula, formulaVars } from './engine/formulaAst'

/**
 * Typed gameplay data for the first vertical slice (plans/UNITY_PLAYABLE_GAME_GENERATION_PLAN.md, phase 2), read
 * from fields the planners already have. Engine-neutral; the engine IR (phase 3) and the runtime modules use it.
 *
 * Vocabulary, kept deliberately small:
 * - Event `itemAcquired { item, count }` — the player got `count` of `item` (picked up, rewarded, crafted…).
 * - Condition `holdItems [{ item, count }]` — the player holds at least `count` of every listed item (AND).
 *   From Story & Quests › Quests › “Goal: hold these items” (`collectItems`). Items are not taken away.
 * - Action `giveItems [{ item, count }]` — adds items to the inventory. From the quest's reward Items (`rewardItems`).
 *
 * Rules: counts are whole numbers ≥ 1 (a value outside is an error, never rounded or clamped); item references are
 * planner item IDs; a quest's condition is checked when it starts and after each itemAcquired event; its reward is
 * given exactly once, when the condition first holds. Money and XP stay plain numbers (`rewardMoney`, `rewardXp`).
 * A quest without a typed goal keeps its objective texts and is reported as not executable — nothing is guessed
 * from the texts or names.
 *
 * Placements come from location maps: a map object with `spawn.role` `player` is where the player starts, one
 * with `item` is an item lying there to pick up (`spawn.refId` the item, `spawn.count` the amount, default 1).
 * Coordinates are map units of that location's map.
 */
export type ItemAmount = { item: string; count: number }
export type GameEvent = { kind: 'itemAcquired'; item: string; count: number }
export type Condition = { kind: 'holdItems'; items: ItemAmount[] }
export type Action = { kind: 'giveItems'; items: ItemAmount[] }

export type QuestRule = {
  quest: string
  name: string
  /** The typed completion condition; absent when the quest only has objective texts. */
  completeWhen?: Condition
  /** Given once when `completeWhen` first holds. */
  onComplete: Action[]
  money: number
  xp: number
  /** Objective texts, kept as descriptions. */
  objectives: string[]
}

export type Placement = { location: string; object: string; role: 'player' | 'item' | 'enemy'; item?: string; enemy?: string; count: number; x: number; y: number }

export type GameplayIssue = { level: 'error' | 'warning' | 'info'; code: string; message: string; where: { doc: string; section: string; id?: string; field?: string } }

const STORY = 'design.story'
const ITEMS = 'design.items'

const list = (p: Project, doc: string, section: string): Entity[] => {
  const v = p.documents[doc]?.data[section]
  return Array.isArray(v) ? (v as Entity[]) : []
}
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 1

/** `{ itemId: count }` from a map field, checked: unknown items and counts that are not whole numbers ≥ 1 are issues, not values. */
function amounts(raw: unknown, items: Set<string>, where: GameplayIssue['where'], label: string, issues: GameplayIssue[]): ItemAmount[] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return []
  const out: ItemAmount[] = []
  for (const [item, count] of Object.entries(raw as Record<string, unknown>)) {
    if (!items.has(item)) issues.push({ level: 'error', code: 'gameplay.unknownItem', where, message: `${label}: “${item}” is not an item of Items & Crafting.` })
    else if (!isCount(count)) issues.push({ level: 'error', code: 'gameplay.badCount', where, message: `${label}: the amount of an item must be a whole number of at least 1 (got ${String(count)}).` })
    else out.push({ item, count })
  }
  return out
}

/** Every quest's typed rule, plus what keeps one from running. */
export function questRules(p: Project): { rules: QuestRule[]; issues: GameplayIssue[] } {
  const items = new Set(list(p, ITEMS, 'items').map((i) => String(i.id)))
  const issues: GameplayIssue[] = []
  const rules = list(p, STORY, 'quests')
    .filter((q) => str(q.name))
    .map((q): QuestRule => {
      const id = String(q.id)
      const name = str(q.name)
      const at = (field: string): GameplayIssue['where'] => ({ doc: STORY, section: 'quests', id, field })
      const goal = amounts(q.collectItems, items, at('collectItems'), `${name} › Goal`, issues)
      const reward = amounts(q.rewardItems, items, at('rewardItems'), `${name} › Reward items`, issues)
      const objectives = Array.isArray(q.objectives) ? (q.objectives as { text?: unknown }[]).map((o) => str(o?.text)).filter(Boolean) : []
      if (!goal.length) issues.push({ level: 'info', code: 'gameplay.textOnlyGoal', where: at('collectItems'), message: `${name}: no typed goal, so the engine cannot tell when it is done; its objectives are text only.` })
      return {
        quest: id,
        name,
        ...(goal.length ? { completeWhen: { kind: 'holdItems' as const, items: goal } } : {}),
        onComplete: reward.length ? [{ kind: 'giveItems', items: reward }] : [],
        money: num(q.rewardMoney),
        xp: num(q.rewardXp),
        objectives,
      }
    })
  return { rules, issues }
}

/** A planned control the runtime uses, with its planned key and gamepad button (as typed in UI / UX › Controls). */
export type RuntimeControl = { control: string; name: string; key?: string; gamepad?: string }
export type RuntimeControls = { move: { forward?: RuntimeControl; back?: RuntimeControl; left?: RuntimeControl; right?: RuntimeControl }; interact?: RuntimeControl; crafting?: RuntimeControl; attack?: RuntimeControl }
const DRIVES: Record<string, keyof RuntimeControls['move'] | 'interact' | 'crafting' | 'attack'> = { 'Move forward': 'forward', 'Move back': 'back', 'Move left': 'left', 'Move right': 'right', Interact: 'interact', 'Open crafting': 'crafting', Attack: 'attack' }

/** The controls marked with a Runtime action (UI / UX › Controls). The first control of each action wins; a second one is reported. */
export function runtimeControls(p: Project): { controls: RuntimeControls; issues: GameplayIssue[] } {
  const controls: RuntimeControls = { move: {} }
  const issues: GameplayIssue[] = []
  for (const c of list(p, 'design.ui', 'controls')) {
    const slot = DRIVES[str(c.drives)]
    if (!slot || !str(c.name)) continue
    const rc: RuntimeControl = { control: String(c.id), name: str(c.name), ...(str(c.key) && { key: str(c.key) }), ...(str(c.gamepad) && { gamepad: str(c.gamepad) }) }
    const taken = slot === 'interact' || slot === 'crafting' || slot === 'attack' ? controls[slot] : controls.move[slot]
    if (taken) {
      issues.push({ level: 'warning', code: 'gameplay.twoControls', where: { doc: 'design.ui', section: 'controls', id: rc.control, field: 'drives' }, message: `${rc.name} and ${taken.name} are both “${str(c.drives)}”; ${taken.name} is used.` })
      continue
    }
    if (slot === 'interact' || slot === 'crafting' || slot === 'attack') controls[slot] = rc
    else controls.move[slot] = rc
  }
  return { controls, issues }
}

export type PlayerSettings = { moveSpeed: number; cameraDistance: number; cameraHeight: number; interactRange: number; attackRange: number; /** Settings the plan left empty, filled in with PLAYER_DEFAULTS. */ defaulted: (keyof typeof PLAYER_DEFAULTS)[] }

/** Player Character › Controls and camera, as numbers; an empty or non-positive value takes the visible default. */
export function playerSettings(p: Project): PlayerSettings {
  const form = p.documents['design.player']?.data.controls
  const d = (form && typeof form === 'object' ? form : {}) as Record<string, unknown>
  const defaulted: PlayerSettings['defaulted'] = []
  const pick = (k: keyof typeof PLAYER_DEFAULTS, min: number) => {
    const v = d[k]
    if (typeof v === 'number' && Number.isFinite(v) && v >= min) return v
    defaulted.push(k)
    return PLAYER_DEFAULTS[k]
  }
  return { moveSpeed: pick('moveSpeed', 0.1), cameraDistance: pick('cameraDistance', 0.5), cameraHeight: pick('cameraHeight', 0), interactRange: pick('interactRange', 0.1), attackRange: pick('attackRange', 0.1), defaulted }
}

/** Player starts and item pickups placed on location maps. */
export function placements(p: Project): { placements: Placement[]; issues: GameplayIssue[] } {
  const items = new Set(list(p, ITEMS, 'items').map((i) => String(i.id)))
  const enemies = new Set(list(p, 'design.combat', 'enemies').map((e) => String(e.id)))
  const out: Placement[] = []
  const issues: GameplayIssue[] = []
  for (const loc of list(p, WORLD_DOC, 'locations')) {
    const map = mapOf(loc)
    if (!map) continue
    const where = { doc: WORLD_DOC, section: 'locations', id: String(loc.id) }
    for (const layer of Object.values(map.layers)) {
      for (const o of layer.objects) {
        const s = o.spawn
        if (!s || (s.role !== 'player' && s.role !== 'item' && s.role !== 'enemy')) continue
        if (s.role === 'enemy') {
          if (!s.refId || !enemies.has(s.refId)) issues.push({ level: 'error', code: 'gameplay.unknownEnemy', where, message: `${str(loc.name)}: an enemy spawn ${s.refId ? `names “${s.refId}”, which is not an enemy of Combat` : 'names no enemy'}.` })
          else out.push({ location: String(loc.id), object: o.id, role: 'enemy', enemy: s.refId, count: 1, x: o.x, y: o.y })
          continue
        }
        if (s.role === 'item' && (!s.refId || !items.has(s.refId))) {
          issues.push({ level: 'error', code: 'gameplay.unknownItem', where, message: `${str(loc.name)}: an item pickup ${s.refId ? `names “${s.refId}”, which is not an item` : 'names no item'}.` })
          continue
        }
        out.push({ location: String(loc.id), object: o.id, role: s.role, ...(s.role === 'item' ? { item: s.refId } : {}), count: s.count ?? 1, x: o.x, y: o.y })
      }
    }
  }
  const starts = out.filter((x) => x.role === 'player')
  if (starts.length > 1) issues.push({ level: 'warning', code: 'gameplay.manyStarts', where: { doc: WORLD_DOC, section: 'locations' }, message: `${starts.length} player starts are placed; the first one is used.` })
  return { placements: out, issues }
}

/**
 * The scene the prototype is played in (Technical Architecture › Playable prototype › Prototype scene) and the
 * location it is built from: the location of the first player start. `metresPerUnit` is the planned map scale; absent,
 * the engine uses one walkability cell of the map (`cell` map units) per metre, as its greybox does.
 */
export type PrototypeScene = { scene?: { id: string; name: string }; location?: { id: string; name: string; metresPerUnit?: number; cell?: number } }

export function prototypeScene(p: Project): { value: PrototypeScene; issues: GameplayIssue[] } {
  const form = p.documents['technical.architecture']?.data.prototype
  const d = (form && typeof form === 'object' ? form : {}) as Record<string, unknown>
  const where = { doc: 'technical.architecture', section: 'prototype' }
  const issues: GameplayIssue[] = []
  const value: PrototypeScene = {}
  const sceneId = str(d.scene)
  if (sceneId) {
    const scene = list(p, 'technical.architecture', 'scenes').find((s) => String(s.id) === sceneId)
    if (scene && str(scene.name)) value.scene = { id: sceneId, name: str(scene.name) }
    else issues.push({ level: 'error', code: 'gameplay.unknownScene', where: { ...where, field: 'scene' }, message: `Prototype scene “${sceneId}” is not a planned scene with a name; choose one of Technical Architecture › Scenes.` })
  }
  const start = placements(p).placements.find((x) => x.role === 'player')
  const loc = start && list(p, WORLD_DOC, 'locations').find((l) => String(l.id) === start.location)
  if (loc) {
    const scale = d.mapScale
    const map = mapOf(loc)
    value.location = { id: String(loc.id), name: str(loc.name) }
    if (typeof scale === 'number' && Number.isFinite(scale) && scale > 0) value.location.metresPerUnit = scale
    else {
      if (scale !== undefined && scale !== null && scale !== '') issues.push({ level: 'error', code: 'gameplay.badScale', where: { ...where, field: 'mapScale' }, message: `Map scale must be a positive number of metres per map unit, not “${String(scale)}”.` })
      if (map) value.location.cell = mapNav(map).cell
    }
  }
  return { value, issues }
}

/**
 * The inventory as the plan states it (phase 10): `slots` from Items & Crafting › Inventory, and per item its stack
 * size — the item's Max stack, else the Item model's Default stack size. An item with neither, or a value that is not
 * a whole number ≥ 1, is an error, never a guess. Every slot holds one item up to its stack; weight is not limited yet.
 * `shown` lists where the HUD shows it: a Grid bound to the inventory, Counters bound to items.
 */
export type InventoryItem = { item: string; name: string; stack: number }
export type InventoryRules = { slots: number; items: InventoryItem[]; shown: { grid: boolean; counters: string[] } }

export function inventoryRules(p: Project): { rules: InventoryRules; issues: GameplayIssue[] } {
  const issues: GameplayIssue[] = []
  const form = (doc: string, section: string) => {
    const v = p.documents[doc]?.data[section]
    return (v && typeof v === 'object' && !Array.isArray(v) ? v : {}) as Record<string, unknown>
  }
  const slotsRaw = form(ITEMS, 'inventory').slots
  const slots = isCount(slotsRaw) ? slotsRaw : 0
  if (slotsRaw !== undefined && slotsRaw !== null && slotsRaw !== '' && !isCount(slotsRaw))
    issues.push({ level: 'error', code: 'gameplay.badSlots', where: { doc: ITEMS, section: 'inventory', field: 'slots' }, message: `Inventory slots must be a whole number ≥ 1, not “${String(slotsRaw)}”.` })
  const fallback = form(ITEMS, 'model').defaultStack
  const items: InventoryItem[] = []
  for (const it of list(p, ITEMS, 'items')) {
    const name = str(it.name)
    if (!name) continue
    const where = { doc: ITEMS, section: 'items', id: String(it.id), field: 'stack' }
    const own = it.stack
    const has = (v: unknown) => v !== undefined && v !== null && v !== ''
    if (has(own) && !isCount(own)) {
      issues.push({ level: 'error', code: 'gameplay.badStack', where, message: `${name}: Max stack must be a whole number ≥ 1, not “${String(own)}”.` })
      continue
    }
    const stack = isCount(own) ? own : isCount(fallback) ? fallback : undefined
    if (stack === undefined) {
      issues.push({ level: 'error', code: 'gameplay.noStack', where, message: `${name} has no Max stack and the Item model has no Default stack size; set one, it is not guessed.` })
      continue
    }
    items.push({ item: String(it.id), name, stack })
  }
  const shown = { grid: false, counters: [] as string[] }
  for (const s of list(p, 'design.ui', 'screens')) {
    if (str(s.kind) !== 'HUD') continue
    const els = ((s.layout as { elements?: { kind?: string; bind?: { source?: string; id?: string } }[] } | undefined)?.elements ?? [])
    for (const e of els) {
      if (e.kind === 'grid' && e.bind?.source === 'inventory') shown.grid = true
      if (e.kind === 'counter' && e.bind?.source === 'item' && e.bind.id) shown.counters.push(e.bind.id)
    }
  }
  if (!shown.grid && !shown.counters.length)
    issues.push({ level: 'warning', code: 'gameplay.inventoryNotShown', where: { doc: 'design.ui', section: 'screens' }, message: 'No HUD element shows the inventory: put a Grid bound to Inventory or a Counter bound to an item on the HUD screen (UI / UX › Screens).' })
  return { rules: { slots, items, shown }, issues }
}

/**
 * Which saved part holds which runtime state (phase 12): Save System › Saved parts › Runtime state, by part, never
 * from its name. The first part of a state wins; a second is reported. Parts are kept in plan order, which is also the
 * order the game restores them.
 */
export type SaveLink = { part: string; name: string; state: SaveState }

export function saveLinks(p: Project): { links: SaveLink[]; issues: GameplayIssue[] } {
  const links: SaveLink[] = []
  const issues: GameplayIssue[] = []
  for (const part of list(p, 'technical.save', 'parts')) {
    const state = str(part.state)
    if (!str(part.name) || !(SAVE_STATES as readonly string[]).includes(state)) continue
    const taken = links.find((l) => l.state === state)
    if (taken) {
      issues.push({ level: 'warning', code: 'gameplay.twoSaveParts', where: { doc: 'technical.save', section: 'parts', id: String(part.id), field: 'state' }, message: `${str(part.name)} and ${taken.name} both hold “${state}”; ${taken.name} is used.` })
      continue
    }
    links.push({ part: String(part.id), name: str(part.name), state: state as SaveState })
  }
  return { links, issues }
}

/**
 * Recipes as typed rules (phase 14), from Items & Crafting › Recipes: inputs are the item ingredients × quantity (whole
 * numbers ≥ 1), the output is the result × Output quantity (empty: 1, as the field says), and the quests under
 * “Unlocked by” must all be done before it can be crafted. What the prototype does not run is said, never faked: a
 * recipe that needs raw resources is left out (they are not inventory items); a station, a required skill, a faction
 * or skill unlock and the craft time are not checked (crafting is instant, anywhere).
 */
export type RecipeRule = { recipe: string; name: string; inputs: ItemAmount[]; output: ItemAmount; unlockQuests: string[] }

export function recipeRules(p: Project): { rules: RecipeRule[]; issues: GameplayIssue[] } {
  const items = new Set(list(p, ITEMS, 'items').map((i) => String(i.id)))
  const quests = new Set(list(p, STORY, 'quests').map((q) => String(q.id)))
  const issues: GameplayIssue[] = []
  const rules: RecipeRule[] = []
  for (const r of list(p, ITEMS, 'recipes')) {
    const name = str(r.name)
    if (!name) continue
    const id = String(r.id)
    const at = (field: string): GameplayIssue['where'] => ({ doc: ITEMS, section: 'recipes', id, field })
    const before = issues.length
    const result = str(r.result)
    if (!result || !items.has(result)) issues.push({ level: 'error', code: 'gameplay.recipeResult', where: at('result'), message: `${name}: ${result ? `the result “${result}” is not an item` : 'no result item'}.` })
    const qty = r.outputQty
    const has = (v: unknown) => v !== undefined && v !== null && v !== ''
    if (has(qty) && !isCount(qty)) issues.push({ level: 'error', code: 'gameplay.badCount', where: at('outputQty'), message: `${name}: Output quantity must be a whole number of at least 1 (got ${String(qty)}).` })
    const inputs = amounts(r.ingredients, items, at('ingredients'), `${name} › Ingredients`, issues)
    const resources = r.resources && typeof r.resources === 'object' ? Object.keys(r.resources as object).filter((k) => Number((r.resources as Record<string, unknown>)[k]) > 0) : []
    if (resources.length) {
      issues.push({ level: 'warning', code: 'gameplay.recipeResources', where: at('resources'), message: `${name} needs raw resources (${resources.join(', ')}), which are not inventory items, so the prototype cannot craft it.` })
      continue
    }
    if (!inputs.length && issues.length === before) issues.push({ level: 'error', code: 'gameplay.recipeNoInputs', where: at('ingredients'), message: `${name} has no ingredients: it would make ${result || 'its result'} from nothing.` })
    const unlocks = Array.isArray(r.unlockedBy) ? (r.unlockedBy as unknown[]).map(String) : []
    const unlockQuests = unlocks.filter((u) => quests.has(u))
    const unchecked = [
      ...(str(r.station) ? ['station'] : []),
      ...(str(r.requiresSkill) ? ['required skill'] : []),
      ...(unlocks.length > unlockQuests.length ? ['unlocks that are not quests'] : []),
      ...(Number(r.craftTime) > 0 ? ['craft time (crafting is instant)'] : []),
    ]
    if (unchecked.length) issues.push({ level: 'info', code: 'gameplay.recipeUnchecked', where: at('station'), message: `${name}: the prototype does not check ${unchecked.join(', ')}.` })
    if (unlockQuests.length > 1) issues.push({ level: 'info', code: 'gameplay.recipeUnlocks', where: at('unlockedBy'), message: `${name} is unlocked when all ${unlockQuests.length} quests under Unlocked by are done.` })
    if (issues.slice(before).some((i) => i.level === 'error')) continue
    rules.push({ recipe: id, name, inputs, output: { item: result, count: isCount(qty) ? qty : 1 }, unlockQuests })
  }
  return { rules, issues }
}

/**
 * The first supported combat model (phase 15), stated plainly and nothing more: melee only. The player hits the nearest
 * living enemy in reach (Player Character › Attack range) with the Player weapon (Technical Architecture › Playable
 * prototype) — its Damage, Damage type and Attacks per second (Items & Crafting). Enemies placed on a map (spawn role
 * “enemy”) have their Combat values: HP, Damage per hit, Attacks per second, Armor, Resistances, Speed and Aggression
 * (Passive never attacks; Territorial and Hunter chase the player within the aggro radius and hit in reach). Every hit
 * is the plan's damage formula (Combat › Damage and defense model; empty: the default) with attack, armor, resist and
 * crit = 1. The player has the Health survival stat's Max (else 100) and no armor or resistances; at 0 it is back at the
 * start with full health. A defeated enemy gives its XP (in an event) and the items its loot tables always drop.
 * Not run, and said so: ranged, caster and support enemies, crits, status effects, difficulty and night scaling,
 * weighted loot rolls, bosses and variants.
 */
export type CombatEnemy = { enemy: string; name: string; hp: number; damage: number; attackRate: number; armor: number; resistances: Record<string, number>; damageType?: string; speed: number; passive: boolean; xp: number; loot: ItemAmount[] }
export type CombatRules = {
  player: { hp: number; weapon?: { item: string; damage: number; damageType?: string; attackRate: number } }
  formula: string
  enemies: CombatEnemy[]
  /** Visible defaults the rules filled in. */
  defaults: string[]
}
export const COMBAT_DEFAULTS = { playerHp: 100, enemySpeed: 2, weaponRate: 1, aggroRadius: 8, enemyReach: 1.5 } as const
const FORMULA_VARS = ['attack', 'armor', 'resist', 'crit']
const UNSUPPORTED_ROLES = ['Ranged', 'Caster', 'Support']

export function combatRules(p: Project): { rules: CombatRules; issues: GameplayIssue[] } {
  const issues: GameplayIssue[] = []
  const defaults: string[] = []
  const form = (doc: string, section: string) => {
    const v = p.documents[doc]?.data[section]
    return (v && typeof v === 'object' && !Array.isArray(v) ? v : {}) as Record<string, unknown>
  }
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
  // The damage formula.
  const planned = str(form('design.combat', 'damageModel').damageFormula)
  const formula = planned || DEFAULT_DAMAGE_FORMULA
  try {
    const unknown = formulaVars(parseFormula(formula)).filter((v) => !FORMULA_VARS.includes(v))
    if (unknown.length) issues.push({ level: 'error', code: 'gameplay.damageFormulaVars', where: { doc: 'design.combat', section: 'damageModel', field: 'damageFormula' }, message: `The damage formula uses ${unknown.join(', ')}; the prototype knows attack, armor, resist and crit.` })
  } catch (e) {
    issues.push({ level: 'error', code: 'gameplay.damageFormula', where: { doc: 'design.combat', section: 'damageModel', field: 'damageFormula' }, message: `The damage formula cannot be read: ${(e as Error).message}.` })
  }
  if (!planned) defaults.push(`damage formula = ${DEFAULT_DAMAGE_FORMULA}`)
  // The player.
  const health = list(p, 'design.player', 'survival').find((s) => s.stat === 'health')
  const hp = n(health?.max) && n(health?.max)! > 0 ? n(health!.max)! : COMBAT_DEFAULTS.playerHp
  if (hp === COMBAT_DEFAULTS.playerHp && !(n(health?.max) && n(health?.max)! > 0)) defaults.push(`player health = ${COMBAT_DEFAULTS.playerHp} (no Health survival stat with a Max)`)
  const weaponId = str(form('technical.architecture', 'prototype').weapon)
  const item = weaponId ? list(p, ITEMS, 'items').find((i) => String(i.id) === weaponId) : undefined
  let weapon: CombatRules['player']['weapon']
  const wWhere = { doc: ITEMS, section: 'items', id: weaponId, field: 'damage' }
  if (weaponId && !item) issues.push({ level: 'error', code: 'gameplay.unknownWeapon', where: { doc: 'technical.architecture', section: 'prototype', field: 'weapon' }, message: `The Player weapon “${weaponId}” is not an item.` })
  else if (item) {
    const damage = n(item.damage)
    if (!damage || damage <= 0) issues.push({ level: 'error', code: 'gameplay.weaponDamage', where: wWhere, message: `${str(item.name)} is the Player weapon but has no Damage.` })
    else {
      const rate = n(item.attackSpeed) && n(item.attackSpeed)! > 0 ? n(item.attackSpeed)! : COMBAT_DEFAULTS.weaponRate
      if (!(n(item.attackSpeed)! > 0)) defaults.push(`${str(item.name)} attacks per second = ${COMBAT_DEFAULTS.weaponRate}`)
      weapon = { item: weaponId, damage, ...(str(item.damageType) ? { damageType: str(item.damageType) } : {}), attackRate: rate }
    }
  }
  // Enemies that are placed on a map.
  const placedIds = new Set(placements(p).placements.filter((x) => x.role === 'enemy').map((x) => x.enemy!))
  const lootTables = list(p, ITEMS, 'loot')
  const enemies: CombatEnemy[] = []
  for (const e of list(p, 'design.combat', 'enemies')) {
    const id = String(e.id)
    if (!placedIds.has(id)) continue
    const name = str(e.name) || id
    const at = (field: string) => ({ doc: 'design.combat', section: 'enemies', id, field })
    const role = str(e.role)
    if (UNSUPPORTED_ROLES.includes(role)) {
      issues.push({ level: 'error', code: 'gameplay.attackUnsupported', where: at('role'), message: `${name} is a ${role} enemy: the prototype only runs melee attacks, so it cannot fight as planned. Make it Swarm, Brute or Elite, or take it off the map.` })
      continue
    }
    const need = (field: string, label: string) => {
      const v = n(e[field])
      if (v === undefined || v <= 0) {
        issues.push({ level: 'error', code: 'gameplay.enemyStat', where: at(field), message: `${name} is placed on a map but has no ${label}.` })
        return undefined
      }
      return v
    }
    const ehp = need('hp', 'HP')
    const edmg = need('damage', 'Damage per hit')
    const erate = need('attackRate', 'Attacks per second')
    if (ehp === undefined || edmg === undefined || erate === undefined) continue
    const speed = n(e.speed) && n(e.speed)! > 0 ? n(e.speed)! : COMBAT_DEFAULTS.enemySpeed
    if (!(n(e.speed)! > 0)) defaults.push(`${name} speed = ${COMBAT_DEFAULTS.enemySpeed} m/s`)
    const resistances = Object.fromEntries(Object.entries((e.resistances && typeof e.resistances === 'object' ? e.resistances : {}) as Record<string, unknown>).filter(([, v]) => typeof v === 'number').map(([k, v]) => [k, v as number]))
    const loot: ItemAmount[] = []
    for (const t of lootTables) {
      const sources = Array.isArray(t.sources) ? (t.sources as unknown[]).map(String) : []
      if (!sources.includes(id)) continue
      for (const g of Array.isArray(t.guaranteed) ? (t.guaranteed as unknown[]).map(String) : []) {
        const have = loot.find((l) => l.item === g)
        if (have) have.count++
        else loot.push({ item: g, count: 1 })
      }
      if (t.weights && typeof t.weights === 'object' && Object.keys(t.weights as object).length)
        issues.push({ level: 'info', code: 'gameplay.lootRolls', where: { doc: ITEMS, section: 'loot', id: String(t.id), field: 'weights' }, message: `${str(t.name)}: the prototype gives only the items it always drops, not the weighted rolls.` })
    }
    const unchecked = [
      ...(str(e.pattern) ? ['attack pattern'] : []),
      ...(Array.isArray(e.weaknesses) && e.weaknesses.length ? ['weaknesses (use Resistances)'] : []),
      ...(e.nightVariant ? ['night variant'] : []),
    ]
    if (unchecked.length) issues.push({ level: 'info', code: 'gameplay.enemyUnchecked', where: at('pattern'), message: `${name}: the prototype does not run ${unchecked.join(', ')}.` })
    enemies.push({ enemy: id, name, hp: ehp, damage: edmg, attackRate: erate, armor: n(e.armor) ?? 0, resistances, ...(str(e.damageType) ? { damageType: str(e.damageType) } : {}), speed, passive: str(e.aggression) === 'Passive', xp: n(e.xp) ?? 0, loot })
  }
  const dm = form('design.combat', 'damageModel')
  const notRun = [
    ...(n(dm.critChance) ? ['crit chance'] : []),
    ...(str(dm.hpParam) || str(dm.damageParam) ? ['difficulty scaling'] : []),
    ...(dm.useNightStrength ? ['night strength'] : []),
    ...(list(p, 'design.combat', 'statusEffects').length ? ['status effects'] : []),
  ]
  if (notRun.length) issues.push({ level: 'info', code: 'gameplay.combatUnchecked', where: { doc: 'design.combat', section: 'damageModel' }, message: `The prototype's combat does not run ${notRun.join(', ')}.` })
  return { rules: { player: { hp, ...(weapon ? { weapon } : {}) }, formula, enemies, defaults }, issues }
}
