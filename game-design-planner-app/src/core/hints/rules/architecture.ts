import { ARCH_DOC as DOC, archList, bootSequence, dependencies, dependencyCycles, extensionCoverage, messageFlow, modulesWithoutLayer, nameOf, tickBudget } from '../../architecture'
import type { Hint, HintRule } from '../types'
import { hintId, isDocEmpty, shortList } from '../util'

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

const active = (id: string, evaluate: HintRule['evaluate']): HintRule => ({
  id,
  scope: 'section',
  appliesTo: ({ project, docId }) => docId === DOC && !isDocEmpty(project, DOC),
  evaluate,
})

const r2 = (n: number) => Math.round(n * 100) / 100

/** Advisory architecture checks over the declared design. Nothing exceeds 'suggest'. */
export const architectureRules: HintRule[] = [
  active('arch.upward', ({ project }) => {
    const up = dependencies(project).filter((d) => d.issue === 'upward')
    return up.length
      ? [hint({ key: 'archUpward', ruleId: 'arch.upward', severity: 'suggest', sectionId: 'modules', entityId: up[0].from.id, params: { count: up.length, names: shortList(up.map((d) => `${nameOf(d.from)} → ${nameOf(d.to)}`)) } })]
      : []
  }),
  active('arch.cycle', ({ project }) => {
    const cycles = dependencyCycles(project)
    return cycles.length
      ? [hint({ key: 'archCycle', ruleId: 'arch.cycle', severity: 'suggest', sectionId: 'modules', entityId: cycles[0][0].id, params: { count: cycles.length, names: shortList(cycles.map((c) => c.map(nameOf).join(' ↔ ')), 2) } })]
      : []
  }),
  active('arch.noLayer', ({ project }) => {
    if (!archList(project, 'layers').length) return []
    const rows = modulesWithoutLayer(project)
    return rows.length ? [hint({ key: 'archNoLayer', ruleId: 'arch.noLayer', severity: 'info', sectionId: 'modules', entityId: rows[0].id, params: { count: rows.length, names: shortList(rows.map(nameOf)) } })] : []
  }),
  active('arch.channel', ({ project }) => {
    const rows = messageFlow(project).filter((r) => r.orphan)
    return rows.length ? [hint({ key: 'archChannel', ruleId: 'arch.channel', severity: 'info', sectionId: 'channels', entityId: rows[0].channel.id, params: { count: rows.length, names: shortList(rows.map((r) => nameOf(r.channel))) } })] : []
  }),
  active('arch.uncovered', ({ project }) => {
    if (!archList(project, 'extensionPoints').length) return []
    const rows = extensionCoverage(project).uncovered
    return rows.length ? [hint({ key: 'archUncovered', ruleId: 'arch.uncovered', severity: 'info', sectionId: 'extensionPoints', params: { count: rows.length, names: shortList(rows.map(nameOf)) } })] : []
  }),
  active('arch.tickBudget', ({ project }) => {
    const b = tickBudget(project)
    if (!b.overAverage && !b.overWorst) return []
    return [hint({ key: 'archTickBudget', ruleId: 'arch.tickBudget', severity: 'suggest', sectionId: 'systems', params: { average: r2(b.avgFrameMs), budget: r2(b.budgetMs), worst: r2(b.worstTickMs), frame: r2(b.frameMs) } })]
  }),
  active('arch.boot', ({ project }) => {
    const boot = bootSequence(project)
    const problems = [...(boot.noBootstrap ? ['no Bootstrap scene'] : []), ...(boot.unreachable.length ? [`not reachable from Bootstrap: ${shortList(boot.unreachable.map(nameOf))}`] : [])]
    return problems.length ? [hint({ key: 'archBoot', ruleId: 'arch.boot', severity: 'info', sectionId: 'scenes', params: { names: problems.join('; ') } })] : []
  }),
  active('arch.legacy', ({ project }) => {
    const text = project.documents[DOC]?.data.principles?.legacyNotes
    return typeof text === 'string' && text.trim() ? [hint({ key: 'archLegacy', ruleId: 'arch.legacy', severity: 'info', sectionId: 'principles' })] : []
  }),
]
