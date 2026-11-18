import { distToPolyline, pointAlong, polylineLength, toRad } from './geometry'
import { inRoom } from './rooms'
import type { LocationMap, MapObject, MapPoint as Pt, TopologySpec } from './types'
import { objects, widthOf } from './types/shared'

/**
 * The room graph of a map: rooms are nodes; corridors and doors between rooms are edges. It is read from the
 * map's objects, so it follows manual edits, and it answers the level-design questions: is everything connected,
 * how many loops, dead ends and branches, and can every lock be opened with keys found before it.
 */
export type TopoNode = { id: string; x: number; y: number; role: string; label?: string }
export type TopoEdge = {
  id: string
  a: string
  b: string
  /** The corridor and door objects that make this link. */
  via: string[]
  lock?: string
  secret?: true
}
export type MapGraph = { nodes: TopoNode[]; edges: TopoEdge[]; entrance?: string }

/** The node for the world outside a building; exterior doors lead to it. */
export const OUTSIDE = 'outside'

/** Whether a point lies in a (possibly rotated) box, with `pad` added on every side. */
export function inBox(o: MapObject, p: Pt, pad = 0): boolean {
  const a = -toRad(o.rot ?? 0)
  const [dx, dy] = [p[0] - o.x, p[1] - o.y]
  const [lx, ly] = [dx * Math.cos(a) - dy * Math.sin(a), dx * Math.sin(a) + dy * Math.cos(a)]
  return Math.abs(lx) <= (o.w ?? 0) / 2 + pad && Math.abs(ly) <= (o.h ?? 0) / 2 + pad
}

const roomAt = (rooms: MapObject[], p: Pt, pad = 0) => rooms.find((r) => inRoom(r, p, pad))

/** One stay of a line inside a room: where along the line it enters and leaves. */
type Visit = { id: string; from: number; to: number }

/** The rooms a line passes through, in order, each once per visit. */
function roomsAlong(rooms: MapObject[], pts: Pt[]): Visit[] {
  const out: Visit[] = []
  const len = polylineLength(pts)
  const step = 4
  for (let d = 0; d <= len + step - 1e-9; d += step) {
    const at = Math.min(d, len)
    const r = roomAt(rooms, pointAlong(pts, at).p)
    const last = out[out.length - 1]
    if (r && last?.id === r.id && at - last.to <= step + 1e-9) last.to = at
    else if (r) out.push({ id: r.id, from: at, to: at })
  }
  return out
}

/** How far along a polyline its nearest point to `p` lies. */
function distanceAlong(pts: Pt[], p: Pt): number {
  let best = Infinity
  let at = 0
  let walked = 0
  for (let i = 1; i < pts.length; i++) {
    const [a, b] = [pts[i - 1], pts[i]]
    const [dx, dy] = [b[0] - a[0], b[1] - a[1]]
    const len2 = dx * dx + dy * dy
    const t = len2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2)) : 0
    const d = Math.hypot(p[0] - (a[0] + dx * t), p[1] - (a[1] + dy * t))
    if (d < best) [best, at] = [d, walked + Math.sqrt(len2) * t]
    walked += Math.sqrt(len2)
  }
  return at
}

/** The two points just either side of a door's wall. */
function doorSides(door: MapObject): [Pt, Pt] {
  const n = toRad((door.rot ?? 0) + 90)
  const reach = (door.h ?? 8) / 2 + 6
  return [
    [door.x + Math.cos(n) * reach, door.y + Math.sin(n) * reach],
    [door.x - Math.cos(n) * reach, door.y - Math.sin(n) * reach],
  ]
}

/**
 * Links a room lists in `props.links`: space-separated node names, each optionally followed by `:lock` and a `*`
 * for a secret link (`n4.ab12:red`, `n7.ab12*`).
 */
export function parseLinks(o: MapObject): { node: string; lock?: string; secret?: true }[] {
  return String(o.props?.links ?? '')
    .split(' ')
    .filter(Boolean)
    .flatMap((token) => {
      const m = /^([^:*]+)(?::([^*]+))?(\*)?$/.exec(token)
      return m ? [{ node: m[1], ...(m[2] ? { lock: m[2] } : {}), ...(m[3] ? { secret: true as const } : {}) }] : []
    })
}
export const nodeName = (o: MapObject) => (typeof o.props?.node === 'string' ? o.props.node : undefined)

const isSecret = (o: MapObject) => o.secret === true || o.props?.secret === true || o.props?.style === 'secret'

export function buildGraph(map: LocationMap, spec: TopologySpec): MapGraph {
  const rooms = objects(map, spec.rooms.layer, spec.rooms.kind)
  const nodes: TopoNode[] = rooms.map((r) => ({ id: r.id, x: r.x, y: r.y, role: String(r.props?.role ?? 'room'), ...(r.label ? { label: r.label } : {}) }))
  const edges: TopoEdge[] = []
  if (spec.planned) {
    const byNode = new Map(rooms.flatMap((r) => (nodeName(r) ? [[nodeName(r)!, r] as const] : [])))
    for (const r of rooms) {
      for (const l of parseLinks(r)) {
        const other = byNode.get(l.node)
        if (!other || other === r) continue
        edges.push({ id: `${r.id}>${other.id}`, a: r.id, b: other.id, via: [r.id], ...(l.lock ? { lock: l.lock } : {}), ...(l.secret ? { secret: true as const } : {}) })
      }
    }
  }
  /** Where along its corridor each link leaves its first room and enters its second. */
  const ends = new Map<TopoEdge, { run: MapObject; out: number; in: number }>()
  const corridors = spec.corridors ? objects(map, spec.corridors.layer, spec.corridors.kind) : []
  for (const c of corridors) {
    const seq = roomsAlong(rooms, c.points ?? [])
    for (let i = 1; i < seq.length; i++) {
      if (seq[i].id === seq[i - 1].id) continue
      const e: TopoEdge = { id: `${c.id}#${i}`, a: seq[i - 1].id, b: seq[i].id, via: [c.id] }
      if (isSecret(c)) e.secret = true
      edges.push(e)
      ends.set(e, { run: c, out: seq[i - 1].to, in: seq[i].from })
    }
  }
  const doors = spec.doors ? objects(map, spec.doors.layer, spec.doors.kind) : []
  for (const d of doors) {
    const at: Pt = [d.x, d.y]
    // A door on a corridor belongs to the link whose room edge (where the corridor leaves or enters a room) is
    // nearest to it along that corridor. Where corridors meet a wall at the same spot, one door serves them all.
    const onRuns = new Map<MapObject, { e: TopoEdge; gap: number }>()
    for (const [e, end] of ends) {
      const pts = end.run.points ?? []
      if (distToPolyline(at, pts) > widthOf(end.run, 16) / 2 + (d.w ?? 0) / 2) continue
      const along = distanceAlong(pts, at)
      const gap = Math.min(Math.abs(along - end.out), Math.abs(along - end.in))
      const had = onRuns.get(end.run)
      if (gap <= 24 && (!had || gap < had.gap)) onRuns.set(end.run, { e, gap })
    }
    if (onRuns.size) {
      for (const { e } of onRuns.values()) {
        e.via.push(d.id)
        if (d.lock) e.lock = d.lock
        if (isSecret(d)) e.secret = true
      }
      continue
    }
    if (corridors.length) continue
    // A door between two rooms, or from a room to the outside.
    const [p, q] = doorSides(d).map((s) => roomAt(rooms, s))
    if (!p && !q) continue
    const e: TopoEdge = { id: d.id, a: p?.id ?? OUTSIDE, b: q?.id ?? OUTSIDE, via: [d.id] }
    if (e.a === e.b) continue
    if (d.lock) e.lock = d.lock
    if (isSecret(d)) e.secret = true
    edges.push(e)
  }
  if (edges.some((e) => e.a === OUTSIDE || e.b === OUTSIDE)) {
    const front = doors.find((d) => d.props?.entrance) ?? doors.find((d) => edges.some((e) => e.id === d.id && (e.a === OUTSIDE || e.b === OUTSIDE)))
    nodes.push({ id: OUTSIDE, x: front?.x ?? 0, y: front?.y ?? 0, role: 'entrance', label: 'Outside' })
  }
  const entrance = nodes.find((n) => n.id === OUTSIDE) ?? nodes.find((n) => n.role === 'entrance') ?? nodes[0]
  return { nodes, edges, ...(entrance ? { entrance: entrance.id } : {}) }
}

/** The room a point lies in, if any. */
export const nodeAt = (map: LocationMap, spec: TopologySpec, p: Pt): string | undefined =>
  roomAt(objects(map, spec.rooms.layer, spec.rooms.kind), p)?.id

const neighbours = (g: MapGraph) => {
  const out = new Map<string, { to: string; edge: TopoEdge }[]>(g.nodes.map((n) => [n.id, []]))
  for (const e of g.edges) {
    out.get(e.a)?.push({ to: e.b, edge: e })
    out.get(e.b)?.push({ to: e.a, edge: e })
  }
  return out
}

/** Nodes reachable from `from` over the edges `pass` lets through, with their distance in links. */
export function reach(g: MapGraph, from: string | undefined, pass: (e: TopoEdge) => boolean = () => true): Map<string, number> {
  const seen = new Map<string, number>()
  if (!from || !g.nodes.some((n) => n.id === from)) return seen
  const next = neighbours(g)
  seen.set(from, 0)
  const queue = [from]
  while (queue.length) {
    const id = queue.shift()!
    for (const { to, edge } of next.get(id) ?? []) {
      if (seen.has(to) || !pass(edge)) continue
      seen.set(to, seen.get(id)! + 1)
      queue.push(to)
    }
  }
  return seen
}

export type GraphMetrics = {
  nodes: number
  edges: number
  /** Separate pieces; 1 when everything is connected. */
  components: number
  /** Independent cycles: edges − nodes + components. */
  loops: number
  /** Rooms with a single link, other than the entrance. */
  deadEnds: number
  /** Share of rooms where the way splits (three or more links). */
  branching: number
  /** Links from the entrance to the farthest reachable room. */
  depth: number
  /** Rooms the entrance cannot reach, locks and secrets ignored. */
  unreachable: string[]
}

export function metrics(g: MapGraph): GraphMetrics {
  const parent = new Map(g.nodes.map((n) => [n.id, n.id]))
  const root = (id: string): string => {
    let r = id
    while (parent.get(r) !== r) r = parent.get(r)!
    parent.set(id, r)
    return r
  }
  for (const e of g.edges) if (parent.has(e.a) && parent.has(e.b)) parent.set(root(e.a), root(e.b))
  const components = new Set(g.nodes.map((n) => root(n.id))).size
  const degree = new Map(g.nodes.map((n) => [n.id, 0]))
  for (const e of g.edges) {
    degree.set(e.a, (degree.get(e.a) ?? 0) + 1)
    degree.set(e.b, (degree.get(e.b) ?? 0) + 1)
  }
  const from = reach(g, g.entrance)
  return {
    nodes: g.nodes.length,
    edges: g.edges.length,
    components,
    loops: Math.max(0, g.edges.length - g.nodes.length + components),
    deadEnds: g.nodes.filter((n) => n.id !== g.entrance && degree.get(n.id) === 1).length,
    branching: g.nodes.length ? g.nodes.filter((n) => (degree.get(n.id) ?? 0) >= 3).length / g.nodes.length : 0,
    depth: Math.max(0, ...from.values()),
    unreachable: g.nodes.filter((n) => !from.has(n.id)).map((n) => n.id),
  }
}

export type KeyAt = { key: string; node: string }
export type LockCheck = {
  /** Every lock can be opened, each with a key found without passing it. */
  ok: boolean
  /** Keys in the order a player can pick them up. */
  order: string[]
  /** Locks no reachable key opens. */
  stuck: string[]
  /** Rooms that stay out of reach. */
  sealed: string[]
}

/**
 * Walks in from the entrance, picking up every key it can reach and opening the locks they fit, until nothing
 * new opens. Secret links count as found.
 */
export function checkLocks(g: MapGraph, keys: KeyAt[]): LockCheck {
  const opened = new Set<string>()
  const order: string[] = []
  let reached = reach(g, g.entrance, (e) => !e.lock || opened.has(e.lock))
  for (;;) {
    const found = keys.filter((k) => reached.has(k.node) && !opened.has(k.key))
    if (!found.length) break
    for (const k of found) {
      opened.add(k.key)
      order.push(k.key)
    }
    reached = reach(g, g.entrance, (e) => !e.lock || opened.has(e.lock))
  }
  const locks = [...new Set(g.edges.flatMap((e) => (e.lock ? [e.lock] : [])))]
  const stuck = locks.filter((l) => !opened.has(l))
  const sealed = g.nodes.filter((n) => !reached.has(n.id)).map((n) => n.id)
  return { ok: !stuck.length && !sealed.length, order, stuck, sealed }
}
