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

export type Disagreement = { edge: string; kind: string; from: Entity; to: Entity; value: number }

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
