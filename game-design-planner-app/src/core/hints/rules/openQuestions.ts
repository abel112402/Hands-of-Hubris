import type { Entity } from '../../model/types'
import { decidedNotWrittenBack, decidedWithoutDecision, OPEN_QUESTIONS_DOC as DOC, overdue } from '../../openQuestions'
import type { Hint, HintRule } from '../types'
import { entityName, hintId, isDocEmpty, shortList } from '../util'

type Draft = Omit<Hint, 'id' | 'scope' | 'target' | 'titleKey' | 'bodyKey'> & { key: string; entityId?: string }

const hint = (d: Draft): Hint => ({
  id: hintId(d.ruleId, d.entityId),
  ruleId: d.ruleId,
  severity: d.severity,
  scope: d.entityId ? 'entity' : 'section',
  target: { docId: DOC, sectionId: 'questions', entityId: d.entityId },
  titleKey: `hints.${d.key}.title`,
  bodyKey: `hints.${d.key}.body`,
  params: d.params,
  action: d.action ?? { kind: 'goto', docId: DOC, sectionId: 'questions' },
})

const active = (id: string, evaluate: HintRule['evaluate']): HintRule => ({
  id,
  scope: 'section',
  appliesTo: ({ project, docId }) => docId === DOC && !isDocEmpty(project, DOC),
  evaluate,
})

const one = (key: string, ruleId: string, rows: Entity[]): Hint[] =>
  rows.length ? [hint({ key, ruleId, severity: 'suggest', entityId: rows[0].id, params: { count: rows.length, names: shortList(rows.map(entityName)) } })] : []

/** Follow-up prompts for the decision log. Never above 'suggest': an open question is not an error. */
export const openQuestionRules: HintRule[] = [
  active('oq.decidedNoText', ({ project }) => one('oqDecidedNoText', 'oq.decidedNoText', decidedWithoutDecision(project))),
  active('oq.notWrittenBack', ({ project }) => one('oqNotWrittenBack', 'oq.notWrittenBack', decidedNotWrittenBack(project))),
  active('oq.overdue', ({ project, now }) => one('oqOverdue', 'oq.overdue', overdue(project, now))),
]
