import { projectSchema } from '../model/schema'
import { FORMAT_VERSION, type Project } from '../model/types'
import { MODULES, migrateDocument } from '../modules/registry'

export interface LoadResult {
  project: Project
  warnings: string[]
}

type Migration = (p: any) => any
/** formatVersion N -> N+1. Add an entry here whenever the file format changes. */
export const MIGRATIONS: Record<number, Migration> = {}

export const serializeProject = (p: Project) => JSON.stringify(p, null, 2)

export function migrateProject(raw: any, warnings: string[]): any {
  let v = Number(raw?.formatVersion ?? 1)
  if (v > FORMAT_VERSION)
    warnings.push(`File was saved with a newer format (v${v}); unknown data is kept but may not be editable.`)
  while (v < FORMAT_VERSION) {
    const step = MIGRATIONS[v]
    if (!step) throw new Error(`No migration from format v${v}`)
    raw = step(raw)
    v++
    raw.formatVersion = v
  }
  return raw
}

export function deserializeProject(text: string, maxBytes = 50 * 1024 * 1024): LoadResult {
  if (text.length > maxBytes) throw new Error('File is too large')
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('The file is not valid JSON')
  }
  const warnings: string[] = []
  const migrated = migrateProject(raw, warnings)
  const parsed = projectSchema.safeParse(migrated)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    throw new Error(`Invalid project file: ${first.path.join('.')} – ${first.message}`)
  }
  const project = parsed.data as unknown as Project
  for (const m of MODULES) if (project.documents[m.id]) migrateDocument(m, project.documents[m.id])
  return { project, warnings }
}

/** Exports one document (module) so it can be imported into another project. */
export const documentToFile = (project: Project, docId: string) =>
  JSON.stringify(
    { format: 'hands-of-hubris-planner-document', docId, formatVersion: FORMAT_VERSION, document: project.documents[docId] },
    null,
    2,
  )

export function parseDocumentFile(text: string): { docId: string; document: Project['documents'][string] } {
  const raw = JSON.parse(text)
  if (raw?.format !== 'hands-of-hubris-planner-document' || !raw.docId || !raw.document?.data)
    throw new Error('Not a planner document file')
  const m = MODULES.find((x) => x.id === raw.docId)
  if (m) migrateDocument(m, raw.document)
  return { docId: raw.docId, document: raw.document }
}
