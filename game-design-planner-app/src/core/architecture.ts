import type { Entity, Project } from './model/types'

/** Technical Architecture analysis. Planning checks and estimates over the declared design, not a code scan or a profile. */
export const ARCH_DOC = 'technical.architecture'
export const DATA_DOC = 'technical.dataDriven'
export const DEFAULT_TICK_RATE = 10
export const DEFAULT_FPS = 60
export const DEFAULT_SIM_SHARE = 25

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const ids = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
const data = (p: Project): Record<string, any> => p.documents[ARCH_DOC]?.data ?? {}
export const archList = (p: Project, section: string): Entity[] => {
  const d = data(p)[section]
  return Array.isArray(d) ? d : []
}
export const nameOf = (e: Entity | undefined) => (e ? String(e.name || '(unnamed)') : '?')

// ---- Layers and dependencies ----

/** Layers lowest first; ties keep list order. */
export function layerOrder(p: Project): Entity[] {
  return archList(p, 'layers')
    .map((l, i) => ({ l, i }))
    .sort((a, b) => (isNum(a.l.order) ? a.l.order : 1e6 + a.i) - (isNum(b.l.order) ? b.l.order : 1e6 + b.i) || a.i - b.i)
    .map((x) => x.l)
}

export type DepIssue = 'upward' | 'disallowed' | 'missing'
export type Dependency = { from: Entity; to?: Entity; toId: string; issue?: DepIssue }

/**
 * Every module dependency with its rule check: a module may use its own layer, lower layers, and layers listed in “May also use”.
 * “upward” = target is in a higher layer that is not allowed; “missing” = the target module no longer exists.
 */
export function dependencies(p: Project): Dependency[] {
  const layers = layerOrder(p)
  const rank = new Map(layers.map((l, i) => [l.id, i]))
  const byLayer = new Map(layers.map((l) => [l.id, l]))
  const modules = new Map(archList(p, 'modules').map((m) => [m.id, m]))
  const out: Dependency[] = []
  for (const from of modules.values()) {
    for (const toId of ids(from.dependsOn)) {
      const to = modules.get(toId)
      if (!to) {
        out.push({ from, toId, issue: 'missing' })
        continue
      }
      const a = rank.get(from.layer)
      const b = rank.get(to.layer)
      const allowed = ids(byLayer.get(from.layer)?.mayUse).includes(to.layer)
      const issue = a === undefined || b === undefined || b <= a || allowed ? undefined : 'upward'
      out.push({ from, to, toId, issue })
    }
  }
  return out
}

/** Groups of modules that depend on each other in a loop (strongly connected components of size > 1, or a self-dependency). */
export function dependencyCycles(p: Project): Entity[][] {
  const modules = archList(p, 'modules')
  const byId = new Map(modules.map((m) => [m.id, m]))
  const edges = new Map(modules.map((m) => [m.id, ids(m.dependsOn).filter((d) => byId.has(d))]))
  let index = 0
  const idx = new Map<string, number>()
  const low = new Map<string, number>()
  const stack: string[] = []
  const on = new Set<string>()
  const out: Entity[][] = []
  const visit = (v: string) => {
    idx.set(v, index)
    low.set(v, index++)
    stack.push(v)
    on.add(v)
    for (const w of edges.get(v) ?? []) {
      if (!idx.has(w)) {
        visit(w)
        low.set(v, Math.min(low.get(v)!, low.get(w)!))
      } else if (on.has(w)) low.set(v, Math.min(low.get(v)!, idx.get(w)!))
    }
    if (low.get(v) === idx.get(v)) {
      const comp: string[] = []
      let w: string
      do {
        w = stack.pop()!
        on.delete(w)
        comp.push(w)
      } while (w !== v)
      if (comp.length > 1 || edges.get(v)?.includes(v)) out.push(comp.reverse().map((id) => byId.get(id)!))
    }
  }
  for (const m of modules) if (!idx.has(m.id)) visit(m.id)
  return out
}

export type CouplingRow = { module: Entity; fanIn: number; fanOut: number; instability: number | null }

/** Fan-in (who depends on me), fan-out (whom I depend on) and instability = fan-out / (fan-in + fan-out). */
export function coupling(p: Project): CouplingRow[] {
  const modules = archList(p, 'modules')
  const known = new Set(modules.map((m) => m.id))
  const fanIn = new Map<string, number>()
  for (const m of modules) for (const d of new Set(ids(m.dependsOn))) if (known.has(d) && d !== m.id) fanIn.set(d, (fanIn.get(d) ?? 0) + 1)
  return modules.map((m) => {
    const out = new Set(ids(m.dependsOn).filter((d) => known.has(d) && d !== m.id)).size
    const inn = fanIn.get(m.id) ?? 0
    return { module: m, fanIn: inn, fanOut: out, instability: inn + out ? out / (inn + out) : null }
  })
}

/** Modules without a layer, or whose layer was deleted. */
export const modulesWithoutLayer = (p: Project) => {
  const layers = new Set(archList(p, 'layers').map((l) => l.id))
  return archList(p, 'modules').filter((m) => !layers.has(m.layer))
}

// ---- Communication ----

export type ChannelRow = { channel: Entity; publishers: Entity[]; subscribers: Entity[]; orphan: 'noPublisher' | 'noSubscriber' | null }

export function messageFlow(p: Project): ChannelRow[] {
  const modules = new Map(archList(p, 'modules').map((m) => [m.id, m]))
  const resolve = (v: unknown) => ids(v).map((id) => modules.get(id)).filter((m): m is Entity => !!m)
  return archList(p, 'channels').map((channel) => {
    const publishers = resolve(channel.publishers)
    const subscribers = resolve(channel.subscribers)
    return { channel, publishers, subscribers, orphan: !publishers.length ? 'noPublisher' : !subscribers.length ? 'noSubscriber' : null }
  })
}

/** Modules that talk through a channel although one already depends directly on the other in the opposite direction (a hidden cycle). */
export function channelBackEdges(p: Project): { channel: Entity; from: Entity; to: Entity }[] {
  const deps = new Set(dependencies(p).filter((d) => d.to).map((d) => `${d.from.id}|${d.to!.id}`))
  const out: { channel: Entity; from: Entity; to: Entity }[] = []
  for (const r of messageFlow(p))
    for (const a of r.publishers) for (const b of r.subscribers) if (a.id !== b.id && deps.has(`${a.id}|${b.id}`) && deps.has(`${b.id}|${a.id}`)) out.push({ channel: r.channel, from: a, to: b })
  return out
}

// ---- Extension points ----

export type CoverageRow = { schema: Entity; points: Entity[] }

/** Data-driven schemas and the extension points that let designers add more of them. */
export function extensionCoverage(p: Project): { rows: CoverageRow[]; hostless: Entity[]; uncovered: Entity[] } {
  const d = p.documents[DATA_DOC]?.data.schemas
  const schemas: Entity[] = Array.isArray(d) ? d : []
  const points = archList(p, 'extensionPoints')
  const rows = schemas.map((schema) => ({ schema, points: points.filter((x) => ids(x.schemas).includes(schema.id)) }))
  return { rows, hostless: points.filter((x) => !x.host), uncovered: rows.filter((r) => !r.points.length).map((r) => r.schema) }
}

// ---- Simulation budget ----

export function simSettings(p: Project) {
  const s = data(p).simulation ?? {}
  const pos = (v: unknown, d: number) => (isNum(v) && v > 0 ? v : d)
  const tickRate = pos(s.tickRate, DEFAULT_TICK_RATE)
  const fps = pos(s.targetFps, DEFAULT_FPS)
  const share = isNum(s.simShare) && s.simShare >= 0 ? s.simShare : DEFAULT_SIM_SHARE
  const frameMs = 1000 / fps
  return { tickRate, fps, share, farInstances: isNum(s.farInstances) && s.farInstances > 0 ? s.farInstances : 0, frameMs, budgetMs: (frameMs * share) / 100 }
}

export type TickRow = { system: Entity; every: number; nearPerSecond: number; farPerSecond: number; perSecond: number; mainThread: boolean }

/**
 * Planning estimate of simulation cost.
 * ms per second = cost × ticks/s ÷ every (+ far cost × far instances × ticks/s ÷ far every); the per-frame average divides by the frame rate.
 * The worst tick is the one where every system runs at once (tick 0); it lands in a single frame.
 */
export function tickBudget(p: Project) {
  const st = simSettings(p)
  const rows: TickRow[] = archList(p, 'systems')
    .slice()
    .sort((a, b) => (isNum(a.order) ? a.order : 1e6) - (isNum(b.order) ? b.order : 1e6))
    .map((system) => {
      const every = isNum(system.every) && system.every >= 1 ? Math.round(system.every) : 1
      const cost = isNum(system.costMs) ? system.costMs : 0
      const near = (cost * st.tickRate) / every
      const far = isNum(system.farEvery) && system.farEvery >= 1 && isNum(system.farCostMs) ? (system.farCostMs * st.farInstances * st.tickRate) / Math.round(system.farEvery) : 0
      return { system, every, nearPerSecond: near, farPerSecond: far, perSecond: near + far, mainThread: (system.thread ?? 'Main thread') === 'Main thread' }
    })
  const perSecond = rows.reduce((s, r) => s + r.perSecond, 0)
  const mainPerSecond = rows.filter((r) => r.mainThread).reduce((s, r) => s + r.perSecond, 0)
  const worstTick = archList(p, 'systems').reduce((s, x) => s + (isNum(x.costMs) ? x.costMs : 0) + (isNum(x.farCostMs) && isNum(x.farEvery) ? x.farCostMs * st.farInstances : 0), 0)
  const avgFrame = mainPerSecond / st.fps
  return { ...st, rows, perSecond, avgFrameMs: avgFrame, worstTickMs: worstTick, overAverage: avgFrame > st.budgetMs, overWorst: worstTick > st.frameMs }
}

/** Which systems run on each of the first `count` ticks (default: one second of ticks, at most 40). */
export function tickPattern(p: Project, count?: number) {
  const b = tickBudget(p)
  const n = Math.max(1, Math.min(40, count ?? Math.round(b.tickRate)))
  return Array.from({ length: n }, (_, t) => {
    const running = b.rows.filter((r) => t % r.every === 0)
    return { tick: t, running, costMs: running.reduce((s, r) => s + (isNum(r.system.costMs) ? r.system.costMs : 0), 0) }
  })
}

// ---- Scenes ----

export type BootStep = { order: number; scenes: Entity[]; seconds: number; modules: Entity[] }

/** Scenes grouped by load order, with the modules each step initialises and running load time. */
export function bootSequence(p: Project) {
  const scenes = archList(p, 'scenes')
  const modules = new Map(archList(p, 'modules').map((m) => [m.id, m]))
  const ordered = scenes.filter((s) => isNum(s.loadOrder)).sort((a, b) => a.loadOrder - b.loadOrder)
  const steps: BootStep[] = []
  for (const s of ordered) {
    let step = steps.find((x) => x.order === s.loadOrder)
    if (!step) steps.push((step = { order: s.loadOrder, scenes: [], seconds: 0, modules: [] }))
    step.scenes.push(s)
    step.seconds = Math.max(step.seconds, isNum(s.loadSeconds) ? s.loadSeconds : 0)
    for (const id of ids(s.loads)) {
      const m = modules.get(id)
      if (m && !step.modules.includes(m)) step.modules.push(m)
    }
  }
  const loaded = new Set(scenes.flatMap((s) => ids(s.loads)))
  // Reachability from Bootstrap scenes through “Can go to”.
  const starts = scenes.filter((s) => s.kind === 'Bootstrap')
  const seen = new Set<string>()
  const queue = starts.map((s) => s.id)
  const byId = new Map(scenes.map((s) => [s.id, s]))
  while (queue.length) {
    const id = queue.shift()!
    if (seen.has(id)) continue
    seen.add(id)
    queue.push(...ids(byId.get(id)?.next))
  }
  return {
    steps,
    unordered: scenes.filter((s) => !isNum(s.loadOrder)),
    neverLoaded: scenes.length ? archList(p, 'modules').filter((m) => !loaded.has(m.id)) : [],
    noBootstrap: scenes.length > 0 && starts.length === 0,
    // Persistent and additive UI scenes are loaded on top of others, so they need no transition into them.
    unreachable: starts.length ? scenes.filter((s) => !seen.has(s.id) && s.kind !== 'Persistent' && s.kind !== 'Additive UI') : [],
    totalSeconds: steps.reduce((s, x) => s + x.seconds, 0),
  }
}
