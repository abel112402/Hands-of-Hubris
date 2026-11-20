import type { EmittedFile } from './adapter'

/**
 * Writing the engine export straight into a folder of the engine project (File System Access API), with the same rules
 * as the Unity bridge's importer: generated folders are replaced, your own class files are only created when missing.
 * Works on the small interfaces below, which a FileSystemDirectoryHandle satisfies, so tests can use an in-memory folder.
 */
export interface FolderFile {
  kind: 'file'
  name: string
  getFile(): Promise<{ text(): Promise<string> }>
  createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>
}
export interface Folder {
  kind: 'directory'
  name: string
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<Folder>
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FolderFile>
  removeEntry(name: string): Promise<void>
  values(): AsyncIterable<Folder | FolderFile>
}

export const MANIFEST = 'hoh-engine.json'
export const REPORT_FILE = 'hoh-engine-report.json'
/** Your code: written only when the file is not there yet. */
export const YOURS_PREFIX = 'Unity/Scripts/Classes/'
/** Folders the export owns completely; files in them that the export no longer has are deleted. */
export const OWNED_PREFIXES = ['Unity/Scripts/Generated/', 'Data/', 'ir/', 'Localization/', 'Maps/']

const parts = (path: string) => path.split('/').filter(Boolean)
const isNotFound = (e: unknown) => (e as { name?: string })?.name === 'NotFoundError' || (e as { name?: string })?.name === 'TypeMismatchError'

async function dirAt(root: Folder, path: string[], create: boolean): Promise<Folder | null> {
  let d = root
  for (const p of path) {
    try {
      d = await d.getDirectoryHandle(p, { create })
    } catch (e) {
      if (!create && isNotFound(e)) return null
      throw e
    }
  }
  return d
}

/** The text of a file under the folder, or null when it does not exist. */
export async function readText(root: Folder, path: string): Promise<string | null> {
  const p = parts(path)
  const dir = await dirAt(root, p.slice(0, -1), false)
  if (!dir) return null
  try {
    return await (await (await dir.getFileHandle(p[p.length - 1])).getFile()).text()
  } catch (e) {
    if (isNotFound(e)) return null
    throw e
  }
}

async function writeText(root: Folder, path: string, text: string): Promise<void> {
  const p = parts(path)
  const dir = (await dirAt(root, p.slice(0, -1), true))!
  const w = await (await dir.getFileHandle(p[p.length - 1], { create: true })).createWritable()
  await w.write(text)
  await w.close()
}

async function listFiles(dir: Folder, prefix: string, out: string[] = []): Promise<string[]> {
  for await (const e of dir.values()) {
    if (e.kind === 'directory') await listFiles(e, `${prefix}${e.name}/`, out)
    else out.push(`${prefix}${e.name}`)
  }
  return out
}

export type FolderState = { hasExport: boolean; projectName?: string; empty: boolean; unityProject: boolean }

/** What is in a folder before the first write: an earlier export (of which project), nothing, or a Unity project's root. */
export async function folderState(root: Folder): Promise<FolderState> {
  const names: string[] = []
  for await (const e of root.values()) names.push(e.name)
  const manifest = names.includes(MANIFEST) ? await readText(root, MANIFEST) : null
  let projectName: string | undefined
  try {
    projectName = manifest ? String(JSON.parse(manifest)?.project?.name ?? '') : undefined
  } catch {
    projectName = undefined
  }
  return { hasExport: manifest !== null, projectName, empty: names.filter((n) => !n.startsWith('.')).length === 0, unityProject: names.includes('Assets') && names.includes('ProjectSettings') }
}

/** For a Unity project's root folder, its Assets/HoHPlanner (created); otherwise the folder itself. */
export async function exportFolderIn(root: Folder): Promise<{ folder: Folder; path: string }> {
  const s = await folderState(root)
  if (!s.unityProject) return { folder: root, path: '' }
  return { folder: (await dirAt(root, ['Assets', 'HoHPlanner'], true))!, path: 'Assets/HoHPlanner' }
}

export type WriteResult = { written: number; unchanged: number; deleted: number; keptYours: number; codeChanged: boolean }

/**
 * Writes the export's files into the folder. Unchanged files are not touched (so the engine does not reimport them),
 * your own class files are only created, and stale generated files are deleted — but only when the folder already held
 * an export, so a wrongly chosen folder never loses files.
 */
export async function writeExport(root: Folder, files: EmittedFile[]): Promise<WriteResult> {
  const result: WriteResult = { written: 0, unchanged: 0, deleted: 0, keptYours: 0, codeChanged: false }
  const ours = (await readText(root, MANIFEST)) !== null
  for (const f of files) {
    const existing = await readText(root, f.path)
    if (f.path.startsWith(YOURS_PREFIX) && existing !== null) {
      result.keptYours++
      continue
    }
    if (existing === f.content) {
      result.unchanged++
      continue
    }
    // The manifest goes last, so an engine watching it sees a complete export.
    if (f.path === MANIFEST) continue
    await writeText(root, f.path, f.content)
    result.written++
    if (/\.(cs|asmdef)$/.test(f.path)) result.codeChanged = true
  }
  const manifest = files.find((f) => f.path === MANIFEST)
  if (manifest && (await readText(root, MANIFEST)) !== manifest.content) {
    await writeText(root, MANIFEST, manifest.content)
    result.written++
  }
  if (!ours) return result
  const keep = new Set(files.map((f) => f.path))
  for (const prefix of OWNED_PREFIXES) {
    const dir = await dirAt(root, parts(prefix), false)
    if (!dir) continue
    for (const rel of await listFiles(dir, prefix)) {
      if (rel.endsWith('.meta') || keep.has(rel)) continue
      const p = parts(rel)
      const parent = (await dirAt(root, p.slice(0, -1), false))!
      await parent.removeEntry(p[p.length - 1])
      // Unity's .meta of the removed file would otherwise be left behind.
      await parent.removeEntry(`${p[p.length - 1]}.meta`).catch(() => undefined)
      result.deleted++
      if (rel.endsWith('.cs')) result.codeChanged = true
    }
  }
  return result
}

export const describeWrite = (r: WriteResult) =>
  `${r.written} written, ${r.unchanged} unchanged, ${r.deleted} removed, ${r.keptYours} of your class files kept${r.codeChanged ? '; the engine recompiles' : ''}`
