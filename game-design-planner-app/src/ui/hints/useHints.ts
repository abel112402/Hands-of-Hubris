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

export function useHints(docId?: string, sectionId?: string, selectedEntityId?: string) {
  const project = useStore((s) => s.project)
  const snoozed = useSnooze((s) => s.until)
  // Hints follow edits after a pause, so they do not flicker while typing.
  const settled = useDebounced(project, 400)
  return useMemo(
    () => evaluateHints(makeContext(settled, { docId, sectionId, selectedEntityId }), snoozed),
    [settled, docId, sectionId, selectedEntityId, snoozed],
  )
}

export type { Hint }
