import { biomeStage, combatList, COMBAT_DOC, enemiesWithoutLoot, immuneFighters, phaseCoverage, playerDamageTypes } from '../../core/combat'
import { paramsOf } from '../../core/difficulty'
import type { GuideExample, ModuleGuide } from '../../core/guides/types'
import { makeId } from '../../core/model/project'
import type { Entity, Project } from '../../core/model/types'
import { levelCap } from '../../core/player'

const doc = (p: Project): Record<string, any> => p.documents[COMBAT_DOC]?.data ?? {}
const listOf = (p: Project, docId: string, section: string): Entity[] => {
  const d = p.documents[docId]?.data[section]
  return Array.isArray(d) ? d : []
}
const ensureList = (p: Project, section: string): Entity[] => {
  const d = p.documents[COMBAT_DOC]?.data
  if (!d) return []
  if (!Array.isArray(d[section])) d[section] = []
  return d[section]
}
const ensureForm = (p: Project, section: string): Record<string, any> => {
  const d = p.documents[COMBAT_DOC]?.data
  if (!d) return {}
  if (!d[section] || typeof d[section] !== 'object') d[section] = {}
  return d[section]
}
const filled = (v: unknown) => typeof v === 'string' && v.trim() !== ''
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

// ---------- Examples ----------

/** Sets the damage formula and, when Difficulty has matching parameters, links enemy HP and damage to them. */
const formula = (id: string, title: string, description: string, expr: string): GuideExample => ({
  id,
  section: 'damageModel',
  title,
  description,
  preview: 'damageFormula',
  apply: (p) => {
    const m = ensureForm(p, 'damageModel')
    m.damageFormula = expr
    const find = (word: string) => paramsOf(p).find((x) => /enemy/i.test(String(x.name)) && new RegExp(word, 'i').test(String(x.name)))
    m.hpParam ??= find('hp')?.id
    m.damageParam ??= find('damage')?.id
    if (m.hpParam === undefined) delete m.hpParam
    if (m.damageParam === undefined) delete m.damageParam
  },
})

const ROSTER = [
  { key: 'swarm', name: 'Swarmling', role: 'Swarm', hp: 30, damage: 4, attackRate: 1.5, armor: 0, aggression: 'Hunter', pattern: 'Rushes in packs' },
  { key: 'ranged', name: 'Spitter', role: 'Ranged', hp: 60, damage: 8, attackRate: 1, armor: 10, aggression: 'Territorial', pattern: 'Keeps distance, fires every second' },
  { key: 'brute', name: 'Brute', role: 'Brute', hp: 150, damage: 15, attackRate: 0.6, armor: 40, aggression: 'Territorial', pattern: 'Slow wind-up, heavy swing' },
  { key: 'elite', name: 'Warden', role: 'Elite', hp: 300, damage: 20, attackRate: 0.8, armor: 60, aggression: 'Hunter', pattern: 'Mixes charges and area slams' },
]

/** Four enemy roles for a biome, scaled ×1.6 per biome stage (Starter = 1×). */
function insertRoster(p: Project, biomeId?: string) {
  const biome = listOf(p, 'design.world', 'biomes').find((b) => b.id === biomeId)
  const stage = biome ? (biomeStage(p, { id: 'x', biome: biome.id }) ?? 0) : 0
  const k = Math.pow(1.6, stage)
  const enemies = ensureList(p, 'enemies')
  for (const r of ROSTER)
    enemies.push({
      id: makeId(),
      name: biome ? `${biome.name} ${r.name.toLowerCase()}` : r.name,
      ...(biome ? { biome: biome.id } : {}),
      role: r.role,
      tier: stage + 1,
      hp: Math.round(r.hp * k),
      damage: Math.round(r.damage * k),
      attackRate: r.attackRate,
      armor: Math.round(r.armor * k),
      aggression: r.aggression,
      pattern: r.pattern,
      xp: Math.round((r.hp / 10) * k),
    })
}

const PHASE_TEMPLATES: Record<string, { name: string; hpFrom: number; hpTo: number; mechanics: string; damageMult?: number }[]> = {
  three: [
    { name: 'Opening', hpFrom: 100, hpTo: 60, mechanics: 'Basic attack pattern; teaches the tells.' },
    { name: 'Escalation', hpFrom: 60, hpTo: 30, mechanics: 'Adds an area attack and faster combos.', damageMult: 1.2 },
    { name: 'Desperation', hpFrom: 30, hpTo: 0, mechanics: 'All attacks, shorter pauses.', damageMult: 1.4 },
  ],
  enrage: [
    { name: 'Fight', hpFrom: 100, hpTo: 20, mechanics: 'Full move set.' },
    { name: 'Enrage', hpFrom: 20, hpTo: 0, mechanics: 'Faster and stronger; no new moves.', damageMult: 1.5 },
  ],
  adds: [
    { name: 'Duel', hpFrom: 100, hpTo: 70, mechanics: 'One on one.' },
    { name: 'Summons', hpFrom: 70, hpTo: 40, mechanics: 'Calls waves of adds; the boss is shielded until they fall.' },
    { name: 'Final stand', hpFrom: 40, hpTo: 0, mechanics: 'No more adds; stronger attacks.', damageMult: 1.3 },
  ],
}

const bossParam = {
  key: 'boss',
  label: 'For boss',
  options: (p: Project) => combatList(p, 'bosses').map((b) => ({ id: b.id, label: String(b.name ?? '') || '(unnamed)' })),
}

const phaseExample = (key: keyof typeof PHASE_TEMPLATES, title: string, description: string): GuideExample => ({
  id: `phases-${key}`,
  section: 'phases',
  title,
  description,
  param: bossParam,
  preview: 'bossPhases',
  apply: (p, bossId) => {
    const boss = combatList(p, 'bosses').find((b) => b.id === bossId) ?? combatList(p, 'bosses')[0]
    if (!boss) return
    const phases = ensureList(p, 'phases')
    for (const ph of PHASE_TEMPLATES[key]) phases.push({ id: makeId(), boss: boss.id, ...ph, name: `${boss.name} – ${ph.name}` })
  },
})

const STATUS_SET = [
  { name: 'Burn', damageType: 'fire', tickDamage: 3, tickInterval: 1, duration: 5, maxStacks: 3 },
  { name: 'Poison', damageType: 'nature', tickDamage: 2, tickInterval: 1, duration: 10, maxStacks: 5 },
  { name: 'Bleed', damageType: 'physical', tickDamage: 4, tickInterval: 1, duration: 6, maxStacks: 3 },
  { name: 'Stun', duration: 1.5, maxStacks: 1, slow: 100 },
]

export const insertStatusSet = (p: Project) => {
  const list = ensureList(p, 'statusEffects')
  const types = new Set((p.registry.catalogs.damageTypes?.items ?? []).map((t) => t.id))
  for (const s of STATUS_SET) {
    if (list.some((x) => String(x.name).toLowerCase() === s.name.toLowerCase())) continue
    const { damageType, ...rest } = s as typeof s & { damageType?: string }
    list.push({ id: makeId(), ...rest, ...(damageType && types.has(damageType) ? { damageType } : {}) })
  }
}

/** One loadout per Player cast at level 1 and mid level, with its starting weapon (or the strongest weapon) and abilities. */
export function insertLoadouts(p: Project) {
  const items = listOf(p, 'design.items', 'items').filter((i) => isNum(i.damage))
  const best = [...items].sort((a, b) => b.damage - a.damage)[0]
  const casts = listOf(p, 'design.player', 'casts')
  const mid = Math.max(2, Math.round((levelCap(p) ?? 20) / 2))
  const loadouts = ensureList(p, 'loadouts')
  const add = (name: string, extra: Record<string, unknown>) => loadouts.push({ id: makeId(), name, ...extra })
  if (!casts.length) {
    add('Basic fighter', { level: 1, ...(best ? { weapon: best.id } : {}) })
    return
  }
  for (const c of casts) {
    const own = items.find((i) => (c.startGear ?? []).includes(i.id)) ?? best
    for (const level of [1, mid])
      add(`${c.name} lv ${level}`, { cast: c.id, level, ...(own ? { weapon: own.id } : {}), ...(Array.isArray(c.startAbilities) && c.startAbilities.length ? { abilities: c.startAbilities } : {}) })
  }
}

export const COMBAT_EXAMPLES: GuideExample[] = [
  formula('formula-diminishing', 'Armor with diminishing returns (recommended)', 'Each point of armor matters less: 100 armor halves damage, 300 quarters it. Never reaches zero.', 'attack * 100 / (100 + armor) * (1 - resist / 100) * crit'),
  formula('formula-flat', 'Flat subtraction', 'Armor subtracts directly; weak hits can be blocked almost entirely. At least 1 damage.', 'max(1, attack * crit - armor / 2) * (1 - resist / 100)'),
  formula('formula-percent', 'Percentage reduction', 'Armor is a percentage, capped at 80%. Easy to read in tooltips.', 'attack * crit * (1 - min(armor, 80) / 100) * (1 - resist / 100)'),
  {
    id: 'roster',
    section: 'enemies',
    title: 'Enemy roster for a biome',
    description: 'A swarm, ranged, brute and elite enemy. Numbers grow ×1.6 per biome stage (Starter, Early, Mid, Late, Final).',
    param: { key: 'biome', label: 'Biome', options: (p: Project) => [{ id: '', label: '— no biome —' }, ...listOf(p, 'design.world', 'biomes').map((b) => ({ id: b.id, label: String(b.name ?? '') }))] },
    preview: 'enemyRoster',
    apply: (p, biome) => insertRoster(p, biome || undefined),
  },
  phaseExample('three', 'Three phases', '100–60–30–0 %, each phase adds pressure.'),
  phaseExample('enrage', 'Enrage', 'One long phase, then an enrage below 20 %.'),
  phaseExample('adds', 'Adds waves', 'A duel, a summoning phase with adds, then a final stand.'),
  {
    id: 'status-set',
    section: 'statusEffects',
    title: 'Starter status effects',
    description: 'Burn, poison, bleed and stun with durations, ticks and stacks.',
    preview: 'statusSet',
    apply: insertStatusSet,
  },
  {
    id: 'loadouts',
    section: 'loadouts',
    title: 'Loadouts from Player casts',
    description: 'For each cast: one at level 1 and one at mid level, with its starting weapon and abilities.',
    preview: 'loadouts',
    apply: insertLoadouts,
  },
]

// ---------- Guide ----------

export const COMBAT_GUIDE: ModuleGuide = {
  map: {
    width: 790,
    height: 330,
    nodes: [
      { id: 'system', label: 'Combat system', section: 'system', x: 10, y: 14 },
      { id: 'damageModel', label: 'Damage model', section: 'damageModel', x: 220, y: 14 },
      { id: 'statusEffects', label: 'Status effects', section: 'statusEffects', x: 430, y: 14 },
      { id: 'difficulty', label: 'Difficulty', doc: 'design.difficulty', x: 640, y: 14 },
      { id: 'items', label: 'Items', doc: 'design.items', x: 10, y: 102 },
      { id: 'loadouts', label: 'Test loadouts', section: 'loadouts', x: 220, y: 102 },
      { id: 'enemies', label: 'Enemies', section: 'enemies', x: 430, y: 102 },
      { id: 'world', label: 'World', doc: 'design.world', x: 640, y: 102 },
      { id: 'player', label: 'Player', doc: 'design.player', x: 10, y: 190 },
      { id: 'timeWeather', label: 'Time & Weather', doc: 'design.timeWeather', x: 220, y: 190 },
      { id: 'variants', label: 'Variants', section: 'variants', x: 430, y: 190 },
      { id: 'bosses', label: 'Bosses', section: 'bosses', x: 640, y: 190 },
      { id: 'siege', label: 'Sieges', section: 'siege', x: 220, y: 278 },
      { id: 'ai', label: 'Technical AI', doc: 'technical.ai', x: 430, y: 278 },
      { id: 'phases', label: 'Boss phases', section: 'phases', x: 640, y: 278 },
    ],
    edges: [
      { from: 'system', to: 'damageModel', label: 'rules' },
      { from: 'difficulty', to: 'damageModel', label: 'HP, damage ×' },
      { from: 'damageModel', to: 'enemies', label: 'per hit' },
      { from: 'statusEffects', to: 'enemies', label: 'on hit' },
      { from: 'items', to: 'loadouts', label: 'weapon, armor' },
      { from: 'player', to: 'loadouts', label: 'abilities, HP' },
      { from: 'loadouts', to: 'enemies', label: 'sandbox' },
      { from: 'world', to: 'enemies', label: 'biomes' },
      { from: 'enemies', to: 'variants', label: 'base' },
      { from: 'timeWeather', to: 'variants', label: 'night, events' },
      { from: 'world', to: 'bosses', label: 'gates' },
      { from: 'bosses', to: 'phases', label: 'phases' },
      { from: 'ai', to: 'enemies', label: 'behavior' },
      { from: 'enemies', to: 'siege', label: 'defenders' },
    ],
  },
  steps: [
    {
      id: 'model',
      title: 'Describe the combat model',
      body: 'Real-time or tactical? How do aiming, dodging and blocking work? One paragraph is enough to start.',
      section: 'system',
      target: 'field-model',
      done: (p) => filled(doc(p).system?.model),
    },
    {
      id: 'formula',
      title: 'Pick a damage formula',
      body: 'The formula turns attack, armor and resistance into damage per hit. Every view below uses it.',
      section: 'damageModel',
      target: 'examples',
      done: (p) => filled(doc(p).damageModel?.damageFormula),
      action: { label: 'Pick a formula…', examples: 'damageModel' },
    },
    {
      id: 'difficulty',
      title: 'Link difficulty',
      body: 'Choose the Difficulty parameters for enemy HP and enemy damage, so fights scale per level in the sandbox.',
      section: 'damageModel',
      target: 'field-hpParam',
      done: (p) => paramsOf(p).length === 0 || (!!doc(p).damageModel?.hpParam && !!doc(p).damageModel?.damageParam),
    },
    {
      id: 'status',
      title: 'Add status effects',
      body: 'Burns, poisons, stuns: their tick damage, duration and stacking.',
      section: 'statusEffects',
      target: 'add',
      done: (p) => combatList(p, 'statusEffects').some((s) => isNum(s.duration)),
      action: { label: 'Insert starter set', run: insertStatusSet },
    },
    {
      id: 'enemies',
      title: 'Build an enemy roster',
      body: 'At least six enemies across two or more biomes, each with HP, damage and attacks per second.',
      section: 'enemies',
      target: 'examples',
      done: (p) => {
        const ok = combatList(p, 'enemies').filter((e) => isNum(e.hp) && isNum(e.damage) && isNum(e.attackRate))
        return ok.length >= 6 && new Set(ok.map((e) => e.biome).filter(Boolean)).size >= 2
      },
      action: { label: 'Insert a roster…', examples: 'enemies' },
    },
    {
      id: 'weakness',
      title: 'Check weaknesses',
      body: 'Every enemy should be hurt by something the player can deal. The Weaknesses view shows resistances against the player’s damage types.',
      section: 'enemies',
      target: 'view-weaknessMatrix',
      done: (p) => combatList(p, 'enemies').length > 0 && playerDamageTypes(p).size > 0 && immuneFighters(p).length === 0,
    },
    {
      id: 'loadouts',
      title: 'Create test loadouts',
      body: 'A loadout is a player setup to test against: weapon, abilities, armor and level.',
      section: 'loadouts',
      target: 'add',
      done: (p) => combatList(p, 'loadouts').length > 0,
      action: { label: 'Create from Player casts', run: insertLoadouts },
    },
    {
      id: 'sandbox',
      title: 'Read the Combat sandbox',
      body: 'Seconds to kill against seconds to die, per difficulty. Are early fights short and safe, late fights tense? Tick this step by hand.',
      section: 'loadouts',
      target: 'view-combatSandbox',
    },
    {
      id: 'phases',
      title: 'Give bosses phases',
      body: 'Each boss needs phases that cover its HP from 100 % to 0 % with no gaps.',
      section: 'phases',
      target: 'examples',
      done: (p) => {
        const bosses = combatList(p, 'bosses')
        return bosses.length > 0 && bosses.every((b) => {
          const c = phaseCoverage(p, b.id)
          return c.phases.length > 0 && c.gaps.length === 0 && c.overlaps.length === 0
        })
      },
      action: { label: 'Insert a phase template…', examples: 'phases' },
    },
    {
      id: 'loot',
      title: 'Give enemies loot',
      body: 'In Items › Loot tables, name enemies and bosses as sources. The enemy inspector shows what each one drops.',
      section: 'enemies',
      done: (p) => combatList(p, 'enemies').length > 0 && enemiesWithoutLoot(p).length === 0,
    },
  ],
  examples: COMBAT_EXAMPLES,
  concepts: {
    damageModel: {
      title: 'How a hit becomes damage',
      body: 'A hit starts with the attacker’s damage. Armor reduces it, then the defender’s resistance to that damage type, and a crit can multiply it. Negative resistance is a weakness and increases damage.',
      diagram: 'damageFlow',
    },
    loadouts: {
      title: 'Time to kill and time to die',
      body: 'Kill time = hits needed × time between hits. The same for the enemy against the player. A fight feels fair when the player wins with time to spare; it feels tense when the two are close.',
      diagram: 'ttk',
    },
    enemies: {
      title: 'A threat ramp across biomes',
      body: 'Threat = damage × attacks per second × HP. Later biomes should bring tougher enemies, so threat should rise from Starter to Final. A dip means a late enemy is easier than an early one.',
      diagram: 'threatRamp',
    },
    phases: {
      title: 'Phases split a boss’s HP',
      body: 'Each phase covers a slice of HP, from full to defeated. Phases change the attacks, add enemies or raise damage. Every slice should belong to exactly one phase.',
      diagram: 'phaseBar',
    },
  },
  empty: {
    statusEffects: 'Status effects are lasting effects of a hit: damage over time, slows and stuns.',
    enemies: 'Enemies are what the player fights in the world. A roster gives one of each role to tune.',
    variants: 'Variants are tougher versions at night or during events like the Blood moon.',
    bosses: 'Bosses are the big fights that gate progress.',
    phases: 'Phases split a boss’s HP into stages with their own mechanics.',
    loadouts: 'Loadouts are player setups to test fights against. Create them from the Player casts.',
  },
}
