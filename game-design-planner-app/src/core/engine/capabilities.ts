import type { Entity, Project } from '../model/types'
import { dataList, sourceOf } from '../dataDriven'
import {
  PROTOTYPE_DIMENSIONS,
  PROTOTYPE_PERSPECTIVES,
  PROTOTYPE_PIPELINES,
  PROTOTYPE_PLATFORMS,
  PROTOTYPE_SYSTEMS,
  type PrototypeSystem,
  type SaveState,
} from '../../modules/technical'
import { combatRules, inventoryRules, placements, prototypeScene, questRules, recipeRules, runtimeControls, saveLinks } from '../gameplay'
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
  support: Partial<Record<EngineId, { level: SupportLevel; note: string }>>
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
    { unity: { level: 'template', note: 'Runtime 0.3.0: CharacterController movement at the planned speed and a third-person camera at the planned distance and height, driven by the generated Move action. The bridge builds the prototype scene (URP) from the location map with the player at its start; PlayMode tests generated.' } },
  ),
  cap(
    'interaction',
    ['movement'],
    [
      { what: 'A control whose Runtime action is Interact', where: { doc: 'design.ui', section: 'controls', field: 'drives' }, ok: (p) => !!runtimeControls(p).controls.interact },
      { what: 'An item to pick up on a location map (an object with spawn role “item”)', where: { doc: WORLD_DOC, section: 'locations' }, ok: (p) => placed(p, 'item') },
    ],
    { unity: { level: 'template', note: 'Runtime 0.4.0: the player interacts with the nearest target within the planned range (Player Character › Interaction range) on the Interact action, once per press; item pickups placed on the map give their planned item and amount once (itemAcquired event) and disappear. On-screen prompt; PlayMode tests generated.' } },
  ),
  cap(
    'inventory',
    ['interaction'],
    [
      { what: 'At least one item', where: { doc: 'design.items', section: 'items' }, ok: (p) => list(p, 'design.items', 'items').length > 0 },
      { what: `A data schema with the source “${ITEMS}”`, where: { doc: 'technical.dataDriven', section: 'schemas' }, ok: (p) => schemaFor(p, ITEMS) },
      { what: 'Inventory slots', where: { doc: 'design.items', section: 'inventory', field: 'slots' }, ok: (p) => Number(form(p, 'design.items', 'inventory').slots) > 0 },
    ],
    { unity: { level: 'template', note: 'Runtime 0.5.0: slots and stack sizes from the plan, all-or-nothing adds (a full inventory leaves the pickup where it is), and the HUD elements bound to the inventory (Grid) and to items (Counter) update as it changes; PlayMode tests generated.' } },
  ),
  cap(
    'quests',
    ['inventory'],
    [{ what: 'A quest with a typed goal (Goal: hold these items)', where: { doc: 'design.story', section: 'quests', field: 'collectItems' }, ok: (p) => questRules(p).rules.some((r) => r.completeWhen) }],
    { unity: { level: 'template', note: 'Runtime 0.6.0: a quest starts when the planned quest graph (PlannerQuestLog) lets it, its typed goal is checked against the inventory after every change, and its item reward is given once, all or nothing (it waits while the inventory is full). Money and XP are reported in the completion event; no wallet or levelling module uses them yet. The HUD quest tracker follows it; PlayMode tests generated.' } },
  ),
  cap(
    'saveLoad',
    [],
    [
      { what: 'A current save version', where: { doc: 'technical.save', section: 'save', field: 'version' }, ok: (p) => Number(form(p, 'technical.save', 'save').version) >= 1 },
      { what: 'At least one saved part', where: { doc: 'technical.save', section: 'parts' }, ok: (p) => list(p, 'technical.save', 'parts').length > 0 },
    ],
    { unity: { level: 'template', note: 'Runtime 0.7.0: the parts linked to a runtime state (Saved parts › Runtime state) save the player’s position, the inventory with the pickups taken, and the quests with their graph and rewards through the generated PlannerSave (planned version, slots and migrations); a damaged or newer save is refused before anything changes. PlayMode tests generated.' } },
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
    { unity: { level: 'template', note: 'Runtime 0.9.0: the plan’s recipes as typed rules (item ingredients in, the result out, unlocking quests) crafted all or nothing in the inventory, from a crafting panel opened with the planned control; raw resources, stations, skills and craft time are not run. PlayMode tests generated.' } },
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
    { unity: { level: 'template', note: 'Runtime 0.10.0, the first supported model only: melee with the Player weapon, enemies with their planned HP, damage, rate, armor, resistances, speed and aggression, every hit by the plan’s damage formula, XP and guaranteed loot, the player back at the start when defeated. Ranged, caster and support enemies, crits, status effects and difficulty scaling are not run. PlayMode tests generated.' } },
  ),
  cap(
    'dialogue',
    ['interaction'],
    [{ what: 'At least one character', where: { doc: 'design.story', section: 'characters' }, ok: (p) => list(p, 'design.story', 'characters').length > 0 }],
    { unity: { level: 'unsupported', note: 'The planner has no structured dialogue yet (only a dialogue style).' } },
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

export const supportOf = (c: Capability, engine: EngineId): { level: SupportLevel; note: string } =>
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
    ...(chosen.has('movement') || chosen.has('interaction') ? [...placements(p).issues, ...runtimeControls(p).issues, ...prototypeScene(p).issues] : []),
  ].filter((i) => i.level !== 'info')
  // Saving: every chosen system with state needs a saved part that holds it, or loading would lose it.
  if (chosen.has('saveLoad')) {
    const held = new Set(saveLinks(p).links.map((l) => l.state))
    const needed: [PrototypeSystem, SaveState][] = [['movement', 'Player position'], ['inventory', 'Inventory'], ['quests', 'Quests'], ['combat', 'Combat']]
    for (const [system, state] of needed)
      if (chosen.has(system) && !held.has(state))
        issues.push({ level: 'error', code: 'proto.dataMissing', field: 'saveLoad', where: { doc: 'technical.save', section: 'parts', field: 'state' }, message: `Playable prototype: Save and load needs a saved part whose Runtime state is ${state} (for ${LABEL[system]}); without it, loading would lose it.` })
  }
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
