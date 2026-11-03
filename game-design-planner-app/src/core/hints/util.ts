import { getModule, getSections } from '../modules/registry'
import type { Entity, Project, SectionDef } from '../model/types'

export const isBlank = (v: unknown) =>
  v === undefined ||
  v === null ||
  v === '' ||
  (Array.isArray(v) && v.length === 0) ||
  (typeof v === 'object' && !Array.isArray(v) && Object.keys(v as object).length === 0)

export function isSectionEmpty(sec: SectionDef, data: any): boolean {
  switch (sec.kind) {
    case 'collection':
      return !Array.isArray(data) || data.length === 0
    case 'graph':
      return !data?.nodes?.length
    case 'canvas':
      return !data?.items?.length
    case 'checklist':
      return !data?.groups?.some((g: any) => g.items?.length)
    case 'formulas':
      return !data?.items?.length
    case 'richtext':
      return isBlank(typeof data === 'string' ? data.trim() : data)
    case 'matrix':
      return !data?.cells || Object.keys(data.cells).length === 0
    case 'form':
      return !data || sec.fields.every((fd) => isBlank(data[fd.key]))
  }
}

export function sectionsOf(project: Project, docId: string): SectionDef[] {
  const m = getModule(docId)
  return m ? getSections(m, project.registry) : []
}

export function isDocEmpty(project: Project, docId: string): boolean {
  const doc = project.documents[docId]
  if (!doc) return true
  return sectionsOf(project, docId).every((s) => isSectionEmpty(s, doc.data[s.id]))
}

export const entitiesOf = (project: Project, docId: string, sectionId: string): Entity[] => {
  const d = project.documents[docId]?.data[sectionId]
  return Array.isArray(d) ? d : []
}

export const entityName = (e: Entity) => String(e.name ?? e.title ?? e.id)

export const hintId = (ruleId: string, ...parts: (string | undefined)[]) => [ruleId, ...parts.filter(Boolean)].join(':')

export function quartiles(sorted: number[]): [number, number] {
  const at = (q: number) => {
    const pos = (sorted.length - 1) * q
    const lo = Math.floor(pos)
    return sorted[lo] + (sorted[Math.min(lo + 1, sorted.length - 1)] - sorted[lo]) * (pos - lo)
  }
  return [at(0.25), at(0.75)]
}

export const shortList = (names: string[], max = 3) =>
  names.slice(0, max).join(', ') + (names.length > max ? ` +${names.length - max}` : '')
