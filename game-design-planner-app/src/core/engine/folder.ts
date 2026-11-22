import type { EmittedFile } from './adapter'
import { ENGINE_ADAPTERS } from './adapters'
import { ownMoves, renameIn, type OwnMove } from './renames'
import { countOf } from '../text'
import { BACKUP_DIR, backupStamp, JOURNAL, KEEP_BACKUPS, planExport, type ExportPlan, type Journal } from './ownership'

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
  /** Files in generated folders left alone because the planner did not write them (or they changed since). */
  keptNotOurs: string[]
  /** Files the export would overwrite that changed since the last export, or that it did not write. */
  conflicts: string[]
  /** True when the write stopped on conflicts before writing anything. */
  stopped: boolean
  /** The backup folder of this write (under .hoh-backup/), when it overwrote or removed anything. */
  backup?: string
}
export type WriteOptions = {
  /** Overwrite conflicting files (their old text goes into the backup first). Default: stop on conflicts. */
  overwrite?: boolean
  /** Time of the write, for the backup folder's name. */
  now?: Date
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

/** Files now in the generated folders, without engine sidecars and engine-made files. */
async function generatedFiles(root: Folder): Promise<string[]> {
  const out: string[] = []
  for (const prefix of OWNED_PREFIXES) {
    const dir = await dirAt(root, parts(prefix), false)
    if (!dir) continue
    for (const rel of await listFiles(dir, prefix)) if (!ENGINE_MADE.test(rel) && !SIDECARS.some((x) => rel.endsWith(x))) out.push(rel)
  }
  return out
}

/**
 * What writing these files would do, file by file, without writing anything (ownership.ts has the rules). Generated
 * files are only considered for removal when the folder already holds an export, so a wrongly chosen folder never loses files.
 */
export async function previewExport(root: Folder, files: EmittedFile[]): Promise<ExportPlan> {
  const oldManifest = await readText(root, MANIFEST)
  const generatedOnDisk = oldManifest !== null ? await generatedFiles(root) : []
  const disk = new Map<string, string | null>()
  for (const p of [...files.map((f) => f.path), ...generatedOnDisk]) disk.set(p, await readText(root, p))
  return planExport({
    next: new Map(files.map((f) => [f.path, f.content])),
    disk: (p) => disk.get(p) ?? null,
    oldManifest,
    generatedOnDisk,
    yoursPrefixes: YOURS_PREFIXES,
    ownedPrefixes: OWNED_PREFIXES,
    manifestPath: MANIFEST,
  })
}

/**
 * Writes the export's files into the folder by the rules of ownership.ts: unchanged files are not touched (so the engine
 * does not reimport them), your class files are only created, generated files the plan dropped are removed, and the
 * manifest goes last so an engine watching it sees a complete export. A file that changed since the last export (or
 * that no export wrote) stops the write before anything is written, unless `overwrite`. Whatever is overwritten or
 * removed is backed up first under .hoh-backup/<time>/ with a journal; a write that fails half-way is rolled back from
 * it, and restoreLastWrite undoes the last one.
 */
export async function writeExport(root: Folder, files: EmittedFile[], options: WriteOptions = {}): Promise<WriteResult> {
  const result: WriteResult = { written: 0, unchanged: 0, deleted: 0, keptYours: 0, codeChanged: false, moved: [], keptNotOurs: [], conflicts: [], stopped: false }
  let plan = await previewExport(root, files)
  if (plan.conflicts.length && !options.overwrite) {
    result.conflicts = plan.conflicts.map((c) => c.path)
    result.stopped = true
    return result
  }
  if ((await readText(root, MANIFEST)) !== null) {
    await moveRenamedOwnFiles(root, files, result)
    if (result.moved.length) plan = await previewExport(root, files)
  }
  result.conflicts = plan.conflicts.map((c) => c.path)
  result.keptNotOurs = plan.entries.filter((e) => e.action === 'keepNotOurs').map((e) => e.path)
  result.keptYours = plan.counts.keepYours
  const byPath = new Map(files.map((f) => [f.path, f.content]))
  const manifest = files.find((f) => f.path === MANIFEST)
  const oldManifest = await readText(root, MANIFEST)
  const writes = plan.entries.filter((e) => e.path !== MANIFEST && (e.action === 'create' || e.action === 'update' || e.action === 'conflict'))
  const deletes = plan.entries.filter((e) => e.action === 'delete').map((e) => e.path)
  // A manifest that differs only in its export time is not a change: rewriting it would make the engine reimport for nothing.
  const writeManifest = !!manifest && oldManifest !== manifest.content && !(writes.length === 0 && deletes.length === 0 && sameButTime(oldManifest, manifest.content))
  result.unchanged = plan.counts.unchanged + (manifest && !writeManifest && oldManifest !== manifest.content ? 1 : 0)
  if (!writes.length && !deletes.length && !writeManifest) return result

  // Journal and backup before the first change.
  const sidecarsOf = async (path: string) => (await Promise.all(SIDECARS.map(async (x) => ((await readText(root, path + x)) !== null ? path + x : null)))).filter((x): x is string => x !== null)
  const replaced = [...writes.filter((e) => e.action !== 'create').map((e) => e.path), ...(writeManifest && oldManifest !== null ? [MANIFEST] : [])]
  const removed = [...deletes, ...(await Promise.all(deletes.map(sidecarsOf))).flat()]
  const journal: Journal = {
    format: 'hoh-write-journal',
    v: 1,
    stamp: backupStamp(options.now ?? new Date()),
    by: 'planner',
    state: 'writing',
    created: [...writes.filter((e) => e.action === 'create').map((e) => e.path), ...(writeManifest && oldManifest === null ? [MANIFEST] : [])],
    backedUp: [...replaced, ...removed],
  }
  const dir = `${BACKUP_DIR}/${journal.stamp}`
  for (const p of journal.backedUp) await writeText(root, `${dir}/${p}`, (await readText(root, p)) ?? '')
  await writeText(root, `${dir}/${JOURNAL}`, JSON.stringify(journal, null, 2))
  result.backup = dir

  try {
    for (const e of writes) {
      await writeText(root, e.path, byPath.get(e.path)!)
      result.written++
      if (/\.(cs|asmdef|gd|h|cpp)$/.test(e.path)) result.codeChanged = true
    }
    if (writeManifest) {
      await writeText(root, MANIFEST, manifest!.content)
      result.written++
    }
    for (const path of deletes) {
      await removeFile(root, path)
      // The engine's .meta / .import / .uid of the removed file would otherwise be left behind.
      for (const x of SIDECARS) await removeFile(root, path + x)
      result.deleted++
      if (/\.(cs|gd|h|cpp)$/.test(path)) result.codeChanged = true
    }
  } catch (e) {
    try {
      await restoreJournal(root, journal)
    } catch (again) {
      throw new Error(`${(e as Error).message} Putting the folder back failed too (${(again as Error).message}); the old files are in ${dir}, and “Restore last write” tries again.`, { cause: again })
    }
    throw new Error(`${(e as Error).message} The folder was put back as it was before this write.`, { cause: e })
  }
  await writeText(root, `${dir}/${JOURNAL}`, JSON.stringify({ ...journal, state: 'done' }, null, 2))
  await pruneBackups(root)
  return result
}

async function journals(root: Folder): Promise<Journal[]> {
  const dir = await dirAt(root, [BACKUP_DIR], false)
  if (!dir) return []
  const out: Journal[] = []
  for await (const e of dir.values()) {
    if (e.kind !== 'directory') continue
    const text = await readText(root, `${BACKUP_DIR}/${e.name}/${JOURNAL}`)
    try {
      const j = text ? (JSON.parse(text) as Journal) : null
      if (j?.format === 'hoh-write-journal') out.push(j)
    } catch {
      // An unreadable journal is skipped.
    }
  }
  return out.sort((a, b) => (a.stamp < b.stamp ? 1 : -1))
}

async function restoreJournal(root: Folder, j: Journal): Promise<{ restored: number; removed: number }> {
  let removed = 0
  for (const p of j.created) {
    if ((await readText(root, p)) === null) continue
    await removeFile(root, p)
    removed++
  }
  for (const p of j.backedUp) await writeText(root, p, (await readText(root, `${BACKUP_DIR}/${j.stamp}/${p}`)) ?? '')
  await writeText(root, `${BACKUP_DIR}/${j.stamp}/${JOURNAL}`, JSON.stringify({ ...j, state: 'restored' }, null, 2))
  return { restored: j.backedUp.length, removed }
}

async function pruneBackups(root: Folder): Promise<void> {
  const dir = await dirAt(root, [BACKUP_DIR], false)
  for (const j of (await journals(root)).slice(KEEP_BACKUPS)) await dir?.removeEntry(j.stamp).catch(() => undefined)
}

/** A write that started but never finished (the browser closed half-way), or null. */
export async function interruptedWrite(root: Folder): Promise<Journal | null> {
  const last = (await journals(root))[0]
  return last?.state === 'writing' ? last : null
}

/** Puts the folder back as it was before the last write (by the planner or the Unity bridge), from its backup. */
export async function restoreLastWrite(root: Folder): Promise<string> {
  const last = (await journals(root)).find((j) => j.state !== 'restored')
  if (!last) return 'There is no write to undo.'
  const r = await restoreJournal(root, last)
  return `Restored the folder as it was before the write of ${last.stamp}: ${countOf(r.restored, 'file')} put back, ${countOf(r.removed, 'new file')} removed.`
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
  r.stopped
    ? `Stopped before writing: ${countOf(r.conflicts.length, 'file')} changed since the last export or not written by the planner (${r.conflicts.slice(0, 3).join(', ')}${r.conflicts.length > 3 ? ', …' : ''}). Overwrite them (a backup is kept) or move your changes out of the generated folders`
    : `${r.written} written, ${r.unchanged} unchanged, ${r.deleted} removed, ${r.keptYours} of your class files kept${r.moved.length ? `, ${r.moved.length} moved with their renamed class` : ''}${r.keptNotOurs.length ? `, ${countOf(r.keptNotOurs.length, 'file')} the planner did not write kept` : ''}${r.conflicts.length ? `, ${countOf(r.conflicts.length, 'conflict')} overwritten (backup in ${r.backup})` : ''}${r.codeChanged ? '; the engine recompiles' : ''}`
