import type { Entity } from '../../model/types'
import { blob, dist, distToPolyline, inPolygon, toDeg } from '../geometry'
import { MinHeap } from '../heap'
import { lightOf } from '../light'
import { fractal, simplex2 } from '../noise'
import { fieldOf, gridOf } from '../raster'
import type { Rng } from '../rng'
import type { GenContext, LayerDef, LayerOutput, LocationMap, LocationTypeDef, MapPoint as Pt, NewMapObject } from '../types'
import { catalogRefs, clamp, objects, outlineOf, path, pos, refsOf, sizeKey, touches } from './shared'

/**
 * Cave: an organic floor cut out of rock. The floor is made on a grid by one of three methods, always joined into
 * one piece, and its outline is traced into smooth shapes for drawing:
 * - Cellular automata (default): random rock and floor, smoothed until walls settle into natural shapes.
 * - Simplex noise: a warped fractal noise field, cut at the level that leaves the wanted share of floor.
 * - Chambers and tunnels: oval chambers dug out and joined by winding tunnels.
 * The chambers input opens that many clearings in every method. The grid is kept as the `rock` field (0 floor,
 * 1 rock), the base for carving by hand later. The chambers layer finds the open hollows of the floor and how they
 * join, which gives a cave the same room graph and measures a dungeon has.
 * Layers, bottom to top: rock, entrances, cavern, chambers, water, features, contents, labels. The entrance
 * tunnels are drawn under the cavern but generated after it.
 */
const SCALES = {
  Small: { w: 800, h: 560, chambers: 4 },
  Medium: { w: 1000, h: 700, chambers: 6 },
  Large: { w: 1200, h: 840, chambers: 9 },
}
const scaleOf = (location: Entity) => SCALES[sizeKey(location)]
const OPENNESS: Record<string, number> = { Tight: 0.8, Normal: 1, Open: 1.3 }
export const CAVE_METHODS = ['Cellular automata', 'Simplex noise', 'Chambers and tunnels'] as const
/** Grid cell of the chambers-and-tunnels method, and the finer one of the organic methods. */
const CELL = 20
const FINE = 12
const BORDER = 2
const MAX_OUTLINE = 380

export type Grid = { cell: number; cols: number; rows: number; floor: boolean[] }
const blank = (w: number, h: number, cell: number): Grid => {
  const [cols, rows] = [Math.floor(w / cell), Math.floor(h / cell)]
  return { cell, cols, rows, floor: new Array(cols * rows).fill(false) }
}
const at = (g: Grid, x: number, y: number) => x >= 0 && y >= 0 && x < g.cols && y < g.rows && g.floor[y * g.cols + x]
const inner = (g: Grid, x: number, y: number) => x >= BORDER && y >= BORDER && x < g.cols - BORDER && y < g.rows - BORDER
const dig = (g: Grid, x: number, y: number) => {
  if (inner(g, x, y)) g.floor[y * g.cols + x] = true
}
const digDisc = (g: Grid, x: number, y: number, r: number) => {
  for (let by = -Math.ceil(r); by <= r; by++) for (let bx = -Math.ceil(r); bx <= r; bx++) if (Math.hypot(bx, by) <= r) dig(g, x + bx, y + by)
}

/** Centres for `count` chambers, kept apart (the spacing relaxes when the map fills up). */
function chamberCentres(g: Grid, count: number, rand: Rng): [number, number][] {
  const out: [number, number][] = []
  const k = CELL / g.cell
  const margin = Math.round(5 * k)
  for (let tries = 0; tries < 400 && out.length < count; tries++) {
    const c: [number, number] = [rand.int(margin, g.cols - margin - 1), rand.int(margin, g.rows - margin - 1)]
    if (out.every((o) => Math.hypot(o[0] - c[0], o[1] - c[1]) >= (tries < 200 ? 8 : 5) * k)) out.push(c)
  }
  return out
}

/** Digs an oval clearing at each centre; sizes are in units of the coarse grid, so every method makes similar rooms. */
function clearings(g: Grid, centres: [number, number][], openness: number, rand: Rng, scale = 1) {
  const k = (CELL / g.cell) * scale
  for (const [cx, cy] of centres) {
    const [rx, ry] = [rand.range(3.4, 5.8) * openness * k, rand.range(2.8, 4.6) * openness * k]
    for (let y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y++) for (let x = Math.floor(cx - rx - 1); x <= cx + rx + 1; x++) if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1 + rand.range(-0.25, 0.25)) dig(g, x, y)
  }
}

/** Walls among the eight neighbours; outside the grid counts as wall. */
const wallsAround = (g: Grid, x: number, y: number) => {
  let n = 0
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && !at(g, x + dx, y + dy)) n++
  return n
}

/** One round of the cave rule: a cell with five or more walls round it turns to rock, one with three or fewer to floor. */
function smooth(g: Grid, rockAt = 5, floorAt = 3) {
  const next = g.floor.slice()
  for (let y = BORDER; y < g.rows - BORDER; y++) {
    for (let x = BORDER; x < g.cols - BORDER; x++) {
      const walls = wallsAround(g, x, y)
      if (walls >= rockAt) next[y * g.cols + x] = false
      else if (walls <= floorAt) next[y * g.cols + x] = true
    }
  }
  g.floor = next
}

/** Pieces of floor, each a list of cell indices, largest first (four-way neighbours). */
export function regions(g: Grid): number[][] {
  const label = new Int32Array(g.floor.length).fill(-1)
  const out: number[][] = []
  for (let i = 0; i < g.floor.length; i++) {
    if (!g.floor[i] || label[i] >= 0) continue
    const cells: number[] = []
    const stack = [i]
    label[i] = out.length
    while (stack.length) {
      const c = stack.pop()!
      cells.push(c)
      const [x, y] = [c % g.cols, Math.floor(c / g.cols)]
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        const n = ny * g.cols + nx
        if (at(g, nx, ny) && label[n] < 0) {
          label[n] = out.length
          stack.push(n)
        }
      }
    }
    out.push(cells)
  }
  return out.sort((a, b) => b.length - a.length)
}

/**
 * Makes the floor one piece: every piece of at least `keep` cells is tunnelled to the main one (a walk that heads
 * for the nearest main cell and sometimes strays); smaller crumbs are filled with rock.
 */
function connect(g: Grid, rand: Rng, keep = 8) {
  const pieces = regions(g)
  if (pieces.length < 2) return
  const main = new Set(pieces[0])
  const mainCells = pieces[0]
  for (const piece of pieces.slice(1)) {
    if (piece.length < keep) {
      for (const c of piece) g.floor[c] = false
      continue
    }
    // The pair of cells, one in each piece, that are nearest (sampled to stay quick).
    let best: [number, number, number] = [piece[0], mainCells[0], Infinity]
    const stride = Math.max(1, Math.floor(mainCells.length / 400))
    for (const a of piece.filter((_, i) => i % Math.max(1, Math.floor(piece.length / 60)) === 0)) {
      for (let k = 0; k < mainCells.length; k += stride) {
        const b = mainCells[k]
        const d = Math.hypot((a % g.cols) - (b % g.cols), Math.floor(a / g.cols) - Math.floor(b / g.cols))
        if (d < best[2]) best = [a, b, d]
      }
    }
    let [x, y] = [best[0] % g.cols, Math.floor(best[0] / g.cols)]
    const [tx, ty] = [best[1] % g.cols, Math.floor(best[1] / g.cols)]
    for (let steps = 0; steps < 600 && !main.has(y * g.cols + x); steps++) {
      if (rand.chance(0.8)) {
        if (Math.abs(tx - x) > Math.abs(ty - y)) x += Math.sign(tx - x)
        else y += Math.sign(ty - y)
      } else if (rand.chance(0.5)) x = clamp(x + rand.pick([-1, 1]), BORDER, g.cols - BORDER - 1)
      else y = clamp(y + rand.pick([-1, 1]), BORDER, g.rows - BORDER - 1)
      digDisc(g, x, y, 1)
    }
    for (const c of piece) main.add(c)
  }
  // Whatever is still apart (a walk that ran out of steps) is filled in.
  const after = regions(g)
  for (const piece of after.slice(1)) for (const c of piece) g.floor[c] = false
}

/** The chambers-and-tunnels floor (the first cave method). Always one piece. */
export function carve(w: number, h: number, chambers: number, openness: number, rand: Rng): Grid {
  const g = blank(w, h, CELL)
  const centres = chamberCentres(g, chambers, rand)
  clearings(g, centres, openness, rand)
  // Each chamber is tunnelled to the nearest one before it: a walk that mostly heads for its target and sometimes strays.
  const spine: [number, number][] = centres.map((c) => [c[0], c[1]])
  const brush = openness > 1.1 ? 2 : openness < 0.9 ? 1 : 1.5
  for (let i = 1; i < centres.length; i++) {
    const target = centres.slice(0, i).reduce((best, c) => (Math.hypot(c[0] - centres[i][0], c[1] - centres[i][1]) < Math.hypot(best[0] - centres[i][0], best[1] - centres[i][1]) ? c : best))
    let [x, y] = centres[i]
    for (let steps = 0; steps < 400 && (x !== target[0] || y !== target[1]); steps++) {
      const [dx, dy] = [target[0] - x, target[1] - y]
      if (rand.chance(0.72)) {
        if (Math.abs(dx) > Math.abs(dy) || (dy === 0 && dx !== 0)) x += Math.sign(dx)
        else y += Math.sign(dy)
      } else if (rand.chance(0.5)) x = clamp(x + rand.pick([-1, 1]), BORDER, g.cols - BORDER - 1)
      else y = clamp(y + rand.pick([-1, 1]), BORDER, g.rows - BORDER - 1)
      spine.push([x, y])
      digDisc(g, x, y, brush)
    }
  }
  for (let pass = 0; pass < 2; pass++) smooth(g, 6, 2)
  // Smoothing can pinch a tunnel shut; the walked cells are opened again, which keeps every chamber reachable.
  for (const [x, y] of spine) dig(g, x, y)
  connect(g, rand, Infinity)
  return g
}

/**
 * Cellular automata: each inner cell starts as floor with a chance set by the openness, the chambers are dug as
 * clearings, and `passes` rounds of the cave rule turn the noise into rounded halls and winding passages.
 */
export function cellular(w: number, h: number, chambers: number, openness: number, rand: Rng, passes = 5): Grid {
  const g = blank(w, h, FINE)
  const fill = clamp(0.46 * openness, 0.34, 0.6)
  for (let y = BORDER; y < g.rows - BORDER; y++) for (let x = BORDER; x < g.cols - BORDER; x++) g.floor[y * g.cols + x] = rand.chance(fill)
  clearings(g, chamberCentres(g, chambers, rand), openness, rand, 0.8)
  for (let pass = 0; pass < passes; pass++) smooth(g)
  connect(g, rand)
  return g
}

/**
 * Simplex noise: fractal noise, warped by a second noise so outlines meander, fades to rock near the edges and
 * rises at the chambers; floor is everything above the level that leaves the wanted share of floor.
 */
export function noisy(w: number, h: number, chambers: number, openness: number, rand: Rng): Grid {
  const g = blank(w, h, FINE)
  const field = fractal(simplex2(rand), 4)
  const warp = fractal(simplex2(rand), 2)
  const f = g.cell / 170
  const centres = chamberCentres(g, chambers, rand)
  const reach = (CELL / g.cell) * 5 * openness
  const values = new Float64Array(g.floor.length).fill(-Infinity)
  for (let y = BORDER; y < g.rows - BORDER; y++) {
    for (let x = BORDER; x < g.cols - BORDER; x++) {
      const [wx, wy] = [warp(x * f * 0.7, y * f * 0.7) * 1.4, warp(x * f * 0.7 + 31.7, y * f * 0.7 + 17.3) * 1.4]
      let v = field(x * f + wx, y * f + wy)
      const edge = Math.min(x - BORDER, y - BORDER, g.cols - BORDER - 1 - x, g.rows - BORDER - 1 - y) / (Math.min(g.cols, g.rows) * 0.12)
      v -= (1 - clamp(edge, 0, 1)) * 0.7
      for (const [cx, cy] of centres) v += 0.55 * Math.exp(-(((x - cx) ** 2 + (y - cy) ** 2) / reach ** 2))
      values[y * g.cols + x] = v
    }
  }
  const share = clamp(0.4 * openness, 0.28, 0.58)
  const sorted = Array.from(values).filter(Number.isFinite).sort((a, b) => a - b)
  const level = sorted[Math.floor(sorted.length * (1 - share))] ?? 0
  for (let i = 0; i < values.length; i++) g.floor[i] = values[i] > level
  smooth(g)
  connect(g, rand)
  return g
}

/**
 * The outlines of the floor: each loop of edges between floor and rock, as the midpoints of those edges (which
 * rounds off the grid's corners). The first loop is the outer wall; the rest are rock standing inside the cave.
 */
export function trace(g: Grid): Pt[][] {
  type Edge = { from: string; to: string; mid: Pt; used?: boolean }
  const edges: Edge[] = []
  const key = (x: number, y: number) => `${x},${y}`
  const c = g.cell
  for (let y = 0; y < g.rows; y++) {
    for (let x = 0; x < g.cols; x++) {
      if (!at(g, x, y)) continue
      // Clockwise around each floor cell, so loops come out with a consistent winding.
      if (!at(g, x, y - 1)) edges.push({ from: key(x, y), to: key(x + 1, y), mid: [(x + 0.5) * c, y * c] })
      if (!at(g, x + 1, y)) edges.push({ from: key(x + 1, y), to: key(x + 1, y + 1), mid: [(x + 1) * c, (y + 0.5) * c] })
      if (!at(g, x, y + 1)) edges.push({ from: key(x + 1, y + 1), to: key(x, y + 1), mid: [(x + 0.5) * c, (y + 1) * c] })
      if (!at(g, x - 1, y)) edges.push({ from: key(x, y + 1), to: key(x, y), mid: [x * c, (y + 0.5) * c] })
    }
  }
  const starting = new Map<string, Edge[]>()
  for (const e of edges) starting.set(e.from, [...(starting.get(e.from) ?? []), e])
  const loops: Pt[][] = []
  for (const first of edges) {
    if (first.used) continue
    const loop: Pt[] = []
    for (let e: Edge | undefined = first; e && !e.used; e = starting.get(e.to)?.find((n) => !n.used)) {
      e.used = true
      loop.push(e.mid)
    }
    if (loop.length >= 4) loops.push(loop)
  }
  const area = (pts: Pt[]) => Math.abs(pts.reduce((s, p, i) => s + p[0] * pts[(i + 1) % pts.length][1] - pts[(i + 1) % pts.length][0] * p[1], 0)) / 2
  return loops.sort((a, b) => area(b) - area(a))
}

/**
 * Open hollows of the floor and how they join: the floor cells farthest from any wall (a distance transform) that
 * stand clear of each other are chamber centres; every floor cell then belongs to the nearest centre walking along
 * the floor, and two chambers are linked where their cells meet.
 */
export type Hollows = {
  /** Chamber centres in map units, roomiest first. */
  centres: Pt[]
  /** Distance from each centre to the nearest wall, in map units. */
  radii: number[]
  /** Pairs of chamber indices whose floor meets. */
  links: [number, number][]
}
export function hollows(g: Grid, max: number): Hollows {
  const n = g.floor.length
  const depth = new Int32Array(n).fill(-1)
  const queue: number[] = []
  for (let i = 0; i < n; i++) if (!g.floor[i]) [depth[i], queue[queue.length]] = [0, i]
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head]
    const [x, y] = [i % g.cols, Math.floor(i / g.cols)]
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const [nx, ny] = [x + dx, y + dy]
        if (nx < 0 || ny < 0 || nx >= g.cols || ny >= g.rows) continue
        const j = ny * g.cols + nx
        if (depth[j] < 0) {
          depth[j] = depth[i] + 1
          queue.push(j)
        }
      }
    }
  }
  const order = Array.from({ length: n }, (_, i) => i).filter((i) => g.floor[i] && depth[i] >= 2).sort((a, b) => depth[b] - depth[a] || a - b)
  const picked: number[] = []
  const xy = (i: number): [number, number] => [i % g.cols, Math.floor(i / g.cols)]
  for (const i of order) {
    if (picked.length >= max) break
    const [x, y] = xy(i)
    if (picked.every((j) => Math.hypot(x - xy(j)[0], y - xy(j)[1]) >= Math.max(depth[i], depth[j]) * 1.7 + 1)) picked.push(i)
  }
  // Floor cells by nearest chamber along the floor.
  const owner = new Int32Array(n).fill(-1)
  const walk: number[] = []
  picked.forEach((i, k) => {
    owner[i] = k
    walk.push(i)
  })
  const contact = new Map<string, number>()
  for (let head = 0; head < walk.length; head++) {
    const i = walk[head]
    const [x, y] = xy(i)
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (!at(g, nx, ny)) continue
      const j = ny * g.cols + nx
      if (owner[j] < 0) {
        owner[j] = owner[i]
        walk.push(j)
      } else if (owner[j] !== owner[i]) {
        const k = `${Math.min(owner[i], owner[j])}-${Math.max(owner[i], owner[j])}`
        contact.set(k, (contact.get(k) ?? 0) + 1)
      }
    }
  }
  const links = [...contact.entries()].filter(([, c]) => c >= 2).map(([k]) => k.split('-').map(Number) as [number, number])
  return {
    centres: picked.map((i) => [(xy(i)[0] + 0.5) * g.cell, (xy(i)[1] + 0.5) * g.cell] as Pt),
    radii: picked.map((i) => depth[i] * g.cell),
    links,
  }
}

const thin = (pts: Pt[], max: number): Pt[] => {
  const stride = Math.ceil(pts.length / max)
  return stride > 1 ? pts.filter((_, i) => i % stride === 0) : pts
}

/** The cave floor of a map as a grid: from its rock field, or for older maps from the drawn outline. */
export function floorOf(map: LocationMap): Grid | null {
  const field = map.fields?.rock && gridOf(map.fields.rock)
  if (field) return { cell: field.cell, cols: field.cols, rows: field.rows, floor: Array.from(field.data, (v) => v === 0) }
  const s = sceneOf(map)
  if (!s) return null
  const g = blank(map.w, map.h, FINE)
  for (let i = 0; i < g.floor.length; i++) g.floor[i] = onFloor(s, [((i % g.cols) + 0.5) * FINE, (Math.floor(i / g.cols) + 0.5) * FINE])
  return g
}

/** The cavern as the layers above need it: where the floor is and how far a point is from the nearest wall. */
type Scene = { outer: Pt[]; rocks: Pt[][] }
function sceneOf(map: LocationMap): Scene | null {
  const outer = objects(map, 'cavern', 'cavern')[0]?.points
  return outer ? { outer, rocks: objects(map, 'cavern', 'rockpile').flatMap((o) => (o.points ? [o.points] : [])) } : null
}
const onFloor = (s: Scene, p: Pt) => inPolygon(p, s.outer) && !s.rocks.some((r) => inPolygon(p, r))
const clearance = (s: Scene, p: Pt) => (onFloor(s, p) ? Math.min(distToPolyline(p, s.outer, true), ...s.rocks.map((r) => distToPolyline(p, r, true))) : 0)

/** Random floor points with at least `min` clearance from the walls, the roomiest first, each `apart` from the others. */
function openSpots(s: Scene, map: LocationMap, rand: Rng, count: number, min: number, apart: number): { p: Pt; room: number }[] {
  const found = Array.from({ length: 260 }, () => {
    const p: Pt = [rand.range(0, map.w), rand.range(0, map.h)]
    return { p, room: clearance(s, p) }
  })
    .filter((c) => c.room >= min)
    .sort((a, b) => b.room - a.room)
  const out: { p: Pt; room: number }[] = []
  for (const c of found) if (out.length < count && out.every((o) => dist(o.p, c.p) >= apart)) out.push(c)
  return out
}

/**
 * The shortest walk along the floor from one point to another (eight directions), as cell centres, preferring cells
 * away from the walls so a river runs down the middle of a passage. Straight from a to b when no walk exists.
 */
export function floorWalk(g: Grid, a: Pt, b: Pt): Pt[] {
  const cellOf = (p: Pt) => clamp(Math.floor(p[1] / g.cell), 0, g.rows - 1) * g.cols + clamp(Math.floor(p[0] / g.cell), 0, g.cols - 1)
  const centre = (i: number): Pt => [((i % g.cols) + 0.5) * g.cell, (Math.floor(i / g.cols) + 0.5) * g.cell]
  const [start, goal] = [cellOf(a), cellOf(b)]
  if (!g.floor[start] || !g.floor[goal]) return [a, b]
  const n = g.floor.length
  const cost = new Float64Array(n).fill(Infinity)
  const came = new Int32Array(n).fill(-1)
  const open = new MinHeap()
  cost[start] = 0
  open.push(start, 0)
  while (open.size) {
    const [c, i] = open.pop()
    if (i === goal) break
    if (c > cost[i]) continue
    const [x, y] = [i % g.cols, Math.floor(i / g.cols)]
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if ((!dx && !dy) || !at(g, x + dx, y + dy)) continue
        const j = (y + dy) * g.cols + x + dx
        // Next to a wall costs more, so the walk keeps to the middle.
        const step = Math.hypot(dx, dy) * (1 + wallsAround(g, x + dx, y + dy) * 0.6)
        if (cost[i] + step < cost[j]) {
          cost[j] = cost[i] + step
          came[j] = i
          open.push(j, cost[j])
        }
      }
    }
  }
  if (came[goal] < 0) return [a, b]
  const cells: number[] = []
  for (let i = goal; i >= 0; i = came[i]) cells.push(i)
  return cells.reverse().map(centre)
}

/** Glowing crystals near the walls, and a campfire beside about half of the creatures. */
function lights({ map, rand }: GenContext): NewMapObject[] {
  const s = sceneOf(map)
  if (!s) return []
  const out: NewMapObject[] = []
  for (const m of objects(map, 'contents', 'marker')) {
    if (!rand.chance(0.5)) continue
    for (let tries = 0; tries < 12; tries++) {
      const a = rand.range(0, Math.PI * 2)
      const p: Pt = [m.x + Math.cos(a) * 24, m.y + Math.sin(a) * 24]
      if (clearance(s, p) > 12) {
        out.push(lightOf('campfire', p[0], p[1]))
        break
      }
    }
  }
  const crystals = rand.int(3, 6)
  for (let tries = 0, made = 0; tries < crystals * 40 && made < crystals; tries++) {
    const p: Pt = [rand.range(0, map.w), rand.range(0, map.h)]
    const room = clearance(s, p)
    if (room < 6 || room > 18 || out.some((o) => dist(pos(o), p) < 120)) continue
    out.push(lightOf('crystal', p[0], p[1]))
    made++
  }
  return out
}

function rock({ map }: GenContext): NewMapObject[] {
  return [{ kind: 'rock', x: map.w / 2, y: map.h / 2, w: map.w, h: map.h }]
}

function cavern({ location, map, rand }: GenContext): LayerOutput {
  const chambers = clamp(Math.round(Number(location.chambers)) || scaleOf(location).chambers, 1, 14)
  const openness = OPENNESS[String(location.openness)] ?? 1
  const method = (CAVE_METHODS as readonly string[]).includes(String(location.caveMethod)) ? String(location.caveMethod) : CAVE_METHODS[0]
  const passes = clamp(Math.round(Number(location.smoothing)) || 5, 1, 10)
  const g =
    method === 'Simplex noise'
      ? noisy(map.w, map.h, chambers, openness, rand)
      : method === 'Chambers and tunnels'
        ? carve(map.w, map.h, chambers, openness, rand)
        : cellular(map.w, map.h, chambers, openness, rand, passes)
  const loops = trace(g)
  const rockField = fieldOf({ cell: g.cell, cols: g.cols, rows: g.rows, data: Uint8Array.from(g.floor, (f) => (f ? 0 : 1)) })
  if (!loops.length) return { objects: [], fields: { rock: rockField } }
  const centre = (pts: Pt[]): Pt => [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length]
  return {
    objects: [
      { kind: 'cavern', x: centre(loops[0])[0], y: centre(loops[0])[1], points: thin(loops[0], MAX_OUTLINE) },
      ...loops.slice(1, 40).map((l) => ({ kind: 'rockpile', x: centre(l)[0], y: centre(l)[1], points: thin(l, 80) })),
    ],
    fields: { rock: rockField },
  }
}

function entrances({ location, map, rand }: GenContext): NewMapObject[] {
  const s = sceneOf(map)
  if (!s) return []
  const wanted = clamp(Math.round(Number(location.entrances)) || 1, 1, 4)
  // The wall point nearest each edge of the map; the bottom edge is used first.
  const sides: { end: (p: Pt) => Pt; score: (p: Pt) => number }[] = [
    { end: (p) => [p[0], map.h + 20], score: (p) => p[1] },
    { end: (p) => [-20, p[1]], score: (p) => -p[0] },
    { end: (p) => [map.w + 20, p[1]], score: (p) => p[0] },
    { end: (p) => [p[0], -20], score: (p) => -p[1] },
  ]
  const out: NewMapObject[] = []
  for (const side of sides.slice(0, wanted)) {
    const mouth = s.outer.reduce((best, p) => (side.score(p) > side.score(best) ? p : best))
    const end = side.end(mouth)
    // Start a little inside the cave so the tunnel joins the floor.
    const from: Pt = [mouth[0] + Math.sign(mouth[0] - end[0]) * 26, mouth[1] + Math.sign(mouth[1] - end[1]) * 26]
    const run = path(rand, [from, [(from[0] + end[0]) / 2, (from[1] + end[1]) / 2], end], 14)
    out.push({ kind: 'corridor', x: mouth[0], y: mouth[1], ...run, props: { width: 26 } })
    const step: Pt = [mouth[0] + (end[0] - mouth[0]) * 0.45, mouth[1] + (end[1] - mouth[1]) * 0.45]
    out.push({ kind: 'stairs', x: step[0], y: step[1], w: 24, h: 20, rot: toDeg(Math.atan2(end[1] - mouth[1], end[0] - mouth[0])) - 90 })
  }
  return out
}

/** The hollows of the floor as invisible `hollow` objects that list their links, for the room graph. */
function chambersLayer({ location, map, rand }: GenContext): NewMapObject[] {
  const g = floorOf(map)
  if (!g) return []
  const wanted = clamp(Math.round(Number(location.chambers)) || scaleOf(location).chambers, 1, 14)
  const found = hollows(g, clamp(wanted * 2, 4, 24))
  if (!found.centres.length) return []
  const door = objects(map, 'entrances', 'stairs')[0]
  const entry = door ? found.centres.reduce((best, c, i) => (dist(c, pos(door)) < dist(found.centres[best], pos(door)) ? i : best), 0) : 0
  const tag = rand.int(0, 36 ** 4).toString(36)
  const node = (i: number) => `c${i}.${tag}`
  return found.centres.map((c, i) => {
    const links = found.links.filter(([a]) => a === i).map(([, b]) => node(b))
    const r = Math.max(found.radii[i], g.cell)
    return { kind: 'hollow', x: c[0], y: c[1], w: r * 2, h: r * 2, props: { node: node(i), role: i === entry ? 'entrance' : 'room', ...(links.length ? { links: links.join(' ') } : {}) } }
  })
}

function water({ location, map, rand }: GenContext): NewMapObject[] {
  const s = sceneOf(map)
  if (!s) return []
  if (location.caveWater === 'Pools') {
    return openSpots(s, map, rand, rand.int(2, 4), 34, 150).map(({ p, room }) => {
      const r = Math.min(room * 0.62, 46)
      return { kind: 'pond', x: p[0], y: p[1], w: r * 2, h: r * 1.6, ...outlineOf(blob(p[0], p[1], r, r * 0.8, rand, 9, 0.18)) }
    })
  }
  if (location.caveWater === 'Underground river') {
    // Through the roomiest parts of the cave, left to right, following the floor between them.
    const stops = openSpots(s, map, rand, 4, 26, 160).map((c) => c.p).sort((a, b) => a[0] - b[0])
    const g = floorOf(map)
    if (stops.length < 2 || !g) return []
    const course = stops.slice(1).flatMap((to, i) => floorWalk(g, stops[i], to).slice(i ? 1 : 0))
    // Every few cells is enough for a smooth curve; the walk itself keeps it on the floor.
    const ctrl = course.filter((_, i) => i % 4 === 0 || i === course.length - 1)
    if (ctrl.length < 2) return []
    return [{ kind: 'river', x: ctrl[0][0], y: ctrl[0][1], ...path(rand, ctrl, 0), props: { width: 16 } }]
  }
  return []
}

function features({ project, location, map, rand }: GenContext): NewMapObject[] {
  const s = sceneOf(map)
  if (!s) return []
  const wet = objects(map, 'water')
  const dry = (p: Pt, r: number) => !wet.some((o) => (o.points && o.kind === 'river' ? distToPolyline(p, o.points) < 14 + r : dist(p, pos(o)) < Math.max(o.w ?? 0, o.h ?? 0) / 2 + r))
  const out: NewMapObject[] = []
  // Stalagmites and ore stand near the walls, where they do not block the way.
  const nearWall = (count: number, make: (p: Pt) => NewMapObject) => {
    for (let tries = 0, made = 0; tries < count * 30 && made < count; tries++) {
      const p: Pt = [rand.range(0, map.w), rand.range(0, map.h)]
      const room = clearance(s, p)
      if (room < 8 || room > 26 || !dry(p, 8) || touches(p, 9, out)) continue
      out.push(make(p))
      made++
    }
  }
  nearWall(Math.round((map.w * map.h) / 16000), (p) => ({ kind: 'stalagmite', x: p[0], y: p[1], w: rand.int(8, 14), h: 12 }))
  catalogRefs(project, location.resources, 'resources')
    .slice(0, 6)
    .forEach((res, i) => nearWall(rand.int(2, 3), (p) => ({ kind: 'ore', x: p[0], y: p[1], w: 18, h: 18, label: res.name, refId: res.id, props: { tone: i % 3 } })))
  return out
}

function contents({ project, location, map, rand }: GenContext): NewMapObject[] {
  const s = sceneOf(map)
  const enemies = refsOf(project, location.enemies, 'design.combat', 'enemies')
  if (!s || !enemies.length) return []
  const solid = [...objects(map, 'features'), ...objects(map, 'water', 'pond')]
  const want = Math.max(2, Math.round(scaleOf(location).chambers * 0.8))
  // Creatures lair in the chambers away from the entrance, roomiest first; open floor makes up any shortfall.
  const lairs = objects(map, 'chambers', 'hollow')
    .filter((h) => h.props?.role !== 'entrance')
    .sort((a, b) => (b.w ?? 0) - (a.w ?? 0))
    .map((h) => ({ p: pos(h), room: clearance(s, pos(h)) }))
    .filter((c) => c.room >= 22)
  const spots = [...lairs, ...openSpots(s, map, rand, want, 22, 130)].filter((c, i, list) => list.findIndex((o) => dist(o.p, c.p) < 130) === i).slice(0, want)
  return spots
    .filter((c) => !touches(c.p, 12, solid))
    .map(({ p }) => {
      const foe = rand.pick(enemies)
      return { kind: 'marker', x: p[0], y: p[1], w: 18, h: 18, label: foe.name, refId: foe.id, props: { type: 'enemy' }, spawn: { role: 'enemy', refId: foe.id } }
    })
}

function labels({ map }: GenContext): NewMapObject[] {
  const out: NewMapObject[] = objects(map, 'entrances', 'stairs').map((o) => ({ kind: 'label', x: o.x, y: o.y - 18, label: 'Entrance' }))
  for (const o of objects(map, 'contents')) if (o.label) out.push({ kind: 'label', x: o.x, y: o.y + 22, label: o.label })
  // One label per resource: at the first vein of each.
  const named = new Set<string>()
  for (const o of objects(map, 'features', 'ore')) {
    if (!o.label || named.has(o.label)) continue
    named.add(o.label)
    out.push({ kind: 'label', x: o.x, y: o.y + 22, label: o.label })
  }
  return out
}

const LAYERS: LayerDef[] = [
  { id: 'rock', label: 'Rock', dependsOn: [], generate: rock },
  { id: 'entrances', label: 'Entrances', dependsOn: ['cavern'], generate: entrances, addable: ['corridor', 'stairs'] },
  { id: 'cavern', label: 'Cavern', dependsOn: [], generate: cavern },
  { id: 'chambers', label: 'Chambers', dependsOn: ['cavern', 'entrances'], generate: chambersLayer },
  { id: 'water', label: 'Water', dependsOn: ['cavern'], generate: water },
  { id: 'features', label: 'Stalagmites and ore', dependsOn: ['cavern', 'water'], generate: features, addable: ['stalagmite', 'ore'] },
  { id: 'contents', label: 'Enemies', dependsOn: ['cavern', 'chambers', 'water', 'features'], generate: contents, addable: ['marker'] },
  { id: 'lights', label: 'Lights', dependsOn: ['cavern', 'contents'], generate: lights, addable: ['light'] },
  { id: 'labels', label: 'Labels', dependsOn: ['entrances', 'features', 'contents'], generate: labels, addable: ['label'] },
]

export const CAVE: LocationTypeDef = {
  id: 'Cave',
  size: (location) => ({ w: scaleOf(location).w, h: scaleOf(location).h }),
  layers: LAYERS,
  topology: { rooms: { layer: 'chambers', kind: 'hollow' }, planned: true },
  nav: { cell: 10, open: false },
}
