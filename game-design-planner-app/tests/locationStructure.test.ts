import { describe, expect, it } from 'vitest'
import { entryPoint, lockCheck, mapGraph, mapNav, unreachableObjects } from '../src/core/location/analysis'
import { generateMap } from '../src/core/location/generate'
import { buildNav, findPath, OVERRIDE, passable, reachable, TAG } from '../src/core/location/nav'
import { decodeRle, emptyGrid, encodeRle, fieldOf, gridOf } from '../src/core/location/raster'
import { makeRng } from '../src/core/location/rng'
import { MAX_SNAPSHOTS, parseMap } from '../src/core/location/schema'
import { buildGraph, checkLocks, metrics, OUTSIDE } from '../src/core/location/topology'
import type { LocationMap, MapObject, TopologySpec } from '../src/core/location/types'
import { createProject } from '../src/core/model/project'
import type { Entity } from '../src/core/model/types'

const project = createProject('Structure')
let n = 0
const obj = (kind: string, x: number, y: number, extra: Partial<MapObject> = {}): MapObject => ({ id: `${kind}-${++n}`, kind, x, y, ...extra })
const handMap = (type: string, layers: Record<string, MapObject[]>, extra: Partial<LocationMap> = {}): LocationMap => ({
  v: 2,
  type,
  seed: 1,
  w: 600,
  h: 400,
  layers: Object.fromEntries(Object.entries(layers).map(([id, objects]) => [id, { nonce: 0, objects }])),
  ...extra,
})
const roundTrip = (m: unknown) => parseMap(JSON.parse(JSON.stringify(m)))

describe('map format version 2', () => {
  const village: Entity = { id: 'v', name: 'Oakham', type: 'Village' }

  it('reads a version 1 map as version 2 without losing anything', () => {
    const map = generateMap(project, village, 7)!
    expect(map.v).toBe(2)
    const old = roundTrip({ ...map, v: 1 })
    expect(old).toEqual(map)
  })

  it('keeps every new field through save and load', () => {
    const grid = emptyGrid(600, 400, 20)
    grid.data[5] = 2
    const map = handMap(
      'Dungeon',
      {
        doors: [obj('door', 100, 100, { w: 24, h: 8, lock: 'red', secret: true, attach: { to: 'chamber-1', t: 0.25, side: 1 }, link: { locationId: 'cellar' } })],
        contents: [obj('marker', 50, 50, { spawn: { role: 'boss', refId: 'b1', count: 1 }, light: { radius: 80, color: '#ffaa33', intensity: 0.7 }, key: 'red' })],
        roads: [obj('road', 0, 0, { rank: 'main', zone: 'd1', points: [[0, 0], [10, 10]] })],
      },
      {
        theme: 'parchment',
        params: { density: 0.6 },
        fields: { navOverride: fieldOf(grid) },
        masks: [{ id: 'm1', poly: [[0, 0], [50, 0], [50, 50]], label: 'Keep the hall' }],
        env: { sun: 135, time: 'dusk' },
      },
    )
    const withSnap: LocationMap = { ...map, snapshots: [{ id: 's1', label: 'First try', at: '2026-11-18T10:00:00Z', map: { ...map } }] }
    expect(roundTrip(withSnap)).toEqual(withSnap)
  })

  it('drops a bad optional value on its own, never the object or the map', () => {
    const parsed = roundTrip({
      ...handMap('Village', { roads: [obj('road', 0, 0, { points: [[0, 0], [9, 9]] })] }),
      layers: { roads: { nonce: 0, objects: [{ id: 'r', kind: 'road', x: 1, y: 2, rank: 'highway', lock: '', light: { radius: -5 } }] } },
      fields: { good: fieldOf(emptyGrid(100, 100, 10, 1)), bad: { cell: 10, cols: 2, rows: 2, rle: '3A' } },
      env: { sun: 900, time: 'noon' },
      masks: [{ id: 'm', poly: [[0, 0]] }, { id: 'ok', poly: [[0, 0], [1, 0], [1, 1]] }],
      theme: 42,
    })!
    expect(parsed.layers.roads.objects).toEqual([{ id: 'r', kind: 'road', x: 1, y: 2 }])
    expect(Object.keys(parsed.fields!)).toEqual(['good'])
    expect(parsed.env).toBeUndefined()
    expect(parsed.masks!.map((m) => m.id)).toEqual(['ok'])
    expect(parsed.theme).toBeUndefined()
  })

  it('caps snapshots and never nests them', () => {
    const base = handMap('Village', {})
    const inner = { ...base, snapshots: [{ id: 'deep', label: 'x', at: 'now', map: base }] }
    const snaps = Array.from({ length: MAX_SNAPSHOTS + 3 }, (_, i) => ({ id: `s${i}`, label: `S${i}`, at: 'now', map: inner }))
    const parsed = roundTrip({ ...base, snapshots: snaps })!
    expect(parsed.snapshots).toHaveLength(MAX_SNAPSHOTS)
    expect(parsed.snapshots![0].map).not.toHaveProperty('snapshots')
  })

  it('a new roll keeps the designer settings and hand-painted fields, not generated ones', () => {
    const first = generateMap(project, village, 1)!
    const painted = fieldOf(emptyGrid(first.w, first.h, 10, OVERRIDE.block))
    const keep: LocationMap = {
      ...first,
      theme: 'swamp',
      params: { density: 0.3 },
      masks: [{ id: 'm', poly: [[0, 0], [10, 0], [10, 10]] }],
      fields: { navOverride: painted, rock: painted },
      env: { sun: 90 },
    }
    const next = generateMap(project, village, 2, keep)!
    expect(next).toMatchObject({ theme: 'swamp', params: { density: 0.3 }, masks: keep.masks, env: { sun: 90 }, fields: { navOverride: painted } })
    expect(next.fields).not.toHaveProperty('rock')
    expect(generateMap(project, { ...village, type: 'Cave' }, 2, keep)!.theme).toBeUndefined()
  })
})

describe('raster fields', () => {
  it('encodes runs compactly and decodes them back', () => {
    expect(encodeRle([0, 0, 0, 1, 1, 0, 51])).toBe('3A2BAz')
    expect(Array.from(decodeRle('12A3BA', 16)!)).toEqual([...Array(12).fill(0), 1, 1, 1, 0])
    const rand = makeRng(5)
    const data = Array.from({ length: 5000 }, () => (rand.chance(0.9) ? 0 : rand.int(0, 51)))
    expect(Array.from(decodeRle(encodeRle(data), data.length)!)).toEqual(data)
    const g = emptyGrid(333, 210, 7, 3)
    expect(gridOf(fieldOf(g))).toEqual(g)
  })

  it('rejects malformed text and the wrong length', () => {
    for (const bad of ['3A!', '0A', '5', '9999999A', '2A2B']) expect(decodeRle(bad, 3), bad).toBeNull()
  })
})

describe('room graph', () => {
  const DUNGEON_SPEC: TopologySpec = { rooms: { layer: 'rooms', kind: 'chamber' }, corridors: { layer: 'corridors', kind: 'corridor' }, doors: { layer: 'doors', kind: 'door' } }
  const room = (x: number, y: number, role = 'room') => obj('chamber', x, y, { w: 80, h: 60, props: { role } })
  const run = (...pts: [number, number][]) => obj('corridor', pts[0][0], pts[0][1], { points: pts, props: { width: 16 } })

  it('reads rooms and corridors and measures loops, dead ends and branching', () => {
    // A ring of four rooms (one loop) with a spur from the last one.
    const [a, b, c, d, e] = [room(100, 300, 'entrance'), room(100, 100), room(300, 100), room(300, 300), room(500, 300)]
    const map = handMap('Dungeon', {
      rooms: [a, b, c, d, e],
      corridors: [run([100, 300], [100, 100]), run([100, 100], [300, 100]), run([300, 100], [300, 300]), run([300, 300], [100, 300]), run([300, 300], [500, 300])],
    })
    const g = buildGraph(map, DUNGEON_SPEC)
    expect(g.entrance).toBe(a.id)
    expect(g.edges.map((x) => [x.a, x.b].sort().join('-')).sort()).toEqual([[a, b], [b, c], [c, d], [d, a], [d, e]].map(([p, q]) => [p.id, q.id].sort().join('-')).sort())
    expect(metrics(g)).toMatchObject({ nodes: 5, edges: 5, components: 1, loops: 1, deadEnds: 1, branching: 0.2, depth: 2, unreachable: [] })
  })

  it('splits a corridor that runs through a room into two links', () => {
    const [a, b, c] = [room(100, 200, 'entrance'), room(300, 200), room(500, 200)]
    const g = buildGraph(handMap('Dungeon', { rooms: [a, b, c], corridors: [run([100, 200], [500, 200])] }), DUNGEON_SPEC)
    expect(g.edges.map((e) => `${e.a}>${e.b}`)).toEqual([`${a.id}>${b.id}`, `${b.id}>${c.id}`])
    expect(metrics(g).deadEnds).toBe(1)
  })

  it('finds rooms a corridor never reaches', () => {
    const [a, b, c] = [room(100, 200, 'entrance'), room(300, 200), room(500, 50)]
    const m = metrics(buildGraph(handMap('Dungeon', { rooms: [a, b, c], corridors: [run([100, 200], [300, 200])] }), DUNGEON_SPEC))
    expect(m).toMatchObject({ components: 2, unreachable: [c.id] })
  })

  it('carries a door lock to its corridor and checks keys against locks', () => {
    const [a, b, c] = [room(100, 200, 'entrance'), room(300, 200), room(500, 200)]
    // The door sits where the corridor enters room c (its left wall is at x = 460).
    const map = handMap('Dungeon', {
      rooms: [a, b, c],
      corridors: [run([100, 200], [300, 200]), run([300, 200], [500, 200])],
      doors: [obj('door', 460, 200, { w: 18, h: 8, rot: 90, lock: 'red' })],
    })
    const g = buildGraph(map, DUNGEON_SPEC)
    expect(g.edges.find((e) => e.lock)).toMatchObject({ a: b.id, b: c.id, lock: 'red' })
    expect(checkLocks(g, [{ key: 'red', node: b.id }])).toEqual({ ok: true, order: ['red'], stuck: [], sealed: [] })
    // A key behind its own lock opens nothing.
    expect(checkLocks(g, [{ key: 'red', node: c.id }])).toEqual({ ok: false, order: [], stuck: ['red'], sealed: [c.id] })
  })

  it('chains keys: the second key lies behind the first lock', () => {
    const rooms = [room(100, 200, 'entrance'), room(300, 200), room(500, 200), room(500, 50)]
    const map = handMap('Dungeon', {
      rooms,
      corridors: [run([100, 200], [300, 200]), run([300, 200], [500, 200]), run([500, 200], [500, 50])],
      doors: [obj('door', 260, 200, { w: 18, h: 8, rot: 90, lock: 'red' }), obj('door', 500, 80, { w: 18, h: 8, rot: 0, lock: 'blue' })],
    })
    const g = buildGraph(map, DUNGEON_SPEC)
    const res = checkLocks(g, [{ key: 'blue', node: rooms[1].id }, { key: 'red', node: rooms[0].id }])
    expect(res).toMatchObject({ ok: true, order: ['red', 'blue'] })
  })

  it('links dwelling rooms through doors and the entrance to the outside', () => {
    const spec: TopologySpec = { rooms: { layer: 'rooms', kind: 'room' }, doors: { layer: 'doors', kind: 'door' } }
    const [hall, bed] = [obj('room', 200, 200, { w: 200, h: 160 }), obj('room', 400, 200, { w: 200, h: 160 })]
    const map = handMap('Dwelling', {
      rooms: [hall, bed],
      doors: [obj('door', 300, 200, { w: 24, h: 8, rot: 90 }), obj('door', 200, 280, { w: 28, h: 8, rot: 0, props: { entrance: true } })],
    })
    const g = buildGraph(map, spec)
    expect(g.entrance).toBe(OUTSIDE)
    expect(metrics(g)).toMatchObject({ nodes: 3, edges: 2, depth: 2, unreachable: [] })
  })
})

describe('walkability grid', () => {
  const twoRooms = (doors: MapObject[]) =>
    handMap('Dwelling', { rooms: [obj('room', 200, 200, { w: 200, h: 160 }), obj('room', 400, 200, { w: 200, h: 160 })], doors })
  const entrance = obj('door', 200, 280, { w: 28, h: 8, rot: 0, props: { entrance: true } })

  it('keeps a wall between rooms side by side until a door opens it', () => {
    const shut = mapNav(twoRooms([entrance]))
    const outside: [number, number] = [200, 340]
    // Cell (80, 40) is the middle of the second room.
    expect(reachable(shut, outside)[shut.cols * 40 + 80]).toBe(0)
    expect(reachable(shut, outside)[shut.cols * 40 + 40]).toBe(1)
    expect(findPath(shut, outside, [400, 200])).toBeNull()
    expect(findPath(shut, outside, [200, 200])).not.toBeNull()
    const open = mapNav(twoRooms([entrance, obj('door', 300, 200, { w: 24, h: 8, rot: 90 })]))
    const walk = findPath(open, outside, [400, 200])!
    expect(walk).not.toBeNull()
    // The way in leads through both doors.
    expect(walk.some((p) => Math.abs(p[1] - 280) < 6 && Math.abs(p[0] - 200) < 16)).toBe(true)
    expect(walk.some((p) => Math.abs(p[0] - 300) < 6 && Math.abs(p[1] - 200) < 14)).toBe(true)
  })

  it('opens a locked door only with its key, and a secret door only when known', () => {
    const map = twoRooms([entrance, obj('door', 300, 200, { w: 24, h: 8, rot: 90, lock: 'red', props: { style: 'secret' } })])
    const g = mapNav(map)
    const door = g.locks.keys().next().value as number
    expect(g.tags[door] & TAG.locked && g.tags[door] & TAG.secret).toBeTruthy()
    expect(findPath(g, [200, 340], [400, 200])).not.toBeNull()
    expect(findPath(g, [200, 340], [400, 200], { open: new Set() })).toBeNull()
    expect(findPath(g, [200, 340], [400, 200], { open: new Set(['red']) })).not.toBeNull()
    expect(findPath(g, [200, 340], [400, 200], { secrets: false })).toBeNull()
  })

  it('blocks with walls and houses, slows in water, and obeys painted overrides', () => {
    const wall = obj('wall', 300, 200, { points: [[300, -20], [300, 420]] })
    const g = buildNav(handMap('Village', { walls: [wall] }), { cell: 10, open: true }, ['walls'])
    expect(findPath(g, [100, 200], [500, 200])).toBeNull()
    const house = obj('house', 300, 200, { w: 60, h: 40 })
    const river = obj('river', 450, 200, { points: [[450, -20], [450, 420]], props: { width: 30 } })
    const h = buildNav(handMap('Village', { buildings: [house], water: [river] }), { cell: 10, open: true }, ['water', 'buildings'])
    expect(passable(h, h.cols * 20 + 30)).toBe(false)
    expect(h.tags[h.cols * 20 + 45] & TAG.water).toBeTruthy()
    expect(findPath(h, [100, 200], [550, 200], { water: false })).toBeNull()
    expect(findPath(h, [100, 200], [550, 200])).not.toBeNull()
    const bridge = obj('bridge', 450, 200, { w: 50, h: 20, rot: 0 })
    const b = buildNav(handMap('Village', { water: [river], roads: [bridge] }), { cell: 10, open: true }, ['water', 'roads'])
    expect(findPath(b, [100, 200], [550, 200], { water: false })).not.toBeNull()
    const paint = emptyGrid(600, 400, 20)
    for (let r = 0; r < paint.rows; r++) paint.data[r * paint.cols + 5] = OVERRIDE.block
    const o = buildNav(handMap('Village', {}, { fields: { navOverride: fieldOf(paint) } }), { cell: 10, open: true }, [])
    expect(findPath(o, [50, 200], [300, 200])).toBeNull()
  })

  it('prefers the cheap way round over wading', () => {
    const pond = obj('pond', 300, 200, { points: [[250, 150], [350, 150], [350, 250], [250, 250]] })
    const g = buildNav(handMap('Village', { water: [pond] }), { cell: 10, open: true }, ['water'])
    const walk = findPath(g, [200, 200], [400, 200])!
    expect(walk.every((p) => !(g.tags[Math.floor(p[1] / 10) * g.cols + Math.floor(p[0] / 10)] & TAG.water))).toBe(true)
  })
})

describe('generated maps are playable', () => {
  const seeds = Array.from({ length: 25 }, (_, i) => i * 7919 + 3)
  const at = (type: string, extra: Partial<Entity> = {}) => ({ id: type, name: type, type, ...extra }) as Entity

  // Generating and walking many maps is slow on a busy machine; tests/locationDungeon.test.ts covers more seeds.
  const SLOW = { timeout: 60_000 }

  it('dungeons: every room is linked and walkable from the entrance', SLOW, () => {
    for (const size of ['Small', 'Large']) {
      for (const seed of seeds.slice(0, 12)) {
        const map = generateMap(project, at('Dungeon', { size, secretRooms: 2 }), seed)!
        const m = metrics(mapGraph(map)!)
        expect(m.unreachable, `seed ${seed}`).toEqual([])
        expect(lockCheck(map)!.ok).toBe(true)
        expect(unreachableObjects(map, ['chamber', 'marker']).map((o) => o.id), `seed ${seed}`).toEqual([])
      }
    }
  })

  it('dwellings: every room can be walked to from the front door', SLOW, () => {
    for (const footprint of ['Hut', 'House', 'Manor', 'Tower']) {
      for (const seed of seeds.slice(0, 10)) {
        const map = generateMap(project, at('Dwelling', { footprint }), seed)!
        expect(metrics(mapGraph(map)!).unreachable, `${footprint} ${seed}`).toEqual([])
        expect(unreachableObjects(map, ['room']).map((o) => o.label), `${footprint} ${seed}`).toEqual([])
        expect(entryPoint(map)).not.toEqual([map.w / 2, map.h / 2])
      }
    }
  })

  it('settlements and caves: every building, landmark and creature can be walked to', SLOW, () => {
    for (const seed of seeds.slice(0, 6)) {
      for (const loc of [at('Village', { water: 'River', walls: 'Palisade' }), at('City', { water: 'Coast', walls: 'Stone' }), at('Cave', { water: 'Underground river' })]) {
        const map = generateMap(project, loc, seed)!
        expect(unreachableObjects(map, ['house', 'landmark', 'marker']).map((o) => `${o.kind}@${o.x},${o.y}`), `${loc.type} ${seed}`).toEqual([])
      }
    }
  })
})
