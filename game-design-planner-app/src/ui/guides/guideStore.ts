import { create } from 'zustand'
import type { GuideStep } from '../../core/guides/types'
import type { Project } from '../../core/model/types'

const key = (project: string, docId: string) => `hohplan:guide:${project}:${docId}`

/** Steps ticked by hand, per project name and document. Browser-local; the guide works without it. */
export function readManual(project: string, docId: string): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(key(project, docId)) ?? '[]')
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}

function writeManual(project: string, docId: string, ids: string[]) {
  try {
    localStorage.setItem(key(project, docId), JSON.stringify(ids))
  } catch {
    /* storage unavailable: the tick lasts for this session only */
  }
}

/** Session-only guide UI state. */
export const useGuideUi = create<{
  /** Step whose control is spotlighted, as `${docId}/${stepId}`. */
  spotlight: string | null
  setSpotlight: (s: string | null) => void
  /** Section whose example picker is open. */
  picker: string | null
  openPicker: (section: string | null) => void
  manual: Record<string, string[]>
  toggleManual: (project: string, docId: string, stepId: string) => void
}>((set, get) => ({
  spotlight: null,
  setSpotlight: (spotlight) => set({ spotlight }),
  picker: null,
  openPicker: (picker) => set({ picker }),
  manual: {},
  toggleManual: (project, docId, stepId) => {
    const k = key(project, docId)
    const cur = get().manual[k] ?? readManual(project, docId)
    const next = cur.includes(stepId) ? cur.filter((x) => x !== stepId) : [...cur, stepId]
    writeManual(project, docId, next)
    set({ manual: { ...get().manual, [k]: next } })
  },
}))

export function useManualDone(project: Project, docId: string): string[] {
  const k = key(project.meta.name, docId)
  const cached = useGuideUi((s) => s.manual[k])
  return cached ?? readManual(project.meta.name, docId)
}

export const stepDone = (step: GuideStep, project: Project, manual: string[]) => (step.done ? step.done(project) : manual.includes(step.id))
