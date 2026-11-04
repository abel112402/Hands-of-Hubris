import { analyzeRanges, type RangeAnalysis } from './diplomacy'
import { tryEvaluate } from './formula'
import type { CatalogItem, Entity, GraphData, Project } from './model/types'
import { estimateTown, TOWN_DOC } from './town'

export const NPC_DOC = 'design.npc'
export const DEFAULT_STAT_SCALE: [number, number] = [0, 10]
export const DEFAULT_MAX_AGE = 100
export const DEFAULT_RELATION_SCALE: [number, number] = [-100, 100]

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const blank = (v: unknown) => v === undefined || v === null || String(v).trim() === ''
const asMap = (v: unknown): Record<string, number> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, number>) : {})

const data = (project: Project) => project.documents[NPC_DOC]?.data ?? {}
export const npcList = (project: Project, section: string): Entity[] => {
  const d = data(project)[section]
  return Array.isArray(d) ? d : []
}
const catalogItems = (project: Project, id: string): CatalogItem[] => project.registry.catalogs[id]?.items ?? []
const townBuildings = (project: Project): Entity[] => {
  const d = project.documents[TOWN_DOC]?.data.buildings
  return Array.isArray(d) ? d : []
}

function scale(o: Record<string, any> | undefined, minKey: string, maxKey: string, fallback: [number, number]): [number, number] {
  const lo = isNum(o?.[minKey]) ? o[minKey] : fallback[0]
  const hi = isNum(o?.[maxKey]) ? o[maxKey] : fallback[1]
  return lo < hi ? [lo, hi] : fallback
}

export const statScale = (project: Project) => scale(data(project).overview, 'statMin', 'statMax', DEFAULT_STAT_SCALE)
export const ageScale = (project: Project): [number, number] => scale(data(project).overview, 'ageMin', 'maxAge', [0, DEFAULT_MAX_AGE])
export const relationScale = (project: Project) => scale(data(project).relationships, 'scaleMin', 'scaleMax', DEFAULT_RELATION_SCALE)

/** Formula identifier for a catalog id: the formula language has no '-', so kebab-case ids use '_' instead. */
export const statVar = (id: string) => (/^[A-Za-z_]/.test(id) ? id : `_${id}`).replace(/[^A-Za-z0-9_]/g, '_')

/** Extra variables every NPC formula may use besides the stats. */
export const EXTRA_VARS = ['level', 'age'] as const

/** Variables for an archetype: each stat (unset stats count as the bottom of the scale) plus level and age. */
export function statVars(project: Project, archetype: Entity | undefined, extra: Partial<Record<(typeof EXTRA_VARS)[number], number>> = {}): Record<string, number> {
  const stats = asMap(archetype?.stats)
  const [lo] = statScale(project)
  const vars: Record<string, number> = {}
  for (const s of catalogItems(project, 'npcStats')) vars[statVar(s.id)] = isNum(stats[s.id]) ? stats[s.id] : lo
  return { ...vars, level: extra.level ?? 1, age: extra.age ?? 30 }
}

export const evaluateFor = (project: Project, expr: string, archetype: Entity | undefined, extra?: Parameters<typeof statVars>[2]) =>
  tryEvaluate(expr, statVars(project, archetype, extra))

/** Stat rules whose formula does not evaluate with the stat variables (unknown names, syntax). */
export function formulaProblems(project: Project) {
  const [lo, hi] = statScale(project)
  const mid: Entity = { id: 'mid', stats: Object.fromEntries(catalogItems(project, 'npcStats').map((s) => [s.id, (lo + hi) / 2])) }
  return [...npcList(project, 'statRules'), ...npcList(project, 'jobs')]
    .map((r) => {
      const expr = String(r.formula ?? r.efficiency ?? '').trim()
      if (!expr) return null
      const res = evaluateFor(project, expr, mid)
      return res.ok ? null : { entity: r, error: res.error }
    })
    .filter((x): x is { entity: Entity; error: string } => x !== null)
}

export const statsWithoutRule = (project: Project) => {
  const covered = new Set(npcList(project, 'statRules').map((r) => r.stat))
  return catalogItems(project, 'npcStats').filter((s) => !covered.has(s.id))
}

export const needsWithoutRule = (project: Project) => {
  const covered = new Set(npcList(project, 'needRules').map((r) => r.need))
  return catalogItems(project, 'needs').filter((n) => !covered.has(n.id))
}

export const needRulesWithoutSupply = (project: Project) =>
  npcList(project, 'needRules').filter((r) => r.need && blank(r.resource) && !(Array.isArray(r.buildings) && r.buildings.length))

export const needRulesWithoutConsequence = (project: Project) => npcList(project, 'needRules').filter((r) => r.need && blank(r.consequence))

/** Archetypes with at least one stat outside the overview's stat scale. */
export function statsOutOfRange(project: Project) {
  const [lo, hi] = statScale(project)
  return npcList(project, 'archetypes').filter((a) => Object.values(asMap(a.stats)).some((v) => isNum(v) && (v < lo || v > hi)))
}

export const stageAnalysis = (project: Project): RangeAnalysis => analyzeRanges(npcList(project, 'lifeStages'), ageScale(project), 'ageFrom', 'ageTo')
export const relationLevelAnalysis = (project: Project): RangeAnalysis => analyzeRanges(npcList(project, 'relationLevels'), relationScale(project), 'min', 'max')

/** Plain-language list of gap / overlap problems in a range analysis. */
export function rangeProblems(a: RangeAnalysis): string[] {
  return [
    ...a.rows.filter((r) => r.overlaps).map((r) => `${r.name} overlaps the previous one`),
    ...a.rows.filter((r) => r.gapBefore).map((r) => `gap before ${r.name}`),
    ...(a.gapAtBottom ? [`nothing covers values below ${a.rows[0].from}`] : []),
    ...(a.gapAtTop ? [`nothing covers values above ${a.rows[a.rows.length - 1].to}`] : []),
    ...a.unset.map((l) => `${String(l.name ?? '(unnamed)')} has no start`),
  ]
}

export type LifecycleIssues = {
  noStart: boolean
  noEnd: boolean
  unreachable: GraphData['nodes']
  deadEnds: GraphData['nodes']
  /** “on event” connections that do not name the event. */
  eventEdgesWithoutEvent: number
  /** Life stages that no state node stands for. */
  stagesMissing: Entity[]
}

export function lifecycleIssues(project: Project): LifecycleIssues | null {
  const g: GraphData = data(project).lifecycle ?? { nodes: [], edges: [] }
  if (!g.nodes?.length) return null
  const out = new Map<string, string[]>()
  for (const e of g.edges ?? []) out.set(e.source, [...(out.get(e.source) ?? []), e.target])
  const starts = g.nodes.filter((n) => n.kind === 'Start')
  const seen = new Set<string>()
  const stack = starts.map((n) => n.id)
  while (stack.length) {
    const id = stack.pop()!
    if (seen.has(id)) continue
    seen.add(id)
    stack.push(...(out.get(id) ?? []))
  }
  const tagged = new Set(g.nodes.map((n) => n.refId).filter(Boolean))
  return {
    noStart: starts.length === 0,
    noEnd: !g.nodes.some((n) => n.kind === 'End'),
    unreachable: starts.length ? g.nodes.filter((n) => !seen.has(n.id)) : [],
    deadEnds: g.nodes.filter((n) => n.kind !== 'End' && !(out.get(n.id)?.length)),
    eventEdgesWithoutEvent: (g.edges ?? []).filter((e) => e.kind === 'on event' && !e.refId).length,
    stagesMissing: npcList(project, 'lifeStages').filter((s) => !tagged.has(s.id)),
  }
}

/** Professions some archetype has but no job entry describes. */
export function professionsWithoutJob(project: Project): CatalogItem[] {
  const jobs = new Set(npcList(project, 'jobs').map((j) => j.profession))
  const used = new Set(npcList(project, 'archetypes').map((a) => a.profession).filter(Boolean))
  return catalogItems(project, 'professions').filter((p) => used.has(p.id) && !jobs.has(p.id))
}

/** Jobs placed in a Town building whose worker professions do not include the job's profession. */
export function jobBuildingMismatches(project: Project): { job: Entity; building: Entity }[] {
  const buildings = new Map(townBuildings(project).map((b) => [b.id, b]))
  const out: { job: Entity; building: Entity }[] = []
  for (const job of npcList(project, 'jobs')) {
    if (!job.profession) continue
    for (const id of Array.isArray(job.buildings) ? job.buildings : []) {
      const b = buildings.get(id)
      if (b && Array.isArray(b.workers) && b.workers.length && !b.workers.includes(job.profession)) out.push({ job, building: b })
    }
  }
  return out
}

/** Sum of archetype population shares, or null when no archetype has a share. */
export function shareTotal(project: Project): number | null {
  const shares = npcList(project, 'archetypes').map((a) => a.share).filter(isNum)
  return shares.length ? shares.reduce((a, b) => a + b, 0) : null
}

export const incompleteEvents = (project: Project) =>
  npcList(project, 'events').filter(
    (e) => !isNum(e.chance) || (blank(e.effect) && !Object.keys(asMap(e.statEffects)).length && !isNum(e.moraleEffect)),
  )

export type NeedBalanceRow = {
  needId: string
  label: string
  /** Units per NPC day, or places for capacity-based needs. */
  demand: number
  supply: number | null
  basis: 'resource' | 'capacity' | 'none'
  short: boolean
}

export type NeedsBalance = { population: number; rows: NeedBalanceRow[]; unitsPerDay: number; timeUnit: string }

/**
 * Planning estimate: what a population mix needs per day against what Town supplies.
 * Resource needs use the Town estimate's net rate (output minus building inputs) times the Town time units per NPC day;
 * building needs use the planned building count times the places each provides. Not a simulation.
 */
export function needsBalance(project: Project, scenario: Entity, populationField = 'population'): NeedsBalance {
  const archetypes = new Map(npcList(project, 'archetypes').map((a) => [a.id, a]))
  const pop = asMap(scenario[populationField])
  const unitsPerDay = isNum(data(project).overview?.unitsPerDay) && data(project).overview.unitsPerDay > 0 ? data(project).overview.unitsPerDay : 1
  const demand = new Map<string, number>()
  let population = 0
  for (const [id, count] of Object.entries(pop)) {
    const a = archetypes.get(id)
    if (!a || !isNum(count)) continue
    population += count
    for (const [need, q] of Object.entries(asMap(a.needs))) if (isNum(q)) demand.set(need, (demand.get(need) ?? 0) + q * count)
  }
  const town = estimateTown(project)
  const net = new Map(town.resources.map((r) => [r.id, r.net]))
  const buildings = new Map(townBuildings(project).map((b) => [b.id, b]))
  const rules = npcList(project, 'needRules')
  const labels = new Map(catalogItems(project, 'needs').map((n) => [n.id, n.label]))
  const ids = [...new Set([...demand.keys(), ...rules.map((r) => r.need).filter(Boolean)])]

  const rows = ids.map((needId): NeedBalanceRow => {
    const rule = rules.find((r) => r.need === needId)
    const d = demand.get(needId) ?? 0
    let supply: number | null = null
    let basis: NeedBalanceRow['basis'] = 'none'
    if (rule && !blank(rule.resource)) {
      basis = 'resource'
      supply = (net.get(rule.resource) ?? 0) * unitsPerDay
    } else if (rule && Array.isArray(rule.buildings) && rule.buildings.length) {
      basis = 'capacity'
      supply = rule.buildings.reduce((sum: number, id: string) => {
        const b = buildings.get(id)
        if (!b) return sum
        const count = isNum(b.count) ? b.count : 1
        const each = isNum(rule.perBuilding) ? rule.perBuilding : isNum(b.capacity) ? b.capacity : 0
        return sum + count * each
      }, 0)
    }
    return { needId, label: labels.get(needId) ?? needId, demand: d, supply, basis, short: supply !== null && d > 0 && supply < d }
  })
  return { population, rows: rows.sort((a, b) => a.label.localeCompare(b.label)), unitsPerDay, timeUnit: town.timeUnit }
}

/** Scenarios where some need is undersupplied, with the needs that fall short. */
export function scenarioShortfalls(project: Project) {
  return npcList(project, 'scenarios')
    .map((s) => ({ scenario: s, short: needsBalance(project, s).rows.filter((r) => r.short) }))
    .filter((x) => x.short.length > 0)
}
