import { ARCH_DOC } from '../../architecture'
import { DATA_DOC, nameOf } from '../../dataDriven'
import { classProblems, reportLabel, reportProblems, reportStale, storedReport } from '../../engine/report'
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
