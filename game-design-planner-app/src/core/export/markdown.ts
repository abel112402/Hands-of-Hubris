import JSZip from 'jszip'
import type {
  ChecklistData,
  Entity,
  FieldDef,
  FormulaData,
  GraphData,
  MatrixData,
  PlannerModule,
  Project,
  SectionDef,
} from '../model/types'
import { getSections, MODULES } from '../modules/registry'
import { entityLabel, resolveSource } from '../references/refs'
import { tryEvaluate } from '../formula'
import { analyze, weekToDate, withBuffer } from '../schedule'

const esc = (s: unknown) => String(s ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')

function valueToText(project: Project, docId: string, fd: FieldDef, val: any): string {
  if (val === undefined || val === null || val === '') return ''
  switch (fd.type) {
    case 'boolean':
      return val ? 'yes' : 'no'
    case 'list':
      return (val as string[]).join(', ')
    case 'ref': {
      return resolveSource(project, docId, fd.source).find((i) => i.id === val)?.label ?? String(val)
    }
    case 'multiref': {
      const items = resolveSource(project, docId, fd.source)
      return (val as string[]).map((id) => items.find((i) => i.id === id)?.label ?? id).join(', ')
    }
    case 'map': {
      const items = resolveSource(project, docId, fd.source)
      return Object.entries(val as Record<string, number>)
        .map(([id, n]) => `${items.find((i) => i.id === id)?.label ?? id}: ${n}`)
        .join(', ')
    }
    case 'checklist':
      return (val as ChecklistData['groups'][number]['items']).map((i) => `${i.done ? '[x]' : '[ ]'} ${i.text}`).join('; ')
    default:
      return String(val)
  }
}

function collectionMd(project: Project, docId: string, sec: Extract<SectionDef, { kind: 'collection' }>, data: Entity[]): string {
  if (!data.length) return '_No entries yet._\n'
  const shortFields = sec.fields.filter((f) => f.key !== 'name' && !['longtext', 'checklist', 'map', 'list'].includes(f.type))
  const useTable = sec.views.some((v) => v.kind === 'table') && shortFields.length > 0
  const longFields = sec.fields.filter((f) => f.key !== 'name' && (!useTable || !shortFields.includes(f)))
  let out = ''
  if (useTable) {
    out += `| ${['Name', ...shortFields.map((f) => f.label)].join(' | ')} |\n`
    out += `|${'---|'.repeat(shortFields.length + 1)}\n`
    for (const e of data) {
      out += `| ${[entityLabel(e), ...shortFields.map((f) => valueToText(project, docId, f, e[f.key]))].map(esc).join(' | ')} |\n`
    }
    out += '\n'
  }
  for (const e of data) {
    const lines = longFields
      .map((f) => ({ f, t: valueToText(project, docId, f, e[f.key]) }))
      .filter((x) => x.t)
    if (!lines.length) {
      if (!useTable) out += `### ${entityLabel(e)}\n\n`
      continue
    }
    out += `### ${entityLabel(e)}\n`
    for (const { f, t } of lines) out += f.type === 'checklist' ? `* **${f.label}:**\n${(e[f.key] as any[]).map((i) => `  - [${i.done ? 'x' : ' '}] ${i.text}`).join('\n')}\n` : `* **${f.label}:** ${t}\n`
    out += '\n'
  }
  return out
}

function matrixMd(project: Project, docId: string, sec: Extract<SectionDef, { kind: 'matrix' }>, data: MatrixData): string {
  const rows = resolveSource(project, docId, sec.rows)
  const cols = resolveSource(project, docId, sec.cols)
  if (!rows.length || !cols.length) return '_Matrix is empty._\n'
  const meta = sec.rowMeta
  const entities: Entity[] = !('catalog' in sec.rows) ? project.documents[sec.rows.doc ?? docId]?.data[sec.rows.section] ?? [] : []
  const rowEntity = (id: string) => entities.find((e) => e.id === id)
  const head = ['', ...(meta?.unit ? ['Unit'] : []), ...cols.map((c) => c.label), ...(meta?.notes ? ['Notes'] : [])]
  let out = `| ${head.map(esc).join(' | ')} |\n|${'---|'.repeat(head.length)}\n`
  for (const r of rows) {
    const e = rowEntity(r.id)
    const cells = [
      r.label,
      ...(meta?.unit ? [e?.[meta.unit] ?? ''] : []),
      ...cols.map((c) => data.cells?.[`${r.id}|${c.id}`] ?? ''),
      ...(meta?.notes ? [e?.[meta.notes] ?? ''] : []),
    ]
    out += `| ${cells.map(esc).join(' | ')} |\n`
  }
  return out
}

function graphMd(project: Project, docId: string, sec: Extract<SectionDef, { kind: 'graph' }>, data: GraphData): string {
  if (!data.nodes.length) return '_Diagram is empty._\n'
  const src = sec.nodeSource ? resolveSource(project, docId, sec.nodeSource) : []
  const label = (n: GraphData['nodes'][number]) => src.find((i) => i.id === n.refId)?.label ?? n.label
  const mermaidId = (id: string) => `n_${id.replace(/[^A-Za-z0-9]/g, '_')}`
  let out = '```mermaid\nflowchart LR\n'
  for (const n of data.nodes) out += `  ${mermaidId(n.id)}["${label(n).replace(/"/g, "'")} (${n.kind})"]\n`
  for (const e of data.edges) out += `  ${mermaidId(e.source)} -->${e.label || e.kind ? `|${(e.label || e.kind)!.replace(/\|/g, '/')}|` : ''} ${mermaidId(e.target)}\n`
  out += '```\n\n'
  const noted = data.nodes.filter((n) => n.notes)
  if (noted.length) out += noted.map((n) => `* **${label(n)}:** ${esc(n.notes)}`).join('\n') + '\n'
  return out
}

/** Planned and buffered end of a scheduled collection, with calendar dates when a project start date is set. */
function scheduleSummaryMd(project: Project, docId: string, sec: Extract<SectionDef, { kind: 'collection' }>, data: Entity[]): string {
  const tl = sec.views.find((v) => v.kind === 'timeline')
  if (!tl || tl.kind !== 'timeline' || !data.length) return ''
  const a = analyze(data, { start: tl.startField, duration: tl.durationField, deps: tl.depsField ?? '', kind: tl.kindField })
  const settings = tl.calendar ? project.documents[docId]?.data[tl.calendar.section] : undefined
  const buffer = settings?.[tl.calendar?.bufferField ?? '']
  const startDate = settings?.[tl.calendar?.startField ?? '']
  const buffered = Math.ceil(withBuffer(a.end, buffer))
  const at = (w: number) => (weekToDate(startDate, w) ? ` (${weekToDate(startDate, w)})` : '')
  let out = `\n_Planned end: week ${a.end}${at(a.end)}`
  if (buffer) out += `; with ${buffer}% buffer: week ${buffered}${at(buffered)}`
  out += '._\n'
  if (a.conflicts.length) out += `\n_${a.conflicts.length} dependency conflict(s): an item starts before its predecessor ends._\n`
  return out
}

export function sectionMd(project: Project, mod: PlannerModule, sec: SectionDef): string {
  const data = project.documents[mod.id]?.data[sec.id]
  if (data === undefined) return '_No data._\n'
  switch (sec.kind) {
    case 'form': {
      const filled = sec.fields
        .map((f) => ({ f, t: valueToText(project, mod.id, f, data[f.key]) }))
        .filter((x) => x.t)
      // The section heading already names a single-field form, so a bullet repeating that title is dropped.
      if (sec.fields.length === 1 && filled.length === 1 && filled[0].f.label === sec.title) return filled[0].t + '\n'
      const lines = filled.map(({ f, t }) => `* **${f.label}:** ${t}`)
      return lines.length ? lines.join('\n') + '\n' : '_No data._\n'
    }
    case 'collection':
      return collectionMd(project, mod.id, sec, data) + scheduleSummaryMd(project, mod.id, sec, data)
    case 'matrix':
      return matrixMd(project, mod.id, sec, data)
    case 'graph':
      return graphMd(project, mod.id, sec, data)
    case 'canvas': {
      if (!data.items.length) return '_Canvas is empty._\n'
      const entries = sec.zones ? resolveSource(project, mod.id, sec.zones.source) : []
      const zone = (i: any) => entries.find((e) => e.id === i.refId)?.label
      return (
        '| Kind | Label | Linked | x | y | Width | Height |\n|---|---|---|---|---|---|---|\n' +
        data.items.map((i: any) => `| ${esc(i.kind)} | ${esc(i.label)} | ${esc(zone(i) ?? '')} | ${Math.round(i.x)} | ${Math.round(i.y)} | ${Math.round(i.w)} | ${Math.round(i.h)} |`).join('\n') +
        '\n'
      )
    }
    case 'checklist': {
      const d = data as ChecklistData
      return d.groups.map((g) => `### ${g.title}\n${g.items.map((i) => `- [${i.done ? 'x' : ' '}] ${i.text}`).join('\n')}\n`).join('\n') || '_No items._\n'
    }
    case 'richtext':
      return String(data || '_No text._') + '\n'
    case 'formulas': {
      const d = data as FormulaData
      if (!d.items.length) return '_No formulas._\n'
      let out = '| Name | Formula | Variables | Result |\n|---|---|---|---|\n'
      for (const it of d.items) {
        const r = tryEvaluate(it.expr, it.vars)
        out += `| ${esc(it.name)} | \`${esc(it.expr)}\` | ${esc(Object.entries(it.vars).map(([k, v]) => `${k}=${v}`).join(', '))} | ${r.ok ? r.value : '—'} |\n`
      }
      return out
    }
  }
}

export function moduleToMarkdown(project: Project, mod: PlannerModule): string {
  let out = `# ${mod.title}\n\n**Status:** Draft | **Last modified:** ${project.meta.updatedAt.slice(0, 10)}\n\n> ${mod.summary}\n\n`
  let n = 0
  for (const sec of getSections(mod, project.registry)) {
    const split = sec.kind === 'collection' ? sec.exportSplit : undefined
    if (sec.kind === 'collection' && split) {
      const data = (project.documents[mod.id]?.data[sec.id] ?? []) as Entity[]
      const scale = sec.fields.find((f) => f.key === split.field)
      const options = scale?.type === 'enum' ? scale.options : []
      const rest = data.filter((e) => !options.includes(e[split.field]))
      const groups = [...options.map((o, i) => ({ title: split.headings[i] ?? o, items: data.filter((e) => e[split.field] === o) })), ...(rest.length ? [{ title: 'Unclassified loops', items: rest }] : [])]
      const bare = { ...sec, fields: sec.fields.filter((f) => f.key !== split.field) }
      for (const g of groups) out += `## ${++n}. ${g.title}\n\n${collectionMd(project, mod.id, bare, g.items)}\n`
      continue
    }
    out += `## ${++n}. ${sec.title}\n\n${sec.description ? `_${sec.description}_\n\n` : ''}${sectionMd(project, mod, sec)}\n`
  }
  return out
}

/** Path inside the exported docs folder, e.g. docs/01_design/x.md -> 01_design/x.md */
export const exportPath = (mod: PlannerModule) => mod.docsPath.replace(/^docs\//, '')

export async function exportZip(project: Project): Promise<Blob> {
  const zip = new JSZip()
  for (const m of MODULES) {
    if (!project.documents[m.id]) continue
    zip.file(exportPath(m), moduleToMarkdown(project, m))
  }
  return zip.generateAsync({ type: 'blob' })
}

export function sectionCsv(project: Project, mod: PlannerModule, sec: SectionDef): string | null {
  if (sec.kind !== 'collection') return null
  const data = (project.documents[mod.id]?.data[sec.id] ?? []) as Entity[]
  const q = (s: string) => `"${s.replace(/"/g, '""')}"`
  const header = sec.fields.map((f) => q(f.label)).join(',')
  const rows = data.map((e) => sec.fields.map((f) => q(valueToText(project, mod.id, f, e[f.key]))).join(','))
  return [header, ...rows].join('\n')
}
