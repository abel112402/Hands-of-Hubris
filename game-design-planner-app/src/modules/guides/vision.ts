import type { GuideExample, ModuleGuide } from '../../core/guides/types'
import { makeId } from '../../core/model/project'
import type { Entity, Project } from '../../core/model/types'
import { pillarList, PILLAR_RANGE, pitchCheck, scopeList, scopeWithoutPillar, uspList, uspWithoutPillar, VISION_DOC } from '../../core/vision'

const filled = (v: unknown) => typeof v === 'string' && v.trim() !== ''
const formText = (p: Project, section: string, key: string) => String(p.documents[VISION_DOC]?.data[section]?.[key] ?? '')

/** The collection to add to, created if the document has none yet (a missing doc is left alone). */
const ensureList = (p: Project, section: string): Entity[] => {
  const d = p.documents[VISION_DOC]?.data
  if (!d) return []
  if (!Array.isArray(d[section])) d[section] = []
  return d[section]
}

/** Adds the rows that are not there yet (matched by name); an existing row only gets blank fields filled. */
function addMissing(list: Entity[], rows: Record<string, unknown>[]) {
  for (const r of rows) {
    const existing = list.find((e) => String(e.name ?? '').toLowerCase() === String(r.name).toLowerCase())
    if (existing) {
      for (const [k, v] of Object.entries(r)) if (existing[k] === undefined || existing[k] === '') existing[k] = v
    } else list.push({ id: makeId(), ...r })
  }
}

type PillarSpec = { name: string; rationale: string; decisionTest: string; example: string; nonExample: string; color: string }

const PILLAR_SETS: Record<string, PillarSpec[]> = {
  industry: [
    {
      name: 'Industry meets magic',
      rationale: 'The contrast between steam-age machinery and old magic is what makes the world distinct.',
      decisionTest: 'If a feature could exist in a plain factory game or a plain fantasy game, it needs a hook that uses both.',
      example: 'A boiler that runs faster when fed mana crystals.',
      nonExample: 'A generic conveyor belt with no magical twist.',
      color: '#c98b3a',
    },
    {
      name: 'Meaningful logistics',
      rationale: 'Moving goods between people and buildings is the main source of decisions.',
      decisionTest: 'If a feature adds busywork without a meaningful choice, cut it.',
      example: 'Choosing which road to upgrade when two districts starve.',
      nonExample: 'Clicking every cart by hand to start a delivery.',
      color: '#4a90c2',
    },
    {
      name: 'A town that feels alive',
      rationale: 'Players should care about the people they supply, not just the numbers.',
      decisionTest: 'A system must show up in what townspeople say, need or do, or it stays out of the first release.',
      example: 'A baker who leaves town when bread runs short.',
      nonExample: 'A hidden multiplier no one can see or react to.',
      color: '#7ab87a',
    },
  ],
  cozy: [
    {
      name: 'Calm daily rhythm',
      rationale: 'A readable day gives the player a comfortable routine.',
      decisionTest: 'If a feature creates time pressure the player cannot pause, it does not fit.',
      example: 'A morning checklist that takes a few minutes.',
      nonExample: 'A timer that fails the day if you look away.',
      color: '#e0a96d',
    },
    {
      name: 'Gentle mastery',
      rationale: 'Skill grows through small, forgiving improvements.',
      decisionTest: 'Mistakes should cost time or a little money, never the whole save.',
      example: 'A crop that wilts but can be replanted.',
      nonExample: 'Permanent loss of a character for one error.',
      color: '#8fb8de',
    },
    {
      name: 'Relationships over numbers',
      rationale: 'Characters are the reason to return each day.',
      decisionTest: 'Every new system should give a character something new to say or do.',
      example: 'A neighbour comments on a new bridge.',
      nonExample: 'A resource that has no link to any character.',
      color: '#d98bb0',
    },
  ],
}

const pillarsExample = (id: string, title: string, description: string): GuideExample => ({
  id,
  section: 'pillars',
  title,
  description,
  preview: 'visionList',
  apply: (p) => addMissing(ensureList(p, 'pillars'), PILLAR_SETS[id]),
})

const MVP_SCOPE = [
  { name: 'Core production loop', bucket: 'In MVP', mvpRationale: 'Without it there is nothing to test.', acceptance: 'A player can produce, move and consume one resource end to end.' },
  { name: 'Townspeople with needs', bucket: 'In MVP', mvpRationale: 'Gives the numbers a human reason.', acceptance: 'Unmet needs change what a townsperson does.' },
  { name: 'Save and load', bucket: 'In MVP', mvpRationale: 'Needed for any play session longer than a few minutes.', acceptance: 'A saved town loads with identical state.' },
  { name: 'Second faction', bucket: 'Later', mvpRationale: 'The first faction proves the loop; more can follow.' },
  { name: 'Multiplayer', bucket: 'Out of scope', mvpRationale: 'Too large for the first release.' },
]

const scopeExample: GuideExample = {
  id: 'mvp',
  section: 'scope',
  title: 'MVP starter scope',
  description: 'Three things the first release needs, one that can wait and one that is out. Rename them, then tag each with the pillars it serves.',
  preview: 'visionList',
  apply: (p) => addMissing(ensureList(p, 'scope'), MVP_SCOPE),
}

const USPS = [
  { name: 'Magic powers the machines', description: 'Every production chain can be boosted by a magical input.', playerBenefit: 'Optimizing feels like discovery, not just arithmetic.', differentiator: 'Factory games have no magic; fantasy games have no production chains.' },
  { name: 'A town that reacts to your choices', description: 'Townspeople answer to what you build and supply.', playerBenefit: 'Decisions have visible, human consequences.', differentiator: 'Reference games show the effect in numbers, not in people.' },
]

const uspExample: GuideExample = {
  id: 'usps',
  section: 'usps',
  title: 'Two starter USPs',
  description: 'Each states what the player gains and how it differs from a reference. Rewrite them for your game, then back them with pillars.',
  preview: 'visionList',
  apply: (p) => addMissing(ensureList(p, 'usps'), USPS),
}

const mvpLoose = (p: Project) => scopeWithoutPillar(p).filter((e) => e.bucket === 'In MVP')

export const VISION_GUIDE: ModuleGuide = {
  map: {
    width: 800,
    height: 160,
    nodes: [
      { id: 'usps', label: 'USPs', section: 'usps', x: 10, y: 14 },
      { id: 'pitch', label: 'Pitch', section: 'pitch', x: 10, y: 102 },
      { id: 'pillars', label: 'Design pillars', section: 'pillars', x: 220, y: 58 },
      { id: 'scope', label: 'Scope', section: 'scope', x: 430, y: 14 },
      { id: 'loop', label: 'Core Loop', doc: 'design.coreLoop', x: 430, y: 102 },
      { id: 'roadmap', label: 'Roadmap', doc: 'overview.roadmap', x: 640, y: 14 },
    ],
    edges: [
      { from: 'pitch', to: 'pillars', label: 'frames' },
      { from: 'usps', to: 'pillars', label: 'backed by' },
      { from: 'pillars', to: 'scope', label: 'filter' },
      { from: 'pillars', to: 'loop', label: 'shape' },
      { from: 'scope', to: 'roadmap', label: 'MVP sets phases' },
    ],
  },
  steps: [
    {
      id: 'pitch',
      title: 'Draft the pitch',
      body: 'One sentence: who plays, what they do, and why. A rough draft is fine; you will refine it last.',
      section: 'pitch',
      target: 'field-pitch',
      done: (p) => filled(formText(p, 'pitch', 'pitch')),
    },
    {
      id: 'references',
      title: 'Name the reference games',
      body: 'Two to four concrete games, and what you take from them and what you do differently.',
      section: 'references',
      target: 'field-genres',
      done: (p) => filled(formText(p, 'references', 'genres')),
    },
    {
      id: 'audience',
      title: 'Describe the audience',
      body: 'Who it is for, how experienced they are and what platforms they play on.',
      section: 'audience',
      target: 'field-audience',
      done: (p) => filled(formText(p, 'audience', 'audience')),
    },
    {
      id: 'pillars',
      title: `Set ${PILLAR_RANGE[0]}–${PILLAR_RANGE[1]} design pillars`,
      body: 'Principles that decide what goes in and what stays out. Too few is vague; too many stops guiding choices.',
      section: 'pillars',
      target: 'add',
      done: (p) => pillarList(p).length >= PILLAR_RANGE[0] && pillarList(p).length <= PILLAR_RANGE[1],
      action: { label: 'Insert example…', examples: 'pillars' },
    },
    {
      id: 'decisionTest',
      title: 'Give every pillar a decision test',
      body: 'A rule that can reject a feature, e.g. “If it adds busywork without a meaningful choice, cut it.”',
      section: 'pillars',
      target: 'field-decisionTest',
      done: (p) => pillarList(p).length > 0 && pillarList(p).every((e) => filled(e.decisionTest)),
    },
    {
      id: 'usps',
      title: 'Add unique selling points',
      body: 'Each one says what the player gains and how it differs from the reference games.',
      section: 'usps',
      target: 'add',
      done: (p) => uspList(p).length > 0 && uspList(p).every((e) => filled(e.playerBenefit)),
      action: { label: 'Insert example…', examples: 'usps' },
    },
    {
      id: 'uspPillars',
      title: 'Back each USP with a pillar',
      body: 'A selling point no pillar supports may not survive production.',
      section: 'usps',
      target: 'field-pillars',
      done: (p) => uspList(p).length > 0 && uspWithoutPillar(p).length === 0,
    },
    {
      id: 'scope',
      title: 'Sort features into scope buckets',
      body: 'In MVP, Later, or Out of scope. Decide for every item, even if the answer is “not now”.',
      section: 'scope',
      target: 'add',
      done: (p) => scopeList(p).length > 0 && scopeList(p).every((e) => filled(e.bucket)),
      action: { label: 'Insert example…', examples: 'scope' },
    },
    {
      id: 'scopePillars',
      title: 'Tie every MVP item to a pillar',
      body: 'Use the Pillar matrix: click a cell to link an item to a pillar. An MVP item that serves no pillar is a candidate to cut.',
      section: 'scope',
      target: 'view-pillarMatrix',
      done: (p) => pillarList(p).length > 0 && scopeList(p).some((e) => e.bucket === 'In MVP') && mvpLoose(p).length === 0,
    },
    {
      id: 'refine',
      title: 'Refine the pitch last',
      body: 'Now that the pillars and scope are clear, check that the pitch still describes the game. The Readiness view checks its shape.',
      section: 'pitch',
      target: 'field-pitch',
      done: (p) => {
        const t = formText(p, 'pitch', 'pitch')
        return filled(t) && pitchCheck(t).problems.length === 0 && pillarList(p).length > 0
      },
    },
  ],
  examples: [
    pillarsExample('industry', 'Industry-and-magic pillars', 'Three pillars for a production game that mixes steam-age machinery with magic: the contrast, meaningful logistics and a living town.'),
    pillarsExample('cozy', 'Cozy-sim pillars', 'Three pillars for a calm, forgiving management game: daily rhythm, gentle mastery and relationships.'),
    scopeExample,
    uspExample,
  ],
  concepts: {
    pillars: {
      title: 'What a pillar is for',
      body: 'A pillar is a rule that can say no. Test a feature against each pillar; if it serves none, it is a candidate to cut. Keep to 3–5 so each one stays sharp.',
      diagram: 'pillarTest',
    },
    scope: {
      title: 'Scope buckets',
      body: 'In MVP is what the first release cannot ship without. Later is wanted but can wait; Out of scope is a decision not to build. Tag items with pillars so the MVP shows every pillar at least once.',
      diagram: 'scopeBuckets',
    },
  },
  empty: {
    usps: 'The few things that make this game worth choosing over its references, each with a player benefit.',
    pillars: 'The 3–5 principles that decide what goes into the game and what stays out.',
    scope: 'Every feature sorted into In MVP, Later or Out of scope, so the first release stays achievable.',
  },
}
