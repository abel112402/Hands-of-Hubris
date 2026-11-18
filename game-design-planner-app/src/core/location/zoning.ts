import { inPolygon } from './geometry'
import type { LocationMap, MapObject, MapPoint as Pt, ZoneKind } from './types'
import { ZONE_KINDS } from './types'
import { objects } from './types/shared'

/**
 * Districts of a settlement: the settled area is cut into wards (a Voronoi diagram of relaxed random points), and
 * each ward gets a zone by rules that score where a market, a garrison, a temple quarter or workshops belong.
 * Pure geometry and rules; the settlement generator turns the result into `district` objects.
 */

// ---------- Geometry ----------

export function area(poly: Pt[]): number {
  let a = 0
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1]
  return Math.abs(a) / 2
}

export function centroid(poly: Pt[]): Pt {
  let [cx, cy, a] = [0, 0, 0]
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const f = poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1]
    cx += (poly[j][0] + poly[i][0]) * f
    cy += (poly[j][1] + poly[i][1]) * f
    a += f
  }
  if (Math.abs(a) < 1e-9) return poly.reduce<Pt>((s, p) => [s[0] + p[0] / poly.length, s[1] + p[1] / poly.length], [0, 0])
  return [cx / (3 * a), cy / (3 * a)]
}

/** Convex hull (monotone chain), counter-clockwise in screen terms. */
export function convexHull(points: Pt[]): Pt[] {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  if (pts.length < 3) return pts
  const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const half = (list: Pt[]) => {
    const out: Pt[] = []
    for (const p of list) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], p) <= 0) out.pop()
      out.push(p)
    }
    out.pop()
    return out
  }
  return [...half(pts), ...half([...pts].reverse())]
}

/** The part of a convex polygon on the side of the line through `a` that `inside` lies on. */
function clip(poly: Pt[], a: Pt, normal: Pt): Pt[] {
  const side = (p: Pt) => (p[0] - a[0]) * normal[0] + (p[1] - a[1]) * normal[1]
  const out: Pt[] = []
  for (let i = 0; i < poly.length; i++) {
    const [p, q] = [poly[i], poly[(i + 1) % poly.length]]
    const [sp, sq] = [side(p), side(q)]
    if (sp <= 0) out.push(p)
    if (sp <= 0 !== sq <= 0) {
      const t = sp / (sp - sq)
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t])
    }
  }
  return out
}

/** The part of a convex polygon inside the box [x0, y0, x1, y1]. */
export function clipToBox(poly: Pt[], [x0, y0, x1, y1]: [number, number, number, number]): Pt[] {
  const sides: [Pt, Pt][] = [
    [[x0, 0], [-1, 0]],
    [[x1, 0], [1, 0]],
    [[0, y0], [0, -1]],
    [[0, y1], [0, 1]],
  ]
  return sides.reduce((p, [a, n]) => clip(p, a, n), poly)
}

/** The Voronoi cell of each seed inside a convex boundary: what lies nearer to that seed than to any other. */
export function voronoi(seeds: Pt[], bound: Pt[]): Pt[][] {
  return seeds.map((s, i) => {
    let cell = bound
    for (let j = 0; j < seeds.length && cell.length >= 3; j++) {
      if (i === j) continue
      const o = seeds[j]
      const mid: Pt = [(s[0] + o[0]) / 2, (s[1] + o[1]) / 2]
      cell = clip(cell, mid, [o[0] - s[0], o[1] - s[1]])
    }
    return cell
  })
}

/** Moves every seed to the middle of its cell a few times, so the cells even out (Lloyd's relaxation). */
export function relax(seeds: Pt[], bound: Pt[], rounds: number): Pt[] {
  let out = seeds
  for (let r = 0; r < rounds; r++) out = voronoi(out, bound).map((cell, i) => (cell.length >= 3 ? centroid(cell) : out[i]))
  return out
}

/** Cells that share a stretch of border. */
export function neighbours(cells: Pt[][]): number[][] {
  const near = (p: Pt, q: Pt) => Math.abs(p[0] - q[0]) < 0.5 && Math.abs(p[1] - q[1]) < 0.5
  return cells.map((a, i) => cells.flatMap((b, j) => (i !== j && a.filter((p) => b.some((q) => near(p, q))).length >= 2 ? [j] : [])))
}

// ---------- Rules ----------

/** What a ward is like, as the rules see it. */
export type Ward = {
  /** 0 in the middle of the settlement, 1 at its edge. */
  outward: number
  /** A main road (trade route) runs through it. */
  mainRoad: boolean
  /** It touches the town wall. */
  wall: boolean
  /** A gate opens into it. */
  gate: boolean
  /** It touches a river, the sea or a pond. */
  water: boolean
}

export type ZoneRule = {
  kind: Exclude<ZoneKind, 'residential'>
  label: string
  /** Higher is a better place for this zone. */
  score: (w: Ward) => number
  /** Zones it should not border. */
  avoid?: ZoneKind[]
}

/** In the order they choose: each takes the best wards still free. Residential gets what is left. */
export const ZONE_RULES: ZoneRule[] = [
  { kind: 'market', label: 'Market', score: (w) => (w.mainRoad ? 3 : 0) + 2 * (1 - w.outward) + (w.gate ? 0.5 : 0) },
  { kind: 'military', label: 'Garrison', score: (w) => (w.gate ? 3 : 0) + (w.wall ? 2 : 0) + w.outward },
  { kind: 'sacred', label: 'Temple quarter', score: (w) => 2.5 * (1 - w.outward) + (w.mainRoad ? 0 : 1) - (w.gate ? 1 : 0) },
  { kind: 'industrial', label: 'Craft quarter', score: (w) => (w.water ? 3 : 0) + 2 * w.outward + (w.mainRoad ? 0.5 : 0), avoid: ['sacred'] },
]
export const ZONE_LABEL: Record<ZoneKind, string> = {
  residential: 'Residential',
  ...(Object.fromEntries(ZONE_RULES.map((r) => [r.kind, r.label])) as Record<Exclude<ZoneKind, 'residential'>, string>),
}

export type ZoneShares = Partial<Record<Exclude<ZoneKind, 'residential'>, number>>

/**
 * How many of `n` wards each zone gets from percentage shares: rounded, at least one for any share above 0,
 * and at least one ward left for homes when there are two or more.
 */
export function zoneCounts(n: number, shares: ZoneShares): Record<ZoneKind, number> {
  const counts = Object.fromEntries(ZONE_KINDS.map((k) => [k, 0])) as Record<ZoneKind, number>
  for (const rule of ZONE_RULES) {
    const share = Math.max(0, Math.min(100, shares[rule.kind] ?? 0))
    if (share > 0) counts[rule.kind] = Math.max(1, Math.round((n * share) / 100))
  }
  const room = n > 1 ? n - 1 : n
  // Too many: take wards back from the biggest zone, last in priority on ties.
  for (let total = ZONE_RULES.reduce((s, r) => s + counts[r.kind], 0); total > room; total--) {
    const most = [...ZONE_RULES].reverse().reduce((best, r) => (counts[r.kind] > counts[best.kind] ? r : best))
    counts[most.kind]--
  }
  counts.residential = n - ZONE_RULES.reduce((s, r) => s + counts[r.kind], 0)
  return counts
}

/** Gives every ward a zone: each rule in turn takes its best-scoring free wards. Ties keep ward order. */
export function assignZones(wards: Ward[], counts: Record<ZoneKind, number>, adjacent: number[][]): ZoneKind[] {
  const out: (ZoneKind | undefined)[] = wards.map(() => undefined)
  for (const rule of ZONE_RULES) {
    for (let k = 0; k < counts[rule.kind]; k++) {
      let best = -1
      let bestScore = -Infinity
      wards.forEach((w, i) => {
        if (out[i]) return
        const clash = (rule.avoid ?? []).some((z) => adjacent[i]?.some((j) => out[j] === z))
        const s = rule.score(w) - (clash ? 4 : 0)
        if (s > bestScore) [best, bestScore] = [i, s]
      })
      if (best < 0) break
      out[best] = rule.kind
    }
  }
  return out.map((z) => z ?? 'residential')
}

// ---------- Reading a map ----------

export const districtsOf = (map: LocationMap): MapObject[] => objects(map, 'districts', 'district')
export const zoneOf = (o: MapObject | undefined): ZoneKind => {
  const z = o?.props?.zone
  return typeof z === 'string' && (ZONE_KINDS as readonly string[]).includes(z) ? (z as ZoneKind) : 'residential'
}
/** The district a point lies in, if any. */
export const districtAt = (map: LocationMap, p: Pt): MapObject | undefined => districtsOf(map).find((d) => d.points && inPolygon(p, d.points))
