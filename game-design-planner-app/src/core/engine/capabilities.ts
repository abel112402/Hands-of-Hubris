import type { Entity, Project } from '../model/types'
import { dataList, sourceOf } from '../dataDriven'
import {
  PROTOTYPE_DIMENSIONS,
  PROTOTYPE_PERSPECTIVES,
  PROTOTYPE_PIPELINES,
  PROTOTYPE_PLATFORMS,
  PROTOTYPE_SYSTEMS,
  SAVE_STATE_SYSTEM,
  type PrototypeSystem,
  type SaveState,
} from '../../modules/technical'
import { combatRules, dialogueRules, progressionRules, timeRules, tradeRules, worldRules, inventoryRules, placements, prototypeScene, questRules, recipeRules, runtimeControls, saveLinks } from '../gameplay'
import { WORLD_DOC } from '../world'
import type { EngineId } from './adapter'
import type { EngineIssue } from './ir'

/**
 * Capability matrix for playable prototypes (plans/UNITY_PLAYABLE_GAME_GENERATION_PLAN.md, phase 1).
 *
 * The project states its profile and the systems it wants in Technical Architecture › Playable prototype; nothing is
 * guessed from genre, names or free text. Each system has a support level per engine (§ 3.1): executable (works from
 * the plan), template (a working module configured by the plan), frame (data, interfaces and hooks are generated; you
 * write the behaviour) or unsupported. A prototype is playable only when every chosen system is executable or a
 * template, its dependencies are chosen, its data is there and the profile is supported. Until the runtime modules
 * of the later phases exist, no system is above “frame”, so no export claims to be playable.
 */
export const PROTOTYPE_DOC = 'technical.architecture'
export const PROTOTYPE_SECTION = 'prototype'

export type SupportLevel = 'executable' | 'template' | 'frame' | 'unsupported'
export type Dimension = (typeof PROTOTYPE_DIMENSIONS)[number]
export type Perspective = (typeof PROTOTYPE_PERSPECTIVES)[number]
export type RenderPipeline = (typeof PROTOTYPE_PIPELINES)[number]
export type Platform = (typeof PROTOTYPE_PLATFORMS)[number]

export type PrototypeProfile = {
  dimension?: Dimension
  perspective?: Perspective
  renderPipeline?: RenderPipeline
  platform?: Platform
  systems: PrototypeSystem[]
}

/** Where in the planner a problem is fixed. */
export type FixPlace = NonNullable<EngineIssue['where']>

type Need = { what: string; where: FixPlace; ok: (p: Project) => boolean }
export type Capability = {
  id: PrototypeSystem
  label: string
  requires: PrototypeSystem[]
  needs: Need[]
  /** Support per engine; an engine that is not listed is unsupported. */
  support: Partial<Record<EngineId, { level: SupportLevel; note: string; /** What is not generated and is done by hand (export README, phase 17). */ manual?: string[] }>>
}

const list = (p: Project, doc: string, section: string): Entity[] => {
  const v = p.documents[doc]?.data[section]
  return Array.isArray(v) ? (v as Entity[]).filter((e) => typeof e.name === 'string' && e.name.trim()) : []
}
const form = (p: Project, doc: string, section: string): Record<string, unknown> => {
  const v = p.documents[doc]?.data[section]
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}
const schemaFor = (p: Project, label: string) => dataList(p, 'schemas').some((s) => sourceOf(s)?.label === label)

const placed = (p: Project, role: 'player' | 'item') => placements(p).placements.some((x) => x.role === role)

const ITEMS = 'Items — Items & Crafting'
const RECIPES = 'Recipes — Items & Crafting'

const LABEL = Object.fromEntries(PROTOTYPE_SYSTEMS.map((x) => [x.key, x.label])) as Record<PrototypeSystem, string>
const cap = (id: PrototypeSystem, requires: PrototypeSystem[], needs: Need[], support: Capability['support']): Capability => ({ id, label: LABEL[id], requires, needs, support })

/** The matrix. Raise a level only together with the runtime module and its PlayMode test that make it true. */
export const CAPABILITIES: Capability[] = [
  cap(
    'movement',
    [],
    [
      { what: 'Controls whose Runtime action is Move forward, Move back, Move left and Move right', where: { doc: 'design.ui', section: 'controls', field: 'drives' }, ok: (p) => { const m = runtimeControls(p).controls.move; return !!(m.forward && m.back && m.left && m.right) } },
      { what: 'A player start on a location map (an object with spawn role “player”)', where: { doc: WORLD_DOC, section: 'locations' }, ok: (p) => placed(p, 'player') },
      { what: 'The scene the prototype is played in (Prototype scene)', where: { doc: PROTOTYPE_DOC, section: PROTOTYPE_SECTION, field: 'scene' }, ok: (p) => !!prototypeScene(p).value.scene },
    ],
    { unity: { level: 'template', note: 'Runtime 0.3.0: CharacterController movement at the planned speed and a third-person camera at the planned distance and height, driven by the generated Move action. The bridge builds the prototype scene (URP) from the location map with the player at its start; PlayMode tests generated.', manual: ['player animation and footsteps (the player is a capsule that slides)','camera collision with walls','gamepad movement is bound but not tested'] } },
  ),
  cap(
    'interaction',
    ['movement'],
    [
      { what: 'A control whose Runtime action is Interact', where: { doc: 'design.ui', section: 'controls', field: 'drives' }, ok: (p) => !!runtimeControls(p).controls.interact },
      { what: 'An item to pick up on a location map (an object with spawn role “item”)', where: { doc: WORLD_DOC, section: 'locations' }, ok: (p) => placed(p, 'item') },
    ],
    { unity: { level: 'template', note: 'Runtime 0.4.0: the player interacts with the nearest target within the planned range (Player Character › Interaction range) on the Interact action, once per press; item pickups placed on the map give their planned item and amount once (itemAcquired event) and disappear. On-screen prompt; PlayMode tests generated.', manual: ['highlights, sounds and effects when something is picked up (listen to PlannerItemAcquired)','interacting with anything other than pickups, loot and NPCs'] } },
  ),
  cap(
    'inventory',
    ['interaction'],
    [
      { what: 'At least one item', where: { doc: 'design.items', section: 'items' }, ok: (p) => list(p, 'design.items', 'items').length > 0 },
      { what: `A data schema with the source “${ITEMS}”`, where: { doc: 'technical.dataDriven', section: 'schemas' }, ok: (p) => schemaFor(p, ITEMS) },
      { what: 'Inventory slots', where: { doc: 'design.items', section: 'inventory', field: 'slots' }, ok: (p) => Number(form(p, 'design.items', 'inventory').slots) > 0 },
    ],
    { unity: { level: 'template', note: 'Runtime 0.5.0: slots and stack sizes from the plan, all-or-nothing adds (a full inventory leaves the pickup where it is), and the HUD elements bound to the inventory (Grid) and to items (Counter) update as it changes; PlayMode tests generated.', manual: ['item icons in the HUD grid','using, dropping, sorting and moving items'] } },
  ),
  cap(
    'quests',
    ['inventory'],
    [{ what: 'A quest with a typed goal (Goal: hold these items)', where: { doc: 'design.story', section: 'quests', field: 'collectItems' }, ok: (p) => questRules(p).rules.some((r) => r.completeWhen) }],
    { unity: { level: 'template', note: 'Runtime 0.6.0: a quest starts when the planned quest graph (PlannerQuestLog) lets it, its typed goal is checked against the inventory after every change, and its item reward is given once, all or nothing (it waits while the inventory is full). Money and XP are reported in the completion event; no wallet or levelling module uses them yet. The HUD quest tracker follows it; PlayMode tests generated.', manual: ['a quest journal, markers and quest text beyond the HUD tracker','money and XP (reported in the event, no module keeps them)','quests that are not “hold these items”'] } },
  ),
  cap(
    'saveLoad',
    [],
    [
      { what: 'A current save version', where: { doc: 'technical.save', section: 'save', field: 'version' }, ok: (p) => Number(form(p, 'technical.save', 'save').version) >= 1 },
      { what: 'At least one saved part', where: { doc: 'technical.save', section: 'parts' }, ok: (p) => list(p, 'technical.save', 'parts').length > 0 },
      { what: 'Controls whose Runtime action is Quick save and Quick load (so the player can save and load while playing)', where: { doc: 'design.ui', section: 'controls', field: 'drives' }, ok: (p) => { const c = runtimeControls(p).controls; return !!(c.quickSave && c.quickLoad) } },
    ],
    { unity: { level: 'template', note: 'Runtime 0.7.0: the parts linked to a runtime state (Saved parts › Runtime state) save the player’s position, the inventory with the pickups taken, and the quests with their graph and rewards through the generated PlannerSave (planned version, slots and migrations); a damaged or newer save is refused before anything changes. Runtime 0.12.0: the planned Quick save and Quick load controls save into and load from the first manual slot while playing. PlayMode tests generated.', manual: ['a save menu with slots, autosave and save thumbnails'] } },
  ),
  cap(
    'crafting',
    ['inventory'],
    [
      { what: 'At least one recipe', where: { doc: 'design.items', section: 'recipes' }, ok: (p) => list(p, 'design.items', 'recipes').length > 0 },
      { what: `A data schema with the source “${RECIPES}”`, where: { doc: 'technical.dataDriven', section: 'schemas' }, ok: (p) => schemaFor(p, RECIPES) },
      { what: 'A recipe the prototype can craft (made of items, with a result)', where: { doc: 'design.items', section: 'recipes' }, ok: (p) => recipeRules(p).rules.length > 0 },
      { what: 'A control whose Runtime action is Open crafting', where: { doc: 'design.ui', section: 'controls', field: 'drives' }, ok: (p) => !!runtimeControls(p).controls.crafting },
    ],
    { unity: { level: 'template', note: 'Runtime 0.9.0: the plan’s recipes as typed rules (item ingredients in, the result out, unlocking quests) crafted all or nothing in the inventory, from a crafting panel opened with the planned control; raw resources, stations, skills and craft time are not run. PlayMode tests generated.', manual: ['gathering raw resources','crafting stations, skills and craft time'] } },
  ),
  cap(
    'combat',
    ['movement'],
    [
      { what: 'At least one enemy', where: { doc: 'design.combat', section: 'enemies' }, ok: (p) => list(p, 'design.combat', 'enemies').length > 0 },
      { what: 'An enemy placed on a location map (an object with spawn role “enemy”)', where: { doc: WORLD_DOC, section: 'locations' }, ok: (p) => placements(p).placements.some((x) => x.role === 'enemy') },
      { what: 'A Player weapon with Damage', where: { doc: PROTOTYPE_DOC, section: PROTOTYPE_SECTION, field: 'weapon' }, ok: (p) => !!combatRules(p).rules.player.weapon },
      { what: 'A control whose Runtime action is Attack', where: { doc: 'design.ui', section: 'controls', field: 'drives' }, ok: (p) => !!runtimeControls(p).controls.attack },
    ],
    { unity: { level: 'template', note: 'Runtime 0.10.0, the first supported model only: melee with the Player weapon, enemies with their planned HP, damage, rate, armor, resistances, speed and aggression, every hit by the plan’s damage formula, XP and guaranteed loot, the player back at the start when defeated. Runtime 0.14.0: each enemy guards its post or walks its patrol route (a line on the map) on a navigation mesh baked from the levels, sees the player within its sight range when no wall is between, chases, and goes back after losing sight or past its give-up range. Ranged, caster and support enemies, crits, status effects and difficulty scaling are not run. PlayMode tests generated.', manual: ['enemy and hit animations, hit and death feedback','behaviour beyond the template (guard or patrol, sight, chase, give up, go back): searching, fleeing, groups, schedules','ranged, caster and support enemies, crits, status effects and difficulty scaling'] } },
  ),
  cap(
    'dialogue',
    ['interaction'],
    [
      { what: 'At least one character', where: { doc: 'design.story', section: 'characters' }, ok: (p) => list(p, 'design.story', 'characters').length > 0 },
      { what: 'An NPC on a location map (spawn role “npc” with a character)', where: { doc: WORLD_DOC, section: 'locations' }, ok: (p) => placements(p).placements.some((x) => x.role === 'npc') },
      {
        what: 'A Dialogue line that starts the conversation of a placed NPC',
        where: { doc: 'design.story', section: 'dialogueLines' },
        ok: (p) => {
          const placed = new Set(placements(p).placements.filter((x) => x.role === 'npc').map((x) => x.character))
          return dialogueRules(p).lines.some((l) => !l.after && placed.has(l.speaker))
        },
      },
    ],
    { unity: { level: 'template', note: 'Runtime 0.11.0: an NPC placed on the map talks when the player interacts; its Dialogue lines are the conversation, the answering lines the player’s options; an option’s story choice (only while the quest graph allows it) and items happen once and are saved. The Dialogue and narrative style text does not run. PlayMode tests generated.', manual: ['voice, animation and camera while talking (listen to PlannerDialogueLineShown)','NPC behaviour beyond standing and talking','conditions on dialogue lines (quest state, items, reputation)'] } },
  ),
  cap(
    'progression',
    [],
    [
      { what: 'The XP needed for the next level (Player Character › Levelling, a formula of level)', where: { doc: 'design.player', section: 'leveling', field: 'xpFormula' }, ok: (p) => progressionRules(p).rules.xpToNext.length > 0 },
    ],
    { unity: { level: 'template', note: 'Runtime 0.15.0: XP from completed quests (Reward XP) and defeated enemies (their XP); levels by the plan’s formula up to the level cap; each level up adds the planned skill and stat points. Saved; shown on screen. PlayMode tests generated.', manual: ['spending skill and stat points (skills, abilities, stats)', 'XP from crafting, building, exploring or gathering (XP sources are estimates)', 'a level-up screen'] } },
  ),
  cap(
    'trade',
    ['interaction', 'inventory'],
    [
      { what: 'A merchant of Trade & Economy placed on a location map (spawn role “merchant”)', where: { doc: WORLD_DOC, section: 'locations' }, ok: (p) => placements(p).placements.some((x) => x.role === 'merchant') },
      { what: 'A placed merchant that sells or buys an item with a Value', where: { doc: 'design.trade', section: 'merchants', field: 'goods' }, ok: (p) => tradeRules(p).rules.merchants.some((m) => m.sells.length + m.buys.length > 0) },
    ],
    { unity: { level: 'template', note: 'Runtime 0.15.0: a wallet (starting money, wallet limit) that quests’ Reward money fills; interacting with a placed merchant opens its trade panel: it sells its goods at Value × markup and buys its goods and the item types it buys at Value × buyback, while it has money for buying. Saved. PlayMode tests generated.', manual: ['stock sizes, restocking, rarity, visiting merchants and faction capitals', 'currencies other than the base unit', 'a shop UI of your own (the panel is plain IMGUI)'] } },
  ),
  cap(
    'time',
    [],
    [
      { what: 'The day length (Time, Weather & Events › Time system)', where: { doc: 'design.timeWeather', section: 'time', field: 'dayLength' }, ok: (p) => timeRules(p).rules.dayMinutes > 0 },
      { what: 'At least one day phase with its start and duration', where: { doc: 'design.timeWeather', section: 'dayPhases' }, ok: (p) => timeRules(p).rules.phases.length > 0 },
    ],
    { unity: { level: 'template', note: 'Runtime 0.15.0: an in-game clock at the planned day length; the current day phase dims the sun to its Visibility and, with combat, multiplies enemy damage by its Monster strength. Saved; the clock shows on screen. Seasons, weather and events are not run. PlayMode tests generated.', manual: ['seasons, weather and special events', 'NPC routines by time of day', 'a sky, moon and street lights of your own'] } },
  ),
  cap(
    'settlement',
    [],
    [],
    { unity: { level: 'unsupported', note: 'Not supported yet. The smallest rule set the planner will run: build a Town building on a build spot of a map, paying its Build cost from a town stock of resources, finished after its Construction time; then every Production cycle it turns its Inputs into Outputs in that stock. The plan does not yet say how long a time unit is in real seconds, where buildings may stand on a map, or how resources relate to items, so nothing is guessed.' } },
  ),
]

/** Profile choices each engine supports; anything else is reported as unsupported. */
const PROFILE_SUPPORT: Partial<Record<EngineId, { dimension: Dimension[]; perspective: Perspective[]; renderPipeline: RenderPipeline[]; platform: Platform[] }>> = {
  unity: { dimension: ['3D'], perspective: ['Third-person'], renderPipeline: ['URP'], platform: ['Windows', 'macOS', 'Linux'] },
}

const PLACE: FixPlace = { doc: PROTOTYPE_DOC, section: PROTOTYPE_SECTION }
const oneOf = <T extends string>(v: unknown, all: readonly T[]): T | undefined => (typeof v === 'string' && (all as readonly string[]).includes(v) ? (v as T) : undefined)

/** The profile as stated in the plan; unknown values (e.g. from a newer file) count as not chosen. */
export function prototypeProfile(p: Project): PrototypeProfile {
  const d = form(p, PROTOTYPE_DOC, PROTOTYPE_SECTION)
  return {
    dimension: oneOf(d.dimension, PROTOTYPE_DIMENSIONS),
    perspective: oneOf(d.perspective, PROTOTYPE_PERSPECTIVES),
    renderPipeline: oneOf(d.renderPipeline, PROTOTYPE_PIPELINES),
    platform: oneOf(d.platform, PROTOTYPE_PLATFORMS),
    systems: PROTOTYPE_SYSTEMS.filter((x) => d[x.key] === true).map((x) => x.key),
  }
}

/** Whether the project asks for a playable prototype at all: any profile choice or system. Projects that do not get no prototype checks. */
export function wantsPrototype(p: Project): boolean {
  const d = form(p, PROTOTYPE_DOC, PROTOTYPE_SECTION)
  return ['dimension', 'perspective', 'renderPipeline', 'platform'].some((k) => typeof d[k] === 'string' && d[k] !== '') || PROTOTYPE_SYSTEMS.some((x) => d[x.key] === true)
}

export const supportOf = (c: Capability, engine: EngineId): { level: SupportLevel; note: string; manual?: string[] } =>
  c.support[engine] ?? { level: 'unsupported', note: 'Playable prototypes are generated for Unity first.' }

export type SystemStatus = { id: PrototypeSystem; label: string; level: SupportLevel; note: string; missing: { what: string; where: FixPlace }[]; missingRequires: PrototypeSystem[] }
export type PrototypeReport = {
  wanted: boolean
  engine: EngineId
  profile: PrototypeProfile
  systems: SystemStatus[]
  /** True only when nothing blocks: no error-level problem and every chosen system is executable or a template. */
  playable: boolean
  issues: EngineIssue[]
}

const PROFILE_FIELDS = [
  { key: 'dimension', label: 'Dimension', all: PROTOTYPE_DIMENSIONS },
  { key: 'perspective', label: 'Camera / perspective', all: PROTOTYPE_PERSPECTIVES },
  { key: 'renderPipeline', label: 'Render pipeline', all: PROTOTYPE_PIPELINES },
  { key: 'platform', label: 'Target platform', all: PROTOTYPE_PLATFORMS },
] as const

/** Everything the planner can say about making this project playable in `engine`, with where to fix each problem. */
export function prototypeReport(p: Project, engine: EngineId): PrototypeReport {
  const profile = prototypeProfile(p)
  const wanted = wantsPrototype(p)
  const issues: PrototypeReport['issues'] = []
  const where = (field?: string): FixPlace => ({ ...PLACE, ...(field && { field }) })
  const sup = PROFILE_SUPPORT[engine]

  for (const f of PROFILE_FIELDS) {
    const v = profile[f.key]
    if (!v) issues.push({ level: 'error', code: 'proto.choiceMissing', field: f.key, where: where(f.key), message: `Playable prototype: choose the ${f.label.toLowerCase()} in Technical Architecture › Playable prototype; it is not guessed.` })
    else if (!sup || !(sup[f.key] as readonly string[]).includes(v)) {
      const level = f.key === 'platform' && sup ? 'warning' : 'error'
      const supported = sup ? (sup[f.key] as readonly string[]).join(', ') : 'none yet'
      issues.push({ level, code: 'proto.profileUnsupported', field: f.key, where: where(f.key), message: `Playable prototype: ${f.label} “${v}” is not supported for this engine${level === 'warning' ? ' (builds are not verified)' : ''}. Supported: ${supported}.` })
    }
  }
  if (!profile.systems.length) issues.push({ level: 'warning', code: 'proto.noSystems', where: where(), message: 'Playable prototype: no system is chosen, so there is nothing to make playable.' })

  const systems: SystemStatus[] = profile.systems.map((id) => {
    const c = CAPABILITIES.find((x) => x.id === id)!
    const { level, note } = supportOf(c, engine)
    const missing = c.needs.filter((n) => !n.ok(p)).map(({ what, where }) => ({ what, where }))
    const missingRequires = c.requires.filter((r) => !profile.systems.includes(r))
    for (const r of missingRequires) issues.push({ level: 'error', code: 'proto.requires', field: id, where: where(r), message: `Playable prototype: ${c.label} needs ${LABEL[r]}; choose it too.` })
    for (const m of missing) issues.push({ level: 'error', code: 'proto.dataMissing', field: id, where: m.where, message: `Playable prototype: ${c.label} needs ${m.what.charAt(0).toLowerCase()}${m.what.slice(1)}.` })
    if (level === 'unsupported') issues.push({ level: 'error', code: 'proto.unsupported', field: id, where: where(id), message: `Playable prototype: ${c.label} is not supported yet. ${note}` })
    else if (level === 'frame') issues.push({ level: 'warning', code: 'proto.frameOnly', field: id, where: where(id), message: `Playable prototype: ${c.label} is generated as a frame only; you write the behaviour. ${note}` })
    return { id, label: c.label, level, note, missing, missingRequires }
  })

  // Typed gameplay data that is there but wrong (unknown item, bad amount) blocks the systems that read it.
  const chosen = new Set(profile.systems)
  const invalid = [
    ...(chosen.has('quests') ? questRules(p).issues : []),
    ...(chosen.has('inventory') ? inventoryRules(p).issues : []),
    ...(chosen.has('saveLoad') ? saveLinks(p).issues : []),
    ...(chosen.has('crafting') ? recipeRules(p).issues : []),
    ...(chosen.has('combat') ? combatRules(p).issues : []),
    ...(chosen.has('dialogue') ? dialogueRules(p).issues : []),
    ...(chosen.has('progression') ? progressionRules(p).issues : []),
    ...(chosen.has('trade') ? tradeRules(p).issues : []),
    ...(chosen.has('time') ? timeRules(p).issues : []),
    ...(chosen.has('movement') || chosen.has('interaction') ? [...placements(p).issues, ...runtimeControls(p).issues, ...prototypeScene(p).issues] : []),
    ...(chosen.has('movement') ? worldRules(p).issues : []),
  ].filter((i) => i.level !== 'info')
  // Saving: every chosen system with state needs a saved part that holds it, or loading would lose it.
  if (chosen.has('saveLoad')) {
    const held = new Set(saveLinks(p).links.map((l) => l.state))
    for (const [state, system] of Object.entries(SAVE_STATE_SYSTEM) as [SaveState, PrototypeSystem][])
      if (chosen.has(system) && !held.has(state))
        issues.push({ level: 'error', code: 'proto.dataMissing', field: 'saveLoad', where: { doc: 'technical.save', section: 'parts', field: 'state' }, message: `Playable prototype: Save and load needs a saved part whose Runtime state is ${state} (for ${LABEL[system]}); without it, loading would lose it.` })
  }
  // Dialogue consequences: story choices live in the quest graph, items in the inventory.
  if (chosen.has('dialogue')) {
    const lines = dialogueRules(p).lines
    const needs: [PrototypeSystem, boolean, string][] = [
      ['quests', lines.some((l) => l.choice), 'a dialogue option makes a story choice'],
      ['inventory', lines.some((l) => l.give.length), 'a dialogue option gives items'],
    ]
    for (const [need, when, why] of needs) if (when && !chosen.has(need)) issues.push({ level: 'error', code: 'proto.requires', field: 'dialogue', where: where(need), message: `Playable prototype: ${why}, so NPC dialogue needs ${LABEL[need]}; choose it too.` })
    const style = form(p, 'design.story', 'dialogue')
    if (Object.values(style).some((v) => typeof v === 'string' && v.trim()))
      issues.push({ level: 'info', code: 'proto.dialogueStyle', field: 'dialogue', where: { doc: 'design.story', section: 'dialogue' }, message: 'Playable prototype: the Dialogue and narrative style is a description; only the Dialogue lines run.' })
  }
  // Passages between the prototype's locations are used by interacting.
  if (chosen.has('movement') && !chosen.has('interaction') && worldRules(p).rules.passages.length)
    issues.push({ level: 'error', code: 'proto.requires', field: 'movement', where: where('interaction'), message: 'Playable prototype: the player goes between the locations through passages by interacting, so more than one location needs Interaction (pick up, use); choose it too.' })
  // AI the plan describes but the prototype does not run (phase 19): never shown as executed AI. Its state graphs are
  // generated as typed state machines, a frame driven from code; what runs is the enemy behaviour template.
  if (chosen.has('combat') || chosen.has('dialogue')) {
    const graph = (doc: string, section: string) => {
      const v = p.documents[doc]?.data[section] as { nodes?: unknown[] } | undefined
      return Array.isArray(v?.nodes) && v.nodes.length > 0
    }
    const text = (doc: string, section: string) => Object.values(form(p, doc, section)).some((v) => typeof v === 'string' && v.trim())
    const described = [
      ...(graph('design.npc', 'lifecycle') ? ['the NPC life cycle (a state graph)'] : []),
      ...(graph('technical.ai', 'behavior') ? ['the AI behavior tree / state machine'] : []),
      ...(Object.keys((p.documents['design.npc']?.data.routine as { cells?: object } | undefined)?.cells ?? {}).length ? ['the NPC daily routines'] : []),
      ...(list(p, 'design.npc', 'needRules').length ? ['the NPC needs'] : []),
      ...(text('design.npc', 'behaviour') ? ['the NPC behaviour (decision model, priorities)'] : []),
      ...(text('technical.ai', 'approach') ? ['the AI approach'] : []),
    ]
    if (described.length)
      issues.push({ level: 'info', code: 'proto.aiFrame', field: chosen.has('combat') ? 'combat' : 'dialogue', where: { doc: 'technical.ai', section: 'approach' }, message: `Playable prototype: ${described.join(', ')} describe AI the prototype does not run. State graphs are generated as typed state machines, a frame you drive from code; what runs is the enemy template (guard or patrol, sight, chase, give up, go back) and NPCs that stand and talk.` })
  }
  // Progression needs an XP source; trading's money comes with quests, its goods with the inventory.
  if (chosen.has('progression') && !chosen.has('quests') && !chosen.has('combat'))
    issues.push({ level: 'error', code: 'proto.requires', field: 'progression', where: where('quests'), message: 'Playable prototype: Player progression gets its XP from quests and defeated enemies, so it needs Quests and rewards or Combat; choose one.' })
  if (chosen.has('progression'))
    for (const d of progressionRules(p).rules.defaults) issues.push({ level: 'info', code: 'gameplay.default', field: 'progression', where: { doc: 'design.player', section: 'leveling', field: 'levelCap' }, message: `Player progression: ${d} (default; set it in Player Character › Levelling).` })
  if (chosen.has('time')) issues.push({ level: 'info', code: 'gameplay.default', field: 'time', where: { doc: 'design.timeWeather', section: 'time' }, message: `Day and night: ${timeRules(p).rules.defaults.join(', ')} (default).` })
  // Loot goes into the inventory and is taken by interacting with the defeated enemy.
  if (chosen.has('combat') && combatRules(p).rules.enemies.some((e) => e.loot.length))
    for (const need of ['interaction', 'inventory'] as PrototypeSystem[])
      if (!chosen.has(need)) issues.push({ level: 'error', code: 'proto.requires', field: 'combat', where: where(need), message: `Playable prototype: an enemy drops loot, so Combat needs ${LABEL[need]}; choose it too.` })
  // Recipes unlocked by quests need the quest module to know when they are done.
  if (chosen.has('crafting') && !chosen.has('quests') && recipeRules(p).rules.some((r) => r.unlockQuests.length))
    issues.push({ level: 'error', code: 'proto.requires', field: 'crafting', where: where('quests'), message: 'Playable prototype: a recipe is unlocked by a quest, so Crafting needs Quests and rewards; choose it too.' })
  // Quests the engine cannot finish by itself: shown, but never completed by play.
  if (chosen.has('quests'))
    for (const r of questRules(p).rules.filter((x) => !x.completeWhen))
      issues.push({ level: 'warning', code: 'proto.questTextOnly', field: r.quest, where: { doc: 'design.story', section: 'quests', id: r.quest, field: 'collectItems' }, message: `Playable prototype: ${r.name} has no typed goal (Goal: hold these items), so it never completes by playing; its objectives stay text.` })
  for (const g of invalid) issues.push({ level: g.level, code: 'proto.dataInvalid', field: g.code, where: g.where, message: `Playable prototype: ${g.message}` })

  const playable = wanted && systems.length > 0 && !issues.some((i) => i.level === 'error') && systems.every((s) => s.level === 'executable' || s.level === 'template')
  const blocking = issues.filter((i) => i.level === 'error').length
  const frames = systems.filter((s) => s.level === 'frame').length
  issues.push({
    level: 'info',
    code: 'proto.verdict',
    where: where(),
    message: playable
      ? 'Playable prototype: every chosen system works from the plan.'
      : `Playable prototype: not playable yet (${blocking} blocking problem${blocking === 1 ? '' : 's'}, ${frames} system${frames === 1 ? '' : 's'} only a frame).`,
  })
  return { wanted, engine, profile, systems, playable, issues: wanted ? issues : [] }
}
