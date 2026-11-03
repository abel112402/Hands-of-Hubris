import { MODULES, getModule, getSections } from '../modules/registry'
import { resolveSource } from '../references/refs'
import type { Project, SectionDef } from '../model/types'
import { AiError } from './types'

export type ContextScope = {
  mode: 'section' | 'document' | 'documents' | 'project'
  docId?: string
  sectionId?: string
  docIds?: string[]
  includeReferenced?: boolean
}

export type BuiltContext = { text: string; chars: number; docIds: string[] }

const strip = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(strip)
    : v && typeof v === 'object'
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([k]) => k !== '_ai').map(([k, x]) => [k, strip(x)]))
      : v

function referencedDocs(project: Project, docId: string): string[] {
  const m = getModule(docId)
  if (!m) return []
  const out = new Set<string>()
  for (const s of getSections(m, project.registry))
    if (s.kind === 'collection')
      for (const f of s.fields)
        if ((f.type === 'ref' || f.type === 'multiref' || f.type === 'map') && 'section' in f.source && f.source.doc && f.source.doc !== docId)
          out.add(f.source.doc)
  return [...out]
}

function sectionBlock(project: Project, docId: string, sec: SectionDef): string {
  const data = project.documents[docId]?.data[sec.id]
  const head = `### section "${sec.id}" (${sec.kind}): ${sec.title}`
  if (sec.kind === 'collection') {
    const fields = sec.fields.map((f) => {
      const o: Record<string, unknown> = { key: f.key, label: f.label, type: f.type }
      if (f.type === 'enum') o.options = f.options
      if (f.type === 'number') { o.min = f.min; o.max = f.max }
      if (f.type === 'ref' || f.type === 'multiref') o.options = resolveSource(project, docId, f.source).slice(0, 80).map((i) => ({ id: i.id, label: i.label }))
      return o
    })
    return `${head}\nfields: ${JSON.stringify(fields)}\nentries: ${JSON.stringify(strip(data ?? []))}`
  }
  return `${head}\ndata: ${JSON.stringify(strip(data ?? null))}`
}

/** Builds the user-selected project context. Never truncates silently: throws if over the size limit. */
export function buildContext(project: Project, scope: ContextScope, maxChars: number): BuiltContext {
  let docIds: string[]
  switch (scope.mode) {
    case 'project': docIds = MODULES.map((m) => m.id).filter((id) => project.documents[id]); break
    case 'documents': docIds = (scope.docIds ?? []).filter((id) => getModule(id)); break
    default: docIds = scope.docId && getModule(scope.docId) ? [scope.docId] : []
  }
  if (scope.includeReferenced) for (const d of [...docIds]) for (const r of referencedDocs(project, d)) if (!docIds.includes(r)) docIds.push(r)

  const parts: string[] = []
  for (const id of docIds) {
    const m = getModule(id)!
    const secs = getSections(m, project.registry).filter((s) => scope.mode !== 'section' || s.id === scope.sectionId || id !== scope.docId)
    parts.push(`## document "${id}": ${m.title}\n${secs.map((s) => sectionBlock(project, id, s)).join('\n')}`)
  }
  const text = parts.join('\n\n')
  if (text.length > maxChars) throw new AiError('invalid', `The selected context is too large (${text.length} > ${maxChars} characters). Select a smaller scope.`)
  return { text, chars: text.length, docIds }
}

/** Untrusted content is fenced so it cannot close the block and masquerade as instructions. */
export const fence = (tag: string, body: string) => `<${tag}>\n${body.replaceAll(`</${tag}`, `<\\/${tag}`)}\n</${tag}>`
