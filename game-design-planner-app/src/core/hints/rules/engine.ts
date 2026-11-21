import { ARCH_DOC } from '../../architecture'
import { DATA_DOC, nameOf } from '../../dataDriven'
import { classProblems, reportLabel, reportProblems, reportStale, storedReport } from '../../engine/report'
import { statusSuggestions } from '../../engine/suggestions'
import { BALANCE_DOC, outOfRange } from '../../engine/metrics'
import { buildIR } from '../../engine/ir'
import { runChecks } from '../../engine/irExtras'
import type { Hint, HintRule } from '../types'
import { hintId, shortList } from '../util'

const hint = (ruleId: string, key: string, docId: string, sectionId: string, severity: Hint['severity'], params: Hint['params'], entityId?: string): Hint => ({
  id: hintId(ruleId, entityId),
  ruleId,
  severity,
  scope: 'section',
  target: { docId, sectionId, entityId },
  titleKey: `hints.${key}.title`,
  bodyKey: `hints.${key}.body`,
  params,
  action: { kind: 'goto', docId, sectionId },
})

/** Hints from the last engine report (core/engine/report). Shown on the Data-driven Design and Architecture pages. */
export const engineRules: HintRule[] = [
  {
    id: 'engine.metricOutOfRange',
    scope: 'section',
    appliesTo: ({ project, docId }) => docId === BALANCE_DOC && !!storedReport(project),
    evaluate: ({ project }) => {
      const rows = outOfRange(project)
      return rows.length ? [hint('engine.metricOutOfRange', 'engineMetricOutOfRange', BALANCE_DOC, 'metrics', 'suggest', { count: rows.length, engine: reportLabel(storedReport(project)!), names: shortList(rows.map((r) => String(r.metric.name ?? r.key))) }, String(rows[0].metric.id))] : []
    },
  },
  {
    id: 'balance.dataCheck',
    scope: 'section',
    appliesTo: ({ project, docId }) => docId === BALANCE_DOC && Array.isArray(project.documents[BALANCE_DOC]?.data.checks) && project.documents[BALANCE_DOC].data.checks.length > 0,
    evaluate: ({ project }) => {
      const { ir } = buildIR(project)
      const failing = runChecks(ir.checks, ir.records).filter((r) => r.outside.length)
      if (!failing.length) return []
      const records = failing.reduce((n, r) => n + r.outside.length, 0)
      const severity = failing.some((r) => r.check.level === 'error') ? 'important' : 'suggest'
      return [hint('balance.dataCheck', 'balanceDataCheck', BALANCE_DOC, 'checks', severity, { count: failing.length, records, names: shortList(failing.map((r) => r.check.name)) }, failing[0].check.id)]
    },
  },
  {
    id: 'engine.suggestions',
    scope: 'section',
    appliesTo: ({ project, docId }) => (docId === DATA_DOC || docId === ARCH_DOC) && !!storedReport(project),
    evaluate: ({ project }) => {
      const { suggestions, report } = statusSuggestions(project)
      if (!suggestions.length || !report) return []
      // Always points at the Engine export view (Data schemas), where they are accepted.
      return [{ ...hint('engine.suggestions', 'engineSuggestions', DATA_DOC, 'schemas', 'info', { count: suggestions.length, engine: reportLabel(report), names: shortList(suggestions.map((x) => x.name)) }) }]
    },
  },
  {
    id: 'engine.incomplete',
    scope: 'section',
    appliesTo: ({ project, docId }) => docId === DATA_DOC && !!storedReport(project),
    evaluate: ({ project }) => {
      const rows = reportProblems(project)
      const r = storedReport(project)!
      return rows.length ? [hint('engine.incomplete', 'engineIncomplete', DATA_DOC, 'schemas', 'suggest', { count: rows.length, engine: reportLabel(r), names: shortList(rows.map((x) => nameOf(x.entity))) })] : []
    },
  },
  {
    id: 'engine.stale',
    scope: 'section',
    appliesTo: ({ project, docId }) => docId === DATA_DOC && !!storedReport(project),
    evaluate: ({ project }) => (reportStale(project) ? [hint('engine.stale', 'engineStale', DATA_DOC, 'schemas', 'info', { engine: reportLabel(storedReport(project)!) })] : []),
  },
  {
    id: 'engine.classes',
    scope: 'section',
    appliesTo: ({ project, docId }) => docId === ARCH_DOC && !!storedReport(project),
    evaluate: ({ project }) => {
      const rows = classProblems(project)
      const r = storedReport(project)!
      return rows.length ? [hint('engine.classes', 'engineClasses', ARCH_DOC, 'classes', 'info', { count: rows.length, engine: reportLabel(r), names: shortList(rows.map((x) => nameOf(x.cls))) }, String(rows[0].cls.id))] : []
    },
  },
]
