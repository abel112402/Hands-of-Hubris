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
  /** Viewer access to a shared project: every edit path is a no-op (the server enforces it too). */
  readOnly: boolean
  setReadOnly: (readOnly: boolean) => void
  /** Marks the loaded project as having unsaved edits (e.g. a restored recovery draft). */
  markDirty: () => void
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
  readOnly: false,
  past: [],
  future: [],

  setReadOnly: (readOnly) => set({ readOnly }),
  markDirty: () => set({ dirty: true }),

  mutate: (fn, key) => {
    if (get().readOnly) return
    const [next, patches, inverse] = produceWithPatches(get().project, (d) => {
      fn(d)
      d.meta.updatedAt = new Date().toISOString()
    })
    // Only the timestamp changed (or nothing): not an edit. Counting patches is not enough, because the
    // timestamp produces no patch when two edits land in the same millisecond.
    if (!patches.some((p) => !(p.path[0] === 'meta' && p.path[1] === 'updatedAt'))) return
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
    if (get().readOnly) return
    const [next] = produceWithPatches(get().project, (d) => {
      d.meta.hints ??= defaultHintPrefs()
      fn(d.meta.hints)
    })
    if (next !== get().project) set({ project: next, dirty: true })
  },

  undo: () => {
    if (get().readOnly) return
    const { past, future, project } = get()
    const entry = past[past.length - 1]
    if (!entry) return
    set({ project: applyPatches(project, entry.inverse), past: past.slice(0, -1), future: [...future, entry], dirty: true })
  },

  redo: () => {
    if (get().readOnly) return
    const { past, future, project } = get()
    const entry = future[future.length - 1]
    if (!entry) return
    set({ project: applyPatches(project, entry.patches), future: future.slice(0, -1), past: [...past, { ...entry, key: undefined }], dirty: true })
  },

  // Replacing the project clears history (no stale patches across projects/revisions) and edit locks.
  loadProject: (project, fileName) => set({ project, fileName, dirty: false, readOnly: false, past: [], future: [] }),
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
