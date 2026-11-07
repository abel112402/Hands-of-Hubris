import type { Entity, Project } from './model/types'

export const OPEN_QUESTIONS_DOC = 'design.openQuestions'
export const QUESTION_AREAS = ['Economy', 'NPC', 'Logistics', 'Combat', 'World', 'Story', 'Items', 'UI', 'Technical', 'Other']
export const QUESTION_STATUSES = ['Open', 'Discussion', 'Decided']

export const questionList = (project: Project): Entity[] => {
  const d = project.documents[OPEN_QUESTIONS_DOC]?.data.questions
  return Array.isArray(d) ? d : []
}

const blank = (v: unknown) => typeof v !== 'string' || v.trim() === ''
const isDecided = (q: Entity) => q.status === 'Decided'

/** Local calendar day as YYYY-MM-DD, the format date fields store. */
export const isoDay = (ms: number) => {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Not decided and the due date is before today. Questions without a due date are never overdue. */
export const overdue = (project: Project, now: number): Entity[] => {
  const today = isoDay(now)
  return questionList(project).filter((q) => !isDecided(q) && typeof q.due === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(q.due) && q.due < today)
}

export const decidedWithoutDecision = (project: Project): Entity[] => questionList(project).filter((q) => isDecided(q) && blank(q.decision))

/** Decided, but no doc is listed under "Updated in docs" (the doc's own rule: write decisions back). */
export const decidedNotWrittenBack = (project: Project): Entity[] =>
  questionList(project).filter((q) => isDecided(q) && !(Array.isArray(q.affects) && q.affects.some((a: unknown) => !blank(a))))

export function questionStats(project: Project, now: number) {
  const list = questionList(project)
  return {
    open: list.filter((q) => (q.status ?? 'Open') === 'Open').length,
    discussion: list.filter((q) => q.status === 'Discussion').length,
    decided: list.filter(isDecided).length,
    overdue: overdue(project, now).length,
  }
}
