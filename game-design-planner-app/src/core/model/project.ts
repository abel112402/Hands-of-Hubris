import { nanoid } from 'nanoid'
import { defaultRegistry } from './catalogs'
import { APP_VERSION, FORMAT, FORMAT_VERSION, type Project } from './types'
import { MODULES, ensureDocument } from '../modules/registry'

export const makeId = () => nanoid(8)

export function createProject(name = 'Hands of Hubris', seeded = true): Project {
  const now = new Date().toISOString()
  const project: Project = {
    format: FORMAT,
    formatVersion: FORMAT_VERSION,
    meta: { name, createdAt: now, updatedAt: now, appVersion: APP_VERSION },
    registry: defaultRegistry(),
    documents: {},
    links: [],
  }
  if (seeded) for (const m of MODULES) ensureDocument(project, m, makeId, true)
  return project
}
