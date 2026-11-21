import type { EmittedFile } from './adapter'
import { ENGINE_ADAPTERS } from './adapters'
import { ownMoves, renameIn, type OwnMove } from './renames'

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
/** Your code (every engine's): written only when the file is not there yet. */
export const YOURS_PREFIXES = ENGINE_ADAPTERS.map((a) => `${a.root}/${a.ownDir}`)
/** Folders the export owns completely; files in them that the export no longer has are deleted. */
export const OWNED_PREFIXES = [...ENGINE_ADAPTERS.flatMap((a) => a.generatedDirs.map((d) => `${a.root}/${d}`)), 'Data/', 'ir/', 'Localization/', 'Maps/']
/** Files an engine keeps next to a file of the export (Unity .meta, Godot .import and .uid); they go when that file goes. */
const SIDECARS = ['.meta', '.import', '.uid']
/** Files an engine makes from one of the export's files (Godot's imported translations); never deleted by the export. */
const ENGINE_MADE = /\.translation$/

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

export type FolderState = { hasExport: boolean; projectName?: string; empty: boolean; unityProject: boolean; godotProject: boolean; unrealProject: boolean }

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
  return { hasExport: manifest !== null, projectName, empty: names.filter((n) => !n.startsWith('.')).length === 0, unityProject: names.includes('Assets') && names.includes('ProjectSettings'), godotProject: names.includes('project.godot'), unrealProject: names.some((n) => n.endsWith('.uproject')) }
}

/** For a Unity project's root folder, its Assets/HoHPlanner; for a Godot project's, res://HoHPlanner; for an Unreal project's, Plugins/HoHPlanner (created); otherwise the folder itself. */
export async function exportFolderIn(root: Folder): Promise<{ folder: Folder; path: string }> {
  const s = await folderState(root)
  if (s.godotProject) return { folder: (await dirAt(root, ['HoHPlanner'], true))!, path: 'HoHPlanner' }
  // A project plugin: Unreal finds Unreal/PlannerGame.uplugin under Plugins/ and builds it with the game.
  if (s.unrealProject) return { folder: (await dirAt(root, ['Plugins', 'HoHPlanner'], true))!, path: 'Plugins/HoHPlanner' }
  if (!s.unityProject) return { folder: root, path: '' }
  return { folder: (await dirAt(root, ['Assets', 'HoHPlanner'], true))!, path: 'Assets/HoHPlanner' }
}

export type WriteResult = {
  written: number
  unchanged: number
  deleted: number
  keptYours: number
  codeChanged: boolean
  /** Your class files moved with their renamed class, “old → new”. */
  moved: string[]
}

async function removeFile(root: Folder, path: string): Promise<void> {
  const p = parts(path)
  const dir = await dirAt(root, p.slice(0, -1), false)
  await dir?.removeEntry(p[p.length - 1]).catch(() => undefined)
}

/**
 * Your class files follow a renamed class: compared with the class index already in the folder, a class whose own
 * files now have other paths gets them moved there with the names inside changed (and the engine's .meta / .uid with
 * them, so Unity keeps the script's GUID and the scenes that use it). A file already at the new path is left alone.
 */
async function moveRenamedOwnFiles(root: Folder, files: EmittedFile[], result: WriteResult): Promise<void> {
  for (const a of ENGINE_ADAPTERS) {
    if (!a.classIndex) continue
    const path = `${a.root}/${a.classIndex}`
    const next = files.find((f) => f.path === path)
    const prev = await readText(root, path)
    if (!next || prev === null) continue
    let oldIndex: unknown
    try {
      oldIndex = JSON.parse(prev)
    } catch {
      continue
    }
    const moves = ownMoves(oldIndex, JSON.parse(next.content))
    // A class's files move together (Unreal: header and .cpp) or not at all.
    for (const id of new Set(moves.map((m) => m.plannerId))) {
      const group = moves.filter((m) => m.plannerId === id)
      const texts = await Promise.all(group.map((m) => readText(root, m.from)))
      const taken = await Promise.all(group.map((m) => readText(root, m.to)))
      if (texts.some((t) => t === null) || taken.some((t) => t !== null)) continue
      for (const [i, m] of group.entries()) await moveOne(root, m, texts[i]!, result)
    }
  }
}

async function moveOne(root: Folder, m: OwnMove, text: string, result: WriteResult): Promise<void> {
  await writeText(root, m.to, renameIn(text, m.replace))
  await removeFile(root, m.from)
  for (const x of SIDECARS) {
    const side = await readText(root, m.from + x)
    if (side === null) continue
    await writeText(root, m.to + x, side)
    await removeFile(root, m.from + x)
  }
  result.moved.push(`${m.from} → ${m.to}`)
  result.codeChanged = true
}

/**
 * Writes the export's files into the folder. Unchanged files are not touched (so the engine does not reimport them),
 * your own class files are only created, and stale generated files are deleted — but only when the folder already held
 * an export, so a wrongly chosen folder never loses files.
 */
export async function writeExport(root: Folder, files: EmittedFile[]): Promise<WriteResult> {
  const result: WriteResult = { written: 0, unchanged: 0, deleted: 0, keptYours: 0, codeChanged: false, moved: [] }
  const ours = (await readText(root, MANIFEST)) !== null
  if (ours) await moveRenamedOwnFiles(root, files, result)
  for (const f of files) {
    const existing = await readText(root, f.path)
    // A folder the export owns wins over a “yours” folder around it (Unreal: Source/PlannerGame/Generated/ in your module).
    if (YOURS_PREFIXES.some((p) => f.path.startsWith(p)) && !OWNED_PREFIXES.some((p) => f.path.startsWith(p)) && existing !== null) {
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
    if (/\.(cs|asmdef|gd|h|cpp)$/.test(f.path)) result.codeChanged = true
  }
  const manifest = files.find((f) => f.path === MANIFEST)
  const oldManifest = await readText(root, MANIFEST)
  // A manifest that differs only in its export time is not a change: rewriting it would make the engine reimport for nothing.
  if (manifest && oldManifest !== manifest.content) {
    if (result.written === 0 && sameButTime(oldManifest, manifest.content)) result.unchanged++
    else {
      await writeText(root, MANIFEST, manifest.content)
      result.written++
    }
  }
  if (!ours) return result
  const keep = new Set(files.map((f) => f.path))
  for (const prefix of OWNED_PREFIXES) {
    const dir = await dirAt(root, parts(prefix), false)
    if (!dir) continue
    for (const rel of await listFiles(dir, prefix)) {
      // An engine's sidecar goes only together with its file (below); what the engine made from a file stays.
      if (keep.has(rel) || ENGINE_MADE.test(rel) || SIDECARS.some((x) => rel.endsWith(x))) continue
      const p = parts(rel)
      const parent = (await dirAt(root, p.slice(0, -1), false))!
      await parent.removeEntry(p[p.length - 1])
      // The engine's .meta / .import / .uid of the removed file would otherwise be left behind.
      for (const x of SIDECARS) await parent.removeEntry(`${p[p.length - 1]}${x}`).catch(() => undefined)
      result.deleted++
      if (/\.(cs|gd|h|cpp)$/.test(rel)) result.codeChanged = true
    }
  }
  return result
}

function sameButTime(a: string | null, b: string): boolean {
  if (a === null) return false
  try {
    const x = JSON.parse(a)
    const y = JSON.parse(b)
    delete x.exportedAt
    delete y.exportedAt
    return JSON.stringify(x) === JSON.stringify(y)
  } catch {
    return false
  }
}

export const describeWrite = (r: WriteResult) =>
  `${r.written} written, ${r.unchanged} unchanged, ${r.deleted} removed, ${r.keptYours} of your class files kept${r.moved.length ? `, ${r.moved.length} moved with their renamed class` : ''}${r.codeChanged ? '; the engine recompiles' : ''}`
