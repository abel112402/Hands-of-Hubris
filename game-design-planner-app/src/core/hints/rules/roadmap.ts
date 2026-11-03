import type { Entity } from '../../model/types'
import { analyze, phaseLoad, weekToDate } from '../../schedule'
import type { Hint, HintRule } from '../types'
import { entitiesOf, entityName, hintId, isDocEmpty, shortList } from '../util'

const DOC = 'overview.roadmap'
const DAY = 86_400_000

type Draft = { rule: string; key: string; severity: Hint['severity']; sectionId: string; entityId?: string; params?: Hint['params'] }

const hint = (d: Draft): Hint => ({
  id: hintId(d.rule, d.sectionId, d.entityId),
  ruleId: d.rule,
  severity: d.severity,
  scope: d.entityId ? 'entity' : 'section',
  target: { docId: DOC, sectionId: d.sectionId, entityId: d.entityId },
  titleKey: `hints.${d.key}.title`,
  bodyKey: `hints.${d.key}.body`,
  params: d.params,
  action: { kind: 'goto', docId: DOC, sectionId: d.sectionId },
})

const names = (list: Entity[]) => shortList(list.map(entityName))
const SECTIONS = [
  { id: 'phases', label: 'phases' },
  { id: 'tasks', label: 'tasks' },
] as const
const keys = { start: 'start', duration: 'duration', deps: 'dependsOn' }

const rule = (id: string, evaluate: HintRule['evaluate']): HintRule => ({
  id,
  scope: 'section',
  appliesTo: ({ project, docId }) => docId === DOC && !isDocEmpty(project, DOC),
  evaluate,
})

/** Soft schedule-quality prompts; none is above 'suggest' because a rough plan is a valid plan. */
export const roadmapRules: HintRule[] = [
  rule('roadmap.conflict', ({ project }) =>
    SECTIONS.flatMap(({ id }) => {
      const items = entitiesOf(project, DOC, id)
      const bad = analyze(items, { ...keys, kind: id === 'tasks' ? 'kind' : undefined }).conflicts
      if (!bad.length) return []
      const first = items.find((e) => e.id === bad[0].id)!
      return [hint({ rule: 'roadmap.conflict', key: 'roadmapConflict', severity: 'suggest', sectionId: id, entityId: first.id, params: { count: bad.length, names: names(bad.map((c) => items.find((e) => e.id === c.id)!)), section: id } })]
    }),
  ),
  rule('roadmap.cycle', ({ project }) =>
    SECTIONS.flatMap(({ id }) => {
      const items = entitiesOf(project, DOC, id)
      const cyc = analyze(items, keys).cycles
      return cyc.length
        ? [hint({ rule: 'roadmap.cycle', key: 'roadmapCycle', severity: 'suggest', sectionId: id, params: { names: names(items.filter((e) => cyc.includes(e.id))), section: id } })]
        : []
    }),
  ),
  rule('roadmap.missing', ({ project }) =>
    SECTIONS.flatMap(({ id }) => {
      const items = entitiesOf(project, DOC, id)
      const miss = analyze(items, { ...keys, kind: id === 'tasks' ? 'kind' : undefined }).missing
      return miss.length
        ? [hint({ rule: 'roadmap.missing', key: 'roadmapMissing', severity: 'info', sectionId: id, entityId: miss[0], params: { count: miss.length, section: id } })]
        : []
    }),
  ),
  rule('roadmap.exit', ({ project }) => {
    const bad = entitiesOf(project, DOC, 'phases').filter((p) => !p.exit?.length)
    return bad.length ? [hint({ rule: 'roadmap.exit', key: 'roadmapExit', severity: 'info', sectionId: 'phases', entityId: bad[0].id, params: { count: bad.length, names: names(bad) } })] : []
  }),
  rule('roadmap.gate', ({ project }) => {
    const gated = new Set(entitiesOf(project, DOC, 'gates').map((g) => g.phase))
    const bad = entitiesOf(project, DOC, 'phases').filter((p) => !gated.has(p.id))
    return bad.length ? [hint({ rule: 'roadmap.gate', key: 'roadmapGate', severity: 'info', sectionId: 'gates', params: { count: bad.length, names: names(bad) } })] : []
  }),
  rule('roadmap.overload', ({ project }) => {
    const phases = entitiesOf(project, DOC, 'phases')
    const over = phaseLoad(phases, entitiesOf(project, DOC, 'tasks')).filter((l) => l.over)
    return over.length
      ? [hint({ rule: 'roadmap.overload', key: 'roadmapOverload', severity: 'suggest', sectionId: 'phases', entityId: over[0].id, params: { names: names(phases.filter((p) => over.some((o) => o.id === p.id))) } })]
      : []
  }),
  rule('roadmap.confidence', ({ project }) => {
    const low = entitiesOf(project, DOC, 'tasks').filter((t) => t.confidence === 'Low' && t.status !== 'Done')
    return low.length ? [hint({ rule: 'roadmap.confidence', key: 'roadmapConfidence', severity: 'info', sectionId: 'tasks', entityId: low[0].id, params: { count: low.length, names: names(low) } })] : []
  }),
  rule('roadmap.decision', ({ project, now }) => {
    const data = project.documents[DOC]?.data
    const phases = entitiesOf(project, DOC, 'phases')
    const endedPhases = new Set(
      phases
        .filter((p) => {
          const end = weekToDate(data?.assumptions?.startDate, (p.start ?? 0) + (p.duration ?? 0))
          return end !== null && new Date(end).getTime() < now - DAY
        })
        .map((p) => p.id),
    )
    const open = entitiesOf(project, DOC, 'gates').filter((g) => endedPhases.has(g.phase) && (!g.decision || g.decision === 'Pending'))
    return open.length ? [hint({ rule: 'roadmap.decision', key: 'roadmapDecision', severity: 'suggest', sectionId: 'gates', entityId: open[0].id, params: { count: open.length, names: names(open) } })] : []
  }),
]
