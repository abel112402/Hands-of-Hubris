import { archList, layerOrder, nameOf } from './architecture'
import { dataList, parseField, type FieldSpec } from './dataDriven'
import type { Entity, Project } from './model/types'
import { CLASS_KINDS } from '../modules/technical'

export { CLASS_KINDS }

/**
 * Class diagram (Technical Architecture › Classes): the game's code structure, engine-neutral.
 * Planning model only; the engine export (core/engine) turns it into code skeletons.
 */
export type ClassKind = (typeof CLASS_KINDS)[number]['id']
export const kindOf = (c: Entity): ClassKind => CLASS_KINDS.find((k) => k.label === c.kind || k.id === c.kind)?.id ?? 'class'
/** Kinds whose instances live in the engine editor, so their fields are shown and saved there. */
export const SERIALIZED_KINDS: ClassKind[] = ['component', 'actor', 'data', 'event']

export type Visibility = 'public' | 'private' | 'protected'
/** A member type: another class, a data schema, a neutral primitive or asset, or an engine type written as is (Transform, UnityEvent). */
export type MemberType =
  | { k: 'class'; cls: Entity; list: boolean; raw: string }
  | { k: 'schema'; schema: Entity; list: boolean; raw: string }
  | { k: 'neutral'; spec: FieldSpec; list: boolean; raw: string }
  | { k: 'engine'; name: string; list: boolean; raw: string }
export type ClassField = { raw: string; name: string; type: MemberType | null; visibility: Visibility; isStatic: boolean }
export type ClassParam = { name: string; type: MemberType | null }
export type ClassMethod = { raw: string; name: string; params: ClassParam[]; returns: MemberType | null; visibility: Visibility; isStatic: boolean }

const ids = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
export const classList = (p: Project) => archList(p, 'classes')

const VIS: Record<string, Visibility> = { '+': 'public', '-': 'private', '#': 'protected' }

/** Splits a leading “+ - #” and “static”. */
function modifiers(s: string): { rest: string; visibility?: Visibility; isStatic: boolean } {
  let rest = s.trim()
  let visibility: Visibility | undefined
  const m = rest.match(/^([+\-#])\s*/)
  if (m) {
    visibility = VIS[m[1]]
    rest = rest.slice(m[0].length)
  }
  const st = /^static\s+/i.test(rest)
  if (st) rest = rest.replace(/^static\s+/i, '')
  return { rest, visibility, isStatic: st }
}

/** Resolves a type written in a field or signature. `void` and an empty type give null. */
export function resolveType(p: Project, raw: string, classes = classList(p)): MemberType | null {
  const t = raw.trim()
  if (!t || /^void$/i.test(t)) return null
  const spec = parseField(`x: ${t}`, dataList(p, 'schemas'))
  const cls = classes.find((c) => key(nameOf(c)) === key(spec.base) && key(spec.base))
  if (cls) return { k: 'class', cls, list: spec.array, raw: t }
  if (spec.target) return { k: 'schema', schema: spec.target, list: spec.array, raw: t }
  if (spec.kind === 'primitive' || spec.kind === 'asset') return { k: 'neutral', spec, list: spec.array, raw: t }
  return { k: 'engine', name: spec.base, list: spec.array, raw: t }
}

/** “-maxHealth: float”, “+static count: int”, or a bare name (enum values). */
export function parseClassField(p: Project, raw: string, classes = classList(p)): ClassField | null {
  const { rest, visibility, isStatic } = modifiers(raw)
  const i = rest.indexOf(':')
  const name = (i < 0 ? rest : rest.slice(0, i)).trim()
  if (!name) return null
  return { raw, name, type: i < 0 ? null : resolveType(p, rest.slice(i + 1), classes), visibility: visibility ?? 'private', isStatic }
}

/** “+TakeDamage(amount: float, source: GameObject): float”; no return type = void. */
export function parseMethod(p: Project, raw: string, classes = classList(p)): ClassMethod | null {
  const { rest, visibility, isStatic } = modifiers(raw)
  const m = rest.match(/^([A-Za-z_][\w]*)\s*\(([^)]*)\)\s*(?::\s*(.+))?$/)
  if (!m) return null
  const params = m[2]
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => {
      const j = x.indexOf(':')
      return j < 0 ? { name: x, type: null } : { name: x.slice(0, j).trim(), type: resolveType(p, x.slice(j + 1), classes) }
    })
  return { raw, name: m[1], params, returns: m[3] ? resolveType(p, m[3], classes) : null, visibility: visibility ?? 'public', isStatic }
}

export type ClassNode = { cls: Entity; kind: ClassKind; fields: ClassField[]; methods: ClassMethod[]; bad: string[] }
export type ClassEdgeKind = 'inherits' | 'implements' | 'uses' | 'requires' | 'data'
export type ClassEdge = { from: Entity; to: Entity; kind: ClassEdgeKind; list?: boolean; label?: string }

/** Every class with its parsed members, and the lines between classes (and to data schemas). */
export function classModel(p: Project) {
  const classes = classList(p)
  const byId = new Map(classes.map((c) => [c.id, c]))
  const nodes: ClassNode[] = classes.map((cls) => {
    const bad: string[] = []
    const fields = ids(cls.fields).flatMap((r) => {
      const f = parseClassField(p, r, classes)
      if (!f) bad.push(r)
      return f ? [f] : []
    })
    const methods = ids(cls.methods).flatMap((r) => {
      const m = parseMethod(p, r, classes)
      if (!m) bad.push(r)
      return m ? [m] : []
    })
    return { cls, kind: kindOf(cls), fields, methods, bad }
  })
  const edges: ClassEdge[] = []
  const seen = new Set<string>()
  const add = (e: ClassEdge) => {
    const k = `${e.from.id}>${e.to.id}>${e.kind}`
    if (seen.has(k) || (e.from.id === e.to.id && e.kind !== 'uses')) return
    seen.add(k)
    edges.push(e)
  }
  for (const n of nodes) {
    const base = byId.get(n.cls.base)
    if (base) add({ from: n.cls, to: base, kind: 'inherits' })
    for (const i of ids(n.cls.implements)) if (byId.get(i)) add({ from: n.cls, to: byId.get(i)!, kind: 'implements' })
    for (const r of ids(n.cls.requires)) if (byId.get(r)) add({ from: n.cls, to: byId.get(r)!, kind: 'requires' })
    const types = [...n.fields.map((f) => ({ t: f.type, label: f.name })), ...n.methods.flatMap((m) => [...m.params.map((x) => ({ t: x.type, label: m.name })), { t: m.returns, label: m.name }])]
    for (const { t, label } of types) {
      if (t?.k === 'class') add({ from: n.cls, to: t.cls, kind: 'uses', list: t.list, label })
      if (t?.k === 'schema') add({ from: n.cls, to: t.schema, kind: 'data', list: t.list, label })
    }
  }
  return { nodes, edges }
}

export type ClassIssue = { level: 'error' | 'warning' | 'info'; cls: Entity; message: string }

/** Rule checks: inheritance loops, what each kind may inherit or implement, required components, and the layer rule for class references. */
export function classIssues(p: Project): ClassIssue[] {
  const { nodes, edges } = classModel(p)
  const out: ClassIssue[] = []
  const node = new Map(nodes.map((n) => [n.cls.id, n]))
  const modules = new Map(archList(p, 'modules').map((m) => [m.id, m]))
  const rank = new Map(layerOrder(p).map((l, i) => [l.id, i]))
  const layers = new Map(layerOrder(p).map((l) => [l.id, l]))
  for (const n of nodes) {
    const name = nameOf(n.cls)
    for (const b of n.bad) out.push({ level: 'warning', cls: n.cls, message: `${name}: “${b}” is not a field (name: Type) or method (Name(arg: Type): Type).` })
    // Inheritance loop: reported on each class that is part of it (a class that only leads into a loop is not).
    const path: Entity[] = [n.cls]
    for (let cur = node.get(n.cls.base); cur; cur = node.get(cur.cls.base)) {
      if (cur.cls.id === n.cls.id) {
        out.push({ level: 'error', cls: n.cls, message: `${name}: inherits from itself (${[...path, n.cls].map(nameOf).join(' → ')}).` })
        break
      }
      if (path.includes(cur.cls)) break
      path.push(cur.cls)
    }
    const base = node.get(n.cls.base)
    if (base) {
      if (['struct', 'enum', 'static'].includes(n.kind)) out.push({ level: 'error', cls: n.cls, message: `${name}: a ${n.kind} cannot inherit from another class.` })
      else if ((n.kind === 'interface') !== (base.kind === 'interface')) out.push({ level: 'error', cls: n.cls, message: `${name}: ${n.kind === 'interface' ? 'an interface can only extend interfaces' : `cannot inherit from the interface ${nameOf(base.cls)}; list it under Implements`}.` })
      else if (['struct', 'enum', 'static'].includes(base.kind)) out.push({ level: 'error', cls: n.cls, message: `${name}: cannot inherit from ${nameOf(base.cls)}, a ${base.kind}.` })
      else if (base.kind !== n.kind && !(n.kind === 'class' && base.kind === 'class') && base.kind !== 'class') out.push({ level: 'warning', cls: n.cls, message: `${name}: a ${CLASS_KINDS.find((k) => k.id === n.kind)!.label.toLowerCase()} inheriting from a ${CLASS_KINDS.find((k) => k.id === base.kind)!.label.toLowerCase()}.` })
    }
    for (const i of ids(n.cls.implements)) {
      const t = node.get(i)
      if (t && t.kind !== 'interface') out.push({ level: 'error', cls: n.cls, message: `${name}: implements ${nameOf(t.cls)}, which is not an interface.` })
    }
    for (const r of ids(n.cls.requires)) {
      const t = node.get(r)
      if (!['component', 'actor'].includes(n.kind)) out.push({ level: 'warning', cls: n.cls, message: `${name}: only components and actors can require components.` })
      else if (t && !['component', 'actor'].includes(t.kind)) out.push({ level: 'error', cls: n.cls, message: `${name}: requires ${nameOf(t.cls)}, which is not a component.` })
    }
    if (n.kind === 'interface' && n.fields.length) out.push({ level: 'info', cls: n.cls, message: `${name}: interfaces hold methods only; its fields are left out of the code.` })
    if (!n.cls.module && archList(p, 'modules').length) out.push({ level: 'info', cls: n.cls, message: `${name}: no module, so it goes to the project's root namespace.` })
  }
  // Layer rule: a class may use classes of its own and lower layers, or layers its layer may also use.
  for (const e of edges) {
    if (e.kind === 'data') continue
    const a = modules.get(e.from.module)
    const b = modules.get(e.to.module)
    if (!a || !b || a.id === b.id) continue
    const ra = rank.get(a.layer)
    const rb = rank.get(b.layer)
    const allowed = ids(layers.get(a.layer)?.mayUse).includes(b.layer)
    if (ra !== undefined && rb !== undefined && rb > ra && !allowed) out.push({ level: 'warning', cls: e.from, message: `${nameOf(e.from)} (${nameOf(a)}) ${e.kind === 'inherits' ? 'inherits from' : e.kind === 'implements' ? 'implements' : 'uses'} ${nameOf(e.to)} (${nameOf(b)}), a higher layer.` })
    else if (!ids(a.dependsOn).includes(b.id)) out.push({ level: 'info', cls: e.from, message: `${nameOf(e.from)} uses ${nameOf(e.to)}, but module ${nameOf(a)} does not list ${nameOf(b)} under Depends on.` })
  }
  return out
}

// ---- Mermaid classDiagram ----

const mmName = (s: string) => s.replace(/[^A-Za-z0-9_]/g, '') || 'Unnamed'
const MM_VIS: Record<Visibility, string> = { public: '+', private: '-', protected: '#' }

/** The diagram as Mermaid `classDiagram` text (stereotype = kind, “name: Type” members, arrows for inherit, implement, require and use). */
export function toMermaid(p: Project): string {
  const { nodes, edges } = classModel(p)
  const lines = ['classDiagram']
  for (const n of nodes) {
    const nm = mmName(nameOf(n.cls))
    lines.push(`  class ${nm} {`, `    <<${CLASS_KINDS.find((k) => k.id === n.kind)!.label}>>`)
    for (const f of n.fields) lines.push(`    ${MM_VIS[f.visibility]}${f.isStatic ? 'static ' : ''}${f.name}${f.type ? `: ${f.type.raw}` : ''}`)
    for (const m of n.methods) lines.push(`    ${MM_VIS[m.visibility]}${m.isStatic ? 'static ' : ''}${m.name}(${m.params.map((x) => (x.type ? `${x.name}: ${x.type.raw}` : x.name)).join(', ')})${m.returns ? ` ${m.returns.raw}` : ''}`)
    lines.push('  }')
  }
  const arrow: Record<ClassEdgeKind, string> = { inherits: '<|--', implements: '<|..', requires: '<..', uses: '<--', data: '<--' }
  for (const e of edges) {
    if (e.kind === 'data') continue
    lines.push(`  ${mmName(nameOf(e.to))} ${arrow[e.kind]} ${mmName(nameOf(e.from))}${e.kind === 'requires' ? ' : requires' : ''}`)
  }
  return lines.join('\n') + '\n'
}

export type ImportedClass = { name: string; kind?: string; base?: string; implements: string[]; requires: string[]; fields: string[]; methods: string[] }

/** Reads a Mermaid `classDiagram` (the subset toMermaid writes, plus “Type name” members). Untrusted text: no code runs, bounded size. */
export function parseMermaid(text: string): { classes: ImportedClass[]; problems: string[] } {
  const problems: string[] = []
  if (text.length > 200_000) return { classes: [], problems: ['The diagram is too long (over 200 000 characters).'] }
  const lines = text.split(/\r?\n/).map((l) => l.replace(/%%.*$/, '').trim())
  if (!lines.some((l) => /^classDiagram\b/.test(l))) problems.push('No “classDiagram” line; read anyway.')
  const byName = new Map<string, ImportedClass>()
  const get = (n: string) => {
    const name = n.replace(/~.*~$/, '').trim()
    if (!byName.has(name)) byName.set(name, { name, implements: [], requires: [], fields: [], methods: [] })
    return byName.get(name)!
  }
  let cur: ImportedClass | null = null
  const member = (c: ImportedClass, raw: string) => {
    const s = raw.trim()
    const st = s.match(/^<<\s*(.+?)\s*>>$/)
    if (st) {
      const k = CLASS_KINDS.find((x) => key(x.label) === key(st[1]) || x.id === key(st[1]) || (key(st[1]) === 'monobehaviour' && x.id === 'component') || (key(st[1]) === 'scriptableobject' && x.id === 'data'))
      if (k) c.kind = k.label
      return
    }
    const vis = s.match(/^[+\-#~]/)?.[0] ?? ''
    let body = vis ? s.slice(1).trim() : s
    const isStatic = /\$$/.test(body) || /^static\s+/i.test(body)
    body = body.replace(/\$$/, '').replace(/^static\s+/i, '').replace(/\*$/, '')
    const v = vis === '~' ? '' : vis
    const pre = `${v}${isStatic ? 'static ' : ''}`
    const meth = body.match(/^([A-Za-z_]\w*)\s*\(([^)]*)\)\s*:?\s*(.*)$/)
    if (meth) {
      const params = meth[2].split(',').map((x) => x.trim()).filter(Boolean).map((x) => {
        if (x.includes(':')) return x.replace(/\s*:\s*/, ': ')
        const w = x.split(/\s+/)
        return w.length === 2 ? `${w[1]}: ${w[0]}` : x
      })
      c.methods.push(`${pre}${meth[1]}(${params.join(', ')})${meth[3] ? `: ${meth[3].trim()}` : ''}`)
      return
    }
    if (body.includes(':')) c.fields.push(`${pre}${body.replace(/\s*:\s*/, ': ')}`)
    else {
      const w = body.split(/\s+/)
      c.fields.push(w.length === 2 ? `${pre}${w[1]}: ${w[0]}` : `${pre}${body}`)
    }
  }
  const REL = /^([A-Za-z_][\w~]*)\s*(?:"[^"]*"\s*)?(<\|--|--\|>|<\|\.\.|\.\.\|>|\*--|--\*|o--|--o|<--|-->|<\.\.|\.\.>|--|\.\.)\s*(?:"[^"]*"\s*)?([A-Za-z_][\w~]*)\s*(?::\s*(.*))?$/
  for (const l of lines) {
    if (!l || /^classDiagram\b/.test(l) || /^direction\b/.test(l)) continue
    if (cur) {
      if (l === '}') cur = null
      else member(cur, l)
      continue
    }
    const open = l.match(/^class\s+([A-Za-z_][\w~]*)\s*(?:\[[^\]]*\])?\s*(\{)?\s*$/)
    if (open) {
      const c = get(open[1])
      if (open[2]) cur = c
      continue
    }
    const one = l.match(/^([A-Za-z_]\w*)\s*:\s*(.+)$/)
    if (one && !REL.test(l)) {
      member(get(one[1]), one[2])
      continue
    }
    const anno = l.match(/^<<\s*(.+?)\s*>>\s*([A-Za-z_]\w*)$/)
    if (anno) {
      member(get(anno[2]), `<<${anno[1]}>>`)
      continue
    }
    const r = l.match(REL)
    if (r) {
      const [, a, op, b, label] = r
      const left = get(a)
      const right = get(b)
      if (op === '<|--') right.base = left.name
      else if (op === '--|>') left.base = right.name
      else if (op === '<|..') right.implements.push(left.name)
      else if (op === '..|>') left.implements.push(right.name)
      else if ((op === '<..' || op === '..>') && /requires/i.test(label ?? '')) (op === '<..' ? right : left).requires.push(op === '<..' ? left.name : right.name)
      continue
    }
    problems.push(`Skipped: ${l.length > 60 ? l.slice(0, 59) + '…' : l}`)
  }
  return { classes: [...byName.values()], problems }
}

/**
 * Merges imported classes into the project's list (by name, ignoring case): new classes are added, existing ones get
 * only their empty fields filled. Returns how many were added and updated. Mutates `list`; call inside `mutate`.
 */
export function mergeImported(list: Entity[], imported: ImportedClass[], makeId: () => string): { added: number; updated: number } {
  let added = 0
  let updated = 0
  const find = (n: string) => list.find((c) => key(nameOf(c)) === key(n))
  const fresh = new Set<string>()
  for (const ic of imported) {
    if (find(ic.name)) continue
    const id = makeId()
    list.push({ id, name: ic.name })
    fresh.add(id)
    added++
  }
  for (const ic of imported) {
    const c = find(ic.name)!
    let changed = false
    const set = (k: string, v: unknown) => {
      const empty = c[k] === undefined || c[k] === '' || (Array.isArray(c[k]) && !c[k].length)
      if (!empty || v === undefined || (Array.isArray(v) && !v.length)) return
      c[k] = v
      changed = true
    }
    set('kind', ic.kind)
    set('base', ic.base ? find(ic.base)?.id : undefined)
    set('implements', ic.implements.map((n) => find(n)?.id).filter(Boolean))
    set('requires', ic.requires.map((n) => find(n)?.id).filter(Boolean))
    set('fields', ic.fields)
    set('methods', ic.methods)
    if (changed && !fresh.has(c.id)) updated++
  }
  return { added, updated }
}
