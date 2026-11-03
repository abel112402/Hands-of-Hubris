import { z } from 'zod'
import { tryEvaluate, variablesOf } from '../formula'
import { makeId } from '../model/project'
import type { Entity, FieldDef, Project, SectionDef } from '../model/types'
import { getModule, getSection } from '../modules/registry'
import { entityLabel, resolveSource } from '../references/refs'
import { useStore } from '../store/store'

const id = z.string().min(1).max(100)
const opSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('addEntity'), docId: id, sectionId: id, fields: z.record(z.string(), z.unknown()) }),
  z.object({ op: z.literal('updateField'), docId: id, sectionId: id, entityId: id, field: id, value: z.unknown() }),
  z.object({
    op: z.literal('setFormula'), docId: id, sectionId: id, itemId: id.optional(),
    name: z.string().min(1).max(100), expr: z.string().min(1).max(500), vars: z.record(z.string(), z.number()).default({}),
  }),
  z.object({ op: z.literal('appendRichtext'), docId: id, sectionId: id, text: z.string().min(1).max(20000) }),
])
export const proposalSchema = z.object({ summary: z.string().max(400).default(''), ops: z.array(opSchema).min(1).max(50) })
export type Op = z.infer<typeof opSchema>
export type Proposal = z.infer<typeof proposalSchema>

export type AiMark = { provider: string; model: string; at: string }

/** Extracts the first JSON object from a model answer (handles code fences and surrounding prose). */
export function extractJson(text: string): unknown {
  const t = text.replace(/```(?:json)?/gi, '')
  const a = t.indexOf('{')
  const b = t.lastIndexOf('}')
  if (a < 0 || b <= a) throw new Error('No JSON object found in the answer')
  return JSON.parse(t.slice(a, b + 1))
}

export function parseProposal(text: string): { ok: true; proposal: Proposal } | { ok: false; error: string } {
  try {
    const r = proposalSchema.safeParse(extractJson(text))
    if (!r.success) return { ok: false, error: r.error.issues.slice(0, 3).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') }
    return { ok: true, proposal: r.data }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Invalid JSON' }
  }
}

type Checked = { ok: true; value: unknown } | { ok: false; error: string }
const MAX_TEXT = 20000

/** Validates one value against the field definition; the result is the sanitized value that may be written. */
export function checkValue(project: Project, docId: string, fd: FieldDef, v: unknown): Checked {
  const bad = (error: string): Checked => ({ ok: false, error })
  switch (fd.type) {
    case 'text':
    case 'longtext':
      return typeof v === 'string' && v.length <= MAX_TEXT ? { ok: true, value: v } : bad('expected text')
    case 'color':
      return typeof v === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(v) ? { ok: true, value: v } : bad('expected #hex color')
    case 'number':
      if (typeof v !== 'number' || !Number.isFinite(v)) return bad('expected number')
      if ((fd.min !== undefined && v < fd.min) || (fd.max !== undefined && v > fd.max)) return bad('number out of range')
      return { ok: true, value: v }
    case 'boolean':
      return typeof v === 'boolean' ? { ok: true, value: v } : bad('expected true/false')
    case 'enum':
      return typeof v === 'string' && fd.options.includes(v) ? { ok: true, value: v } : bad(`must be one of: ${fd.options.join(', ')}`)
    case 'ref': {
      const valid = new Set(resolveSource(project, docId, fd.source).map((i) => i.id))
      return typeof v === 'string' && valid.has(v) ? { ok: true, value: v } : bad('unknown reference id')
    }
    case 'multiref': {
      const valid = new Set(resolveSource(project, docId, fd.source).map((i) => i.id))
      return Array.isArray(v) && v.length <= 100 && v.every((x) => typeof x === 'string' && valid.has(x))
        ? { ok: true, value: [...new Set(v as string[])] }
        : bad('unknown reference id in list')
    }
    case 'list':
      return Array.isArray(v) && v.length <= 100 && v.every((x) => typeof x === 'string' && x.length <= 500)
        ? { ok: true, value: v }
        : bad('expected list of short texts')
    default:
      return bad('field type is not editable by AI')
  }
}

export type DiffItem = {
  index: number
  op: Op
  kind: 'add' | 'update' | 'formula' | 'append'
  title: string
  fieldLabel?: string
  before?: unknown
  after?: unknown
  /** sanitized payload that will actually be written */
  clean?: Record<string, unknown>
  warnings: string[]
  error?: string
}

const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype', 'id', '_ai'])
const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k)
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

function target(project: Project, docId: string, sectionId: string, kinds: SectionDef['kind'][]) {
  const mod = getModule(docId)
  if (!mod) return { error: `Unknown document "${docId}"` as const }
  const sec = getSection(mod, project.registry, sectionId)
  if (!sec) return { error: `Unknown section "${sectionId}"` as const }
  if (!kinds.includes(sec.kind)) return { error: `Section "${sec.title}" cannot be changed this way` as const }
  return { mod, sec }
}

const list = (project: Project, docId: string, secId: string): Entity[] => {
  const d = project.documents[docId]?.data[secId]
  return Array.isArray(d) ? d : []
}

/** Turns a proposal into reviewable diff items. Nothing is written here. */
export function buildDiff(project: Project, proposal: Proposal): DiffItem[] {
  return proposal.ops.map((op, index): DiffItem => {
    const base = { index, op, warnings: [] as string[] }
    switch (op.op) {
      case 'addEntity': {
        const t = target(project, op.docId, op.sectionId, ['collection'])
        if ('error' in t) return { ...base, kind: 'add', title: op.sectionId, error: t.error }
        const sec = t.sec as Extract<SectionDef, { kind: 'collection' }>
        const clean: Record<string, unknown> = {}
        for (const [k, v] of Object.entries(op.fields)) {
          const fd = UNSAFE_KEYS.has(k) ? undefined : sec.fields.find((f) => f.key === k)
          if (!fd) { base.warnings.push(`unknown field "${k}" dropped`); continue }
          const c = checkValue(project, op.docId, fd, v)
          if (c.ok) clean[k] = c.value
          else base.warnings.push(`${fd.label}: ${c.error} (dropped)`)
        }
        const title = `${t.mod.title} › ${sec.title} › ${String(clean.name ?? '?')}`
        if (typeof clean.name !== 'string' || !clean.name.trim()) return { ...base, kind: 'add', title, error: 'A valid name is required' }
        return { ...base, kind: 'add', title, after: clean, clean }
      }
      case 'updateField': {
        const t = target(project, op.docId, op.sectionId, ['collection'])
        if ('error' in t) return { ...base, kind: 'update', title: op.sectionId, error: t.error }
        const sec = t.sec as Extract<SectionDef, { kind: 'collection' }>
        const e = list(project, op.docId, op.sectionId).find((x) => x.id === op.entityId)
        const title = `${t.mod.title} › ${sec.title} › ${e ? entityLabel(e) : op.entityId}`
        if (!e) return { ...base, kind: 'update', title, error: 'Entry not found' }
        const fd = UNSAFE_KEYS.has(op.field) ? undefined : sec.fields.find((f) => f.key === op.field)
        if (!fd) return { ...base, kind: 'update', title, error: `Unknown field "${op.field}"` }
        const c = checkValue(project, op.docId, fd, op.value)
        if (!c.ok) return { ...base, kind: 'update', title, fieldLabel: fd.label, error: c.error }
        const before = own(e, fd.key) ? e[fd.key] : undefined
        return { ...base, kind: 'update', title, fieldLabel: fd.label, before, after: c.value, clean: { [fd.key]: c.value } }
      }
      case 'setFormula': {
        const t = target(project, op.docId, op.sectionId, ['formulas'])
        if ('error' in t) return { ...base, kind: 'formula', title: op.sectionId, error: t.error }
        const items: any[] = project.documents[op.docId]?.data[op.sectionId]?.items ?? []
        const cur = op.itemId ? items.find((x) => x.id === op.itemId) : undefined
        const title = `${t.mod.title} › ${t.sec.title} › ${op.name}`
        if (op.itemId && !cur) return { ...base, kind: 'formula', title, error: 'Formula not found' }
        const missing = variablesOf(op.expr).filter((v) => !Number.isFinite(op.vars[v]))
        if (missing.length) return { ...base, kind: 'formula', title, error: `Undefined variables: ${missing.join(', ')}` }
        const r = tryEvaluate(op.expr, op.vars)
        if (!r.ok) return { ...base, kind: 'formula', title, error: `Formula cannot be evaluated: ${r.error}` }
        const after = { name: op.name, expr: op.expr, vars: op.vars }
        return {
          ...base, kind: 'formula', title,
          before: cur ? { name: cur.name, expr: cur.expr, vars: cur.vars } : undefined,
          after: { ...after, result: r.value }, clean: after,
        }
      }
      case 'appendRichtext': {
        const t = target(project, op.docId, op.sectionId, ['richtext'])
        if ('error' in t) return { ...base, kind: 'append', title: op.sectionId, error: t.error }
        const cur = project.documents[op.docId]?.data[op.sectionId]
        return { ...base, kind: 'append', title: `${t.mod.title} › ${t.sec.title}`, before: typeof cur === 'string' ? cur : '', after: op.text, clean: { text: op.text } }
      }
    }
  })
}

export type ApplyResult = { applied: number; skipped: { index: number; reason: string }[] }

/** Applies the selected, valid diff items in ONE store mutation (= one undo step). Stale items are skipped. */
export function applyDiff(diff: DiffItem[], selected: Set<number>, mark: { provider: string; model: string }): ApplyResult {
  const store = useStore.getState()
  const fresh = new Map(buildDiff(store.project, { summary: '', ops: diff.map((d) => d.op) }).map((d) => [d.index, d]))
  const result: ApplyResult = { applied: 0, skipped: [] }
  const todo: DiffItem[] = []
  for (const d of diff) {
    if (!selected.has(d.index)) continue
    const f = fresh.get(d.index)
    if (d.error || !f || f.error || !f.clean) { result.skipped.push({ index: d.index, reason: d.error ?? f?.error ?? 'invalid' }); continue }
    if ((d.kind === 'update' || d.kind === 'formula') && !same(d.before, f.before)) { result.skipped.push({ index: d.index, reason: 'stale' }); continue }
    todo.push(f)
  }
  if (!todo.length) return result
  for (const d of todo) store.ensureDoc(d.op.docId)
  const at = new Date().toISOString()
  const aiMark: AiMark = { ...mark, at }
  useStore.getState().mutate((p) => {
    for (const d of todo) {
      const op = d.op
      const data = p.documents[op.docId]?.data
      if (!data) continue
      if (op.op === 'addEntity') {
        const arr = data[op.sectionId]
        if (Array.isArray(arr)) { arr.push({ id: makeId(), ...d.clean, _ai: aiMark }); result.applied++ }
      } else if (op.op === 'updateField') {
        const e = (data[op.sectionId] as Entity[] | undefined)?.find((x) => x.id === op.entityId)
        if (e) { Object.assign(e, d.clean); e._ai = aiMark; result.applied++ }
      } else if (op.op === 'setFormula') {
        const fd = data[op.sectionId]
        if (!fd || !Array.isArray(fd.items)) continue
        const cur = op.itemId ? fd.items.find((x: any) => x.id === op.itemId) : undefined
        if (cur) Object.assign(cur, d.clean, { _ai: aiMark })
        else fd.items.push({ id: makeId(), ...d.clean, _ai: aiMark })
        result.applied++
      } else if (op.op === 'appendRichtext') {
        const cur = typeof data[op.sectionId] === 'string' ? data[op.sectionId] : ''
        data[op.sectionId] = cur ? `${cur}\n\n${op.text}` : op.text
        result.applied++
      }
    }
  })
  return result
}
