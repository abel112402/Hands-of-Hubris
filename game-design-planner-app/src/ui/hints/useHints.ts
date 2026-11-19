import { useEffect, useMemo, useState } from 'react'
import { create } from 'zustand'
import { evaluateHints, makeContext } from '../../core/hints/engine'
import type { Hint } from '../../core/hints/types'
import { useStore } from '../../core/store/store'

const SNOOZE_MS = 30 * 60 * 1000

/** Snooze is per session on purpose; dismiss and mute live in the project file. */
export const useSnooze = create<{ until: Record<string, number>; snooze: (id: string) => void }>((set) => ({
  until: {},
  snooze: (id) => set((s) => ({ until: { ...s.until, [id]: Date.now() + SNOOZE_MS } })),
}))

/** How long a brand-new entry is left alone by hints while it is being filled in (v3 grace period). */
export const GRACE_MS = 60 * 1000

/**
 * Entries just added, by id, with the time their grace ends. Hints about them stay quiet until the user
 * leaves the entry (`release`) or the time runs out. Per session, like snoozing; never in the project.
 */
export const useFreshEntries = create<{ until: Record<string, number>; mark: (id: string) => void; release: (id: string) => void }>((set, get) => ({
  until: {},
  mark: (id) => {
    set((s) => ({ until: { ...s.until, [id]: Date.now() + GRACE_MS } }))
    setTimeout(() => get().release(id), GRACE_MS)
  },
  release: (id) =>
    set((s) => {
      if (!(id in s.until)) return s
      const until = { ...s.until }
      delete until[id]
      return { until }
    }),
}))

/** The hints minus those about entries still in their grace period. */
export function withoutFresh(r: Result, fresh: Record<string, number>, now = Date.now()): Result {
  const quiet = (h: Hint) => !!h.target.entityId && (fresh[h.target.entityId] ?? 0) > now
  if (!r.all.some(quiet)) return r
  const all = r.all.filter((h) => !quiet(h))
  return { all, visible: r.visible.filter((h) => !quiet(h)), total: all.length }
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

type Result = ReturnType<typeof evaluateHints>
/**
 * One evaluation per (project version, snooze state, context), shared by every component that asks:
 * the workspace shows hint counts in several panes, and each used to run all rules again.
 * Keyed weakly by the immutable project and snooze objects, so old versions are garbage-collected.
 */
const cache = new WeakMap<object, WeakMap<object, Map<string, Result>>>()

function evaluateShared(project: Parameters<typeof makeContext>[0], snoozed: Record<string, number>, docId?: string, sectionId?: string, selectedEntityId?: string): Result {
  let bySnooze = cache.get(project)
  if (!bySnooze) cache.set(project, (bySnooze = new WeakMap()))
  let byCtx = bySnooze.get(snoozed)
  if (!byCtx) bySnooze.set(snoozed, (byCtx = new Map()))
  const key = `${docId ?? ''}|${sectionId ?? ''}|${selectedEntityId ?? ''}`
  let r = byCtx.get(key)
  if (!r) byCtx.set(key, (r = evaluateHints(makeContext(project, { docId, sectionId, selectedEntityId }), snoozed)))
  return r
}

export function useHints(docId?: string, sectionId?: string, selectedEntityId?: string) {
  const project = useStore((s) => s.project)
  const snoozed = useSnooze((s) => s.until)
  const fresh = useFreshEntries((s) => s.until)
  // Hints follow edits after a pause, so they do not flicker while typing.
  const settled = useDebounced(project, 400)
  return useMemo(() => withoutFresh(evaluateShared(settled, snoozed, docId, sectionId, selectedEntityId), fresh), [settled, docId, sectionId, selectedEntityId, snoozed, fresh])
}

export type { Hint }
