import { createProject } from '../core/model/project'
import { deserializeProject, documentToFile, parseDocumentFile, serializeProject } from '../core/persistence/serialize'
import { openFromFile, saveToFile, downloadBlob, downloadText, pickWithInput, forgetHandle } from '../core/persistence/file'
import { addSnapshot, readAutosave } from '../core/persistence/autosave'
import { exportZip, moduleToMarkdown } from '../core/export/markdown'
import { getModule } from '../core/modules/registry'
import type { EngineId } from '../core/engine/adapter'
import { engineTarget } from '../core/engine/target'
import { exportOnSave } from './engineLink'
import { applyReport, parseReport, reportSummary, type StoredReport } from '../core/engine/report'
import { buildBundle, bundleZip } from '../core/engine/bundle'
import { useStore } from '../core/store/store'

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'project'

export function newProject() {
  const { dirty } = useStore.getState()
  if (dirty && !confirm('Discard unsaved changes and start a new project?')) return
  forgetHandle()
  useStore.getState().loadProject(createProject())
}

export async function openProject() {
  const { dirty } = useStore.getState()
  if (dirty && !confirm('Discard unsaved changes and open another project?')) return
  try {
    const file = await openFromFile()
    if (!file) return
    const { project, warnings } = deserializeProject(file.text)
    useStore.getState().loadProject(project, file.name)
    if (warnings.length) alert(warnings.join('\n'))
  } catch (e) {
    alert((e as Error).message)
  }
}

export async function saveProject(saveAs = false) {
  const { project } = useStore.getState()
  try {
    const name = await saveToFile(serializeProject(project), `${slug(project.meta.name)}.hohplan.json`, saveAs)
    if (name) {
      useStore.getState().markSaved(name)
      // Linked engine folder (core/engine/folder): write the export too, without holding up the save.
      void exportOnSave()
    }
  } catch (e) {
    alert(`Save failed: ${(e as Error).message}`)
  }
}

export function downloadJson() {
  const { project } = useStore.getState()
  downloadText(`${slug(project.meta.name)}.hohplan.json`, serializeProject(project))
}

export async function exportMarkdownZip() {
  const { project } = useStore.getState()
  downloadBlob(`${slug(project.meta.name)}-docs.zip`, await exportZip(project))
}

export function exportDocumentMarkdown(docId: string) {
  const { project } = useStore.getState()
  const m = getModule(docId)
  if (m) downloadText(`${docId}.md`, moduleToMarkdown(project, m), 'text/markdown')
}

export function exportDocumentJson(docId: string) {
  const { project } = useStore.getState()
  downloadText(`${docId}.hohdoc.json`, documentToFile(project, docId))
}

export async function importDocument(expectedDocId?: string) {
  try {
    const file = await pickWithInput('.json')
    if (!file) return
    const { docId, document } = parseDocumentFile(file.text)
    if (!getModule(docId)) throw new Error(`Unknown document type “${docId}”`)
    if (expectedDocId && docId !== expectedDocId && !confirm(`This file contains “${docId}”, not “${expectedDocId}”. Import it anyway?`)) return
    if (!confirm(`Replace the current “${docId}” document with the imported one?`)) return
    useStore.getState().mutate((p) => {
      p.documents[docId] = document
    })
  } catch (e) {
    alert((e as Error).message)
  }
}

export async function createSnapshot() {
  const name = prompt('Snapshot name', new Date().toLocaleString())
  if (name) await addSnapshot(useStore.getState().project, name)
}

export async function restoreAutosave() {
  const a = await readAutosave()
  if (a) {
    forgetHandle()
    useStore.getState().loadProject(a.project)
  }
}

/** The engine export (core/engine) for the project's target engine, or the one given: data, generated code and manifest as a zip. */
export async function exportEngineZip(engine?: EngineId) {
  const { project } = useStore.getState()
  const id = engine ?? engineTarget(project).id
  downloadBlob(`${slug(project.meta.name)}-${id}-export.zip`, await bundleZip(buildBundle(project, id)))
}

/** Sets the target engine; `undefined` goes back to guessing it from the Architecture stack. */
export function setEngineTarget(engine: EngineId | undefined) {
  useStore.getState().mutate((p) => {
    if (engine) p.meta.engine = { ...p.meta.engine, target: engine }
    else if (p.meta.engine) delete p.meta.engine.target
  }, undefined, 'Set target engine')
}

/** Reads hoh-engine-report.json from the engine project and stores it (one undo step). Only the report changes, never the plan. */
export async function importEngineReport() {
  const file = await pickWithInput('.json,application/json')
  if (!file) return
  try {
    const { report, warnings } = parseReport(file.text, useStore.getState().project)
    let stored: StoredReport | undefined
    useStore.getState().mutate((p) => {
      stored = applyReport(p, report)
    }, undefined, 'Import engine report')
    alert([stored ? reportSummary(stored) : '', ...warnings].filter(Boolean).join('\n\n'))
  } catch (e) {
    alert((e as Error).message)
  }
}
