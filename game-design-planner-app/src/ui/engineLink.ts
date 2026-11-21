import { del, get, set } from 'idb-keyval'
import { useEffect, useState } from 'react'
import { buildBundle } from '../core/engine/bundle'
import { describeWrite, exportFolderIn, folderState, readText, REPORT_FILE, writeExport, type Folder } from '../core/engine/folder'
import { applyReport, parseReport, reportSummary, storedReport } from '../core/engine/report'
import { engineTarget } from '../core/engine/target'
import type { Project } from '../core/model/types'
import { useStore } from '../core/store/store'

/**
 * The engine folder linked to a project: a folder handle kept in this browser's IndexedDB (never in the project file,
 * since it only means something on this machine), plus whether to write the export on every save.
 */
export type EngineLink = {
  folder: Folder & { queryPermission?: (d: { mode: 'readwrite' }) => Promise<PermissionState>; requestPermission?: (d: { mode: 'readwrite' }) => Promise<PermissionState> }
  /** Shown to the user: the picked folder's name, and Assets/HoHPlanner when it was a Unity project. */
  label: string
  exportOnSave: boolean
  last?: { at: string; text: string; ok: boolean }
}

type Picker = (o: { mode: 'readwrite'; id?: string }) => Promise<EngineLink['folder']>
const picker = (): Picker | undefined => (typeof window !== 'undefined' ? (window as unknown as { showDirectoryPicker?: Picker }).showDirectoryPicker : undefined)
/** Chromium-based browsers only; elsewhere the zip download is the way. */
export const canLinkFolders = () => typeof picker() === 'function'

const keyOf = (p: Project) => `hohplan:engineLink:${p.meta.createdAt}:${p.meta.name}`
const listeners = new Set<() => void>()
const changed = () => listeners.forEach((l) => l())

/** The stored link; undefined when there is none or this browser has no IndexedDB / folder access. */
export const loadLink = async (p: Project): Promise<EngineLink | undefined> => (canLinkFolders() && typeof indexedDB !== 'undefined' ? get<EngineLink>(keyOf(p)) : undefined)
async function saveLink(p: Project, link: EngineLink) {
  await set(keyOf(p), link)
  changed()
}

/** The current project's link, re-read whenever it changes. undefined while loading, null when there is none. */
export function useEngineLink(): EngineLink | null | undefined {
  const project = useStore((s) => s.project)
  const key = keyOf(project)
  const [link, setLink] = useState<EngineLink | null | undefined>(undefined)
  useEffect(() => {
    let live = true
    const read = () => void loadLink(useStore.getState().project).then((l) => live && setLink(l ?? null), () => live && setLink(null))
    read()
    listeners.add(read)
    return () => {
      live = false
      listeners.delete(read)
    }
  }, [key])
  return link
}

/** Asks for write access if needed. Without a user gesture the browser may refuse; then false. */
async function permitted(link: EngineLink, ask: boolean): Promise<boolean> {
  const f = link.folder
  if (!f.queryPermission) return true
  if ((await f.queryPermission({ mode: 'readwrite' })) === 'granted') return true
  return ask && !!f.requestPermission && (await f.requestPermission({ mode: 'readwrite' })) === 'granted'
}

/** Lets the user pick the engine folder. A Unity project's root becomes its Assets/HoHPlanner. Returns a message, or null when cancelled. */
export async function linkEngineFolder(): Promise<string | null> {
  const pick = picker()
  if (!pick) return 'This browser cannot write to folders. Use Download .zip instead.'
  let root: EngineLink['folder']
  try {
    root = await pick({ mode: 'readwrite', id: 'hoh-engine' })
  } catch {
    return null // cancelled
  }
  const p = useStore.getState().project
  const state = await folderState(root)
  if (state.hasExport && state.projectName && state.projectName !== p.meta.name && !confirm(`This folder holds the export of “${state.projectName}”, not “${p.meta.name}”. Link it anyway? The next write replaces that export.`)) return null
  if (!state.hasExport && !state.empty && !state.unityProject && !state.godotProject && !state.unrealProject && !confirm(`“${root.name}” is not empty and holds no planner export. Write the export into it anyway? (Nothing in it is deleted until it holds an export.)`)) return null
  const { folder, path } = await exportFolderIn(root)
  await saveLink(p, { folder: folder as EngineLink['folder'], label: path ? `${root.name}/${path}` : root.name, exportOnSave: true })
  return null
}

export async function unlinkEngineFolder() {
  await del(keyOf(useStore.getState().project))
  changed()
}

export async function setExportOnSave(on: boolean) {
  const p = useStore.getState().project
  const link = await loadLink(p)
  if (link) await saveLink(p, { ...link, exportOnSave: on })
}

/** Writes the export for the target engine into the linked folder. Returns the result line (also kept on the link). */
export async function writeToLinkedFolder(ask = true): Promise<string> {
  const p = useStore.getState().project
  const link = await loadLink(p)
  if (!link) return 'No engine folder linked.'
  let last: EngineLink['last']
  try {
    if (!(await permitted(link, ask))) last = { at: new Date().toISOString(), ok: false, text: 'No permission to write to the folder; use “Write now” to allow it.' }
    else last = { at: new Date().toISOString(), ok: true, text: describeWrite(await writeExport(link.folder, buildBundle(p, engineTarget(p).id).files)) }
  } catch (e) {
    last = { at: new Date().toISOString(), ok: false, text: `Could not write: ${(e as Error).message}` }
  }
  await saveLink(p, { ...link, last })
  return last.text
}

/** After a save: writes the export when the project has a linked folder with “write on every save”. Never throws. */
export async function exportOnSave(): Promise<void> {
  const link = await loadLink(useStore.getState().project).catch(() => undefined)
  if (link?.exportOnSave) await writeToLinkedFolder(true)
}

/**
 * Reads hoh-engine-report.json from the linked folder and stores it (one undo step) when it is newer than the stored one,
 * or always when `force`. Returns a message, or null when there was nothing new.
 */
export async function readReportFromLinkedFolder(force: boolean): Promise<string | null> {
  const p = useStore.getState().project
  const link = await loadLink(p)
  if (!link || !(await permitted(link, force))) return force ? 'No permission to read the folder.' : null
  const text = await readText(link.folder, REPORT_FILE)
  if (text === null) return force ? `No ${REPORT_FILE} in the folder yet. In Unity: Tools ▸ Game Design Planner ▸ Write report for the planner.` : null
  try {
    const { report, warnings } = parseReport(text, p)
    const old = storedReport(p)
    if (!force && old && old.generatedAt >= report.generatedAt) return null
    let summary = ''
    useStore.getState().mutate((d) => {
      summary = reportSummary(applyReport(d, report))
    }, undefined, 'Read engine report')
    return [summary, ...warnings].join(' ')
  } catch (e) {
    return (e as Error).message
  }
}
