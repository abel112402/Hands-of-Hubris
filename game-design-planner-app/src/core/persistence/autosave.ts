import { get, set, del, keys } from 'idb-keyval'
import { deserializeProject, serializeProject } from './serialize'
import type { Project } from '../model/types'

/** Legacy local-only keys (unchanged, so existing autosaves and snapshots keep working). */
const AUTOSAVE = 'hohplan:autosave'
const SNAPSHOTS = 'hohplan:snapshots'
const MAX_SNAPSHOTS = 10
const CLOUD_PREFIX = 'hohplan:cloud:'

export interface Snapshot {
  name: string
  savedAt: string
  json: string
}

/**
 * Snapshot namespace: null = local mode (legacy key); a user ID = that account's cloud snapshots,
 * so one account never lists another account's projects on a shared device.
 */
let accountNs: string | null = null
export const setStorageAccount = (userId: string | null) => {
  accountNs = userId
}
const snapshotsKey = () => (accountNs ? `${CLOUD_PREFIX}${accountNs}:snapshots` : SNAPSHOTS)

export async function writeAutosave(project: Project) {
  await set(AUTOSAVE, { savedAt: new Date().toISOString(), json: serializeProject(project) })
}

export async function readAutosave(): Promise<{ savedAt: string; project: Project } | null> {
  try {
    const v = await get<{ savedAt: string; json: string }>(AUTOSAVE)
    if (!v) return null
    return { savedAt: v.savedAt, project: deserializeProject(v.json).project }
  } catch {
    return null
  }
}

export const clearAutosave = () => del(AUTOSAVE)

export async function listSnapshots(): Promise<Snapshot[]> {
  try {
    return (await get<Snapshot[]>(snapshotsKey())) ?? []
  } catch {
    return []
  }
}

export async function addSnapshot(project: Project, name: string) {
  const list = await listSnapshots()
  list.unshift({ name, savedAt: new Date().toISOString(), json: serializeProject(project) })
  await set(snapshotsKey(), list.slice(0, MAX_SNAPSHOTS))
}

export async function deleteSnapshot(savedAt: string) {
  await set(snapshotsKey(), (await listSnapshots()).filter((s) => s.savedAt !== savedAt))
}

// ---------- Per-account, per-cloud-project recovery drafts ----------

/** Local copy of a cloud project's latest edits, used to recover unsaved work after a reload or crash. */
export interface CloudDraft {
  baseRevision: number
  savedAt: string
  json: string
  /** True while the draft holds edits the server has not acknowledged. */
  dirty: boolean
}

const draftKey = (userId: string, projectId: string) => `${CLOUD_PREFIX}${userId}:draft:${projectId}`

// Draft storage is best effort (private browsing or quota can block IndexedDB); failures never break saving.
export async function writeCloudDraft(userId: string, projectId: string, draft: CloudDraft) {
  try {
    await set(draftKey(userId, projectId), draft)
  } catch {
    /* best effort */
  }
}

export async function readCloudDraft(userId: string, projectId: string): Promise<CloudDraft | null> {
  try {
    return (await get<CloudDraft>(draftKey(userId, projectId))) ?? null
  } catch {
    return null
  }
}

export async function deleteCloudDraft(userId: string, projectId: string) {
  try {
    await del(draftKey(userId, projectId))
  } catch {
    /* best effort */
  }
}

/** Removes every cached cloud draft and snapshot of an account (used on sign-out). */
export async function clearAccountCache(userId: string) {
  const prefix = `${CLOUD_PREFIX}${userId}:`
  try {
    for (const k of await keys()) if (typeof k === 'string' && k.startsWith(prefix)) await del(k)
  } catch {
    /* best effort */
  }
}
