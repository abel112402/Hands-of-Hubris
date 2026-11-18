import type { Rng } from './rng'
import { OUTSIDE, type MapGraph } from './topology'
import type { MapObject, MapPoint as Pt } from './types'
import type { Rect } from './types/shared'

/**
 * How a house is laid out: what each room is for, which rooms may open into which, and the search that fits a
 * programme of rooms into the cut-up footprint so the rules hold. The rules are data (ROOM_USES, ROOM_RULES);
 * `planDoors` places doors that follow them, `arrange` picks which room goes where, and `checkPlan` reports the
 * rules a finished (or hand-edited) plan breaks.
 */
export type Zone = 'public' | 'private' | 'service'
export type Privacy = 'Low' | 'Normal' | 'Strict'
export const PRIVACY: Privacy[] = ['Low', 'Normal', 'Strict']

/** What a room is for. `size` orders rooms by how much floor they want (3 large … 1 small). */
export type RoomUse = { zone: Zone; size: 1 | 2 | 3 }
export const ROOM_USES: Record<string, RoomUse> = {
  Hall: { zone: 'public', size: 1 },
  'Main room': { zone: 'public', size: 3 },
  'Great hall': { zone: 'public', size: 3 },
  'Living room': { zone: 'public', size: 3 },
  Kitchen: { zone: 'service', size: 2 },
  Pantry: { zone: 'service', size: 1 },
  Storage: { zone: 'service', size: 1 },
  Store: { zone: 'service', size: 1 },
  Workshop: { zone: 'service', size: 2 },
  Bedroom: { zone: 'private', size: 2 },
  Study: { zone: 'private', size: 1 },
}
/** A room whose use is unknown (renamed by hand) counts as a public room of middle size. */
export const roomUse = (label: unknown): RoomUse => ROOM_USES[String(label ?? '')] ?? { zone: 'public', size: 2 }

export const ROOM_RULES = {
  /** The front door opens into one of these. */
  entranceTo: ['Hall', 'Main room', 'Great hall', 'Living room'],
  /** No door between these. */
  noDoor: [
    ['Bedroom', 'Kitchen'],
    ['Bedroom', 'Pantry'],
    ['Bedroom', 'Workshop'],
    ['Study', 'Kitchen'],
    ['Study', 'Workshop'],
  ] as [string, string][],
  /** Better when these share a door. */
  near: [
    ['Kitchen', 'Pantry'],
    ['Kitchen', 'Main room'],
    ['Kitchen', 'Great hall'],
    ['Hall', 'Main room'],
    ['Hall', 'Great hall'],
  ] as [string, string][],
}

const pair = (rules: [string, string][], a: string, b: string) => rules.some(([p, q]) => (p === a && q === b) || (p === b && q === a))

/**
 * Whether a door may join room `from` (already reached) to room `to`. Private rooms (bedrooms, studies) are
 * reached from the shared rooms, never through a kitchen or store, and are not a way through to other kinds of
 * room; with Strict privacy only from a shared room that is not the one the front door opens into, unless that
 * one is an entrance hall.
 */
export function doorAllowed(from: string, to: string, privacy: Privacy, entranceRoom?: string): boolean {
  if (pair(ROOM_RULES.noDoor, from, to)) return false
  if (privacy === 'Low') return true
  const [zf, zt] = [roomUse(from).zone, roomUse(to).zone]
  if (zt === 'private' && zf === 'service') return false
  if (zf === 'private' && zt !== 'private') return false
  if (privacy === 'Strict' && zt === 'private' && (zf !== 'public' || (from === entranceRoom && from !== 'Hall'))) return false
  return true
}

// ---------- Geometry of a cut footprint ----------

export const DOOR = 24

/** The stretch of wall two rooms share, when it is long enough for a door: its middle and the wall's angle. */
export function sharedWall(a: Rect, b: Rect, spare: number): { at: Pt; rot: number; length: number } | null {
  const overlap = (a0: number, a1: number, b0: number, b1: number) => [Math.max(a0, b0), Math.min(a1, b1)]
  for (const [p, q] of [[a, b], [b, a]]) {
    if (Math.abs(p.x + p.w - q.x) < 1) {
      const [lo, hi] = overlap(p.y, p.y + p.h, q.y, q.y + q.h)
      if (hi - lo >= DOOR + spare) return { at: [q.x, (lo + hi) / 2], rot: 90, length: hi - lo }
    }
    if (Math.abs(p.y + p.h - q.y) < 1) {
      const [lo, hi] = overlap(p.x, p.x + p.w, q.x, q.x + q.w)
      if (hi - lo >= DOOR + spare) return { at: [(lo + hi) / 2, q.y], rot: 0, length: hi - lo }
    }
  }
  return null
}

export type Side = { at: Pt; rot: number; length: number; side: 'south' | 'west' | 'east' | 'north' }
/** The sides of a room that are outside walls of the building, as wall midpoints; south first. */
export function outerSides(room: Rect, house: Rect): Side[] {
  const out: Side[] = []
  if (Math.abs(room.y + room.h - (house.y + house.h)) < 1) out.push({ at: [room.x + room.w / 2, room.y + room.h], rot: 0, length: room.w, side: 'south' })
  if (Math.abs(room.x - house.x) < 1) out.push({ at: [room.x, room.y + room.h / 2], rot: 90, length: room.h, side: 'west' })
  if (Math.abs(room.x + room.w - (house.x + house.w)) < 1) out.push({ at: [room.x + room.w, room.y + room.h / 2], rot: 90, length: room.h, side: 'east' })
  if (Math.abs(room.y - house.y) < 1) out.push({ at: [room.x + room.w / 2, room.y], rot: 0, length: room.w, side: 'north' })
  return out
}

export function houseRect(list: Rect[]): Rect {
  const x = Math.min(...list.map((r) => r.x))
  const y = Math.min(...list.map((r) => r.y))
  return { x, y, w: Math.max(...list.map((r) => r.x + r.w)) - x, h: Math.max(...list.map((r) => r.y + r.h)) - y }
}

// ---------- Planning ----------

export type Slot = { rect: Rect; use: string }
export type PlannedDoor = { a: number; b: number | 'outside'; at: Pt; rot: number; entrance?: true }
export type DoorPlan = {
  doors: PlannedDoor[]
  entrance: number
  /** Rooms no door reaches. */
  unreached: number[]
  /** Doors that had to break a rule, because no allowed door reached a room. */
  forced: number
}

const ZONE_ORDER: Record<Zone, number> = { public: 0, service: 1, private: 2 }

/**
 * Doors for an arranged house: the front door into the best entrance room (an entrance hall first, on the south
 * side first), then a spanning tree grown from it. Each step takes an allowed door, preferring to grow from shared
 * rooms and towards rooms the rules want close; only when no allowed door is left does it take a forbidden one
 * (counted in `forced`).
 */
export function planDoors(slots: Slot[], privacy: Privacy): DoorPlan {
  if (!slots.length) return { doors: [], entrance: -1, unreached: [], forced: 0 }
  const house = houseRect(slots.map((s) => s.rect))
  const sideRank = { south: 0, west: 1, east: 1, north: 2 }
  const fronts = slots
    .flatMap((s, i) => outerSides(s.rect, house).filter((side) => side.length >= DOOR + 16).map((side) => ({ i, side })))
    .sort((p, q) => {
      const rank = (x: { i: number }) => (slots[x.i].use === 'Hall' ? 0 : ROOM_RULES.entranceTo.includes(slots[x.i].use) ? 1 : roomUse(slots[x.i].use).zone === 'private' ? 4 : 3)
      return rank(p) - rank(q) || sideRank[p.side.side] - sideRank[q.side.side] || p.i - q.i
    })
  const front = fronts[0]
  const entrance = front?.i ?? 0
  const doors: PlannedDoor[] = front ? [{ a: entrance, b: 'outside', at: front.side.at, rot: front.side.rot, entrance: true }] : []
  const reached = new Set([entrance])
  let forced = 0
  const walls = new Map<string, NonNullable<ReturnType<typeof sharedWall>>>()
  const wallOf = (i: number, j: number) => {
    const k = `${Math.min(i, j)}-${Math.max(i, j)}`
    if (!walls.has(k)) {
      const w = sharedWall(slots[i].rect, slots[j].rect, 16) ?? sharedWall(slots[i].rect, slots[j].rect, 2)
      if (w) walls.set(k, w)
    }
    return walls.get(k)
  }
  for (;;) {
    const options: { i: number; j: number; ok: boolean; key: number[] }[] = []
    for (const i of reached) {
      for (let j = 0; j < slots.length; j++) {
        if (reached.has(j)) continue
        const w = wallOf(i, j)
        if (!w) continue
        const ok = doorAllowed(slots[i].use, slots[j].use, privacy, slots[entrance].use)
        const near = pair(ROOM_RULES.near, slots[i].use, slots[j].use) ? 0 : 1
        options.push({ i, j, ok, key: [ok ? 0 : 1, ZONE_ORDER[roomUse(slots[i].use).zone], near, ZONE_ORDER[roomUse(slots[j].use).zone], -w.length, i, j] })
      }
    }
    if (!options.length) break
    options.sort((p, q) => {
      for (let k = 0; k < p.key.length; k++) if (p.key[k] !== q.key[k]) return p.key[k] - q.key[k]
      return 0
    })
    const best = options[0]
    if (!best.ok) forced++
    const w = wallOf(best.i, best.j)!
    doors.push({ a: best.i, b: best.j, at: w.at, rot: w.rot })
    reached.add(best.j)
  }
  return { doors, entrance, unreached: slots.map((_, i) => i).filter((i) => !reached.has(i)), forced }
}

/** How well an arrangement keeps the rules and fits rooms to their sizes; higher is better. */
export function scorePlan(slots: Slot[], privacy: Privacy): number {
  const plan = planDoors(slots, privacy)
  const area = (s: Slot) => s.rect.w * s.rect.h
  // Large uses in large rooms: a room's place by floor area against how many uses want more floor than its use.
  const byArea = [...slots].sort((p, q) => area(q) - area(p))
  const wantMore = (x: Slot) => slots.filter((y) => roomUse(y.use).size > roomUse(x.use).size).length
  const misfit = slots.reduce((s, x) => s + Math.max(0, wantMore(x) - byArea.indexOf(x)) + Math.max(0, byArea.indexOf(x) - (wantMore(x) + slots.filter((y) => roomUse(y.use).size === roomUse(x.use).size).length - 1)), 0)
  const near = plan.doors.filter((d) => d.b !== 'outside' && pair(ROOM_RULES.near, slots[d.a].use, slots[d.b as number].use)).length
  const front = slots[plan.entrance]?.use
  const entranceOk = front === 'Hall' ? 6 : ROOM_RULES.entranceTo.includes(front) ? 3 : -40
  return -1000 * plan.unreached.length - 100 * plan.forced + entranceOk + 4 * near - misfit
}

/**
 * Which use goes in which room: biggest uses in the biggest rooms first, then pairs of rooms swap places while
 * that keeps improving the score (a few hundred tries, from the layer's random stream).
 */
export function arrange(rects: Rect[], uses: string[], privacy: Privacy, rand: Rng): Slot[] {
  const byArea = rects.map((_, i) => i).sort((p, q) => rects[q].w * rects[q].h - rects[p].w * rects[p].h)
  const bySize = [...uses].sort((p, q) => roomUse(q).size - roomUse(p).size)
  const slots: Slot[] = rects.map((rect) => ({ rect, use: '' }))
  byArea.forEach((ri, k) => (slots[ri].use = bySize[k] ?? 'Storage'))
  let best = scorePlan(slots, privacy)
  for (let t = 0; t < 240 && slots.length > 1; t++) {
    const [i, j] = [rand.int(0, slots.length - 1), rand.int(0, slots.length - 1)]
    if (i === j || slots[i].use === slots[j].use) continue
    ;[slots[i].use, slots[j].use] = [slots[j].use, slots[i].use]
    const s = scorePlan(slots, privacy)
    if (s > best) best = s
    else [slots[i].use, slots[j].use] = [slots[j].use, slots[i].use]
  }
  return slots
}

/** The rooms of a house: an entrance hall first when there are four or more, then the footprint's uses in order. */
export function programme(uses: string[], count: number): string[] {
  const list = count >= 4 && !uses.includes('Hall') ? ['Hall', ...uses] : [...uses]
  return Array.from({ length: count }, (_, i) => list[i % list.length])
}

// ---------- Checking a finished plan ----------

export type PlanIssue = { rule: 'entrance' | 'noDoor' | 'privacy' | 'unreachable' | 'privateExit'; text: string; rooms: string[] }

/**
 * The rules a plan breaks, read from its room graph (rooms joined by the doors actually on the map), so hand edits
 * are checked too. Room uses come from the room labels.
 */
export function checkPlan(graph: MapGraph, rooms: MapObject[], privacy: Privacy, unreachable: string[]): PlanIssue[] {
  const label = (id: string) => String(rooms.find((r) => r.id === id)?.label ?? 'room')
  const issues: PlanIssue[] = []
  const fronts = graph.edges.filter((e) => e.a === OUTSIDE || e.b === OUTSIDE).map((e) => (e.a === OUTSIDE ? e.b : e.a))
  const frontRooms = fronts.filter((id) => ROOM_RULES.entranceTo.includes(label(id)))
  if (!frontRooms.length && fronts.length) issues.push({ rule: 'entrance', text: `The front door opens into the ${label(fronts[0])}; it should lead into a hall or main room.`, rooms: [fronts[0]] })
  if (!fronts.length && rooms.length) issues.push({ rule: 'entrance', text: 'The house has no door to the outside.', rooms: [] })
  const entranceRoom = frontRooms[0] ?? fronts[0]
  for (const e of graph.edges) {
    if (e.a === OUTSIDE || e.b === OUTSIDE) {
      const inner = e.a === OUTSIDE ? e.b : e.a
      if (privacy !== 'Low' && roomUse(label(inner)).zone === 'private') issues.push({ rule: 'privateExit', text: `The ${label(inner)} has a door straight outside.`, rooms: [inner] })
      continue
    }
    const [a, b] = [label(e.a), label(e.b)]
    if (pair(ROOM_RULES.noDoor, a, b)) {
      issues.push({ rule: 'noDoor', text: `A door joins the ${a} and the ${b}.`, rooms: [e.a, e.b] })
      continue
    }
    if (privacy === 'Low') continue
    // A private room may open only towards rooms it may be reached from; check both ways round.
    const ok = doorAllowed(a, b, privacy, label(entranceRoom)) || doorAllowed(b, a, privacy, label(entranceRoom))
    if (!ok) {
      const [priv, other] = roomUse(a).zone === 'private' ? [a, b] : [b, a]
      issues.push({ rule: 'privacy', text: `The ${priv} opens into the ${other}; private rooms should open onto shared rooms.`, rooms: [e.a, e.b] })
    }
  }
  for (const id of unreachable) if (id !== OUTSIDE) issues.push({ rule: 'unreachable', text: `No door leads into the ${label(id)}.`, rooms: [id] })
  return issues
}
