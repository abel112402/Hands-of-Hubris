import type { CatalogItem, CollectionSection, Entity, FieldDef, GraphSource, Project, Source } from '../model/types'
import { MODULES, getSections } from '../modules/registry'

export const entityLabel = (e: Entity | undefined) =>
  e ? String(e.name ?? e.title ?? e.id) || e.id : ''

export function resolveSource(project: Project, currentDoc: string, source: GraphSource): CatalogItem[] {
  if ('any' in source) return source.any.flatMap((s) => resolveSource(project, currentDoc, s))
  if ('catalog' in source) return project.registry.catalogs[source.catalog]?.items ?? []
  const docId = source.doc ?? currentDoc
  const list = project.documents[docId]?.data[source.section]
  // A graph section can be a source too: its nodes are the items.
  if (list && Array.isArray(list.nodes)) return list.nodes.map((n: { id: string; label: string }) => ({ id: n.id, label: n.label }))
  if (!Array.isArray(list)) return []
  return list.map((e: Entity) => ({ id: e.id, label: entityLabel(e) }))
}

const sourceKey = (doc: string, src: Source) =>
  'catalog' in src ? `catalog:${src.catalog}` : `${src.doc ?? doc}/${src.section}`

export interface Usage {
  docId: string
  docTitle: string
  sectionId: string
  sectionTitle: string
  entityId: string
  entityLabel: string
  field: string
}

/** All places that reference the given id (entity or catalog item). */
export function findUsages(project: Project, targetId: string): Usage[] {
  const out: Usage[] = []
  for (const m of MODULES) {
    const doc = project.documents[m.id]
    if (!doc) continue
    for (const sec of getSections(m, project.registry)) {
      const data = doc.data[sec.id]
      if (sec.kind === 'collection' && Array.isArray(data)) {
        for (const e of data as Entity[]) {
          for (const fd of sec.fields) {
            const val = e[fd.key]
            const hit =
              (fd.type === 'ref' && val === targetId) ||
              (fd.type === 'multiref' && Array.isArray(val) && val.includes(targetId)) ||
              (fd.type === 'map' && val && typeof val === 'object' && targetId in val)
            if (hit)
              out.push({ docId: m.id, docTitle: m.title, sectionId: sec.id, sectionTitle: sec.title, entityId: e.id, entityLabel: entityLabel(e), field: fd.label })
          }
        }
      } else if (sec.kind === 'graph' && data?.nodes) {
        for (const n of data.nodes) {
          if (n.refId === targetId)
            out.push({ docId: m.id, docTitle: m.title, sectionId: sec.id, sectionTitle: sec.title, entityId: n.id, entityLabel: n.label, field: 'graph node' })
        }
      }
    }
  }
  return out
}

export interface Issue {
  level: 'error' | 'warning'
  docId: string
  docTitle: string
  sectionId: string
  sectionTitle: string
  message: string
}

const isEmpty = (v: unknown) =>
  v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)

function hasCycle(edges: Map<string, string[]>): boolean {
  const state = new Map<string, 1 | 2>()
  const visit = (n: string): boolean => {
    if (state.get(n) === 1) return true
    if (state.get(n) === 2) return false
    state.set(n, 1)
    for (const next of edges.get(n) ?? []) if (visit(next)) return true
    state.set(n, 2)
    return false
  }
  return [...edges.keys()].some(visit)
}

export function validateProject(project: Project): Issue[] {
  const issues: Issue[] = []
  for (const m of MODULES) {
    const doc = project.documents[m.id]
    if (!doc) continue
    for (const sec of getSections(m, project.registry)) {
      const data = doc.data[sec.id]
      const base = { docId: m.id, docTitle: m.title, sectionId: sec.id, sectionTitle: sec.title }
      if (sec.kind === 'collection' && Array.isArray(data)) {
        for (const e of data as Entity[]) {
          for (const fd of sec.fields) {
            const label = entityLabel(e) || '(unnamed)'
            if (fd.required && isEmpty(e[fd.key]))
              issues.push({ level: 'warning', ...base, message: `${sec.singular} “${label}”: “${fd.label}” is required` })
            checkRefs(project, m.id, fd, e, label, base, issues)
          }
        }
        for (const fd of sec.fields) {
          if (fd.type === 'multiref' && !('catalog' in fd.source) && sourceKey(m.id, fd.source) === `${m.id}/${sec.id}`) {
            const edges = new Map<string, string[]>()
            for (const e of data as Entity[]) edges.set(e.id, Array.isArray(e[fd.key]) ? e[fd.key] : [])
            if (hasCycle(edges)) issues.push({ level: 'error', ...base, message: `Circular dependency in “${fd.label}”` })
          }
        }
        checkDuplicates(sec, data, base, issues)
      } else if (sec.kind === 'graph' && data?.nodes) {
        const ids = new Set<string>(data.nodes.map((n: any) => n.id))
        for (const ed of data.edges ?? [])
          if (!ids.has(ed.source) || !ids.has(ed.target))
            issues.push({ level: 'error', ...base, message: 'Graph edge points to a missing node' })
        if (sec.nodeSource) {
          const valid = new Set(resolveSource(project, m.id, sec.nodeSource).map((i) => i.id))
          for (const n of data.nodes)
            if (n.refId && !valid.has(n.refId)) issues.push({ level: 'error', ...base, message: `Graph node “${n.label}” references a missing item` })
        }
      }
    }
  }
  return issues
}

function checkDuplicates(sec: CollectionSection, data: Entity[], base: Omit<Issue, 'level' | 'message'>, issues: Issue[]) {
  const seen = new Set<string>()
  for (const e of data) {
    const n = entityLabel(e).trim().toLowerCase()
    if (!n) continue
    if (seen.has(n)) issues.push({ level: 'warning', ...base, message: `Duplicate name “${entityLabel(e)}” in ${sec.title}` })
    seen.add(n)
  }
}

function checkRefs(
  project: Project,
  docId: string,
  fd: FieldDef,
  e: Entity,
  label: string,
  base: Omit<Issue, 'level' | 'message'>,
  issues: Issue[],
) {
  if (fd.type !== 'ref' && fd.type !== 'multiref' && fd.type !== 'map') return
  const val = e[fd.key]
  if (isEmpty(val)) return
  const valid = new Set(resolveSource(project, docId, fd.source).map((i) => i.id))
  const ids = fd.type === 'ref' ? [val] : fd.type === 'multiref' ? val : Object.keys(val)
  for (const id of ids)
    if (!valid.has(id)) issues.push({ level: 'error', ...base, message: `“${label}”: broken reference in “${fd.label}”` })
}
