import type { GuideExample, ModuleGuide } from '../../core/guides/types'
import { makeId } from '../../core/model/project'
import type { Entity, Project } from '../../core/model/types'
import { activeSkillsWithoutAbility, levelCap, PLAYER_DOC } from '../../core/player'
import { paramsOf } from '../../core/difficulty'

const doc = (p: Project): Record<string, any> => p.documents[PLAYER_DOC]?.data ?? {}
const list = (p: Project, section: string): Entity[] => (Array.isArray(doc(p)[section]) ? doc(p)[section] : [])
const filled = (v: unknown) => typeof v === 'string' ? v.trim() !== '' : v !== undefined && v !== null
const catalog = (p: Project, id: string) => p.registry.catalogs[id]?.items ?? []
const ensureList = (p: Project, section: string): Entity[] => {
  const d = p.documents[PLAYER_DOC]?.data
  if (!d) return []
  if (!Array.isArray(d[section])) d[section] = []
  return d[section]
}

/** Adds one entry per catalog item that has none yet (matched by the ref field). */
const createMissing = (section: string, catalogId: string, field: string) => (p: Project) => {
  const target = ensureList(p, section)
  for (const item of catalog(p, catalogId)) if (!target.some((e) => e[field] === item.id)) target.push({ id: makeId(), name: item.label, [field]: item.id })
}

// ---------- Examples ----------

const curve = (id: string, title: string, description: string, formula: string): GuideExample => ({
  id,
  section: 'leveling',
  title,
  description,
  preview: 'xpCurve',
  apply: (p) => {
    const d = p.documents[PLAYER_DOC]?.data
    if (!d) return
    const l = (d.leveling ??= {})
    l.xpFormula = formula
    l.levelCap ??= 30
    l.skillPointsPerLevel ??= 1
    l.startSkillPoints ??= 1
  },
})

const castParam = {
  key: 'cast',
  label: 'For cast',
  options: (p: Project) => catalog(p, 'casts'),
}

/** Builds branches × tiers skills for a cast; costs rise per tier and levels spread over the cap. */
function tree(p: Project, castId: string | undefined, branches: { name: string; kind: string }[], tiers: number) {
  const cast = catalog(p, 'casts').find((c) => c.id === castId) ?? catalog(p, 'casts')[0]
  if (!cast) return
  const skills = ensureList(p, 'skills')
  const cap = levelCap(p) ?? 30
  const numerals = ['I', 'II', 'III', 'IV', 'V', 'VI']
  for (const b of branches) {
    let prev: string | undefined
    for (let t = 1; t <= tiers; t++) {
      const id = makeId()
      skills.push({
        id,
        name: `${b.name} ${numerals[t - 1] ?? t}`,
        cast: cast.id,
        kind: b.kind,
        tier: t,
        cost: t,
        requiredLevel: t === 1 ? 1 : Math.max(2, Math.round(((t - 1) / tiers) * cap)),
        ...(prev ? { requires: [prev] } : {}),
      })
      prev = id
    }
  }
}

const SURVIVAL_PRESETS: Record<string, number> = { forgiving: 1.5, standard: 2.5, harsh: 5 }

const survival = (key: keyof typeof SURVIVAL_PRESETS, title: string, description: string): GuideExample => ({
  id: `survival-${key}`,
  section: 'survival',
  title,
  description,
  preview: 'survival',
  apply: (p) => {
    const stats = ensureList(p, 'survival')
    // Link a Difficulty parameter only when its name mentions the stat, e.g. "Hunger / thirst decay rate".
    const paramFor = (label: string) => paramsOf(p).find((x) => String(x.name ?? '').toLowerCase().includes(label.toLowerCase()))
    for (const item of catalog(p, 'survivalStats')) {
      let e = stats.find((s) => s.stat === item.id)
      if (!e) stats.push((e = { id: makeId(), name: item.label, stat: item.id }))
      e.max = 100
      e.criticalAt = 20
      e.decayUnit = 'real minute'
      // Health does not drain on its own; it is restored and lost through events.
      e.decay = item.id === 'health' ? 0 : SURVIVAL_PRESETS[key]
      const param = paramFor(item.label)
      if (param && item.id !== 'health') e.difficultyParam ??= param.id
    }
  },
})

export const PLAYER_EXAMPLES: GuideExample[] = [
  curve('xp-linear', 'Linear', 'Every level costs the same extra amount. Easy to read, gets flat late.', '100 * level'),
  curve('xp-poly', 'Polynomial (recommended)', 'Early levels come fast, later ones slow down smoothly.', '100 * level ^ 1.5'),
  curve('xp-exp', 'Exponential', 'Grows by a fixed percentage; late levels become very long.', 'round(80 * 1.15 ^ level)'),
  curve('xp-plateau', 'Plateau then steep', 'Gentle until level 15, then a hard climb for veterans.', '100 * level + 20 * max(0, level - 15) ^ 2'),
  {
    id: 'tree-3x3',
    section: 'skills',
    title: '3 branches × 3 tiers',
    description: 'Offense, defense and utility paths; each tier requires the one before.',
    param: castParam,
    preview: 'skillTree',
    apply: (p, cast) => tree(p, cast, [{ name: 'Offense', kind: 'Active' }, { name: 'Defense', kind: 'Passive' }, { name: 'Utility', kind: 'Spell' }], 3),
  },
  {
    id: 'tree-linear',
    section: 'skills',
    title: 'Linear mastery',
    description: 'One path of five tiers; simple to read, no choices.',
    param: castParam,
    preview: 'skillTree',
    apply: (p, cast) => tree(p, cast, [{ name: 'Mastery', kind: 'Passive' }], 5),
  },
  survival('forgiving', 'Forgiving', 'About 50 minutes from full to critical.'),
  survival('standard', 'Standard', 'About 30 minutes from full to critical.'),
  survival('harsh', 'Harsh', 'About 15 minutes from full to critical.'),
]

// ---------- Guide ----------

export const PLAYER_GUIDE: ModuleGuide = {
  map: {
    width: 790,
    height: 240,
    nodes: [
      { id: 'hero', label: 'The hero', section: 'hero', x: 10, y: 14 },
      { id: 'items', label: 'Items', doc: 'design.items', x: 220, y: 14 },
      { id: 'xpSources', label: 'XP sources', section: 'xpSources', x: 430, y: 14 },
      { id: 'factions', label: 'Factions', doc: 'design.factions', x: 640, y: 14 },
      { id: 'survival', label: 'Survival stats', section: 'survival', x: 10, y: 102 },
      { id: 'death', label: 'Death and respawn', section: 'death', x: 220, y: 102 },
      { id: 'leveling', label: 'Levelling', section: 'leveling', x: 430, y: 102 },
      { id: 'skills', label: 'Skills', section: 'skills', x: 640, y: 102 },
      { id: 'difficulty', label: 'Difficulty', doc: 'design.difficulty', x: 10, y: 190 },
      { id: 'casts', label: 'Casts', section: 'casts', x: 430, y: 190 },
      { id: 'abilities', label: 'Abilities', section: 'abilities', x: 640, y: 190 },
    ],
    edges: [
      { from: 'hero', to: 'items', label: 'starts with' },
      { from: 'items', to: 'survival', label: 'restore' },
      { from: 'difficulty', to: 'survival', label: 'decay ×' },
      { from: 'difficulty', to: 'death', label: 'permadeath' },
      { from: 'xpSources', to: 'leveling', label: 'XP / hour' },
      { from: 'leveling', to: 'skills', label: 'skill points' },
      { from: 'factions', to: 'skills', label: 'unlocks' },
      { from: 'skills', to: 'abilities', label: 'grants' },
      { from: 'abilities', to: 'casts', label: 'resource cost' },
      { from: 'casts', to: 'skills', label: 'lanes' },
    ],
  },
  steps: [
    {
      id: 'hero',
      title: 'Describe the hero',
      body: 'Write the player fantasy in one line and the starting state. Everything else should serve that fantasy.',
      section: 'hero',
      target: 'field-fantasy',
      done: (p) => filled(doc(p).hero?.fantasy) || filled(doc(p).hero?.background),
    },
    {
      id: 'survival',
      title: 'Add the survival stats',
      body: 'One entry per stat in the “Survival stats” catalog, with max, decay and the critical value.',
      section: 'survival',
      target: 'add',
      done: (p) => catalog(p, 'survivalStats').length > 0 && catalog(p, 'survivalStats').every((c) => list(p, 'survival').some((s) => s.stat === c.id)),
      action: { label: 'Create one per stat', run: createMissing('survival', 'survivalStats', 'stat') },
    },
    {
      id: 'difficulty',
      title: 'Link survival to difficulty',
      body: 'Pick the Difficulty parameter that scales each stat’s decay, then check the Depletion view for every level.',
      section: 'survival',
      target: 'view-depletion',
      done: (p) => {
        const drains = list(p, 'survival').filter((s) => typeof s.decay === 'number' && s.decay > 0)
        return drains.length > 0 && (paramsOf(p).length === 0 || drains.every((s) => s.difficultyParam))
      },
    },
    {
      id: 'leveling',
      title: 'Set the level cap and XP curve',
      body: 'The formula gives the XP needed for the next level, using the variable level. Pick an example to start.',
      section: 'leveling',
      target: 'examples',
      done: (p) => levelCap(p) !== null && filled(doc(p).leveling?.xpFormula),
      action: { label: 'Pick a curve…', examples: 'leveling' },
    },
    {
      id: 'xpSources',
      title: 'Add XP sources with rates',
      body: 'Add at least three sources with XP per action and actions per hour; the Level curve then shows hours per level.',
      section: 'xpSources',
      target: 'view-levelCurve',
      done: (p) => list(p, 'xpSources').filter((s) => typeof s.xp === 'number' && typeof s.perHour === 'number').length >= 3,
    },
    {
      id: 'casts',
      title: 'Create the casts',
      body: 'One entry per cast in the catalog: playstyle, primary resource and faction affinity.',
      section: 'casts',
      target: 'add',
      done: (p) => catalog(p, 'casts').length > 0 && catalog(p, 'casts').every((c) => list(p, 'casts').some((x) => x.cast === c.id)),
      action: { label: 'Create missing casts', run: createMissing('casts', 'casts', 'cast') },
    },
    {
      id: 'skills',
      title: 'Build a skill tree per cast',
      body: 'Give every cast at least three skills across two or more tiers, with prerequisites. Insert a template to start.',
      section: 'skills',
      target: 'examples',
      done: (p) =>
        list(p, 'casts').length > 0 &&
        list(p, 'casts').every((c) => {
          const own = list(p, 'skills').filter((s) => s.cast === c.cast)
          return own.length >= 3 && own.some((s) => typeof s.tier === 'number' && s.tier >= 2)
        }),
      action: { label: 'Insert a tree…', examples: 'skills' },
    },
    {
      id: 'abilities',
      title: 'Give active skills their abilities',
      body: 'Each active skill or spell should grant an ability with a resource cost and a cooldown.',
      section: 'abilities',
      target: 'add',
      done: (p) => list(p, 'skills').length > 0 && activeSkillsWithoutAbility(p).length === 0 && list(p, 'abilities').length > 0,
    },
    {
      id: 'build',
      title: 'Test a build',
      body: 'Open the Build planner, pick a cast and a mid level, and learn skills. Does the budget force interesting choices? Tick this step by hand.',
      section: 'skills',
      target: 'view-buildPlanner',
    },
    {
      id: 'finish',
      title: 'Controls and death',
      body: 'List the input actions and describe what dying costs the player.',
      section: 'death',
      target: 'field-penalty',
      done: (p) => list(p, 'actions').length > 0 && filled(doc(p).death?.penalty),
    },
  ],
  examples: PLAYER_EXAMPLES,
  concepts: {
    survival: {
      title: 'How survival pressure works',
      body: 'A stat drains from max at its decay rate. Below the critical value its low effect starts; restoring it (eating, drinking, resting) jumps it back up. Difficulty multiplies the decay, so the same stat lasts less on Hard.',
      diagram: 'decay',
    },
    leveling: {
      title: 'From XP to skills',
      body: 'XP sources give XP at some rate. The curve says how much XP each level needs. Every level grants skill points, and the points buy skills. The cap decides how much of a tree a player can ever own.',
      diagram: 'pipeline',
    },
    skills: {
      title: 'Reading a skill tree',
      body: 'Each cast is a lane, each tier a row. Arrows point from a prerequisite to the skill that needs it. Cost and required level gate each skill; the build planner shows what a player can afford at a level.',
      diagram: 'tree',
    },
    abilities: {
      title: 'Anatomy of an ability',
      body: 'Using an ability spends its resource cost, takes its cast time, applies its effect, then waits for the cooldown. Together these set how often it can be used and how strong it may be.',
      diagram: 'abilityTimeline',
    },
  },
  empty: {
    survival: 'Survival stats are the minute-to-minute pressure: how long until the hero must eat, drink or rest.',
    xpSources: 'XP sources say where experience comes from and how fast; with them the level curve turns into hours of play.',
    casts: 'Casts are the hero’s classes. Start with one entry per cast in the catalog.',
    skills: 'Skills are what players spend points on. A template gives you a tree to tune instead of a blank page.',
    abilities: 'Abilities are what skills let the hero do: their cost, cast time and cooldown set the rhythm of combat.',
    actions: 'List each input action with its keyboard and gamepad binding.',
  },
}
