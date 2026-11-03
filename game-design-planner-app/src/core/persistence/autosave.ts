import { get, set, del } from 'idb-keyval'
import { deserializeProject, serializeProject } from './serialize'
import type { Project } from '../model/types'

const AUTOSAVE = 'hohplan:autosave'
const SNAPSHOTS = 'hohplan:snapshots'
const MAX_SNAPSHOTS = 10

export interface Snapshot {
  name: string
  savedAt: string
  json: string
}

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
    return (await get<Snapshot[]>(SNAPSHOTS)) ?? []
  } catch {
    return []
  }
}

export async function addSnapshot(project: Project, name: string) {
  const list = await listSnapshots()
  list.unshift({ name, savedAt: new Date().toISOString(), json: serializeProject(project) })
  await set(SNAPSHOTS, list.slice(0, MAX_SNAPSHOTS))
}

export async function deleteSnapshot(savedAt: string) {
  await set(SNAPSHOTS, (await listSnapshots()).filter((s) => s.savedAt !== savedAt))
}
