import { create } from 'zustand'
import { enablePatches, produceWithPatches, applyPatches, type Patch } from 'immer'
import { createProject, makeId } from '../model/project'
import { defaultHintPrefs, type HintPrefs, type Project } from '../model/types'
import { getModule, ensureDocument } from '../modules/registry'

enablePatches()

interface HistoryEntry {
  patches: Patch[]
  inverse: Patch[]
  key?: string
  at: number
}

interface State {
  project: Project
  fileName?: string
  dirty: boolean
  past: HistoryEntry[]
  future: HistoryEntry[]
  mutate: (fn: (p: Project) => void, key?: string) => void
  updateHintPrefs: (fn: (h: HintPrefs) => void) => void
  undo: () => void
  redo: () => void
  loadProject: (p: Project, fileName?: string) => void
  markSaved: (fileName?: string) => void
  ensureDoc: (docId: string) => void
}

const COALESCE_MS = 1000
const MAX_HISTORY = 200

export const useStore = create<State>((set, get) => ({
  project: createProject(),
  dirty: false,
  past: [],
  future: [],

  mutate: (fn, key) => {
    const [next, patches, inverse] = produceWithPatches(get().project, (d) => {
      fn(d)
      d.meta.updatedAt = new Date().toISOString()
    })
    if (patches.length <= 1) return
    const now = Date.now()
    const past = [...get().past]
    const last = past[past.length - 1]
    if (key && last && last.key === key && now - last.at < COALESCE_MS) {
      past[past.length - 1] = { ...last, patches: [...last.patches, ...patches], inverse: [...inverse, ...last.inverse], at: now }
    } else {
      past.push({ patches, inverse, key, at: now })
    }
    set({ project: next, dirty: true, past: past.slice(-MAX_HISTORY), future: [] })
  },

  // Hint preferences are saved with the project but are not undoable.
  updateHintPrefs: (fn) => {
    const [next] = produceWithPatches(get().project, (d) => {
      d.meta.hints ??= defaultHintPrefs()
      fn(d.meta.hints)
    })
    if (next !== get().project) set({ project: next, dirty: true })
  },

  undo: () => {
    const { past, future, project } = get()
    const entry = past[past.length - 1]
    if (!entry) return
    set({ project: applyPatches(project, entry.inverse), past: past.slice(0, -1), future: [...future, entry], dirty: true })
  },

  redo: () => {
    const { past, future, project } = get()
    const entry = future[future.length - 1]
    if (!entry) return
    set({ project: applyPatches(project, entry.patches), future: future.slice(0, -1), past: [...past, { ...entry, key: undefined }], dirty: true })
  },

  loadProject: (project, fileName) => set({ project, fileName, dirty: false, past: [], future: [] }),
  markSaved: (fileName) => set((s) => ({ dirty: false, fileName: fileName ?? s.fileName })),

  ensureDoc: (docId) => {
    const m = getModule(docId)
    if (!m) return
    const doc = get().project.documents[docId]
    const needs = !doc || Object.keys(doc.data).length === 0
    // Only creates missing sections; not recorded in undo history.
    const [next] = produceWithPatches(get().project, (p) => {
      ensureDocument(p, m, makeId, needs)
    })
    if (next !== get().project) set({ project: next })
  },
}))
