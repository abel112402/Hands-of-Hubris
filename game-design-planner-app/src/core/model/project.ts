import { nanoid } from 'nanoid'
import { defaultRegistry } from './catalogs'
import { APP_VERSION, FORMAT, FORMAT_VERSION, type Project, type ProjectProfile } from './types'
import { MODULES, ensureDocument } from '../modules/registry'

export const makeId = () => nanoid(8)

/** `profile` is optional: without it the project is genre-neutral (same as older files). */
export function createProject(name = 'Hands of Hubris', seeded = true, profile?: ProjectProfile): Project {
  const now = new Date().toISOString()
  const project: Project = {
    format: FORMAT,
    formatVersion: FORMAT_VERSION,
    meta: { name, createdAt: now, updatedAt: now, appVersion: APP_VERSION, ...(profile && { profile: structuredClone(profile) }) },
    registry: defaultRegistry(),
    documents: {},
    links: [],
  }
  if (seeded) for (const m of MODULES) ensureDocument(project, m, makeId, true)
  return project
}
