import { dataList, duplicatePrefixes, fieldMapOf, NO_FIELD, idCasing, makeRecordId, nameOf, schemaFields, sourceOf, type AssetType, type FieldSpec } from '../dataDriven'
import { words } from '../coding'
import { getModule, getSection, getSections, MODULES } from '../modules/registry'
import type { Entity, Project } from '../model/types'
import { formulaVars, parseFormula, type FormulaNode } from './formulaAst'
import { variablesOf } from '../formula'
import { classIssues, classModel, type ClassKind, type MemberType, type Visibility } from '../classes'
import { archList } from '../architecture'
import { codingList, folderTree, lfsCoverage } from '../coding'
import { buildAudio, buildBudgets, type IrAudio, type IrBudget } from './irPolish'
import { buildSave, buildScenes, buildStory, type IrSave, type IrScenes, type IrStory } from './irContent'
import { buildInput, buildStateMachines, buildUi, type IrInput, type IrStateMachine, type IrUi } from './irScaffold'
import { buildArt, buildChannels, buildChecks, buildCheats, buildTelemetry, type IrArt, type IrChannel, type IrCheat, type IrCheck, type IrTelemetry } from './irExtras'

/**
 * Engine IR: the project's data-driven content in engine-neutral form. Every engine adapter
 * (Unity now, Godot and Unreal later) works from this and never reads the project itself.
 */
/** 2: classes from the class diagram. 3: project set-up (code style, naming rules, folders, modules, Git LFS). 4: data checks, cheat commands, art palette. 5: communication channels, telemetry events. 6: input map, screens and their flow, state machines. 7: performance budgets, audio events. 8: quest graph, save system, scenes by roadmap phase. */
export const IR_VERSION = 8

export type AssetKind = AssetType
const ASSET_KINDS: AssetKind[] = ['image', 'scene', 'audio', 'material', 'mesh', 'animation', 'animator', 'data']
export type NeutralType =
  | { k: 'string' | 'text' | 'int' | 'float' | 'bool' | 'color' | 'vec2' | 'vec3' | 'date' | 'curve' | 'localized' }
  | { k: 'enum'; enumId: string }
  | { k: 'asset'; asset: AssetKind }
  | { k: 'ref'; schema: string }
  | { k: 'list'; of: NeutralType }
  /** Only in classes: another class of the diagram, or an engine type written as is (Transform, UnityEvent). */
  | { k: 'class'; classId: string }
  | { k: 'engine'; name: string }

export type IrField = { name: string; words: string[]; raw: string; type: NeutralType; optional: boolean; known: boolean }
export type IrFormat = 'native' | 'json' | 'csv'
export type IrSchema = {
  id: string
  name: string
  words: string[]
  idPrefix: string
  version: number
  format: IrFormat
  formatName: string
  load?: { group: string; strategy: string; label?: string }
  moddable: boolean
  source?: string
  fields: IrField[]
}
export type IrEnum = { id: string; name: string; words: string[]; from: 'catalog' | 'values'; members: { id: string; label: string }[] }
export type IrRecord = { plannerId: string; key: string; schema: string; name: string; values: Record<string, unknown> }
export type IrFormula = { id: string; name: string; words: string[]; where: string; expr: string; params: string[]; sample: Record<string, number>; ast?: FormulaNode; error?: string }
export type IrString = { key: string; text: string }
export type IrMember = { name: string; type: NeutralType | null; visibility: Visibility; isStatic: boolean }
export type IrMethod = { name: string; params: { name: string; type: NeutralType | null }[]; returns: NeutralType | null; visibility: Visibility; isStatic: boolean }
/** Project set-up from Coding Standards and Architecture: what an engine's project files and folder skeleton are made from. */
export type IrSetup = {
  style: { indent?: 'spaces' | 'tabs'; indentSize?: number; lineLength?: number; braces?: 'newline' | 'same' }
  /** Naming rules: target as in Coding Standards (“Class / struct”, “Private field”…), casing, optional prefix/suffix, severity. */
  naming: { target: string; casing: string; prefix?: string; suffix?: string; severity: string; automated: boolean }[]
  /** Planned folders under Assets/ (or the engine's content root), with the module whose assembly lives there. */
  folders: { path: string; purpose?: string; module?: string; assembly: boolean }[]
  modules: { id: string; name: string; words: string[]; assembly: string; dependsOn: string[] }[]
  /** Git LFS patterns as planned, plus patterns for binary types the folders hold that no pattern catches. */
  lfs: string[]
  ignore: string[]
}

export type IrClass = {
  id: string
  name: string
  words: string[]
  kind: ClassKind
  doc: string
  module?: { id: string; name: string; words: string[]; assembly: string }
  /** Class id of the base, when it is in the diagram. */
  base?: string
  implements: string[]
  requires: string[]
  fields: IrMember[]
  methods: IrMethod[]
}

export type EngineIR = {
  format: 'hoh-engine-ir'
  v: typeof IR_VERSION
  project: { name: string; words: string[] }
  idCasing: string
  schemas: IrSchema[]
  enums: IrEnum[]
  records: IrRecord[]
  formulas: IrFormula[]
  strings: IrString[]
  classes: IrClass[]
  setup: IrSetup
  /** Balance plan data checks: every record of a schema keeps an expression in range (engine tests). */
  checks: IrCheck[]
  /** Debug-console commands with the IDs they accept. */
  cheats: IrCheat[]
  /** Colours for placeholder assets. */
  art: IrArt
  /** Architecture's communication channels: event buses and ScriptableObject channels with typed payloads. */
  channels: IrChannel[]
  /** Balance plan telemetry events: what the game logs in playtests, and the metrics they add up to. */
  telemetry: IrTelemetry[]
  /** UI/UX › Controls: the input actions with their keys and buttons. */
  input: IrInput
  /** UI/UX › Screens and Screen flow. */
  ui: IrUi
  /** State machines drawn in the planner's graphs (e.g. the NPC life cycle). */
  stateMachines: IrStateMachine[]
  /** Technical › Performance budgets, with what the engine can measure by itself. */
  budgets: IrBudget[]
  /** Audio Direction's music and sound effects as audio events. */
  audio: IrAudio
  /** Story & Quests: quests, choices and endings, for the quest log and its reachability test. */
  story: IrStory
  /** Save System: version, slots and the parts a save holds. */
  save: IrSave
  /** Technical Architecture scenes with the roadmap phase from which builds include them. */
  scenes: IrScenes
}

export type IssueLevel = 'error' | 'warning' | 'info'
export type EngineIssue = { level: IssueLevel; code: string; message: string; schema?: string; field?: string }

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
/** Plural catalog key to a singular type name: rarities → rarity, damageTypes → damageType. */
const singular = (s: string) => (/ies$/i.test(s) ? s.slice(0, -3) + 'y' : /ses$/i.test(s) ? s.slice(0, -2) : /s$/i.test(s) && !/ss$/i.test(s) ? s.slice(0, -1) : s)


function formatOf(p: Project, schema: Entity): { format: IrFormat; name: string; known: boolean } {
  const f = dataList(p, 'formats').find((x) => x.id === schema.format)
  if (!f) return { format: 'json', name: '', known: false }
  const n = key(`${str(f.name)} ${f.id}`)
  if (n.includes('csv')) return { format: 'csv', name: nameOf(f), known: true }
  if (n.includes('json')) return { format: 'json', name: nameOf(f), known: true }
  if (/scriptableobject|formatso|resource|dataasset|datatable|asset/.test(n)) return { format: 'native', name: nameOf(f), known: true }
  return { format: 'json', name: nameOf(f), known: false }
}

type Ctx = {
  p: Project
  schemas: Entity[]
  enums: Map<string, IrEnum>
  /** schema id → (planner entity id → record key) */
  keys: Map<string, Map<string, string>>
}

/** The enum a field of type `enum` stands for: a catalog with the field's name, else the values used in the content planner. */
function enumFor(ctx: Ctx, schema: Entity, f: FieldSpec): string {
  const k = key(f.name)
  const cats = ctx.p.registry.catalogs ?? {}
  const cat = Object.keys(cats).find((c) => [k, k + 's', k.replace(/y$/, 'ies'), k + 'es'].includes(key(c)))
  if (cat) return `catalog:${cat}`
  const id = `values:${schema.id}.${f.name}`
  if (!ctx.enums.has(id)) {
    const src = sourceOf(schema)
    const list = src ? ctx.p.documents[src.doc]?.data[src.section] : undefined
    const vals = new Set<string>()
    for (const e of Array.isArray(list) ? list : []) {
      const v = pick(e, f.name, fieldMapOf(schema))
      if (typeof v === 'string' && v.trim()) vals.add(v.trim())
    }
    const w = [...words(nameOf(schema)), ...words(f.name)]
    ctx.enums.set(id, { id, name: `${nameOf(schema)} ${f.name}`, words: w, from: 'values', members: [...vals].map((v) => ({ id: v, label: v })) })
  }
  return id
}

function neutralType(ctx: Ctx, schema: Entity, f: FieldSpec): { type: NeutralType; known: boolean } {
  let t: NeutralType
  let known = true
  if (f.target) t = { k: 'ref', schema: f.target.id }
  else if (f.primitive === 'enum') t = { k: 'enum', enumId: enumFor(ctx, schema, f) }
  else if (f.primitive) t = { k: f.primitive === 'id' ? 'string' : f.primitive } as NeutralType
  else if (f.asset) t = { k: 'asset', asset: f.asset }
  else {
    t = { k: 'string' }
    known = false
  }
  return { type: f.array ? { k: 'list', of: t } : t, known }
}

/** Planner field that fills a schema field: same name (ignoring case and punctuation), name for title/label, else a shorter key of 4+ letters that the field name starts with (stack → stackSize). */
export function matchField(keys: string[], field: string): string | undefined {
  const k = key(field)
  const props = keys.filter((x) => x !== 'id')
  const exact = props.find((x) => key(x) === k)
  if (exact) return exact
  if (['title', 'displayname', 'label'].includes(k) && props.includes('name')) return 'name'
  return props.find((x) => {
    const kx = key(x)
    return kx.length >= 4 && k.startsWith(kx)
  })
}

/** The value of an entity for a schema field: the schema's own field mapping first, then `matchField`. A mapping to “—” means no planner field. */
function pick(e: Entity, field: string, map: Map<string, string>): unknown {
  const m = map.get(field)
  if (m !== undefined) return m === NO_FIELD ? undefined : e[m]
  if (key(field) === 'name') return e.name
  const k = matchField(Object.keys(e), field)
  return k ? e[k] : undefined
}

/** The fields of a schema's content planner: its section's fields in order, then other keys its entries use. */
export function sourceFields(p: Project, schema: Entity): { id: string; label: string }[] {
  const src = sourceOf(schema)
  if (!src) return []
  const mod = getModule(src.doc)
  const sec = mod && getSection(mod, p.registry, src.section)
  const out = new Map<string, string>()
  if (sec?.kind === 'collection') for (const f of sec.fields) out.set(f.key, f.label)
  const list = p.documents[src.doc]?.data[src.section]
  for (const e of Array.isArray(list) ? list : []) for (const k of Object.keys(e)) if (k !== 'id' && !out.has(k)) out.set(k, k)
  if (!out.has('name')) out.set('name', 'Name')
  return [...out].map(([id, label]) => ({ id, label }))
}

type Converted = { ok: true; value: unknown } | { ok: false }
const OK = (value: unknown): Converted => ({ ok: true, value })
const FAIL: Converted = { ok: false }

function convert(ctx: Ctx, v: unknown, t: NeutralType): Converted {
  switch (t.k) {
    case 'list': {
      // A map such as { itemId: qty } stands for the list of its keys.
      const xs = Array.isArray(v) ? v : v && typeof v === 'object' && t.of.k !== 'string' && t.of.k !== 'text' && t.of.k !== 'localized' ? Object.keys(v) : [v]
      const out = xs.map((x) => convert(ctx, x, t.of))
      return out.every((c) => c.ok) ? OK(out.map((c) => (c as { value: unknown }).value)) : FAIL
    }
    case 'ref': {
      const target = typeof v === 'object' && v ? (v as Entity).item ?? (v as Entity).id : v
      if (typeof target !== 'string') return FAIL
      const m = ctx.keys.get(t.schema)
      const k = m?.get(target) ?? ([...(m?.values() ?? [])].includes(target) ? target : undefined)
      return k ? OK(k) : FAIL
    }
    case 'int':
    case 'float': {
      const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v
      if (!isNum(n)) return FAIL
      return OK(t.k === 'int' ? Math.round(n) : n)
    }
    case 'bool':
      return typeof v === 'boolean' ? OK(v) : v === 'true' || v === 'false' ? OK(v === 'true') : FAIL
    case 'string':
    case 'text':
    case 'localized':
    case 'date': {
      if (typeof v === 'string' || typeof v === 'number') return OK(String(v))
      if (v && typeof v === 'object' && typeof ((v as Entity).text ?? (v as Entity).name) === 'string') return OK((v as Entity).text ?? (v as Entity).name)
      return FAIL
    }
    case 'color':
      return typeof v === 'string' && /^#([0-9a-f]{6}|[0-9a-f]{8})$/i.test(v) ? OK(v.toLowerCase()) : FAIL
    case 'vec2':
    case 'vec3': {
      const n = t.k === 'vec2' ? 2 : 3
      return Array.isArray(v) && v.length === n && v.every(isNum) ? OK(v) : FAIL
    }
    case 'enum': {
      const en = ctx.enums.get(t.enumId)
      if (typeof v !== 'string' || !en) return FAIL
      const m = en.members.find((x) => x.id === v) ?? en.members.find((x) => key(x.label) === key(v))
      return m ? OK(m.id) : FAIL
    }
    case 'asset':
      return typeof v === 'string' && v.trim() ? OK(v.trim()) : FAIL
    case 'curve':
    case 'class':
    case 'engine':
      return FAIL
  }
}

const emptyOf = (t: NeutralType) => (t.k === 'list' ? [] : null)

/** Builds the engine-neutral IR and the issues found on the way. Pure: same project, same result. */
export function buildIR(p: Project): { ir: EngineIR; issues: EngineIssue[] } {
  const issues: EngineIssue[] = []
  const schemas = dataList(p, 'schemas')
  const ctx: Ctx = { p, schemas, enums: new Map(), keys: new Map() }

  // Every catalog is an enum, in catalog order.
  for (const [id, cat] of Object.entries(p.registry.catalogs ?? {})) {
    ctx.enums.set(`catalog:${id}`, { id: `catalog:${id}`, name: cat.label || singular(id), words: words(singular(id)), from: 'catalog', members: (cat.items ?? []).map((i) => ({ id: i.id, label: i.label || i.id })) })
  }

  // Record keys first, so references between schemas resolve in any order.
  const sourceList = (s: Entity): Entity[] => {
    const src = sourceOf(s)
    const list = src ? p.documents[src.doc]?.data[src.section] : undefined
    return Array.isArray(list) ? list : []
  }
  for (const s of schemas) {
    const m = new Map<string, string>()
    const used = new Set<string>()
    let clashes = 0
    for (const e of sourceList(s)) {
      let k = makeRecordId(p, s, str(e.name) || String(e.id))
      if (used.has(k)) {
        clashes++
        let n = 2
        while (used.has(`${k}_${n}`)) n++
        k = `${k}_${n}`
      }
      used.add(k)
      m.set(String(e.id), k)
    }
    ctx.keys.set(s.id, m)
    if (clashes) issues.push({ level: 'info', code: 'record.keyClash', schema: s.id, message: `${nameOf(s)}: ${clashes} record name${clashes > 1 ? 's' : ''} repeat; a number was added to keep the IDs unique.` })
  }

  const dup = duplicatePrefixes(p)
  const groups = dataList(p, 'loadGroups')
  const typeNames = new Map<string, string[]>()
  const irSchemas: IrSchema[] = schemas.map((s) => {
    const fm = formatOf(p, s)
    if (!s.format) issues.push({ level: 'warning', code: 'schema.noFormat', schema: s.id, message: `${nameOf(s)}: no format set; exported as JSON.` })
    else if (!fm.known) issues.push({ level: 'info', code: 'schema.otherFormat', schema: s.id, message: `${nameOf(s)}: format “${fm.name}” is not JSON, CSV or a native data asset; exported as JSON.` })
    const pre = str(s.idPrefix)
    if (!pre) issues.push({ level: 'warning', code: 'schema.noPrefix', schema: s.id, message: `${nameOf(s)}: no ID prefix; record IDs of different schemas may clash.` })
    else if (dup.has(pre)) issues.push({ level: 'error', code: 'schema.sharedPrefix', schema: s.id, message: `${nameOf(s)}: ID prefix “${pre}” is shared with another schema.` })
    const fields = schemaFields(p, s)
      .filter((f) => key(f.name) !== 'id')
      .map((f): IrField => {
        const { type, known } = neutralType(ctx, s, f)
        if (!known) issues.push({ level: 'warning', code: 'field.unknownType', schema: s.id, field: f.name, message: `${nameOf(s)}.${f.name}: type “${f.type || '?'}” is not known; exported as text.` })
        return { name: f.name, words: words(f.name), raw: f.raw, type, optional: f.optional, known }
      })
    if (!fields.length) issues.push({ level: 'warning', code: 'schema.noFields', schema: s.id, message: `${nameOf(s)}: no fields; the generated type is empty.` })
    if (!sourceOf(s)) issues.push({ level: 'info', code: 'schema.noSource', schema: s.id, message: `${nameOf(s)}: no content planner, so no records are exported (only the type).` })
    const g = groups.find((x) => Array.isArray(x.schemas) && x.schemas.includes(s.id))
    const tn = key(words(nameOf(s)).join(''))
    typeNames.set(tn, [...(typeNames.get(tn) ?? []), nameOf(s)])
    return {
      id: s.id,
      name: nameOf(s),
      words: words(nameOf(s)),
      idPrefix: pre,
      version: isNum(s.version) ? s.version : 1,
      format: fm.format,
      formatName: fm.name,
      ...(g && { load: { group: nameOf(g), strategy: str(g.strategy) || 'On demand', ...(str(g.label) && { label: str(g.label) }) } }),
      moddable: !!s.moddable,
      ...(sourceOf(s) && { source: sourceOf(s)!.label }),
      fields,
    }
  })
  for (const names of typeNames.values()) if (names.length > 1) issues.push({ level: 'error', code: 'schema.sameTypeName', message: `Schemas ${names.map((n) => `“${n}”`).join(' and ')} become the same type name.` })

  // Records and localized strings.
  const records: IrRecord[] = []
  const strings: IrString[] = []
  irSchemas.forEach((s, si) => {
    const missing = new Map<string, number>()
    const unresolved = new Map<string, number>()
    const list = sourceList(schemas[si])
    const map = fieldMapOf(schemas[si])
    if (map.size) {
      const known = new Set(sourceFields(p, schemas[si]).map((x) => x.id))
      for (const [field, from] of map) {
        if (!s.fields.some((x) => x.name === field)) issues.push({ level: 'warning', code: 'map.unknownField', schema: s.id, field, message: `${s.name}: the field mapping names “${field}”, which is not a field of the schema.` })
        else if (from !== NO_FIELD && !known.has(from)) issues.push({ level: 'warning', code: 'map.unknownSource', schema: s.id, field, message: `${s.name}.${field}: mapped to “${from}”, which the content planner does not have.` })
      }
    }
    for (const e of list) {
      const k = ctx.keys.get(s.id)!.get(String(e.id))!
      const values: Record<string, unknown> = { id: k }
      for (const f of s.fields) {
        const raw = pick(e, f.name, map)
        if (raw === undefined || raw === null || raw === '' || (Array.isArray(raw) && !raw.length)) {
          values[f.name] = emptyOf(f.type)
          if (!f.optional) missing.set(f.name, (missing.get(f.name) ?? 0) + 1)
          continue
        }
        const c = convert(ctx, raw, f.type)
        if (!c.ok) {
          values[f.name] = emptyOf(f.type)
          unresolved.set(f.name, (unresolved.get(f.name) ?? 0) + 1)
          continue
        }
        const loc = f.type.k === 'localized' || (f.type.k === 'list' && f.type.of.k === 'localized')
        if (loc) {
          const texts = Array.isArray(c.value) ? (c.value as string[]) : [c.value as string]
          const keys = texts.map((text, i) => {
            const sk = `${k}.${f.name}${Array.isArray(c.value) ? `.${i}` : ''}`
            strings.push({ key: sk, text })
            return sk
          })
          values[f.name] = Array.isArray(c.value) ? keys : keys[0]
        } else values[f.name] = c.value
      }
      records.push({ plannerId: String(e.id), key: k, schema: s.id, name: str(e.name), values })
    }
    for (const f of s.fields) {
      const n = missing.get(f.name)
      const asset = f.type.k === 'asset' || (f.type.k === 'list' && f.type.of.k === 'asset')
      if (n) issues.push({ level: asset ? 'info' : 'warning', code: asset ? 'record.assetUnset' : 'record.missing', schema: s.id, field: f.name, message: asset ? `${s.name}.${f.name}: assigned in the engine (${n} of ${list.length} records have no value in the planner).` : `${s.name}.${f.name}: required, but ${n} of ${list.length} records have no matching value in the content planner.` })
      const u = unresolved.get(f.name)
      if (u) issues.push({ level: 'warning', code: 'record.unresolved', schema: s.id, field: f.name, message: `${s.name}.${f.name}: ${u} of ${list.length} values could not be converted to ${describe(f.type, ctx, irSchemas)}.` })
    }
  })

  for (const en of ctx.enums.values()) if (en.from === 'values' && !en.members.length) issues.push({ level: 'warning', code: 'enum.empty', message: `Enum ${en.name}: no catalog of that name and no values in the content planner.` })

  // Formulas from every formulas section, in module order.
  const formulas: IrFormula[] = []
  for (const m of MODULES) {
    const doc = p.documents[m.id]
    if (!doc) continue
    for (const sec of getSections(m, p.registry)) {
      if (sec.kind !== 'formulas') continue
      const items = doc.data[sec.id]?.items
      for (const it of Array.isArray(items) ? items : []) {
        const expr = str(it.expr)
        if (!expr) continue
        const name = str(it.name) || 'Formula'
        const sample: Record<string, number> = {}
        for (const [k, v] of Object.entries(it.vars ?? {})) if (isNum(v)) sample[k] = v
        const where = `${m.title} › ${sec.title}`
        try {
          const ast = parseFormula(expr)
          formulas.push({ id: String(it.id), name, words: words(name), where, expr, params: formulaVars(ast), sample, ast })
        } catch (e) {
          formulas.push({ id: String(it.id), name, words: words(name), where, expr, params: variablesOf(expr), sample, error: (e as Error).message })
          issues.push({ level: 'warning', code: 'formula.invalid', message: `Formula “${name}” (${where}): ${(e as Error).message}; generated as a stub.` })
        }
      }
    }
  }

  const ir: EngineIR = {
    format: 'hoh-engine-ir',
    v: IR_VERSION,
    project: { name: p.meta.name, words: words(p.meta.name) },
    idCasing: idCasing(p),
    schemas: irSchemas,
    enums: [...ctx.enums.values()],
    records,
    formulas,
    strings,
    classes: buildClasses(p, issues),
    setup: buildSetup(p),
    checks: buildChecks(p, irSchemas, issues),
    cheats: buildCheats(p, records),
    art: buildArt(p),
    channels: buildChannels(p, irSchemas, issues),
    telemetry: buildTelemetry(p, irSchemas, issues),
    input: buildInput(p),
    ui: buildUi(p),
    stateMachines: buildStateMachines(p, issues),
    budgets: buildBudgets(p),
    audio: buildAudio(p),
    story: buildStory(p),
    save: buildSave(p),
    scenes: buildScenes(p),
  }
  return { ir, issues }
}

function describe(t: NeutralType, ctx: Ctx, schemas: IrSchema[]): string {
  if (t.k === 'list') return `a list of ${describe(t.of, ctx, schemas)}`
  if (t.k === 'ref') return `${schemas.find((s) => s.id === t.schema)?.name ?? '?'} IDs`
  if (t.k === 'enum') return `${ctx.enums.get(t.enumId)?.name ?? 'enum'} values`
  if (t.k === 'asset') return `${t.asset} asset paths`
  return t.k
}

/** Every neutral type kind, for adapter contract tests. */
export const ALL_NEUTRAL_TYPES: NeutralType[] = [
  ...(['string', 'text', 'int', 'float', 'bool', 'color', 'vec2', 'vec3', 'date', 'curve', 'localized'] as const).map((k) => ({ k }) as NeutralType),
  { k: 'enum', enumId: 'catalog:x' },
  ...ASSET_KINDS.map((asset) => ({ k: 'asset', asset }) as NeutralType),
  { k: 'ref', schema: 's' },
  { k: 'list', of: { k: 'int' } },
  { k: 'class', classId: 'c' },
  { k: 'engine', name: 'Transform' },
]

/** A member type of the class diagram in neutral form. */
function memberType(t: MemberType | null): NeutralType | null {
  if (!t) return null
  let inner: NeutralType
  if (t.k === 'class') inner = { k: 'class', classId: t.cls.id }
  else if (t.k === 'schema') inner = { k: 'ref', schema: t.schema.id }
  else if (t.k === 'engine') inner = { k: 'engine', name: t.name }
  else if (t.spec.asset) inner = { k: 'asset', asset: t.spec.asset }
  else if (t.spec.primitive && t.spec.primitive !== 'enum') inner = { k: t.spec.primitive === 'id' ? 'string' : t.spec.primitive } as NeutralType
  else inner = { k: 'engine', name: t.spec.base }
  return t.list ? { k: 'list', of: inner } : inner
}

/** The class diagram (Technical Architecture › Classes) for the IR, with its rule checks as issues. */
function buildClasses(p: Project, issues: EngineIssue[]): IrClass[] {
  const modules = new Map(archList(p, 'modules').map((m) => [m.id, m]))
  for (const i of classIssues(p)) issues.push({ level: i.level, code: 'class.check', message: `Class ${i.message}` })
  return classModel(p).nodes.map((n) => {
    const m = modules.get(n.cls.module)
    return {
      id: n.cls.id,
      name: nameOf(n.cls),
      words: words(nameOf(n.cls)),
      kind: n.kind,
      doc: str(n.cls.responsibility),
      ...(m && { module: { id: m.id, name: nameOf(m), words: words(nameOf(m)), assembly: str(m.assembly) } }),
      ...(n.cls.base && { base: String(n.cls.base) }),
      implements: Array.isArray(n.cls.implements) ? n.cls.implements.filter((x: unknown) => typeof x === 'string') : [],
      requires: Array.isArray(n.cls.requires) ? n.cls.requires.filter((x: unknown) => typeof x === 'string') : [],
      fields: n.fields.map((f) => ({ name: f.name, type: memberType(f.type), visibility: f.visibility, isStatic: f.isStatic })),
      methods: n.methods.map((x) => ({ name: x.name, params: x.params.map((a) => ({ name: a.name, type: memberType(a.type) })), returns: memberType(x.returns), visibility: x.visibility, isStatic: x.isStatic })),
    }
  })
}

/** Coding Standards and Architecture as the engine needs them for project files and the folder skeleton. */
function buildSetup(p: Project): IrSetup {
  const style = (p.documents['technical.coding']?.data.style ?? {}) as Record<string, unknown>
  const git = (p.documents['technical.coding']?.data.git ?? {}) as Record<string, unknown>
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map((x) => x.trim()) : [])
  const num = (v: unknown) => (isNum(v) ? v : undefined)
  const lfs = list(git.lfs)
  for (const row of lfsCoverage(p)) if (!row.covered) lfs.push(`*${row.ext}`)
  const tree = folderTree(p)
  return {
    style: {
      ...(style.indent === 'Spaces' ? { indent: 'spaces' as const } : style.indent === 'Tabs' ? { indent: 'tabs' as const } : {}),
      ...(num(style.indentSize) && { indentSize: num(style.indentSize) }),
      ...(num(style.lineLength) && { lineLength: num(style.lineLength) }),
      ...(typeof style.braces === 'string' && { braces: style.braces.startsWith('Allman') ? ('newline' as const) : ('same' as const) }),
    },
    naming: codingList(p, 'naming')
      .filter((r) => str(r.target) && str(r.casing) && r.casing !== 'Any')
      .map((r) => ({ target: str(r.target), casing: str(r.casing), ...(str(r.prefix) && { prefix: str(r.prefix) }), ...(str(r.suffix) && { suffix: str(r.suffix) }), severity: str(r.severity) || 'Minor', automated: !!r.enforcement && r.enforcement !== 'Manual' })),
    folders: tree.flat.map((n) => ({ path: n.path, ...(str(n.folder.purpose) && { purpose: str(n.folder.purpose) }), ...(n.folder.module && { module: String(n.folder.module) }), assembly: !!n.folder.asmdef })),
    modules: archList(p, 'modules').map((m) => ({ id: String(m.id), name: nameOf(m), words: words(nameOf(m)), assembly: str(m.assembly), dependsOn: Array.isArray(m.dependsOn) ? m.dependsOn.filter((x: unknown): x is string => typeof x === 'string') : [] })),
    lfs: [...new Set(lfs)],
    ignore: list(git.ignore),
  }
}
