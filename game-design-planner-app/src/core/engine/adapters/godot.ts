import { pascal, uniqueNames, type EmittedFile, type EngineAdapter, type IdentKind } from '../adapter'
import { words } from '../../coding'
import type { FormulaNode } from '../formulaAst'
import type { ClassKind } from '../../classes'
import type { EngineIR, EngineIssue, IrClass, IrEnum, IrFormat, IrMethod, IrSchema, IrSetup, NeutralType } from '../ir'
import { channelFiles, checksFile, consoleFiles, telemetryFile, type GodotNames } from './godotExtras'
import { inputFile, scaffoldGlobals, screenFiles, stateMachineFiles } from './godotScaffold'

/**
 * Godot 4 adapter (GDScript, Godot 4.3+): native-format schemas become Resource classes (the planner addon turns each
 * record into a .tres), JSON and CSV schemas RefCounted record classes with from_dict, catalogs enums, plus ID constants,
 * formulas and the class diagram. GDScript has no partial classes and no namespaces, so: every global name starts with
 * the project's name where it could clash, and each diagram class is a generated base (XBase, replaced on every export)
 * that your file (class_name X extends XBase, written once) extends.
 */

const GD_KEYWORDS = new Set(
  'if elif else for while match when break continue pass return class class_name extends is in as self super signal func static const enum var breakpoint preload await yield assert void and or not true false null PI TAU INF NAN trait namespace'.split(' '),
)
/** Godot classes and built-in types a generated global class must not take the name of. */
const GODOT_TYPES = new Set(
  'Object Node Node2D Node3D Control CanvasItem Resource RefCounted Script GDScript PackedScene Texture Texture2D Image Sprite2D Sprite3D AnimatedSprite2D Material ShaderMaterial Mesh Animation AnimationLibrary AnimationPlayer AnimationTree AudioStream AudioStreamPlayer Curve Color Vector2 Vector2i Vector3 Vector3i Rect2 Transform2D Transform3D Basis Quaternion Array Dictionary String StringName NodePath Callable Signal Engine Input OS Time Timer JSON Theme Font Label Button Camera2D Camera3D Area2D Area3D Tween Translation TranslationServer ResourceLoader ResourceSaver FileAccess DirAccess Marker2D Marker3D TileMap TileMapLayer TileSet RigidBody2D RigidBody3D CharacterBody2D CharacterBody3D Light2D Viewport Window Environment World2D World3D Skeleton2D Skeleton3D'.split(' '),
)
/** GDScript's global functions: a member of that name works but hides the function inside its class (a warning in Godot). */
const GD_FUNCTIONS = new Set('load preload print str int float bool range len min max abs sign clamp lerp floor ceil round sqrt pow log exp sin cos tan randf randi typeof is_instance_valid weakref hash'.split(' '))
/** Properties every Resource already has; a record field of that name would clash with them. */
const RESOURCE_MEMBERS = new Set(['resource_name', 'resource_path', 'resource_local_to_scene', 'resource_scene_unique_id', 'script'])
/** Unity and C# spellings a designer may have used for class members, as their Godot type. */
const ENGINE_TYPE: Record<string, string> = {
  int: 'int', long: 'int', float: 'float', double: 'float', bool: 'bool', string: 'String', object: 'Variant', void: 'void',
  GameObject: 'Node', Transform: 'Node3D', MonoBehaviour: 'Node', ScriptableObject: 'Resource', Sprite: 'Texture2D', AudioClip: 'AudioStream',
  AnimationCurve: 'Curve', AnimationClip: 'Animation', Vector2Int: 'Vector2i', Vector3Int: 'Vector3i', Rigidbody: 'RigidBody3D', Rigidbody2D: 'RigidBody2D',
  Camera: 'Camera3D', Collider: 'CollisionShape3D', Collider2D: 'CollisionShape2D', UnityEvent: 'Signal', Action: 'Callable',
}

const ASSET_TYPE: Record<string, string> = { image: 'Texture2D', scene: 'PackedScene', audio: 'AudioStream', material: 'Material', mesh: 'Mesh', animation: 'Animation', animator: 'AnimationRootNode', data: 'Resource' }

const gdString = (s: string) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`
const doc = (s: string) => s.split('\n').map((l) => `## ${l}`.trimEnd())
const snake = (ws: string[]) => ws.map((w) => w.toLowerCase()).join('_')
const upper = (ws: string[]) => ws.map((w) => w.toUpperCase()).join('_')

function identifier(ws: string[], kind: IdentKind): string {
  let id = kind === 'type' ? pascal(ws) : kind === 'constant' || kind === 'member' ? upper(ws) : snake(ws)
  if (!id) id = kind === 'type' ? 'Unnamed' : kind === 'constant' || kind === 'member' ? 'VALUE' : 'value'
  if (/^[0-9]/.test(id)) id = '_' + id
  return GD_KEYWORDS.has(id) ? id + '_' : id
}

const projectName = (ir: EngineIR) => identifier(ir.project.words, 'type') || 'Game'
const enumsClass = (ir: EngineIR) => `${projectName(ir)}Enums`
const idsClass = (ir: EngineIR) => `${projectName(ir)}Ids`
const formulasClass = (ir: EngineIR) => `${projectName(ir)}Formulas`
const valuesClass = (ir: EngineIR) => `${projectName(ir)}Values`
/** File names follow Godot's style guide: snake_case, from the class name. */
const fileOf = (className: string) => className.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2').toLowerCase()

const schemaTypeName = (s: IrSchema) => {
  const base = identifier(s.words, 'type')
  return base + (s.format === 'native' ? 'Definition' : 'Record')
}

const enumNameCache = new WeakMap<EngineIR, Map<string, string>>()
/** A member named like a Godot class is an error in GDScript (“shadows a native class”), so such names get “Kind”. */
const notNative = (n: string) => (GODOT_TYPES.has(n) ? n + 'Kind' : n)
/** Enum names inside the project's Enums class: unique there, never a Godot class. */
function enumTypeName(en: IrEnum, ir: EngineIR): string {
  let m = enumNameCache.get(ir)
  if (!m) {
    const names = uniqueNames(ir.enums.map((e) => notNative(identifier(e.words, 'type'))))
    m = new Map(ir.enums.map((e, i) => [e.id, names[i]]))
    enumNameCache.set(ir, m)
  }
  return m.get(en.id) ?? 'UnknownEnum'
}
const enumMembers = (en: IrEnum) => uniqueNames(en.members.map((m) => identifier(words(m.label), 'member')))
/** The constant that maps planner IDs to an enum's values: Rarity → RARITY_IDS. */
const enumIdsConst = (en: IrEnum, ir: EngineIR) => `${identifier(words(enumTypeName(en, ir)), 'constant')}_IDS`

function typeName(t: NeutralType, ir: EngineIR, format: IrFormat): string {
  const native = format === 'native'
  switch (t.k) {
    case 'string':
    case 'text':
    case 'date':
    case 'localized':
      return 'String'
    case 'int':
      return 'int'
    case 'float':
      return 'float'
    case 'bool':
      return 'bool'
    case 'color':
      return 'Color'
    case 'vec2':
      return 'Vector2'
    case 'vec3':
      return 'Vector3'
    case 'curve':
      return 'Curve'
    case 'enum': {
      const en = ir.enums.find((e) => e.id === t.enumId)
      return native && en ? `${enumsClass(ir)}.${enumTypeName(en, ir)}` : 'String'
    }
    case 'asset':
      return native ? ASSET_TYPE[t.asset] : 'String'
    case 'ref': {
      const target = ir.schemas.find((s) => s.id === t.schema)
      return native && target?.format === 'native' ? schemaTypeName(target) : 'String'
    }
    case 'list':
      return `Array[${typeName(t.of, ir, format)}]`
    case 'class': {
      const c = ir.classes.find((x) => x.id === t.classId)
      return c ? (c.kind === 'enum' ? `${className(c)}.Value` : className(c)) : 'Variant'
    }
    case 'engine':
      return ENGINE_TYPE[t.name] ?? t.name
  }
}

/** Property names of a schema: unique, never id/planner_id or a Resource property. */
function fieldNames(s: IrSchema): string[] {
  const base = s.fields.map((f) => {
    const n = identifier(f.words, 'field')
    return s.format === 'native' && RESOURCE_MEMBERS.has(n) ? 'display_' + n : n
  })
  return uniqueNames(base, ['id', 'planner_id'])
}

const HEADER = (ir: EngineIR) => [
  '# <auto-generated>',
  `#   Generated by Game Design Planner (engine IR v${ir.v}, Godot adapter v${godot.version}) from “${ir.project.name}”.`,
  '#   Do not edit: the next export replaces this file.',
  '# </auto-generated>',
]

function fieldDoc(s: IrSchema, i: number, ir: EngineIR): string[] {
  const f = s.fields[i]
  const notes: string[] = [f.optional ? 'Optional.' : 'Required.', `Planner type: ${f.raw.split(':').slice(1).join(':').trim() || '?'}.`]
  const inner = f.type.k === 'list' ? f.type.of : f.type
  if (inner.k === 'localized') notes.push('Translation key: show it with tr().')
  if (s.format !== 'native' && inner.k === 'ref') notes.push(`${ir.schemas.find((x) => x.id === inner.schema)?.name ?? '?'} ID.`)
  if (s.format !== 'native' && inner.k === 'asset') notes.push('Resource path.')
  if (s.format !== 'native' && inner.k === 'enum') notes.push(`Enum ID, see ${enumsClass(ir)}.`)
  return doc(notes.join(' '))
}

/** How from_dict reads one value of a JSON or CSV record (CSV values are text; lists are “a;b”). */
function readExpr(t: NeutralType, v: string, ir: EngineIR): string {
  const V = valuesClass(ir)
  switch (t.k) {
    case 'int':
      return `${V}.to_int(${v})`
    case 'float':
      return `${V}.to_float(${v})`
    case 'bool':
      return `${V}.to_bool(${v})`
    case 'color':
      return `${V}.to_color(${v})`
    case 'vec2':
      return `${V}.to_vector2(${v})`
    case 'vec3':
      return `${V}.to_vector3(${v})`
    case 'curve':
      return 'null'
    case 'list': {
      const each = readExpr(t.of, 'x', ir)
      return each === `${V}.to_text(x)` || each === 'null' ? `${V}.to_list(${v})` : `${V}.to_list(${v}).map(func(x): return ${each})`
    }
    default:
      return `${V}.to_text(${v})`
  }
}

function schemaFile(s: IrSchema, ir: EngineIR): string {
  const type = schemaTypeName(s)
  const names = fieldNames(s)
  const native = s.format === 'native'
  const summary = [`${s.name}.`, s.source ? `Records come from ${s.source}.` : '', s.idPrefix ? `ID prefix “${s.idPrefix}”.` : '', `Schema version ${s.version}.`].filter(Boolean).join(' ')
  const fieldMap = s.fields.map((f, i) => `${gdString(f.name)}: ${gdString(names[i])}`)
  const out: string[] = [
    ...HEADER(ir),
    `class_name ${type}`,
    `extends ${native ? 'Resource' : 'RefCounted'}`,
    ...doc(summary),
    ...(native ? ['## One .tres per record, made and kept in step by the planner addon (Project ▸ Tools ▸ Game Design Planner ▸ Import).'] : ['## Read a record with from_dict (a JSON object from Data/, or a CSV row as a Dictionary).']),
    '',
    '## The planner schema this type stands for; the planner addon finds the type by it.',
    `const SCHEMA_ID := ${gdString(s.id)}`,
    `const SCHEMA_VERSION := ${s.version}`,
    '## Planner field name → property name, for the importer.',
    `const PLANNER_FIELDS := {${fieldMap.length ? ` ${fieldMap.join(', ')} ` : ''}}`,
    '',
    '## Stable ID from the planner. Never changes once released.',
    native ? '@export var id: String' : 'var id: String',
    native ? '@export_storage var planner_id: String' : 'var planner_id: String',
  ]
  s.fields.forEach((f, i) => {
    out.push('', ...fieldDoc(s, i, ir), `${native ? '@export ' : ''}var ${names[i]}: ${typeName(f.type, ir, s.format)}`)
  })
  if (!native) {
    const enumFields = s.fields.map((f, i) => ({ f, n: names[i] })).filter(({ f }) => f.type.k === 'enum')
    for (const { f, n } of enumFields) {
      const en = f.type.k === 'enum' ? ir.enums.find((e) => e.id === (f.type as { enumId: string }).enumId) : undefined
      if (!en) continue
      out.push('', `## ${n} as an enum value; -1 when the ID is unknown.`, `func ${n}_value() -> int:`, `\treturn ${enumsClass(ir)}.${enumIdsConst(en, ir)}.get(${n}, -1)`)
    }
    out.push('', '', `static func from_dict(d: Dictionary) -> ${type}:`, `\tvar r := ${type}.new()`, `\tr.id = ${valuesClass(ir)}.to_text(d.get("id"))`, `\tr.planner_id = ${valuesClass(ir)}.to_text(d.get("plannerId"))`)
    s.fields.forEach((f, i) => {
      if (f.type.k === 'curve') return
      const read = readExpr(f.type, `d.get(${gdString(f.name)})`, ir)
      if (f.type.k === 'list') out.push(`\tr.${names[i]}.assign(${read})`)
      else out.push(`\tr.${names[i]} = ${read}`)
    })
    out.push('\treturn r')
  }
  return out.join('\n') + '\n'
}

function enumsFile(ir: EngineIR): string {
  const out: string[] = [...HEADER(ir), `class_name ${enumsClass(ir)}`, 'extends RefCounted', '## Catalogs and value lists of the plan as enums, with the planner IDs of their values.']
  for (const en of ir.enums) {
    const names = enumMembers(en)
    out.push('', ...doc(en.from === 'catalog' ? `Catalog “${en.name}”.` : `Values of ${en.name} used in the planner.`))
    out.push(`enum ${enumTypeName(en, ir)} { ${names.length ? names.join(', ') : 'NONE'} }`)
    const entries = en.members.map((m, i) => `${gdString(m.id)}: ${enumTypeName(en, ir)}.${names[i]}`)
    out.push(`const ${enumIdsConst(en, ir)} := {${entries.length ? ` ${entries.join(', ')} ` : ''}}`)
  }
  return out.join('\n') + '\n'
}

function idsFile(ir: EngineIR): string {
  const out: string[] = [...HEADER(ir), `class_name ${idsClass(ir)}`, 'extends RefCounted', '## Stable record IDs, one constant per record exported from the planner.']
  const classes = uniqueNames(ir.schemas.map((s) => notNative(identifier(s.words, 'type'))))
  ir.schemas.forEach((s, i) => {
    const recs = ir.records.filter((r) => r.schema === s.id)
    if (!recs.length) return
    const consts = uniqueNames(recs.map((r) => identifier(words(r.name || r.key), 'constant')))
    out.push('', '', `class ${classes[i]}:`)
    recs.forEach((r, j) => out.push(`\tconst ${consts[j]} := ${gdString(r.key)}`))
  })
  return out.join('\n') + '\n'
}

const PREC: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2 }
const num = (v: number) => (Number.isInteger(v) ? `${v}.0` : v.toString())
function gdExpr(n: FormulaNode, params: Map<string, string>): string {
  const prec = (x: FormulaNode) => (x.k === 'bin' && x.op !== '^' ? PREC[x.op] : x.k === 'neg' ? 3 : 4)
  switch (n.k) {
    case 'num':
      return num(n.v)
    case 'var':
      return params.get(n.name) ?? '0.0'
    case 'neg': {
      const a = gdExpr(n.a, params)
      return prec(n.a) < 3 ? `-(${a})` : `-${a}`
    }
    case 'call': {
      const args = n.args.map((a) => gdExpr(a, params))
      switch (n.fn) {
        case 'min':
        case 'max':
          return args.length === 2 ? `${n.fn}f(${args.join(', ')})` : `float(${n.fn}(${args.join(', ')}))`
        // The planner rounds halves up (2.5 → 3, -2.5 → -2); roundf would round -2.5 away from zero.
        case 'round':
          return `floorf(${args[0]} + 0.5)`
        case 'abs':
        case 'floor':
        case 'ceil':
          return `${n.fn}f(${args.join(', ')})`
        default:
          return `${n.fn}(${args.join(', ')})`
      }
    }
    case 'bin': {
      if (n.op === '^') return `pow(${gdExpr(n.a, params)}, ${gdExpr(n.b, params)})`
      const p = PREC[n.op]
      const l = gdExpr(n.a, params)
      const r = gdExpr(n.b, params)
      const lp = prec(n.a) < p ? `(${l})` : l
      const rp = prec(n.b) < p || (prec(n.b) === p && (n.op === '-' || n.op === '/')) ? `(${r})` : r
      return `${lp} ${n.op} ${rp}`
    }
  }
}

function formulasFile(ir: EngineIR): string {
  const methods = uniqueNames(ir.formulas.map((f) => identifier(f.words, 'method')))
  const out: string[] = [...HEADER(ir), `class_name ${formulasClass(ir)}`, 'extends RefCounted', '## Formulas from the planner, with the planner’s rounding (halves up).']
  ir.formulas.forEach((f, i) => {
    const pnames = uniqueNames(f.params.map((v) => identifier(words(v), 'param')))
    const params = new Map(f.params.map((v, j) => [v, pnames[j]]))
    const sig = f.params.map((_, j) => `${pnames[j]}: float`).join(', ')
    const sample = Object.keys(f.sample).length ? ` Sample: ${Object.entries(f.sample).map(([k, v]) => `${k} = ${v}`).join(', ')}.` : ''
    out.push('', '', ...doc(`${f.name} (${f.where}).`), ...doc(`Planner: ${f.expr}.${sample}`), `static func ${methods[i]}(${sig}) -> float:`)
    if (f.ast) out.push(`\treturn ${gdExpr(f.ast, params)}`)
    else out.push(`\tpush_error(${gdString(`Planner formula could not be read: ${f.error}`)})`, '\treturn 0.0')
  })
  return out.join('\n') + '\n'
}

/** Helpers the record classes read JSON and CSV values with. */
function valuesFile(ir: EngineIR): string {
  return [
    ...HEADER(ir),
    `class_name ${valuesClass(ir)}`,
    'extends RefCounted',
    '## Reads record values as the planner writes them: JSON values, or CSV text where lists are “a;b”.',
    '',
    '',
    'static func to_text(v: Variant) -> String:',
    '\treturn "" if v == null else str(v)',
    '',
    '',
    'static func to_int(v: Variant) -> int:',
    '\tif v is String:',
    '\t\treturn int(v) if v.is_valid_int() else (int(float(v)) if v.is_valid_float() else 0)',
    '\treturn int(v) if (v is int or v is float or v is bool) else 0',
    '',
    '',
    'static func to_float(v: Variant) -> float:',
    '\tif v is String:',
    '\t\treturn float(v) if v.is_valid_float() else 0.0',
    '\treturn float(v) if (v is int or v is float or v is bool) else 0.0',
    '',
    '',
    'static func to_bool(v: Variant) -> bool:',
    '\tif v is String:',
    '\t\treturn v.strip_edges().to_lower() in ["true", "1", "yes"]',
    '\treturn bool(v) if (v is int or v is float or v is bool) else false',
    '',
    '',
    'static func to_color(v: Variant) -> Color:',
    '\treturn Color.from_string(str(v), Color.WHITE) if v != null else Color.WHITE',
    '',
    '',
    'static func to_list(v: Variant) -> Array:',
    '\tif v is Array:',
    '\t\treturn v',
    '\tif v is String and v != "":',
    '\t\treturn Array(v.split(";"))',
    '\treturn []',
    '',
    '',
    'static func to_vector2(v: Variant) -> Vector2:',
    '\tvar n := to_list(v)',
    '\treturn Vector2(to_float(n[0]), to_float(n[1])) if n.size() >= 2 else Vector2.ZERO',
    '',
    '',
    'static func to_vector3(v: Variant) -> Vector3:',
    '\tvar n := to_list(v)',
    '\treturn Vector3(to_float(n[0]), to_float(n[1]), to_float(n[2])) if n.size() >= 3 else Vector3.ZERO',
    '',
  ].join('\n')
}

// ---- Classes from the class diagram ----

/** A name as the designer wrote it when it is already an identifier (keeps EnemyAI, IDamageable), else built from its words. */
function keepIdent(name: string, kind: IdentKind): string {
  const n = name.trim()
  if (kind === 'type' && /^[A-Za-z_][A-Za-z0-9_]*$/.test(n)) return GD_KEYWORDS.has(n) ? n + '_' : n
  // Members follow GDScript's snake_case: TakeDamage and takeDamage both become take_damage.
  return identifier(words(n), kind)
}
const className = (c: IrClass) => keepIdent(c.name, 'type')
const baseName = (c: IrClass) => `${className(c)}Base`
/** Kinds written as a generated base plus your file. Interfaces and enums are generated only. */
const hasOwnFile = (c: IrClass) => !['interface', 'enum'].includes(c.kind)
const ENGINE_BASE: Record<ClassKind, string> = { component: 'Node', actor: 'Node', data: 'Resource', event: 'Resource', class: 'Resource', struct: 'Resource', static: 'RefCounted', interface: 'RefCounted', enum: 'RefCounted' }

function memberType(t: NeutralType | null, ir: EngineIR): string {
  if (!t) return 'void'
  if (t.k === 'list') return `Array[${memberType(t.of, ir)}]`
  if (t.k === 'ref') {
    const s = ir.schemas.find((x) => x.id === t.schema)
    return s ? schemaTypeName(s) : 'String'
  }
  return typeName(t, ir, 'native')
}
const DEFAULTS: Record<string, string> = { int: '0', float: '0.0', bool: 'false', String: '""', StringName: '&""', Vector2: 'Vector2.ZERO', Vector3: 'Vector3.ZERO', Vector2i: 'Vector2i.ZERO', Vector3i: 'Vector3i.ZERO', Color: 'Color()' }
const defaultOf = (type: string) => DEFAULTS[type] ?? (type.startsWith('Array[') ? '[]' : type.endsWith('.Value') ? '0' : 'null')

/** A class's methods with the ones of the interfaces it implements (GDScript has no interfaces: implementing one means having its methods). */
function methodsOf(c: IrClass, ir: EngineIR): IrMethod[] {
  const out = [...c.methods]
  const seen = new Set(out.map((m) => keepIdent(m.name, 'method')))
  const visit = (id: string, depth: number) => {
    const i = ir.classes.find((x) => x.id === id)
    if (!i || i.kind !== 'interface' || depth > 20) return
    for (const m of i.methods) {
      const n = keepIdent(m.name, 'method')
      if (!seen.has(n)) {
        seen.add(n)
        out.push(m)
      }
    }
    if (i.base) visit(i.base, depth + 1)
    i.implements.forEach((x) => visit(x, depth + 1))
  }
  c.implements.forEach((id) => visit(id, 0))
  return out
}
const interfacesOf = (c: IrClass, ir: EngineIR) => c.implements.map((id) => ir.classes.find((x) => x.id === id)).filter((x): x is IrClass => !!x && x.kind === 'interface')

function signature(m: IrMethod, ir: EngineIR, isStatic: boolean): { line: string; ret: string } {
  const params = uniqueNames(m.params.map((x) => keepIdent(x.name, 'param')))
  const args = m.params.map((x, i) => `${params[i]}: ${memberType(x.type, ir)}`).join(', ')
  const ret = memberType(m.returns, ir)
  return { line: `${isStatic ? 'static ' : ''}func ${keepIdent(m.name, 'method')}(${args}) -> ${ret}:`, ret }
}

function classGenerated(ir: EngineIR, c: IrClass): string {
  const out: string[] = [...HEADER(ir)]
  if (c.kind === 'enum') {
    const members = uniqueNames(c.fields.map((f) => identifier(words(f.name), 'member')))
    out.push(`class_name ${className(c)}`, 'extends RefCounted', ...(c.doc ? doc(c.doc) : []), `## Use the values as ${className(c)}.Value.`, `enum Value { ${members.length ? members.join(', ') : 'NONE'} }`)
    return out.join('\n') + '\n'
  }
  if (c.kind === 'interface') {
    const all = methodsOf({ ...c, implements: [...(c.base ? [c.base] : []), ...c.implements] }, ir)
    out.push(
      `class_name ${className(c)}`,
      'extends RefCounted',
      ...(c.doc ? doc(c.doc) : []),
      '## GDScript has no interfaces: a class implements this one by having its methods. The planner puts them into',
      '## the generated base of every class that lists it under Implements.',
      `const METHODS: Array[StringName] = [${all.map((m) => `&${gdString(keepIdent(m.name, 'method'))}`).join(', ')}]`,
      '',
      '',
      '## Whether an object has every method of this interface.',
      'static func is_implemented_by(o: Object) -> bool:',
      '\tif o == null:',
      '\t\treturn false',
      '\tfor m in METHODS:',
      '\t\tif not o.has_method(m):',
      '\t\t\treturn false',
      '\treturn true',
    )
    return out.join('\n') + '\n'
  }
  const base = ir.classes.find((x) => x.id === c.base)
  const parent = base && hasOwnFile(base) ? className(base) : ENGINE_BASE[c.kind]
  out.push(`class_name ${baseName(c)}`, `extends ${parent}`)
  out.push(...doc(`Generated part of ${className(c)}${c.doc ? `: ${c.doc}` : '.'}`), `## Your code is in Godot/${ownFilePath(c)} (class_name ${className(c)} extends ${baseName(c)}).`)
  const ifaces = interfacesOf(c, ir)
  if (ifaces.length) out.push(`## Implements ${ifaces.map(className).join(', ')}.`)
  const required = c.requires.map((r) => ir.classes.find((x) => x.id === r)).filter((x): x is IrClass => !!x)
  if (required.length && ['component', 'actor'].includes(c.kind)) out.push(`## Needs ${required.map(className).join(', ')} on the same node or a child; see _get_required().`)
  const body: string[] = []
  if (c.kind === 'event') {
    const params = uniqueNames(c.fields.map((f) => keepIdent(f.name, 'param')))
    const typed = c.fields.map((f, i) => `${params[i]}: ${memberType(f.type ?? { k: 'engine', name: 'Variant' }, ir)}`).join(', ')
    body.push('## Emitted with the payload; connect in _ready or _enter_tree.', `signal raised(${typed})`, '', '', `func raise(${typed}) -> void:`, `\traised.emit(${params.join(', ')})`)
  } else {
    const names = uniqueNames(c.fields.map((f) => keepIdent(f.name, 'field')))
    c.fields.forEach((f, i) => {
      const isStatic = f.isStatic || c.kind === 'static'
      const t = memberType(f.type ?? { k: 'engine', name: 'Variant' }, ir)
      const exported = !isStatic && c.kind !== 'static'
      body.push(`${isStatic ? 'static ' : exported ? '@export ' : ''}var ${names[i]}: ${t}`)
    })
  }
  if (required.length && ['component', 'actor'].includes(c.kind)) {
    if (body.length) body.push('')
    body.push('', '## The classes this one needs next to it (the planner’s Requires).', 'static func _get_required() -> Array[StringName]:', `\treturn [${required.map((r) => `&${gdString(className(r))}`).join(', ')}]`)
  }
  const instanceMethods = methodsOf(c, ir).filter((m) => !m.isStatic && c.kind !== 'static')
  if (instanceMethods.length) {
    if (body.length) body.push('')
    body.push('', '# Write the bodies in your file: each method here only reports that it is still missing.')
    for (const m of instanceMethods) {
      const s = signature(m, ir, false)
      body.push('', s.line, `\tpush_error(${gdString(`${className(c)}.${keepIdent(m.name, 'method')}() is not written yet.`)})`, ...(s.ret === 'void' ? [] : [`\treturn ${defaultOf(s.ret)}`]))
    }
  }
  if (body.length) out.push('', ...body)
  return out.join('\n') + '\n'
}

function classOwnFile(ir: EngineIR, c: IrClass): string {
  const out: string[] = [
    `# Your code for ${c.name}. The planner export created this file once and never overwrites it.`,
    `# The fields, signals and method signatures are in Generated/Classes/${fileOf(baseName(c))}.gd.`,
    `class_name ${className(c)}`,
    `extends ${baseName(c)}`,
  ]
  for (const m of methodsOf(c, ir)) {
    const s = signature(m, ir, m.isStatic || c.kind === 'static')
    out.push('', '', s.line, s.ret === 'void' ? '\tpass # TODO' : `\treturn ${defaultOf(s.ret)} # TODO`)
  }
  return out.join('\n') + '\n'
}

const ownFilePath = (c: IrClass) => `Scripts/Classes/${c.module ? snake(c.module.words) + '/' : ''}${fileOf(className(c))}.gd`
const generatedFilePath = (c: IrClass) => `Scripts/Generated/Classes/${fileOf(hasOwnFile(c) ? baseName(c) : className(c))}.gd`

function classFiles(ir: EngineIR): EmittedFile[] {
  const files = ir.classes.flatMap((c) => [{ path: generatedFilePath(c), content: classGenerated(ir, c) }, ...(hasOwnFile(c) ? [{ path: ownFilePath(c), content: classOwnFile(ir, c) }] : [])])
  const index = ir.classes.map((c) => ({
    plannerId: c.id,
    name: c.name,
    kind: c.kind,
    generated: `Godot/${generatedFilePath(c)}`,
    own: hasOwnFile(c) ? `Godot/${ownFilePath(c)}` : null,
    ownFiles: hasOwnFile(c) ? [`Godot/${ownFilePath(c)}`] : [],
    tokens: [className(c), baseName(c)],
    methods: hasOwnFile(c) ? methodsOf(c, ir).map((m) => keepIdent(m.name, 'method')) : [],
  }))
  return ir.classes.length ? [...files, { path: 'Scripts/Generated/classes.json', content: JSON.stringify(index, null, 2) + '\n' }] : files
}

// ---- Project set-up ----

export function godotEditorconfig(setup: IrSetup): string {
  const s = setup.style
  return [
    '# Generated by Game Design Planner from Coding Standards (code style). Change the rules in the planner.',
    'root = true',
    '',
    '[*]',
    'charset = utf-8',
    'insert_final_newline = true',
    'trim_trailing_whitespace = true',
    '',
    '[*.gd]',
    // GDScript's style guide indents with tabs; a plan that says spaces wins.
    `indent_style = ${s.indent === 'spaces' ? 'space' : 'tab'}`,
    `indent_size = ${s.indentSize ?? 4}`,
    ...(s.lineLength ? [`max_line_length = ${s.lineLength}`] : []),
    '',
    '[*.{json,cfg,tres,tscn,godot}]',
    'indent_style = space',
    'indent_size = 2',
    '',
  ].join('\n')
}

const GODOT_IGNORE = ['.godot/', '/android/', '*.translation', 'export_presets.cfg', '.import/', '.vs/', '.idea/', '.vscode/', '*.tmp', '.DS_Store', 'Thumbs.db']

export function godotGitignore(setup: IrSetup): string {
  const extra = setup.ignore.filter((x) => !GODOT_IGNORE.includes(x))
  return ['# Generated by Game Design Planner: Godot 4 defaults plus the planned highlights.', ...GODOT_IGNORE, ...(extra.length ? ['', '# From the plan', ...extra] : [])].join('\n') + '\n'
}

export function godotGitattributes(setup: IrSetup): string {
  return [
    '# Generated by Game Design Planner from Coding Standards (Git LFS patterns and the asset folders’ binary types).',
    '* text=auto eol=lf',
    ...(setup.lfs.length ? ['', '# Git LFS', ...setup.lfs.map((p) => `${p} filter=lfs diff=lfs merge=lfs -text`)] : []),
  ].join('\n') + '\n'
}

/** Planned folders as res:// paths (the plan writes them under Assets/, the Unity way). */
export function godotFolders(setup: IrSetup): { path: string; purpose?: string }[] {
  const seen = new Set<string>()
  return setup.folders
    .map((f) => ({ path: 'res://' + f.path.replace(/^Assets\/?/, ''), ...(f.purpose && { purpose: f.purpose }) }))
    .filter((f) => f.path !== 'res://' && !seen.has(f.path) && !!seen.add(f.path))
}

function setupFiles(ir: EngineIR): EmittedFile[] {
  return [
    { path: 'ProjectFiles/.editorconfig', content: godotEditorconfig(ir.setup) },
    { path: 'ProjectFiles/.gitattributes', content: godotGitattributes(ir.setup) },
    { path: 'ProjectFiles/.gitignore', content: godotGitignore(ir.setup) },
    { path: 'ProjectFiles/setup.json', content: JSON.stringify({ folders: godotFolders(ir.setup) }, null, 2) + '\n' },
  ]
}

/** What Godot writes into a .import file for a file it should keep as it is. */
export const KEEP_IMPORT = '[remap]\n\nimporter="keep"\n'

function names(ir: EngineIR): GodotNames {
  return {
    project: projectName(ir),
    schemaType: schemaTypeName,
    field: (s, planner) => fieldNames(s)[s.fields.findIndex((f) => f.name === planner)],
    identifier,
    gdString,
    fileOf,
  }
}

export const godot: EngineAdapter = {
  id: 'godot',
  label: 'Godot',
  language: 'GDScript',
  version: 3,
  root: 'Godot',
  ownDir: 'Scripts/Classes/',
  generatedDirs: ['Scripts/Generated/', 'ProjectFiles/'],
  classIndex: 'Scripts/Generated/classes.json',
  reservedWords: GD_KEYWORDS,
  typeName,
  identifier,
  emit(ir): EmittedFile[] {
    const dir = 'Scripts/Generated/'
    return [
      ...ir.schemas.map((s) => ({ path: `${dir}${fileOf(schemaTypeName(s))}.gd`, content: schemaFile(s, ir) })),
      { path: `${dir}${fileOf(enumsClass(ir))}.gd`, content: enumsFile(ir) },
      { path: `${dir}${fileOf(idsClass(ir))}.gd`, content: idsFile(ir) },
      { path: `${dir}${fileOf(formulasClass(ir))}.gd`, content: formulasFile(ir) },
      { path: `${dir}${fileOf(valuesClass(ir))}.gd`, content: valuesFile(ir) },
      ...classFiles(ir),
      ...setupFiles(ir),
      ...checksFile(ir, names(ir)),
      ...consoleFiles(ir, names(ir)),
      ...channelFiles(ir, names(ir)),
      ...telemetryFile(ir, names(ir)),
      ...inputFile(ir, names(ir)),
      ...screenFiles(ir, names(ir)),
      ...stateMachineFiles(ir, names(ir)),
    ]
  },
  /** Godot would import every .csv as a translation; the record CSVs are data, so they are kept as they are. */
  sidecars(paths) {
    return paths.filter((p) => p.startsWith('Data/') && p.endsWith('.csv')).map((p) => ({ path: `${p}.import`, content: KEEP_IMPORT }))
  },
  checks(ir): EngineIssue[] {
    const out: EngineIssue[] = []
    const globals = new Map<string, string>()
    const claim = (name: string, what: string) => {
      if (GODOT_TYPES.has(name)) out.push({ level: 'warning', code: 'godot.typeName', message: `${what}: ${name} is a Godot class; rename it in the plan, GDScript cannot have both.` })
      else if (globals.has(name)) out.push({ level: 'error', code: 'godot.duplicate', message: `${what} and ${globals.get(name)} both become the global class ${name}; rename one in the plan.` })
      else globals.set(name, what)
    }
    for (const s of ir.schemas) {
      claim(schemaTypeName(s), `Schema ${s.name}`)
      const names = fieldNames(s)
      s.fields.forEach((f, i) => {
        if (names[i] !== identifier(f.words, 'field')) out.push({ level: 'info', code: 'godot.renamed', schema: s.id, field: f.name, message: `${s.name}.${f.name}: named ${names[i]} in GDScript, because ${s.format === 'native' && RESOURCE_MEMBERS.has(identifier(f.words, 'field')) ? 'every Resource already has that property' : 'the name is taken'}.` })
        else if (names[i].endsWith('_') && GD_KEYWORDS.has(names[i].slice(0, -1))) out.push({ level: 'info', code: 'godot.keyword', schema: s.id, field: f.name, message: `${s.name}.${f.name}: a GDScript keyword, written as ${names[i]}.` })
      })
    }
    const p = projectName(ir)
    const extras = [`${p}DataChecks`, `${p}Console`, `${p}Telemetry`, ...ir.channels.filter((c) => c.kind === 'asset').map((c) => `${identifier(c.words, 'type')}Channel`), ...scaffoldGlobals(ir, names(ir))]
    for (const n of [enumsClass(ir), idsClass(ir), formulasClass(ir), valuesClass(ir), ...extras]) claim(n, `The generated ${n}`)
    for (const c of ir.classes) {
      claim(className(c), `Class ${c.name}`)
      if (hasOwnFile(c)) claim(baseName(c), `The generated base of ${c.name}`)
      const hiding = [...c.fields.map((f) => keepIdent(f.name, 'field')), ...c.methods.map((m) => keepIdent(m.name, 'method'))].filter((n) => GD_FUNCTIONS.has(n))
      if (hiding.length) out.push({ level: 'info', code: 'godot.shadows', message: `Class ${c.name}: ${hiding.join(', ')} hides GDScript's function of that name inside the class (Godot warns); fine unless the class needs that function.` })
      for (const t of [...c.fields.map((f) => f.type), ...c.methods.flatMap((m) => [m.returns, ...m.params.map((p) => p.type)])]) {
        const inner = t?.k === 'list' ? t.of : t
        if (inner?.k === 'engine' && !ENGINE_TYPE[inner.name] && !/^[A-Z]/.test(inner.name)) out.push({ level: 'info', code: 'godot.engineType', message: `Class ${c.name}: “${inner.name}” is written as is; make sure Godot knows that type.` })
      }
    }
    return out
  },
}
