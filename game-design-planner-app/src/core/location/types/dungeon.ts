import type { Entity } from '../../model/types'
import { crossings, dist, pointAlong, polylineLength, toDeg } from '../geometry'
import { MinHeap } from '../heap'
import { lightOf } from '../light'
import { LOCK_NAMES, planMission } from '../mission'
import type { Rng } from '../rng'
import { inRoom, roomAnchor, roomOutline, shapeOf, type RoomShape } from '../rooms'
import { buildGraph, nodeName as nodeOf, parseLinks, reach } from '../topology'
import type { GenContext, LayerDef, LocationMap, LocationTypeDef, MapObject, MapPoint as Pt, NewMapObject, TopologySpec } from '../types'
import { clamp, objects, pos, refsOf, sizeKey, snap, splitRects, touches } from './shared'

/**
 * Dungeon: rooms cut out of solid rock and joined by corridors. The map is partitioned and a room placed in each
 * part; then a mission plan (mission.ts) decides the links, the entrance (nearest the bottom edge), the boss
 * (deepest), secret rooms and treasure (dead ends), the locks on the way to the boss and the room of each key.
 * The plan is stored on the rooms (`props.node`, `props.links`, `props.keys`, `props.region`), so the corridor,
 * door and contents layers can be rerolled on their own and still follow it.
 * Layers, bottom to top: rock, corridors, rooms, doors, features, contents, labels. Corridors are drawn under the
 * rooms but generated after them.
 */
const SCALES = {
  Small: { w: 800, h: 560, rooms: 7, locks: 0 },
  Medium: { w: 1000, h: 700, rooms: 11, locks: 1 },
  Large: { w: 1200, h: 840, rooms: 16, locks: 2 },
}
const scaleOf = (location: Entity) => SCALES[sizeKey(location)]
const CORRIDOR = 16
const MARGIN = 40
/** How often the plan grows from the room it just added, per branching input. */
const CHAIN: Record<string, number> = { Linear: 0.85, Balanced: 0.5, Branching: 0.15 }

const TOPOLOGY: TopologySpec = { rooms: { layer: 'rooms', kind: 'chamber' }, corridors: { layer: 'corridors', kind: 'corridor' }, doors: { layer: 'doors', kind: 'door' } }
const chambers = (map: LocationMap) => objects(map, 'rooms', 'chamber')
const roleOf = (o: MapObject) => String(o.props?.role ?? 'room')
const numberInput = (v: unknown) => (v === undefined || v === null || v === '' || !Number.isFinite(Number(v)) ? undefined : Number(v))

function rock({ map }: GenContext): NewMapObject[] {
  return [{ kind: 'rock', x: map.w / 2, y: map.h / 2, w: map.w, h: map.h }]
}

/** A room's shape by its role: plain halls for the entrance and secret rooms, a round or grand hall for the boss. */
function shapeFor(role: string, w: number, h: number, rand: Rng): { shape?: RoomShape; cut?: number } {
  const roll = rand.next()
  const cut = rand.int(0, 3)
  if (role === 'entrance' || role === 'secret') return {}
  if (role === 'boss') return roll < 0.45 ? { shape: 'round' } : {}
  if (roll < 0.2 && w >= 90 && h >= 80) return { shape: 'L', cut }
  if (roll < 0.33) return { shape: 'round' }
  if (roll < 0.43 && w >= 100 && h >= 100) return { shape: 'cross' }
  return {}
}

function rooms({ location, map, rand }: GenContext): NewMapObject[] {
  const maze = location.layoutStyle === 'Labyrinth'
  const wanted = clamp(Math.round(Number(location.rooms)) || scaleOf(location).rooms, 2, 30)
  const secret = clamp(Math.round(Number(location.secretRooms)) || 0, 0, 6)
  const parts = splitRects({ x: MARGIN, y: MARGIN, w: map.w - MARGIN * 2, h: map.h - MARGIN * 2 }, wanted + secret, rand, 90)
  // A room fills part of its cell; a labyrinth has smaller rooms and so longer corridors between them.
  const fill: [number, number] = maze ? [0.4, 0.6] : [0.55, 0.85]
  // Rooms keep a band of rock to the edge of their part, so two rooms never share a wall without a door.
  const GAP = 10
  const made: NewMapObject[] = parts.map((p) => {
    const [w, h] = [Math.max(50, snap(Math.min(p.w - GAP * 2, p.w * rand.range(fill[0], fill[1])))), Math.max(50, snap(Math.min(p.h - GAP * 2, p.h * rand.range(fill[0], fill[1]))))]
    const x = clamp(snap(p.x + w / 2 + rand.range(0, p.w - w)), Math.ceil((p.x + GAP + w / 2) / 10) * 10, Math.floor((p.x + p.w - GAP - w / 2) / 10) * 10)
    const y = clamp(snap(p.y + h / 2 + rand.range(0, p.h - h)), Math.ceil((p.y + GAP + h / 2) / 10) * 10, Math.floor((p.y + p.h - GAP - h / 2) / 10) * 10)
    return { kind: 'chamber', x, y, w, h }
  })
  const loops = numberInput(location.loops)
  const plan = planMission(
    made.map((o) => ({ at: pos(o), area: (o.w ?? 0) * (o.h ?? 0) })),
    rand,
    {
      loops: clamp(Math.round(loops ?? (made.length - secret) * (maze ? 0.4 : 0.18)), 0, 20),
      chain: CHAIN[String(location.branching)] ?? CHAIN.Balanced,
      deadEnds: location.deadEnds === 'Few' || location.deadEnds === 'Many' ? location.deadEnds : 'Some',
      secret,
      treasure: Math.max(1, Math.round(wanted / 8)),
      locks: clamp(Math.round(numberInput(location.keyLocks) ?? scaleOf(location).locks), 0, LOCK_NAMES.length),
      reach: Math.max(map.w, map.h) * 0.4,
    },
  )
  // Node names are unique per roll, so a pinned room from an earlier roll never takes a link meant for another.
  const tag = rand.int(0, 36 ** 4).toString(36)
  const node = (i: number) => `n${i}.${tag}`
  return made.map((o, i) => {
    const role = plan.roles[i]
    const links = plan.edges.filter((e) => e.a === i).map((e) => node(e.b) + (e.lock ? `:${e.lock}` : '') + (e.secret ? '*' : ''))
    const keys = plan.keys.filter((k) => k.room === i).map((k) => k.lock)
    const { shape, cut } = shapeFor(role, o.w ?? 0, o.h ?? 0, rand)
    return {
      ...o,
      // A secret room is for the game master's map only.
      ...(role === 'secret' ? { secret: true as const } : {}),
      props: {
        role,
        node: node(i),
        region: plan.region[i],
        ...(links.length ? { links: links.join(' ') } : {}),
        ...(keys.length ? { keys: keys.join(' ') } : {}),
        ...(shape ? { shape } : {}),
        ...(shape === 'L' ? { cut: cut! } : {}),
      },
    }
  })
}

type Link = { a: MapObject; b: MapObject; lock?: string; secret?: boolean }

/** The links the plan stored on the rooms; rooms outside the plan (added by hand) join their nearest room. */
function plannedLinks(list: MapObject[]): Link[] {
  const byNode = new Map(list.flatMap((r) => (nodeOf(r) ? [[nodeOf(r)!, r] as const] : [])))
  const out: Link[] = []
  for (const a of list) {
    for (const l of parseLinks(a)) {
      const b = byNode.get(l.node)
      if (b && b !== a) out.push({ a, b, ...(l.lock ? { lock: l.lock } : {}), ...(l.secret ? { secret: true } : {}) })
    }
  }
  if (!out.length) return []
  const linked = new Set(out.flatMap((l) => [l.a, l.b]))
  for (const r of list) {
    if (linked.has(r)) continue
    const nearest = list.filter((x) => x !== r).reduce<MapObject | undefined>((best, x) => (!best || dist(pos(x), pos(r)) < dist(pos(best), pos(r)) ? x : best), undefined)
    if (nearest) out.push({ a: nearest, b: r })
  }
  return out
}

/** Links for rooms without a plan (maps from before plans existed): a spanning tree plus a few loops. */
function unplannedLinks(list: MapObject[], location: Entity, map: LocationMap, rand: Rng): Link[] {
  const edges: [number, number][] = []
  const joined = new Set([0])
  while (joined.size < list.length) {
    let best: [number, number, number] | null = null
    for (const i of joined) for (let j = 0; j < list.length; j++) if (!joined.has(j) && (!best || dist(pos(list[i]), pos(list[j])) < best[2])) best = [i, j, dist(pos(list[i]), pos(list[j]))]
    if (!best) break
    edges.push([best[0], best[1]])
    joined.add(best[1])
  }
  const loops = Math.round(list.length * (location.layoutStyle === 'Labyrinth' ? 0.4 : 0.18))
  for (let tries = 0, added = 0; tries < 200 && added < loops; tries++) {
    const [i, j] = [rand.int(0, list.length - 1), rand.int(0, list.length - 1)]
    const linked = edges.some(([a, b]) => (a === i && b === j) || (a === j && b === i))
    if (i === j || linked || roleOf(list[i]) === 'secret' || roleOf(list[j]) === 'secret' || dist(pos(list[i]), pos(list[j])) > Math.max(map.w, map.h) * 0.4) continue
    edges.push([i, j])
    added++
  }
  return edges.map(([i, j]) => ({ a: list[i], b: list[j], ...(roleOf(list[i]) === 'secret' || roleOf(list[j]) === 'secret' ? { secret: true } : {}) }))
}

/** Rooms other than `skip` that a route passes through. */
function roomsOnRoute(route: Pt[], list: MapObject[], skip: MapObject[]): MapObject[] {
  const len = polylineLength(route)
  const hit = new Set<MapObject>()
  for (let d = 0; d <= len; d += 6) {
    const p = pointAlong(route, d).p
    for (const r of list) if (!skip.includes(r) && inRoom(r, p, CORRIDOR / 2 + 4)) hit.add(r)
  }
  return [...hit]
}

/**
 * A corridor from `a` to `b` that keeps clear of the `avoid` rooms and crosses none of the `walls` (corridors it
 * must not meet): a grid search in four directions where every turn costs extra, so the result is a few straight
 * runs. Null when there is no way.
 */
function routeAround(map: LocationMap, a: Pt, b: Pt, ends: MapObject[], avoid: MapObject[], walls: Pt[][]): Pt[] | null {
  const cell = 10
  const [cols, rows] = [Math.ceil(map.w / cell), Math.ceil(map.h / cell)]
  const at = (i: number): Pt => [((i % cols) + 0.5) * cell, (Math.floor(i / cols) + 0.5) * cell]
  const index = (p: Pt) => clamp(Math.floor(p[1] / cell), 0, rows - 1) * cols + clamp(Math.floor(p[0] / cell), 0, cols - 1)
  const clear = CORRIDOR / 2 + 6
  const blocked = new Uint8Array(cols * rows)
  for (let i = 0; i < blocked.length; i++) {
    const p = at(i)
    // Other corridors may meet this one inside its own end rooms; anywhere else they are in the way.
    const home = ends.some((r) => inRoom(r, p, 2))
    if (avoid.some((r) => inRoom(r, p, clear)) || (!home && walls.some((w) => distToLine(p, w) < CORRIDOR + 2))) blocked[i] = 1
  }
  const [start, goal] = [index(a), index(b)]
  blocked[start] = blocked[goal] = 0
  const STEPS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]]
  const TURN = 4
  // State: cell × direction of arrival.
  const best = new Float64Array(cols * rows * 4).fill(Infinity)
  const came = new Int32Array(cols * rows * 4).fill(-1)
  const open = new MinHeap()
  for (let d = 0; d < 4; d++) {
    best[start * 4 + d] = 0
    open.push(start * 4 + d, 0)
  }
  let end = -1
  while (open.size) {
    const [spent, state] = open.pop()
    if (spent > best[state]) continue
    const [i, dir] = [Math.floor(state / 4), state % 4]
    if (i === goal) {
      end = state
      break
    }
    const [c, r] = [i % cols, Math.floor(i / cols)]
    STEPS.forEach(([dc, dr], nd) => {
      const [nc, nr] = [c + dc, r + dr]
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) return
      const j = nr * cols + nc
      if (blocked[j]) return
      const s = spent + 1 + (nd === dir ? 0 : TURN)
      const ns = j * 4 + nd
      if (s >= best[ns]) return
      best[ns] = s
      came[ns] = state
      open.push(ns, s)
    })
  }
  if (end < 0) return null
  const cells: number[] = []
  for (let s = end; s >= 0; s = came[s]) cells.push(Math.floor(s / 4))
  cells.reverse()
  // Keep only the corners, and start and end exactly at the anchors.
  const pts: Pt[] = [a]
  for (let k = 1; k < cells.length - 1; k++) {
    const [p, q, r] = [at(cells[k - 1]), at(cells[k]), at(cells[k + 1])]
    if ((q[0] - p[0]) * (r[1] - q[1]) !== (q[1] - p[1]) * (r[0] - q[0])) pts.push(q)
  }
  pts.push(b)
  return pts
}

const distToLine = (p: Pt, pts: Pt[]) => {
  let best = Infinity
  for (let i = 1; i < pts.length; i++) {
    const [a, b] = [pts[i - 1], pts[i]]
    const [dx, dy] = [b[0] - a[0], b[1] - a[1]]
    const len2 = dx * dx + dy * dy
    const t = len2 ? clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2, 0, 1) : 0
    best = Math.min(best, Math.hypot(p[0] - (a[0] + dx * t), p[1] - (a[1] + dy * t)))
  }
  return best
}

function corridors({ location, map, rand }: GenContext): NewMapObject[] {
  const list = chambers(map)
  if (list.length < 2) return []
  const links = plannedLinks(list)
  const all = links.length ? links : unplannedLinks(list, location, map, rand)
  const regionOf = (o: MapObject) => Number(o.props?.region) || 0
  const routed: { pts: Pt[]; region: number }[] = []
  // Locked links first, so the cleanest routes go to the doors that matter most.
  const order = [...all].sort((p, q) => Number(!!q.lock) - Number(!!p.lock))
  return order.map((l) => {
    const [a, b] = [roomAnchor(l.a), roomAnchor(l.b)]
    const at = (t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
    // Two L-shaped runs, then Z-shaped ones turning at a quarter, half or three quarters of the way. The cheapest
    // wins: passing through a room of another region, or crossing a corridor of another region, would make a way
    // round a lock, so it costs most; passing through another room of the same region costs less.
    const first = rand.chance(0.5) ? 0 : 1
    const ells: Pt[][] = [
      [a, [b[0], a[1]], b],
      [a, [a[0], b[1]], b],
    ]
    const routes: Pt[][] = [ells[first], ells[1 - first]]
    for (const t of [0.5, 0.25, 0.75]) {
      const m = at(t)
      routes.push([a, [m[0], a[1]], [m[0], b[1]], b], [a, [a[0], m[1]], [b[0], m[1]], b])
    }
    const region = Math.max(regionOf(l.a), regionOf(l.b))
    const cost = (r: Pt[]) =>
      roomsOnRoute(r, list, [l.a, l.b]).reduce((s, x) => s + (regionOf(x) === region ? 10 : 1000), 0) +
      routed.filter((x) => x.region !== region && crossings(r, x.pts).length).length * 1000 +
      polylineLength(r) / 1000
    let points = routes.reduce((best, r) => (cost(r) < cost(best) ? r : best))
    // When every simple shape touches another region, search the grid for a way round.
    if (cost(points) >= 1000) {
      const around = routeAround(map, a, b, [l.a, l.b], list.filter((x) => x !== l.a && x !== l.b && regionOf(x) !== region), routed.filter((x) => x.region !== region).map((x) => x.pts))
      if (around && cost(around) < cost(points)) points = around
    }
    routed.push({ pts: points, region })
    const corner = points[1]
    return {
      kind: 'corridor',
      x: corner[0],
      y: corner[1],
      points,
      ctrl: points,
      ...(l.secret ? { secret: true as const } : {}),
      props: {
        width: CORRIDOR,
        ...(nodeOf(l.a) ? { from: nodeOf(l.a)! } : {}),
        ...(nodeOf(l.b) ? { to: nodeOf(l.b)! } : {}),
        ...(l.lock ? { lock: l.lock } : {}),
        ...(l.secret ? { secret: true } : {}),
      },
    }
  })
}

/**
 * Doors where corridors meet rooms. The lock rule: a door from a shallower region into a room of region r carries
 * the lock that guards region r (`LOCK_NAMES[r - 1]`). That puts the planned locks in place, and also locks any
 * other way into a region that routing could not avoid, so no corridor is a way round a lock.
 */
function doors({ map, rand }: GenContext): NewMapObject[] {
  const out: NewMapObject[] = []
  const rooms = chambers(map)
  const regionOf = (o: MapObject | undefined) => Number(o?.props?.region) || 0
  const runs = objects(map, 'corridors', 'corridor')
  const placed: { at: Pt; lock?: string }[] = []
  type Door = NewMapObject & { lock?: string }
  const found: Door[] = []
  for (const run of runs) {
    const pts = run.points ?? []
    const len = polylineLength(pts)
    // The room under each step along the run.
    const steps = Array.from({ length: Math.floor(len / 4) + 1 }, (_, i) => rooms.find((r) => inRoom(r, pointAlong(pts, i * 4).p)))
    for (const room of rooms) {
      for (const c of crossings(pts, roomOutline(room), true)) {
        const k = Math.round(distanceAlong(pts, c.p) / 4)
        // The nearest other room along the run on the far side of this wall.
        const inside = steps[Math.min(steps.length - 1, k + 1)] === room
        let other: MapObject | undefined
        for (let i = k; i >= 0 && i < steps.length; i += inside ? -1 : 1) if (steps[i] && steps[i] !== room) { other = steps[i]; break }
        const lock = other && regionOf(room) > regionOf(other) ? LOCK_NAMES[regionOf(room) - 1] : undefined
        const style = roleOf(room) === 'secret' ? 'secret' : roleOf(room) === 'boss' ? 'gate' : lock ? 'door' : rand.chance(0.3) ? 'open' : 'door'
        found.push({ kind: 'door', x: c.p[0], y: c.p[1], w: CORRIDOR + 2, h: 8, rot: toDeg(c.angle) + 90, props: { style }, ...(lock ? { lock } : {}), ...(style === 'secret' ? { secret: true as const } : {}) })
      }
    }
  }
  // Locked doors first, so none is dropped for a plain door right next to it.
  for (const d of found.sort((p, q) => Number(!!q.lock) - Number(!!p.lock))) {
    if (placed.some((x) => dist(x.at, pos(d)) < CORRIDOR)) continue
    placed.push({ at: pos(d), lock: d.lock })
    out.push(d)
  }
  return out
}

/** How far along a polyline its nearest point to `p` lies. */
function distanceAlong(pts: Pt[], p: Pt): number {
  let [best, at, walked] = [Infinity, 0, 0]
  for (let i = 1; i < pts.length; i++) {
    const [a, b] = [pts[i - 1], pts[i]]
    const len = dist(a, b)
    const t = len ? clamp(((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / (len * len), 0, 1) : 0
    const d = dist(p, [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
    if (d < best) [best, at] = [d, walked + len * t]
    walked += len
  }
  return at
}

/** A free spot on a room's floor, at least `r` from its walls and from `others`. */
function spotIn(room: MapObject, r: number, others: { x: number; y: number; w?: number; h?: number }[], rand: Rng): Pt | null {
  for (let tries = 0; tries < 40; tries++) {
    const p: Pt = [room.x + rand.range(-0.35, 0.35) * (room.w ?? 0), room.y + rand.range(-0.32, 0.32) * (room.h ?? 0)]
    if (inRoom(room, p, -r) && !touches(p, r, others)) return p
  }
  return null
}

function features({ location, map, rand }: GenContext): NewMapObject[] {
  const out: NewMapObject[] = []
  const openings = objects(map, 'doors', 'door')
  for (const room of chambers(map)) {
    const [w, h] = [room.w ?? 0, room.h ?? 0]
    if (roleOf(room) === 'entrance') {
      const p: Pt = [room.x, room.y + h / 2 - 16]
      const at = inRoom(room, p, -10) ? p : roomAnchor(room)
      out.push({ kind: 'stairs', x: at[0], y: at[1], w: 30, h: 22, rot: 0 })
    }
    // Large plain rooms get a row of pillars near each long wall.
    if (w * h > 22000 && roleOf(room) !== 'secret' && shapeOf(room) === 'rect') {
      const wide = w >= h
      const n = Math.max(2, Math.floor((wide ? w : h) / 60))
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n - 0.5
        for (const side of [-1, 1]) {
          const p: Pt = wide ? [room.x + t * w, room.y + side * h * 0.28] : [room.x + side * w * 0.28, room.y + t * h]
          if (!touches(p, 8, out)) out.push({ kind: 'pillar', x: p[0], y: p[1], w: 12, h: 12 })
        }
      }
    }
  }
  if (location.traps) {
    // Traps guard doorways: one step inside some of the doors.
    for (const d of openings) {
      const room = chambers(map).find((r) => inRoom(r, pos(d), 6) && roleOf(r) !== 'entrance')
      if (!room || !rand.chance(0.3)) continue
      const towards = Math.atan2(room.y - d.y, room.x - d.x)
      const p: Pt = [d.x + Math.cos(towards) * 18, d.y + Math.sin(towards) * 18]
      // Traps are hidden from the players.
      if (inRoom(room, p, -4) && !touches(p, 10, out)) out.push({ kind: 'trap', x: p[0], y: p[1], w: 14, h: 14, secret: true })
    }
  }
  return out
}

const KEY_LABEL = (lock: string) => `${lock[0].toUpperCase()}${lock.slice(1)} key`

function contents({ project, location, map, rand }: GenContext): NewMapObject[] {
  const boss = refsOf(project, location.boss, 'design.combat', 'bosses')[0]
  const enemies = refsOf(project, location.enemies, 'design.combat', 'enemies')
  const loot = refsOf(project, location.loot, 'design.items', 'items')
  const solid = objects(map, 'features')
  const out: NewMapObject[] = []
  const spot = (room: MapObject, r: number) => spotIn(room, r, [...solid, ...out], rand)
  let nextLoot = 0
  for (const room of chambers(map)) {
    const role = roleOf(room)
    if (role === 'boss') {
      const [x, y] = roomAnchor(room)
      out.push({ kind: 'marker', x, y, w: 24, h: 24, label: boss?.name ?? 'Boss', props: { type: 'boss' }, spawn: { role: 'boss', ...(boss ? { refId: boss.id } : {}) }, ...(boss ? { refId: boss.id } : {}) })
    } else if (role === 'treasure' || role === 'secret') {
      const p = spot(room, 12)
      const item = loot.length ? loot[nextLoot++ % loot.length] : undefined
      if (p) out.push({ kind: 'furniture', x: p[0], y: p[1], w: 20, h: 14, rot: 0, props: { type: 'chest' }, ...(item ? { label: item.name, refId: item.id } : {}), ...(role === 'secret' ? { secret: true as const } : {}) })
    } else if (role === 'room' && enemies.length && rand.chance(0.7)) {
      const foe = rand.pick(enemies)
      const p = spot(room, 12)
      if (p) out.push({ kind: 'marker', x: p[0], y: p[1], w: 18, h: 18, label: foe.name, refId: foe.id, props: { type: 'enemy' }, spawn: { role: 'enemy', refId: foe.id } })
    }
  }
  // Keys, from the rooms and corridors as they are now (rerolled or edited by hand): walk in from the entrance,
  // opening the locks in order, and put each key in a room reachable at that point. The planned room is used when
  // it is reachable; otherwise the best reachable one. So every lock can be opened, whatever the routing did.
  const graph = buildGraph(map, TOPOLOGY)
  const byId = new Map(chambers(map).map((r) => [r.id, r]))
  const degree = (id: string) => graph.edges.filter((e) => e.a === id || e.b === id).length
  const opened = new Set<string>()
  const used = new Set<string>()
  LOCK_NAMES.filter((lock) => graph.edges.some((e) => e.lock === lock)).forEach((lock, k) => {
    const reached = reach(graph, graph.entrance, (e) => !e.lock || opened.has(e.lock))
    const planned = chambers(map).find((r) => String(r.props?.keys ?? '').split(' ').includes(lock))
    const score = (r: MapObject) =>
      (Number(r.props?.region) === k ? 100 : 0) + (roleOf(r) === 'entrance' ? -50 : 0) + (roleOf(r) === 'secret' ? -30 : 0) + (degree(r.id) === 1 ? 10 : 0) + (reached.get(r.id) ?? 0)
    const room =
      planned && reached.has(planned.id) && !used.has(planned.id)
        ? planned
        : [...reached.keys()].map((id) => byId.get(id)!).filter((r) => r && !used.has(r.id)).sort((p, q) => score(q) - score(p))[0]
    opened.add(lock)
    if (!room) return
    used.add(room.id)
    const p = spot(room, 10) ?? roomAnchor(room)
    out.push({ kind: 'key', x: p[0], y: p[1], w: 16, h: 16, key: lock, label: KEY_LABEL(lock), props: { color: lock } })
  })
  return out
}

/**
 * Torches just inside most doors and at some corridor bends, braziers either side of the boss; secret rooms stay
 * dark. Each light keeps clear of the others, so rooms far from any door are left in shadow.
 */
function lights({ map, rand }: GenContext): NewMapObject[] {
  const out: NewMapObject[] = []
  const free = (p: Pt) => !out.some((o) => dist(pos(o), p) < 46)
  for (const d of objects(map, 'doors', 'door')) {
    const room = chambers(map).find((r) => inRoom(r, pos(d), 8))
    if (!room || room.secret || !rand.chance(0.7)) continue
    const a = Math.atan2(room.y - d.y, room.x - d.x)
    const p: Pt = [d.x + Math.cos(a) * 16, d.y + Math.sin(a) * 16]
    if (inRoom(room, p, -4) && free(p)) out.push(lightOf('torch', p[0], p[1]))
  }
  for (const run of objects(map, 'corridors', 'corridor')) {
    if (run.secret) continue
    for (const bend of (run.points ?? []).slice(1, -1)) if (rand.chance(0.4) && free(bend) && !chambers(map).some((r) => inRoom(r, bend, 6))) out.push(lightOf('torch', bend[0], bend[1]))
  }
  const boss = chambers(map).find((r) => roleOf(r) === 'boss')
  if (boss) {
    for (const side of [-1, 1]) {
      const p: Pt = [boss.x + side * (boss.w ?? 0) * 0.3, boss.y]
      if (inRoom(boss, p, -8)) out.push(lightOf('brazier', p[0], p[1]))
    }
  }
  return out
}

const ROLE_LABEL: Record<string, string> = { entrance: 'Entrance', treasure: 'Treasury', secret: 'Secret room' }

function labels({ map }: GenContext): NewMapObject[] {
  const out: NewMapObject[] = []
  for (const room of chambers(map)) {
    const text = ROLE_LABEL[roleOf(room)]
    if (text) out.push({ kind: 'label', x: room.x, y: room.y - (room.h ?? 0) / 2 + 18, label: text, ...(room.secret ? { secret: true as const } : {}) })
  }
  for (const o of objects(map, 'contents')) if (o.label) out.push({ kind: 'label', x: o.x, y: o.y + (o.h ?? 16) / 2 + 14, label: o.label, ...(o.props?.type === 'boss' ? { props: { size: 'large' } } : {}) })
  return out
}

const LAYERS: LayerDef[] = [
  { id: 'rock', label: 'Rock', dependsOn: [], generate: rock },
  { id: 'corridors', label: 'Corridors', dependsOn: ['rooms'], generate: corridors, addable: ['corridor'] },
  { id: 'rooms', label: 'Rooms', dependsOn: [], generate: rooms, addable: ['chamber'] },
  { id: 'doors', label: 'Doors', dependsOn: ['rooms', 'corridors'], generate: doors, addable: ['door'] },
  { id: 'features', label: 'Stairs, pillars, traps', dependsOn: ['rooms', 'doors'], generate: features, addable: ['stairs', 'pillar', 'trap'] },
  { id: 'contents', label: 'Boss, enemies, loot, keys', dependsOn: ['rooms', 'corridors', 'doors', 'features'], generate: contents, addable: ['marker', 'furniture', 'key'] },
  { id: 'lights', label: 'Lights', dependsOn: ['rooms', 'corridors', 'doors'], generate: lights, addable: ['light'] },
  { id: 'labels', label: 'Labels', dependsOn: ['rooms', 'contents'], generate: labels, addable: ['label'] },
]

export const DUNGEON: LocationTypeDef = {
  id: 'Dungeon',
  size: (location) => ({ w: scaleOf(location).w, h: scaleOf(location).h }),
  layers: LAYERS,
  topology: TOPOLOGY,
  nav: { cell: 8, open: false },
}
