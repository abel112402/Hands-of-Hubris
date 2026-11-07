import type { Entity, Project } from './model/types'

export const DIFFICULTY_DOC = 'design.difficulty'
export const HARDER = 'Higher = harder'
export const EASIER = 'Higher = easier'
export const CATEGORIES = ['Combat', 'Survival', 'Economy', 'NPC', 'Other']

export type Level = { id: string; label: string }

export const levelsOf = (project: Project): Level[] => project.registry.catalogs.difficulties?.items ?? []
export const paramsOf = (project: Project): Entity[] => project.documents[DIFFICULTY_DOC]?.data.params ?? []
export const cellsOf = (project: Project): Record<string, string | number> => project.documents[DIFFICULTY_DOC]?.data.values?.cells ?? {}

export const numeric = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** Where a value sits in the parameter's range, 0–1, flipped so that 1 is always the hardest. Null if the range is unknown. */
export function pressure(param: Entity, value: unknown): number | null {
  if (!numeric(value) || !numeric(param.min) || !numeric(param.max) || param.max === param.min) return null
  const t = (value - param.min) / (param.max - param.min)
  if (param.direction === EASIER) return 1 - t
  return t
}

export type DifficultyFindings = {
  missing: { level: Level; params: Entity[] }[]
  outOfRange: { param: Entity; level: Level; value: number }[]
  reversals: { param: Entity; from: Level; to: Level }[]
  noContext: Entity[]
}

export function analyzeDifficulty(project: Project): DifficultyFindings {
  const levels = levelsOf(project)
  const params = paramsOf(project)
  const cells = cellsOf(project)
  const at = (p: Entity, l: Level) => cells[`${p.id}|${l.id}`]
  const out: DifficultyFindings = { missing: [], outOfRange: [], reversals: [], noContext: [] }

  for (const level of levels) {
    const gone = params.filter((p) => !numeric(at(p, level)))
    if (gone.length) out.missing.push({ level, params: gone })
  }
  for (const p of params) {
    if (!p.direction || !numeric(p.min) || !numeric(p.max)) out.noContext.push(p)
    for (const level of levels) {
      const v = at(p, level)
      if (numeric(v) && ((numeric(p.min) && v < p.min) || (numeric(p.max) && v > p.max))) out.outOfRange.push({ param: p, level, value: v })
    }
    if (p.exception || (p.direction !== HARDER && p.direction !== EASIER)) continue
    for (let i = 1; i < levels.length; i++) {
      const a = at(p, levels[i - 1])
      const b = at(p, levels[i])
      if (!numeric(a) || !numeric(b)) continue
      if (p.direction === HARDER ? b < a : b > a) out.reversals.push({ param: p, from: levels[i - 1], to: levels[i] })
    }
  }
  return out
}

/** Parameters whose baseline lies outside their own min–max range. */
export const baselineOutOfRange = (project: Project): Entity[] =>
  paramsOf(project).filter((p) => numeric(p.baseline) && numeric(p.min) && numeric(p.max) && (p.baseline < p.min || p.baseline > p.max))

// ---------- Pressure profile ----------
// "Pressure" is where a value sits in its parameter's range, 0–1, with "higher = easier" flipped (see `pressure`).
// A level's overall pressure is the mean over the parameters that have a range, a direction and a value.
// It is a planning summary of the numbers entered, not a measure of how hard the game feels.

export type CategoryPressure = { category: string; /** Mean pressure of the category, 0–1. */ mean: number; /** Its part of the overall score; the shares add up to `overall`. */ share: number; count: number }
export type PressureProfile = { overall: number | null; categories: CategoryPressure[]; count: number }
export type LevelPressure = PressureProfile & { level: Level }

const categoryOf = (p: Entity) => (CATEGORIES.includes(p.category) ? (p.category as string) : 'Other')
const clamp01 = (n: number) => Math.max(0, Math.min(1, n))

/** Pressure profile of one set of values (one level, or a custom mix). */
export function pressureProfile(project: Project, valueOf: (p: Entity) => unknown): PressureProfile {
  const scored = paramsOf(project)
    .filter((p) => p.direction === HARDER || p.direction === EASIER)
    .map((p) => ({ p, t: pressure(p, valueOf(p)) }))
    .filter((x): x is { p: Entity; t: number } => x.t !== null)
    .map((x) => ({ ...x, t: clamp01(x.t) }))
  const count = scored.length
  if (!count) return { overall: null, categories: [], count: 0 }
  const categories = CATEGORIES.map((category) => {
    const mine = scored.filter((x) => categoryOf(x.p) === category)
    const sum = mine.reduce((s, x) => s + x.t, 0)
    return { category, mean: mine.length ? sum / mine.length : 0, share: sum / count, count: mine.length }
  }).filter((c) => c.count > 0)
  return { overall: scored.reduce((s, x) => s + x.t, 0) / count, categories, count }
}

export function levelPressure(project: Project): LevelPressure[] {
  const cells = cellsOf(project)
  return levelsOf(project).map((level) => ({ level, ...pressureProfile(project, (p) => cells[`${p.id}|${level.id}`]) }))
}

/** Smallest overall-pressure step between neighbouring levels that still reads as a different level. */
export const MIN_STEP = 0.05

export type LevelStep = { from: Level; to: Level; delta: number; tooClose: boolean; inverted: boolean }

/** Overall-pressure change from each level to the next (catalog order is easiest first). */
export function levelSteps(project: Project): LevelStep[] {
  const rows = levelPressure(project)
  const out: LevelStep[] = []
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1].overall
    const b = rows[i].overall
    if (a === null || b === null) continue
    const delta = b - a
    out.push({ from: rows[i - 1].level, to: rows[i].level, delta, inverted: delta < 0, tooClose: delta >= 0 && delta < MIN_STEP })
  }
  return out
}

// ---------- Editing helpers ----------

/** A round step for dragging and arrow keys: 0.05 for ×, 1 for %, else about 1/100 of the range. */
export function stepOf(p: Entity): number {
  if (p.unit === '×') return 0.05
  if (p.unit === '%') return 1
  const span = numeric(p.min) && numeric(p.max) ? Math.abs(p.max - p.min) : 1
  const raw = span / 100
  const mag = 10 ** Math.floor(Math.log10(raw || 1))
  return [1, 2, 5, 10].map((k) => k * mag).find((s) => s >= raw) ?? mag
}

/** Rounds to the step without floating-point noise (0.1 + 0.2 stays 0.3). */
export function snap(v: number, step: number): number {
  const decimals = Math.max(0, -Math.floor(Math.log10(step)) + 1)
  return Number((Math.round(v / step) * step).toFixed(decimals))
}

/**
 * Values that spread the levels evenly around each parameter's baseline: the middle level sits on the baseline and
 * the outer levels `spread` (share of the range, 0–1) easier or harder, in pressure terms. Only parameters with a
 * range, a baseline and a harder/easier direction, and not marked as exceptions. Keys are `param|level` cells.
 */
export function spreadValues(project: Project, spread: number): Record<string, number> {
  const levels = levelsOf(project)
  const c = (levels.length - 1) / 2
  const out: Record<string, number> = {}
  for (const p of paramsOf(project)) {
    if (p.exception || (p.direction !== HARDER && p.direction !== EASIER) || !numeric(p.baseline)) continue
    const p0 = pressure(p, p.baseline)
    if (p0 === null) continue
    levels.forEach((l, i) => {
      const target = clamp01(clamp01(p0) + spread * (c > 0 ? (i - c) / c : 0))
      const t = p.direction === EASIER ? 1 - target : target
      out[`${p.id}|${l.id}`] = snap(p.min + t * (p.max - p.min), stepOf(p))
    })
  }
  return out
}

// ---------- Custom settings ----------

export const customSettings = (project: Project): Entity[] => project.documents[DIFFICULTY_DOC]?.data.custom ?? []

/** Slider range of a custom setting, as a multiplier on the preset's value; ×0.5–×2 when unset or invalid. */
export function customRange(setting: Entity): [number, number] {
  return numeric(setting.min) && numeric(setting.max) && setting.min > 0 && setting.min < setting.max ? [setting.min, setting.max] : [0.5, 2]
}

/**
 * Parameter values after applying custom settings to a base level: each setting multiplies the base value of every
 * parameter it changes (several settings on one parameter multiply together), clamped to the parameter's range.
 */
export function customValues(project: Project, baseLevelId: string, multipliers: Record<string, number>): Record<string, number> {
  const cells = cellsOf(project)
  const out: Record<string, number> = {}
  const params = paramsOf(project)
  for (const p of params) {
    const v = cells[`${p.id}|${baseLevelId}`]
    if (numeric(v)) out[p.id] = v
  }
  for (const s of customSettings(project)) {
    const m = multipliers[s.id]
    if (!numeric(m)) continue
    for (const id of Array.isArray(s.params) ? (s.params as string[]) : []) if (numeric(out[id])) out[id] *= m
  }
  for (const p of params) {
    if (!numeric(out[p.id])) continue
    if (numeric(p.min)) out[p.id] = Math.max(p.min, out[p.id])
    if (numeric(p.max)) out[p.id] = Math.min(p.max, out[p.id])
  }
  return out
}

export const customPressure = (project: Project, baseLevelId: string, multipliers: Record<string, number>) => {
  const values = customValues(project, baseLevelId, multipliers)
  return pressureProfile(project, (p) => values[p.id])
}
