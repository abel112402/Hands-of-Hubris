import type { Entity, GraphData } from '../../model/types'
import type { Hint, HintRule } from '../types'
import { entitiesOf, entityName, hintId, isBlank, shortList } from '../util'

const DOC = 'design.coreLoop'
const SCALES = ['Moment-to-moment', 'Short (minutes)', 'Medium (hours / days)', 'Long (campaign)']

type Draft = Omit<Hint, 'id' | 'scope' | 'target' | 'titleKey' | 'bodyKey'> & { key: string; sectionId: string; entityId?: string }

const hint = (d: Draft): Hint => ({
  id: hintId(d.ruleId, d.entityId),
  ruleId: d.ruleId,
  severity: d.severity,
  scope: d.entityId ? 'entity' : 'section',
  target: { docId: DOC, sectionId: d.sectionId, entityId: d.entityId },
  titleKey: `hints.${d.key}.title`,
  bodyKey: `hints.${d.key}.body`,
  params: d.params,
  action: d.action ?? { kind: 'goto', docId: DOC, sectionId: d.sectionId },
})

const loopsOf = (project: Parameters<typeof entitiesOf>[0]) => entitiesOf(project, DOC, 'loops')
const graphOf = (project: Parameters<typeof entitiesOf>[0]): GraphData => project.documents[DOC]?.data.loopGraph ?? { nodes: [], edges: [] }
const names = (list: Entity[]) => shortList(list.map(entityName))

/** True when following the edges from some node leads back to it, i.e. the diagram contains a feedback loop. */
export function hasFeedback(g: GraphData): boolean {
  const next = new Map<string, string[]>()
  for (const e of g.edges) next.set(e.source, [...(next.get(e.source) ?? []), e.target])
  const state = new Map<string, 1 | 2>()
  const visit = (id: string): boolean => {
    if (state.get(id) === 1) return true
    if (state.get(id) === 2) return false
    state.set(id, 1)
    const found = (next.get(id) ?? []).some(visit)
    state.set(id, 2)
    return found
  }
  return g.nodes.some((n) => visit(n.id))
}

const loopRule = (
  id: string,
  key: string,
  missing: (e: Entity) => boolean,
  severity: Hint['severity'],
  sectionId = 'loops',
): HintRule => ({
  id,
  scope: 'entity',
  appliesTo: ({ docId }) => docId === DOC,
  evaluate: ({ project }) => {
    const list = loopsOf(project).filter(missing)
    return list.length
      ? [hint({ key, ruleId: id, severity, sectionId, entityId: list[0].id, params: { count: list.length, names: names(list) } })]
      : []
  },
})

/** Soft design prompts for the core loop. Never above 'suggest': there is no single correct loop. */
export const coreLoopRules: HintRule[] = [
  {
    id: 'coreLoop.scales',
    scope: 'section',
    appliesTo: ({ docId }) => docId === DOC,
    evaluate: ({ project }) => {
      const loops = loopsOf(project)
      if (!loops.length) return []
      const missing = SCALES.filter((s) => !loops.some((l) => l.scale === s))
      return missing.length
        ? [hint({ key: 'coreLoopScales', ruleId: 'coreLoop.scales', severity: 'suggest', sectionId: 'loops', params: { names: missing.join(', ') } })]
        : []
    },
  },
  loopRule('coreLoop.reward', 'coreLoopReward', (e) => isBlank(e.reward), 'suggest'),
  loopRule('coreLoop.decision', 'coreLoopDecision', (e) => isBlank(e.nextDecision), 'suggest'),
  {
    id: 'coreLoop.progression',
    scope: 'entity',
    appliesTo: ({ docId }) => docId === DOC,
    evaluate: ({ project }) => {
      const loops = loopsOf(project)
      const used = SCALES.filter((s) => loops.some((l) => l.scale === s))
      if (used.length < 2) return []
      const longest = used[used.length - 1]
      const open = loops.filter((l) => SCALES.includes(l.scale) && l.scale !== longest && !(l.leadsTo ?? []).length)
      return open.length
        ? [
            hint({
              key: 'coreLoopProgression',
              ruleId: 'coreLoop.progression',
              severity: 'info',
              sectionId: 'loops',
              entityId: open[0].id,
              params: { count: open.length, names: names(open) },
            }),
          ]
        : []
    },
  },
  {
    id: 'coreLoop.unlinked',
    scope: 'entity',
    appliesTo: ({ docId }) => docId === DOC,
    evaluate: ({ project }) => {
      if (!graphOf(project).nodes.length) return []
      const open = loopsOf(project).filter((l) => !(l.nodes ?? []).length)
      return open.length
        ? [
            hint({
              key: 'coreLoopUnlinked',
              ruleId: 'coreLoop.unlinked',
              severity: 'info',
              sectionId: 'loops',
              entityId: open[0].id,
              params: { count: open.length, names: names(open) },
            }),
          ]
        : []
    },
  },
  {
    id: 'coreLoop.isolated',
    scope: 'section',
    appliesTo: ({ docId }) => docId === DOC,
    evaluate: ({ project }) => {
      const g = graphOf(project)
      if (g.nodes.length < 2) return []
      const linked = new Set(g.edges.flatMap((e) => [e.source, e.target]))
      const alone = g.nodes.filter((n) => !linked.has(n.id))
      return alone.length
        ? [hint({ key: 'coreLoopIsolated', ruleId: 'coreLoop.isolated', severity: 'suggest', sectionId: 'loopGraph', params: { names: shortList(alone.map((n) => n.label)) } })]
        : []
    },
  },
  {
    id: 'coreLoop.feedback',
    scope: 'section',
    appliesTo: ({ docId }) => docId === DOC,
    evaluate: ({ project }) => {
      const g = graphOf(project)
      return g.nodes.length >= 3 && g.edges.length > 0 && !hasFeedback(g)
        ? [hint({ key: 'coreLoopFeedback', ruleId: 'coreLoop.feedback', severity: 'suggest', sectionId: 'loopGraph' })]
        : []
    },
  },
]
