import type { GuideExample, ModuleGuide } from '../../core/guides/types'
import { makeId } from '../../core/model/project'
import type { Entity, GraphData, Project } from '../../core/model/types'
import { CORE_LOOP_DOC, hasFeedback, loopGraph, loopList, loopPacing, pillarLoops, SCALES, wrongDirection } from '../../core/coreLoop'

const filled = (v: unknown) => typeof v === 'string' && v.trim() !== ''
const linked = (v: unknown) => Array.isArray(v) && v.length > 0
const LONGEST = SCALES[SCALES.length - 1]

const ensureLoops = (p: Project): Entity[] => {
  const d = p.documents[CORE_LOOP_DOC]?.data
  if (!d) return []
  if (!Array.isArray(d.loops)) d.loops = []
  return d.loops
}

type LoopSpec = { key: string; name: string; scale: (typeof SCALES)[number]; cycleMinutes: number; action: string; reward: string; nextDecision: string; leadsTo?: string }

/**
 * Adds the loops whose names are not there yet and chains them with "Builds toward". A link is only added
 * between loops this example created, so existing loops are never rewired.
 */
function addLoops(p: Project, specs: LoopSpec[]) {
  const list = ensureLoops(p)
  const made = new Map<string, Entity>()
  for (const s of specs) {
    if (list.some((e) => String(e.name ?? '').toLowerCase() === s.name.toLowerCase())) continue
    const e: Entity = { id: makeId(), name: s.name, scale: s.scale, cycleMinutes: s.cycleMinutes, action: s.action, reward: s.reward, nextDecision: s.nextDecision }
    list.push(e)
    made.set(s.key, e)
  }
  for (const s of specs) {
    const from = made.get(s.key)
    const to = s.leadsTo && made.get(s.leadsTo)
    if (from && to) from.leadsTo = [to.id]
  }
}

const HOH: LoopSpec[] = [
  { key: 'm', name: 'Swing, dodge, pick up', scale: 'Moment-to-moment', cycleMinutes: 0.05, action: 'Chop a tree, dodge a wolf, grab what drops.', reward: 'Immediate feedback: a log, a hit landed, a close call.', nextDecision: 'Keep chopping or deal with the threat first?', leadsTo: 's' },
  { key: 's', name: 'Gather → craft → survive', scale: 'Short (minutes)', cycleMinutes: 15, action: 'Collect wood and stone, craft tools, eat and rest before night.', reward: 'Better tools and enough food for the night.', nextDecision: 'Spend materials on a better axe or on the first wall?', leadsTo: 'md' },
  { key: 'md', name: 'Grow the town', scale: 'Medium (hours / days)', cycleMinutes: 240, action: 'Place buildings, assign townspeople, keep their needs met.', reward: 'Production chains and new townspeople.', nextDecision: 'Which district or faction to invest in next?', leadsTo: 'l' },
  { key: 'l', name: 'Win the factions and the biomes', scale: 'Long (campaign)', cycleMinutes: 3000, action: 'Capture outposts, negotiate with factions, defeat biome bosses.', reward: 'New biomes, allies and story endings.', nextDecision: 'Which faction to side with for the ending?' },
]

const SESSION: LoopSpec[] = [
  { key: 's', name: 'One expedition', scale: 'Short (minutes)', cycleMinutes: 20, action: 'Leave the base, explore, fight, return before dark.', reward: 'Rare materials and map knowledge.', nextDecision: 'Push further next time or upgrade gear first?', leadsTo: 'md' },
  { key: 'md', name: 'Upgrade the base between expeditions', scale: 'Medium (hours / days)', cycleMinutes: 120, action: 'Spend materials on workshops and upgrades.', reward: 'Longer, safer expeditions.', nextDecision: 'Which biome to unlock next?', leadsTo: 'l' },
  { key: 'l', name: 'Open every biome', scale: 'Long (campaign)', cycleMinutes: 1800, action: 'Clear each biome’s boss.', reward: 'The ending and a new-game+ start.', nextDecision: 'Start again with a different build?' },
]

const loopsExample = (id: string, title: string, description: string, specs: LoopSpec[]): GuideExample => ({
  id,
  section: 'loops',
  title,
  description,
  preview: 'coreLoopList',
  apply: (p) => addLoops(p, specs),
})

/** Gather → wood → craft → better axe, back to gather (the feedback edge), with surviving the night as the goal. */
const diagramExample: GuideExample = {
  id: 'gatherCraft',
  section: 'loopGraph',
  title: 'Gather–craft feedback loop',
  description: 'Five nodes with one edge back from the reward to the first action, so the diagram reads as a loop. Placed to the right of anything already drawn.',
  preview: 'coreLoopList',
  apply: (p) => {
    const d = p.documents[CORE_LOOP_DOC]?.data
    if (!d) return
    const g: GraphData = (d.loopGraph ??= { nodes: [], edges: [] })
    const x0 = Math.max(0, ...g.nodes.map((n) => n.x + 200))
    const n = (label: string, kind: string, x: number, y: number) => {
      const node = { id: makeId(), label, kind, x: x0 + x, y }
      g.nodes.push(node)
      return node.id
    }
    const gather = n('Gather', 'Action', 0, 100)
    const wood = n('Wood & stone', 'Resource', 200, 0)
    const craft = n('Craft', 'Action', 400, 100)
    const axe = n('Better axe', 'Reward', 200, 200)
    const night = n('Survive the night', 'Goal', 600, 100)
    const e = (source: string, target: string, kind: string) => g.edges.push({ id: makeId(), source, target, kind, label: kind })
    e(gather, wood, 'feeds')
    e(wood, craft, 'feeds')
    e(craft, axe, 'rewards')
    e(axe, gather, 'leads to')
    e(craft, night, 'unlocks')
  },
}

const loops = loopList

export const CORE_LOOP_GUIDE: ModuleGuide = {
  map: {
    width: 800,
    height: 160,
    nodes: [
      { id: 'vision', label: 'Vision', doc: 'overview.vision', x: 10, y: 14 },
      { id: 'time', label: 'Time & Weather', doc: 'design.timeWeather', x: 10, y: 102 },
      { id: 'loops', label: 'Loops', section: 'loops', x: 220, y: 58 },
      { id: 'graph', label: 'Loop diagram', section: 'loopGraph', x: 430, y: 14 },
      { id: 'rewards', label: 'Rewards & progression', section: 'rewardsProgression', x: 430, y: 102 },
      { id: 'items', label: 'Items & Crafting', doc: 'design.items', x: 640, y: 14 },
      { id: 'town', label: 'Town', doc: 'design.town', x: 640, y: 102 },
    ],
    edges: [
      { from: 'vision', to: 'loops', label: 'pillars' },
      { from: 'time', to: 'loops', label: 'day length' },
      { from: 'loops', to: 'graph', label: 'drawn as' },
      { from: 'loops', to: 'rewards', label: 'connect in' },
      { from: 'graph', to: 'items', label: 'nodes link' },
      { from: 'rewards', to: 'town', label: 'reward is' },
    ],
  },
  steps: [
    {
      id: 'scales',
      title: 'Describe one loop per time scale',
      body: 'Moment-to-moment, short, medium and long. Start from an example if a blank page is hard.',
      section: 'loops',
      target: 'add',
      done: (p) => SCALES.every((s) => loops(p).some((l) => l.scale === s)),
      action: { label: 'Insert example…', examples: 'loops' },
    },
    {
      id: 'shape',
      title: 'Action → reward → next decision',
      body: 'Each loop says what the player does, what they get, and the new choice the reward opens. The choice is what makes it repeat.',
      section: 'loops',
      target: 'field-nextDecision',
      done: (p) => loops(p).length > 0 && loops(p).every((l) => filled(l.action) && filled(l.reward) && filled(l.nextDecision)),
    },
    {
      id: 'length',
      title: 'Estimate how long one cycle takes',
      body: 'Rough real minutes per repetition. The numbers only need to be the right order of magnitude.',
      section: 'loops',
      target: 'field-cycleMinutes',
      done: (p) => loops(p).length > 0 && loops(p).every((l) => typeof l.cycleMinutes === 'number' && l.cycleMinutes > 0),
    },
    {
      id: 'chain',
      title: 'Chain shorter loops into longer ones',
      body: 'Use “Builds toward” from each loop to the longer loop it progresses. The Progression view lays them out by scale.',
      section: 'loops',
      target: 'view-progression',
      done: (p) => {
        const open = loops(p).filter((l) => SCALES.includes(l.scale) && l.scale !== LONGEST && !linked(l.leadsTo))
        return loops(p).length > 1 && open.length === 0 && wrongDirection(p).length === 0
      },
    },
    {
      id: 'pacing',
      title: 'Check the pacing',
      body: 'The Pacing view shows how many short cycles fit into each longer one. Very large ratios can feel grindy; very small ones make the long loop feel trivial.',
      section: 'loops',
      target: 'view-loopPacing',
      done: (p) => {
        const links = loopPacing(p).flatMap((r) => r.links)
        return links.length > 0 && links.every((l) => !l.inverted)
      },
    },
    {
      id: 'pillars',
      title: 'Tie loops to the Vision pillars',
      body: 'Tick the pillars each loop serves. Every pillar should be something the player repeats.',
      section: 'loops',
      target: 'field-pillars',
      done: (p) => {
        const cov = pillarLoops(p)
        return cov.length > 0 && cov.every((c) => c.loops.length > 0)
      },
    },
    {
      id: 'rewardRefs',
      title: 'Name what each reward is',
      body: 'Link rewards to the actual resources, items or buildings, so a renamed item stays connected.',
      section: 'loops',
      target: 'field-rewardRefs',
      done: (p) => loops(p).some((l) => linked(l.rewardRefs)) && loops(p).every((l) => !filled(l.reward) || linked(l.rewardRefs)),
    },
    {
      id: 'diagram',
      title: 'Draw the loop with a feedback edge',
      body: 'Actions, resources, rewards and goals, with at least one edge leading back to an earlier node.',
      section: 'loopGraph',
      done: (p) => loopGraph(p).nodes.length >= 3 && hasFeedback(loopGraph(p)),
      action: { label: 'Insert example…', examples: 'loopGraph' },
    },
    {
      id: 'progression',
      title: 'Summarize rewards and progression',
      body: 'One paragraph on what motivates the player and how the loops feed each other. The export adds the pacing table here.',
      section: 'rewardsProgression',
      target: 'field-rewardsProgression',
      done: (p) => filled(p.documents[CORE_LOOP_DOC]?.data.rewardsProgression?.rewardsProgression),
    },
  ],
  examples: [
    loopsExample('hoh', 'Survival-town loop set', 'Four loops from swinging an axe to winning the factions, chained with “Builds toward” and rough cycle lengths.', HOH),
    loopsExample('session', 'Expedition loop set', 'Three loops for a game built around expeditions from a base, with meta-progression between runs.', SESSION),
    diagramExample,
  ],
  concepts: {
    loops: {
      title: 'Nested loops',
      body: 'Each loop repeats inside a longer one: many swings make a gather run, many runs grow the town, the town carries the campaign. The ratio between them is the pacing.',
      diagram: 'nestedLoops',
    },
    loopGraph: {
      title: 'Why a feedback edge',
      body: 'A loop only repeats if its reward makes the next action possible or better. Draw that as an edge from the reward back to an earlier action.',
      diagram: 'feedbackLoop',
    },
  },
  empty: {
    loops: 'What the player repeats, from seconds to the whole campaign, and what each repetition gives them.',
  },
}
