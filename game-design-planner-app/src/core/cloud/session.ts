/**
 * Cloud project session: who is signed in, which cloud project is open, and the save loop.
 *
 * The planner store keeps owning the portable project, undo/redo and the dirty flag. This layer
 * owns the server identity (project ID, loaded revision, role) and syncs edits with
 * compare-and-swap saves. Rules (plan §5):
 * - Every save sends the revision it is based on; a stale save returns a conflict and changes nothing.
 * - One save in flight per project; a response only acknowledges the edit generation it carried.
 * - A failed/uncertain save is retried with the same save ID, so a committed retry is not a conflict.
 * - Switching project or account bumps an epoch; late responses and pending timers are ignored.
 * - Unsaved edits are kept in a per-account local draft and never silently discarded.
 */
import { create } from 'zustand'
import { useStore } from '../store/store'
import { deserializeProject, serializeProject } from '../persistence/serialize'
import {
  addSnapshot,
  clearAccountCache,
  deleteCloudDraft,
  readCloudDraft,
  setStorageAccount,
  writeCloudDraft,
} from '../persistence/autosave'
import type { Project } from '../model/types'
import { CloudError, canEdit, getBackend, setBackend, type CloudBackend, type CloudUser, type Role } from './backend'

export type SaveState = 'saved' | 'pending' | 'saving' | 'conflict' | 'offline' | 'error' | 'forbidden'
export type WorkspaceMode = 'local' | 'cloud' | null

export type ActiveProject = { id: string; role: Role; revision: number }

interface CloudState {
  /** True when a backend is configured (otherwise the app is local-only, as before). */
  enabled: boolean
  authReady: boolean
  user: CloudUser | null
  mode: WorkspaceMode
  active: ActiveProject | null
  saveState: SaveState
  error: string | null
  /** Server revision that won when our save was rejected. */
  conflictRevision: number | null
  lastSavedAt: string | null
}

const initial: CloudState = {
  enabled: false,
  authReady: true,
  user: null,
  mode: 'local',
  active: null,
  saveState: 'saved',
  error: null,
  conflictRevision: null,
  lastSavedAt: null,
}

export const useCloud = create<CloudState>(() => ({ ...initial }))

const MODE_KEY = 'hoh.mode'
const ACTIVE_KEY = 'hoh.activeProject'
export const MAX_PAYLOAD_BYTES = 2 * 1024 * 1024

/** Tunables (tests shorten them). */
export const timing = { saveDebounceMs: 1500, draftDebounceMs: 800, snapshotEveryMs: 10 * 60 * 1000, retryMs: [3000, 10000, 30000] }

// ---------- Internal save-loop state (reset on every project switch) ----------
let epoch = 0
let generation = 0
let ackGeneration = 0
let inFlight = false
let pending: { saveId: string; project: Project; generation: number } | null = null
let lastSnapshotAt = 0
let retries = 0
let saveTimer: ReturnType<typeof setTimeout> | undefined
let draftTimer: ReturnType<typeof setTimeout> | undefined
let retryTimer: ReturnType<typeof setTimeout> | undefined
let unsubStore: (() => void) | undefined
let unsubAuth: (() => void) | undefined

const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => ((Math.random() * 16) | 0).toString(16))

function resetLoop() {
  epoch++
  generation = 0
  ackGeneration = 0
  inFlight = false
  pending = null
  retries = 0
  clearTimeout(saveTimer)
  clearTimeout(draftTimer)
  clearTimeout(retryTimer)
}

const safeStorage = (s: () => Storage) => {
  try {
    return s()
  } catch {
    return null
  }
}

// ---------- Init and auth ----------

/** Configures the backend and wires auth + store listeners. Call once at startup (no-op without a backend). */
export async function initCloud(backend: CloudBackend | null) {
  unsubAuth?.()
  unsubStore?.()
  resetLoop()
  setBackend(backend)
  if (!backend) {
    useCloud.setState({ ...initial })
    return
  }
  const storedMode = safeStorage(() => localStorage)?.getItem(MODE_KEY) === 'local' ? 'local' : null
  useCloud.setState({ ...initial, enabled: true, authReady: false, mode: storedMode })
  unsubStore = useStore.subscribe(onStoreChange)
  unsubAuth = backend.onAuthChange((user) => void handleAuthChange(user))
  await handleAuthChange(await backend.getUser().catch(() => null))
}

async function handleAuthChange(user: CloudUser | null) {
  const prev = useCloud.getState().user
  useCloud.setState({ user, authReady: true })
  if (prev?.id === user?.id) return
  if (prev && useCloud.getState().active) closeCloudProject()
  setStorageAccount(user && useCloud.getState().mode !== 'local' ? user.id : null)
  if (user) void getBackend()?.claimInvites().catch(() => 0)
}

/** Chooses local-only mode (remembered on this device). */
export function enterLocalMode() {
  if (useCloud.getState().active) closeCloudProject()
  safeStorage(() => localStorage)?.setItem(MODE_KEY, 'local')
  setStorageAccount(null)
  useCloud.setState({ mode: 'local' })
}

/** Leaves local mode so the landing page / project list is shown again. */
export function leaveLocalMode() {
  safeStorage(() => localStorage)?.removeItem(MODE_KEY)
  useCloud.setState({ mode: null })
  setStorageAccount(useCloud.getState().user?.id ?? null)
}

/** True when unsaved cloud edits would be lost by leaving (caller should confirm). */
export const hasUnsyncedChanges = () => !!useCloud.getState().active && useStore.getState().dirty

export async function signOut() {
  const user = useCloud.getState().user
  closeCloudProject()
  if (user) await clearAccountCache(user.id)
  safeStorage(() => sessionStorage)?.removeItem(ACTIVE_KEY)
  await getBackend()?.signOut()
  setStorageAccount(null)
  useCloud.setState({ user: null, mode: null })
}

// ---------- Opening and closing projects ----------

export type OpenResult = { warnings: string[]; restoredDraft: boolean }

function parsePayload(payload: unknown) {
  // Same untrusted-data path as file import: size check, migrations, Zod validation, warnings.
  return deserializeProject(JSON.stringify(payload), MAX_PAYLOAD_BYTES * 2)
}

/** Loads a cloud project into the planner. Unsaved local drafts are restored, never silently dropped. */
export async function openCloudProject(id: string, opts: { ignoreDraft?: boolean } = {}): Promise<OpenResult> {
  const backend = getBackend()
  const user = useCloud.getState().user
  if (!backend || !user) throw new CloudError('auth', 'Not signed in')
  resetLoop()
  const myEpoch = epoch
  const loaded = await backend.loadProject(id)
  if (myEpoch !== epoch) throw new CloudError('unknown', 'Superseded by another project switch')
  const { project, warnings } = parsePayload(loaded.payload)

  setStorageAccount(user.id)
  const draft = opts.ignoreDraft ? null : await readCloudDraft(user.id, id)
  if (myEpoch !== epoch) throw new CloudError('unknown', 'Superseded by another project switch')
  let restoredDraft = false
  let conflictRevision: number | null = null
  let toLoad = project
  if (draft?.dirty && canEdit(loaded.role)) {
    try {
      toLoad = deserializeProject(draft.json).project
      restoredDraft = true
      if (draft.baseRevision !== loaded.revision) conflictRevision = loaded.revision
    } catch {
      /* unreadable draft: fall back to the server version */
    }
  }

  useStore.getState().loadProject(toLoad)
  useStore.getState().setReadOnly(!canEdit(loaded.role))
  const baseRevision = restoredDraft && draft ? draft.baseRevision : loaded.revision
  useCloud.setState({
    mode: 'cloud',
    active: { id, role: loaded.role, revision: baseRevision },
    saveState: conflictRevision ? 'conflict' : restoredDraft ? 'pending' : 'saved',
    conflictRevision,
    error: null,
    lastSavedAt: null,
  })
  safeStorage(() => sessionStorage)?.setItem(ACTIVE_KEY, id)
  lastSnapshotAt = Date.now()
  if (restoredDraft) {
    useStore.getState().markDirty()
    generation = 1
    if (!conflictRevision) scheduleSave(0)
  }
  return { warnings, restoredDraft }
}

/** Closes the cloud project (pending timers and late responses are dropped; the local draft stays). */
export function closeCloudProject() {
  resetLoop()
  useStore.getState().setReadOnly(false)
  safeStorage(() => sessionStorage)?.removeItem(ACTIVE_KEY)
  useCloud.setState({ active: null, saveState: 'saved', conflictRevision: null, error: null })
}

/** Project ID opened in this tab before a reload, if any. */
export const lastActiveProjectId = () => safeStorage(() => sessionStorage)?.getItem(ACTIVE_KEY) ?? null

/** Uploads a local project as a NEW cloud project (never overwrites an existing one). */
export async function uploadAsNewProject(project: Project): Promise<string> {
  const backend = getBackend()
  if (!backend) throw new CloudError('auth', 'Cloud is not configured')
  if (serializeProject(project).length > MAX_PAYLOAD_BYTES) throw new CloudError('tooLarge', 'Project is larger than 2 MB')
  return backend.createProject(project)
}

// ---------- Save loop ----------

function onStoreChange(s: ReturnType<typeof useStore.getState>, prev: ReturnType<typeof useStore.getState>) {
  const { active, user } = useCloud.getState()
  if (!active || !user || s.project === prev.project || !s.dirty || !canEdit(active.role)) return
  generation++
  scheduleDraft()
  const state = useCloud.getState().saveState
  if (state === 'conflict' || state === 'forbidden') return
  useCloud.setState({ saveState: inFlight ? 'saving' : 'pending' })
  scheduleSave(timing.saveDebounceMs)
}

function scheduleDraft() {
  clearTimeout(draftTimer)
  const myEpoch = epoch
  draftTimer = setTimeout(() => {
    const { active, user } = useCloud.getState()
    if (myEpoch !== epoch || !active || !user) return
    void writeCloudDraft(user.id, active.id, {
      baseRevision: active.revision,
      savedAt: new Date().toISOString(),
      json: serializeProject(useStore.getState().project),
      dirty: useStore.getState().dirty,
    })
  }, timing.draftDebounceMs)
}

function scheduleSave(ms: number) {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => void flushSave(), ms)
}

/** Saves now (Ctrl+S). Resolves when this attempt finishes. */
export async function flushSave(): Promise<void> {
  const backend = getBackend()
  const { active, user, saveState } = useCloud.getState()
  if (!backend || !active || !user || inFlight || !canEdit(active.role)) return
  if (saveState === 'conflict' || saveState === 'forbidden') return
  if (!pending && generation <= ackGeneration) return
  clearTimeout(saveTimer)

  const project = pending?.project ?? useStore.getState().project
  if (!pending) {
    if (serializeProject(project).length > MAX_PAYLOAD_BYTES) {
      useCloud.setState({ saveState: 'error', error: 'tooLarge' })
      return
    }
    pending = { saveId: newId(), project, generation }
  }
  const attempt = pending
  const myEpoch = epoch
  const snapshot = Date.now() - lastSnapshotAt >= timing.snapshotEveryMs
  inFlight = true
  useCloud.setState({ saveState: 'saving' })
  try {
    const res = await backend.saveProject({ id: active.id, baseRevision: active.revision, project: attempt.project, saveId: attempt.saveId, snapshot })
    if (myEpoch !== epoch) return
    inFlight = false
    pending = null
    retries = 0
    if (res.status === 'conflict') {
      useCloud.setState({ saveState: 'conflict', conflictRevision: res.revision })
      return
    }
    if (snapshot) lastSnapshotAt = Date.now()
    ackGeneration = Math.max(ackGeneration, attempt.generation)
    useCloud.setState((s) => ({ active: s.active && { ...s.active, revision: res.revision }, lastSavedAt: new Date().toISOString(), error: null }))
    if (ackGeneration >= generation) {
      useStore.getState().markSaved()
      useCloud.setState({ saveState: 'saved' })
      void deleteCloudDraft(user.id, active.id)
    } else {
      useCloud.setState({ saveState: 'pending' })
      scheduleSave(0)
    }
  } catch (e) {
    if (myEpoch !== epoch) return
    inFlight = false
    const err = e instanceof CloudError ? e : new CloudError('unknown', String(e))
    if (err.code === 'forbidden') {
      // Access revoked or role lowered: keep the local draft, stop saving.
      pending = null
      useCloud.setState({ saveState: 'forbidden', error: err.code })
      return
    }
    if (err.code === 'tooLarge') {
      pending = null
      useCloud.setState({ saveState: 'error', error: err.code })
      return
    }
    // Uncertain outcome: keep `pending` (same save ID) and retry with backoff.
    useCloud.setState({ saveState: err.code === 'network' ? 'offline' : 'error', error: err.code })
    const delay = timing.retryMs[Math.min(retries, timing.retryMs.length - 1)]
    retries++
    clearTimeout(retryTimer)
    retryTimer = setTimeout(() => void flushSave(), delay)
  }
}

if (typeof window !== 'undefined') window.addEventListener('online', () => void flushSave())

// ---------- Conflict resolution (plan §5.6) ----------

/** Backs up the local version as a snapshot, then loads the server version. */
export async function resolveTakeServer() {
  const { active } = useCloud.getState()
  if (!active) return
  await addSnapshot(useStore.getState().project, `Before reload (${new Date().toLocaleString()})`).catch(() => undefined)
  const user = useCloud.getState().user
  if (user) await deleteCloudDraft(user.id, active.id)
  await openCloudProject(active.id, { ignoreDraft: true })
}

/** Saves the local version as a new project and opens it. */
export async function resolveSaveAsNew(copySuffix: string): Promise<string> {
  const { active, user } = useCloud.getState()
  const copy = structuredClone(useStore.getState().project)
  copy.meta.name = `${copy.meta.name} ${copySuffix}`.slice(0, 120)
  const id = await uploadAsNewProject(copy)
  if (active && user) await deleteCloudDraft(user.id, active.id)
  await openCloudProject(id, { ignoreDraft: true })
  return id
}

/** Overwrites the server with the local version after re-checking access and the current revision. */
export async function resolveOverwrite() {
  const backend = getBackend()
  const { active } = useCloud.getState()
  if (!backend || !active) return
  const fresh = await backend.loadProject(active.id)
  if (!canEdit(fresh.role)) {
    useCloud.setState({ saveState: 'forbidden', active: { ...active, role: fresh.role } })
    useStore.getState().setReadOnly(true)
    return
  }
  pending = null
  generation = Math.max(generation, ackGeneration + 1)
  useCloud.setState({ active: { ...active, role: fresh.role, revision: fresh.revision }, saveState: 'pending', conflictRevision: null })
  await flushSave()
}

/** Test helper: resets module state between tests. */
export function __resetCloudForTests() {
  unsubAuth?.()
  unsubStore?.()
  unsubAuth = unsubStore = undefined
  resetLoop()
  setBackend(null)
  setStorageAccount(null)
  useCloud.setState({ ...initial })
}
