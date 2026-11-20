import type { Entity } from '../../model/types'
import { arrange, DOOR, houseRect, outerSides, planDoors, PRIVACY, programme, scorePlan, type Privacy } from '../architecture'
import { attachFor } from '../attach'
import { anchorOf } from '../links'
import { blob, dist } from '../geometry'
import { replaceObjects } from '../order'
import { lightOf } from '../light'
import type { Rng } from '../rng'
import type { GenContext, LayerDef, LocationMap, LocationTypeDef, MapObject, MapPoint as Pt, NewMapObject } from '../types'
import { biomeTint, clamp, objects, outlineOf, param, path, pos, refsOf, splitRects, touches, type Rect } from './shared'

/**
 * Dwelling: the floor plan of one building. The footprint is cut into rooms, every room is reachable through
 * doors, and each room is furnished for what it is used for.
 * Layers, bottom to top: plot, garden, rooms, doors, furniture, labels. The garden is drawn under the building but
 * generated after the doors, because its path starts at the entrance.
 */
type Footprint = { map: [number, number]; house: [number, number]; rooms: number; floor: string; uses: string[] }
const FOOTPRINTS: Record<string, Footprint> = {
  Hut: { map: [520, 400], house: [200, 160], rooms: 1, floor: 'Earth', uses: ['Living room', 'Store'] },
  House: { map: [640, 480], house: [320, 240], rooms: 4, floor: 'Wood', uses: ['Main room', 'Kitchen', 'Bedroom', 'Storage', 'Bedroom', 'Workshop'] },
  Manor: { map: [820, 600], house: [480, 340], rooms: 8, floor: 'Wood', uses: ['Great hall', 'Kitchen', 'Bedroom', 'Study', 'Pantry', 'Bedroom', 'Storage', 'Bedroom', 'Workshop', 'Storage'] },
  Tower: { map: [520, 520], house: [220, 220], rooms: 2, floor: 'Stone', uses: ['Hall', 'Study', 'Storage', 'Bedroom'] },
}
const footprintOf = (location: Entity) => FOOTPRINTS[String(location.footprint)] ?? FOOTPRINTS.House

/** What stands in a room, most important first; the furnishing level decides how far down the list a room gets. */
const FURNITURE: Record<string, string[]> = {
  'Living room': ['hearth', 'bed', 'table', 'chest', 'stool', 'barrel'],
  'Main room': ['hearth', 'table', 'rug', 'stool', 'chest', 'stool'],
  'Great hall': ['hearth', 'table', 'rug', 'table', 'stool', 'chest', 'stool'],
  Hall: ['hearth', 'table', 'rug', 'stool', 'chest'],
  Kitchen: ['hearth', 'table', 'barrel', 'shelf', 'barrel', 'stool'],
  Bedroom: ['bed', 'chest', 'rug', 'stool', 'shelf'],
  Study: ['table', 'shelf', 'stool', 'rug', 'chest'],
  Workshop: ['table', 'shelf', 'barrel', 'chest', 'stool'],
}
const STORES = ['barrel', 'chest', 'barrel', 'shelf', 'barrel', 'chest']
const SIZES: Record<string, [number, number]> = { bed: [36, 22], table: [32, 20], hearth: [28, 16], chest: [17, 12], barrel: [13, 13], shelf: [36, 9], rug: [46, 30], stool: [9, 9] }
const AGAINST_WALL = new Set(['bed', 'hearth', 'shelf', 'chest', 'barrel'])
const LEVEL: Record<string, number> = { Sparse: 2, 'Lived-in': 4, Rich: 7 }
export const privacyOf = (location: Entity): Privacy => (PRIVACY.includes(location.privacy as Privacy) ? (location.privacy as Privacy) : 'Normal')

const rectOf = (o: MapObject): Rect => ({ x: o.x - (o.w ?? 0) / 2, y: o.y - (o.h ?? 0) / 2, w: o.w ?? 0, h: o.h ?? 0 })
const roomsOf = (map: LocationMap) => objects(map, 'rooms', 'room')

function plot({ project, location, map, rand }: GenContext): NewMapObject[] {
  const tint = biomeTint(project, location)
  return Array.from({ length: rand.int(4, 6) }, () => {
    const rx = rand.range(80, 190)
    const [x, y] = [rand.range(0, map.w), rand.range(0, map.h)]
    return { kind: 'patch', x, y, ...outlineOf(blob(x, y, rx, rx * rand.range(0.6, 0.9), rand, 9)), props: { tone: rand.int(0, 2), ...(tint ? { tint } : {}) } }
  })
}

function rooms({ project, location, map, rand }: GenContext): NewMapObject[] {
  const f = footprintOf(location)
  const count = clamp(Math.round(Number(location.dwellingRooms)) || f.rooms, 1, 12)
  const [w, h] = f.house.map((v) => Math.round((v * param(map, 'houseScale', 1)) / 10) * 10)
  const privacy = privacyOf(location)
  // Inside a building on another map: the front door faces that map's road (links.ts).
  const front = anchorOf(project, location)?.side
  // Which room is what is a search under the house rules (architecture.ts): an entrance hall by the front door,
  // bedrooms off the shared rooms, the pantry by the kitchen, large uses in large rooms. Some cuts of the footprint
  // cannot keep every rule, so a few are tried and the best kept; the first that breaks none wins.
  let best: { slots: ReturnType<typeof arrange>; score: number } | null = null
  for (let attempt = 0; attempt < 4; attempt++) {
    const cut = splitRects({ x: Math.round((map.w - w) / 20) * 10, y: Math.round((map.h - h) / 20) * 10, w, h }, count, rand, 70)
    const slots = arrange(cut, programme(f.uses, cut.length), privacy, rand, front)
    const plan = planDoors(slots, privacy, front)
    const score = scorePlan(slots, privacy, front)
    if (!best || score > best.score) best = { slots, score }
    if (!plan.forced && !plan.unreached.length) break
  }
  return best!.slots.map(({ rect: r, use }) => ({
    kind: 'room',
    x: r.x + r.w / 2,
    y: r.y + r.h / 2,
    w: r.w,
    h: r.h,
    label: use,
    props: { floor: f.floor },
  }))
}

function doors({ project, location, map, rand }: GenContext): NewMapObject[] {
  const list = roomsOf(map)
  if (!list.length) return []
  // Doors from the rules, for the rooms as they are now (also after rooms were moved or renamed by hand).
  const plan = planDoors(list.map((r) => ({ rect: rectOf(r), use: String(r.label ?? '') })), privacyOf(location), anchorOf(project, location)?.side)
  // Each door and window is attached to its room's wall (attach.ts), so it moves with the wall when edited.
  const on = (room: MapObject, p: Pt) => {
    const attach = attachFor(room, p)
    return attach ? { attach } : {}
  }
  const out: NewMapObject[] = plan.doors.map((d) =>
    d.entrance
      ? { kind: 'door', x: d.at[0], y: d.at[1], w: DOOR + 4, h: 8, rot: d.rot, props: { entrance: true }, ...on(list[d.a], d.at) }
      : { kind: 'door', x: d.at[0], y: d.at[1], w: DOOR, h: 8, rot: d.rot, ...on(list[d.a], d.at) },
  )
  const house = houseRect(list.map(rectOf))
  for (const roomObj of list) {
    for (const side of outerSides(rectOf(roomObj), house)) {
      if (side.length < 70) continue
      const shift = rand.range(-0.2, 0.2) * side.length
      const p: Pt = [side.at[0] + (side.rot === 0 ? shift : 0), side.at[1] + (side.rot === 90 ? shift : 0)]
      // Not where a door already is.
      if (plan.doors.some((d) => dist(p, d.at) < DOOR + 22)) continue
      out.push({ kind: 'window', x: p[0], y: p[1], w: 22, h: 6, rot: side.rot, ...on(roomObj, p) })
    }
  }
  return out
}

function garden({ map, rand }: GenContext): NewMapObject[] {
  const list = roomsOf(map).map(rectOf)
  if (!list.length) return []
  const house = houseRect(list)
  const out: NewMapObject[] = []
  const entry = objects(map, 'doors', 'door').find((d) => d.props?.entrance)
  if (entry) {
    // A path from the entrance straight out to the nearest edge of the plot.
    const [cx, cy] = [house.x + house.w / 2, house.y + house.h / 2]
    const end: Pt = entry.rot === 90 ? [entry.x < cx ? -20 : map.w + 20, entry.y + rand.range(-40, 40)] : [entry.x + rand.range(-40, 40), entry.y < cy ? -20 : map.h + 20]
    out.push({ kind: 'road', x: entry.x, y: entry.y, ...path(rand, [pos(entry), [(entry.x + end[0]) / 2, (entry.y + end[1]) / 2], end], 18), props: { width: 12 } })
  }
  const trees: NewMapObject[] = []
  const pathPts = out[0]?.points ?? []
  for (let tries = 0; tries < 300 && trees.length < 16; tries++) {
    const p: Pt = [rand.range(20, map.w - 20), rand.range(20, map.h - 20)]
    const r = rand.range(9, 16)
    const inHouse = p[0] > house.x - r - 14 && p[0] < house.x + house.w + r + 14 && p[1] > house.y - r - 14 && p[1] < house.y + house.h + r + 14
    if (inHouse || pathPts.some((q) => dist(p, q) < r + 14) || touches(p, r * 0.7, trees)) continue
    trees.push({ kind: 'tree', x: p[0], y: p[1], w: r * 2, h: r * 2, props: { tone: rand.int(0, 2) } })
  }
  return [...out, ...trees.sort((a, b) => a.y - b.y)]
}

/** A spot for one piece: against a wall for beds, hearths and shelves, anywhere inside for the rest. */
function spot(room: Rect, type: string, rand: Rng): { p: Pt; rot: number } {
  const [w, h] = SIZES[type]
  const pad = 9
  if (!AGAINST_WALL.has(type)) return { p: [rand.range(room.x + pad + w / 2, room.x + room.w - pad - w / 2), rand.range(room.y + pad + h / 2, room.y + room.h - pad - h / 2)], rot: rand.pick([0, 90]) }
  const side = rand.int(0, 3)
  const along = (from: number, length: number) => rand.range(from + pad + w / 2, from + length - pad - w / 2)
  if (side === 0) return { p: [along(room.x, room.w), room.y + pad + h / 2], rot: 0 }
  if (side === 1) return { p: [along(room.x, room.w), room.y + room.h - pad - h / 2], rot: 0 }
  if (side === 2) return { p: [room.x + pad + h / 2, along(room.y, room.h)], rot: 90 }
  return { p: [room.x + room.w - pad - h / 2, along(room.y, room.h)], rot: 90 }
}

function furniture({ location, map, rand }: GenContext): NewMapObject[] {
  const level = (LEVEL[String(location.furnishing)] ?? LEVEL['Lived-in']) * param(map, 'furnishing', 1)
  const openings = objects(map, 'doors', 'door')
  const out: NewMapObject[] = []
  for (const room of roomsOf(map)) {
    const r = rectOf(room)
    const wanted = (FURNITURE[String(room.label)] ?? STORES).slice(0, Math.max(1, Math.round(level * clamp((r.w * r.h) / 14000, 0.5, 1.4))))
    const placed: NewMapObject[] = []
    for (const type of wanted) {
      const [w, h] = SIZES[type]
      if (r.w < w + 24 || r.h < w + 24) continue
      for (let tries = 0; tries < 40; tries++) {
        const { p, rot } = spot(r, type, rand)
        // Rugs lie under things; everything else keeps clear of other pieces and of the doors.
        if (type !== 'rug' && (touches(p, Math.max(w, h) / 2, placed.filter((o) => o.props?.type !== 'rug')) || openings.some((d) => dist(p, pos(d)) < DOOR + Math.max(w, h) / 2))) continue
        placed.push({ kind: 'furniture', x: p[0], y: p[1], w, h, rot, props: { type } })
        break
      }
    }
    out.push(...placed)
  }
  return out.sort((a, b) => Number(b.props?.type === 'rug') - Number(a.props?.type === 'rug'))
}

const STORE_ROOMS = new Set(['Storage', 'Store', 'Pantry'])

/**
 * Light inside the house: each hearth glows, a living room without one gets a candle, and every window lets in
 * daylight (which fades at dusk and is gone at night).
 */
function lights({ map }: GenContext): NewMapObject[] {
  const out: NewMapObject[] = []
  const furniture = objects(map, 'furniture', 'furniture')
  const hearths = furniture.filter((f) => f.props?.type === 'hearth')
  for (const h of hearths) out.push(lightOf('hearth', h.x, h.y))
  for (const room of roomsOf(map)) {
    if (STORE_ROOMS.has(String(room.label)) || hearths.some((h) => Math.abs(h.x - room.x) < (room.w ?? 0) / 2 && Math.abs(h.y - room.y) < (room.h ?? 0) / 2)) continue
    const table = furniture.find((f) => f.props?.type === 'table' && Math.abs(f.x - room.x) < (room.w ?? 0) / 2 && Math.abs(f.y - room.y) < (room.h ?? 0) / 2)
    out.push(lightOf('candle', table?.x ?? room.x, table?.y ?? room.y))
  }
  const list = roomsOf(map).map(rectOf)
  if (list.length) {
    const house = houseRect(list)
    const [cx, cy] = [house.x + house.w / 2, house.y + house.h / 2]
    for (const w of objects(map, 'doors', 'window')) {
      // Just inside the window, towards the middle of the house.
      const p: Pt = w.rot === 90 ? [w.x + Math.sign(cx - w.x) * 10, w.y] : [w.x, w.y + Math.sign(cy - w.y) * 10]
      out.push(lightOf('window', p[0], p[1]))
    }
  }
  return out
}

/** The owner, at home in the main shared room. */
function people({ project, location, map, rand }: GenContext): NewMapObject[] {
  const owner = refsOf(project, location.owner, 'design.npc', 'archetypes')[0]
  if (!owner) return []
  const shared = roomsOf(map).filter((r) => ['Main room', 'Great hall', 'Living room', 'Hall'].includes(String(r.label)))
  const room = [...shared, ...roomsOf(map)].sort((a, b) => (b.w ?? 0) * (b.h ?? 0) - (a.w ?? 0) * (a.h ?? 0))[0]
  if (!room) return []
  const solid = objects(map, 'furniture').filter((f) => f.props?.type !== 'rug')
  const r = rectOf(room)
  for (let tries = 0; tries < 40; tries++) {
    const p: Pt = [rand.range(r.x + 20, r.x + r.w - 20), rand.range(r.y + 20, r.y + r.h - 20)]
    if (!touches(p, 12, solid)) return [{ kind: 'marker', x: p[0], y: p[1], w: 18, h: 18, label: owner.name, refId: owner.id, props: { type: 'npc' }, spawn: { role: 'npc', refId: owner.id } }]
  }
  return []
}

function labels({ project, location, map }: GenContext): NewMapObject[] {
  const owner = refsOf(project, location.owner, 'design.npc', 'archetypes')[0]
  const out: NewMapObject[] = roomsOf(map)
    .filter((r) => r.label)
    .map((r) => ({ kind: 'label', x: r.x, y: r.y + 4, label: r.label }))
  if (owner) out.push({ kind: 'label', x: map.w / 2, y: map.h - 18, label: `Home of ${owner.name}`, props: { size: 'large' } })
  return out
}

const LAYERS: LayerDef[] = [
  { id: 'plot', label: 'Plot', dependsOn: [], generate: plot },
  { id: 'garden', label: 'Garden and path', dependsOn: ['rooms', 'doors'], generate: garden, addable: ['tree', 'road', 'well'] },
  { id: 'rooms', label: 'Walls and rooms', dependsOn: [], generate: rooms, addable: ['room'] },
  { id: 'doors', label: 'Doors and windows', dependsOn: ['rooms'], generate: doors, addable: ['door', 'window'] },
  { id: 'furniture', label: 'Furniture', dependsOn: ['rooms', 'doors'], generate: furniture, addable: ['furniture'] },
  { id: 'people', label: 'People', dependsOn: ['rooms', 'furniture'], generate: people, addable: ['marker'] },
  { id: 'lights', label: 'Lights', dependsOn: ['rooms', 'doors', 'furniture'], generate: lights, addable: ['light'] },
  { id: 'labels', label: 'Labels', dependsOn: ['rooms'], generate: labels, addable: ['label'] },
]

/**
 * A room edited by hand takes its walls with it: a neighbour that shared the wall that moved follows it, growing
 * or shrinking, so no gap opens and no rooms overlap. Pinned rooms stay; a neighbour that would get too small stays.
 */
function heal(map: LocationMap, before: MapObject, after: MapObject): LocationMap {
  if (after.kind !== 'room') return map
  const [o, n] = [rectOf(before), rectOf(after)]
  const changed = new Map<string, MapObject>()
  const overlap = (a0: number, a1: number, b0: number, b1: number) => Math.min(a1, b1) - Math.max(a0, b0) > 1
  for (const r of roomsOf(map)) {
    if (r.id === after.id || r.pinned) continue
    const q = rectOf(r)
    let [x0, x1, y0, y1] = [q.x, q.x + q.w, q.y, q.y + q.h]
    const alongY = overlap(q.y, q.y + q.h, o.y, o.y + o.h)
    const alongX = overlap(q.x, q.x + q.w, o.x, o.x + o.w)
    if (alongY && Math.abs(x1 - o.x) < 1) x1 = n.x
    if (alongY && Math.abs(x0 - (o.x + o.w)) < 1) x0 = n.x + n.w
    if (alongX && Math.abs(y1 - o.y) < 1) y1 = n.y
    if (alongX && Math.abs(y0 - (o.y + o.h)) < 1) y0 = n.y + n.h
    if ([x0, x1, y0, y1].join() === [q.x, q.x + q.w, q.y, q.y + q.h].join() || x1 - x0 < 40 || y1 - y0 < 40) continue
    changed.set(r.id, { ...r, x: Math.round((x0 + x1) / 2), y: Math.round((y0 + y1) / 2), w: Math.round(x1 - x0), h: Math.round(y1 - y0) })
  }
  return replaceObjects(map, changed, DWELLING)
}

export const DWELLING: LocationTypeDef = {
  id: 'Dwelling',
  size: (location) => ({ w: footprintOf(location).map[0], h: footprintOf(location).map[1] }),
  layers: LAYERS,
  topology: { rooms: { layer: 'rooms', kind: 'room' }, doors: { layer: 'doors', kind: 'door' } },
  nav: { cell: 5, open: true },
  heal,
  params: [
    { id: 'houseScale', label: 'House size', min: 0.8, max: 1.3, step: 0.05, default: 1, layers: ['rooms'] },
    { id: 'furnishing', label: 'Furniture', min: 0.3, max: 1.8, step: 0.1, default: 1, layers: ['furniture'] },
  ],
  stamps: [
    {
      id: 'bedroom',
      label: 'Bed, chest and rug',
      layer: 'furniture',
      make: (x, y) => [
        { kind: 'furniture', x, y, w: 46, h: 30, rot: 0, props: { type: 'rug' } },
        { kind: 'furniture', x, y: y - 6, w: 36, h: 22, rot: 0, props: { type: 'bed' } },
        { kind: 'furniture', x: x + 32, y: y - 6, w: 17, h: 12, rot: 0, props: { type: 'chest' } },
      ],
    },
  ],
}
