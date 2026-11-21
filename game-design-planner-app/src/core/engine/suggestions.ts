import { ARCH_DOC, archList, nameOf } from '../architecture'
import { classList } from '../classes'
import { dataList, sourceOf } from '../dataDriven'
import type { Entity, FieldDef, Project } from '../model/types'
import { getModule, getSection } from '../modules/registry'
import { storedReport, type StoredReport } from './report'

/**
 * Status suggestions from the engine report (plan 7b): the engine never changes a status by itself. It suggests moving
 * a status forward (Planned → In progress → Done, Draft → Ready for testing), the user accepts them (one undo step) or
 * dismisses them until the next report. Where the plan says further than the engine shows, it only warns.
 */
export type StatusSuggestion = {
  /** Stable for one report: doc/section/entity → target status. */
  id: string
  docId: string
  sectionId: string
  entityId: string
  name: string
  kind: 'record' | 'class' | 'module'
  from: string
  to: string
  reason: string
}
export type StatusWarning = { docId: string; sectionId: string; entityId: string; name: string; current: string; reason: string }

const str = (v: unknown) => (typeof v === 'string' ? v : '')

/** The section's status options in order, when it has an enum field `status`. */
function statusOptions(p: Project, docId: string, sectionId: string): string[] | undefined {
  const mod = getModule(docId)
  const sec = mod && getSection(mod, p.registry, sectionId)
  if (sec?.kind !== 'collection') return undefined
  const f = sec.fields.find((x): x is Extract<FieldDef, { type: 'enum' }> => x.key === 'status' && x.type === 'enum')
  return f?.options
}

/** The option a finished engine record stands for: tested in the engine, not yet signed off (never the last, “final” step). */
const READY = [/ready for testing/i, /^integrated$/i, /^implemented$/i, /^review$/i, /^done$/i]
const STARTED = [/in progress/i, /in production/i]
const pick = (options: string[], wanted: RegExp[]) => {
  for (const re of wanted) {
    const o = options.find((x) => re.test(x))
    if (o) return o
  }
  return undefined
}

/** Ranks of a status list; “Blocked” and unknown values do not take part (a blocked item is never moved). */
const rank = (options: string[], v: string) => (/^blocked$/i.test(v) ? -2 : v ? options.indexOf(v) : -1)

export function statusSuggestions(p: Project): { suggestions: StatusSuggestion[]; warnings: StatusWarning[]; report?: StoredReport } {
  const report = storedReport(p)
  const suggestions: StatusSuggestion[] = []
  const warnings: StatusWarning[] = []
  if (!report) return { suggestions, warnings }
  const dismissed = new Set(report.dismissed ?? [])

  const offer = (s: Omit<StatusSuggestion, 'id'>, options: string[]) => {
    const r = rank(options, s.from)
    if (r === -2 || r >= options.indexOf(s.to)) return
    const id = `${s.docId}/${s.sectionId}/${s.entityId}/status=${s.to}`
    if (!dismissed.has(id)) suggestions.push({ ...s, id })
  }

  // Content records whose planner section has a status.
  for (const schema of dataList(p, 'schemas')) {
    const src = sourceOf(schema)
    if (!src) continue
    const options = statusOptions(p, src.doc, src.section)
    if (!options) continue
    const ready = pick(options, READY)
    if (!ready) continue
    const list: Entity[] = Array.isArray(p.documents[src.doc]?.data[src.section]) ? p.documents[src.doc].data[src.section] : []
    for (const e of list) {
      const rec = report.records[String(e.id)]
      if (!rec) continue
      const current = str(e.status)
      const base = { docId: src.doc, sectionId: src.section, entityId: String(e.id), name: nameOf(e) }
      if (rec.s === 'implemented') offer({ ...base, kind: 'record', from: current, to: ready, reason: `${rec.k} is complete in the engine` }, options)
      else if (rank(options, current) >= options.indexOf(ready) && rec.s !== 'deprecated')
        warnings.push({ ...base, current, reason: rec.s === 'missing' ? `${rec.k} has no asset in the engine` : `${rec.k} is incomplete in the engine: ${(rec.i ?? []).map((x) => x.replace(/\.$/, '')).join('; ') || 'see the report'}` })
    }
  }

  // Classes, then the modules that hold them.
  const classOptions = statusOptions(p, ARCH_DOC, 'classes') ?? []
  const done = pick(classOptions, [/^done$/i])
  const started = pick(classOptions, STARTED)
  const byModule = new Map<string, { written: number; started: number; total: number }>()
  for (const c of classList(p)) {
    const st = report.classes[String(c.id)]
    if (!st) continue
    const m = String(c.module ?? '')
    const agg = byModule.get(m) ?? { written: 0, started: 0, total: 0 }
    agg.total++
    if (st.s === 'implemented') agg.written++
    if (st.s === 'implemented' || (st.s === 'stub' && st.todo < st.m)) agg.started++
    byModule.set(m, agg)
    const current = str(c.status)
    const base = { docId: ARCH_DOC, sectionId: 'classes', entityId: String(c.id), name: nameOf(c), kind: 'class' as const }
    if (st.s === 'implemented' && done) offer({ ...base, from: current, to: done, reason: 'every method body is written in the engine' }, classOptions)
    else if (st.s === 'stub' && st.todo < st.m && started) offer({ ...base, from: current, to: started, reason: `${st.m - st.todo} of ${st.m} method bodies written` }, classOptions)
    if (st.s !== 'implemented' && done && current === done)
      warnings.push({ docId: ARCH_DOC, sectionId: 'classes', entityId: base.entityId, name: base.name, current, reason: st.s === 'missing' ? 'the engine has no file for it' : `${st.todo} of ${st.m} method bodies are still TODO in the engine` })
  }
  const moduleOptions = statusOptions(p, ARCH_DOC, 'modules') ?? []
  for (const m of archList(p, 'modules')) {
    const agg = byModule.get(String(m.id))
    if (!agg) continue
    const current = str(m.status)
    const base = { docId: ARCH_DOC, sectionId: 'modules', entityId: String(m.id), name: nameOf(m), kind: 'module' as const, from: current }
    const mDone = pick(moduleOptions, [/^done$/i])
    const mStarted = pick(moduleOptions, STARTED)
    if (agg.written === agg.total && mDone) offer({ ...base, to: mDone, reason: agg.total === 1 ? 'its only class is written in the engine' : `all ${agg.total} of its classes are written in the engine` }, moduleOptions)
    else if (agg.started > 0 && mStarted) offer({ ...base, to: mStarted, reason: `${agg.written} of ${agg.total} classes written, ${agg.started - agg.written} started` }, moduleOptions)
  }
  return { suggestions, warnings, report }
}

/**
 * Applies the given suggestions (call inside `useStore.mutate`): sets each entry's status, but only while it still has
 * the status the suggestion was made from, so nothing edited in between is overwritten. Returns how many were applied.
 */
export function applySuggestions(p: Project, chosen: StatusSuggestion[]): number {
  let n = 0
  for (const s of chosen) {
    const list = p.documents[s.docId]?.data[s.sectionId]
    const e = Array.isArray(list) ? (list as Entity[]).find((x) => String(x.id) === s.entityId) : undefined
    if (!e || str(e.status) !== s.from) continue
    e.status = s.to
    n++
  }
  return n
}

/** Hides suggestions until the next engine report (call inside `useStore.mutate`). */
export function dismissSuggestions(p: Project, chosen: StatusSuggestion[]) {
  const r = (p.meta.engine as { report?: { dismissed?: string[] } } | undefined)?.report
  if (!r) return
  r.dismissed = [...new Set([...(r.dismissed ?? []), ...chosen.map((s) => s.id)])]
}

export const suggestionCount = (p: Project) => statusSuggestions(p).suggestions.length
