import type { Entity, Project } from './model/types'

export const DIPLOMACY_DOC = 'design.factions'
export const DEFAULT_SCALE: [number, number] = [-100, 100]
/** Two directions of a relation count as asymmetric above this many points. */
export const ASYMMETRY_TOLERANCE = 10

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const data = (project: Project) => project.documents[DIPLOMACY_DOC]?.data ?? {}

export function scaleOf(project: Project): [number, number] {
  const o = data(project).overview ?? {}
  const lo = isNum(o.scaleMin) ? o.scaleMin : DEFAULT_SCALE[0]
  const hi = isNum(o.scaleMax) ? o.scaleMax : DEFAULT_SCALE[1]
  return lo < hi ? [lo, hi] : DEFAULT_SCALE
}

export type RangeRow = { id: string; name: string; from: number; to: number; open: boolean; overlaps: boolean; gapBefore: boolean }
export type RangeAnalysis = { rows: RangeRow[]; unset: Entity[]; gapAtTop: boolean; gapAtBottom: boolean }

/**
 * Levels sorted by minimum. A level without a maximum runs up to the next level's minimum
 * (or the top of the scale), so only explicit maximums can overlap or leave gaps.
 */
export function analyzeRanges(levels: Entity[], scale: [number, number], minField = 'min', maxField = 'max'): RangeAnalysis {
  const set = levels.filter((l) => isNum(l[minField])).sort((a, b) => a[minField] - b[minField])
  const rows: RangeRow[] = set.map((l, i) => {
    const next = set[i + 1]
    const explicit = isNum(l[maxField]) ? l[maxField] : undefined
    const to = explicit ?? (next ? next[minField] - 1 : scale[1])
    return { id: l.id, name: String(l.name ?? ''), from: l[minField], to, open: explicit === undefined, overlaps: false, gapBefore: false }
  })
  rows.forEach((r, i) => {
    const prev = rows[i - 1]
    if (!prev) return
    r.overlaps = r.from <= prev.to
    r.gapBefore = r.from > prev.to + 1
  })
  return {
    rows,
    unset: levels.filter((l) => !isNum(l[minField])),
    gapAtBottom: rows.length > 0 && rows[0].from > scale[0],
    gapAtTop: rows.length > 0 && rows[rows.length - 1].to < scale[1],
  }
}

export type Pair = { a: Entity; b: Entity; ab: number; ba: number }

export function asymmetricPairs(project: Project): Pair[] {
  const factions: Entity[] = data(project).factions ?? []
  const cells: Record<string, unknown> = data(project).relations?.cells ?? {}
  const out: Pair[] = []
  for (let i = 0; i < factions.length; i++)
    for (let j = i + 1; j < factions.length; j++) {
      const ab = cells[`${factions[i].id}|${factions[j].id}`]
      const ba = cells[`${factions[j].id}|${factions[i].id}`]
      if (isNum(ab) && isNum(ba) && Math.abs(ab - ba) > ASYMMETRY_TOLERANCE) out.push({ a: factions[i], b: factions[j], ab, ba })
    }
  return out
}

export const factionsOf = (project: Project): Entity[] => (Array.isArray(data(project).factions) ? data(project).factions : [])
export const relationCells = (project: Project): Record<string, unknown> => data(project).relations?.cells ?? {}
export const relationOf = (project: Project, fromId: string, toId: string): number | undefined => {
  const v = relationCells(project)[`${fromId}|${toId}`]
  return isNum(v) ? v : undefined
}

/** Ally / hostile cut-offs from the overview (defaults 50 / -50). */
export function standingMarks(project: Project): { allyAt: number; enemyAt: number } {
  const o = data(project).overview ?? {}
  return { allyAt: isNum(o.allyAt) ? o.allyAt : 50, enemyAt: isNum(o.enemyAt) ? o.enemyAt : -50 }
}

export type Standing = 'ally' | 'enemy' | 'neutral'
export const standingOf = (v: number, marks: { allyAt: number; enemyAt: number }): Standing => (v >= marks.allyAt ? 'ally' : v <= marks.enemyAt ? 'enemy' : 'neutral')

export type RelationPair = {
  a: Entity
  b: Entity
  ab?: number
  ba?: number
  /** Mean of the set directions; undefined when neither is set. */
  mean?: number
  standing?: Standing
  asymmetric: boolean
  /** Kinds of graph edges drawn between the two factions. */
  kinds: string[]
}

/** Every unordered pair of factions with both matrix directions, their standing and the named graph relationships. */
export function relationPairs(project: Project): RelationPair[] {
  const factions = factionsOf(project)
  const marks = standingMarks(project)
  const graph = data(project).relationGraph ?? { nodes: [], edges: [] }
  const refOf = new Map<string, string>((graph.nodes ?? []).map((n: any) => [n.id, n.refId]))
  const out: RelationPair[] = []
  for (let i = 0; i < factions.length; i++)
    for (let j = i + 1; j < factions.length; j++) {
      const a = factions[i]
      const b = factions[j]
      const ab = relationOf(project, a.id, b.id)
      const ba = relationOf(project, b.id, a.id)
      const set = [ab, ba].filter(isNum)
      const mean = set.length ? set.reduce((s, x) => s + x, 0) / set.length : undefined
      const kinds = (graph.edges ?? [])
        .filter((e: any) => {
          const s = refOf.get(e.source)
          const t = refOf.get(e.target)
          return (s === a.id && t === b.id) || (s === b.id && t === a.id)
        })
        .map((e: any) => String(e.kind ?? 'link'))
      out.push({ a, b, ab, ba, mean, standing: mean === undefined ? undefined : standingOf(mean, marks), asymmetric: isNum(ab) && isNum(ba) && Math.abs(ab - ba) > ASYMMETRY_TOLERANCE, kinds })
    }
  return out
}

export type FactionStanding = { faction: Entity; allies: Entity[]; enemies: Entity[]; neutral: Entity[]; unset: Entity[]; /** Mean of how the others regard this faction. */ regard?: number }

/** Per faction: who it counts as ally / enemy (by the pair mean) and how the others regard it on average. */
export function factionStandings(project: Project): FactionStanding[] {
  const pairs = relationPairs(project)
  return factionsOf(project).map((f) => {
    const s: FactionStanding = { faction: f, allies: [], enemies: [], neutral: [], unset: [] }
    for (const p of pairs) {
      if (p.a.id !== f.id && p.b.id !== f.id) continue
      const other = p.a.id === f.id ? p.b : p.a
      if (!p.standing) s.unset.push(other)
      else if (p.standing === 'ally') s.allies.push(other)
      else if (p.standing === 'enemy') s.enemies.push(other)
      else s.neutral.push(other)
    }
    const received = factionsOf(project).filter((o) => o.id !== f.id).map((o) => relationOf(project, o.id, f.id)).filter(isNum)
    if (received.length) s.regard = received.reduce((a, b) => a + b, 0) / received.length
    return s
  })
}

// ---------- Player reputation: levels and the action simulator ----------

export const levelsOf = (project: Project): Entity[] => (Array.isArray(data(project).thresholds) ? data(project).thresholds : [])
export const actionsOf = (project: Project): Entity[] => (Array.isArray(data(project).actions) ? data(project).actions : [])

/** Reputation a new game starts with: the overview value clamped to the scale, else 0 (or the scale middle when 0 is outside it). */
export function startValue(project: Project): number {
  const [lo, hi] = scaleOf(project)
  const v = data(project).overview?.startValue
  if (isNum(v)) return Math.max(lo, Math.min(hi, v))
  return lo <= 0 && hi >= 0 ? 0 : Math.round((lo + hi) / 2)
}

/** The relationship level (by the analysed ranges) a value falls into; the first match wins when ranges overlap. */
export function levelAt(project: Project, value: number): RangeRow | undefined {
  return analyzeRanges(levelsOf(project), scaleOf(project)).rows.find((r) => value >= r.from && value <= r.to)
}

/** Reputation change an action causes with one faction: the direct change for its own faction, else the spillover. */
export function actionEffect(action: Entity, factionId: string): number {
  if (action.faction === factionId) return isNum(action.effectOnFaction) ? action.effectOnFaction : 0
  if (!action.faction) return 0
  const own = action.spillover && typeof action.spillover === 'object' ? action.spillover[factionId] : undefined
  return isNum(own) ? own : isNum(action.spilloverDefault) ? action.spilloverDefault : 0
}

export type SimRow = {
  faction: Entity
  /** Value after each step; index 0 is the start. */
  values: number[]
  start: number
  end: number
  startLevel?: RangeRow
  endLevel?: RangeRow
  /** Steps (1-based) where the value entered another level. */
  crossings: { step: number; from?: RangeRow; to?: RangeRow }[]
}

/** Plays a sequence of actions from the starting value, clamping every step to the scale. Decay is not modelled. */
export function simulateActions(project: Project, actionIds: string[], start = startValue(project)): SimRow[] {
  const [lo, hi] = scaleOf(project)
  const byId = new Map(actionsOf(project).map((a) => [a.id, a]))
  const seq = actionIds.map((id) => byId.get(id)).filter((a): a is Entity => !!a)
  return factionsOf(project).map((f) => {
    const values = [start]
    for (const a of seq) values.push(Math.max(lo, Math.min(hi, values[values.length - 1] + actionEffect(a, f.id))))
    const crossings: SimRow['crossings'] = []
    let prev = levelAt(project, start)
    values.slice(1).forEach((v, i) => {
      const lvl = levelAt(project, v)
      if (lvl?.id !== prev?.id) crossings.push({ step: i + 1, from: prev, to: lvl })
      prev = lvl
    })
    const end = values[values.length - 1]
    return { faction: f, values, start, end, startLevel: levelAt(project, start), endLevel: levelAt(project, end), crossings }
  })
}

/** Overview markers that fall outside the scale or contradict each other (ally cut-off at or below the hostile one). */
export function markProblems(project: Project): string[] {
  const o = data(project).overview ?? {}
  const [lo, hi] = scaleOf(project)
  const out: string[] = []
  const outside = (v: unknown) => isNum(v) && (v < lo || v > hi)
  if (outside(o.startValue)) out.push(`starting value ${o.startValue}`)
  if (outside(o.allyAt)) out.push(`allied from ${o.allyAt}`)
  if (outside(o.enemyAt)) out.push(`hostile up to ${o.enemyAt}`)
  const m = standingMarks(project)
  if (m.allyAt <= m.enemyAt) out.push('allied cut-off not above the hostile one')
  return out
}

export type Disagreement ={ edge: string; kind: string; from: Entity; to: Entity; value: number }

/** Graph edges whose type contradicts the matrix value, using the Ally / Enemy thresholds from the overview. */
export function graphDisagreements(project: Project): Disagreement[] {
  const d = data(project)
  const factions: Entity[] = d.factions ?? []
  const cells: Record<string, unknown> = d.relations?.cells ?? {}
  const graph = d.relationGraph ?? { nodes: [], edges: [] }
  const allyAt = isNum(d.overview?.allyAt) ? d.overview.allyAt : 50
  const enemyAt = isNum(d.overview?.enemyAt) ? d.overview.enemyAt : -50
  const factionOf = (nodeId: string) => factions.find((f) => f.id === graph.nodes.find((n: any) => n.id === nodeId)?.refId)
  const out: Disagreement[] = []
  for (const e of graph.edges as { id: string; source: string; target: string; kind?: string }[]) {
    const from = factionOf(e.source)
    const to = factionOf(e.target)
    if (!from || !to) continue
    const values = [cells[`${from.id}|${to.id}`], cells[`${to.id}|${from.id}`]].filter(isNum)
    const bad = values.find((v) => (e.kind === 'Ally' && v < allyAt) || (e.kind === 'Enemy' && v > enemyAt))
    if (bad !== undefined) out.push({ edge: e.id, kind: e.kind!, from, to, value: bad })
  }
  return out
}
