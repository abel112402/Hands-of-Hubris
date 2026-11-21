import type { Entity, Project } from '../model/types'
import { words } from '../coding'
import { formulaVars, parseFormula, type FormulaNode } from './formulaAst'
import { FUNCS } from '../formula'
import type { EngineIssue, IrRecord, IrSchema } from './ir'

/**
 * The parts of the Engine IR (v4) that drive the integration ideas of plans/UNITY_INTEGRATION_PLAN.md § 7:
 * data checks from the Balance plan (I6: tests in the engine), cheat commands from the content (I5: debug console)
 * and the art palette (I2: placeholder assets).
 */

export const BALANCE_DOC = 'qa.balance'

/** A Balance plan data check: an expression over one schema's numeric fields that every record must keep in range. */
export type IrCheck = {
  id: string
  name: string
  words: string[]
  schema: string
  expr: string
  /** Schema field names the expression uses, all numeric. */
  params: string[]
  ast?: FormulaNode
  min?: number
  max?: number
  level: 'error' | 'warning'
  /** Why the check cannot run (bad expression, unknown or non-numeric field); the check is then left out of engine tests. */
  error?: string
}

export type IrCheatArg = { name: string; kind: 'id' | 'int' | 'time'; optional?: boolean; values?: { id: string; label: string }[] }
/** One debug-console command, e.g. give <item> [count]. */
export type IrCheat = { command: string; words: string[]; help: string; args: IrCheatArg[] }

export type IrArt = { palette: string[] }

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const list = (p: Project, doc: string, section: string): Entity[] => {
  const v = p.documents[doc]?.data[section]
  return Array.isArray(v) ? (v as Entity[]) : []
}
const slug = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')

export function buildChecks(p: Project, schemas: IrSchema[], issues: EngineIssue[]): IrCheck[] {
  const out: IrCheck[] = []
  for (const c of list(p, BALANCE_DOC, 'checks')) {
    const name = str(c.name) || 'Data check'
    const expr = str(c.expr)
    const schema = schemas.find((s) => s.id === c.schema)
    const base = { id: String(c.id), name, words: words(name), schema: schema?.id ?? '', expr, params: [] as string[], ...(isNum(c.min) && { min: c.min }), ...(isNum(c.max) && { max: c.max }), level: c.severity === 'Warning' ? ('warning' as const) : ('error' as const) }
    const fail = (error: string) => {
      out.push({ ...base, error })
      issues.push({ level: 'warning', code: 'check.invalid', message: `Data check “${name}”: ${error}; it is not exported as an engine test.` })
    }
    if (!schema) {
      fail('no data schema chosen')
      continue
    }
    if (!expr) {
      fail('no expression')
      continue
    }
    if (base.min === undefined && base.max === undefined) {
      fail('no range (Acceptable from / to)')
      continue
    }
    let ast: FormulaNode
    try {
      ast = parseFormula(expr)
    } catch (e) {
      fail((e as Error).message)
      continue
    }
    const params = formulaVars(ast)
    const bad = params.filter((v) => {
      const f = schema.fields.find((x) => x.name === v)
      return !f || (f.type.k !== 'int' && f.type.k !== 'float')
    })
    if (bad.length) {
      fail(`${bad.map((b) => `“${b}”`).join(', ')} ${bad.length === 1 ? 'is not a number field' : 'are not number fields'} of ${schema.name}`)
      continue
    }
    out.push({ ...base, params, ast })
  }
  return out
}

/** The console's commands, from the content the plan has. A command whose list is empty is left out. */
export function buildCheats(p: Project, records: IrRecord[]): IrCheat[] {
  const keyOf = new Map(records.map((r) => [r.plannerId, r.key]))
  const values = (items: Entity[], id: (e: Entity) => string = (e) => keyOf.get(String(e.id)) ?? slug(str(e.name))) => {
    const seen = new Set<string>()
    return items
      .map((e) => ({ id: id(e), label: str(e.name) }))
      .filter((v) => v.id && !seen.has(v.id) && !!seen.add(v.id))
  }
  const cheats: IrCheat[] = []
  const add = (command: string, help: string, args: IrCheatArg[]) => {
    if (args.some((a) => a.kind === 'id' && !a.values?.length)) return
    cheats.push({ command, words: words(command.replace(/\./g, ' ')), help, args })
  }
  add('give', 'Adds items to the player’s inventory.', [{ name: 'item', kind: 'id', values: values(list(p, 'design.items', 'items')) }, { name: 'count', kind: 'int', optional: true }])
  const quests = values(list(p, 'design.story', 'quests'))
  add('quest.start', 'Starts a quest, skipping its requirements.', [{ name: 'quest', kind: 'id', values: quests }])
  add('quest.complete', 'Completes a quest and gives its rewards.', [{ name: 'quest', kind: 'id', values: quests }])
  add('time.set', 'Sets the time of day (HH:MM).', [{ name: 'time', kind: 'time' }])
  add('season.set', 'Switches to a season.', [{ name: 'season', kind: 'id', values: values(list(p, 'design.timeWeather', 'seasons')) }])
  add('weather.set', 'Switches the weather.', [{ name: 'weather', kind: 'id', values: values(list(p, 'design.timeWeather', 'weather')) }])
  add('faction.rep', 'Sets the reputation with a faction.', [{ name: 'faction', kind: 'id', values: values(list(p, 'design.factions', 'factions')) }, { name: 'value', kind: 'int' }])
  add('difficulty.set', 'Switches the difficulty preset.', [{ name: 'preset', kind: 'id', values: values(list(p, 'design.difficulty', 'presets'), (e) => str(e.level) || slug(str(e.name))) }])
  return cheats
}

/** The palette placeholders are coloured from: the global palette of Art Direction first, then the others. */
export function buildArt(p: Project): IrArt {
  const palettes = list(p, 'artAudio.art', 'palettes')
  const ordered = [...palettes.filter((x) => x.scope === 'Global'), ...palettes.filter((x) => x.scope !== 'Global')]
  const colors: string[] = []
  for (const pal of ordered) {
    for (const k of Object.keys(pal).filter((k) => /^c\d+$/.test(k)).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)))) {
      const c = str(pal[k])
      if (/^#[0-9a-f]{6}$/i.test(c) && !colors.includes(c.toLowerCase())) colors.push(c.toLowerCase())
    }
  }
  return { palette: colors }
}

/** Evaluates a check's expression for one record; undefined when a value is missing. */
export function checkValue(c: IrCheck, values: Record<string, unknown>): number | undefined {
  if (!c.ast) return undefined
  const vars: Record<string, number> = {}
  for (const v of c.params) {
    const x = values[v]
    if (!isNum(x)) return undefined
    vars[v] = x
  }
  return evalAst(c.ast, vars)
}

function evalAst(n: FormulaNode, vars: Record<string, number>): number {
  switch (n.k) {
    case 'num':
      return n.v
    case 'var':
      return vars[n.name] ?? 0
    case 'neg':
      return -evalAst(n.a, vars)
    case 'call':
      return FUNCS[n.fn](...n.args.map((a) => evalAst(a, vars)))
    case 'bin': {
      const a = evalAst(n.a, vars)
      const b = evalAst(n.b, vars)
      return n.op === '+' ? a + b : n.op === '-' ? a - b : n.op === '*' ? a * b : n.op === '/' ? a / b : Math.pow(a, b)
    }
  }
}

export const inRange = (c: Pick<IrCheck, 'min' | 'max'>, v: number) => Number.isFinite(v) && (c.min === undefined || v >= c.min) && (c.max === undefined || v <= c.max)

export type CheckResult = { check: IrCheck; checked: number; skipped: number; outside: { key: string; name: string; value: number }[] }

/** Every check run on the plan's own records (the engine tests run the same checks on the engine's assets). */
export function runChecks(checks: IrCheck[], records: IrRecord[]): CheckResult[] {
  return checks
    .filter((c) => !c.error)
    .map((c) => {
      const result: CheckResult = { check: c, checked: 0, skipped: 0, outside: [] }
      for (const r of records.filter((x) => x.schema === c.schema)) {
        const v = checkValue(c, r.values)
        if (v === undefined) {
          result.skipped++
          continue
        }
        result.checked++
        if (!inRange(c, v)) result.outside.push({ key: r.key, name: r.name, value: v })
      }
      return result
    })
}

// ---- I3: communication channels (Architecture) and I11: telemetry events (Balance plan) ----

/** A value a channel or a telemetry event carries: the planner's simple types and references to records. */
export type IrParam = { name: string; words: string[]; type: { k: 'string' | 'int' | 'float' | 'bool' } | { k: 'ref'; schema: string } }
export type IrChannel = {
  id: string
  name: string
  words: string[]
  /** bus: a static C# event; asset: a ScriptableObject channel; other kinds (direct call, DI service, queue) are documented only. */
  kind: 'bus' | 'asset' | 'other'
  kindLabel: string
  publishers: string[]
  subscribers: string[]
  frequency: string
  payload: IrParam[]
}
export type IrTelemetry = { id: string; name: string; key: string; words: string[]; params: IrParam[]; notes: string }

const NAME_INT = /(count|number|num|tick|slot|index|level|amount|qty|quantity)$/i
const NAME_FLOAT = /(value|seconds|secs|time|duration|hp|health|damage|distance|speed|ratio|percent|pct)$/i

/**
 * “NpcId, NeedId, value” or “enemy: Enemy, seconds: float”: each part a name with an optional type. Without a type the
 * name decides (…Id → text, count/tick/slot → whole number, value/seconds → number, else text). A type naming a data
 * schema is a reference to its records.
 */
export function parseParams(text: string, schemas: IrSchema[]): { params: IrParam[]; problems: string[] } {
  const params: IrParam[] = []
  const problems: string[] = []
  const used = new Set<string>()
  for (const raw of text.split(/[,;]/).map((s) => s.trim()).filter(Boolean)) {
    const [n, t] = raw.split(':').map((s) => s.trim())
    const ws = words(n)
    if (!ws.length) {
      problems.push(`“${raw}” has no name`)
      continue
    }
    const key = ws.join(' ')
    if (used.has(key)) {
      problems.push(`“${n}” is named twice`)
      continue
    }
    used.add(key)
    const tl = (t ?? '').toLowerCase()
    const schema = t ? schemas.find((s) => s.name.toLowerCase() === tl || s.words.join('') === tl.replace(/[^a-z0-9]/g, '')) : undefined
    let type: IrParam['type']
    if (schema) type = { k: 'ref', schema: schema.id }
    else if (/^(int|integer|long|whole)$/.test(tl)) type = { k: 'int' }
    else if (/^(float|double|number|decimal|real)$/.test(tl)) type = { k: 'float' }
    else if (/^(bool|boolean|flag)$/.test(tl)) type = { k: 'bool' }
    else if (/^(string|text|id|name|key)$/.test(tl)) type = { k: 'string' }
    else if (t) {
      problems.push(`“${t}” is not a type the planner knows (int, float, bool, string or a data schema); “${n}” is text`)
      type = { k: 'string' }
    } else {
      const flat = n.replace(/\s+/g, '')
      type = /id$/i.test(flat) ? { k: 'string' } : NAME_INT.test(flat) ? { k: 'int' } : NAME_FLOAT.test(flat) ? { k: 'float' } : { k: 'string' }
    }
    params.push({ name: n, words: ws, type })
  }
  return { params, problems }
}

export function buildChannels(p: Project, schemas: IrSchema[], issues: EngineIssue[]): IrChannel[] {
  const modules = new Map(list(p, 'technical.architecture', 'modules').map((m) => [String(m.id), str(m.name)]))
  const names = (ids: unknown) => (Array.isArray(ids) ? ids.map((i) => modules.get(String(i))).filter((x): x is string => !!x) : [])
  return list(p, 'technical.architecture', 'channels')
    .filter((c) => str(c.name))
    .map((c) => {
      const kindLabel = str(c.kind)
      const { params, problems } = parseParams(str(c.payload), schemas)
      for (const x of problems) issues.push({ level: 'warning', code: 'channel.payload', message: `Channel ${str(c.name)}: ${x}.` })
      return {
        id: String(c.id),
        name: str(c.name),
        words: words(str(c.name)),
        kind: kindLabel === 'Event bus' ? 'bus' : kindLabel === 'ScriptableObject channel' ? 'asset' : 'other',
        kindLabel,
        publishers: names(c.publishers),
        subscribers: names(c.subscribers),
        frequency: str(c.frequency),
        payload: params,
      }
    })
}

export function buildTelemetry(p: Project, schemas: IrSchema[], issues: EngineIssue[]): IrTelemetry[] {
  const seen = new Set<string>()
  const out: IrTelemetry[] = []
  for (const e of list(p, BALANCE_DOC, 'telemetry')) {
    const name = str(e.name) || 'Event'
    const key = str(e.key) || words(name).join('_')
    if (!/^[a-z0-9_.]+$/i.test(key)) {
      issues.push({ level: 'warning', code: 'telemetry.key', message: `Telemetry event “${name}”: the key “${key}” may only use letters, digits, _ and .; it is left out.` })
      continue
    }
    if (seen.has(key)) {
      issues.push({ level: 'warning', code: 'telemetry.key', message: `Telemetry event “${name}”: the key “${key}” is used twice; the second is left out.` })
      continue
    }
    seen.add(key)
    const { params, problems } = parseParams(str(e.params), schemas)
    for (const x of problems) issues.push({ level: 'warning', code: 'telemetry.params', message: `Telemetry event “${name}”: ${x}.` })
    out.push({ id: String(e.id), name, key, words: words(name), params, notes: str(e.notes) })
  }
  return out
}

/** The metric keys a telemetry event feeds (the engine report adds them up): <key>.count and <key>.<number parameter>. */
export const telemetryMetricKeys = (t: IrTelemetry) => [`${t.key}.count`, ...t.params.filter((x) => x.type.k === 'int' || x.type.k === 'float').map((x) => `${t.key}.${x.words.join('_')}`)]
