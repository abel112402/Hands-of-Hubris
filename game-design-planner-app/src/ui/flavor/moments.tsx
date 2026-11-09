import { useEffect } from 'react'
import { create } from 'zustand'
import { useTranslation } from 'react-i18next'
import i18n from '../../core/i18n'
import { useStore } from '../../core/store/store'
import { crossedMilestones, momentAllowed } from '../../core/flavor/milestones'
import { resolveFlavor, useFlavorLevel, type FlavorOpts } from './Flavor'

/**
 * Moments: a short-lived aside for something that just happened (a finished phase, a milestone).
 * One at a time, rate-limited, and never stored in the project.
 */
type MomentState = {
  moment: { id: number; text: string } | null
  lastAt: number | null
  /** Shows the line for these keys. `force` skips the rate limit (reserved for the phase-complete moment). */
  announce: (opts: FlavorOpts, force?: boolean) => boolean
  dismiss: () => void
}

let seq = 0
export const useMoments = create<MomentState>((set, get) => ({
  moment: null,
  lastAt: null,
  announce: (opts, force = false) => {
    const now = Date.now()
    if (!momentAllowed(now, get().lastAt, force)) return false
    const text = resolveFlavor(i18n, useFlavorLevel.getState().level, opts)
    if (!text) return false
    set({ moment: { id: ++seq, text }, lastAt: now })
    return true
  },
  dismiss: () => set({ moment: null }),
}))

const SHOW_MS = 6000

/** Bottom corner bubble. Polite live region, so a screen reader hears it once without interruption. */
export function FlavorToast() {
  const { t } = useTranslation()
  const moment = useMoments((s) => s.moment)
  useEffect(() => {
    if (!moment) return
    const id = setTimeout(() => useMoments.getState().dismiss(), SHOW_MS)
    return () => clearTimeout(id)
  }, [moment])
  return (
    <div className="flavor-toast-region" role="status" aria-live="polite">
      {moment && (
        <div key={moment.id} className="flavor-toast">
          <span>{moment.text}</span>
          <button className="banner-close" aria-label={t('flavor.dismiss')} onClick={() => useMoments.getState().dismiss()}>×</button>
        </div>
      )}
    </div>
  )
}

/** Milestones already celebrated, per project (keyed by creation time: projects have no id). Browser-local. */
const seenKey = (createdAt: string) => `hohplan:flavor:seen:${createdAt}`

function readSeen(createdAt: string): Set<string> {
  try {
    const v = JSON.parse(localStorage.getItem(seenKey(createdAt)) ?? '[]')
    return new Set(Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [])
  } catch {
    return new Set()
  }
}

function markSeen(createdAt: string, ids: string[]) {
  try {
    localStorage.setItem(seenKey(createdAt), JSON.stringify([...readSeen(createdAt), ...ids]))
  } catch {
    /* storage unavailable: the milestone may show again next session */
  }
}

/** Watches edits for milestones. Mount once (AppShell). Only `full` personality shows them. */
export function useMilestones() {
  useEffect(
    () =>
      useStore.subscribe((s, prev) => {
        if (s.project === prev.project || s.readOnly) return
        // Opening or creating another project is not an edit.
        if (s.project.meta.createdAt !== prev.project.meta.createdAt) return
        if (useFlavorLevel.getState().level !== 'full') return
        const createdAt = s.project.meta.createdAt
        const hits = crossedMilestones(prev.project, s.project, readSeen(createdAt))
        if (!hits.length) return
        const m = hits[hits.length - 1]
        if (useMoments.getState().announce({ keys: `flavor.milestone.${m.id}`, ctx: createdAt, min: 'full' })) markSeen(createdAt, [m.id])
      }),
    [],
  )
}
