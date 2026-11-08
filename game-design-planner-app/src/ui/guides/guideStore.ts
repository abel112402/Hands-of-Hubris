import { create } from 'zustand'
import type { GuideStep } from '../../core/guides/types'
import type { Project } from '../../core/model/types'
import { useStore } from '../../core/store/store'
import { readGuideState, setModuleStepManual } from '../../core/walkthrough/evaluate'

/** Legacy browser-local ticks (before they moved into the project file), keyed by project name. */
const legacyKey = (project: string, docId: string) => `hohplan:guide:${project}:${docId}`

export function readLegacyManual(project: string, docId: string): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(legacyKey(project, docId)) ?? '[]')
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}

function dropLegacy(project: string, docId: string) {
  try {
    localStorage.removeItem(legacyKey(project, docId))
  } catch {
    /* storage unavailable: nothing to clean up */
  }
}

/**
 * Module-guide steps ticked by hand. Saved in the project file (`meta.guide.modules`), so they are
 * shared with teammates and survive renames. Old browser-local ticks are shown until the first
 * change, which moves them into the project (one undo step) and removes the old key.
 */
export function manualDone(project: Project, docId: string): string[] {
  const saved = readGuideState(project).modules?.[docId] ?? []
  const legacy = readLegacyManual(project.meta.name, docId)
  return legacy.length ? [...new Set([...saved, ...legacy])] : saved
}

export function toggleManual(docId: string, stepId: string) {
  const { project, readOnly } = useStore.getState()
  if (readOnly) return
  const name = project.meta.name
  const current = manualDone(project, docId)
  useStore.getState().mutate((p) => {
    for (const id of current) setModuleStepManual(p, docId, id, true)
    setModuleStepManual(p, docId, stepId, !current.includes(stepId))
  })
  dropLegacy(name, docId)
}

/** Session-only guide UI state. */
export const useGuideUi = create<{
  /** Step whose control is spotlighted, as `${docId}/${stepId}`. */
  spotlight: string | null
  setSpotlight: (s: string | null) => void
  /** Section whose example picker is open. */
  picker: string | null
  openPicker: (section: string | null) => void
}>((set) => ({
  spotlight: null,
  setSpotlight: (spotlight) => set({ spotlight }),
  picker: null,
  openPicker: (picker) => set({ picker }),
}))

export const useManualDone = (project: Project, docId: string): string[] => manualDone(project, docId)

export const stepDone = (step: GuideStep, project: Project, manual: string[]) => (step.done ? step.done(project) : manual.includes(step.id))
