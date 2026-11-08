/**
 * Planner progress for menus and the progress panel. Pure over the project.
 */
import { getModule, getSections } from './modules/registry'
import { isSectionEmpty } from './hints/util'
import type { Entity, Project } from './model/types'

/** Share (0–100) of a planner's sections that have content. Unknown planners count as 0. */
export function docProgress(project: Project, docId: string): number {
  const mod = getModule(docId)
  const doc = project.documents[docId]
  if (!mod || !doc) return 0
  const sections = getSections(mod, project.registry)
  if (!sections.length) return 0
  const filled = sections.filter((s) => !isSectionEmpty(s, doc.data[s.id])).length
  return Math.round((filled / sections.length) * 100)
}

/** Average progress of a set of planners (0 when empty). */
export const averageProgress = (project: Project, docIds: string[]) =>
  docIds.length ? Math.round(docIds.reduce((n, d) => n + docProgress(project, d), 0) / docIds.length) : 0

export type MilestoneSummary = { name: string; status?: string; due?: string; start?: number }

/**
 * The milestone to work towards: the first one not marked Done, by start week (then list order).
 * Undefined when there are no milestones or all are done.
 */
export function nextMilestone(project: Project): MilestoneSummary | undefined {
  const list = project.documents['production.milestones']?.data.milestones
  if (!Array.isArray(list)) return undefined
  const open = (list as Entity[])
    .map((m, i) => ({ m, i }))
    .filter(({ m }) => m.status !== 'Done')
    .sort((a, b) => (Number(a.m.start ?? Infinity) - Number(b.m.start ?? Infinity)) || a.i - b.i)
  const m = open[0]?.m
  return m && { name: String(m.name ?? m.title ?? ''), status: m.status as string | undefined, due: (m.due as string) || undefined, start: typeof m.start === 'number' ? m.start : undefined }
}
