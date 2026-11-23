import type { Entity, Project } from './model/types'
import { WORLD_DOC } from './world'
import { mapOf } from './location/schema'
import { mapNav } from './location/analysis'
import { nearestOpen, reachable, type NavGrid } from './location/nav'
import { PLAYER_DEFAULTS, SAVE_STATES, type SaveState } from '../modules/technical'
import { DEFAULT_DAMAGE_FORMULA } from './combatFormula'
import { parseFormula, formulaVars, evalFormula } from './engine/formulaAst'

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

/** `route`: an enemy's patrol route, the points of the line it walks (map units of its map). */
export type Placement = { location: string; object: string; role: 'player' | 'item' | 'enemy' | 'npc' | 'merchant'; item?: string; enemy?: string; character?: string; merchant?: string; route?: { x: number; y: number }[]; count: number; x: number; y: number }

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
export type RuntimeControls = { move: { forward?: RuntimeControl; back?: RuntimeControl; left?: RuntimeControl; right?: RuntimeControl }; interact?: RuntimeControl; crafting?: RuntimeControl; attack?: RuntimeControl; quickSave?: RuntimeControl; quickLoad?: RuntimeControl }
type ActionSlot = 'interact' | 'crafting' | 'attack' | 'quickSave' | 'quickLoad'
const ACTION_SLOTS = new Set<string>(['interact', 'crafting', 'attack', 'quickSave', 'quickLoad'])
const DRIVES: Record<string, keyof RuntimeControls['move'] | ActionSlot> = { 'Move forward': 'forward', 'Move back': 'back', 'Move left': 'left', 'Move right': 'right', Interact: 'interact', 'Open crafting': 'crafting', Attack: 'attack', 'Quick save': 'quickSave', 'Quick load': 'quickLoad' }

/** The controls marked with a Runtime action (UI / UX › Controls). The first control of each action wins; a second one is reported. */
export function runtimeControls(p: Project): { controls: RuntimeControls; issues: GameplayIssue[] } {
  const controls: RuntimeControls = { move: {} }
  const issues: GameplayIssue[] = []
  for (const c of list(p, 'design.ui', 'controls')) {
    const slot = DRIVES[str(c.drives)]
    if (!slot || !str(c.name)) continue
    const rc: RuntimeControl = { control: String(c.id), name: str(c.name), ...(str(c.key) && { key: str(c.key) }), ...(str(c.gamepad) && { gamepad: str(c.gamepad) }) }
    const taken = ACTION_SLOTS.has(slot) ? controls[slot as ActionSlot] : controls.move[slot as keyof RuntimeControls['move']]
    if (taken) {
      issues.push({ level: 'warning', code: 'gameplay.twoControls', where: { doc: 'design.ui', section: 'controls', id: rc.control, field: 'drives' }, message: `${rc.name} and ${taken.name} are both “${str(c.drives)}”; ${taken.name} is used.` })
      continue
    }
    if (ACTION_SLOTS.has(slot)) controls[slot as ActionSlot] = rc
    else controls.move[slot as keyof RuntimeControls['move']] = rc
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
  const characters = new Set(list(p, STORY, 'characters').map((e) => String(e.id)))
  const merchants = new Set(list(p, 'design.trade', 'merchants').map((e) => String(e.id)))
  const out: Placement[] = []
  const issues: GameplayIssue[] = []
  for (const loc of list(p, WORLD_DOC, 'locations')) {
    const map = mapOf(loc)
    if (!map) continue
    const where = { doc: WORLD_DOC, section: 'locations', id: String(loc.id) }
    for (const layer of Object.values(map.layers)) {
      for (const o of layer.objects) {
        const s = o.spawn
        if (!s || (s.role !== 'player' && s.role !== 'item' && s.role !== 'enemy' && s.role !== 'npc' && s.role !== 'merchant')) continue
        if (s.role === 'merchant') {
          // A merchant stall without a merchant stays a plain marker; one that names an unknown merchant is an error.
          if (!s.refId) continue
          if (!merchants.has(s.refId)) issues.push({ level: 'error', code: 'gameplay.unknownMerchant', where, message: `${str(loc.name)}: a merchant names “${s.refId}”, which is not a merchant of Trade & Economy.` })
          else out.push({ location: String(loc.id), object: o.id, role: 'merchant', merchant: s.refId, count: 1, x: o.x, y: o.y })
          continue
        }
        if (s.role === 'npc') {
          // An NPC without a character stays a plain marker, as before; one that names an unknown character is an error.
          if (!s.refId) continue
          if (!characters.has(s.refId)) issues.push({ level: 'error', code: 'gameplay.unknownCharacter', where, message: `${str(loc.name)}: an NPC names “${s.refId}”, which is not a character of Story & Quests.` })
          else out.push({ location: String(loc.id), object: o.id, role: 'npc', character: s.refId, count: 1, x: o.x, y: o.y })
          continue
        }
        if (s.role === 'enemy') {
          if (!s.refId || !enemies.has(s.refId)) issues.push({ level: 'error', code: 'gameplay.unknownEnemy', where, message: `${str(loc.name)}: an enemy spawn ${s.refId ? `names “${s.refId}”, which is not an enemy of Combat` : 'names no enemy'}.` })
          else {
            const line = s.route ? Object.values(map.layers).flatMap((l) => l.objects).find((x) => x.id === s.route) : undefined
            if (s.route && (!line || (line.points?.length ?? 0) < 2))
              issues.push({ level: 'error', code: 'gameplay.routeUnknown', where, message: `${str(loc.name)}: an enemy patrols “${s.route}”, which is not a line of at least two points on this map.` })
            const route = line?.points && line.points.length >= 2 ? line.points.map(([x, y]) => ({ x, y })) : undefined
            out.push({ location: String(loc.id), object: o.id, role: 'enemy', enemy: s.refId, ...(route ? { route } : {}), count: 1, x: o.x, y: o.y })
          }
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
 * The prototype's world (phase 18): the locations it is played in (Playable prototype › Locations in the prototype;
 * empty: only the location with the player start, a visible default) and the passages between them. A passage is a
 * map object that opens another location of the prototype (`link.locationId`, as the map editor's “Opens location”);
 * the player arrives at that location's object that opens the way back (its way out), on the nearest walkable cell.
 * The loading profile is stated, not guessed: every location is built into the one prototype scene, side by side, and
 * a passage moves the player between them. What is not playable is reported with its place: a location without a map,
 * a passage without a way back, a pickup, NPC or passage the player cannot reach from the start (through passages),
 * an enemy on blocked ground, a location no passage leads to.
 */
export type WorldLocation = { id: string; name: string; cell: number; w: number; h: number }
export type Passage = { object: string; location: string; to: string; x: number; y: number; arrival: { object: string; x: number; y: number } }
export type WorldRules = { loading: 'one-scene'; locations: WorldLocation[]; passages: Passage[]; defaulted: boolean }

const center = (g: NavGrid, i: number) => ({ x: ((i % g.cols) + 0.5) * g.cell, y: (Math.floor(i / g.cols) + 0.5) * g.cell })

export function worldRules(p: Project): { rules: WorldRules; issues: GameplayIssue[] } {
  const issues: GameplayIssue[] = []
  const form = p.documents['technical.architecture']?.data.prototype
  const d = (form && typeof form === 'object' ? form : {}) as Record<string, unknown>
  const at = { doc: 'technical.architecture', section: 'prototype', field: 'locations' }
  const all = list(p, WORLD_DOC, 'locations')
  const { placements: placed } = placements(p)
  const start = placed.find((x) => x.role === 'player')
  const chosen = Array.isArray(d.locations) ? d.locations.map(String) : []
  const defaulted = chosen.length === 0
  const ids = defaulted ? (start ? [start.location] : []) : chosen
  const locations: WorldLocation[] = []
  const navs = new Map<string, NavGrid>()
  const objectsOf = new Map<string, ReturnType<typeof mapObjects>>()
  for (const id of ids) {
    const loc = all.find((l) => String(l.id) === id)
    if (!loc) {
      issues.push({ level: 'error', code: 'gameplay.unknownLocation', where: at, message: `Locations in the prototype: “${id}” is not a location of World & Biomes.` })
      continue
    }
    const map = mapOf(loc)
    const where = { doc: WORLD_DOC, section: 'locations', id }
    if (!map) {
      issues.push({ level: 'error', code: 'gameplay.noMap', where, message: `${str(loc.name) || id} is in the prototype but has no map; open it in World & Biomes › Locations and generate or draw one.` })
      continue
    }
    const nav = mapNav(map)
    if (!nav.cost.some((c) => c > 0)) {
      issues.push({ level: 'error', code: 'gameplay.noGround', where, message: `${str(loc.name) || id}: its map has no walkable ground.` })
      continue
    }
    navs.set(id, nav)
    objectsOf.set(id, mapObjects(map))
    locations.push({ id, name: str(loc.name) || id, cell: nav.cell, w: map.w, h: map.h })
  }
  if (start && ids.length && !ids.includes(start.location))
    issues.push({ level: 'error', code: 'gameplay.startOutside', where: at, message: `The player starts in ${str(all.find((l) => String(l.id) === start.location)?.name) || start.location}, which is not among the locations in the prototype.` })
  const name = (id: string) => locations.find((l) => l.id === id)?.name ?? (str(all.find((l) => String(l.id) === id)?.name) || id)

  // Passages: objects that open another location of the prototype, with the way back on the other map.
  const passages: Passage[] = []
  for (const loc of locations) {
    for (const o of objectsOf.get(loc.id)!) {
      const to = o.link?.locationId
      if (!to || to === loc.id) continue
      const where = { doc: WORLD_DOC, section: 'locations', id: loc.id }
      if (!navs.has(to)) {
        if (all.some((l) => String(l.id) === to)) issues.push({ level: 'info', code: 'gameplay.passageOutside', where, message: `${loc.name}: ${o.label || o.kind} opens ${name(to)}, which is not in the prototype; it stays closed.` })
        continue
      }
      const back = objectsOf.get(to)!.find((x) => x.link?.locationId === loc.id)
      if (!back) {
        issues.push({ level: 'error', code: 'gameplay.passageNoWayBack', where: { doc: WORLD_DOC, section: 'locations', id: to }, message: `${loc.name}: ${o.label || o.kind} leads to ${name(to)}, but no object there opens the way back to ${loc.name}, so there is nowhere to arrive; mark its way out (Opens location).` })
        continue
      }
      const nav = navs.get(to)!
      const cell = nearestOpen(nav, [back.x, back.y], {}, 80)
      if (cell < 0) {
        issues.push({ level: 'error', code: 'gameplay.passageBlocked', where: { doc: WORLD_DOC, section: 'locations', id: to }, message: `${name(to)}: the way back to ${loc.name} has no walkable ground near it, so the player cannot arrive there.` })
        continue
      }
      passages.push({ object: o.id, location: loc.id, to, x: o.x, y: o.y, arrival: { object: back.id, ...center(nav, cell) } })
    }
  }

  // Reach: from the start, through the passages the player can get to; then what lies out of reach.
  const reach = playerSettings(p).interactRange
  const reached = new Map<string, Uint8Array>()
  const add = (loc: string, from: { x: number; y: number }) => {
    const nav = navs.get(loc)
    if (!nav) return false
    const r = reachable(nav, [from.x, from.y])
    const was = reached.get(loc)
    if (!was) {
      reached.set(loc, r)
      return true
    }
    let grew = false
    for (let i = 0; i < r.length; i++) if (r[i] && !was[i]) [was[i], grew] = [1, true]
    return grew
  }
  // Within reach: a walkable reached cell within the interaction range (in metres, one cell per metre unless scaled).
  const scale = typeof d.mapScale === 'number' && d.mapScale > 0 ? d.mapScale : undefined
  const near = (loc: string, x: number, y: number) => {
    const nav = navs.get(loc)
    const r = reached.get(loc)
    if (!nav || !r) return false
    const range = scale ? reach / scale : reach * nav.cell
    const [c0, r0] = [Math.floor(x / nav.cell), Math.floor(y / nav.cell)]
    const span = Math.ceil(range / nav.cell)
    for (let dr = -span; dr <= span; dr++)
      for (let dc = -span; dc <= span; dc++) {
        const [c, rr] = [c0 + dc, r0 + dr]
        if (c < 0 || rr < 0 || c >= nav.cols || rr >= nav.rows || !r[rr * nav.cols + c]) continue
        const cc = center(nav, rr * nav.cols + c)
        if (Math.hypot(cc.x - x, cc.y - y) <= range) return true
      }
    return false
  }
  if (start && navs.has(start.location)) {
    add(start.location, start)
    for (let changed = true; changed; ) {
      changed = false
      for (const ps of passages) if (near(ps.location, ps.x, ps.y) && add(ps.to, ps.arrival)) changed = true
    }
  }
  if (start && navs.has(start.location)) {
    for (const loc of locations.filter((l) => !reached.has(l.id) && l.id !== start.location))
      issues.push({ level: 'warning', code: 'gameplay.locationUnreached', where: { doc: WORLD_DOC, section: 'locations', id: loc.id }, message: `${loc.name} is in the prototype, but no passage the player can reach leads there.` })
    for (const ps of passages.filter((x) => reached.has(x.location) && !near(x.location, x.x, x.y)))
      issues.push({ level: 'error', code: 'gameplay.passageUnreachable', where: { doc: WORLD_DOC, section: 'locations', id: ps.location }, message: `${name(ps.location)}: the way to ${name(ps.to)} is out of the player's reach (more than ${reach} m from walkable ground the player gets to).` })
    for (const x of placed.filter((y) => y.role !== 'player' && reached.has(y.location))) {
      if (x.role === 'enemy') {
        const nav = navs.get(x.location)!
        const i = Math.floor(x.y / nav.cell) * nav.cols + Math.floor(x.x / nav.cell)
        const off = (x.route ?? []).filter((pt) => !reached.get(x.location)![Math.floor(pt.y / nav.cell) * nav.cols + Math.floor(pt.x / nav.cell)])
        if (off.length) issues.push({ level: 'warning', code: 'gameplay.routeBlocked', where: { doc: WORLD_DOC, section: 'locations', id: x.location }, message: `${name(x.location)}: ${off.length} point${off.length === 1 ? '' : 's'} of an enemy's patrol route lie off the ground the player walks on; it may not get there.` })
        if (!reached.get(x.location)![i]) issues.push({ level: 'warning', code: 'gameplay.spawnBlocked', where: { doc: WORLD_DOC, section: 'locations', id: x.location }, message: `${name(x.location)}: an enemy stands on ground the player cannot walk to; it may never fight.` })
      } else if (!near(x.location, x.x, x.y))
        issues.push({ level: x.role === 'item' ? 'error' : 'warning', code: 'gameplay.spawnBlocked', where: { doc: WORLD_DOC, section: 'locations', id: x.location }, message: `${name(x.location)}: ${x.role === 'item' ? `the pickup of ${x.item}` : 'an NPC'} is out of the player's reach (more than ${reach} m from walkable ground the player gets to).` })
    }
  }
  return { rules: { loading: 'one-scene', locations, passages, defaulted }, issues }
}

const mapObjects = (map: NonNullable<ReturnType<typeof mapOf>>) => Object.values(map.layers).flatMap((l) => l.objects)

/**
 * Player progression (phase 20): the levels of Player Character › Levelling. `xpToNext[i]` is the XP needed from level
 * i + 1 to the next, by the plan's formula (variable `level`), whole numbers ≥ 1; the cap stops levelling. XP comes from
 * the events the other modules send: a completed quest's Reward XP and a defeated enemy's XP. Each level up gives the
 * planned skill and stat points (counted; spending them is not run).
 */
/** A number, or undefined when the plan leaves it empty (not 0). */
const given = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)

export type ProgressionRules = { levelCap: number; xpToNext: number[]; skillPointsPerLevel: number; statPointsPerLevel: number; startSkillPoints: number; defaults: string[] }
export const PROGRESSION_DEFAULTS = { levelCap: 10 } as const

export function progressionRules(p: Project): { rules: ProgressionRules; issues: GameplayIssue[] } {
  const issues: GameplayIssue[] = []
  const d = (p.documents['design.player']?.data.leveling ?? {}) as Record<string, unknown>
  const at = (field: string) => ({ doc: 'design.player', section: 'leveling', field })
  const defaults: string[] = []
  const capRaw = given(d.levelCap)
  const levelCap = capRaw !== undefined && capRaw >= 1 ? Math.floor(capRaw) : PROGRESSION_DEFAULTS.levelCap
  if (capRaw === undefined) defaults.push(`level cap = ${PROGRESSION_DEFAULTS.levelCap}`)
  const xpToNext: number[] = []
  const formula = str(d.xpFormula)
  if (formula) {
    try {
      const ast = parseFormula(formula)
      const other = formulaVars(ast).filter((v) => v !== 'level')
      if (other.length) issues.push({ level: 'error', code: 'gameplay.xpFormulaVars', where: at('xpFormula'), message: `XP needed for the next level may only use the variable level, not ${other.join(', ')}.` })
      else
        for (let level = 1; level < levelCap; level++) {
          const v = evalFormula(ast, { level })
          if (!Number.isFinite(v) || v < 1) {
            issues.push({ level: 'error', code: 'gameplay.xpFormulaValue', where: at('xpFormula'), message: `XP needed for the next level is ${Number.isFinite(v) ? v : 'not a number'} at level ${level}; it must be at least 1.` })
            break
          }
          xpToNext.push(Math.round(v))
        }
    } catch (e) {
      issues.push({ level: 'error', code: 'gameplay.xpFormula', where: at('xpFormula'), message: `XP needed for the next level: ${(e as Error).message}` })
    }
  }
  const pts = (k: string) => Math.max(0, given(d[k]) ?? 0)
  return { rules: { levelCap, xpToNext, skillPointsPerLevel: pts('skillPointsPerLevel'), statPointsPerLevel: pts('statPointsPerLevel'), startSkillPoints: pts('startSkillPoints'), defaults }, issues }
}

/**
 * Trading (phase 20): a wallet in the base unit (Trade & Economy › Money: starting money, wallet limit) that quests'
 * Reward money fills; merchants of Trade & Economy placed on maps (spawn role “merchant”). A merchant sells its goods
 * at the item's Value × its markup (rounded up) and buys its goods and items of the types it buys at Value × its
 * buyback (rounded down), while it has money for buying. Items without a value are not traded. Stock sizes, rarity,
 * visits, restocking and currencies other than the base unit are not run.
 */
export type TradeOffer = { item: string; price: number }
export type MerchantRules = { merchant: string; name: string; sells: TradeOffer[]; buys: TradeOffer[]; gold?: number }
export type TradeRules = { startMoney: number; walletCap?: number; merchants: MerchantRules[] }

export function tradeRules(p: Project): { rules: TradeRules; issues: GameplayIssue[] } {
  const issues: GameplayIssue[] = []
  const money = (p.documents['design.trade']?.data.money ?? {}) as Record<string, unknown>
  const items = list(p, ITEMS, 'items')
  const valueOf = new Map(items.map((i) => [String(i.id), given(i.value) ?? 0]))
  const placed = new Set(placements(p).placements.filter((x) => x.role === 'merchant').map((x) => x.merchant!))
  const merchants: MerchantRules[] = []
  for (const m of list(p, 'design.trade', 'merchants')) {
    const id = String(m.id)
    if (!placed.has(id)) continue
    const name = str(m.name) || id
    const at = (field: string) => ({ doc: 'design.trade', section: 'merchants', id, field })
    const markup = given(m.markup) !== undefined && given(m.markup)! > 0 ? given(m.markup)! : 1
    const buyback = given(m.buyback) !== undefined && given(m.buyback)! >= 0 ? given(m.buyback)! : 1
    const goods = (Array.isArray(m.goods) ? m.goods : []).map(String)
    const types = new Set((Array.isArray(m.buys) ? m.buys : []).map(String))
    const unknown = goods.filter((x) => !valueOf.has(x))
    if (unknown.length) issues.push({ level: 'error', code: 'gameplay.unknownItem', where: at('goods'), message: `${name} sells ${unknown.join(', ')}, which ${unknown.length === 1 ? 'is not an item' : 'are not items'}.` })
    const noValue = goods.filter((x) => valueOf.has(x) && !(valueOf.get(x)! > 0))
    if (noValue.length) issues.push({ level: 'info', code: 'gameplay.noValue', where: at('goods'), message: `${name}: ${noValue.map((x) => str(items.find((i) => String(i.id) === x)?.name) || x).join(', ')} ${noValue.length === 1 ? 'has' : 'have'} no Value, so ${noValue.length === 1 ? 'it is' : 'they are'} not traded.` })
    const sells = goods.filter((x) => valueOf.get(x)! > 0).map((item) => ({ item, price: Math.ceil(valueOf.get(item)! * markup) }))
    const buyIds = [...new Set([...goods, ...items.filter((i) => types.has(str(i.type))).map((i) => String(i.id))])].filter((x) => valueOf.get(x)! > 0)
    const buys = buyIds.map((item) => ({ item, price: Math.floor(valueOf.get(item)! * buyback) })).filter((o) => o.price >= 1)
    if (!sells.length && !buys.length) issues.push({ level: 'error', code: 'gameplay.merchantEmpty', where: at('goods'), message: `${name} is placed on a map but neither sells nor buys an item with a value.` })
    const gold = given(m.gold)
    merchants.push({ merchant: id, name, sells, buys, ...(gold !== undefined && gold >= 0 ? { gold } : {}) })
  }
  const cap = given(money.walletCap)
  return { rules: { startMoney: Math.max(0, given(money.startingMoney) ?? 0), ...(cap !== undefined && cap > 0 ? { walletCap: cap } : {}), merchants }, issues }
}

/**
 * Day and night (phase 20): an in-game clock at Time, Weather & Events › Day length (real minutes per day), starting at
 * 08:00 (a visible default), and the day phases (start hour, duration): the current phase sets the light (Visibility %)
 * and, with combat, multiplies the enemies' damage (Monster strength ×, empty 1). Phases that overlap or leave hours
 * uncovered are reported; an uncovered hour has full light and strength 1. Seasons, weather and events are not run.
 */
export type DayPhase = { phase: string; name: string; start: number; duration: number; visibility: number; strength: number }
export type TimeRules = { dayMinutes: number; startHour: number; phases: DayPhase[]; defaults: string[] }
export const TIME_DEFAULTS = { startHour: 8 } as const

export function timeRules(p: Project): { rules: TimeRules; issues: GameplayIssue[] } {
  const issues: GameplayIssue[] = []
  const doc = 'design.timeWeather'
  const time = (p.documents[doc]?.data.time ?? {}) as Record<string, unknown>
  const dayMinutes = Math.max(0, given(time.dayLength) ?? 0)
  const phases: DayPhase[] = []
  for (const ph of list(p, doc, 'dayPhases')) {
    const id = String(ph.id)
    const start = given(ph.start)
    const duration = given(ph.duration)
    if (start === undefined || duration === undefined || duration <= 0) {
      issues.push({ level: 'error', code: 'gameplay.phaseHours', where: { doc, section: 'dayPhases', id, field: start === undefined ? 'start' : 'duration' }, message: `Day phase “${str(ph.name) || id}” needs a start hour and a duration.` })
      continue
    }
    phases.push({ phase: id, name: str(ph.name) || id, start: ((start % 24) + 24) % 24, duration: Math.min(24, duration), visibility: Math.min(100, Math.max(0, given(ph.visibility) ?? 100)), strength: Math.max(0, given(ph.strength ?? ph.monsterStrength) ?? 1) })
  }
  // Every half hour of the day: covered by how many phases.
  const cover = new Array(48).fill(0)
  for (const ph of phases) for (let h = 0; h < ph.duration * 2; h++) cover[(Math.round(ph.start * 2) + h) % 48]++
  if (phases.length && cover.some((c) => c > 1)) issues.push({ level: 'warning', code: 'gameplay.phaseOverlap', where: { doc, section: 'dayPhases' }, message: 'Day phases overlap; where they do, the first one in the list is used.' })
  if (phases.length && cover.some((c) => c === 0)) issues.push({ level: 'warning', code: 'gameplay.phaseGap', where: { doc, section: 'dayPhases' }, message: 'Some hours of the day are in no day phase; they get full light and monster strength 1.' })
  const notRun = [...(list(p, doc, 'seasons').length ? ['seasons'] : []), ...(list(p, doc, 'weather').length ? ['weather'] : []), ...(list(p, doc, 'events').length ? ['special events'] : [])]
  if (notRun.length) issues.push({ level: 'info', code: 'gameplay.timeUnchecked', where: { doc, section: 'time' }, message: `The prototype's day and night does not run ${notRun.join(', ')}.` })
  return { rules: { dayMinutes, startHour: TIME_DEFAULTS.startHour, phases, defaults: [`start hour = ${TIME_DEFAULTS.startHour}:00`] }, issues }
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
/**
 * An enemy's behaviour template (phase 19): `aggression` (Passive never attacks; Territorial chases until it is more than
 * `giveUp` metres from its post or patrol route; a Hunter chases until it loses sight of the player), `sight` in metres
 * (walls block it). It goes back to its post (or patrol route) after losing sight for COMBAT_DEFAULTS.forgetAfter seconds.
 */
export type CombatEnemy = { enemy: string; name: string; hp: number; damage: number; attackRate: number; armor: number; resistances: Record<string, number>; damageType?: string; speed: number; passive: boolean; aggression: 'Passive' | 'Territorial' | 'Hunter'; sight: number; giveUp?: number; xp: number; loot: ItemAmount[] }
export type CombatRules = {
  player: { hp: number; weapon?: { item: string; damage: number; damageType?: string; attackRate: number } }
  formula: string
  enemies: CombatEnemy[]
  /** Visible defaults the rules filled in. */
  defaults: string[]
}
export const COMBAT_DEFAULTS = { playerHp: 100, enemySpeed: 2, weaponRate: 1, aggroRadius: 8, enemyReach: 1.5, territorialGiveUp: 12, forgetAfter: 3 } as const
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
    const planned = str(e.aggression)
    const aggression = planned === 'Passive' || planned === 'Hunter' || planned === 'Territorial' ? planned : 'Territorial'
    if (aggression !== planned) defaults.push(`${name} aggression = Territorial`)
    const sight = n(e.sight) !== undefined && n(e.sight)! > 0 ? n(e.sight)! : COMBAT_DEFAULTS.aggroRadius
    if (!(n(e.sight)! > 0) && aggression !== 'Passive') defaults.push(`${name} sight range = ${COMBAT_DEFAULTS.aggroRadius} m`)
    const giveUp = n(e.giveUp) !== undefined && n(e.giveUp)! > 0 ? n(e.giveUp)! : aggression === 'Territorial' ? COMBAT_DEFAULTS.territorialGiveUp : undefined
    if (!(n(e.giveUp)! > 0) && aggression === 'Territorial') defaults.push(`${name} gives up beyond ${COMBAT_DEFAULTS.territorialGiveUp} m`)
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
      ...(str(e.behavior) ? ['behavior notes'] : []),
    ]
    if (unchecked.length) issues.push({ level: 'info', code: 'gameplay.enemyUnchecked', where: at('pattern'), message: `${name}: the prototype does not run ${unchecked.join(', ')}.` })
    enemies.push({ enemy: id, name, hp: ehp, damage: edmg, attackRate: erate, armor: n(e.armor) ?? 0, resistances, ...(str(e.damageType) ? { damageType: str(e.damageType) } : {}), speed, passive: aggression === 'Passive', aggression, sight, ...(giveUp !== undefined ? { giveUp } : {}), xp: n(e.xp) ?? 0, loot })
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

/**
 * Typed dialogue (phase 16), from Story & Quests › Dialogue lines: every line is said by a character (Speaker). A line
 * with no “Answers” starts that character's conversation; the lines that answer a line are the player's options there,
 * each shown with its “Player says” text. Picking an option shows its line and runs its consequences once: the story
 * choice it makes (only while the quest graph allows it — one option per decision) and the items it gives. A line
 * without options ends the conversation. The Dialogue and narrative style text is a description and never runs.
 */
export type DialogueLine = { line: string; speaker: string; text: string; after?: string; option?: string; choice?: string; give: ItemAmount[] }

export function dialogueRules(p: Project): { lines: DialogueLine[]; issues: GameplayIssue[] } {
  const issues: GameplayIssue[] = []
  const items = new Set(list(p, ITEMS, 'items').map((i) => String(i.id)))
  const characters = new Map(list(p, STORY, 'characters').map((c) => [String(c.id), str(c.name) || String(c.id)]))
  const choices = new Set(list(p, STORY, 'choices').map((c) => String(c.id)))
  const raw = list(p, STORY, 'dialogueLines')
  const ids = new Set(raw.map((l) => String(l.id)))
  const lines: DialogueLine[] = []
  for (const l of raw) {
    const id = String(l.id)
    const at = (field: string): GameplayIssue['where'] => ({ doc: STORY, section: 'dialogueLines', id, field })
    const label = str(l.name) || str(l.text).slice(0, 30) || id
    const before = issues.length
    const speaker = str(l.speaker)
    if (!speaker || !characters.has(speaker)) issues.push({ level: 'error', code: 'gameplay.lineSpeaker', where: at('speaker'), message: `Dialogue line “${label}”: ${speaker ? `the speaker “${speaker}” is not a character` : 'no speaker'}.` })
    if (!str(l.text)) issues.push({ level: 'error', code: 'gameplay.lineText', where: at('text'), message: `Dialogue line “${label}” has no text.` })
    const after = str(l.after)
    if (after && !ids.has(after)) issues.push({ level: 'error', code: 'gameplay.lineAfter', where: at('after'), message: `Dialogue line “${label}” answers a line that does not exist.` })
    if (after && !str(l.option)) issues.push({ level: 'error', code: 'gameplay.lineOption', where: at('option'), message: `Dialogue line “${label}” answers another line but has no “Player says” text, so the player could not pick it.` })
    const choice = str(l.choice)
    if (choice && !choices.has(choice)) issues.push({ level: 'error', code: 'gameplay.lineChoice', where: at('choice'), message: `Dialogue line “${label}” makes a choice that is not in Story & Quests › Choices.` })
    if (choice && !after) issues.push({ level: 'error', code: 'gameplay.lineChoice', where: at('choice'), message: `Dialogue line “${label}” starts a conversation, so no option leads to it and its choice could never be made; move the choice to an answer.` })
    const give = amounts(l.giveItems, items, at('giveItems'), `Dialogue line “${label}” › Gives items`, issues)
    if (issues.length > before) continue
    lines.push({ line: id, speaker, text: str(l.text), ...(after ? { after } : {}), ...(str(l.option) ? { option: str(l.option) } : {}), ...(choice ? { choice } : {}), give })
  }
  // Loops (a line that answers itself through others) and characters with more than one start.
  const byId = new Map(lines.map((l) => [l.line, l]))
  for (const l of lines) {
    const seen = new Set<string>()
    for (let at: DialogueLine | undefined = l; at?.after; at = byId.get(at.after)) {
      if (seen.has(at.line)) {
        issues.push({ level: 'error', code: 'gameplay.lineLoop', where: { doc: STORY, section: 'dialogueLines', id: l.line, field: 'after' }, message: 'Dialogue lines answer each other in a loop; a conversation must start somewhere.' })
        break
      }
      seen.add(at.line)
    }
  }
  for (const [speaker, name] of characters) {
    const starts = lines.filter((l) => l.speaker === speaker && !l.after)
    if (starts.length > 1) issues.push({ level: 'warning', code: 'gameplay.manyStarts', where: { doc: STORY, section: 'dialogueLines', id: starts[1].line, field: 'after' }, message: `${name} has ${starts.length} lines that start a conversation; the first is used.` })
  }
  return { lines: issues.some((i) => i.code === 'gameplay.lineLoop') ? [] : lines, issues }
}
