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
  // Hints follow edits after a pause, so they do not flicker while typing.
  const settled = useDebounced(project, 400)
  return useMemo(() => evaluateShared(settled, snoozed, docId, sectionId, selectedEntityId), [settled, docId, sectionId, selectedEntityId, snoozed])
}

export type { Hint }
