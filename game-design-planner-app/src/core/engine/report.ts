import { z } from 'zod'
import type { Entity, Project } from '../model/types'
import { classList } from '../classes'
import { dataList, sourceOf } from '../dataDriven'
import { buildIR } from './ir'
import { fnv1a } from './manifest'
import { countOf } from '../text'

/**
 * hoh-engine-report: what the engine project says about the plan (written by the engine-side package, e.g. the Unity
 * planner bridge). Untrusted input: parsed with Zod and size limits, only known planner IDs are kept, and it only ever
 * changes the stored report (meta.engine.report), never planner content.
 */
export const REPORT_FORMAT = 'hoh-engine-report'
export const REPORT_VERSION = 1
export const MAX_REPORT_BYTES = 20 * 1024 * 1024

export const RECORD_STATUSES = ['implemented', 'incomplete', 'missing', 'deprecated'] as const
export const CLASS_STATUSES = ['implemented', 'stub', 'missing'] as const
export type RecordStatus = (typeof RECORD_STATUSES)[number]
export type ClassStatus = (typeof CLASS_STATUSES)[number]

const str = (max: number) => z.string().max(max)
export const reportSchema = z.object({
  format: z.literal(REPORT_FORMAT),
  v: z.literal(REPORT_VERSION),
  engine: z.enum(['unity', 'godot', 'unreal']),
  engineVersion: str(100).default(''),
  generatedAt: str(40),
  project: z.object({ name: str(300) }).default({ name: '' }),
  /** Hash of ir/engine-ir.json of the export the engine project was last imported from. */
  irHash: str(16).optional(),
  records: z
    .array(
      z.object({
        plannerId: str(100),
        schema: str(100),
        key: str(300),
        status: z.enum(RECORD_STATUSES),
        assetPath: str(500).optional(),
        issues: z.array(str(300)).max(20).default([]),
      }),
    )
    .max(100_000)
    .default([]),
  classes: z
    .array(
      z.object({
        plannerId: str(100),
        name: str(200),
        status: z.enum(CLASS_STATUSES),
        file: str(500).optional(),
        todo: z.number().int().min(0).max(100_000).default(0),
        methods: z.number().int().min(0).max(100_000).default(0),
      }),
    )
    .max(20_000)
    .default([]),
  metrics: z
    .array(z.object({ key: str(200), value: z.number().finite(), samples: z.number().int().min(0).optional(), build: str(100).optional() }))
    .max(10_000)
    .default([]),
})
export type EngineReport = z.infer<typeof reportSchema>

/** The report as kept in the project file: compact, keyed by planner ID. */
export const storedReportSchema = z.object({
  engine: z.enum(['unity', 'godot', 'unreal']),
  engineVersion: z.string(),
  generatedAt: z.string(),
  importedAt: z.string(),
  irHash: z.string().optional(),
  records: z.record(z.string(), z.object({ s: z.enum(RECORD_STATUSES), k: z.string(), sc: z.string(), i: z.array(z.string()).optional() })),
  classes: z.record(z.string(), z.object({ s: z.enum(CLASS_STATUSES), todo: z.number(), m: z.number() })),
  metrics: z.array(z.object({ key: z.string(), value: z.number(), samples: z.number().optional(), build: z.string().optional() })),
})
export type StoredReport = z.infer<typeof storedReportSchema>

export type ParsedReport = { report: EngineReport; warnings: string[] }

/** Reads a report file. Throws an Error with a readable message when it is not a usable report. */
export function parseReport(text: string, p: Project): ParsedReport {
  if (text.length > MAX_REPORT_BYTES) throw new Error('The report is larger than 20 MB.')
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('The report is not valid JSON.')
  }
  if ((raw as { format?: unknown })?.format !== REPORT_FORMAT) throw new Error('This is not an engine report (hoh-engine-report.json).')
  const v = (raw as { v?: unknown }).v
  if (v !== REPORT_VERSION) throw new Error(`This report uses version ${String(v)}; this planner reads version ${REPORT_VERSION}. Update the planner or the engine package.`)
  const r = reportSchema.safeParse(raw)
  if (!r.success) {
    const first = r.error.issues[0]
    throw new Error(`Invalid report: ${first.path.join('.') || '(root)'} – ${first.message}`)
  }
  const report = r.data
  const warnings: string[] = []
  const known = knownIds(p)
  const unknownRecords = report.records.filter((x) => !known.records.has(x.plannerId)).length
  const unknownClasses = report.classes.filter((x) => !known.classes.has(x.plannerId)).length
  if (unknownRecords) warnings.push(`${countOf(unknownRecords, 'record')} in the report ${unknownRecords === 1 ? 'is' : 'are'} not in this plan and left out.`)
  if (unknownClasses) warnings.push(`${countOf(unknownClasses, 'class', 'classes')} in the report ${unknownClasses === 1 ? 'is' : 'are'} not in this plan and left out.`)
  if (report.project.name && report.project.name !== p.meta.name) warnings.push(`The report is for “${report.project.name}”, this project is “${p.meta.name}”.`)
  if (report.irHash && report.irHash !== currentIrHash(p)) warnings.push('The engine project was imported from an older export of this plan; export and import again for an up-to-date report.')
  return { report, warnings }
}

/** Planner IDs a report may talk about: entries of every schema's content planner, and classes. */
function knownIds(p: Project) {
  const records = new Set<string>()
  for (const ent of contentEntities(p)) records.add(String(ent.id))
  return { records, classes: new Set(classList(p).map((c) => String(c.id))) }
}

function contentEntities(p: Project): Entity[] {
  const out: Entity[] = []
  for (const s of dataList(p, 'schemas')) {
    const src = sourceOf(s)
    const list = src ? p.documents[src.doc]?.data[src.section] : undefined
    if (Array.isArray(list)) out.push(...list)
  }
  return out
}

/** Stores the report (only entries the plan knows). Call inside `useStore.mutate`. */
export function applyReport(p: Project, report: EngineReport, now = new Date().toISOString()): StoredReport {
  const known = knownIds(p)
  const stored: StoredReport = {
    engine: report.engine,
    engineVersion: report.engineVersion,
    generatedAt: report.generatedAt,
    importedAt: now,
    ...(report.irHash && { irHash: report.irHash }),
    records: {},
    classes: {},
    metrics: report.metrics,
  }
  for (const r of report.records) if (known.records.has(r.plannerId)) stored.records[r.plannerId] = { s: r.status, k: r.key, sc: r.schema, ...(r.issues.length && { i: r.issues.slice(0, 5) }) }
  for (const c of report.classes) if (known.classes.has(c.plannerId)) stored.classes[c.plannerId] = { s: c.status, todo: c.todo, m: c.methods }
  p.meta.engine = { ...p.meta.engine, report: stored }
  return stored
}

const cache = new WeakMap<object, StoredReport | null>()
/** The stored report, or undefined. A damaged one (hand-edited file) is ignored rather than trusted. */
export function storedReport(p: Project): StoredReport | undefined {
  const raw = (p.meta.engine as { report?: unknown } | undefined)?.report
  if (!raw || typeof raw !== 'object') return undefined
  if (!cache.has(raw)) {
    const r = storedReportSchema.safeParse(raw)
    cache.set(raw, r.success ? r.data : null)
  }
  return cache.get(raw) ?? undefined
}

export type EngineStatus =
  | { kind: 'record'; status: RecordStatus; key: string; issues: string[]; engine: string }
  | { kind: 'class'; status: ClassStatus; todo: number; methods: number; engine: string }

/** What the engine report says about one planner entry (a content record or a class). */
export function engineStatusOf(p: Project, entityId: string): EngineStatus | undefined {
  const r = storedReport(p)
  if (!r) return undefined
  const rec = r.records[entityId]
  if (rec) return { kind: 'record', status: rec.s, key: rec.k, issues: rec.i ?? [], engine: r.engine }
  const cls = r.classes[entityId]
  if (cls) return { kind: 'class', status: cls.s, todo: cls.todo, methods: cls.m, engine: r.engine }
  return undefined
}

const irHashCache = new WeakMap<object, string>()
/** Hash of ir/engine-ir.json the current plan would export, as the bundle writes it. */
export function currentIrHash(p: Project): string {
  const key = p
  if (!irHashCache.has(key)) irHashCache.set(key, fnv1a(JSON.stringify(buildIR(p).ir, null, 2) + '\n'))
  return irHashCache.get(key)!
}

/** True when the report came from an engine project imported from another export than the current plan gives. */
export const reportStale = (p: Project) => {
  const r = storedReport(p)
  return !!r?.irHash && r.irHash !== currentIrHash(p)
}

export type SchemaStatusRow = { schema: Entity; total: number; counts: Record<RecordStatus | 'notInEngine', number> }

/** Per data schema: how many of its records the engine has, in which state, and how many it does not know at all. */
export function reportBySchema(p: Project): SchemaStatusRow[] {
  const r = storedReport(p)
  if (!r) return []
  return dataList(p, 'schemas').map((schema) => {
    const src = sourceOf(schema)
    const list: Entity[] = src && Array.isArray(p.documents[src.doc]?.data[src.section]) ? p.documents[src.doc].data[src.section] : []
    const counts = { implemented: 0, incomplete: 0, missing: 0, deprecated: 0, notInEngine: 0 }
    for (const e of list) {
      const rec = r.records[String(e.id)]
      counts[rec && rec.sc === schema.id ? rec.s : 'notInEngine']++
    }
    return { schema, total: list.length, counts }
  })
}

/** Records the engine reports as incomplete or missing, with the planner entry for names. */
export function reportProblems(p: Project): { entity: Entity; schema: Entity | undefined; status: RecordStatus; issues: string[] }[] {
  const r = storedReport(p)
  if (!r) return []
  const schemas = new Map(dataList(p, 'schemas').map((s) => [s.id, s]))
  return contentEntities(p)
    .map((entity) => ({ entity, rec: r.records[String(entity.id)] }))
    .filter((x) => x.rec && (x.rec.s === 'incomplete' || x.rec.s === 'missing'))
    .map(({ entity, rec }) => ({ entity, schema: schemas.get(rec!.sc), status: rec!.s, issues: rec!.i ?? [] }))
}

export const classProblems = (p: Project) => {
  const r = storedReport(p)
  if (!r) return []
  return classList(p).flatMap((c) => {
    const s = r.classes[String(c.id)]
    return s && s.s !== 'implemented' ? [{ cls: c, status: s.s, todo: s.todo, methods: s.m }] : []
  })
}

export const reportLabel = (r: StoredReport) => `${r.engine === 'unity' ? 'Unity' : r.engine === 'godot' ? 'Godot' : 'Unreal Engine'}${r.engineVersion ? ' ' + r.engineVersion : ''}`

/** One line about a stored report, for the import message and the status panel. */
export function reportSummary(r: StoredReport): string {
  const recs = Object.values(r.records)
  const n = (s: RecordStatus) => recs.filter((x) => x.s === s).length
  const cls = Object.values(r.classes)
  const parts = [`${countOf(recs.length, 'record')}: ${n('implemented')} done, ${n('incomplete')} incomplete, ${n('missing')} missing, ${n('deprecated')} removed from the plan`]
  if (cls.length) parts.push(`${countOf(cls.length, 'class', 'classes')}: ${cls.filter((c) => c.s === 'implemented').length} written, ${cls.filter((c) => c.s === 'stub').length} with TODOs, ${cls.filter((c) => c.s === 'missing').length} missing`)
  return `${reportLabel(r)}: ${parts.join('; ')}.`
}
