import type { Project } from '../model/types'
import { COMBAT_DEFAULTS, combatRules, inventoryRules, recipeRules, saveLinks, placements, playerSettings, prototypeScene, questRules, runtimeControls, type ItemAmount, type PlayerSettings, type RuntimeControls } from '../gameplay'
import { prototypeProfile, wantsPrototype, type PrototypeProfile } from './capabilities'
import type { PrototypeSystem, SaveState } from '../../modules/technical'
import type { EngineIssue, IrRecord } from './ir'

/** A location's map in the bundle (bundle.ts writes it there). */
export const mapFile = (locationId: string) => `Maps/${locationId.replace(/[^\w.-]/g, '_')}.json`

/**
 * Engine IR v9 (plans/UNITY_PLAYABLE_GAME_GENERATION_PLAN.md, phase 3): the playable-prototype profile and the typed
 * gameplay data of core/gameplay.ts, engine-neutral. Present only when the plan asks for a playable prototype, so
 * other exports only see the version number change (as with every IR bump). Items are referenced by planner ID (`item`, never changes)
 * and by record key (`key`, what the engine's data uses), when the item has a record.
 */
export type IrItemAmount = { item: string; key?: string; count: number }
export type IrQuestRule = {
  quest: string
  name: string
  completeWhen?: { kind: 'holdItems'; items: IrItemAmount[] }
  onComplete: { kind: 'giveItems'; items: IrItemAmount[] }[]
  money: number
  xp: number
}
export type IrPlacement = { location: string; object: string; role: 'player' | 'item' | 'enemy'; item?: string; enemy?: string; key?: string; count: number; x: number; y: number }
export type IrGameplay = {
  profile: Omit<PrototypeProfile, 'systems'>
  systems: PrototypeSystem[]
  quests: IrQuestRule[]
  placements: IrPlacement[]
  /** The controls that drive the runtime (UI / UX › Controls › Runtime action), with their planned keys. */
  input: RuntimeControls
  /** Player Character › Controls and camera, with the defaults it filled in. */
  player: PlayerSettings
  /**
   * Where the prototype is played (phase 8): the planned scene (its name is the engine scene's name) and the location
   * whose map (`map`, a path in the bundle) it is built from, the one with the first player start. Map coordinates
   * (origin top left, y down) become metres as x · s east and y · s south, s = `metresPerUnit`; when the plan sets no
   * scale, s = 1 / `cell` (one walkability cell per metre, as the greybox).
   */
  scene?: { scene?: { id: string; name: string }; location: string; locationName: string; map: string; metresPerUnit?: number; cell?: number }
  /**
   * The inventory (phase 10), when the plan chose it: slots, and every planned item with its stack size (its own Max
   * stack or the Item model's default; items with neither are left out and reported). `shown`: whether a HUD Grid shows
   * the inventory, and the items HUD Counters show (planner IDs).
   */
  /**
   * Combat (phase 15), when the plan chose it: the first supported model (melee; see core/gameplay.ts combatRules) — the
   * player's health and weapon, the damage formula, and every enemy placed on a map with its values and guaranteed loot.
   */
  combat?: {
    player: { hp: number; attackRange: number; weapon?: { item: string; key?: string; damage: number; damageType?: string; attackRate: number } }
    formula: string
    enemies: { enemy: string; key?: string; name: string; hp: number; damage: number; attackRate: number; armor: number; resistances: Record<string, number>; damageType?: string; speed: number; passive: boolean; xp: number; loot: IrItemAmount[] }[]
    aggroRadius: number
    enemyReach: number
  }
  /** Crafting (phase 14), when the plan chose it: the recipes the prototype can craft, as typed rules with record keys. */
  crafting?: { recipes: { recipe: string; key?: string; name: string; inputs: IrItemAmount[]; output: IrItemAmount; unlockQuests: string[] }[] }
  /** Saving (phase 12), when the plan chose it: each saved part linked to a runtime state, with its save key (ir.save), in plan order. */
  save?: { parts: { part: string; key: string; state: SaveState }[] }
  inventory?: { slots: number; items: { item: string; key?: string; name: string; stack: number }[]; shown: { grid: boolean; counters: string[] } }
}

export function buildGameplay(p: Project, records: IrRecord[], issues: EngineIssue[], saveKeys: Map<string, string> = new Map()): IrGameplay | undefined {
  if (!wantsPrototype(p)) return undefined
  const { systems, ...profile } = prototypeProfile(p)
  const keys = new Map(records.map((r) => [r.plannerId, r.key]))
  const noRecord = new Set<string>()
  const ref = (item: string): { item: string; key?: string } => {
    const key = keys.get(item)
    if (!key) noRecord.add(item)
    return key ? { item, key } : { item }
  }
  const amounts = (xs: ItemAmount[]): IrItemAmount[] => xs.map((x) => ({ ...ref(x.item), count: x.count }))

  const quests = questRules(p)
    .rules.filter((r) => r.completeWhen || r.onComplete.length)
    .map(
      (r): IrQuestRule => ({
        quest: r.quest,
        name: r.name,
        ...(r.completeWhen ? { completeWhen: { kind: 'holdItems' as const, items: amounts(r.completeWhen.items) } } : {}),
        onComplete: r.onComplete.map((a) => ({ kind: a.kind, items: amounts(a.items) })),
        money: r.money,
        xp: r.xp,
      }),
    )
  const placed = placements(p).placements.map((x): IrPlacement => ({ ...x, ...(x.item ? ref(x.item) : {}), ...(x.enemy && keys.get(x.enemy) ? { key: keys.get(x.enemy) } : {}) }))

  for (const item of noRecord)
    issues.push({ level: 'warning', code: 'gameplay.itemNoRecord', message: `Item ${item} is used by a quest or a pickup but has no data record; give it an Item schema in Data-driven Design so the engine can load it.`, where: { doc: 'design.items', section: 'items', id: item } })
  const all = playerSettings(p)
  // The interaction range is only a default worth reporting when the plan chose interaction.
  const player = { ...all, defaulted: all.defaulted.filter((k) => (k !== 'interactRange' || systems.includes('interaction')) && (k !== 'attackRange' || systems.includes('combat'))) }
  if (systems.includes('movement') && player.defaulted.length)
    issues.push({ level: 'info', code: 'gameplay.default', message: `Player Character › Controls and camera: ${player.defaulted.map((k) => `${k} = ${player[k]}`).join(', ')} (defaults; set them in the plan to change them).`, where: { doc: 'design.player', section: 'controls' } })
  const where = prototypeScene(p).value
  const loc = where.location
  if (systems.includes('movement') && loc && !loc.metresPerUnit && loc.cell)
    issues.push({ level: 'info', code: 'gameplay.default', message: `Map scale: one walkability cell (${loc.cell} map units) of ${loc.name} is one metre, ${1 / loc.cell} m per map unit (default; set Map scale in Technical Architecture › Playable prototype to change it).`, where: { doc: 'technical.architecture', section: 'prototype', field: 'mapScale' } })
  const scene = loc
    ? { ...(where.scene ? { scene: where.scene } : {}), location: loc.id, locationName: loc.name, map: mapFile(loc.id), ...(loc.metresPerUnit ? { metresPerUnit: loc.metresPerUnit } : {}), ...(loc.cell ? { cell: loc.cell } : {}) }
    : undefined
  const inv = systems.includes('inventory') ? inventoryRules(p).rules : undefined
  const inventory = inv ? { slots: inv.slots, items: inv.items.map((x) => ({ item: x.item, ...(keys.get(x.item) ? { key: keys.get(x.item) } : {}), name: x.name, stack: x.stack })), shown: inv.shown } : undefined
  const fight = systems.includes('combat') ? combatRules(p).rules : undefined
  if (fight?.defaults.length) issues.push({ level: 'info', code: 'gameplay.default', message: `Combat: ${fight.defaults.join(', ')} (defaults; set them in the plan to change them).`, where: { doc: 'design.combat', section: 'enemies' } })
  if (fight) issues.push({ level: 'info', code: 'gameplay.combatModel', message: 'Combat: melee only; enemies chase within ' + COMBAT_DEFAULTS.aggroRadius + ' m and hit within ' + COMBAT_DEFAULTS.enemyReach + ' m; a defeated player is back at the start with full health.', where: { doc: 'design.combat', section: 'system' } })
  const combat = fight
    ? {
        player: { hp: fight.player.hp, attackRange: all.attackRange, ...(fight.player.weapon ? { weapon: { ...fight.player.weapon, ...(keys.get(fight.player.weapon.item) ? { key: keys.get(fight.player.weapon.item) } : {}) } } : {}) },
        formula: fight.formula,
        enemies: fight.enemies.map((e) => ({ ...e, ...(keys.get(e.enemy) ? { key: keys.get(e.enemy) } : {}), loot: amounts(e.loot) })),
        aggroRadius: COMBAT_DEFAULTS.aggroRadius,
        enemyReach: COMBAT_DEFAULTS.enemyReach,
      }
    : undefined
  const crafting = systems.includes('crafting')
    ? { recipes: recipeRules(p).rules.map((r) => ({ recipe: r.recipe, ...(keys.get(r.recipe) ? { key: keys.get(r.recipe) } : {}), name: r.name, inputs: amounts(r.inputs), output: amounts([r.output])[0], unlockQuests: r.unlockQuests })) }
    : undefined
  const save = systems.includes('saveLoad') ? { parts: saveLinks(p).links.flatMap((l) => (saveKeys.has(l.part) ? [{ part: l.part, key: saveKeys.get(l.part)!, state: l.state }] : [])) } : undefined
  return { profile, systems, quests, placements: placed, input: runtimeControls(p).controls, player, ...(scene ? { scene } : {}), ...(inventory ? { inventory } : {}), ...(save ? { save } : {}), ...(crafting ? { crafting } : {}), ...(combat ? { combat } : {}) }
}
