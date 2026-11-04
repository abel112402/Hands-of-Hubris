import { cellsOf, levelsOf, paramsOf, type Level } from './difficulty'
import { tryEvaluate } from './formula'
import type { CatalogItem, Entity, Project } from './model/types'

export const PLAYER_DOC = 'design.player'
/** Used for curves when no level cap is set, so the charts still show something. */
export const FALLBACK_CAP = 20

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const data = (project: Project) => project.documents[PLAYER_DOC]?.data ?? {}
export const playerList = (project: Project, section: string): Entity[] => {
  const d = data(project)[section]
  return Array.isArray(d) ? d : []
}
const ids = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
const castItems = (project: Project): CatalogItem[] => project.registry.catalogs.casts?.items ?? []
const label = (e: Entity) => String(e.name ?? '') || '(unnamed)'

// ---------- Survival ----------

export const unitOf = (stat: Entity) => (stat.decayUnit === 'in-game hour' ? 'in-game hour' : 'real minute')

/** Multiplier a Difficulty parameter applies at a level, relative to its baseline (1 when unlinked or unset). */
export function difficultyMultiplier(project: Project, paramId: unknown, levelId: string): number {
  if (typeof paramId !== 'string') return 1
  const param = paramsOf(project).find((p) => p.id === paramId)
  const value = cellsOf(project)[`${paramId}|${levelId}`]
  if (!param || !isNum(value)) return 1
  const base = isNum(param.baseline) && param.baseline !== 0 ? param.baseline : 1
  return value / base
}

/** Time from full to the critical value, in the stat's own time unit; null when max or decay is missing. */
export function timeToCritical(project: Project, stat: Entity, levelId?: string): number | null {
  if (!isNum(stat.max) || !isNum(stat.decay) || stat.decay <= 0) return null
  const mult = levelId ? difficultyMultiplier(project, stat.difficultyParam, levelId) : 1
  const critical = isNum(stat.criticalAt) ? stat.criticalAt : 0
  return Math.max(0, stat.max - critical) / (stat.decay * (mult > 0 ? mult : 1))
}

/** Difficulty levels to compare; a single "Base" column when no catalog exists. */
export const comparedLevels = (project: Project): Level[] => {
  const l = levelsOf(project)
  return l.length ? l : [{ id: '', label: 'Base' }]
}

export type DepletionRow = { stat: Entity; unit: string; times: Record<string, number | null> }

export const depletion = (project: Project): DepletionRow[] =>
  playerList(project, 'survival').map((stat) => ({
    stat,
    unit: unitOf(stat),
    times: Object.fromEntries(comparedLevels(project).map((l) => [l.id, timeToCritical(project, stat, l.id || undefined)])),
  }))

/** Value of a stat over time at one difficulty level, from full to empty. */
export function depletionSeries(project: Project, stat: Entity, levelId: string, steps = 24): { t: number; value: number }[] {
  if (!isNum(stat.max) || !isNum(stat.decay) || stat.decay <= 0) return []
  const rate = stat.decay * Math.max(0.0001, difficultyMultiplier(project, stat.difficultyParam, levelId))
  const end = stat.max / rate
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = (end * i) / steps
    return { t: Math.round(t * 100) / 100, value: Math.max(0, Math.round((stat.max - rate * t) * 100) / 100) }
  })
}

// ---------- Levelling ----------

export const leveling = (project: Project): Record<string, any> => data(project).leveling ?? {}

export const levelCap = (project: Project): number | null => {
  const c = leveling(project).levelCap
  return isNum(c) && c >= 1 ? Math.floor(c) : null
}

export type LevelRow = { level: number; next: number | null; total: number; hours: number | null; points: number }

export type LevelTable = {
  rows: LevelRow[]
  cap: number
  capSet: boolean
  error?: string
  /** Levels whose XP requirement is not higher than the previous one. */
  flat: number[]
  xpPerHour: number
}

export const xpPerHour = (project: Project) => playerList(project, 'xpSources').reduce((s, x) => s + (isNum(x.xp) && isNum(x.perHour) ? x.xp * x.perHour : 0), 0)

export function pointsAt(project: Project, level: number): number {
  const l = leveling(project)
  const start = isNum(l.startSkillPoints) ? l.startSkillPoints : 0
  const per = isNum(l.skillPointsPerLevel) ? l.skillPointsPerLevel : 0
  return start + Math.max(0, level - 1) * per
}

/** XP to reach each level from the one before, cumulative XP, hours at the estimated XP rate and skill points. */
export function levelTable(project: Project): LevelTable {
  const capSet = levelCap(project) !== null
  const cap = levelCap(project) ?? FALLBACK_CAP
  const expr = String(leveling(project).xpFormula ?? '').trim()
  const rate = xpPerHour(project)
  const rows: LevelRow[] = [{ level: 1, next: null, total: 0, hours: rate > 0 ? 0 : null, points: pointsAt(project, 1) }]
  const flat: number[] = []
  let error: string | undefined
  let total = 0
  let prev: number | null = null
  for (let level = 2; level <= cap; level++) {
    let next: number | null = null
    if (expr) {
      // The formula gives the XP needed to go from (level - 1) to level.
      const r = tryEvaluate(expr, { level: level - 1 })
      if (r.ok) next = r.value
      else error ??= r.error
    }
    if (next !== null) {
      if (prev !== null && next <= prev) flat.push(level)
      prev = next
      total += next
    }
    rows.push({ level, next, total, hours: rate > 0 && next !== null ? total / rate : null, points: pointsAt(project, level) })
  }
  return { rows, cap, capSet, error, flat, xpPerHour: rate }
}

// ---------- Skills ----------

export type CastTree = {
  cast: CatalogItem
  skills: Entity[]
  totalCost: number
  maxTier: number
  /** Skill points available at the level cap. */
  budget: number
  /** Level at which the whole tree becomes affordable, or null if never within the cap. */
  affordableAt: number | null
}

export type TreeAnalysis = {
  casts: CastTree[]
  unassigned: Entity[]
  cycles: Entity[]
  missingRequires: Entity[]
  crossCast: Entity[]
  /** Requires a skill on the same or a higher tier. */
  tierInversions: Entity[]
  aboveCap: Entity[]
  grantsOtherCast: Entity[]
}

function skillsInCycles(skills: Entity[]): Set<string> {
  const byId = new Map(skills.map((s) => [s.id, s]))
  const state = new Map<string, 1 | 2>()
  const inCycle = new Set<string>()
  const stack: string[] = []
  const visit = (id: string) => {
    if (state.get(id) === 2) return
    if (state.get(id) === 1) {
      const from = stack.indexOf(id)
      stack.slice(from).forEach((x) => inCycle.add(x))
      return
    }
    state.set(id, 1)
    stack.push(id)
    for (const r of ids(byId.get(id)?.requires)) if (byId.has(r)) visit(r)
    stack.pop()
    state.set(id, 2)
  }
  skills.forEach((s) => visit(s.id))
  return inCycle
}

export function treeAnalysis(project: Project): TreeAnalysis {
  const skills = playerList(project, 'skills')
  const byId = new Map(skills.map((s) => [s.id, s]))
  const abilities = new Map(playerList(project, 'abilities').map((a) => [a.id, a]))
  const cap = levelCap(project)
  const budgetCap = cap ?? FALLBACK_CAP
  const cycleIds = skillsInCycles(skills)
  const casts = castItems(project)
    .map((cast): CastTree => {
      const own = skills.filter((s) => s.cast === cast.id)
      const totalCost = own.reduce((sum, s) => sum + (isNum(s.cost) ? s.cost : 0), 0)
      let affordableAt: number | null = null
      for (let l = 1; l <= budgetCap; l++)
        if (pointsAt(project, l) >= totalCost) {
          affordableAt = l
          break
        }
      return { cast, skills: own, totalCost, maxTier: Math.max(0, ...own.map((s) => (isNum(s.tier) ? s.tier : 1))), budget: pointsAt(project, budgetCap), affordableAt }
    })
  return {
    casts,
    unassigned: skills.filter((s) => !s.cast || !castItems(project).some((c) => c.id === s.cast)),
    cycles: skills.filter((s) => cycleIds.has(s.id)),
    missingRequires: skills.filter((s) => ids(s.requires).some((r) => !byId.has(r))),
    crossCast: skills.filter((s) => ids(s.requires).some((r) => byId.has(r) && byId.get(r)!.cast !== s.cast)),
    tierInversions: skills.filter((s) => isNum(s.tier) && ids(s.requires).some((r) => isNum(byId.get(r)?.tier) && byId.get(r)!.tier >= s.tier)),
    aboveCap: cap === null ? [] : skills.filter((s) => isNum(s.requiredLevel) && s.requiredLevel > cap),
    grantsOtherCast: skills.filter((s) => {
      const a = abilities.get(s.grants)
      return a && a.cast && s.cast && a.cast !== s.cast
    }),
  }
}

// ---------- Build planner ----------

export type SkillStatus = { skill: Entity; state: 'learned' | 'available' | 'locked'; reasons: string[] }
export type BuildState = { points: number; spent: number; left: number; skills: SkillStatus[]; invalid: string[] }

/** What a build of `picked` skills looks like for one cast at one level. Skills are learned in `picked` order. */
export function buildState(project: Project, castId: string, level: number, picked: string[]): BuildState {
  const all = playerList(project, 'skills')
  const byId = new Map(all.map((s) => [s.id, s]))
  const own = all.filter((s) => s.cast === castId)
  const points = pointsAt(project, level)
  const learned = new Set(picked.filter((id) => byId.has(id)))
  const cost = (s: Entity | undefined) => (s && isNum(s.cost) ? s.cost : 0)
  const spent = [...learned].reduce((sum, id) => sum + cost(byId.get(id)), 0)
  const left = points - spent
  const invalid = [...learned].filter((id) => {
    const s = byId.get(id)!
    return ids(s.requires).some((r) => !learned.has(r)) || (isNum(s.requiredLevel) && s.requiredLevel > level)
  })
  const skills = own.map((skill): SkillStatus => {
    if (learned.has(skill.id)) return { skill, state: 'learned', reasons: [] }
    const reasons: string[] = []
    if (isNum(skill.requiredLevel) && skill.requiredLevel > level) reasons.push(`needs level ${skill.requiredLevel}`)
    for (const r of ids(skill.requires)) if (!learned.has(r)) reasons.push(`needs ${byId.has(r) ? label(byId.get(r)!) : 'a deleted skill'}`)
    if (cost(skill) > left) reasons.push(`costs ${cost(skill)}, ${Math.max(0, left)} left`)
    return { skill, state: reasons.length ? 'locked' : 'available', reasons }
  })
  return { points, spent, left, skills, invalid }
}

/** Removes a skill from a build together with every learned skill that depends on it. */
export function unlearn(project: Project, picked: string[], id: string): string[] {
  const byId = new Map(playerList(project, 'skills').map((s) => [s.id, s]))
  const drop = new Set([id])
  let changed = true
  while (changed) {
    changed = false
    for (const p of picked)
      if (!drop.has(p) && ids(byId.get(p)?.requires).some((r) => drop.has(r))) {
        drop.add(p)
        changed = true
      }
  }
  return picked.filter((p) => !drop.has(p))
}

// ---------- Coverage ----------

export function castCoverage(project: Project) {
  const casts = playerList(project, 'casts')
  const skills = playerList(project, 'skills')
  const abilities = playerList(project, 'abilities')
  return castItems(project).map((c) => ({
    cast: c,
    entry: casts.find((x) => x.cast === c.id),
    skills: skills.filter((s) => s.cast === c.id).length,
    abilities: abilities.filter((a) => a.cast === c.id).length,
  }))
}

export const activeSkillsWithoutAbility = (project: Project) =>
  playerList(project, 'skills').filter((s) => (s.kind === 'Active' || s.kind === 'Spell') && !s.grants)

export const abilitiesWithoutCost = (project: Project) =>
  playerList(project, 'abilities').filter((a) => a.kind !== 'Passive' && (!isNum(a.mana) || !isNum(a.cooldown)))

export const survivalWithoutRestore = (project: Project) =>
  playerList(project, 'survival').filter((s) => !String(s.restore ?? '').trim() && !ids(s.restoreItems).length)
