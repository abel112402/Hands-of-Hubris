import type { GuideExample, ModuleGuide } from '../../core/guides/types'
import { makeId } from '../../core/model/project'
import type { Entity, Project } from '../../core/model/types'
import { NPC_DOC, npcList, shareTotal, statVar } from '../../core/npc'
import { TOWN_DOC } from '../../core/town'

const data = (p: Project): Record<string, any> => {
  if (!p.documents[NPC_DOC]) p.documents[NPC_DOC] = { moduleVersion: 2, data: {} }
  return p.documents[NPC_DOC].data
}
const ensureList = (p: Project, section: string): Entity[] => {
  const d = data(p)
  if (!Array.isArray(d[section])) d[section] = []
  return d[section]
}
const ensureForm = (p: Project, section: string): Record<string, any> => {
  const d = data(p)
  if (!d[section] || typeof d[section] !== 'object' || Array.isArray(d[section])) d[section] = {}
  return d[section]
}
/** Id of a catalog item by label, adding it when missing. */
const itemId = (p: Project, catalog: string, catalogLabel: string, label: string) => {
  let c = p.registry.catalogs[catalog]
  if (!c) c = p.registry.catalogs[catalog] = { label: catalogLabel, items: [] }
  const found = c.items.find((i) => i.label.toLowerCase() === label.toLowerCase())
  if (found) return found.id
  const id = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  c.items.push({ id, label })
  return id
}
const stat = (p: Project, label: string) => itemId(p, 'npcStats', 'NPC stats', label)
const need = (p: Project, label: string) => itemId(p, 'needs', 'NPC needs', label)
const prof = (p: Project, label: string) => itemId(p, 'professions', 'NPC professions', label)
const townBuildings = (p: Project): Entity[] => {
  const b = p.documents[TOWN_DOC]?.data.buildings
  return Array.isArray(b) ? b : []
}

const castExample: GuideExample = {
  id: 'npc-village-cast',
  section: 'archetypes',
  title: 'Village cast',
  description: 'Farmer, builder, innkeeper and merchant with stats, daily needs and shares that add up to 100%.',
  preview: 'npcPopulation',
  apply: (p) => {
    const [str, int, spd, kind, hp] = ['Strength', 'Intelligence', 'Speed', 'Kindness', 'Health'].map((s) => stat(p, s))
    const [food, drink, housing] = ['Food', 'Drink', 'Housing'].map((n) => need(p, n))
    const make = (name: string, profession: string, share: number, stats: number[], needs: number[]) => ({
      id: makeId(),
      name,
      profession: prof(p, profession),
      share,
      stats: { [str]: stats[0], [int]: stats[1], [spd]: stats[2], [kind]: stats[3], [hp]: stats[4] },
      needs: { [food]: needs[0], [drink]: needs[1], [housing]: 1 },
    })
    ensureList(p, 'archetypes').push(
      make('Farmer', 'Farmer', 40, [6, 3, 4, 6, 7], [3, 2]),
      make('Builder', 'Builder', 30, [8, 4, 5, 4, 7], [3, 3]),
      make('Innkeeper', 'Innkeeper', 15, [4, 6, 4, 8, 5], [2, 2]),
      make('Merchant', 'Merchant', 15, [3, 8, 6, 5, 5], [2, 2]),
    )
  },
}

const lifespanExample: GuideExample = {
  id: 'npc-human-lifespan',
  section: 'lifeStages',
  title: 'Child, adult, elder',
  description: 'Three stages covering 0 to the maximum age; adults work, children need less, elders are wiser but weaker.',
  preview: 'npcLifespan',
  apply: (p) => {
    const max = typeof data(p).overview?.maxAge === 'number' ? data(p).overview.maxAge : 100
    const [str, int] = [stat(p, 'Strength'), stat(p, 'Intelligence')]
    ensureList(p, 'lifeStages').push(
      { id: makeId(), name: 'Child', ageFrom: 0, ageTo: Math.round(max * 0.14), canWork: false, needModifier: -40, statModifiers: { [str]: -50 } },
      { id: makeId(), name: 'Adult', ageFrom: Math.round(max * 0.14) + 1, ageTo: Math.round(max * 0.6), canWork: true, needModifier: 0, statModifiers: {} },
      { id: makeId(), name: 'Elder', ageFrom: Math.round(max * 0.6) + 1, canWork: false, needModifier: -10, statModifiers: { [str]: -30, [int]: 20 } },
    )
  },
}

const needsExample: GuideExample = {
  id: 'npc-basic-needs',
  section: 'needRules',
  title: 'Food, drink and housing',
  description: 'Food and drink come from the town stock; housing comes from Town buildings that look like homes. Each has a grace period and a consequence.',
  preview: 'npcNeeds',
  apply: (p) => {
    const resource = (l: string) => itemId(p, 'resources', 'Resources', l)
    const homes = townBuildings(p).filter((b) => /house|home|hut|cottage|dorm|housing/i.test(String(b.name ?? '')) || b.category === 'Housing').map((b) => b.id)
    ensureList(p, 'needRules').push(
      { id: makeId(), name: 'Eat', need: need(p, 'Food'), kind: 'Basic', resource: resource('Food'), graceDays: 2, consequence: 'Morale loss', moraleImpact: -5 },
      { id: makeId(), name: 'Drink', need: need(p, 'Drink'), kind: 'Basic', resource: resource('Drink'), graceDays: 1, consequence: 'Dies', moraleImpact: -10 },
      { id: makeId(), name: 'Shelter', need: need(p, 'Housing'), kind: 'Basic', buildings: homes, graceDays: 5, consequence: 'Leaves town', moraleImpact: -3 },
    )
  },
}

const jobsExample: GuideExample = {
  id: 'npc-jobs-for-cast',
  section: 'jobs',
  title: 'A job per profession',
  description: 'One job for every profession your archetypes use, with a strength-based efficiency and the Town buildings that employ that profession.',
  preview: 'npcWorkforce',
  apply: (p) => {
    const jobs = ensureList(p, 'jobs')
    const have = new Set(jobs.map((j) => j.profession))
    const labels = new Map((p.registry.catalogs.professions?.items ?? []).map((i) => [i.id, i.label]))
    const used = [...new Set(npcList(p, 'archetypes').map((a) => a.profession).filter(Boolean))] as string[]
    const str = stat(p, 'Strength')
    for (const id of used.length ? used : [prof(p, 'Farmer'), prof(p, 'Builder')]) {
      if (have.has(id)) continue
      const label = labels.get(id) ?? id
      jobs.push({
        id: makeId(),
        name: label,
        profession: id,
        buildings: townBuildings(p).filter((b) => Array.isArray(b.workers) && b.workers.includes(id)).map((b) => b.id),
        keyStats: [str],
        efficiency: `0.5 + ${statVar(str)} / 20`,
        wage: 2,
      })
    }
  },
}

const LADDER: [string, number, number][] = [
  ['Enemy', -100, -51],
  ['Disliked', -50, -11],
  ['Neutral', -10, 19],
  ['Friend', 20, 59],
  ['Close', 60, 100],
]
const ensureLadder = (p: Project) => {
  const levels = ensureList(p, 'relationLevels')
  const rel = ensureForm(p, 'relationships')
  const lo = typeof rel.scaleMin === 'number' ? rel.scaleMin : -100
  const hi = typeof rel.scaleMax === 'number' ? rel.scaleMax : 100
  const scale = (v: number) => Math.round(lo + ((v + 100) / 200) * (hi - lo))
  for (const [name, min, max] of LADDER) if (!levels.some((l) => l.name === name)) levels.push({ id: makeId(), name, min: scale(min), max: scale(max) })
  if (typeof rel.start !== 'number') rel.start = scale(0)
  return (name: string) => levels.find((l) => l.name === name)!.id
}

const ladderExample: GuideExample = {
  id: 'npc-affinity-ladder',
  section: 'relationLevels',
  title: 'Five-step affinity ladder',
  description: 'Enemy, disliked, neutral, friend and close, covering the whole affinity scale without gaps; starting affinity at the neutral middle.',
  preview: 'npcRelations',
  apply: (p) => void ensureLadder(p),
}

const bondsExample: GuideExample = {
  id: 'npc-bond-set',
  section: 'bonds',
  title: 'Friendship to marriage',
  description: 'Friendship, rivalry, romance and an exclusive marriage, each pinned to the relationship level it requires (the ladder is added if missing).',
  preview: 'npcRelations',
  apply: (p) => {
    const level = ensureLadder(p)
    ensureList(p, 'bonds').push(
      { id: makeId(), name: 'Friends', kind: 'Friendship', requiresLevel: level('Friend'), effects: '+5% work speed when working together.' },
      { id: makeId(), name: 'Rivals', kind: 'Rivalry', requiresLevel: level('Disliked'), effects: 'Compete for the same job; may start a feud.' },
      { id: makeId(), name: 'Sweethearts', kind: 'Romance', requiresLevel: level('Close'), effects: 'Shared leisure lifts morale.' },
      { id: makeId(), name: 'Married', kind: 'Marriage', requiresLevel: level('Close'), exclusive: true, effects: 'Share a home; children become possible.' },
    )
  },
}

const eventsExample: GuideExample = {
  id: 'npc-village-events',
  section: 'events',
  title: 'Village life events',
  description: 'A wedding, a birth, an illness, a traveller and a feud with chances, periods and cooldowns so the Event odds view can estimate them per year.',
  preview: 'npcEvents',
  apply: (p) => {
    ensureList(p, 'events').push(
      { id: makeId(), name: 'Wedding', category: 'Marriage', chance: 20, period: 'season', cooldown: 60, moraleEffect: 10, trigger: 'Two NPCs with the Sweethearts bond.' },
      { id: makeId(), name: 'Birth', category: 'Birth', chance: 15, period: 'season', cooldown: 90, moraleEffect: 5 },
      { id: makeId(), name: 'Fever', category: 'Illness', chance: 2, period: 'week', cooldown: 14, moraleEffect: -5, effect: 'Cannot work for 3 days.' },
      { id: makeId(), name: 'Traveller arrives', category: 'Arrival', chance: 3, period: 'day', cooldown: 10, effect: 'A new NPC may join the town.' },
      { id: makeId(), name: 'Feud', category: 'Feud', chance: 10, period: 'season', moraleEffect: -8, trigger: 'Two rivals share a workplace.' },
    )
  },
}

export const NPC_GUIDE: ModuleGuide = {
  map: {
    width: 1050,
    height: 330,
    nodes: [
      { id: 'overview', label: 'Overview & scales', x: 30, y: 35, section: 'overview' },
      { id: 'statRules', label: 'Stats', x: 240, y: 35, section: 'statRules' },
      { id: 'archetypes', label: 'Archetypes', x: 450, y: 35, section: 'archetypes' },
      { id: 'jobs', label: 'Work & professions', x: 660, y: 35, section: 'jobs' },
      { id: 'routine', label: 'Daily routine', x: 870, y: 35, section: 'routine' },
      { id: 'lifeStages', label: 'Life stages', x: 30, y: 145, section: 'lifeStages' },
      { id: 'lifecycle', label: 'Life cycle', x: 240, y: 145, section: 'lifecycle' },
      { id: 'needRules', label: 'Needs', x: 450, y: 145, section: 'needRules' },
      { id: 'scenarios', label: 'Population scenarios', x: 660, y: 145, section: 'scenarios' },
      { id: 'town', label: 'Town Management', x: 870, y: 145, doc: TOWN_DOC },
      { id: 'relationLevels', label: 'Relationship levels', x: 30, y: 255, section: 'relationLevels' },
      { id: 'bonds', label: 'Bonds', x: 240, y: 255, section: 'bonds' },
      { id: 'events', label: 'Random events', x: 450, y: 255, section: 'events' },
      { id: 'factions', label: 'Factions & Diplomacy', x: 660, y: 255, doc: 'design.factions' },
      { id: 'difficulty', label: 'Difficulty', x: 870, y: 255, doc: 'design.difficulty' },
    ],
    edges: [
      { from: 'overview', to: 'statRules', label: 'scales' },
      { from: 'statRules', to: 'archetypes', label: 'formulas' },
      { from: 'archetypes', to: 'jobs', label: 'profession' },
      { from: 'jobs', to: 'routine', label: 'daily plan' },
      { from: 'jobs', to: 'town', label: 'work in' },
      { from: 'lifeStages', to: 'lifecycle', label: 'states' },
      { from: 'lifeStages', to: 'archetypes', label: 'age ×' },
      { from: 'archetypes', to: 'needRules', label: 'needs / day' },
      { from: 'needRules', to: 'scenarios', label: 'balance' },
      { from: 'scenarios', to: 'town', label: 'vs supply' },
      { from: 'relationLevels', to: 'bonds', label: 'unlock' },
      { from: 'bonds', to: 'events', label: 'required by' },
      { from: 'events', to: 'lifecycle', label: 'on event' },
      { from: 'archetypes', to: 'factions', label: 'belong to' },
      { from: 'difficulty', to: 'scenarios', label: 'need ×' },
    ],
  },
  steps: [
    { id: 'scales', title: 'Set the scales', body: 'Choose the stat range and the maximum age. They drive the stat inputs, the radar, the lifespan and the stat checks.', section: 'overview', target: 'field-statMax', done: (p) => typeof data(p).overview?.statMax === 'number' || typeof data(p).overview?.maxAge === 'number' },
    { id: 'stats', title: 'Describe the stats', body: 'Add one rule per stat: what it does and an optional formula. The Preview tab evaluates every formula for every archetype.', section: 'statRules', target: 'add', done: (p) => npcList(p, 'statRules').length > 0 },
    { id: 'archetypes', title: 'Create the cast', body: 'Add the kinds of NPCs in your town with a profession, stats and daily needs.', section: 'archetypes', target: 'add', done: (p) => npcList(p, 'archetypes').length > 0, action: { label: 'Insert a village cast', examples: 'archetypes' } },
    { id: 'mix', title: 'Balance the population mix', body: 'The Population tab stacks archetype shares; aim for 100%. Shares also weight generation and the needs demand.', section: 'archetypes', target: 'view-npcPopulation', done: (p) => Math.abs((shareTotal(p) ?? 0) - 100) <= 0.5 },
    { id: 'needs', title: 'Chain every need', body: 'For each need say what satisfies it and what happens when it goes unmet. The Need chain tab shows the gaps.', section: 'needRules', target: 'view-npcNeedChain', done: (p) => npcList(p, 'needRules').some((r) => r.consequence && (r.resource || (Array.isArray(r.buildings) && r.buildings.length))), action: { label: 'Insert basic needs', examples: 'needRules' } },
    { id: 'lifespan', title: 'Lay out the lifespan', body: 'Add life stages from birth to the maximum age. The Lifespan tab shows gaps, overlaps, working age and modifiers.', section: 'lifeStages', target: 'view-npcLifespan', done: (p) => npcList(p, 'lifeStages').length > 0, action: { label: 'Insert child, adult, elder', examples: 'lifeStages' } },
    { id: 'lifecycle', title: 'Draw the life cycle', body: 'Connect a Start (birth, arrival) through states to an End (death, leaving). Tag states with life stages.', section: 'lifecycle', done: (p) => (data(p).lifecycle?.nodes ?? []).some((n: { kind?: string }) => n.kind === 'Start') && (data(p).lifecycle?.nodes ?? []).some((n: { kind?: string }) => n.kind === 'End') },
    { id: 'jobs', title: 'Give professions work', body: 'Add a job per profession and place it in Town buildings. The Workforce map highlights buildings that do not employ the profession.', section: 'jobs', target: 'view-npcWorkforce', done: (p) => npcList(p, 'jobs').length > 0, action: { label: 'Insert jobs for the cast', examples: 'jobs' } },
    { id: 'relations', title: 'Build the relationship ladder', body: 'Split the affinity scale into levels, then pin bonds to the level they need. The Bond ladder tab draws both.', section: 'relationLevels', target: 'add', done: (p) => npcList(p, 'relationLevels').length > 0 && npcList(p, 'bonds').length > 0, action: { label: 'Insert an affinity ladder', examples: 'relationLevels' } },
    { id: 'events', title: 'Plan life events', body: 'Give each event a chance, a period and a cooldown. The Event odds tab estimates how often each happens per year.', section: 'events', target: 'view-npcEventOdds', done: (p) => npcList(p, 'events').some((e) => typeof e.chance === 'number'), action: { label: 'Insert village events', examples: 'events' } },
  ],
  examples: [castExample, needsExample, lifespanExample, jobsExample, ladderExample, bondsExample, eventsExample],
  concepts: {
    archetypes: { title: 'Archetypes are templates', body: 'An archetype is the average NPC of one kind. Generation adds the stat variance; the share says how common it is and weights the population’s needs.', diagram: 'shareMix' },
    needRules: { title: 'A need is a chain', body: 'Demand per NPC per day meets a supply (a stock resource or places in buildings). If it stays unmet past the grace period, the consequence kicks in.', diagram: 'needChain' },
    lifeStages: { title: 'Stages tile the lifespan', body: 'Stages should cover every age from 0 to the maximum once. Working stages decide how much of a lifetime an NPC is part of the workforce.', diagram: 'lifespanBands' },
    jobs: { title: 'Profession links people to places', body: 'An archetype has a profession, a job describes that profession’s work, and the job happens in Town buildings that list the profession as workers.', diagram: 'workforceFlow' },
    bonds: { title: 'Bonds sit on the affinity ladder', body: 'Affinity moves along one scale; levels name its bands. A bond can only form once a pair reaches the level it requires.', diagram: 'affinityLadder' },
    events: { title: 'Chance × rolls, capped by cooldown', body: 'A 2% daily chance is about 7 times a year; a cooldown of 30 days caps it at 12. Use the yearly rate to keep life events noticeable but not constant.', diagram: 'eventOdds' },
  },
  empty: {
    statRules: 'One rule per stat says what the stat does and how it develops.',
    archetypes: 'Archetypes are the kinds of NPCs in the town, with stats, needs and a population share.',
    needRules: 'Need rules say what satisfies each need and what happens when it is not met.',
    lifeStages: 'Life stages split the lifespan into phases with their own work rules and modifiers.',
    jobs: 'Jobs describe what each profession does, where, and how stats affect efficiency.',
    relationLevels: 'Levels name bands of the affinity scale, from enemies to close friends.',
    bonds: 'Bonds are named relationships between two NPCs, such as friendship or marriage.',
    events: 'Random events bring life to the town: weddings, births, illness, arrivals and feuds.',
    scenarios: 'Scenarios test a population mix against what the town can supply.',
  },
}
