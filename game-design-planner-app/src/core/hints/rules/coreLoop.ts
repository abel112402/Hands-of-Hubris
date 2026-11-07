import type { Entity, GraphData } from '../../model/types'
import type { Hint, HintRule } from '../types'
import { entitiesOf, entityName, hintId, isBlank, shortList } from '../util'
import { hasFeedback, loopPacing, pillarLoops, SCALES, wrongDirection } from '../../coreLoop'

const DOC = 'design.coreLoop'

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
  {
    id: 'coreLoop.direction',
    scope: 'entity',
    appliesTo: ({ docId }) => docId === DOC,
    evaluate: ({ project }) => {
      const bad = wrongDirection(project)
      if (!bad.length) return []
      const from = [...new Map(bad.map((b) => [b.from.id, b.from])).values()]
      return [
        hint({
          key: 'coreLoopDirection',
          ruleId: 'coreLoop.direction',
          severity: 'suggest',
          sectionId: 'loops',
          entityId: from[0].id,
          params: { count: bad.length, names: shortList(bad.map((b) => `${entityName(b.from)} → ${entityName(b.to)}`)) },
        }),
      ]
    },
  },
  {
    id: 'coreLoop.pacing',
    scope: 'entity',
    appliesTo: ({ docId }) => docId === DOC,
    evaluate: ({ project }) => {
      const bad = loopPacing(project).flatMap((r) => r.links.filter((l) => l.inverted).map((l) => ({ from: r.loop, to: l.to })))
      return bad.length
        ? [
            hint({
              key: 'coreLoopPacing',
              ruleId: 'coreLoop.pacing',
              severity: 'info',
              sectionId: 'loops',
              entityId: bad[0].from.id,
              params: { count: bad.length, names: shortList(bad.map((b) => `${entityName(b.from)} → ${entityName(b.to)}`)) },
            }),
          ]
        : []
    },
  },
  {
    id: 'coreLoop.pillars',
    scope: 'section',
    appliesTo: ({ docId }) => docId === DOC,
    evaluate: ({ project }) => {
      // Only once loops exist and at least one is tagged; before that the guide asks for the tagging.
      const loops = loopsOf(project)
      if (!loops.some((l) => (l.pillars ?? []).length)) return []
      const open = pillarLoops(project).filter((c) => !c.loops.length).map((c) => c.pillar)
      return open.length
        ? [hint({ key: 'coreLoopPillars', ruleId: 'coreLoop.pillars', severity: 'suggest', sectionId: 'loops', params: { count: open.length, names: names(open) } })]
        : []
    },
  },
  {
    id: 'coreLoop.rewardRefs',
    scope: 'entity',
    appliesTo: ({ docId }) => docId === DOC,
    evaluate: ({ project }) => {
      // Same gate as diagram links: once one loop names what its reward is, flag the others.
      const loops = loopsOf(project)
      if (!loops.some((l) => (l.rewardRefs ?? []).length)) return []
      const open = loops.filter((l) => !isBlank(l.reward) && !(l.rewardRefs ?? []).length)
      return open.length
        ? [hint({ key: 'coreLoopRewardRefs', ruleId: 'coreLoop.rewardRefs', severity: 'info', sectionId: 'loops', entityId: open[0].id, params: { count: open.length, names: names(open) } })]
        : []
    },
  },
]
