import type { Entity, Project } from './model/types'
import { analyze, phaseLoad, weekToDate, withBuffer } from './schedule'

/**
 * Roadmap planning numbers: phase progress, cut savings and protected-pillar checks.
 * Planning estimates from the entered effort and status, not a forecast.
 */
export const ROADMAP_DOC = 'overview.roadmap'
const VISION_DOC = 'overview.vision'

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
const ids = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
const list = (p: Project, doc: string, section: string): Entity[] => {
  const d = p.documents[doc]?.data[section]
  return Array.isArray(d) ? d : []
}

export const roadmapList = (p: Project, section: 'phases' | 'tasks' | 'dependencies' | 'gates' | 'cuts' | 'changelog') => list(p, ROADMAP_DOC, section)
export const assumptions = (p: Project): Record<string, any> => p.documents[ROADMAP_DOC]?.data.assumptions ?? {}
const isDone = (t: Entity) => t.status === 'Done'

/** UTC calendar day, the format `weekToDate` returns. */
const today = (now: number) => new Date(now).toISOString().slice(0, 10)

export type PhaseProgress = {
  phase: Entity
  tasks: number
  done: number
  blocked: number
  effort: number
  effortDone: number
  capacity?: number
  over: boolean
  /** Calendar date the phase ends, when the project has a start date. */
  endDate: string | null
  /** The end date has passed and tasks are still open. */
  late: boolean
}

export function phaseProgress(p: Project, now: number): PhaseProgress[] {
  const phases = roadmapList(p, 'phases')
  const tasks = roadmapList(p, 'tasks')
  const load = phaseLoad(phases, tasks)
  const start = assumptions(p).startDate
  const day = today(now)
  return phases.map((phase, i) => {
    const mine = tasks.filter((t) => t.phase === phase.id)
    const done = mine.filter(isDone)
    const endDate = weekToDate(start, (num(phase.start) ?? 0) + (num(phase.duration) ?? 0))
    return {
      phase,
      tasks: mine.length,
      done: done.length,
      blocked: mine.filter((t) => t.status === 'Blocked').length,
      effort: load[i].effort,
      effortDone: done.reduce((s, t) => s + (num(t.effort) ?? 0), 0),
      capacity: load[i].capacity,
      over: load[i].over,
      endDate,
      late: endDate !== null && endDate < day && done.length < mine.length,
    }
  })
}

/** Person-weeks of task effort above phase capacity, summed over all phases with a capacity. */
export function overload(p: Project): number {
  return phaseLoad(roadmapList(p, 'phases'), roadmapList(p, 'tasks')).reduce((s, l) => s + (l.capacity !== undefined ? Math.max(0, l.effort - l.capacity) : 0), 0)
}

/** Planned and buffered end of the phases, in weeks. */
export function planEnd(p: Project) {
  const end = analyze(roadmapList(p, 'phases'), { start: 'start', duration: 'duration', deps: 'dependsOn' }).end
  return { end, buffered: Math.ceil(withBuffer(end, assumptions(p).buffer)) }
}

export type CutSaving = { cut: Entity; saving: number; source: 'manual' | 'tasks' | 'none'; cumulative: number }

/**
 * Cuts in the order they would be made (1 first; cuts without an order last), with the person-weeks each saves.
 * A manual `saving` wins; otherwise the effort of affected tasks that are not done and not already counted by an earlier cut.
 */
export function cutSavings(p: Project): CutSaving[] {
  const tasks = new Map(roadmapList(p, 'tasks').map((t) => [t.id, t]))
  const cuts = [...roadmapList(p, 'cuts')].sort((a, b) => (num(a.order) ?? Infinity) - (num(b.order) ?? Infinity))
  const counted = new Set<string>()
  let cumulative = 0
  return cuts.map((cut) => {
    const manual = num(cut.saving)
    let saving = 0
    let source: CutSaving['source'] = 'none'
    if (manual !== undefined) {
      saving = manual
      source = 'manual'
    } else {
      for (const id of ids(cut.affectsTasks)) {
        const t = tasks.get(id)
        if (!t || isDone(t) || counted.has(id)) continue
        counted.add(id)
        saving += num(t.effort) ?? 0
      }
      if (saving > 0) source = 'tasks'
    }
    cumulative += saving
    return { cut, saving, source, cumulative }
  })
}

/** How many cuts, in order, recover the current overload; null when all of them together do not. */
export function cutsToRecover(p: Project): number | null {
  const need = overload(p)
  if (need <= 0) return 0
  const i = cutSavings(p).findIndex((c) => c.cumulative >= need)
  return i < 0 ? null : i + 1
}

export const protectedPillars = (p: Project): string[] => ids(p.documents[ROADMAP_DOC]?.data.protected?.pillars)

export type ProtectedConflict = { cut: Entity; items: Entity[]; pillars: Entity[] }

/** Cuts that drop a Vision scope item serving a pillar marked as not cuttable. */
export function protectedConflicts(p: Project): ProtectedConflict[] {
  const prot = new Set(protectedPillars(p))
  if (!prot.size) return []
  const scope = new Map(list(p, VISION_DOC, 'scope').map((e) => [e.id, e]))
  const pillars = new Map(list(p, VISION_DOC, 'pillars').map((e) => [e.id, e]))
  const out: ProtectedConflict[] = []
  for (const cut of roadmapList(p, 'cuts')) {
    const items = ids(cut.scopeItems).map((id) => scope.get(id)).filter((e): e is Entity => !!e && ids(e.pillars).some((x) => prot.has(x)))
    if (!items.length) continue
    const hit = [...new Set(items.flatMap((e) => ids(e.pillars).filter((x) => prot.has(x))))]
    out.push({ cut, items, pillars: hit.map((id) => pillars.get(id)).filter((e): e is Entity => !!e) })
  }
  return out
}
