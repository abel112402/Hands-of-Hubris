import { camel, pascal, uniqueNames, type EmittedFile, type EngineAdapter, type IdentKind } from '../adapter'
import { words } from '../../coding'
import type { FormulaNode } from '../formulaAst'
import type { ClassKind } from '../../classes'
import type { EngineIR, EngineIssue, IrClass, IrEnum, IrFormat, IrMethod, IrSchema, NeutralType } from '../ir'

/** Unity 6 adapter: C# ScriptableObjects (native format) or [Serializable] record classes (JSON, CSV), enums, ID constants and formulas. */

const CS_KEYWORDS = new Set(
  'abstract as base bool break byte case catch char checked class const continue decimal default delegate do double else enum event explicit extern false finally fixed float for foreach goto if implicit in int interface internal is lock long namespace new null object operator out override params private protected public readonly ref return sbyte sealed short sizeof stackalloc static string struct switch this throw true try typeof uint ulong unchecked unsafe ushort using virtual void volatile while'.split(' '),
)
/** Members every ScriptableObject already has; a field of that name would hide them. */
const OBJECT_MEMBERS = new Set(['name', 'hideFlags'])
/** Unity types a generated type must not shadow inside the generated namespace. */
const UNITY_TYPES = new Set(['Object', 'GameObject', 'Component', 'Transform', 'Sprite', 'Texture', 'Texture2D', 'Material', 'Mesh', 'Color', 'Vector2', 'Vector3', 'AudioClip', 'AnimationCurve', 'ScriptableObject', 'Debug', 'Random', 'Time', 'Input', 'Mathf', 'Ids', 'Formulas', 'EnumIds'])

const ASSET_TYPE: Record<string, string> = { image: 'Sprite', scene: 'GameObject', audio: 'AudioClip', material: 'Material', mesh: 'Mesh', animation: 'AnimationClip', animator: 'RuntimeAnimatorController', data: 'ScriptableObject' }
const FUNC: Record<string, string> = { min: 'Mathf.Min', max: 'Mathf.Max', sqrt: 'Mathf.Sqrt', abs: 'Mathf.Abs', floor: 'Mathf.Floor', ceil: 'Mathf.Ceil', round: 'Mathf.Round', pow: 'Mathf.Pow', log: 'Mathf.Log' }

const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const csString = (s: string) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`
const indent = (lines: string[], n: number) => lines.map((l) => (l ? ' '.repeat(n) + l : l))

function identifier(words: string[], kind: IdentKind): string {
  let id = kind === 'field' || kind === 'param' ? camel(words) : pascal(words)
  if (!id) id = kind === 'field' || kind === 'param' ? 'value' : 'Unnamed'
  if (/^[0-9]/.test(id)) id = '_' + id
  return CS_KEYWORDS.has(id) ? '@' + id : id
}

const enumNameCache = new WeakMap<EngineIR, Map<string, string>>()
/** Enum type names, unique across the IR and never a Unity type or a generated schema type. */
function enumTypeName(en: IrEnum, ir: EngineIR): string {
  let m = enumNameCache.get(ir)
  if (!m) {
    const base = ir.enums.map((e) => {
      const n = identifier(e.words, 'type').replace(/^@/, '')
      return UNITY_TYPES.has(n) ? n + 'Kind' : n
    })
    const names = uniqueNames(base, ir.schemas.map(schemaTypeName))
    m = new Map(ir.enums.map((e, i) => [e.id, names[i]]))
    enumNameCache.set(ir, m)
  }
  return m.get(en.id) ?? 'UnknownEnum'
}
const schemaTypeName = (s: IrSchema) => identifier(s.words, 'type') + (s.format === 'native' ? 'Definition' : 'Record')
const projectNamespace = (ir: EngineIR) => identifier(ir.project.words, 'type').replace(/^@/, '') || 'Game'
const namespaceOf = (ir: EngineIR) => `${projectNamespace(ir)}.Data`

function typeName(t: NeutralType, ir: EngineIR, format: IrFormat): string {
  const native = format === 'native'
  switch (t.k) {
    case 'string':
    case 'text':
    case 'date':
    case 'localized':
      return 'string'
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
      return 'AnimationCurve'
    case 'enum': {
      const en = ir.enums.find((e) => e.id === t.enumId)
      return native && en ? enumTypeName(en, ir) : 'string'
    }
    case 'asset':
      return native ? ASSET_TYPE[t.asset] : 'string'
    case 'ref': {
      const target = ir.schemas.find((s) => s.id === t.schema)
      return native && target?.format === 'native' ? schemaTypeName(target) : 'string'
    }
    case 'list':
      return `List<${typeName(t.of, ir, format)}>`
    case 'class': {
      const c = ir.classes.find((x) => x.id === t.classId)
      return c ? className(c) : 'object'
    }
    case 'engine':
      return t.name
  }
}

/** Field names of a schema in the generated class: unique, and never `id`/`plannerId` or a ScriptableObject member. */
function fieldNames(s: IrSchema): string[] {
  const base = s.fields.map((f) => {
    const n = identifier(f.words, 'field')
    return s.format === 'native' && OBJECT_MEMBERS.has(n) ? 'display' + n.charAt(0).toUpperCase() + n.slice(1) : n
  })
  return uniqueNames(base, ['id', 'plannerId'])
}

const HEADER = (ir: EngineIR) => [
  '// <auto-generated>',
  `//   Generated by Game Design Planner (engine IR v${ir.v}, Unity adapter v${unity.version}) from “${ir.project.name}”.`,
  '//   Do not edit: the next import overwrites this file. Add code in a partial class in another file.',
  '// </auto-generated>',
]

function fieldDoc(s: IrSchema, i: number, ir: EngineIR): string[] {
  const f = s.fields[i]
  const notes: string[] = [f.optional ? 'Optional.' : 'Required.', `Planner type: ${f.raw.split(':').slice(1).join(':').trim() || '?'}.`]
  const inner = f.type.k === 'list' ? f.type.of : f.type
  if (inner.k === 'localized') notes.push('Localization key.')
  if (s.format !== 'native' && inner.k === 'ref') notes.push(`${ir.schemas.find((x) => x.id === inner.schema)?.name ?? '?'} ID.`)
  if (s.format !== 'native' && inner.k === 'asset') notes.push('Addressables key or asset path.')
  if (s.format !== 'native' && inner.k === 'enum') notes.push('Enum ID, see EnumIds.')
  return [`[Tooltip(${csString(notes.join(' '))})]`]
}

function schemaFile(s: IrSchema, ir: EngineIR): string {
  const type = schemaTypeName(s)
  const names = fieldNames(s)
  const ns = namespaceOf(ir)
  const summary = [`${s.name}.`, s.source ? `Records come from ${s.source}.` : '', s.idPrefix ? `ID prefix “${s.idPrefix}”.` : '', `Schema version ${s.version}.`].filter(Boolean).join(' ')
  const body: string[] = []
  body.push(`/// <summary>${xml(summary)}</summary>`)
  if (s.format === 'native') {
    body.push(`[CreateAssetMenu(menuName = ${csString(`${ir.project.name || 'Game'}/${s.name}`)}, fileName = ${csString('New' + identifier(s.words, 'type'))})]`)
    body.push(`public partial class ${type} : ScriptableObject`)
  } else {
    body.push('[Serializable]')
    body.push(`public partial class ${type}`)
  }
  body.push('{')
  const fieldMap = s.fields.map((f, i) => `[${csString(f.name)}] = ${csString(names[i].replace(/^@/, ''))}`)
  const members: string[] = [
    '/// <summary>The planner schema this type stands for; the planner bridge finds the type by it.</summary>',
    `public const string SchemaId = ${csString(s.id)};`,
    `public const int SchemaVersion = ${s.version};`,
    '/// <summary>Planner field name → C# field name, for the importer.</summary>',
    `public static readonly IReadOnlyDictionary<string, string> PlannerFields = new Dictionary<string, string>${fieldMap.length ? ` { ${fieldMap.join(', ')} }` : '()'};`,
    '',
    '[Tooltip("Stable ID from the planner. Never changes once released.")]',
    'public string id;',
    '',
    '[HideInInspector]',
    'public string plannerId;',
  ]
  s.fields.forEach((f, i) => {
    members.push('', ...fieldDoc(s, i, ir), `public ${typeName(f.type, ir, s.format)} ${names[i]};`)
    const inner = f.type.k === 'list' ? f.type.of : f.type
    if (s.format !== 'native' && inner.k === 'enum' && f.type.k !== 'list') {
      const en = ir.enums.find((e) => e.id === inner.enumId)
      if (en) members.push(`public ${enumTypeName(en, ir)} ${pascal([names[i].replace(/^@/, '')])}Value => EnumIds.${enumTypeName(en, ir)}[${names[i]}];`)
    }
  })
  body.push(...indent(members, 4), '}')
  return [...HEADER(ir), 'using System;', 'using System.Collections.Generic;', 'using UnityEngine;', '', `namespace ${ns}`, '{', ...indent(body, 4), '}', ''].join('\n')
}

function enumMembers(en: IrEnum): string[] {
  return uniqueNames(en.members.map((m) => identifier(words(m.label), 'member').replace(/^@/, '')))
}

function enumsFile(ir: EngineIR): string {
  const body: string[] = []
  for (const en of ir.enums) {
    const names = enumMembers(en)
    body.push(`/// <summary>${xml(en.from === 'catalog' ? `Catalog “${en.name}”.` : `Values of ${en.name} used in the planner.`)}</summary>`)
    body.push(`public enum ${enumTypeName(en, ir)}`, '{')
    if (!names.length) body.push('    None,')
    en.members.forEach((m, i) => body.push(`    [InspectorName(${csString(m.label)})] ${names[i]},`))
    body.push('}', '')
  }
  body.push('/// <summary>Planner IDs (as stored in the JSON and CSV records) to enum values.</summary>', 'public static class EnumIds', '{')
  for (const en of ir.enums) {
    const names = enumMembers(en)
    const t = enumTypeName(en, ir)
    // Fully qualified: inside EnumIds the field named like the enum would hide the enum type.
    const q = `global::${namespaceOf(ir)}.${t}`
    const entries = en.members.map((m, i) => `[${csString(m.id)}] = ${q}.${names[i]}`)
    body.push(`    public static readonly IReadOnlyDictionary<string, ${q}> ${t} = new Dictionary<string, ${q}>${entries.length ? ` { ${entries.join(', ')} }` : '()'};`)
  }
  body.push('}')
  return [...HEADER(ir), 'using System.Collections.Generic;', 'using UnityEngine;', '', `namespace ${namespaceOf(ir)}`, '{', ...indent(body, 4), '}', ''].join('\n')
}

function idsFile(ir: EngineIR): string {
  const body: string[] = ['/// <summary>Stable record IDs, one constant per record exported from the planner.</summary>', 'public static class Ids', '{']
  const classes = uniqueNames(ir.schemas.map((s) => identifier(s.words, 'type')))
  ir.schemas.forEach((s, i) => {
    const recs = ir.records.filter((r) => r.schema === s.id)
    if (!recs.length) return
    const consts = uniqueNames(recs.map((r) => identifier(words(r.name || r.key), 'constant').replace(/^@/, '')), [classes[i]])
    body.push(`    public static class ${classes[i]}`, '    {')
    recs.forEach((r, j) => body.push(`        public const string ${consts[j]} = ${csString(r.key)};`))
    body.push('    }')
  })
  body.push('}')
  return [...HEADER(ir), `namespace ${namespaceOf(ir)}`, '{', ...indent(body, 4), '}', ''].join('\n')
}

const PREC: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2 }
function csExpr(n: FormulaNode, params: Map<string, string>): string {
  const prec = (x: FormulaNode) => (x.k === 'bin' && x.op !== '^' ? PREC[x.op] : x.k === 'neg' ? 3 : 4)
  switch (n.k) {
    case 'num':
      return `${Number.isInteger(n.v) ? n.v : n.v.toString()}f`
    case 'var':
      return params.get(n.name) ?? '0f'
    case 'neg': {
      const a = csExpr(n.a, params)
      return prec(n.a) < 3 ? `-(${a})` : `-${a}`
    }
    case 'call':
      return `${FUNC[n.fn]}(${n.args.map((a) => csExpr(a, params)).join(', ')})`
    case 'bin': {
      if (n.op === '^') return `Mathf.Pow(${csExpr(n.a, params)}, ${csExpr(n.b, params)})`
      const p = PREC[n.op]
      const l = csExpr(n.a, params)
      const r = csExpr(n.b, params)
      const lp = prec(n.a) < p ? `(${l})` : l
      const rp = prec(n.b) < p || (prec(n.b) === p && (n.op === '-' || n.op === '/')) ? `(${r})` : r
      return `${lp} ${n.op} ${rp}`
    }
  }
}

function formulasFile(ir: EngineIR): string {
  const methods = uniqueNames(ir.formulas.map((f) => identifier(f.words, 'method').replace(/^@/, '')), ['Formulas'])
  const body: string[] = [
    '/// <summary>Formulas from the planner. Mathf.Round rounds halves to even; the planner rounds them up.</summary>',
    'public static class Formulas',
    '{',
  ]
  ir.formulas.forEach((f, i) => {
    const pnames = uniqueNames(f.params.map((v) => identifier(words(v), 'param')))
    const params = new Map(f.params.map((v, j) => [v, pnames[j]]))
    const sig = f.params.map((_, j) => `float ${pnames[j]}`).join(', ')
    const sample = Object.keys(f.sample).length ? ` Sample: ${Object.entries(f.sample).map(([k, v]) => `${k} = ${v}`).join(', ')}.` : ''
    body.push(`    /// <summary>${xml(`${f.name} (${f.where}).`)}</summary>`, `    /// <remarks>${xml(`Planner: ${f.expr}.${sample}`)}</remarks>`)
    if (f.ast) body.push(`    public static float ${methods[i]}(${sig}) => ${csExpr(f.ast, params)};`)
    else body.push(`    public static float ${methods[i]}(${sig}) => throw new System.NotImplementedException(${csString(`Planner formula could not be read: ${f.error}`)});`)
    if (i < ir.formulas.length - 1) body.push('')
  })
  body.push('}')
  return [...HEADER(ir), 'using UnityEngine;', '', `namespace ${namespaceOf(ir)}`, '{', ...indent(body, 4), '}', ''].join('\n')
}

// ---- Classes from the class diagram ----

/** A name as the designer wrote it when it is already a C# identifier (keeps EnemyAI, IDamageable), else built from its words. */
function keepIdent(name: string, kind: IdentKind): string {
  const n = name.trim()
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(n)) return CS_KEYWORDS.has(n) ? '@' + n : n
  return identifier(words(n), kind)
}
const className = (c: IrClass) => keepIdent(c.name, 'type').replace(/^@/, '')
/** The class's namespace: its module's assembly name when that is a dotted identifier, else Project.Module, else Project. */
function classNamespace(ir: EngineIR, c: IrClass): string {
  const asm = c.module?.assembly ?? ''
  if (/^[A-Za-z_]\w*(\.[A-Za-z_]\w*)*$/.test(asm)) return asm
  return c.module ? `${projectNamespace(ir)}.${identifier(c.module.words, 'type').replace(/^@/, '')}` : projectNamespace(ir)
}
/** Types inside class code: classes and schemas by their type name, assets as Unity objects. */
function memberType(t: NeutralType | null, ir: EngineIR): string {
  if (!t) return 'void'
  if (t.k === 'list') return `List<${memberType(t.of, ir)}>`
  if (t.k === 'ref') {
    const s = ir.schemas.find((x) => x.id === t.schema)
    return s ? schemaTypeName(s) : 'string'
  }
  return typeName(t, ir, 'native')
}
const BASE: Partial<Record<ClassKind, string>> = { component: 'MonoBehaviour', actor: 'MonoBehaviour', data: 'ScriptableObject', event: 'ScriptableObject' }
/** Kinds that need a file named after the class (Unity finds MonoBehaviours and ScriptableObjects by file name) or that have method bodies to write. */
const needsOwnFile = (c: IrClass) => ['component', 'actor', 'data', 'event'].includes(c.kind) || (!['interface', 'enum'].includes(c.kind) && c.methods.length > 0)
const decl = (c: IrClass) => (c.kind === 'struct' ? 'partial struct' : c.kind === 'static' ? 'static partial class' : 'partial class')
const usingsFor = (ir: EngineIR, c: IrClass) => {
  const own = classNamespace(ir, c)
  const other = [...new Set([namespaceOf(ir), ...ir.classes.map((x) => classNamespace(ir, x))])].filter((n) => n !== own).sort()
  return ['using System;', 'using System.Collections.Generic;', 'using UnityEngine;', ...other.map((n) => `using ${n};`)]
}
const methodSig = (m: IrMethod, ir: EngineIR, inInterface: boolean, isStaticClass: boolean) => {
  const params = uniqueNames(m.params.map((x) => keepIdent(x.name, 'param')))
  const args = m.params.map((x, i) => `${memberType(x.type, ir)} ${params[i]}`).join(', ')
  const name = keepIdent(m.name, 'method')
  if (inInterface) return `${memberType(m.returns, ir)} ${name}(${args})`
  return `${m.visibility} ${m.isStatic || isStaticClass ? 'static ' : ''}partial ${memberType(m.returns, ir)} ${name}(${args})`
}

function classGenerated(ir: EngineIR, c: IrClass): string {
  const name = className(c)
  const body: string[] = []
  if (c.doc) body.push(`/// <summary>${xml(c.doc)}</summary>`)
  if (c.kind === 'enum') {
    body.push(`public enum ${name}`, '{', ...uniqueNames(c.fields.map((f) => keepIdent(f.name, 'member').replace(/^@/, ''))).map((m) => `    ${m},`), '}')
  } else if (c.kind === 'interface') {
    const bases = [c.base, ...c.implements].map((id) => ir.classes.find((x) => x.id === id)).filter((x): x is IrClass => !!x).map(className)
    body.push(`public partial interface ${name}${bases.length ? ` : ${bases.join(', ')}` : ''}`, '{')
    for (const m of c.methods) body.push(`    ${methodSig(m, ir, true, false)};`)
    body.push('}')
  } else {
    for (const r of c.requires) {
      const t = ir.classes.find((x) => x.id === r)
      if (t && ['component', 'actor'].includes(c.kind)) body.push(`[RequireComponent(typeof(${className(t)}))]`)
    }
    if (c.kind === 'data' || c.kind === 'event') body.push(`[CreateAssetMenu(menuName = ${csString(`${ir.project.name || 'Game'}/${c.name}`)}, fileName = ${csString('New' + name)})]`)
    if (c.kind === 'class' || c.kind === 'struct') body.push('[Serializable]')
    const base = ir.classes.find((x) => x.id === c.base)
    const parents = c.kind === 'static' ? [] : [base ? className(base) : BASE[c.kind], ...c.implements.map((id) => ir.classes.find((x) => x.id === id)).filter((x): x is IrClass => !!x).map(className)].filter(Boolean)
    body.push(`public ${decl(c)} ${name}${parents.length ? ` : ${parents.join(', ')}` : ''}`, '{')
    const members: string[] = []
    if (c.kind === 'event') {
      const types = c.fields.map((f) => memberType(f.type ?? { k: 'engine', name: 'object' }, ir))
      const params = uniqueNames(c.fields.map((f) => keepIdent(f.name, 'param')))
      const action = types.length ? `Action<${types.join(', ')}>` : 'Action'
      members.push('/// <summary>Raised with the payload; subscribe in OnEnable, unsubscribe in OnDisable.</summary>', `public event ${action} Raised;`, '', `public void Raise(${types.map((t, i) => `${t} ${params[i]}`).join(', ')}) => Raised?.Invoke(${params.join(', ')});`)
    } else {
      const fieldNames = uniqueNames(c.fields.map((f) => keepIdent(f.name, 'field')))
      c.fields.forEach((f, i) => {
        const isStatic = f.isStatic || c.kind === 'static'
        const serialize = !isStatic && f.visibility !== 'public'
        members.push(`${serialize ? '[SerializeField] ' : ''}${f.visibility} ${isStatic ? 'static ' : ''}${memberType(f.type ?? { k: 'engine', name: 'object' }, ir)} ${fieldNames[i]};`)
      })
    }
    if (c.methods.length) {
      if (members.length) members.push('')
      members.push('// Bodies are in your file (Scripts/Classes/…); each one must be written there.')
      for (const m of c.methods) members.push(`${methodSig(m, ir, false, c.kind === 'static')};`)
    }
    body.push(...indent(members, 4), '}')
  }
  return [...HEADER(ir), ...usingsFor(ir, c), '', `namespace ${classNamespace(ir, c)}`, '{', ...indent(body, 4), '}', ''].join('\n')
}

function classOwnFile(ir: EngineIR, c: IrClass): string {
  const members: string[] = []
  for (const m of c.methods) {
    const ret = memberType(m.returns, ir)
    members.push(`${methodSig(m, ir, false, c.kind === 'static')}`, '{', ret === 'void' ? '    // TODO' : '    throw new NotImplementedException();', '}', '')
  }
  if (members.length) members.pop()
  return [
    `// Your code for ${c.name}. The planner export created this file once; replace the bodies and add what you need.`,
    '// The importer never overwrites it. The fields, attributes and signatures live in Generated/Classes/' + className(c) + '.Generated.cs.',
    ...usingsFor(ir, c),
    '',
    `namespace ${classNamespace(ir, c)}`,
    '{',
    `    public ${decl(c)} ${className(c)}`,
    '    {',
    ...indent(members, 8),
    '    }',
    '}',
    '',
  ].join('\n')
}

const ownFilePath = (c: IrClass) => `Scripts/Classes/${c.module ? identifier(c.module.words, 'type').replace(/^@/, '') + '/' : ''}${className(c)}.cs`
const generatedFilePath = (c: IrClass) => `Scripts/Generated/Classes/${className(c)}.Generated.cs`

function classFiles(ir: EngineIR): EmittedFile[] {
  const files = ir.classes.flatMap((c) => [
    { path: generatedFilePath(c), content: classGenerated(ir, c) },
    ...(needsOwnFile(c) ? [{ path: ownFilePath(c), content: classOwnFile(ir, c) }] : []),
  ])
  // Which file belongs to which planner class, so the engine package can report each class's state back.
  const index = ir.classes.map((c) => ({ plannerId: c.id, name: c.name, kind: c.kind, generated: `Unity/${generatedFilePath(c)}`, own: needsOwnFile(c) ? `Unity/${ownFilePath(c)}` : null, methods: c.methods.length }))
  return ir.classes.length ? [...files, { path: 'Scripts/Generated/classes.json', content: JSON.stringify(index, null, 2) + '\n' }] : files
}

/** One assembly for the generated code and your class files, so a partial class can span both. */
function asmdef(ir: EngineIR): string {
  const root = projectNamespace(ir)
  return JSON.stringify({ name: root, rootNamespace: root, references: [], autoReferenced: true }, null, 2) + '\n'
}

export const unity: EngineAdapter = {
  id: 'unity',
  label: 'Unity',
  language: 'C#',
  version: 3,
  root: 'Unity',
  reservedWords: CS_KEYWORDS,
  typeName,
  identifier,
  emit(ir): EmittedFile[] {
    const dir = 'Scripts/Generated/'
    return [
      { path: `Scripts/${projectNamespace(ir)}.asmdef`, content: asmdef(ir) },
      ...ir.schemas.map((s) => ({ path: `${dir}${schemaTypeName(s)}.cs`, content: schemaFile(s, ir) })),
      { path: `${dir}Enums.cs`, content: enumsFile(ir) },
      { path: `${dir}Ids.cs`, content: idsFile(ir) },
      { path: `${dir}Formulas.cs`, content: formulasFile(ir) },
      ...classFiles(ir),
    ]
  },
  checks(ir): EngineIssue[] {
    const out: EngineIssue[] = []
    for (const s of ir.schemas) {
      const base = identifier(s.words, 'type')
      if (UNITY_TYPES.has(base)) out.push({ level: 'info', code: 'unity.typeName', schema: s.id, message: `${s.name}: the type is called ${schemaTypeName(s)} so it does not hide Unity's ${base}.` })
      const names = fieldNames(s)
      s.fields.forEach((f, i) => {
        if (names[i].startsWith('@')) out.push({ level: 'info', code: 'unity.keyword', schema: s.id, field: f.name, message: `${s.name}.${f.name}: a C# keyword, written as ${names[i]}.` })
        else if (names[i] !== identifier(f.words, 'field')) out.push({ level: 'info', code: 'unity.renamed', schema: s.id, field: f.name, message: `${s.name}.${f.name}: named ${names[i]} in C#, because ${s.format === 'native' ? 'every ScriptableObject already has that member' : 'the name is taken'}.` })
      })
    }
    for (const c of ir.classes) if (UNITY_TYPES.has(className(c))) out.push({ level: 'warning', code: 'unity.className', message: `Class ${c.name}: same name as a Unity type; code that means Unity's ${className(c)} will need its full name.` })
    for (const en of ir.enums) if (UNITY_TYPES.has(identifier(en.words, 'type'))) out.push({ level: 'info', code: 'unity.typeName', message: `Enum ${en.name}: called ${enumTypeName(en, ir)} so it does not hide Unity's ${identifier(en.words, 'type')}.` })
    return out
  },
}
