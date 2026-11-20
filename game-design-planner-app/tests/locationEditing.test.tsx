import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '../src/core/i18n'
import { App } from '../src/App'
import { lockCheck, mapNav } from '../src/core/location/analysis'
import { attachFor, reproject } from '../src/core/location/attach'
import { addStamp, paintField, redrawn, splitRoom } from '../src/core/location/brush'
import { addMask, findObject, maskAround, moved, putObject, resized } from '../src/core/location/edit'
import { generateMap, regenerateLayer } from '../src/core/location/generate'
import { distToPolyline, inPolygon, polylineLength } from '../src/core/location/geometry'
import { findPath } from '../src/core/location/nav'
import { gridOf } from '../src/core/location/raster'
import { getLocationType } from '../src/core/location/registry'
import { GLYPHS } from '../src/core/location/render/glyphs'
import { PARCHMENT } from '../src/core/location/render/theme'
import { inRoom, roomAnchor } from '../src/core/location/rooms'
import { parseMap } from '../src/core/location/schema'
import { snapMove } from '../src/core/location/snap'
import type { LocationMap, MapObject } from '../src/core/location/types'
import { createProject } from '../src/core/model/project'
import type { Entity } from '../src/core/model/types'
import { useStore } from '../src/core/store/store'
import { WORLD_DOC } from '../src/core/world'

afterEach(cleanup)

const project = createProject('Editing')
const all = (map: LocationMap, layer?: string) => (layer ? map.layers[layer]?.objects ?? [] : Object.values(map.layers).flatMap((l) => l.objects))
const get = (map: LocationMap, id: string) => findObject(map, id)!.object

describe('attachments', () => {
  it('keep an object in its place on a box and beside a line, turning with the host', () => {
    const room: MapObject = { id: 'r', kind: 'room', x: 100, y: 100, w: 100, h: 80 }
    const door: MapObject = { id: 'd', kind: 'door', x: 150, y: 110, w: 24, h: 8, rot: 90 }
    const onRoom = { ...door, attach: attachFor(room, [150, 110])! }
    expect(onRoom.attach.off).toBeUndefined()
    const after = reproject(onRoom, { ...room, x: 130, y: 90 })
    expect([after.x, after.y]).toEqual([180, 100])
    const road: MapObject = { id: 'rd', kind: 'road', x: 0, y: 0, points: [[0, 0], [200, 0]] }
    const house = { id: 'h', kind: 'house', x: 100, y: 30, w: 30, h: 20, rot: 0, attach: attachFor(road, [100, 30])! }
    expect(house.attach).toMatchObject({ off: 30, t: 0.5 })
    // The road turned to run downwards: the house stays 30 units to the same side and turns with it.
    const turned = reproject(house, { ...road, points: [[0, 0], [0, 200]] })
    expect([turned.x, turned.y, turned.rot]).toEqual([-30, 100, 90])
    expect(reproject({ ...house, pinned: true }, { ...road, points: [[0, 0], [0, 200]] })).toEqual({ ...house, pinned: true })
  })
})

describe('healing after a hand edit', () => {
  it('dungeon: a moved room takes its corridors, doors (with their locks) and contents along', () => {
    const loc: Entity = { id: 'd', name: 'D', type: 'Dungeon', size: 'Medium', keyLocks: 1 }
    const map = generateMap(project, loc, 5)!
    const room = all(map, 'rooms').find((r) => r.props?.role === 'boss')!
    const inside = all(map, 'contents').filter((o) => inRoom(room, [o.x, o.y]))
    const next = putObject(map, moved(room, 20, -10))
    const after = get(next, room.id)
    for (const run of all(next, 'corridors').filter((c) => c.props?.to === after.props?.node || c.props?.from === after.props?.node)) {
      expect(run.points!.some((p) => Math.hypot(p[0] - roomAnchor(after)[0], p[1] - roomAnchor(after)[1]) < 1)).toBe(true)
    }
    const locked = all(next, 'doors').filter((d) => d.lock)
    expect(locked.length).toBeGreaterThan(0)
    for (const d of locked) expect(all(next, 'rooms').some((r) => inRoom(r, [d.x, d.y], 3) && !inRoom(r, [d.x, d.y], -3))).toBe(true)
    for (const o of inside) expect([get(next, o.id).x, get(next, o.id).y]).toEqual([o.x + 20, o.y - 10])
    expect(lockCheck(next)).toMatchObject({ ok: true })
    // The way to the boss still needs the key, and still exists with it.
    const entry = all(next, 'features').find((f) => f.kind === 'stairs')!
    expect(findPath(mapNav(next), [entry.x, entry.y], roomAnchor(after), { open: new Set(['red']) })).not.toBeNull()
    expect(findPath(mapNav(next), [entry.x, entry.y], roomAnchor(after), { open: new Set() })).toBeNull()
  })

  it('house: a wall dragged out pushes the neighbouring room back, and its doors and windows follow', () => {
    const loc: Entity = { id: 'h', name: 'H', type: 'Dwelling', footprint: 'Manor' }
    const map = generateMap(project, loc, 2)!
    const rooms = all(map, 'rooms')
    const edge = (o: MapObject) => o.x + (o.w ?? 0) / 2
    // A room with a neighbour sharing its right wall.
    const room = rooms.find((r) => rooms.some((n) => Math.abs(n.x - (n.w ?? 0) / 2 - edge(r)) < 1 && Math.abs(n.y - r.y) < ((n.h ?? 0) + (r.h ?? 0)) / 2 - 2))!
    const neighbour = rooms.find((n) => Math.abs(n.x - (n.w ?? 0) / 2 - edge(room)) < 1 && Math.abs(n.y - room.y) < ((n.h ?? 0) + (room.h ?? 0)) / 2 - 2)!
    const wider = { ...resized(room, (room.w ?? 0) + 20, room.h ?? 0), x: room.x + 10 }
    const next = putObject(map, wider)
    const n2 = get(next, neighbour.id)
    expect(n2.x - (n2.w ?? 0) / 2).toBe(edge(wider))
    expect(n2.x + (n2.w ?? 0) / 2).toBe(neighbour.x + (neighbour.w ?? 0) / 2)
    const attached = all(next, 'doors').filter((d) => d.attach?.to === room.id)
    expect(attached.length).toBeGreaterThan(0)
    for (const d of attached) expect(inRoom(get(next, room.id), [d.x, d.y], 2) && !inRoom(get(next, room.id), [d.x, d.y], -2)).toBe(true)
  })

  it('town: houses keep beside a redrawn road, and bridges find the river again', () => {
    const loc: Entity = { id: 'v', name: 'V', type: 'Village', water: 'River' }
    const map = generateMap(project, loc, 4)!
    const road = all(map, 'roads').find((r) => r.kind === 'road' && all(map, 'buildings').some((h) => h.attach?.to === r.id))!
    const shifted = moved(road, 0, 30)
    const next = putObject(map, { ...shifted, pinned: true })
    const houses = all(next, 'buildings').filter((h) => h.attach?.to === road.id && !h.pinned)
    expect(houses.length).toBeGreaterThan(0)
    for (const h of houses) expect(Math.abs(distToPolyline([h.x, h.y], shifted.points!) - (h.attach!.off ?? 0))).toBeLessThan(3)
    const river = all(next, 'water').find((o) => o.kind === 'river')!
    for (const b of all(next, 'roads').filter((o) => o.kind === 'bridge')) expect(distToPolyline([b.x, b.y], river.points!)).toBeLessThan(3)
  })

  it('never moves pinned objects, and an edit with its healing stays one change of the map', () => {
    const loc: Entity = { id: 'h', name: 'H', type: 'Dwelling', footprint: 'House' }
    const map = generateMap(project, loc, 3)!
    const room = all(map, 'rooms')[0]
    const door = all(map, 'doors').find((d) => d.attach?.to === room.id)!
    const pinned = putObject(map, door, { heal: false })
    const next = putObject(pinned, moved(get(pinned, room.id), 10, 0))
    expect(get(next, door.id)).toEqual(get(pinned, door.id))
    expect(parseMap(JSON.parse(JSON.stringify(next)))).toEqual(next)
  })
})

describe('masks', () => {
  it('keep what is inside through rerolls and new maps, and keep new objects out', () => {
    const loc: Entity = { id: 'v', name: 'V', type: 'Village', size: 'Large' }
    const map = generateMap(project, loc, 6)!
    const house = all(map, 'buildings')[3]
    const masked = addMask(map, maskAround(house, 40), 'm1')
    const poly = masked.masks![0].poly
    const inside = (m: LocationMap) => all(m, 'buildings').filter((h) => inPolygon([h.x, h.y], poly))
    const before = inside(masked)
    const rerolled = regenerateLayer(project, loc, masked, 'buildings')
    expect(inside(rerolled)).toEqual(before)
    const fresh = generateMap(project, loc, 99, masked)!
    expect(inside(fresh)).toEqual(before)
    expect(fresh.masks).toEqual(masked.masks)
  })

  it('keep a hand-carved part of a cave when the cavern is rolled again', () => {
    const loc: Entity = { id: 'k', name: 'K', type: 'Cave' }
    const map = generateMap(project, loc, 3)!
    let carved = map
    for (let x = 300; x <= 500; x += 20) carved = paintField(carved, 'rock', [x, 300], 30, 0)
    const masked = addMask(carved, [[260, 260], [540, 260], [540, 340], [260, 340]], 'm')
    const rolled = regenerateLayer(project, loc, masked, 'cavern')
    const g = gridOf(rolled.fields!.rock)!
    for (let x = 320; x <= 480; x += 40) expect(g.data[Math.floor(300 / g.cell) * g.cols + Math.floor(x / g.cell)], `x ${x}`).toBe(0)
  })
})

describe('snapping', () => {
  it('lines a dragged room up with its neighbour and shows a guide, else keeps it on the grid', () => {
    const loc: Entity = { id: 'd', name: 'D', type: 'Dungeon' }
    const map = generateMap(project, loc, 1)!
    const [a, b] = all(map, 'rooms')
    const near = { ...a, x: b.x - (b.w ?? 0) / 2 - (a.w ?? 0) / 2 + 4, y: b.y + 3 }
    const { object, guides } = snapMove(map, near, 'rooms')
    expect(object.x + (object.w ?? 0) / 2).toBe(b.x - (b.w ?? 0) / 2)
    expect(guides.length).toBeGreaterThan(0)
    const alone = snapMove({ ...map, layers: { ...map.layers, rooms: { nonce: 0, objects: [a] } } }, { ...a, x: a.x + 3, y: a.y + 7 }, 'rooms')
    expect(((alone.object.x - (a.w ?? 0) / 2) % 10 + 10) % 10).toBe(0)
    expect(alone.guides).toEqual([])
  })
})

describe('brushes, redrawing, splitting and stamps', () => {
  it('paints blocked ground that the walkability grid obeys', () => {
    const loc: Entity = { id: 'v', name: 'V', type: 'Village' }
    const map = generateMap(project, loc, 2)!
    let painted = map
    for (let y = 0; y <= map.h; y += 20) painted = paintField(painted, 'navOverride', [map.w / 2, y], 20, 2)
    expect(findPath(mapNav(map), [40, map.h / 2], [map.w - 40, map.h / 2])).not.toBeNull()
    expect(findPath(mapNav(painted), [40, map.h / 2], [map.w - 40, map.h / 2])).toBeNull()
  })

  it('carves a cave by hand: the outline is traced again and the layers above it wait for an update', () => {
    const loc: Entity = { id: 'k', name: 'K', type: 'Cave' }
    const map = generateMap(project, loc, 2)!
    const carved = paintField(map, 'rock', [map.w / 2, 60], 40, 0)
    expect(carved.layers.cavern.objects).not.toEqual(map.layers.cavern.objects)
    expect(carved.layers.chambers.stale).toBe(true)
    // The rim of the map stays rock.
    const rim = paintField(map, 'rock', [5, 5], 30, 0)
    expect(gridOf(rim.fields!.rock)!.data[0]).toBe(1)
  })

  it('redraws a road through a hand-drawn stroke', () => {
    const road: MapObject = { id: 'r', kind: 'road', x: 0, y: 0, points: [[0, 0], [10, 0]], ctrl: [[0, 0], [10, 0]] }
    const stroke: [number, number][] = Array.from({ length: 50 }, (_, i) => [i * 10, Math.sin(i / 8) * 40])
    const next = redrawn(road, stroke)!
    expect(next.ctrl!.length).toBe(Math.round(polylineLength(stroke) / 60) + 1)
    expect(next.ctrl![0]).toEqual([0, 0])
    expect(next.points!.length).toBeGreaterThan(next.ctrl!.length)
    expect(redrawn({ id: 'h', kind: 'house', x: 0, y: 0 }, stroke)).toBeNull()
  })

  it('splits a room in two along its longer side and drops stamps pinned', () => {
    const loc: Entity = { id: 'h', name: 'H', type: 'Dwelling', footprint: 'House' }
    const map = generateMap(project, loc, 2)!
    const room = all(map, 'rooms').sort((p, q) => (q.w ?? 0) * (q.h ?? 0) - (p.w ?? 0) * (p.h ?? 0))[0]
    const split = splitRoom(map, room.id, [room.x + 7, room.y + 7], 'new-room')
    const [a, b] = [get(split, room.id), get(split, 'new-room')]
    expect((a.w ?? 0) * (a.h ?? 0) + (b.w ?? 0) * (b.h ?? 0)).toBe((room.w ?? 0) * (room.h ?? 0))
    expect(split.layers.doors.stale).toBe(true)
    expect(b).toMatchObject({ label: 'Room', pinned: true })
    const stamp = getLocationType('Dwelling')!.stamps![0]
    const made = stamp.make(100, 100)
    const stamped = addStamp(map, stamp.layer, made, made.map((_, i) => `s${i}`))
    expect(all(stamped, stamp.layer).filter((o) => o.id.startsWith('s')).every((o) => o.pinned)).toBe(true)
    expect(Object.values(getLocationType('Dungeon')!.stamps!).length).toBeGreaterThan(2)
  })
})

describe('light glow and clicks', () => {
  it("lets clicks through a light's glow to the room under it", () => {
    const glow = GLYPHS.light.under!({ id: 'l', kind: 'light', x: 0, y: 0, props: { type: 'brazier' } }, PARCHMENT)
    expect(glow.length).toBeGreaterThan(0)
    for (const node of glow) expect(node.attrs!['pointer-events']).toBe('none')
  })
})

describe('Map view editing', () => {
  it('sets a lock from the panel, keeps the area around the object, lists it and removes it', async () => {
    const p = createProject('UI')
    const loc = { id: 'd', name: 'Crypt', type: 'Dungeon', keyLocks: 0 }
    p.documents[WORLD_DOC].data.locations = [{ ...loc, map: generateMap(p, loc, 5) }]
    useStore.getState().loadProject(p, 'x')
    window.location.hash = '#/doc/design.world?s=locations'
    const { container } = render(<App />)
    fireEvent.click((await screen.findAllByRole('button', { name: 'Map' })).find((b) => b.closest('.tabs'))!)
    const stored = () => useStore.getState().project.documents[WORLD_DOC].data.locations[0].map as LocationMap
    const doorId = all(stored(), 'doors')[0].id
    fireEvent.pointerDown(container.querySelector(`[data-obj="${doorId}"]`)!, { button: 0 })
    fireEvent.pointerUp(window)
    fireEvent.change(screen.getByLabelText('Lock'), { target: { value: 'blue' } })
    expect(get(stored(), doorId).lock).toBe('blue')
    fireEvent.click(screen.getByRole('button', { name: 'Keep this area' }))
    expect(stored().masks).toHaveLength(1)
    expect(container.querySelector('[data-testid="loc-masks"]')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /^Remove Kept area/ }))
    expect(stored().masks).toBeUndefined()
    expect(screen.getByRole('toolbar', { name: 'Tools' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Carve rock' })).toBeNull()
  })
})
