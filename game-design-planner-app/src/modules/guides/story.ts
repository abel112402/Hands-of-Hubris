import type { GuideExample, ModuleGuide } from '../../core/guides/types'
import { makeId } from '../../core/model/project'
import type { Entity, Project } from '../../core/model/types'
import { actsInOrder, endingReachability, pacingProblems, questDeps, STORY_DOC, storyList } from '../../core/story'
import { QUEST_TYPE_SEED, QUEST_TYPES } from '../design'

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const filled = (v: unknown) => typeof v === 'string' && v.trim() !== ''
const form = (p: Project, id: string): Record<string, any> => p.documents[STORY_DOC]?.data[id] ?? {}
const ensureForm = (p: Project, id: string): Record<string, any> => {
  const d = p.documents[STORY_DOC]?.data
  if (!d) return {}
  if (!d[id] || typeof d[id] !== 'object' || Array.isArray(d[id])) d[id] = {}
  return d[id]
}
const ensureList = (p: Project, section: string): Entity[] => {
  const d = p.documents[STORY_DOC]?.data
  if (!d) return []
  if (!Array.isArray(d[section])) d[section] = []
  return d[section]
}
const checklist = (lines: string[]) => lines.map((text) => ({ id: makeId(), text, done: false }))

/** Adds one entry per quest type that has none yet. */
export function createQuestTypes(p: Project) {
  const list = ensureList(p, 'questTypes')
  for (const s of QUEST_TYPE_SEED) if (!list.some((t) => t.type === s.type)) list.push({ id: makeId(), ...s })
}

// ---------- Examples ----------

type ActSpec = { name: string; duration: number; levels: [number, number]; roles: string[]; goal: string }

/** Appends acts after the existing ones; each gets the first World biome of a matching role, and play hours per day default from the Time & Weather day length. */
const actPreset = (id: string, title: string, description: string, specs: ActSpec[]): GuideExample => ({
  id,
  section: 'acts',
  title,
  description,
  preview: 'actTimeline',
  apply: (p) => {
    const biomes = (p.documents['design.world']?.data.biomes ?? []) as Entity[]
    const list = ensureList(p, 'acts')
    let start = list.reduce((m, a) => Math.max(m, (isNum(a.start) ? a.start : 0) + (isNum(a.duration) ? a.duration : 0)), 0)
    const used = new Set<string>()
    for (const s of specs) {
      const biome = biomes.find((b) => s.roles.includes(b.role) && !used.has(b.id))
      if (biome) used.add(biome.id)
      list.push({ id: makeId(), name: s.name, start, duration: s.duration, levelMin: s.levels[0], levelMax: s.levels[1], goal: s.goal, ...(biome ? { biome: biome.id } : {}) })
      start += s.duration
    }
    const st = ensureForm(p, 'structure')
    const day = p.documents['design.timeWeather']?.data.time?.dayLength
    st.hoursPerDay ??= isNum(day) && day > 0 ? Math.round((day / 60) * 100) / 100 : 0.5
  },
})

const factionParam = {
  key: 'faction',
  label: 'Faction leader of',
  options: (p: Project) => [{ id: '', label: '— no faction —' }, ...((p.documents['design.factions']?.data.factions ?? []) as Entity[]).map((f) => ({ id: f.id, label: String(f.name ?? '') }))],
}

const actParam = {
  key: 'act',
  label: 'Act',
  options: (p: Project) => [{ id: '', label: '— spread over the acts —' }, ...actsInOrder(p).map((a) => ({ id: a.id, label: String(a.name ?? '') }))],
}

/** Four chained main quests; each requires the one before. */
function insertQuestline(p: Project, actId?: string) {
  const acts = actsInOrder(p)
  const giver = storyList(p, 'characters').find((c) => c.importance === 'Main')
  const specs = [
    { name: 'Washed ashore', xp: 100, money: 10, min: 20, obj: ['Find shelter', 'Light a fire'] },
    { name: 'The old lighthouse', xp: 150, money: 25, min: 40, obj: ['Reach the lighthouse', 'Repair the lamp'] },
    { name: 'Voices in the fog', xp: 200, money: 40, min: 45, obj: ['Follow the signal', 'Survive the night'] },
    { name: 'The island’s secret', xp: 300, money: 60, min: 60, obj: ['Open the sealed vault'] },
  ]
  const list = ensureList(p, 'quests')
  let prev: string | undefined
  specs.forEach((s, i) => {
    const act = actId || (acts.length ? acts[Math.min(acts.length - 1, Math.floor((i * acts.length) / specs.length))].id : undefined)
    const id = makeId()
    list.push({
      id,
      name: s.name,
      type: 'Main',
      ...(act ? { act } : {}),
      ...(giver ? { giver: giver.id } : {}),
      estMinutes: s.min,
      ...(prev ? { requires: [prev] } : {}),
      objectives: checklist(s.obj),
      rewardXp: s.xp,
      rewardMoney: s.money,
    })
    prev = id
  })
}

/** One decision with two options, a follow-up quest for each and an ending for each. */
function insertBranch(p: Project) {
  const quests = ensureList(p, 'quests')
  const choices = ensureList(p, 'choices')
  const endings = ensureList(p, 'endings')
  const anchor = [...quests].reverse().find((q) => q.type === 'Main')
  const qa = { id: makeId(), name: 'Keep the light burning', type: 'Main', ...(anchor?.act ? { act: anchor.act } : {}), estMinutes: 40, objectives: checklist(['Defend the lighthouse']), rewardXp: 250 }
  const qb = { id: makeId(), name: 'Into the dark tide', type: 'Main', ...(anchor?.act ? { act: anchor.act } : {}), estMinutes: 40, objectives: checklist(['Sail past the reef']), rewardXp: 250 }
  quests.push(qa, qb)
  const decision = 'Fate of the lighthouse'
  const oa = { id: makeId(), name: 'Relight it', decision, ...(anchor ? { quest: anchor.id } : {}), leadsTo: [qa.id], blocks: [qb.id] }
  const ob = { id: makeId(), name: 'Let it fall', decision, ...(anchor ? { quest: anchor.id } : {}), leadsTo: [qb.id], blocks: [qa.id] }
  choices.push(oa, ob)
  endings.push(
    { id: makeId(), name: 'The beacon', kind: 'Main', requiresChoices: [oa.id], requiresQuests: [qa.id], description: 'The island is saved and stays connected to the world.' },
    { id: makeId(), name: 'The dark tide', kind: 'Bad', requiresChoices: [ob.id], requiresQuests: [qb.id], description: 'The island sinks into the fog, and its secret with it.' },
  )
}

export const STORY_EXAMPLES: GuideExample[] = [
  actPreset('acts-three', 'Three acts', 'Arrival, the island opens up, the final secret: 10 + 20 + 15 days, levels 1–20.', [
    { name: 'Act 1: Shipwreck', duration: 10, levels: [1, 5], roles: ['Starter', 'Early'], goal: 'Survive and found the first camp.' },
    { name: 'Act 2: The island opens', duration: 20, levels: [5, 12], roles: ['Mid', 'Early'], goal: 'Win the factions over and grow the town.' },
    { name: 'Act 3: The secret', duration: 15, levels: [12, 20], roles: ['Late', 'Final'], goal: 'Uncover what the island hides.' },
  ]),
  actPreset('acts-five', 'Five-act island arc', 'A longer arc with a midpoint twist and a finale: 8 + 12 + 10 + 12 + 8 days.', [
    { name: 'Arrival', duration: 8, levels: [1, 4], roles: ['Starter'], goal: 'Survive the first nights.' },
    { name: 'Settling in', duration: 12, levels: [4, 8], roles: ['Early'], goal: 'Build a town and meet the factions.' },
    { name: 'The twist', duration: 10, levels: [8, 12], roles: ['Mid'], goal: 'The island turns out not to be what it seemed.' },
    { name: 'Taking sides', duration: 12, levels: [12, 17], roles: ['Late'], goal: 'Choose allies and prepare.' },
    { name: 'Finale', duration: 8, levels: [17, 20], roles: ['Final'], goal: 'Face the island’s heart.' },
  ]),
  {
    id: 'cast-starter',
    section: 'characters',
    title: 'Starter cast',
    description: 'A mentor, a rival, a faction leader and a merchant contact, introduced in the first act.',
    param: factionParam,
    preview: 'cast',
    apply: (p, faction) => {
      const act = actsInOrder(p)[0]
      const fac = ((p.documents['design.factions']?.data.factions ?? []) as Entity[]).find((f) => f.id === faction)
      const intro = act ? { introducedIn: act.id } : {}
      ensureList(p, 'characters').push(
        { id: makeId(), name: 'Old Maren', role: 'Mentor', importance: 'Main', essential: true, voice: 'Slow, kind, speaks in sea proverbs.', ...intro },
        { id: makeId(), name: 'Daro the Bold', role: 'Rival', importance: 'Main', voice: 'Boastful, quick to laugh, quicker to anger.', ...intro },
        { id: makeId(), name: fac ? `${fac.name} leader` : 'Faction leader', role: 'Faction leader', importance: 'Main', ...(fac ? { faction: fac.id } : {}), ...intro },
        { id: makeId(), name: 'Tess', role: 'Merchant contact', importance: 'Supporting', voice: 'Practical, counts everything.', ...intro },
      )
    },
  },
  {
    id: 'main-questline',
    section: 'quests',
    title: 'Main questline',
    description: 'Four main quests, each requiring the one before, with play time, objectives, XP and money.',
    param: actParam,
    preview: 'questFlow',
    apply: (p, act) => insertQuestline(p, act || undefined),
  },
  {
    id: 'tavern-jobs',
    section: 'quests',
    title: 'Tavern jobs',
    description: 'Three short repeatable jobs from the tavern board that pay a little money.',
    preview: 'questFlow',
    apply: (p) => {
      const act = actsInOrder(p)[0]
      for (const [name, money, min] of [['Rat hunt', 15, 10], ['The lost crate', 20, 15], ['Escort the peddler', 30, 20]] as const)
        ensureList(p, 'quests').push({ id: makeId(), name, type: 'Tavern random', ...(act ? { act: act.id } : {}), estMinutes: min, rewardMoney: money, objectives: checklist([name]) })
    },
  },
  {
    id: 'branch',
    section: 'choices',
    title: 'A branching decision',
    description: 'One decision with two options; each opens a quest, closes the other and leads to its own ending.',
    preview: 'endingPaths',
    apply: insertBranch,
  },
]

// ---------- Guide ----------

export const STORY_GUIDE: ModuleGuide = {
  map: {
    width: 790,
    height: 420,
    nodes: [
      { id: 'overview', label: 'Overview', section: 'overview', x: 10, y: 14 },
      { id: 'structure', label: 'Structure', section: 'structure', x: 220, y: 14 },
      { id: 'acts', label: 'Acts', section: 'acts', x: 430, y: 14 },
      { id: 'world', label: 'World', doc: 'design.world', x: 640, y: 14 },
      { id: 'npc', label: 'NPC System', doc: 'design.npc', x: 10, y: 102 },
      { id: 'characters', label: 'Characters', section: 'characters', x: 220, y: 102 },
      { id: 'questTypes', label: 'Quest types', section: 'questTypes', x: 430, y: 102 },
      { id: 'player', label: 'Player', doc: 'design.player', x: 640, y: 102 },
      { id: 'factions', label: 'Factions', doc: 'design.factions', x: 10, y: 190 },
      { id: 'choices', label: 'Choices', section: 'choices', x: 220, y: 190 },
      { id: 'quests', label: 'Quests', section: 'quests', x: 430, y: 190 },
      { id: 'items', label: 'Items', doc: 'design.items', x: 640, y: 190 },
      { id: 'trade', label: 'Trade', doc: 'design.trade', x: 10, y: 278 },
      { id: 'endings', label: 'Endings', section: 'endings', x: 220, y: 278 },
      { id: 'questGraph', label: 'Dialog sketch', section: 'questGraph', x: 430, y: 278 },
      { id: 'combat', label: 'Combat', doc: 'design.combat', x: 640, y: 278 },
      { id: 'dialogue', label: 'Dialogue style', section: 'dialogue', x: 220, y: 366 },
      { id: 'time', label: 'Time & Weather', doc: 'design.timeWeather', x: 640, y: 366 },
    ],
    edges: [
      { from: 'overview', to: 'structure', label: 'frames' },
      { from: 'structure', to: 'acts', label: 'length' },
      { from: 'world', to: 'acts', label: 'biomes' },
      { from: 'acts', to: 'quests', label: 'act' },
      { from: 'npc', to: 'characters', label: 'archetypes' },
      { from: 'characters', to: 'quests', label: 'gives' },
      { from: 'questTypes', to: 'quests', label: 'type' },
      { from: 'quests', to: 'player', label: 'XP' },
      { from: 'quests', to: 'items', label: 'reward items' },
      { from: 'combat', to: 'quests', label: 'targets' },
      { from: 'quests', to: 'choices', label: 'decisions' },
      { from: 'factions', to: 'choices', label: 'reputation' },
      { from: 'choices', to: 'endings', label: 'lead to' },
      { from: 'factions', to: 'endings', label: 'faction endings' },
      { from: 'quests', to: 'questGraph', label: 'sketch' },
      { from: 'acts', to: 'trade', label: 'act timeline' },
      { from: 'quests', to: 'time', label: 'story triggers' },
      { from: 'characters', to: 'dialogue', label: 'voice' },
    ],
  },
  steps: [
    {
      id: 'overview',
      title: 'Write the core of the story',
      body: 'Background, the main conflict and the island’s secret: the three things every act and quest serves.',
      section: 'overview',
      target: 'field-background',
      done: (p) => filled(form(p, 'overview').background) && filled(form(p, 'overview').conflict) && filled(form(p, 'overview').secret),
    },
    {
      id: 'acts',
      title: 'Lay out the acts',
      body: 'Give each act a start and a length (in-game days by default). Start from a preset and adjust.',
      section: 'acts',
      target: 'examples',
      done: (p) => storyList(p, 'acts').filter((a) => isNum(a.duration)).length >= 2,
      action: { label: 'Pick an act structure…', examples: 'acts' },
    },
    {
      id: 'actDetails',
      title: 'Give each act a biome and a level range',
      body: 'The level range is what Act pacing checks the XP curve against.',
      section: 'acts',
      target: 'view-actPacing',
      done: (p) => storyList(p, 'acts').length > 0 && storyList(p, 'acts').every((a) => a.biome && isNum(a.levelMin) && isNum(a.levelMax)),
    },
    {
      id: 'cast',
      title: 'Add the main cast',
      body: 'Who drives the story? Mark the main characters, and link them to factions and NPC archetypes.',
      section: 'characters',
      target: 'examples',
      done: (p) => storyList(p, 'characters').length >= 3 && storyList(p, 'characters').some((c) => c.importance === 'Main'),
      action: { label: 'Insert a starter cast…', examples: 'characters' },
    },
    {
      id: 'types',
      title: 'Define the quest types',
      body: 'What is each type for, does it repeat, and how generous is it compared with a main quest?',
      section: 'questTypes',
      target: 'add',
      done: (p) => QUEST_TYPES.every((t) => storyList(p, 'questTypes').some((x) => x.type === t)),
      action: { label: 'Create the four quest types', run: createQuestTypes },
    },
    {
      id: 'questline',
      title: 'Write the main questline',
      body: 'Each main quest says which quests it requires. That order is what Quest flow draws.',
      section: 'quests',
      target: 'examples',
      done: (p) => {
        const mains = storyList(p, 'quests').filter((q) => q.type === 'Main')
        return mains.length >= 3 && mains.filter((q) => Array.isArray(q.requires) && q.requires.length).length >= 2
      },
      action: { label: 'Insert a main questline…', examples: 'quests' },
    },
    {
      id: 'flow',
      title: 'Check the quest flow',
      body: 'No loops, no quests that can never start, nothing that needs a later act.',
      section: 'quests',
      target: 'view-questFlow',
      done: (p) => {
        const d = questDeps(p)
        return storyList(p, 'quests').length > 0 && !d.cycles.length && !d.unreachable.length && !d.actInversions.length
      },
    },
    {
      id: 'pacing',
      title: 'Reward the quests and check pacing',
      body: 'Give main quests XP and play time; Act pacing shows whether the player reaches each act’s level range.',
      section: 'acts',
      target: 'view-actPacing',
      done: (p) => {
        const mains = storyList(p, 'quests').filter((q) => q.type === 'Main')
        return mains.length > 0 && mains.every((q) => isNum(q.rewardXp) && isNum(q.estMinutes)) && pacingProblems(p).length === 0
      },
    },
    {
      id: 'endings',
      title: 'Branch the story and reach every ending',
      body: 'Add decisions as options and endings that require them; Ending paths shows which choices keep each ending open.',
      section: 'choices',
      target: 'examples',
      done: (p) => {
        const r = endingReachability(p)
        return r.length > 0 && r.every((x) => x.reachable && !x.empty)
      },
      action: { label: 'Insert a branching decision…', examples: 'choices' },
    },
    {
      id: 'dialogue',
      title: 'Set the dialogue style',
      body: 'Pick the dialogue format and describe the narrative tone, so writers and translators share one voice.',
      section: 'dialogue',
      target: 'field-format',
      done: (p) => filled(form(p, 'dialogue').format) && filled(form(p, 'dialogue').tone),
    },
  ],
  examples: STORY_EXAMPLES,
  concepts: {
    acts: {
      title: 'Pacing an act',
      body: 'Each act has a length and an intended level range. Quest play time should fill a good part of the act, and the XP from quests and other sources should land the player inside the range by the act’s end.',
      diagram: 'actPacing',
    },
    quests: {
      title: 'Quest order from requirements',
      body: 'A quest can start once every quest it requires is done. Following “requires” backwards gives the main questline; a loop means none of its quests can start.',
      diagram: 'questChain',
    },
    choices: {
      title: 'Decisions, options and endings',
      body: 'Options that share a decision name exclude each other. An option can open or close quests; an ending that needs two options of one decision can never be reached.',
      diagram: 'choiceBranch',
    },
    questTypes: {
      title: 'Reward budget',
      body: 'Every act hands out XP, money, items and reputation through its quests. Types scale the rewards: a tavern job pays a fraction of a main quest. Reward budget adds it all up per act.',
      diagram: 'rewardBudget',
    },
  },
  empty: {
    acts: 'Acts are the big chapters of the story, each with a length, a biome and a level range.',
    characters: 'Characters are the named people of the story: mentors, rivals, faction leaders.',
    questTypes: 'Quest types say what main, faction, tavern and event quests are for and how generous they are.',
    quests: 'Quests are what the player does. Requirements order them; rewards feed XP, money and reputation.',
    choices: 'Each entry is one option of a decision. The player picks one option per decision.',
    endings: 'Endings are where the story can finish, and what it takes to get there.',
  },
}
