import type { Entity } from './model/types'

export type ScheduleKeys = { start: string; duration: string; deps: string; kind?: string }

export type Conflict = { id: string; dep: string; /** weeks the item starts before its predecessor ends */ overlap: number }

export type Analysis = {
  /** Effective [start, end] per item id; milestones have zero length. */
  span: Map<string, { start: number; end: number }>
  conflicts: Conflict[]
  cycles: string[]
  missing: string[]
  /** Weeks an item can slip before it delays a successor or the plan end; negative when a dependency is violated. */
  slack: Map<string, number>
  /** Items on a dependency chain with no slack. */
  critical: Set<string>
  end: number
}

export const isMilestone = (e: Entity, kind?: string) => !!kind && e[kind] === 'Milestone'
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
const depsOf = (e: Entity, key: string): string[] => (Array.isArray(e[key]) ? e[key] : [])

export function analyze(items: Entity[], k: ScheduleKeys): Analysis {
  const byId = new Map(items.map((e) => [e.id, e]))
  const span = new Map<string, { start: number; end: number }>()
  const missing: string[] = []
  for (const e of items) {
    const start = num(e[k.start])
    const milestone = isMilestone(e, k.kind)
    const dur = milestone ? 0 : num(e[k.duration])
    if (start === undefined || dur === undefined) missing.push(e.id)
    const s = start ?? 0
    span.set(e.id, { start: s, end: s + (dur ?? 0) })
  }

  const conflicts: Conflict[] = []
  const succ = new Map<string, string[]>()
  for (const e of items) {
    for (const d of depsOf(e, k.deps)) {
      if (!byId.has(d)) continue
      succ.set(d, [...(succ.get(d) ?? []), e.id])
      const overlap = span.get(d)!.end - span.get(e.id)!.start
      if (overlap > 0) conflicts.push({ id: e.id, dep: d, overlap })
    }
  }

  const cycles = findCycles(items, k.deps, byId)
  const end = Math.max(0, ...[...span.values()].map((s) => s.end))
  const slack = new Map<string, number>()
  for (const e of items) {
    const stop = Math.min(end, ...(succ.get(e.id) ?? []).map((s) => span.get(s)!.start))
    slack.set(e.id, stop - span.get(e.id)!.end)
  }
  const linked = (e: Entity) => depsOf(e, k.deps).some((d) => byId.has(d)) || succ.has(e.id)
  const critical = new Set(items.filter((e) => linked(e) && slack.get(e.id)! <= 0 && !cycles.includes(e.id)).map((e) => e.id))
  return { span, conflicts, cycles, missing, slack, critical, end }
}

/** Ids that sit on a dependency cycle (including self-dependencies). */
function findCycles(items: Entity[], depsKey: string, byId: Map<string, Entity>): string[] {
  const state = new Map<string, 1 | 2>()
  const onCycle = new Set<string>()
  const stack: string[] = []
  const visit = (id: string) => {
    state.set(id, 1)
    stack.push(id)
    for (const d of depsOf(byId.get(id)!, depsKey)) {
      if (!byId.has(d)) continue
      if (state.get(d) === 1) stack.slice(stack.indexOf(d)).forEach((x) => onCycle.add(x))
      else if (!state.has(d)) visit(d)
    }
    stack.pop()
    state.set(id, 2)
  }
  for (const e of items) if (!state.has(e.id)) visit(e.id)
  return [...onCycle]
}

export const withBuffer = (weeks: number, bufferPct: unknown) => weeks * (1 + Math.max(0, num(bufferPct) ?? 0) / 100)

const MS_DAY = 86_400_000
export function parseDate(s: unknown): Date | null {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const d = new Date(s + 'T00:00:00Z')
  return Number.isNaN(d.getTime()) ? null : d
}

/** Calendar date (YYYY-MM-DD) of the start of the given week offset. */
export function weekToDate(startDate: unknown, week: number): string | null {
  const d = parseDate(startDate)
  return d ? new Date(d.getTime() + Math.round(week * 7) * MS_DAY).toISOString().slice(0, 10) : null
}

/** Total estimated effort of tasks per phase, compared against an optional phase capacity. */
export function phaseLoad(phases: Entity[], tasks: Entity[]) {
  return phases.map((p) => {
    const effort = tasks.filter((t) => t.phase === p.id).reduce((sum, t) => sum + (num(t.effort) ?? 0), 0)
    const capacity = num(p.capacity)
    return { id: p.id, effort, capacity, over: capacity !== undefined && effort > capacity }
  })
}
