import type { Entity, Project } from '../model/types'
import { words } from '../coding'

/**
 * Engine IR v7: the polish ideas of plans/UNITY_INTEGRATION_PLAN.md § 7 — performance budgets the game measures
 * (I10) and the audio events of Audio Direction (I12). The architecture guard (I18) uses setup.modules, the
 * pseudo-locale (I15) the strings; neither needs more data.
 */

/** What a budget measures, when the engine can sample it by itself; custom budgets are recorded by the game. */
export type BudgetProbe = 'frameTime' | 'memory' | 'drawCalls' | 'batches' | 'triangles' | 'custom'
export type IrBudget = { id: string; name: string; words: string[]; key: string; platform: string; metric: string; unit: string; target?: number; probe: BudgetProbe }

export type IrAudioEvent = {
  id: string
  name: string
  words: string[]
  kind: 'music' | 'sfx'
  /** 0–1, from the planned 0–100. */
  volume: number
  /** ± fraction, from notes such as “pitch random ±5 %”. */
  pitch: number
  loop: boolean
  spatial: boolean
  notes: string
  /** Music: when it plays (time of day, biome or faction names). */
  when: string[]
}
export type IrAudio = { events: IrAudioEvent[] }

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const list = (p: Project, doc: string, section: string): Entity[] => {
  const v = p.documents[doc]?.data[section]
  return Array.isArray(v) ? (v as Entity[]) : []
}
const slug = (s: string) => words(s).join('_')

export const BUDGET_DOC = 'technical.performance'

/** Which built-in measurement fits a budget, from its metric and unit. */
export function budgetProbe(metric: string, unit: string, name: string): BudgetProbe {
  const t = `${metric} ${unit} ${name}`.toLowerCase()
  if (/draw ?calls?/.test(t)) return 'drawCalls'
  if (/batch/.test(t)) return 'batches'
  if (/tri(angle)?s?\b|polys?\b/.test(t)) return 'triangles'
  if (/\b(ram|memory|heap)\b|\b[kmg]i?b\b/.test(t)) return 'memory'
  if (/per frame|frame ?time|\bfps\b/.test(t)) return 'frameTime'
  return 'custom'
}

/** The metric key a budget is reported under: its own key, else perf.<name>. */
export const budgetKey = (b: Entity) => str(b.key) || `perf.${slug(str(b.name))}`

export function buildBudgets(p: Project): IrBudget[] {
  return list(p, BUDGET_DOC, 'budgets')
    .filter((b) => str(b.name))
    .map((b) => ({
      id: String(b.id),
      name: str(b.name),
      words: words(str(b.name)),
      key: budgetKey(b),
      platform: str(b.platform),
      metric: str(b.metric),
      unit: str(b.unit),
      ...(isNum(b.target) && { target: b.target }),
      probe: budgetProbe(str(b.metric), str(b.unit), str(b.name)),
    }))
}

export function buildAudio(p: Project): IrAudio {
  const names = (doc: string, section: string) => new Map(list(p, doc, section).map((e) => [String(e.id), str(e.name)]))
  const biomes = names('design.world', 'biomes')
  const factions = names('design.factions', 'factions')
  const ev = (e: Entity, kind: IrAudioEvent['kind']): IrAudioEvent => {
    const notes = str(e.notes)
    const pitch = /pitch[^±\d]*±\s*(\d+(?:\.\d+)?)\s*%/i.exec(notes)
    return {
      id: String(e.id),
      name: str(e.name),
      words: words(str(e.name)),
      kind,
      volume: isNum(e.volume) ? Math.max(0, Math.min(1, e.volume / 100)) : 1,
      pitch: pitch ? Number(pitch[1]) / 100 : 0,
      loop: kind === 'music' || /\bloop/i.test(notes),
      spatial: /\bspatial|3d\b|positional/i.test(notes),
      notes,
      when: [str(e.time), biomes.get(String(e.biome)) ?? '', factions.get(String(e.faction)) ?? ''].filter(Boolean),
    }
  }
  return {
    events: [...list(p, 'artAudio.audio', 'music').filter((e) => str(e.name)).map((e) => ev(e, 'music')), ...list(p, 'artAudio.audio', 'sfx').filter((e) => str(e.name)).map((e) => ev(e, 'sfx'))],
  }
}

export type BudgetRow = { budget: Entity; key: string; target: number; measured: number; max?: number; samples?: number }

/** Budgets whose measured value (the mean in the last engine report) is over the target; lower is better for all. */
export function budgetsOver(p: Project, metrics: { key: string; value: number; max?: number; samples?: number }[]): BudgetRow[] {
  const byKey = new Map(metrics.map((m) => [m.key, m]))
  return list(p, BUDGET_DOC, 'budgets').flatMap((b) => {
    const m = byKey.get(budgetKey(b))
    if (!m || !isNum(b.target) || m.value <= b.target) return []
    return [{ budget: b, key: budgetKey(b), target: b.target, measured: m.value, ...(m.max !== undefined && { max: m.max }), ...(m.samples !== undefined && { samples: m.samples }) }]
  })
}
