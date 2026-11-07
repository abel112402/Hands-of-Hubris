import { actionEffect, actionsOf, analyzeRanges, DIPLOMACY_DOC, factionsOf, graphDisagreements, levelsOf, markProblems, relationOf, scaleOf, standingMarks } from '../../core/diplomacy'
import { factionFootprints, unlinkedFactions } from '../../core/diplomacyFootprint'
import type { GuideExample, ModuleGuide } from '../../core/guides/types'
import { makeId } from '../../core/model/project'
import type { Entity, Project } from '../../core/model/types'

const filled = (v: unknown) => typeof v === 'string' && v.trim() !== ''
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const data = (p: Project): Record<string, any> | undefined => p.documents[DIPLOMACY_DOC]?.data
const sameName = (list: Entity[], name: string) => list.some((e) => String(e.name ?? '').trim().toLowerCase() === name.toLowerCase())

/** Every ordered pair of different factions has a matrix value. */
const matrixComplete = (p: Project) => {
  const fs = factionsOf(p)
  return fs.length >= 2 && fs.every((a) => fs.every((b) => a.id === b.id || relationOf(p, a.id, b.id) !== undefined))
}

const levelsClean = (p: Project) => {
  const a = analyzeRanges(levelsOf(p), scaleOf(p))
  return a.rows.length >= 2 && a.unset.length === 0 && !a.gapAtBottom && !a.gapAtTop && a.rows.every((r) => !r.overlaps && !r.gapBefore)
}

const FACTIONS = [
  { name: 'Iron Crown', color: '#4f9cf9', goals: 'Order and taxes: keep the realm whole under one throne.', capital: 'Highmarch', playstyle: 'Heavy armour, discipline, fortifications.' },
  { name: 'Free Guilds', color: '#f2c94c', goals: 'Profit and open roads; no lord above the contract.', capital: 'Saltgate', playstyle: 'Trade, crafting, hired help.' },
  { name: 'Old Faith', color: '#d86be0', goals: 'Restore the old rites and punish the hubris that broke the world.', capital: 'The Cloister', playstyle: 'Healing, wards, rituals.' },
  { name: 'Ash Clans', color: '#f97b4f', goals: 'Survive the wastes and take back the lowlands.', capital: 'Cinder Hold', playstyle: 'Raids, stealth, scavenging.' },
]

const factionsExample: GuideExample = {
  id: 'factions',
  section: 'factions',
  title: 'Four rival factions',
  description: 'A crown, a guild league, a religious order and raiders, each with a colour, goals, capital and playstyle. Factions with the same name are skipped.',
  preview: 'diplomacy',
  apply: (p) => {
    const d = data(p)
    if (!d) return
    const list: Entity[] = (d.factions ??= [])
    for (const f of FACTIONS) if (!sameName(list, f.name)) list.push({ id: makeId(), ...f })
  },
}

/**
 * Two blocs by position (1st and 3rd vs 2nd and 4th, …): factions in the same bloc are friendly, rivals hostile,
 * with a slightly cooler reply in the reverse direction. Only empty cells are filled.
 */
const rivalryExample: GuideExample = {
  id: 'rivalry',
  section: 'relations',
  title: 'Two rival blocs',
  description: 'Factions alternate between two blocs: friends at about +60, rivals at about −50, with one direction a little cooler. Only empty cells are filled.',
  preview: 'diplomacy',
  apply: (p) => {
    const d = data(p)
    if (!d) return
    const fs = factionsOf(p)
    const [lo, hi] = scaleOf(p)
    const scale = (hi - lo) / 200
    const cells = ((d.relations ??= { cells: {} }).cells ??= {})
    fs.forEach((a, i) =>
      fs.forEach((b, j) => {
        if (i === j || isNum(cells[`${a.id}|${b.id}`])) return
        const same = i % 2 === j % 2
        const base = same ? 60 : -50
        const cooler = i > j ? -5 : 0
        cells[`${a.id}|${b.id}`] = Math.round((base + cooler) * scale + (lo + hi) / 2)
      }),
    )
  },
}

const LEVELS = [
  { name: 'Hostile', consequences: 'Attacked on sight; capital closed; their quests unavailable.' },
  { name: 'Unfriendly', consequences: 'Higher prices; guards watch you; no faction quests.' },
  { name: 'Neutral', consequences: 'Normal prices and access; basic quests.' },
  { name: 'Friendly', consequences: 'Discounts; faction quests and some unlocks.' },
  { name: 'Allied', consequences: 'Best prices, elite unlocks, help in battles.' },
]

/** Five levels splitting the scale evenly. Levels whose name exists only get empty consequences filled. */
const levelsExample: GuideExample = {
  id: 'levels',
  section: 'thresholds',
  title: 'Five relationship levels',
  description: 'Hostile, Unfriendly, Neutral, Friendly and Allied, splitting the scale evenly, each with consequences for trade, attacks and quests.',
  preview: 'diplomacy',
  apply: (p) => {
    const d = data(p)
    if (!d) return
    const [lo, hi] = scaleOf(p)
    const list: Entity[] = (d.thresholds ??= [])
    LEVELS.forEach((l, i) => {
      const existing = list.find((e) => String(e.name ?? '').trim().toLowerCase() === l.name.toLowerCase())
      if (existing) {
        if (!filled(existing.consequences)) existing.consequences = l.consequences
        return
      }
      list.push({ id: makeId(), name: l.name, min: Math.round(lo + ((hi - lo + 1) * i) / LEVELS.length), consequences: l.consequences })
    })
  },
}

/**
 * One “Aid” action per faction: +15 with it, −10 with its enemies and +5 with its allies (by the matrix).
 * Actions with the same name are skipped.
 */
const actionsExample: GuideExample = {
  id: 'actions',
  section: 'actions',
  title: 'Aid each faction',
  description: 'One action per faction: +15 with that faction, +5 with its allies and −10 with its enemies, read from the matrix. Try a sequence in the Simulator.',
  preview: 'diplomacy',
  apply: (p) => {
    const d = data(p)
    if (!d) return
    const marks = standingMarks(p)
    const list: Entity[] = (d.actions ??= [])
    for (const f of factionsOf(p)) {
      const name = `Aid ${f.name}`
      if (sameName(list, name)) continue
      const spillover: Record<string, number> = {}
      for (const o of factionsOf(p)) {
        if (o.id === f.id) continue
        const v = relationOf(p, o.id, f.id)
        if (v === undefined) continue
        if (v <= marks.enemyAt) spillover[o.id] = -10
        else if (v >= marks.allyAt) spillover[o.id] = 5
      }
      list.push({ id: makeId(), name, faction: f.id, effectOnFaction: 15, spillover, spilloverDefault: 0, spilloverWhy: `Rivals of ${f.name} resent the help; its allies approve.` })
    }
  },
}

export const DIPLOMACY_GUIDE: ModuleGuide = {
  map: {
    width: 800,
    height: 200,
    nodes: [
      { id: 'overview', label: 'Overview & scale', section: 'overview', x: 10, y: 14 },
      { id: 'factions', label: 'Factions', section: 'factions', x: 10, y: 120 },
      { id: 'relations', label: 'Relationship matrix', section: 'relations', x: 220, y: 14 },
      { id: 'graph', label: 'Relationship graph', section: 'relationGraph', x: 220, y: 80 },
      { id: 'endings', label: 'Endings', section: 'endings', x: 220, y: 146 },
      { id: 'actions', label: 'Actions', section: 'actions', x: 430, y: 14 },
      { id: 'thresholds', label: 'Relationship levels', section: 'thresholds', x: 430, y: 120 },
      { id: 'story', label: 'Story & Quests', doc: 'design.story', x: 640, y: 14 },
      { id: 'trade', label: 'Trade', doc: 'design.trade', x: 640, y: 80 },
      { id: 'world', label: 'World & Biomes', doc: 'design.world', x: 640, y: 146 },
    ],
    edges: [
      { from: 'overview', to: 'thresholds', label: 'scale' },
      { from: 'factions', to: 'relations', label: 'rows, columns' },
      { from: 'relations', to: 'graph', label: 'checks' },
      { from: 'factions', to: 'endings', label: 'involved' },
      { from: 'actions', to: 'thresholds', label: 'moves into' },
      { from: 'actions', to: 'story', label: 'quest rewards' },
      { from: 'thresholds', to: 'trade', label: 'prices, access' },
      { from: 'thresholds', to: 'world', label: 'biome gates' },
    ],
  },
  steps: [
    {
      id: 'model',
      title: 'Describe the reputation model',
      body: 'Who tracks reputation with whom, how it moves and whether it drifts back over time.',
      section: 'overview',
      target: 'field-model',
      done: (p) => filled(data(p)?.overview?.model),
    },
    {
      id: 'scale',
      title: 'Set the scale and its markers',
      body: 'The lowest and highest value, where a new game starts, and from where a relation counts as allied or hostile.',
      section: 'overview',
      target: 'field-startValue',
      done: (p) => isNum(data(p)?.overview?.startValue) && markProblems(p).length === 0,
    },
    {
      id: 'factions',
      title: 'Add the factions',
      body: 'As many as the design needs, each with goals and a capital. The example adds four rivals.',
      section: 'factions',
      target: 'add',
      done: (p) => factionsOf(p).length >= 2 && factionsOf(p).every((f) => filled(f.goals)),
      action: { label: 'Insert example…', examples: 'factions' },
    },
    {
      id: 'relations',
      title: 'Say how factions regard each other',
      body: 'Every pair, in both directions. In the Relations web, click a line and move the sliders; one-sided pairs become arrows.',
      section: 'factions',
      target: 'view-relationsWeb',
      done: matrixComplete,
      action: { label: 'Fill relations…', examples: 'relations' },
    },
    {
      id: 'graph',
      title: 'Name the important relationships',
      body: 'Draw alliances, wars and trade pacts in the graph. The web marks with “!” where a named relationship contradicts the numbers.',
      section: 'relationGraph',
      done: (p) => (data(p)?.relationGraph?.edges ?? []).length > 0 && graphDisagreements(p).length === 0,
    },
    {
      id: 'levels',
      title: 'Lay the levels on the scale',
      body: 'Every value should fall into exactly one level. The Scale view marks gaps and overlaps; drag the boundaries to fix them.',
      section: 'thresholds',
      target: 'view-reputationScale',
      done: levelsClean,
      action: { label: 'Insert example…', examples: 'thresholds' },
    },
    {
      id: 'consequences',
      title: 'Give each level consequences',
      body: 'What changes at each level: prices, attacks, quests, biome access. Trade and World read these levels.',
      section: 'thresholds',
      target: 'view-reputationScale',
      done: (p) => levelsOf(p).length > 0 && levelsOf(p).every((l) => filled(l.consequences)),
    },
    {
      id: 'actions',
      title: 'List what moves reputation',
      body: 'Actions with a direct change and the spillover on other factions. Play a sequence in the Simulator to see which levels players reach.',
      section: 'actions',
      target: 'view-actionSimulator',
      done: (p) => {
        const acts = actionsOf(p).filter((a) => a.faction)
        return acts.length > 0 && factionsOf(p).every((f) => acts.some((a) => actionEffect(a, f.id) !== 0))
      },
      action: { label: 'Insert example…', examples: 'actions' },
    },
    {
      id: 'footprint',
      title: 'Give every faction a footprint',
      body: 'Link factions from quests, characters, merchants and biomes. The Footprint view shows which ones exist only on paper.',
      section: 'factions',
      target: 'view-factionFootprint',
      done: (p) => factionFootprints(p).some((f) => f.outside > 0) && unlinkedFactions(p).length === 0,
    },
    {
      id: 'endings',
      title: 'Tie factions to endings',
      body: 'Which endings each faction can bring about, and under what conditions.',
      section: 'endings',
      target: 'add',
      done: (p) => ((data(p)?.endings ?? []) as Entity[]).some((e) => Array.isArray(e.factions) && e.factions.length > 0),
    },
  ],
  examples: [factionsExample, rivalryExample, levelsExample, actionsExample],
  concepts: {
    factions: {
      title: 'Reading the relations web',
      body: 'Each line is a pair of factions: red is hostile, grey neutral, green allied, and thicker lines mean stronger feelings. When the two directions differ, the line splits into two arrows.',
      diagram: 'relationWeb',
    },
    thresholds: {
      title: 'Levels on one scale',
      body: 'Reputation moves along one scale; each level covers a stretch of it with no gaps or overlaps. Actions push the value across boundaries, and each level brings its consequences.',
      diagram: 'repScale',
    },
  },
  empty: {
    factions: 'The powers in the world, each with goals, a capital and a playstyle the player can lean into.',
    actions: 'What the player does that changes reputation, with the knock-on effect on other factions.',
    thresholds: 'Named stretches of the reputation scale (Hostile … Allied), each with consequences.',
    endings: 'How the faction story can end, and which factions decide it.',
  },
}
