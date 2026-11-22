import { fnv1a } from './manifest'
import { countOf } from '../text'

/**
 * Who owns each file of an export folder, and what a new export may do to it (plans/UNITY_PLAYABLE_GAME_GENERATION_PLAN.md,
 * phase 5). The same rules run in the planner's linked-folder writer (folder.ts) and in the Unity bridge's import
 * (PlannerOwnership.cs); keep them in step.
 *
 * - **Yours**: files under a “yours” prefix (your class files). Created when missing, never overwritten.
 * - **Planner**: a file the previous export wrote and nobody changed since — its text still hashes to what the previous
 *   manifest lists (line endings ignored, so a Git checkout with CRLF does not count as a change). Updated or deleted freely.
 * - **Changed by you / not from the planner**: a file the new export would overwrite whose text differs from what the
 *   previous export wrote (or that no export wrote). A **conflict**: the export stops before writing anything, unless
 *   the user chose to overwrite, and then the old text is backed up first.
 * - A file in a generated folder that the previous export did not write (or that was changed since) is **kept** when the
 *   new export no longer has it — never deleted — and reported.
 * - Engine files beside them (.meta, .import, .uid) follow their file; the manifest itself is always the planner's.
 */
export type PlanAction = 'create' | 'update' | 'unchanged' | 'keepYours' | 'conflict' | 'delete' | 'keepNotOurs'
export type PlanEntry = { path: string; action: PlanAction; reason?: string }
export type ExportPlan = {
  entries: PlanEntry[]
  conflicts: PlanEntry[]
  counts: Record<PlanAction, number>
}

/** The text was written by the export whose manifest lists `hash` and has not been changed since (CRLF and LF alike). */
export const unmodified = (text: string, hash: string | undefined) => hash !== undefined && (fnv1a(text) === hash || fnv1a(text.replace(/\r\n/g, '\n')) === hash)

/** Path → hash of the files an export's manifest lists; empty when there is no readable manifest. */
export function manifestHashes(manifestText: string | null): Map<string, string> {
  const out = new Map<string, string>()
  if (manifestText === null) return out
  try {
    const files = JSON.parse(manifestText)?.files
    if (Array.isArray(files)) for (const f of files) if (typeof f?.path === 'string' && typeof f?.hash === 'string') out.set(f.path, f.hash)
  } catch {
    // An unreadable manifest: nothing counts as the planner's, so nothing is overwritten or deleted without asking.
  }
  return out
}

export type PlanInput = {
  /** The new export: path → text. */
  next: Map<string, string>
  /** Current text of a path in the folder, or null. */
  disk: (path: string) => string | null
  /** The manifest already in the folder (the previous export), or null. */
  oldManifest: string | null
  /** Files now in the generated folders (no sidecars), relative to the export root. */
  generatedOnDisk: string[]
  yoursPrefixes: string[]
  ownedPrefixes: string[]
  manifestPath: string
}

const isYours = (path: string, i: PlanInput) => i.yoursPrefixes.some((p) => path.startsWith(p)) && !i.ownedPrefixes.some((p) => path.startsWith(p))

export function planExport(i: PlanInput): ExportPlan {
  const old = manifestHashes(i.oldManifest)
  const entries: PlanEntry[] = []
  for (const [path, text] of i.next) {
    const now = i.disk(path)
    if (path === i.manifestPath) entries.push({ path, action: now === text ? 'unchanged' : now === null ? 'create' : 'update' })
    else if (isYours(path, i)) entries.push({ path, action: now === null ? 'create' : 'keepYours' })
    else if (now === null) entries.push({ path, action: 'create' })
    else if (now === text) entries.push({ path, action: 'unchanged' })
    else if (unmodified(now, old.get(path))) entries.push({ path, action: 'update' })
    else entries.push({ path, action: 'conflict', reason: old.has(path) ? 'changed since the last export' : 'not written by the planner' })
  }
  for (const path of i.generatedOnDisk) {
    if (i.next.has(path)) continue
    const now = i.disk(path)
    if (now === null) continue
    if (unmodified(now, old.get(path))) entries.push({ path, action: 'delete' })
    else entries.push({ path, action: 'keepNotOurs', reason: old.has(path) ? 'changed since the last export' : 'not written by the planner' })
  }
  const counts = { create: 0, update: 0, unchanged: 0, keepYours: 0, conflict: 0, delete: 0, keepNotOurs: 0 }
  for (const e of entries) counts[e.action]++
  return { entries, conflicts: entries.filter((e) => e.action === 'conflict'), counts }
}

export const describePlan = (p: ExportPlan) =>
  [
    `${p.counts.create} new`,
    `${p.counts.update} changed`,
    `${p.counts.delete} removed`,
    `${p.counts.unchanged} unchanged`,
    `${p.counts.keepYours} of your class files kept`,
    ...(p.counts.keepNotOurs ? [`${countOf(p.counts.keepNotOurs, 'file')} in generated folders kept because the planner did not write them`] : []),
    ...(p.counts.conflict ? [`${countOf(p.counts.conflict, 'conflict')}: ${p.conflicts.slice(0, 5).map((c) => `${c.path} (${c.reason})`).join('; ')}${p.counts.conflict > 5 ? '; …' : ''}`] : []),
  ].join(', ')

/** Backups and the write journal live here, inside the export folder: engines skip folders starting with a dot. */
export const BACKUP_DIR = '.hoh-backup'
export const JOURNAL = 'journal.json'
/** How many backups to keep; older ones are removed after a successful write. */
export const KEEP_BACKUPS = 5

export type Journal = { format: 'hoh-write-journal'; v: 1; stamp: string; by: 'planner' | 'unity'; state: 'writing' | 'done' | 'restored'; created: string[]; backedUp: string[] }

/** A sortable time stamp for a backup folder: 20261121-201530-123 (UTC). */
export const backupStamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace('T', '-').replace('.', '-').replace('Z', '')
