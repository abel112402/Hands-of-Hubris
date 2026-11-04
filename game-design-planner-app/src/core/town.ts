import type { Entity, Project } from './model/types'

export const TOWN_DOC = 'design.town'

const list = (project: Project, section: string): Entity[] => {
  const d = project.documents[TOWN_DOC]?.data[section]
  return Array.isArray(d) ? d : []
}
const form = (project: Project): Record<string, any> => project.documents[TOWN_DOC]?.data.economy ?? {}
const num = (v: unknown, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)
const positive = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : fallback)
const asMap = (v: unknown): Record<string, number> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, number>) : {})
const label = (e: Entity) => String(e.name ?? e.id)

export const resourceLabels = (project: Project): Record<string, string> =>
  Object.fromEntries((project.registry.catalogs.resources?.items ?? []).map((i) => [i.id, i.label]))

export type ResourceRow = {
  id: string
  label: string
  /** Per time unit (one tick of the game's own clock). */
  produced: number
  consumed: number
  net: number
  stock: number
  /** Time units until the stock runs out, or null when the balance is not negative. */
  runway: number | null
  /** Stock at the end of the horizon, never below 0. */
  projected: number
  hasProducer: boolean
  hasConsumer: boolean
}

export type Workforce = { demand: number; supply: number; population: number | null; shortage: number; unused: number }

export type RouteLoad = { id: string; name: string; throughput: number; demand: number; overloaded: boolean }

export type TownEstimate = {
  horizon: number
  timeUnit: string
  resources: ResourceRow[]
  workforce: Workforce
  routes: RouteLoad[]
  /** Building entries counted once per planned copy. */
  buildingCount: number
}

/** Planning estimate only: straight-line rates from the data entered, no gameplay simulation. */
export function estimateTown(project: Project): TownEstimate {
  const eco = form(project)
  const horizon = positive(eco.horizon, 100)
  const labels = resourceLabels(project)
  const rows = new Map<string, ResourceRow>()
  const row = (id: string): ResourceRow => {
    let r = rows.get(id)
    if (!r) {
      r = { id, label: labels[id] ?? id, produced: 0, consumed: 0, net: 0, stock: 0, runway: null, projected: 0, hasProducer: false, hasConsumer: false }
      rows.set(id, r)
    }
    return r
  }

  let demand = 0
  let housing = 0
  let buildingCount = 0
  for (const b of list(project, 'buildings')) {
    const count = Math.max(0, num(b.count, 1))
    const rate = count / positive(b.cycle, 1)
    buildingCount += count
    for (const [id, q] of Object.entries(asMap(b.outputs))) {
      const r = row(id)
      r.produced += num(q) * rate
      if (num(q) > 0) r.hasProducer = true
    }
    for (const [id, q] of Object.entries(asMap(b.inputs))) {
      const r = row(id)
      r.consumed += num(q) * rate
      if (num(q) > 0) r.hasConsumer = true
    }
    for (const [id, q] of Object.entries(asMap(b.wasteOutputs))) row(id).produced += num(q) * rate
    demand += num(b.workersRequired) * count
    housing += num(b.capacity) * count
  }
  for (const base of list(project, 'bases'))
    for (const [id, q] of Object.entries(asMap(base.startStock))) row(id).stock += num(q)

  for (const r of rows.values()) {
    r.net = r.produced - r.consumed
    r.runway = r.net < 0 && r.stock >= 0 ? r.stock / -r.net : null
    r.projected = Math.max(0, r.stock + r.net * horizon)
  }

  const population = typeof eco.population === 'number' ? eco.population : null
  const supply = population ?? housing
  const routes = list(project, 'routes').map((rt): RouteLoad => {
    const throughput = num(rt.capacity) * num(rt.frequency)
    const wanted = Object.values(asMap(rt.quantity)).reduce((a, q) => a + num(q), 0)
    return { id: rt.id, name: label(rt), throughput, demand: wanted, overloaded: wanted > 0 && wanted > throughput }
  })

  return {
    horizon,
    timeUnit: String(eco.timeUnit || 'tick'),
    resources: [...rows.values()].sort((a, b) => a.label.localeCompare(b.label)),
    workforce: { demand, supply, population, shortage: Math.max(0, demand - supply), unused: Math.max(0, supply - demand) },
    routes,
    buildingCount,
  }
}

export type TownFindings = {
  /** Consumed by a building but made nowhere and not in any starting stock. */
  noSource: string[]
  /** Made but never used. Often fine (sold or exported), so only informational. */
  noConsumer: string[]
  /** Running out before the horizon ends. */
  depleting: { label: string; runway: number }[]
  workforceShortage: number
  routeProblems: string[]
  baseProblems: string[]
}

export function analyzeTown(project: Project): TownFindings {
  const est = estimateTown(project)
  const bases = list(project, 'bases')
  const baseIds = new Set(bases.map((b) => b.id))
  const produced = new Set(est.resources.filter((r) => r.hasProducer || r.stock > 0).map((r) => r.id))

  const routeProblems: string[] = []
  for (const rt of list(project, 'routes')) {
    const name = label(rt)
    if (!rt.fromBase || !rt.toBase) routeProblems.push(`${name}: endpoint missing`)
    else if (!baseIds.has(rt.fromBase) || !baseIds.has(rt.toBase)) routeProblems.push(`${name}: endpoint does not exist`)
    else if (rt.fromBase === rt.toBase) routeProblems.push(`${name}: starts and ends at the same place`)
    for (const c of Array.isArray(rt.cargo) ? rt.cargo : [])
      if (!produced.has(c)) routeProblems.push(`${name}: carries ${est.resources.find((r) => r.id === c)?.label ?? 'a resource'} that nothing supplies`)
  }
  for (const rl of est.routes) if (rl.overloaded) routeProblems.push(`${rl.name}: wants ${rl.demand} per ${est.timeUnit}, can move ${rl.throughput}`)

  const baseProblems: string[] = []
  for (const b of bases) {
    const stock = Object.values(asMap(b.startStock)).reduce((a, q) => a + num(q), 0)
    if (typeof b.capacity === 'number' && stock > b.capacity) baseProblems.push(`${label(b)}: starting stock ${stock} exceeds capacity ${b.capacity}`)
    const min = asMap(b.minStock)
    const target = asMap(b.targetStock)
    for (const [id, q] of Object.entries(target))
      if (id in min && num(q) < num(min[id])) baseProblems.push(`${label(b)}: target stock is below the minimum for ${est.resources.find((r) => r.id === id)?.label ?? 'a resource'}`)
  }

  return {
    noSource: est.resources.filter((r) => r.hasConsumer && !r.hasProducer && r.stock <= 0).map((r) => r.label),
    noConsumer: est.resources.filter((r) => r.hasProducer && !r.hasConsumer).map((r) => r.label),
    depleting: est.resources.filter((r) => r.runway !== null && r.runway < est.horizon && (r.hasProducer || r.stock > 0)).map((r) => ({ label: r.label, runway: r.runway as number })),
    workforceShortage: est.workforce.shortage,
    routeProblems,
    baseProblems,
  }
}
