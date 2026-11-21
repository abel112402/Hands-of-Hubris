import { pascal, uniqueNames, type EmittedFile, type EngineAdapter, type IdentKind } from '../adapter'
import { words } from '../../coding'
import type { FormulaNode } from '../formulaAst'
import type { ClassKind } from '../../classes'
import type { EngineIR, EngineIssue, IrClass, IrEnum, IrFormat, IrMethod, IrRecord, IrSchema, IrSetup, NeutralType } from '../ir'
import { channelFiles, consoleFiles, telemetryFiles, type UnrealNames } from './unrealExtras'
import { extraModules, inputFiles as scaffoldInput, inputPlan, screenFiles, stateMachineFiles } from './unrealScaffold'
import { audioFiles, audioPlan, budgetFiles } from './unrealPolish'
import { architectureFile, architecturePlan } from '../architecture'

/**
 * Unreal Engine 5 adapter (C++, UE 5.3+). The export is a project plugin: unpacked into <project>/Plugins/HoHPlanner,
 * Unreal finds Unreal/PlannerGame.uplugin and builds its one module, PlannerGame:
 * - native-format schemas → UPrimaryDataAsset classes (UXDefinition); the planner's editor scripts make one asset per record;
 * - JSON and CSV schemas → FTableRowBase structs (FXRow) and a DataTable JSON per schema, importable without any plugin;
 * - catalogs → UENUMs, record IDs → constants, formulas → a Blueprint function library;
 * - the class diagram → a generated base (UXBase: properties, pure virtual methods, replaced on every export) and your
 *   class (UX : UXBase, header and .cpp, created once). Your files are the module's own (Source/PlannerGame/ outside
 *   Generated/), so the Build.cs and the module file are yours too.
 */

export const UE_MODULE = 'PlannerGame'
const API = `${UE_MODULE.toUpperCase()}_API`
const SRC = `Source/${UE_MODULE}/`
const GEN = `${SRC}Generated/`

const CPP_KEYWORDS = new Set(
  'alignas alignof and asm auto bool break case catch char class const constexpr const_cast continue decltype default delete do double dynamic_cast else enum explicit export extern false float for friend goto if inline int long mutable namespace new noexcept not nullptr operator or private protected public register reinterpret_cast return short signed sizeof static static_assert static_cast struct switch template this thread_local throw true try typedef typeid typename union unsigned using virtual void volatile wchar_t while'.split(' '),
)
/** Unreal types (without their U/A/F/E prefix) a generated type must not take the name of. */
const UE_TYPES = new Set(
  'Object Actor Pawn Character Controller PlayerController AIController GameModeBase GameMode GameStateBase GameState PlayerState HUD World Level Engine GameInstance Subsystem ActorComponent SceneComponent PrimitiveComponent StaticMeshComponent DataAsset PrimaryDataAsset DataTable TableRowBase Interface Class Struct Enum Name String Text Vector Vector2D Rotator Transform Color LinearColor Texture Texture2D Material MaterialInterface StaticMesh SkeletalMesh SoundBase AnimSequence AnimInstance CurveFloat Widget UserWidget Timer TimerHandle Guid DateTime Package Property Function Delegate'.split(' '),
)
/** UObject members a record property must not hide. */
const OBJECT_MEMBERS = new Set(['Name', 'Class', 'Outer', 'Flags', 'World'])
/** Unity and C# spellings a designer may have used for class members, as their Unreal type. */
const ENGINE_TYPE: Record<string, string> = {
  int: 'int32', long: 'int64', float: 'float', double: 'double', bool: 'bool', string: 'FString', void: 'void',
  GameObject: 'TObjectPtr<AActor>', Transform: 'FTransform', MonoBehaviour: 'TObjectPtr<UActorComponent>', ScriptableObject: 'TObjectPtr<UDataAsset>',
  Sprite: 'TObjectPtr<UTexture2D>', Texture2D: 'TObjectPtr<UTexture2D>', AudioClip: 'TObjectPtr<USoundBase>', AnimationCurve: 'TObjectPtr<UCurveFloat>',
  AnimationClip: 'TObjectPtr<UAnimSequence>', Vector2: 'FVector2D', Vector3: 'FVector', Vector2Int: 'FIntPoint', Vector3Int: 'FIntVector', Color: 'FLinearColor',
  Quaternion: 'FQuat', Rigidbody: 'TObjectPtr<UPrimitiveComponent>', Rigidbody2D: 'TObjectPtr<UPrimitiveComponent>', Camera: 'TObjectPtr<UCameraComponent>',
  Collider: 'TObjectPtr<UShapeComponent>', Material: 'TObjectPtr<UMaterialInterface>', Mesh: 'TObjectPtr<UStaticMesh>',
}

const ASSET_TYPE: Record<string, string> = {
  image: 'TSoftObjectPtr<UTexture2D>',
  scene: 'TSoftClassPtr<AActor>',
  audio: 'TSoftObjectPtr<USoundBase>',
  material: 'TSoftObjectPtr<UMaterialInterface>',
  mesh: 'TSoftObjectPtr<UStaticMesh>',
  animation: 'TSoftObjectPtr<UAnimSequence>',
  animator: 'TSoftClassPtr<UAnimInstance>',
  data: 'TSoftObjectPtr<UDataAsset>',
}
/** Engine classes the generated headers refer to, forward-declared instead of included. */
const FORWARD = ['UTexture2D', 'AActor', 'USoundBase', 'UMaterialInterface', 'UStaticMesh', 'UAnimSequence', 'UAnimInstance', 'UDataAsset', 'UCurveFloat']

const cppString = (s: string) => `TEXT("${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}")`
const meta = (s: string) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ')}"`
const comment = (s: string) => s.replace(/\*\//g, '* /')
const tabs = (lines: string[], n = 1) => lines.map((l) => (l ? '\t'.repeat(n) + l : l))
const snake = (ws: string[]) => ws.map((w) => w.toLowerCase()).join('_')

function identifier(ws: string[], kind: IdentKind): string {
  void kind
  let id = pascal(ws)
  if (!id) id = kind === 'type' ? 'Unnamed' : 'Value'
  if (/^[0-9]/.test(id)) id = 'N' + id
  return CPP_KEYWORDS.has(id) ? id + '_' : id
}

const projectName = (ir: EngineIR) => identifier(ir.project.words, 'type') || 'Game'
const enumsFileName = (ir: EngineIR) => `${projectName(ir)}Enums`
const notEngine = (n: string, suffix: string) => (UE_TYPES.has(n) ? n + suffix : n)

/** Schema types: UXDefinition (native) or FXRow (JSON, CSV). */
const schemaBase = (s: IrSchema) => identifier(s.words, 'type') + (s.format === 'native' ? 'Definition' : 'Row')
const schemaTypeName = (s: IrSchema) => (s.format === 'native' ? 'U' : 'F') + schemaBase(s)

const enumNameCache = new WeakMap<EngineIR, Map<string, string>>()
/** Enum names without the E: unique, never an Unreal type. */
function enumBase(en: IrEnum, ir: EngineIR): string {
  let m = enumNameCache.get(ir)
  if (!m) {
    const names = uniqueNames(ir.enums.map((e) => notEngine(identifier(e.words, 'type'), 'Kind')))
    m = new Map(ir.enums.map((e, i) => [e.id, names[i]]))
    enumNameCache.set(ir, m)
  }
  return m.get(en.id) ?? 'UnknownEnum'
}
const enumMembers = (en: IrEnum) => uniqueNames(en.members.map((m) => identifier(words(m.label), 'member')))

function typeName(t: NeutralType, ir: EngineIR, format: IrFormat): string {
  switch (t.k) {
    case 'string':
    case 'text':
    case 'date':
    case 'localized':
      return 'FString'
    case 'int':
      return 'int32'
    case 'float':
      return 'float'
    case 'bool':
      return 'bool'
    case 'color':
      return 'FLinearColor'
    case 'vec2':
      return 'FVector2D'
    case 'vec3':
      return 'FVector'
    case 'curve':
      return 'TObjectPtr<UCurveFloat>'
    case 'enum': {
      const en = ir.enums.find((e) => e.id === t.enumId)
      return en ? `E${enumBase(en, ir)}` : 'FName'
    }
    case 'asset':
      return ASSET_TYPE[t.asset]
    case 'ref': {
      const target = ir.schemas.find((s) => s.id === t.schema)
      // A data asset points at the other record's asset; a DataTable row names the other row.
      return format === 'native' && target?.format === 'native' ? `TObjectPtr<${schemaTypeName(target)}>` : 'FName'
    }
    case 'list':
      return `TArray<${typeName(t.of, ir, format)}>`
    case 'class': {
      const c = ir.classes.find((x) => x.id === t.classId)
      return c ? classRefType(c) : 'FString'
    }
    case 'engine':
      return ENGINE_TYPE[t.name] ?? t.name
  }
}

const DEFAULTS: Record<string, string> = { int32: ' = 0', int64: ' = 0', float: ' = 0.f', double: ' = 0.0', bool: ' = false', FLinearColor: ' = FLinearColor::White', FVector2D: ' = FVector2D::ZeroVector', FVector: ' = FVector::ZeroVector' }
const initOf = (type: string) => DEFAULTS[type] ?? (/^E\w+$/.test(type) ? ` = static_cast<${type}>(0)` : '')

/** Property names of a schema: UE style (PascalCase, bools start with b), never a UObject member or Id/PlannerId. */
function fieldNames(s: IrSchema): string[] {
  const base = s.fields.map((f) => {
    const n = identifier(f.words, 'field')
    if (f.type.k === 'bool') return /^b[A-Z]/.test(n) ? n : 'b' + n
    return OBJECT_MEMBERS.has(n) ? 'Display' + n : n
  })
  return uniqueNames(base, ['Id', 'PlannerId', 'SchemaId', 'SchemaVersion'])
}
/** The name Unreal's Python gives a property: snake_case, without a bool's b. */
const pyName = (cpp: string) => snake(words(cpp.replace(/^b(?=[A-Z])/, '')))

const HEADER = (ir: EngineIR) => [
  `// Generated by Game Design Planner (engine IR v${ir.v}, Unreal adapter v${unreal.version}) from “${comment(ir.project.name)}”.`,
  '// Do not edit: the next export replaces this file.',
]

function fieldDoc(s: IrSchema, i: number, ir: EngineIR): string {
  const f = s.fields[i]
  const notes: string[] = [f.optional ? 'Optional.' : 'Required.', `Planner type: ${f.raw.split(':').slice(1).join(':').trim() || '?'}.`]
  const inner = f.type.k === 'list' ? f.type.of : f.type
  if (inner.k === 'localized') notes.push('Localization key.')
  if (inner.k === 'ref' && typeName(inner, ir, s.format) === 'FName') notes.push(`${ir.schemas.find((x) => x.id === inner.schema)?.name ?? '?'} ID (row name).`)
  if (inner.k === 'curve') notes.push('Assign it in the editor; the planner has no curve values.')
  return `/** ${comment(notes.join(' '))} */`
}

/** Engine headers and forward declarations a set of property types needs. */
function needs(types: string[], ir: EngineIR, self: string): { includes: string[]; forward: string[] } {
  const all = types.join(' ')
  const includes = new Set<string>()
  if (/\bE[A-Z]\w*\b/.test(all) && ir.enums.some((e) => all.includes(`E${enumBase(e, ir)}`))) includes.add(`${enumsFileName(ir)}.h`)
  const forward = new Set<string>()
  for (const f of FORWARD) if (new RegExp(`\\b${f}\\b`).test(all)) forward.add(`class ${f};`)
  for (const s of ir.schemas) {
    const t = schemaTypeName(s)
    if (t !== self && new RegExp(`\\b${t}\\b`).test(all)) forward.add(`class ${t};`)
  }
  return { includes: [...includes].sort(), forward: [...forward].sort() }
}

function schemaFile(s: IrSchema, ir: EngineIR): string {
  const native = s.format === 'native'
  const type = schemaTypeName(s)
  const names = fieldNames(s)
  const types = s.fields.map((f) => typeName(f.type, ir, s.format))
  const cat = meta(`Planner|${s.name}`)
  const summary = [`${s.name}.`, s.source ? `Records come from ${s.source}.` : '', s.idPrefix ? `ID prefix “${s.idPrefix}”.` : '', `Schema version ${s.version}.`, native ? 'One asset per record, made by the planner’s editor scripts.' : 'Rows of the DataTable made from DataTables/' + schemaBase(s).replace(/Row$/, '') + '.json.'].filter(Boolean).join(' ')
  const n = needs(types, ir, type)
  const body: string[] = [
    '/** The planner schema this type stands for. */',
    `static constexpr const TCHAR* SchemaId = ${cppString(s.id)};`,
    `static constexpr int32 SchemaVersion = ${s.version};`,
    '',
  ]
  if (native) body.push('/** Stable ID from the planner. Never changes once released. */', `UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = ${meta('Planner')})`, 'FName Id;', '')
  body.push(`UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = ${meta('Planner')}, AdvancedDisplay)`, 'FString PlannerId;')
  s.fields.forEach((_, i) => {
    body.push('', fieldDoc(s, i, ir), `UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = ${cat})`, `${types[i]} ${names[i]}${initOf(types[i])};`)
  })
  return [
    ...HEADER(ir),
    '#pragma once',
    '',
    '#include "CoreMinimal.h"',
    native ? '#include "Engine/DataAsset.h"' : '#include "Engine/DataTable.h"',
    ...n.includes.map((h) => `#include "${h}"`),
    `#include "${schemaBase(s)}.generated.h"`,
    '',
    ...n.forward,
    ...(n.forward.length ? [''] : []),
    `/** ${comment(summary)} */`,
    native ? 'UCLASS(BlueprintType)' : 'USTRUCT(BlueprintType)',
    native ? `class ${API} ${type} : public UPrimaryDataAsset` : `struct ${API} ${type} : public FTableRowBase`,
    '{',
    '\tGENERATED_BODY()',
    '',
    ...(native ? ['public:'] : []),
    ...tabs(body),
    '};',
    '',
  ].join('\n')
}

function enumsFile(ir: EngineIR): string {
  const out: string[] = [...HEADER(ir), '#pragma once', '', '#include "CoreMinimal.h"', `#include "${enumsFileName(ir)}.generated.h"`]
  for (const en of ir.enums) {
    const names = enumMembers(en)
    out.push('', `/** ${comment(en.from === 'catalog' ? `Catalog “${en.name}”.` : `Values of ${en.name} used in the planner.`)} */`, 'UENUM(BlueprintType)', `enum class E${enumBase(en, ir)} : uint8`, '{')
    if (!names.length) out.push('\tNone UMETA(Hidden)')
    en.members.forEach((m, i) => out.push(`\t${names[i]} UMETA(DisplayName = ${meta(m.label)}),`))
    out.push('};')
  }
  return out.join('\n') + '\n'
}

/** Planner IDs → enum values, as plain C++ (kept out of the reflected header). */
function enumIdsFile(ir: EngineIR): string {
  const out: string[] = [...HEADER(ir), '#pragma once', '', '#include "CoreMinimal.h"', `#include "${enumsFileName(ir)}.h"`, '', '/** Planner IDs (as stored in the records) to enum values. */', `namespace ${projectName(ir)}EnumIds`, '{']
  for (const en of ir.enums) {
    const t = `E${enumBase(en, ir)}`
    const names = enumMembers(en)
    out.push(`\tinline const TMap<FString, ${t}>& ${enumBase(en, ir)}()`, '\t{', `\t\tstatic const TMap<FString, ${t}> Ids = {`)
    en.members.forEach((m, i) => out.push(`\t\t\t{ ${cppString(m.id)}, ${t}::${names[i]} },`))
    out.push('\t\t};', '\t\treturn Ids;', '\t}')
  }
  out.push('}')
  return out.join('\n') + '\n'
}

function idsFile(ir: EngineIR): string {
  const out: string[] = [...HEADER(ir), '#pragma once', '', '#include "CoreMinimal.h"', '', '/** Stable record IDs, one constant per record exported from the planner (FName(…) them where Unreal wants a name). */', `namespace ${projectName(ir)}Ids`, '{']
  const groups = uniqueNames(ir.schemas.map((s) => identifier(s.words, 'type')))
  ir.schemas.forEach((s, i) => {
    const recs = ir.records.filter((r) => r.schema === s.id)
    if (!recs.length) return
    const consts = uniqueNames(recs.map((r) => identifier(words(r.name || r.key), 'constant')), [groups[i]])
    out.push(`\tnamespace ${groups[i]}`, '\t{')
    recs.forEach((r, j) => out.push(`\t\tconstexpr const TCHAR* ${consts[j]} = ${cppString(r.key)};`))
    out.push('\t}')
  })
  out.push('}')
  return out.join('\n') + '\n'
}

const PREC: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2 }
const num = (v: number) => (Number.isInteger(v) ? `${v}.f` : `${v}f`)
function cppExpr(n: FormulaNode, params: Map<string, string>): string {
  const prec = (x: FormulaNode) => (x.k === 'bin' && x.op !== '^' ? PREC[x.op] : x.k === 'neg' ? 3 : 4)
  switch (n.k) {
    case 'num':
      return num(n.v)
    case 'var':
      return params.get(n.name) ?? '0.f'
    case 'neg': {
      const a = cppExpr(n.a, params)
      return prec(n.a) < 3 ? `-(${a})` : `-${a}`
    }
    case 'call': {
      const args = n.args.map((a) => cppExpr(a, params))
      switch (n.fn) {
        case 'min':
        case 'max':
          // FMath::Min/Max take two values; more are nested.
          return args.reduce((acc, a) => `FMath::${n.fn === 'min' ? 'Min' : 'Max'}(${acc}, ${a})`)
        case 'round':
          // The planner rounds halves up (2.5 → 3, -2.5 → -2).
          return `FMath::FloorToFloat(${args[0]} + 0.5f)`
        case 'floor':
          return `FMath::FloorToFloat(${args[0]})`
        case 'ceil':
          return `FMath::CeilToFloat(${args[0]})`
        case 'log':
          return `FMath::Loge(${args[0]})`
        default:
          return `FMath::${n.fn.charAt(0).toUpperCase() + n.fn.slice(1)}(${args.join(', ')})`
      }
    }
    case 'bin': {
      if (n.op === '^') return `FMath::Pow(${cppExpr(n.a, params)}, ${cppExpr(n.b, params)})`
      const p = PREC[n.op]
      const l = cppExpr(n.a, params)
      const r = cppExpr(n.b, params)
      const lp = prec(n.a) < p ? `(${l})` : l
      const rp = prec(n.b) < p || (prec(n.b) === p && (n.op === '-' || n.op === '/')) ? `(${r})` : r
      return `${lp} ${n.op} ${rp}`
    }
  }
}

function formulasFile(ir: EngineIR): string {
  const cls = `U${projectName(ir)}Formulas`
  const methods = uniqueNames(ir.formulas.map((f) => identifier(f.words, 'method')))
  const body: string[] = []
  ir.formulas.forEach((f, i) => {
    const pnames = uniqueNames(f.params.map((v) => identifier(words(v), 'param')))
    const params = new Map(f.params.map((v, j) => [v, pnames[j]]))
    const sig = f.params.map((_, j) => `float ${pnames[j]}`).join(', ')
    const sample = Object.keys(f.sample).length ? ` Sample: ${Object.entries(f.sample).map(([k, v]) => `${k} = ${v}`).join(', ')}.` : ''
    if (i) body.push('')
    body.push(`/** ${comment(`${f.name} (${f.where}). Planner: ${f.expr}.${sample}`)} */`, `UFUNCTION(BlueprintPure, Category = ${meta('Planner|Formulas')})`)
    if (f.ast) body.push(`static float ${methods[i]}(${sig}) { return ${cppExpr(f.ast, params)}; }`)
    else body.push(`static float ${methods[i]}(${sig}) { ensureMsgf(false, ${cppString(`Planner formula could not be read: ${f.error}`)}); return 0.f; }`)
  })
  return [
    ...HEADER(ir),
    '#pragma once',
    '',
    '#include "CoreMinimal.h"',
    '#include "Kismet/BlueprintFunctionLibrary.h"',
    `#include "${projectName(ir)}Formulas.generated.h"`,
    '',
    '/** Formulas from the planner, with the planner’s rounding (halves up). */',
    'UCLASS()',
    `class ${API} ${cls} : public UBlueprintFunctionLibrary`,
    '{',
    '\tGENERATED_BODY()',
    '',
    'public:',
    ...tabs(body),
    '};',
    '',
  ].join('\n')
}

// ---- DataTables: rows of JSON and CSV schemas, in the JSON Unreal's DataTable import reads ----

const srgbToLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
const round6 = (n: number) => Math.round(n * 1e6) / 1e6

/** One record value as Unreal's JSON import wants it, or undefined to leave the property at its default. */
function rowValue(v: unknown, t: NeutralType, ir: EngineIR): unknown {
  if (v === null || v === undefined || v === '') return undefined
  switch (t.k) {
    case 'list':
      return Array.isArray(v) ? v.map((x) => rowValue(x, t.of, ir)).filter((x) => x !== undefined) : undefined
    case 'enum': {
      const en = ir.enums.find((e) => e.id === t.enumId)
      const i = en ? en.members.findIndex((m) => m.id === v) : -1
      return en && i >= 0 ? enumMembers(en)[i] : undefined
    }
    case 'color': {
      const m = /^#?([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(String(v))
      if (!m) return undefined
      const ch = (k: number) => parseInt(m[1].slice(k, k + 2), 16) / 255
      return { R: round6(srgbToLinear(ch(0))), G: round6(srgbToLinear(ch(2))), B: round6(srgbToLinear(ch(4))), A: m[2] ? round6(parseInt(m[2], 16) / 255) : 1 }
    }
    case 'vec2':
    case 'vec3': {
      if (!Array.isArray(v)) return undefined
      const keys = t.k === 'vec2' ? ['X', 'Y'] : ['X', 'Y', 'Z']
      return Object.fromEntries(keys.map((k, i) => [k, Number(v[i]) || 0]))
    }
    case 'curve':
      return undefined
    case 'int':
    case 'float':
      return typeof v === 'number' ? v : Number(v)
    case 'bool':
      return typeof v === 'boolean' ? v : String(v).toLowerCase() === 'true'
    default:
      return typeof v === 'string' ? v : JSON.stringify(v)
  }
}

function dataTable(s: IrSchema, recs: IrRecord[], ir: EngineIR): string {
  const names = fieldNames(s)
  const rows = recs.map((r) => {
    const row: Record<string, unknown> = { Name: r.key, PlannerId: r.plannerId }
    s.fields.forEach((f, i) => {
      const v = rowValue(r.values[f.name], f.type, ir)
      if (v !== undefined) row[names[i]] = v
    })
    return row
  })
  return JSON.stringify(rows, null, 2) + '\n'
}

// ---- Classes from the class diagram ----

/** A name as the designer wrote it when it is already an identifier (keeps EnemyAI), else built from its words. */
function keepIdent(name: string, kind: IdentKind): string {
  const n = name.trim()
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(n)) return CPP_KEYWORDS.has(n) ? n + '_' : n.charAt(0).toUpperCase() + n.slice(1)
  return identifier(words(n), kind)
}
/** The class name without its Unreal prefix; an interface's leading I (IDamageable) is the prefix. */
function bareName(c: IrClass): string {
  const n = keepIdent(c.name, 'type')
  return c.kind === 'interface' && /^I[A-Z]/.test(n) ? n.slice(1) : n
}
const PREFIX: Record<ClassKind, string> = { component: 'U', actor: 'A', data: 'U', event: 'U', class: 'U', static: 'U', struct: 'F', enum: 'E', interface: 'I' }
const className = (c: IrClass) => PREFIX[c.kind] + bareName(c)
const baseName = (c: IrClass) => `${PREFIX[c.kind]}${bareName(c)}Base`
/** Kinds written as a generated base plus your class; structs, enums and interfaces are generated whole (a struct’s methods go in your .cpp). */
const hasOwnClass = (c: IrClass) => ['component', 'actor', 'data', 'event', 'class', 'static'].includes(c.kind)
const hasOwnFile = (c: IrClass) => hasOwnClass(c) || (c.kind === 'struct' && c.methods.length > 0)
const ENGINE_BASE: Partial<Record<ClassKind, { cls: string; include: string }>> = {
  component: { cls: 'UActorComponent', include: 'Components/ActorComponent.h' },
  actor: { cls: 'AActor', include: 'GameFramework/Actor.h' },
  data: { cls: 'UPrimaryDataAsset', include: 'Engine/DataAsset.h' },
  event: { cls: 'UDataAsset', include: 'Engine/DataAsset.h' },
  class: { cls: 'UObject', include: 'UObject/Object.h' },
  static: { cls: 'UBlueprintFunctionLibrary', include: 'Kismet/BlueprintFunctionLibrary.h' },
}
const moduleFolder = (c: IrClass) => (c.module ? identifier(c.module.words, 'type') + '/' : '')
/** Where each part lives, relative to the module folder (Source/PlannerGame/). */
const generatedHeader = (c: IrClass) => `Generated/Classes/${hasOwnClass(c) ? bareName(c) + 'Base' : bareName(c)}.h`
const ownHeader = (c: IrClass) => `Classes/${moduleFolder(c)}${bareName(c)}.h`
const ownCpp = (c: IrClass) => `Classes/${moduleFolder(c)}${bareName(c)}.cpp`
/** The header that declares the class other code uses (your header for a class with a base, else the generated one). */
const includeOf = (c: IrClass) => (hasOwnClass(c) ? ownHeader(c) : generatedHeader(c).replace(/^Generated\//, ''))

/** How a property or parameter refers to a diagram class. */
function classRefType(c: IrClass): string {
  if (c.kind === 'struct' || c.kind === 'enum') return className(c)
  if (c.kind === 'interface') return `TScriptInterface<I${bareName(c)}>`
  if (c.kind === 'static') return 'TSubclassOf<UObject>'
  return `TObjectPtr<${className(c)}>`
}

function memberType(t: NeutralType | null, ir: EngineIR): string {
  if (!t) return 'void'
  if (t.k === 'list') return `TArray<${memberType(t.of, ir)}>`
  return typeName(t, ir, 'native')
}
/** Types a UPROPERTY can hold: anything the planner knows, but not an engine type written as is that we cannot check. */
const reflectable = (t: NeutralType | null): boolean => !!t && (t.k === 'list' ? reflectable(t.of) : t.k !== 'engine' || !!ENGINE_TYPE[t.name])

/** A class's methods with the ones of the interfaces it implements, for your class to override. */
function interfaceMethods(c: IrClass, ir: EngineIR): IrMethod[] {
  const out: IrMethod[] = []
  const seen = new Set(c.methods.map((m) => keepIdent(m.name, 'method')))
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

function params(m: IrMethod, ir: EngineIR): string {
  const names = uniqueNames(m.params.map((x) => keepIdent(x.name, 'param')))
  return m.params.map((x, i) => `${memberType(x.type, ir)} ${names[i]}`).join(', ')
}
const ret = (m: IrMethod, ir: EngineIR) => memberType(m.returns, ir)
const methodName = (m: IrMethod) => keepIdent(m.name, 'method')

/** Includes for the diagram classes and generated types a class's members use. */
function classIncludes(c: IrClass, ir: EngineIR, own: string): string[] {
  const types = [...c.fields.map((f) => f.type), ...c.methods.flatMap((m) => [m.returns, ...m.params.map((p) => p.type)])]
  const out = new Set<string>()
  const walk = (t: NeutralType | null) => {
    if (!t) return
    if (t.k === 'list') return walk(t.of)
    if (t.k === 'class') {
      const x = ir.classes.find((y) => y.id === t.classId)
      // Value types need their definition; pointers to classes are forward-declared below.
      if (x && x.id !== c.id && ['struct', 'enum', 'interface'].includes(x.kind)) out.add(includeOf(x))
    }
    if (t.k === 'enum') out.add(`${enumsFileName(ir)}.h`)
  }
  types.forEach(walk)
  out.delete(own)
  return [...out].sort()
}
function classForward(c: IrClass, ir: EngineIR): string[] {
  const all = [...c.fields.map((f) => f.type), ...c.methods.flatMap((m) => [m.returns, ...m.params.map((p) => p.type)])].map((t) => memberType(t, ir)).join(' ')
  const out = new Set<string>()
  for (const x of ir.classes) if (x.id !== c.id && hasOwnClass(x) && new RegExp(`\\b${className(x)}\\b`).test(all)) out.add(`class ${className(x)};`)
  for (const f of FORWARD) if (new RegExp(`\\b${f}\\b`).test(all)) out.add(`class ${f};`)
  for (const s of ir.schemas) if (new RegExp(`\\b${schemaTypeName(s)}\\b`).test(all)) out.add(s.format === 'native' ? `class ${schemaTypeName(s)};` : `struct ${schemaTypeName(s)};`)
  return [...out].sort()
}

function fieldLines(c: IrClass, ir: EngineIR, category: string): string[] {
  const names = uniqueNames(c.fields.map((f) => keepIdent(f.name, 'field')))
  const out: string[] = []
  c.fields.forEach((f, i) => {
    const t = memberType(f.type ?? { k: 'engine', name: 'int32' }, ir)
    const n = f.type?.k === 'bool' && !/^b[A-Z]/.test(names[i]) ? 'b' + names[i] : names[i]
    if (f.isStatic || c.kind === 'static') out.push(`static inline ${t} ${n}${initOf(t) ? initOf(t).replace(' = ', '{ ') + ' }' : '{}'};`)
    else if (!f.type) out.push(`// ${n}: no type in the plan.`)
    else if (!reflectable(f.type)) out.push(`/** Not reflected: “${comment(f.type.k === 'engine' ? f.type.name : '')}” is not a type the planner knows. */`, `${t} ${n}${initOf(t)};`)
    else out.push(`UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = ${category})`, `${t} ${n}${initOf(t)};`)
  })
  return out
}

function classGenerated(ir: EngineIR, c: IrClass): string {
  const bare = bareName(c)
  const own = generatedHeader(c).replace(/^Generated\//, '')
  const head = [...HEADER(ir), '#pragma once', '', '#include "CoreMinimal.h"']
  const doc = c.doc ? [`/** ${comment(c.doc)} */`] : []
  const category = meta(`Planner|${c.name}`)
  if (c.kind === 'enum') {
    const members = uniqueNames(c.fields.map((f) => identifier(words(f.name), 'member')))
    return [...head, `#include "${bare}.generated.h"`, '', ...doc, 'UENUM(BlueprintType)', `enum class ${className(c)} : uint8`, '{', ...(members.length ? members.map((m) => `\t${m},`) : ['\tNone UMETA(Hidden)']), '};', ''].join('\n')
  }
  if (c.kind === 'interface') {
    const parents = [c.base, ...c.implements].map((id) => ir.classes.find((x) => x.id === id)).filter((x): x is IrClass => !!x && x.kind === 'interface')
    // Not “= 0”: Unreal constructs a default object of every class, so a UObject implementing this must not be abstract in C++.
    const lines = c.methods.map((m) => `virtual ${ret(m, ir)} ${methodName(m)}(${params(m, ir)}) PURE_VIRTUAL(I${bare}::${methodName(m)}, ${ret(m, ir) === 'void' ? '' : 'return {};'});`)
    return [
      ...head,
      '#include "UObject/Interface.h"',
      ...parents.map((p) => `#include "${includeOf(p)}"`),
      ...classIncludes(c, ir, own).map((h) => `#include "${h}"`),
      `#include "${bare}.generated.h"`,
      '',
      ...classForward(c, ir),
      '',
      'UINTERFACE(MinimalAPI, meta = (CannotImplementInterfaceInBlueprint))',
      `class U${bare} : public UInterface`,
      '{',
      '\tGENERATED_BODY()',
      '};',
      '',
      ...doc,
      `class ${API} I${bare}${parents.length ? ` : ${parents.map((p) => `public I${bareName(p)}`).join(', ')}` : ''}`,
      '{',
      '\tGENERATED_BODY()',
      '',
      'public:',
      ...tabs(lines),
      '};',
      '',
    ].join('\n')
  }
  if (c.kind === 'struct') {
    const methods = c.methods.map((m) => `${m.isStatic ? 'static ' : ''}${ret(m, ir)} ${methodName(m)}(${params(m, ir)});`)
    return [
      ...head,
      ...classIncludes(c, ir, own).map((h) => `#include "${h}"`),
      `#include "${bare}.generated.h"`,
      '',
      ...classForward(c, ir),
      '',
      ...doc,
      'USTRUCT(BlueprintType)',
      `struct ${API} ${className(c)}`,
      '{',
      '\tGENERATED_BODY()',
      '',
      ...tabs(fieldLines(c, ir, category)),
      ...(methods.length ? ['', `\t// Written in ${ownCpp(c)}.`, ...tabs(methods)] : []),
      '};',
      '',
    ].join('\n')
  }
  // A UCLASS kind: the generated base.
  const base = ir.classes.find((x) => x.id === c.base)
  const parent = base && hasOwnClass(base) ? { cls: className(base), include: ownHeader(base) } : ENGINE_BASE[c.kind]!
  const ifaces = interfacesOf(c, ir)
  const body: string[] = []
  if (c.kind === 'event') {
    const names = uniqueNames(c.fields.map((f) => keepIdent(f.name, 'param')))
    const types = c.fields.map((f) => memberType(f.type ?? { k: 'engine', name: 'int32' }, ir))
    body.push('/** Broadcast with the payload; bind in BeginPlay. */', 'UPROPERTY(BlueprintAssignable, Category = "Planner")', `F${bare}Raised OnRaised;`, '', `UFUNCTION(BlueprintCallable, Category = ${category})`, `void Raise(${types.map((t, i) => `${t} ${names[i]}`).join(', ')}) { OnRaised.Broadcast(${names.join(', ')}); }`)
  } else body.push(...fieldLines(c, ir, category))
  const virtuals = c.kind === 'static' ? [] : c.methods.filter((m) => !m.isStatic)
  if (virtuals.length) {
    if (body.length) body.push('')
    body.push(`// Written in your ${className(c)} (${ownCpp(c)}).`)
    for (const m of virtuals) body.push(`virtual ${ret(m, ir)} ${methodName(m)}(${params(m, ir)}) PURE_VIRTUAL(${baseName(c)}::${methodName(m)}, ${ret(m, ir) === 'void' ? '' : 'return {};'});`)
  }
  const required = c.requires.map((r) => ir.classes.find((x) => x.id === r)).filter((x): x is IrClass => !!x)
  const delegate: string[] = []
  if (c.kind === 'event') {
    const n = c.fields.length
    const word = ['', 'OneParam', 'TwoParams', 'ThreeParams', 'FourParams', 'FiveParams', 'SixParams', 'SevenParams', 'EightParams', 'NineParams'][Math.min(n, 9)]
    const names = uniqueNames(c.fields.map((f) => keepIdent(f.name, 'param')))
    const args = c.fields.slice(0, 9).map((f, i) => `${memberType(f.type ?? { k: 'engine', name: 'int32' }, ir)}, ${names[i]}`)
    delegate.push(`DECLARE_DYNAMIC_MULTICAST_DELEGATE${word ? '_' + word : ''}(F${bare}Raised${args.length ? ', ' + args.join(', ') : ''});`, '')
  }
  return [
    ...head,
    `#include "${parent.include}"`,
    ...ifaces.map((i) => `#include "${includeOf(i)}"`),
    ...classIncludes(c, ir, own).map((h) => `#include "${h}"`),
    `#include "${bare}Base.generated.h"`,
    '',
    ...classForward(c, ir),
    '',
    ...delegate,
    `/** Generated part of ${comment(c.name)}${c.doc ? `: ${comment(c.doc)}` : '.'} Your code: ${className(c)} in ${ownHeader(c)} and .cpp.${required.length ? ` Needs ${required.map(className).join(', ')} next to it.` : ''} */`,
    `UCLASS(Abstract, BlueprintType)`,
    `class ${API} ${baseName(c)} : public ${parent.cls}${ifaces.map((i) => `, public I${bareName(i)}`).join('')}`,
    '{',
    '\tGENERATED_BODY()',
    '',
    'public:',
    ...tabs(body),
    '};',
    '',
  ].join('\n')
}

function ownFiles(ir: EngineIR, c: IrClass): EmittedFile[] {
  const name = className(c)
  const cppPath = `${SRC}${ownCpp(c)}`
  const todo = (m: IrMethod) => (ret(m, ir) === 'void' ? '\t// TODO' : '\treturn {}; // TODO')
  if (c.kind === 'struct') {
    const defs = c.methods.flatMap((m) => [`${ret(m, ir)} ${name}::${methodName(m)}(${params(m, ir)})`, '{', todo(m), '}', ''])
    return [{ path: cppPath, content: [`// Your code for ${comment(c.name)}. The planner export created this file once and never overwrites it.`, `#include "${includeOf(c)}"`, '', ...defs].join('\n') }]
  }
  const own = [...(c.kind === 'static' ? c.methods : c.methods.filter((m) => !m.isStatic)), ...interfaceMethods(c, ir)]
  const statics = c.kind === 'static' ? [] : c.methods.filter((m) => m.isStatic)
  const decl = [
    ...own.map((m) => `${c.kind === 'static' ? 'static ' : 'virtual '}${ret(m, ir)} ${methodName(m)}(${params(m, ir)})${c.kind === 'static' ? '' : ' override'};`),
    ...statics.map((m) => `static ${ret(m, ir)} ${methodName(m)}(${params(m, ir)});`),
  ]
  const uclass = c.kind === 'component' ? 'UCLASS(ClassGroup = (Planner), meta = (BlueprintSpawnableComponent))' : c.kind === 'static' ? 'UCLASS()' : 'UCLASS(Blueprintable, BlueprintType)'
  const header = [
    `// Your code for ${comment(c.name)}. The planner export created this file once and never overwrites it.`,
    `// The properties and the methods to write are in ${generatedHeader(c)} (${baseName(c)}, replaced on every export).`,
    '#pragma once',
    '',
    '#include "CoreMinimal.h"',
    `#include "${generatedHeader(c).replace(/^Generated\//, '')}"`,
    `#include "${bareName(c)}.generated.h"`,
    '',
    uclass,
    `class ${API} ${name} : public ${baseName(c)}`,
    '{',
    '\tGENERATED_BODY()',
    ...(decl.length ? ['', 'public:', ...tabs(decl)] : []),
    '};',
    '',
  ].join('\n')
  const cpp = [`// Your code for ${comment(c.name)}.`, `#include "${ownHeader(c)}"`, '', ...[...own, ...statics].flatMap((m) => [`${ret(m, ir)} ${name}::${methodName(m)}(${params(m, ir)})`, '{', todo(m), '}', ''])].join('\n')
  return [
    { path: `${SRC}${ownHeader(c)}`, content: header },
    { path: cppPath, content: cpp },
  ]
}

function classFiles(ir: EngineIR): EmittedFile[] {
  const files = ir.classes.flatMap((c) => [{ path: `${SRC}${generatedHeader(c)}`, content: classGenerated(ir, c) }, ...(hasOwnFile(c) ? ownFiles(ir, c) : [])])
  const index = ir.classes.map((c) => {
    const own = c.kind === 'static' ? c.methods : c.kind === 'struct' ? c.methods : [...c.methods.filter((m) => !m.isStatic), ...interfaceMethods(c, ir), ...c.methods.filter((m) => m.isStatic)]
    return {
      plannerId: c.id,
      name: c.name,
      kind: c.kind,
      cppName: className(c),
      generated: `Unreal/${SRC}${generatedHeader(c)}`,
      own: hasOwnFile(c) ? `Unreal/${SRC}${ownCpp(c)}` : null,
      ownFiles: hasOwnClass(c) ? [`Unreal/${SRC}${ownHeader(c)}`, `Unreal/${SRC}${ownCpp(c)}`] : hasOwnFile(c) ? [`Unreal/${SRC}${ownCpp(c)}`] : [],
      tokens: [ownHeader(c), generatedHeader(c).replace(/^Generated\//, ''), className(c), baseName(c), bareName(c), `${bareName(c)}Base`],
      methods: hasOwnFile(c) ? own.map((m) => `${className(c)}::${methodName(m)}(`) : [],
    }
  })
  return ir.classes.length ? [...files, { path: 'Meta/classes.json', content: JSON.stringify(index, null, 2) + '\n' }] : files
}

// ---- What the editor scripts need: types, property names (C++ and Python), enum members ----

function plannerTypes(ir: EngineIR): string {
  const neutral = (t: NeutralType, s: IrSchema): unknown => {
    if (t.k === 'list') return { k: 'list', of: neutral(t.of, s) }
    if (t.k === 'enum') {
      const en = ir.enums.find((e) => e.id === t.enumId)
      return { k: 'enum', enum: en ? enumBase(en, ir) : null }
    }
    if (t.k === 'ref') return { k: 'ref', schema: t.schema, asAsset: typeName(t, ir, s.format) !== 'FName' }
    return t
  }
  const schemas = Object.fromEntries(
    ir.schemas.map((s) => {
      const names = fieldNames(s)
      return [
        s.id,
        {
          name: s.name,
          format: s.format,
          cppType: schemaTypeName(s),
          // Unreal's path for the class or struct: the type's name without its U/F prefix.
          path: `/Script/${UE_MODULE}.${schemaBase(s)}`,
          folder: identifier(s.words, 'type'),
          ...(s.format !== 'native' && { dataTable: `Unreal/DataTables/${identifier(s.words, 'type')}.json` }),
          fields: Object.fromEntries(s.fields.map((f, i) => [f.name, { prop: names[i], py: pyName(names[i]), optional: f.optional, type: neutral(f.type, s) }])),
        },
      ]
    }),
  )
  const enums = Object.fromEntries(ir.enums.map((en) => [enumBase(en, ir), { py: enumBase(en, ir), members: Object.fromEntries(en.members.map((m, i) => [m.id, snake(words(enumMembers(en)[i])).toUpperCase()])) }]))
  const channels = ir.channels.filter((c) => c.kind === 'asset').map((c) => ({ id: c.id, name: c.name, path: `/Script/${UE_MODULE}.${identifier(c.words, 'type')}Channel` }))
  return JSON.stringify({ format: 'hoh-unreal-types', v: 1, module: UE_MODULE, schemas, enums, channels, input: inputPlan(ir), ...(audioPlan(ir, names(ir), UE_MODULE) && { audio: audioPlan(ir, names(ir), UE_MODULE) }) }, null, 2) + '\n'
}

// ---- Plugin, module and project files ----

function uplugin(ir: EngineIR): string {
  return (
    JSON.stringify(
      {
        FileVersion: 3,
        Version: 1,
        VersionName: '1.0',
        FriendlyName: `${ir.project.name || 'Game'} — planner data`,
        Description: 'Generated by Game Design Planner: data types, enums, IDs, formulas and the classes of the class diagram. Do not edit; export the plan again.',
        Category: 'Game Design Planner',
        CreatedBy: 'Game Design Planner',
        CanContainContent: false,
        Modules: [{ Name: UE_MODULE, Type: 'Runtime', LoadingPhase: 'Default' }],
      },
      null,
      '\t',
    ) + '\n'
  )
}

const BUILD_CS = `// Your module rules: the planner export created this file once and never overwrites it. Add dependencies here.
using System.IO;
using System.Linq;
using UnrealBuildTool;

public class ${UE_MODULE} : ModuleRules
{
	public ${UE_MODULE}(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;
		// Generated headers are included by name ("ItemDefinition.h"), your classes by their path ("Classes/…").
		PublicIncludePaths.Add(ModuleDirectory);
		PublicIncludePaths.Add(Path.Combine(ModuleDirectory, "Generated"));
		PublicDependencyModuleNames.AddRange(new string[] { "Core", "CoreUObject", "Engine", "Json" });
		// The modules the generated code needs as the plan grows (e.g. UMG for the planned screens), one per line.
		string Generated = Path.Combine(ModuleDirectory, "Generated", "Dependencies.txt");
		if (File.Exists(Generated))
		{
			PublicDependencyModuleNames.AddRange(File.ReadAllLines(Generated).Select(Line => Line.Trim()).Where(Line => Line.Length > 0 && !Line.StartsWith("#")));
		}
	}
}
`
const METRICS_H = `#pragma once

#include "CoreMinimal.h"
#include "Kismet/BlueprintFunctionLibrary.h"
#include "PlannerMetrics.generated.h"

/**
 * Playtest measurements for the planner's Balance plan: UPlannerMetrics::Record(TEXT("combat.ttk.greenhollow_brute"), Seconds),
 * or the Blueprint node Record (Planner|Metrics), with the key a Balance plan metric names. Samples add up across sessions
 * in Saved/hoh-planner-metrics.json, and the planner's editor scripts put them into the report.
 */
UCLASS()
class ${API} UPlannerMetrics : public UBlueprintFunctionLibrary
{
	GENERATED_BODY()

public:
	UFUNCTION(BlueprintCallable, Category = "Planner|Metrics")
	static void Record(const FString& Key, float Value);

	static FString FilePath();
};
`

const METRICS_CPP = `#include "PlannerMetrics.h"
#include "Dom/JsonObject.h"
#include "Misc/App.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "Serialization/JsonWriter.h"

FString UPlannerMetrics::FilePath()
{
	return FPaths::Combine(FPaths::ProjectSavedDir(), TEXT("hoh-planner-metrics.json"));
}

void UPlannerMetrics::Record(const FString& Key, float Value)
{
	if (Key.IsEmpty() || !FMath::IsFinite(Value))
	{
		return;
	}
	TSharedPtr<FJsonObject> Root;
	FString Text;
	if (FFileHelper::LoadFileToString(Text, *FilePath()))
	{
		FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Text), Root);
	}
	if (!Root.IsValid())
	{
		Root = MakeShared<FJsonObject>();
	}
	const TArray<TSharedPtr<FJsonValue>>* Existing = nullptr;
	TArray<TSharedPtr<FJsonValue>> Metrics;
	if (Root->TryGetArrayField(TEXT("metrics"), Existing))
	{
		Metrics = *Existing;
	}
	TSharedPtr<FJsonObject> Entry;
	for (const TSharedPtr<FJsonValue>& Item : Metrics)
	{
		const TSharedPtr<FJsonObject>* Object = nullptr;
		FString ItemKey;
		if (Item.IsValid() && Item->TryGetObject(Object) && (*Object)->TryGetStringField(TEXT("key"), ItemKey) && ItemKey == Key)
		{
			Entry = *Object;
			break;
		}
	}
	if (!Entry.IsValid())
	{
		Entry = MakeShared<FJsonObject>();
		Entry->SetStringField(TEXT("key"), Key);
		Entry->SetNumberField(TEXT("samples"), 0);
		Entry->SetNumberField(TEXT("sum"), 0);
		Entry->SetNumberField(TEXT("min"), Value);
		Entry->SetNumberField(TEXT("max"), Value);
		Metrics.Add(MakeShared<FJsonValueObject>(Entry));
	}
	Entry->SetNumberField(TEXT("samples"), Entry->GetNumberField(TEXT("samples")) + 1);
	Entry->SetNumberField(TEXT("sum"), Entry->GetNumberField(TEXT("sum")) + Value);
	Entry->SetNumberField(TEXT("min"), FMath::Min(Entry->GetNumberField(TEXT("min")), static_cast<double>(Value)));
	Entry->SetNumberField(TEXT("max"), FMath::Max(Entry->GetNumberField(TEXT("max")), static_cast<double>(Value)));
	Entry->SetStringField(TEXT("build"), FApp::GetBuildVersion());
	Entry->SetStringField(TEXT("lastAt"), FDateTime::UtcNow().ToIso8601());
	Root->SetArrayField(TEXT("metrics"), Metrics);
	FString Out;
	FJsonSerializer::Serialize(Root.ToSharedRef(), TJsonWriterFactory<>::Create(&Out));
	FFileHelper::SaveStringToFile(Out, *FilePath());
}
`

const MODULE_CPP = `// The module of the planner's generated code and your classes. Created once by the planner export.
#include "Modules/ModuleManager.h"

IMPLEMENT_MODULE(FDefaultModuleImpl, ${UE_MODULE});
`

export function unrealEditorconfig(setup: IrSetup): string {
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
    '[*.{h,cpp,cs}]',
    // Unreal's coding standard indents with tabs; a plan that says spaces wins.
    `indent_style = ${s.indent === 'spaces' ? 'space' : 'tab'}`,
    `indent_size = ${s.indentSize ?? 4}`,
    ...(s.lineLength ? [`max_line_length = ${s.lineLength}`] : []),
    '',
    '[*.{json,uplugin,uproject,ini}]',
    'indent_style = tab',
    '',
  ].join('\n')
}

const UNREAL_IGNORE = ['Binaries/', 'Intermediate/', 'Saved/', 'DerivedDataCache/', 'Build/', '.vs/', '.idea/', '.vscode/', '*.sln', '*.suo', '*.opensdf', '*.sdf', '*.VC.db', '*.VC.opendb', 'Plugins/**/Binaries/', 'Plugins/**/Intermediate/', '.DS_Store', 'Thumbs.db']

export function unrealGitignore(setup: IrSetup): string {
  const extra = setup.ignore.filter((x) => !UNREAL_IGNORE.includes(x))
  return ['# Generated by Game Design Planner: Unreal Engine defaults plus the planned highlights.', ...UNREAL_IGNORE, ...(extra.length ? ['', '# From the plan', ...extra] : [])].join('\n') + '\n'
}

export function unrealGitattributes(setup: IrSetup): string {
  const lfs = [...new Set(['*.uasset', '*.umap', ...setup.lfs])]
  return ['# Generated by Game Design Planner from Coding Standards: Unreal assets and the planned Git LFS patterns.', '* text=auto', '', '# Git LFS', ...lfs.map((p) => `${p} filter=lfs diff=lfs merge=lfs -text lockable`)].join('\n') + '\n'
}

/** Planned folders as /Game paths (the plan writes them under Assets/, the Unity way). */
export function unrealFolders(setup: IrSetup): { path: string; purpose?: string }[] {
  const seen = new Set<string>()
  return setup.folders
    .map((f) => ({ path: '/Game/' + f.path.replace(/^Assets\/?/, ''), ...(f.purpose && { purpose: f.purpose }) }))
    .filter((f) => f.path !== '/Game/' && !/\/Scripts(\/|$)/.test(f.path) && !seen.has(f.path) && !!seen.add(f.path))
}

function setupFiles(ir: EngineIR): EmittedFile[] {
  return [
    { path: 'ProjectFiles/.editorconfig', content: unrealEditorconfig(ir.setup) },
    { path: 'ProjectFiles/.gitattributes', content: unrealGitattributes(ir.setup) },
    { path: 'ProjectFiles/.gitignore', content: unrealGitignore(ir.setup) },
    { path: 'ProjectFiles/setup.json', content: JSON.stringify({ folders: unrealFolders(ir.setup) }, null, 2) + '\n' },
  ]
}

/** The architecture guard's plan: each module's class folder, and the header files of its classes. */
export const unrealArchitecture = (ir: EngineIR) =>
  architecturePlan(
    ir,
    'include',
    (_id, ws) => [`${SRC}Classes/${identifier(ws, 'type')}/`],
    (c) => [...new Set([generatedHeader(c), ...(hasOwnClass(c) ? [ownHeader(c)] : [])].map((h) => h.split('/').pop()!))],
  )

function names(ir: EngineIR): UnrealNames {
  return { api: API, gen: GEN, project: projectName(ir), schemaType: schemaTypeName, identifier: (ws) => identifier(ws, 'type'), cppString, meta }
}

export const unreal: EngineAdapter = {
  id: 'unreal',
  label: 'Unreal Engine',
  language: 'C++',
  version: 4,
  root: 'Unreal',
  // The whole module folder is yours (Build.cs, module file, your classes) except Generated/, which the export owns.
  ownDir: SRC,
  generatedDirs: [GEN, 'DataTables/', 'Meta/', 'ProjectFiles/'],
  classIndex: 'Meta/classes.json',
  reservedWords: CPP_KEYWORDS,
  typeName,
  identifier,
  emit(ir): EmittedFile[] {
    return [
      { path: `${UE_MODULE}.uplugin`, content: uplugin(ir) },
      { path: `${SRC}${UE_MODULE}.Build.cs`, content: BUILD_CS },
      { path: `${SRC}${UE_MODULE}.cpp`, content: MODULE_CPP },
      ...ir.schemas.map((s) => ({ path: `${GEN}${schemaBase(s)}.h`, content: schemaFile(s, ir) })),
      { path: `${GEN}${enumsFileName(ir)}.h`, content: enumsFile(ir) },
      { path: `${GEN}${projectName(ir)}EnumIds.h`, content: enumIdsFile(ir) },
      { path: `${GEN}${projectName(ir)}Ids.h`, content: idsFile(ir) },
      { path: `${GEN}${projectName(ir)}Formulas.h`, content: formulasFile(ir) },
      { path: `${GEN}PlannerMetrics.h`, content: [...HEADER(ir), METRICS_H].join('\n') },
      { path: `${GEN}PlannerMetrics.cpp`, content: [...HEADER(ir), METRICS_CPP].join('\n') },
      ...channelFiles(ir, names(ir)),
      ...telemetryFiles(ir, names(ir)),
      ...consoleFiles(ir, names(ir)),
      ...scaffoldInput(ir, names(ir)),
      ...screenFiles(ir, names(ir)),
      ...stateMachineFiles(ir, names(ir)),
      ...budgetFiles(ir, names(ir)),
      ...audioFiles(ir, names(ir)),
      ...architectureFile(unrealArchitecture(ir)),
      { path: `${GEN}Dependencies.txt`, content: ['# Engine modules the generated code needs beyond Core, CoreUObject, Engine and Json; PlannerGame.Build.cs reads this file.', ...extraModules(ir)].join('\n') + '\n' },
      ...classFiles(ir),
      ...ir.schemas.filter((s) => s.format !== 'native').map((s) => ({ path: `DataTables/${identifier(s.words, 'type')}.json`, content: dataTable(s, ir.records.filter((r) => r.schema === s.id), ir) })),
      { path: 'Meta/planner-types.json', content: plannerTypes(ir) },
      ...setupFiles(ir),
    ]
  },
  checks(ir): EngineIssue[] {
    const out: EngineIssue[] = []
    const types = new Map<string, string>()
    const headers = new Map<string, string>()
    const claim = (bare: string, header: string, what: string) => {
      // Unreal's reflection ignores the U/A/F prefix, so the name clashes whatever the kind: it does not compile.
      if (UE_TYPES.has(bare)) out.push({ level: 'error', code: 'unreal.typeName', message: `${what}: ${bare} is an Unreal type name and would not compile; rename it in the plan (e.g. Cinder${bare}).` })
      else if (types.has(bare)) out.push({ level: 'error', code: 'unreal.duplicate', message: `${what} and ${types.get(bare)} are both called ${bare} in C++ (Unreal ignores the U/A/F prefix); rename one in the plan.` })
      else types.set(bare, what)
      if (headers.has(header)) out.push({ level: 'error', code: 'unreal.header', message: `${what} and ${headers.get(header)} both need ${header}; rename one in the plan.` })
      else headers.set(header, what)
    }
    for (const s of ir.schemas) {
      claim(schemaBase(s), `${schemaBase(s)}.h`, `Schema ${s.name}`)
      const names = fieldNames(s)
      s.fields.forEach((f, i) => {
        const plain = identifier(f.words, 'field')
        if (names[i] !== plain && !(f.type.k === 'bool' && names[i] === 'b' + plain)) out.push({ level: 'info', code: 'unreal.renamed', schema: s.id, field: f.name, message: `${s.name}.${f.name}: named ${names[i]} in C++, because ${OBJECT_MEMBERS.has(plain) ? 'every UObject already has that member' : 'the name is taken'}.` })
        const inner = f.type.k === 'list' ? f.type.of : f.type
        if (s.format !== 'native' && inner.k === 'asset') out.push({ level: 'info', code: 'unreal.assetPath', schema: s.id, field: f.name, message: `${s.name}.${f.name}: a soft reference in the DataTable; the planner value must be an Unreal path (/Game/…) to be set.` })
      })
    }
    const extras = [`${projectName(ir)}Telemetry`, 'PlannerGameEvents', 'PlannerConsole', 'PlannerInput', 'PlannerScreens', 'PlannerStateMachine', ...(ir.budgets.length ? ['PlannerBudgets'] : []), ...(ir.audio.events.length ? ['PlannerAudioEvent'] : []), ...ir.stateMachines.map((m) => `${identifier(m.words, 'type')}States`), ...ir.channels.filter((c) => c.kind === 'asset').map((c) => `${identifier(c.words, 'type')}Channel`)]
    for (const n of [`${projectName(ir)}Enums`, `${projectName(ir)}Formulas`, 'PlannerMetrics', ...extras]) claim(n, `${n}.h`, `The generated ${n}`)
    for (const en of ir.enums) if (enumBase(en, ir) !== identifier(en.words, 'type')) out.push({ level: 'info', code: 'unreal.typeName', message: `Enum ${en.name}: called E${enumBase(en, ir)} so it does not clash with Unreal's ${identifier(en.words, 'type')}.` })
    for (const c of ir.classes) {
      claim(bareName(c), hasOwnClass(c) ? `${bareName(c)}.h` : generatedHeader(c).split('/').pop()!, `Class ${c.name}`)
      if (hasOwnClass(c)) claim(bareName(c) + 'Base', `${bareName(c)}Base.h`, `The generated base of ${c.name}`)
      if (c.kind === 'event' && c.fields.length > 9) out.push({ level: 'warning', code: 'unreal.eventParams', message: `Event ${c.name}: Unreal delegates take at most 9 parameters; the first 9 are used.` })
      const unknown = [...c.fields.map((f) => f.type), ...c.methods.flatMap((m) => [m.returns, ...m.params.map((p) => p.type)])].filter((t) => t && !reflectable(t))
      if (unknown.length) out.push({ level: 'info', code: 'unreal.engineType', message: `Class ${c.name}: ${[...new Set(unknown.map((t) => (t!.k === 'list' ? 'a list of an engine type' : t!.k === 'engine' ? t!.name : '')))].join(', ')} written as is; make sure Unreal knows that type (it is not a UPROPERTY).` })
    }
    return out
  },
}
