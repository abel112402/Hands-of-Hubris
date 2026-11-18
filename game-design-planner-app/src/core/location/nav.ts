import { distToPolyline, inPolygon } from './geometry'
import { MinHeap } from './heap'
import { KINDS, type NavRule } from './objects'
import { cellCentre, cellIndex, gridOf, sample } from './raster'
import { inRoom } from './rooms'
import type { LocationMap, MapObject, MapPoint as Pt, NavSpec } from './types'

/**
 * Walkability of a map as a grid, read from its objects (each kind's `nav` rule in objects.ts) and from the
 * hand-painted `navOverride` field. Derived, never stored. Used to check that what matters can be reached, to
 * find paths, and by the engine exports.
 */
export type NavGrid = {
  cell: number
  cols: number
  rows: number
  /** Cost of stepping into a cell; 0 = blocked. */
  cost: Uint8Array
  /** Bit flags per cell, see TAG. */
  tags: Uint8Array
  /** Lock id of locked door cells. */
  locks: Map<number, string>
}
export const TAG = { water: 1, door: 2, locked: 4, secret: 8 } as const

/** Values of the `navOverride` field. */
export const OVERRIDE = { none: 0, walk: 1, block: 2 } as const

const GROUND_COST = 2
/** Nav grids are never stored, but stay a reasonable size for any map. */
const MAX_SIDE = 400
const PASSES: NavRule['effect'][] = ['floor', 'water', 'cost', 'block', 'opening']

/** The cells whose centre lies in the shape, scanning only the shape's bounding box. */
function cellsIn(g: NavGrid, bounds: [number, number, number, number], test: (p: Pt) => boolean): number[] {
  const [x0, y0, x1, y1] = bounds
  const out: number[] = []
  const c0 = Math.max(0, Math.floor(x0 / g.cell))
  const c1 = Math.min(g.cols - 1, Math.floor(x1 / g.cell))
  const r0 = Math.max(0, Math.floor(y0 / g.cell))
  const r1 = Math.min(g.rows - 1, Math.floor(y1 / g.cell))
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const i = r * g.cols + c
      if (test(cellCentre(g, i))) out.push(i)
    }
  }
  return out
}

const boundsOf = (pts: Pt[], pad: number): [number, number, number, number] => [
  Math.min(...pts.map((p) => p[0])) - pad,
  Math.min(...pts.map((p) => p[1])) - pad,
  Math.max(...pts.map((p) => p[0])) + pad,
  Math.max(...pts.map((p) => p[1])) + pad,
]

/** The cells an object covers under its rule; `pad` grows (or with a negative value shrinks) a box. */
function footprint(g: NavGrid, o: MapObject, rule: NavRule, pad = 0): number[] {
  if (o.points?.length && rule.line !== undefined) {
    const width = typeof o.props?.width === 'number' ? o.props.width : rule.line
    // At least most of a cell wide, so a diagonal line still joins up cell to cell.
    const r = Math.max(width / 2, g.cell * 0.75)
    const closed = KINDS[o.kind]?.shape === 'outline'
    return cellsIn(g, boundsOf(o.points, r), (p) => distToPolyline(p, o.points!, closed) <= r)
  }
  if (o.points && o.points.length > 2) return cellsIn(g, boundsOf(o.points, 0), (p) => inPolygon(p, o.points!))
  if (o.w || o.h) {
    // Boxes, or the floor of a shaped room inside its box (rooms.ts).
    const r = Math.hypot(o.w ?? 0, o.h ?? 0) / 2 + Math.max(pad, 0)
    return cellsIn(g, [o.x - r, o.y - r, o.x + r, o.y + r], (p) => inRoom(o, p, pad))
  }
  const i = cellIndex(g, [o.x, o.y])
  return i < 0 ? [] : [i]
}

function paint(g: NavGrid, o: MapObject, rule: NavRule) {
  const { cost, tags } = g
  switch (rule.effect) {
    case 'floor':
      if (rule.walled) {
        // The whole room is wall first, then its inside (half a cell in from every edge) is floor, so a wall
        // shared with the next room keeps at least one blocked cell between them.
        for (const i of footprint(g, o, rule)) cost[i] = 0
        for (const i of footprint(g, o, rule, -g.cell * 0.6)) [cost[i], tags[i]] = [rule.cost ?? 1, 0]
      } else for (const i of footprint(g, o, rule)) [cost[i], tags[i]] = [rule.cost ?? 1, 0]
      return
    case 'water':
      for (const i of footprint(g, o, rule)) {
        if (!cost[i]) continue
        cost[i] = Math.max(cost[i], rule.cost ?? 20)
        tags[i] |= TAG.water
      }
      return
    case 'cost':
      for (const i of footprint(g, o, rule)) if (cost[i]) cost[i] = Math.max(cost[i], rule.cost ?? 3)
      return
    case 'block':
      for (const i of footprint(g, o, rule)) [cost[i], tags[i]] = [0, 0]
      return
    case 'opening': {
      const door = o.kind === 'door' || o.kind === 'gate'
      const secret = o.secret === true || o.props?.style === 'secret'
      for (const i of footprint(g, o, rule, g.cell * 0.6)) {
        cost[i] = 1
        tags[i] = (door ? TAG.door : 0) | (o.lock ? TAG.locked : 0) | (secret ? TAG.secret : 0)
        if (o.lock) g.locks.set(i, o.lock)
        else g.locks.delete(i)
      }
    }
  }
}

/** Builds the grid. `layerOrder` is the drawing order; within an effect, later objects paint over earlier ones. */
export function buildNav(map: LocationMap, spec: NavSpec, layerOrder: string[]): NavGrid {
  const cell = Math.max(spec.cell, Math.ceil(Math.max(map.w, map.h) / MAX_SIDE))
  const cols = Math.ceil(map.w / cell)
  const rows = Math.ceil(map.h / cell)
  const g: NavGrid = { cell, cols, rows, cost: new Uint8Array(cols * rows).fill(spec.open ? GROUND_COST : 0), tags: new Uint8Array(cols * rows), locks: new Map() }
  const order = [...layerOrder, ...Object.keys(map.layers).filter((id) => !layerOrder.includes(id))]
  const all = order.flatMap((id) => map.layers[id]?.objects ?? [])
  for (const pass of PASSES) {
    for (const o of all) {
      const rule = KINDS[o.kind]?.nav
      if (rule?.effect === pass) paint(g, o, rule)
    }
  }
  const override = map.fields?.navOverride && gridOf(map.fields.navOverride)
  if (override) {
    for (let i = 0; i < g.cost.length; i++) {
      const v = sample(override, cellCentre(g, i))
      if (v === OVERRIDE.walk) [g.cost[i], g.tags[i]] = [1, 0]
      else if (v === OVERRIDE.block) [g.cost[i], g.tags[i]] = [0, 0]
      if (v) g.locks.delete(i)
    }
  }
  return g
}

export type PassOptions = {
  /** Lock ids whose key is held; 'all' (default) opens every lock. */
  open?: 'all' | ReadonlySet<string>
  /** Secret doors count as found (default true). */
  secrets?: boolean
  /** Water may be waded or swum (default true). */
  water?: boolean
}

export function passable(g: NavGrid, i: number, opts: PassOptions = {}): boolean {
  if (i < 0 || i >= g.cost.length || !g.cost[i]) return false
  const t = g.tags[i]
  if (t & TAG.locked && opts.open !== undefined && opts.open !== 'all' && !opts.open.has(g.locks.get(i) ?? '')) return false
  if (t & TAG.secret && opts.secrets === false) return false
  if (t & TAG.water && opts.water === false) return false
  return true
}

const STEPS: [number, number, number][] = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
]

/** The cells one step from `i`: eight directions, and no cutting a blocked corner. */
function* stepsFrom(g: NavGrid, i: number, opts: PassOptions): Generator<[number, number]> {
  const c = i % g.cols
  const r = Math.floor(i / g.cols)
  for (const [dc, dr, len] of STEPS) {
    const [nc, nr] = [c + dc, r + dr]
    if (nc < 0 || nr < 0 || nc >= g.cols || nr >= g.rows) continue
    const j = nr * g.cols + nc
    if (!passable(g, j, opts)) continue
    if (dc && dr && (!passable(g, r * g.cols + nc, opts) || !passable(g, nr * g.cols + c, opts))) continue
    yield [j, len]
  }
}

/** The walkable cell nearest a point within `radius` map units, or -1. */
export function nearestOpen(g: NavGrid, p: Pt, opts: PassOptions = {}, radius = 40): number {
  const at = cellIndex(g, p)
  if (passable(g, at, opts)) return at
  const span = Math.ceil(radius / g.cell)
  const [c0, r0] = [Math.floor(p[0] / g.cell), Math.floor(p[1] / g.cell)]
  let best = -1
  let bestD = Infinity
  for (let dr = -span; dr <= span; dr++) {
    for (let dc = -span; dc <= span; dc++) {
      const [c, r] = [c0 + dc, r0 + dr]
      if (c < 0 || r < 0 || c >= g.cols || r >= g.rows) continue
      const i = r * g.cols + c
      const d = Math.hypot(dc, dr)
      if (d < bestD && d * g.cell <= radius && passable(g, i, opts)) [best, bestD] = [i, d]
    }
  }
  return best
}

/** Every cell reachable from a point (1 = reached). Empty when the point is not near a walkable cell. */
export function reachable(g: NavGrid, from: Pt, opts: PassOptions = {}): Uint8Array {
  const seen = new Uint8Array(g.cost.length)
  const start = nearestOpen(g, from, opts)
  if (start < 0) return seen
  seen[start] = 1
  const stack = [start]
  while (stack.length) {
    const i = stack.pop()!
    for (const [j] of stepsFrom(g, i, opts)) {
      if (seen[j]) continue
      seen[j] = 1
      stack.push(j)
    }
  }
  return seen
}

/**
 * The cheapest walk between two points (A* over the grid, eight directions), as cell centres from start to end;
 * null when there is none.
 */
export function findPath(g: NavGrid, from: Pt, to: Pt, opts: PassOptions = {}): Pt[] | null {
  const start = nearestOpen(g, from, opts)
  const goal = nearestOpen(g, to, opts)
  if (start < 0 || goal < 0) return null
  const n = g.cost.length
  const spent = new Float64Array(n).fill(Infinity)
  const came = new Int32Array(n).fill(-1)
  const [gc, gr] = [goal % g.cols, Math.floor(goal / g.cols)]
  // Octile distance: never more than the true cost, since every step costs at least 1.
  const guess = (i: number) => {
    const dx = Math.abs((i % g.cols) - gc)
    const dy = Math.abs(Math.floor(i / g.cols) - gr)
    return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy)
  }
  spent[start] = 0
  const open = new MinHeap()
  open.push(start, guess(start))
  const done = new Uint8Array(n)
  while (open.size) {
    const i = open.pop()[1]
    if (i === goal) break
    if (done[i]) continue
    done[i] = 1
    for (const [j, len] of stepsFrom(g, i, opts)) {
      const s = spent[i] + len * g.cost[j]
      if (s >= spent[j]) continue
      spent[j] = s
      came[j] = i
      open.push(j, s + guess(j))
    }
  }
  if (start !== goal && came[goal] < 0) return null
  const out: Pt[] = []
  for (let i = goal; i >= 0; i = came[i]) out.push(cellCentre(g, i))
  return out.reverse()
}
