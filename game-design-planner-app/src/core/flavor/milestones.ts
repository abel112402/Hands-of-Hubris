import type { Project } from '../model/types'

/** A count worth a small celebration: the `at`-th entry in one section. Text: `flavor.milestone.<id>`. */
export type Milestone = { id: string; docId: string; section: string; at: number }

export const MILESTONES: Milestone[] = [
  { id: 'npc1', docId: 'design.npc', section: 'archetypes', at: 1 },
  { id: 'npc10', docId: 'design.npc', section: 'archetypes', at: 10 },
  { id: 'item1', docId: 'design.items', section: 'items', at: 1 },
  { id: 'item50', docId: 'design.items', section: 'items', at: 50 },
  { id: 'character1', docId: 'design.story', section: 'characters', at: 1 },
  { id: 'quest1', docId: 'design.story', section: 'quests', at: 1 },
  { id: 'quest10', docId: 'design.story', section: 'quests', at: 10 },
]

export function sectionCount(project: Project, docId: string, section: string): number {
  const d = project.documents[docId]?.data[section]
  return Array.isArray(d) ? d.length : 0
}

/**
 * Milestones reached by the edit from `prev` to `next` that were not seen before. Only upward
 * crossings count, so loading a big project or undoing and redoing never celebrates. When one edit
 * crosses several thresholds of the same section (inserting examples), only the highest is kept.
 */
export function crossedMilestones(prev: Project, next: Project, seen: ReadonlySet<string>): Milestone[] {
  const best = new Map<string, Milestone>()
  for (const m of MILESTONES) {
    if (seen.has(m.id)) continue
    const before = sectionCount(prev, m.docId, m.section)
    const after = sectionCount(next, m.docId, m.section)
    if (before < m.at && after >= m.at) {
      const key = `${m.docId}/${m.section}`
      const cur = best.get(key)
      if (!cur || m.at > cur.at) best.set(key, m)
    }
  }
  return [...best.values()]
}

/** Minimum gap between two milestone asides, so a burst of edits doesn't turn into a burst of jokes. */
export const MOMENT_GAP_MS = 3 * 60 * 1000

export const momentAllowed = (now: number, lastAt: number | null, force = false) => force || lastAt === null || now - lastAt >= MOMENT_GAP_MS
