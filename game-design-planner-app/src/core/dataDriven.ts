import { archList } from './architecture'
import { toCasing, words } from './coding'
import type { Entity, Project } from './model/types'
import { CONTENT_SOURCES, LOAD_STRATEGIES, VALIDATION_STAGES } from '../modules/technical'

/** Data-driven Design analysis. Planning checks and size estimates over the declared schemas; not an asset scan. */
export const DATA_DOC = 'technical.dataDriven'
export const DEFAULT_RECORD_KB = 4

const ids = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const data = (p: Project): Record<string, any> => p.documents[DATA_DOC]?.data ?? {}
export const dataList = (p: Project, section: string): Entity[] => {
  const d = data(p)[section]
  return Array.isArray(d) ? d : []
}
export const nameOf = (e: Entity | undefined) => (e ? String(e.name || '(unnamed)') : '?')
const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

// ---- Fields and the data model ----

const PRIMITIVES = ['string', 'text', 'int', 'long', 'float', 'double', 'bool', 'boolean', 'id', 'color', 'vector2', 'vector3', 'date', 'enum', 'localizedstring', 'curve', 'animationcurve']
const ASSETS = ['sprite', 'texture', 'texture2d', 'prefab', 'gameobject', 'audioclip', 'material', 'mesh', 'animationclip', 'animatorcontroller', 'scriptableobject']

export type FieldKind = 'primitive' | 'asset' | 'ref' | 'unknown' | 'missing'
export type FieldSpec = { raw: string; name: string; type: string; base: string; array: boolean; optional: boolean; kind: FieldKind; target?: Entity }

/** Parses “name: type”. Types: primitives, Unity assets, another schema’s name (a reference), with [] or List<…> for lists. */
export function parseField(raw: string, schemas: Entity[], optional = false): FieldSpec {
  const i = raw.indexOf(':')
  const name = (i < 0 ? raw : raw.slice(0, i)).trim()
  const type = i < 0 ? '' : raw.slice(i + 1).trim()
  let base = type.replace(/^ref\s+/i, '')
  let array = false
  const list = base.match(/^(?:List|IList|IReadOnlyList)<(.+)>$/i)
  if (list) {
    base = list[1].trim()
    array = true
  }
  if (base.endsWith('[]')) {
    base = base.slice(0, -2).trim()
    array = true
  }
  if (/^enum\b/i.test(base)) base = 'enum'
  const k = key(base)
  const target = schemas.find((s) => key(str(s.name)) === k && k)
  const kind: FieldKind = !type ? 'missing' : target ? 'ref' : PRIMITIVES.includes(k) ? 'primitive' : ASSETS.includes(k) ? 'asset' : 'unknown'
  return { raw, name, type, base, array, optional, kind, target }
}

export function schemaFields(p: Project, schema: Entity): FieldSpec[] {
  const schemas = dataList(p, 'schemas')
  return [...ids(schema.required).map((r) => parseField(r, schemas)), ...ids(schema.optional).map((r) => parseField(r, schemas, true))].filter((f) => f.name)
}

export type ModelEdge = { from: Entity; field: FieldSpec; to: Entity }
/** Every schema with its parsed fields, the references between schemas, and fields whose type is unknown or missing. */
export function dataModel(p: Project) {
  const nodes = dataList(p, 'schemas').map((schema) => ({ schema, fields: schemaFields(p, schema) }))
  const edges: ModelEdge[] = nodes.flatMap((n) => n.fields.filter((f) => f.target).map((f) => ({ from: n.schema, field: f, to: f.target! })))
  const problems = nodes.flatMap((n) => n.fields.filter((f) => f.kind === 'unknown' || f.kind === 'missing').map((f) => ({ schema: n.schema, field: f })))
  return { nodes, edges, problems }
}

// ---- Records ----

export const sourceOf = (schema: Entity) => CONTENT_SOURCES.find((c) => c.label === schema.source)

/** How many records a schema has: the override, else the entries of its content planner. */
export function recordCount(p: Project, schema: Entity): { count: number; from: 'manual' | 'planner' | 'none' } {
  if (isNum(schema.records)) return { count: schema.records, from: 'manual' }
  const src = sourceOf(schema)
  if (!src) return { count: 0, from: 'none' }
  const list = p.documents[src.doc]?.data[src.section]
  return { count: Array.isArray(list) ? list.length : 0, from: 'planner' }
}

const ID_BODY: Record<string, string> = {
  snake_case: '[a-z0-9]+(?:_[a-z0-9]+)*',
  'kebab-case': '[a-z0-9]+(?:-[a-z0-9]+)*',
  camelCase: '[a-z][A-Za-z0-9]*',
  PascalCase: '[A-Z][A-Za-z0-9]*',
}
export const idCasing = (p: Project) => str(data(p).ids?.casing) || 'snake_case'
export const idRegex = (p: Project, schema: Entity) => new RegExp(`^${escape(str(schema.idPrefix))}${ID_BODY[idCasing(p)] ?? '.+'}$`)
/** A record ID for a display name under the schema’s prefix and the casing rule. */
export const makeRecordId = (p: Project, schema: Entity, name: string) => `${str(schema.idPrefix)}${toCasing(words(name), idCasing(p)) || 'example'}`

const ASSET_PATH: Record<string, string> = { sprite: 'Sprites', texture: 'Textures', texture2d: 'Textures', prefab: 'Prefabs', gameobject: 'Prefabs', audioclip: 'Audio', material: 'Materials', mesh: 'Models', animationclip: 'Animations', animatorcontroller: 'Animations' }
function sampleValue(p: Project, f: FieldSpec, name: string): unknown {
  const k = key(f.base)
  if (f.target) return makeRecordId(p, f.target, firstEntry(p, f.target) ?? 'example')
  if (['int', 'long'].includes(k)) return 1
  if (['float', 'double'].includes(k)) return 1.5
  if (['bool', 'boolean'].includes(k)) return false
  if (k === 'color') return '#ffffff'
  if (k === 'vector2') return [0, 0]
  if (k === 'vector3') return [0, 0, 0]
  if (k === 'id') return 'id'
  if (ASSETS.includes(k)) return `Assets/_Project/${ASSET_PATH[k] ?? 'Data'}/${toCasing(words(name), 'PascalCase')}`
  if (f.name.toLowerCase() === 'name' || f.name.toLowerCase() === 'displayname') return name
  return k === 'enum' ? 'Option' : '…'
}
const firstEntry = (p: Project, schema: Entity) => {
  const src = sourceOf(schema)
  const list = src ? p.documents[src.doc]?.data[src.section] : undefined
  const n = Array.isArray(list) ? str(list[0]?.name) : ''
  return n || undefined
}

/** A sample record built from the schema: an ID, then every field with a placeholder of its type (lists hold one value). */
export function sampleRecord(p: Project, schema: Entity): Record<string, unknown> {
  const name = firstEntry(p, schema) ?? `Example ${nameOf(schema)}`
  const out: Record<string, unknown> = { id: makeRecordId(p, schema, name) }
  for (const f of schemaFields(p, schema)) {
    if (f.name === 'id') continue
    const v = sampleValue(p, f, name)
    out[f.name] = f.array ? [v] : v
  }
  return out
}

export type RecordIssue = { level: 'error' | 'warning'; field?: string; message: string }

function typeIssue(f: FieldSpec, v: unknown): string | null {
  const k = key(f.base)
  if (f.target) {
    if (typeof v !== 'string') return `should be a ${nameOf(f.target)} ID`
    const pre = str(f.target.idPrefix)
    return pre && !v.startsWith(pre) ? `should be a ${nameOf(f.target)} ID starting with “${pre}”` : null
  }
  if (['int', 'long'].includes(k)) return Number.isInteger(v) ? null : 'should be a whole number'
  if (['float', 'double'].includes(k)) return typeof v === 'number' ? null : 'should be a number'
  if (['bool', 'boolean'].includes(k)) return typeof v === 'boolean' ? null : 'should be true or false'
  if (k === 'vector2' || k === 'vector3') return Array.isArray(v) && v.length === (k === 'vector2' ? 2 : 3) && v.every((x) => typeof x === 'number') ? null : `should be [${k === 'vector2' ? 'x, y' : 'x, y, z'}]`
  if (k === 'color') return typeof v === 'string' && /^#([0-9a-f]{6}|[0-9a-f]{8})$/i.test(v) ? null : 'should be a colour like #aabbcc'
  if (f.kind === 'primitive' || f.kind === 'asset') return typeof v === 'string' ? null : 'should be text'
  return null
}

/** Checks a JSON record against the schema: parse, ID rule, required fields, field types, references and unknown fields. */
export function validateRecord(p: Project, schema: Entity, text: string): RecordIssue[] {
  let rec: unknown
  try {
    rec = JSON.parse(text)
  } catch (e) {
    return [{ level: 'error', message: `Not valid JSON: ${(e as Error).message}` }]
  }
  if (!rec || typeof rec !== 'object' || Array.isArray(rec)) return [{ level: 'error', message: 'A record is one JSON object { … }.' }]
  const r = rec as Record<string, unknown>
  const out: RecordIssue[] = []
  const fields = schemaFields(p, schema)
  if (typeof r.id !== 'string' || !r.id) out.push({ level: 'error', field: 'id', message: 'needs an id' })
  else if (!idRegex(p, schema).test(r.id)) out.push({ level: 'error', field: 'id', message: `should look like ${makeRecordId(p, schema, 'Iron Sword')}` })
  for (const f of fields) {
    if (f.name === 'id') continue
    const v = r[f.name]
    if (v === undefined || v === null || v === '') {
      if (!f.optional) out.push({ level: 'error', field: f.name, message: 'is required' })
      continue
    }
    if (f.array && !Array.isArray(v)) {
      out.push({ level: 'error', field: f.name, message: 'should be a list [ … ]' })
      continue
    }
    for (const x of f.array ? (v as unknown[]) : [v]) {
      const m = typeIssue(f, x)
      if (m) {
        out.push({ level: 'error', field: f.name, message: m })
        break
      }
    }
  }
  const known = new Set(['id', ...fields.map((f) => f.name)])
  for (const k of Object.keys(r)) if (!known.has(k)) out.push({ level: 'warning', field: k, message: 'is not in the schema' })
  return out
}

// ---- Pipeline readiness ----

export const READINESS_STEPS = [
  { id: 'fields', label: 'Fields' },
  { id: 'format', label: 'Format' },
  { id: 'id', label: 'ID prefix' },
  { id: 'validation', label: 'Validation' },
  { id: 'loading', label: 'Load group' },
  { id: 'tool', label: 'Editor tool' },
  { id: 'extension', label: 'Extension point' },
  { id: 'content', label: 'Content' },
] as const
export type StepId = (typeof READINESS_STEPS)[number]['id']
export type ReadinessCell = { ok: boolean; note: string }

/** Prefixes used by more than one schema. */
export function duplicatePrefixes(p: Project): Map<string, Entity[]> {
  const by = new Map<string, Entity[]>()
  for (const s of dataList(p, 'schemas')) {
    const pre = str(s.idPrefix)
    if (pre) by.set(pre, [...(by.get(pre) ?? []), s])
  }
  return new Map([...by].filter(([, v]) => v.length > 1))
}

/** Each schema against the steps that make content safe to add without code. */
export function pipelineReadiness(p: Project) {
  const model = dataModel(p)
  const formats = new Map(dataList(p, 'formats').map((f) => [f.id, f]))
  const validators = dataList(p, 'validators')
  const groups = dataList(p, 'loadGroups')
  const points = archList(p, 'extensionPoints')
  const dup = duplicatePrefixes(p)
  const rows = model.nodes.map(({ schema, fields }) => {
    const bad = fields.filter((f) => f.kind === 'unknown' || f.kind === 'missing')
    const vals = validators.filter((v) => !v.schema || v.schema === schema.id)
    const inGroups = groups.filter((g) => ids(g.schemas).includes(schema.id))
    const ext = points.filter((x) => ids(x.schemas).includes(schema.id))
    const rc = recordCount(p, schema)
    const pre = str(schema.idPrefix)
    const cells: Record<StepId, ReadinessCell> = {
      fields: { ok: !!fields.length && !bad.length && fields.some((f) => !f.optional), note: !fields.length ? 'no fields' : bad.length ? `unknown type: ${bad.map((f) => f.name).join(', ')}` : fields.some((f) => !f.optional) ? `${fields.length} fields` : 'no required field' },
      format: { ok: formats.has(schema.format), note: formats.has(schema.format) ? nameOf(formats.get(schema.format)) : 'not set' },
      id: { ok: !!pre && !dup.has(pre), note: !pre ? 'not set' : dup.has(pre) ? `shared with ${dup.get(pre)!.filter((s) => s.id !== schema.id).map(nameOf).join(', ')}` : pre },
      validation: { ok: vals.length > 0 || !!str(schema.validation), note: vals.length ? `${vals.length} validator${vals.length > 1 ? 's' : ''}` : str(schema.validation) ? 'rules written, no validator' : 'none' },
      loading: { ok: inGroups.length > 0, note: inGroups.length ? inGroups.map(nameOf).join(', ') : 'not loaded' },
      tool: { ok: !!str(schema.editorTool), note: str(schema.editorTool) || 'none' },
      extension: { ok: ext.length > 0, note: ext.length ? ext.map(nameOf).join(', ') : 'no extension point' },
      content: { ok: rc.count > 0, note: rc.from === 'none' ? 'no planner or count' : `${rc.count} record${rc.count === 1 ? '' : 's'}${rc.from === 'planner' ? ' in ' + (sourceOf(schema)?.label.split(' — ')[1] ?? 'planner') : ''}` },
    }
    const score = Object.values(cells).filter((c) => c.ok).length
    return { schema, cells, score }
  })
  return { rows, total: READINESS_STEPS.length }
}

// ---- Load plan ----

export type GroupRow = { group: Entity; schemas: { schema: Entity; records: number; kb: number }[]; mb: number; over: boolean }
export type Phase = { id: string; label: string; strategy: string; groups: GroupRow[]; mb: number }

/** Load groups in the order they load (boot, each Architecture scene by load order, on demand, streamed), with size estimates. */
export function loadPlan(p: Project, scale = 1) {
  const schemas = new Map(dataList(p, 'schemas').map((s) => [s.id, s]))
  const groups = dataList(p, 'loadGroups')
  const scenes = [...archList(p, 'scenes')].sort((a, b) => (isNum(a.loadOrder) ? a.loadOrder : 99) - (isNum(b.loadOrder) ? b.loadOrder : 99))
  const row = (g: Entity): GroupRow => {
    const rows = ids(g.schemas)
      .map((id) => schemas.get(id))
      .filter((s): s is Entity => !!s)
      .map((schema) => {
        const records = Math.round(recordCount(p, schema).count * scale)
        return { schema, records, kb: records * (isNum(schema.avgSizeKb) ? schema.avgSizeKb : DEFAULT_RECORD_KB) }
      })
    const mb = rows.reduce((a, r) => a + r.kb, 0) / 1024
    return { group: g, schemas: rows, mb, over: isNum(g.budgetMb) && mb > g.budgetMb }
  }
  const phase = (id: string, label: string, strategy: string, gs: Entity[]): Phase => {
    const rows = gs.map(row)
    return { id, label, strategy, groups: rows, mb: rows.reduce((a, r) => a + r.mb, 0) }
  }
  const strategyOf = (g: Entity) => (LOAD_STRATEGIES.includes(g.strategy) ? g.strategy : 'On demand')
  const withScene = groups.filter((g) => strategyOf(g) === 'With scene')
  const phases: Phase[] = [
    phase('boot', 'Boot', 'Preload at boot', groups.filter((g) => strategyOf(g) === 'Preload at boot')),
    ...scenes.map((s) => phase(s.id, nameOf(s), 'With scene', withScene.filter((g) => g.scene === s.id))),
    phase('scene?', 'Scene not set', 'With scene', withScene.filter((g) => !scenes.some((s) => s.id === g.scene))),
    phase('demand', 'On demand', 'On demand', groups.filter((g) => strategyOf(g) === 'On demand')),
    phase('stream', 'Streamed', 'Streamed', groups.filter((g) => strategyOf(g) === 'Streamed')),
  ].filter((ph) => ph.groups.length || ph.id === 'boot')
  const loaded = new Map<string, number>()
  for (const g of groups) for (const id of new Set(ids(g.schemas))) loaded.set(id, (loaded.get(id) ?? 0) + 1)
  return {
    phases,
    unassigned: [...schemas.values()].filter((s) => !loaded.has(s.id)),
    duplicated: [...schemas.values()].filter((s) => (loaded.get(s.id) ?? 0) > 1),
    totalMb: phases.reduce((a, ph) => a + ph.mb, 0),
  }
}

/** Validators per stage (earliest first), for the readiness view. */
export const validatorsByStage = (p: Project) => VALIDATION_STAGES.map((stage) => ({ stage, validators: dataList(p, 'validators').filter((v) => (v.when || 'Build / CI') === stage) }))
