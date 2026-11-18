import { describe, expect, it } from 'vitest'
import { entryPoint, lockCheck, mapGraph, mapNav, unreachableObjects } from '../src/core/location/analysis'
import { generateMap, regenerateLayer } from '../src/core/location/generate'
import { LOCK_NAMES, planMission, type PlanOptions } from '../src/core/location/mission'
import { reachable } from '../src/core/location/nav'
import { PARCHMENT } from '../src/core/location/render/theme'
import { locationSvg } from '../src/core/location/render/svg'
import { makeRng } from '../src/core/location/rng'
import { inRoom, localOutline, roomAnchor, ROOM_SHAPES } from '../src/core/location/rooms'
import { parseMap } from '../src/core/location/schema'
import { metrics, reach } from '../src/core/location/topology'
import type { LocationMap, MapObject, MapPoint as Pt } from '../src/core/location/types'
import { createProject } from '../src/core/model/project'
import type { Entity } from '../src/core/model/types'

const project = createProject('Dungeons')
const dungeon = (extra: Partial<Entity> = {}): Entity => ({ id: 'd', name: 'Crypt', type: 'Dungeon', ...extra })
const all = (map: LocationMap, layer: string, kind?: string) => (map.layers[layer]?.objects ?? []).filter((o) => !kind || o.kind === kind)
const SEEDS = Array.from({ length: 200 }, (_, i) => i * 2654435761 + 17)
const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length

describe('mission plan', () => {
  const grid = (n: number): { at: Pt; area: number }[] => Array.from({ length: n }, (_, i) => ({ at: [(i % 5) * 150 + ((i * 37) % 23), Math.floor(i / 5) * 140 + ((i * 53) % 19)], area: 4000 + ((i * 7919) % 5000) }))
  const opts = (o: Partial<PlanOptions> = {}): PlanOptions => ({ loops: 2, chain: 0.5, deadEnds: 'Some', secret: 1, treasure: 1, locks: 2, reach: 500, ...o })

  it('links every room, puts the boss deepest and keeps secret rooms as dead ends', () => {
    for (const seed of SEEDS.slice(0, 60)) {
      const plan = planMission(grid(14), makeRng(seed), opts())
      const deg = (i: number) => plan.edges.filter((e) => e.a === i || e.b === i).length
      const secret = plan.roles.flatMap((r, i) => (r === 'secret' ? [i] : []))
      expect(secret.length).toBe(1)
      expect(secret.every((i) => deg(i) === 1 && plan.edges.find((e) => e.b === i)?.secret)).toBe(true)
      expect(plan.roles.filter((r) => r === 'boss')).toHaveLength(1)
      expect(plan.roles[plan.entrance]).toBe('entrance')
      // A tree (13 links) plus up to the two loops asked for.
      expect(plan.edges.length).toBeGreaterThanOrEqual(13)
      expect(plan.edges.length).toBeLessThanOrEqual(15)
    }
  })

  it('never lets a loop go round a lock, and keys lie before their locks', () => {
    for (const seed of SEEDS.slice(0, 60)) {
      const plan = planMission(grid(15), makeRng(seed), opts({ loops: 4, locks: 3 }))
      const locks = plan.edges.filter((e) => e.lock).map((e) => e.lock)
      expect(locks).toEqual(LOCK_NAMES.slice(0, 3))
      for (const e of plan.edges) if (!e.lock) expect(plan.region[e.a], `seed ${seed}`).toBe(plan.region[e.b])
      plan.keys.forEach((k, i) => expect(plan.region[k.room]).toBeLessThanOrEqual(i))
      // The boss door carries the last lock.
      expect(plan.edges.find((e) => e.b === plan.boss)?.lock).toBe(LOCK_NAMES[2])
    }
  })

  it('follows branching and dead-end preferences on average', () => {
    const depth = (chain: number) => mean(SEEDS.slice(0, 40).map((s) => {
      const plan = planMission(grid(16), makeRng(s), opts({ chain, loops: 0, secret: 0, locks: 0 }))
      return Math.max(...plan.region.map((_, i) => hops(plan.edges, plan.entrance, i)))
    }))
    expect(depth(0.9)).toBeGreaterThan(depth(0.1) + 2)
    const deadEnds = (deadEnds: PlanOptions['deadEnds']) => mean(SEEDS.slice(0, 40).map((s) => {
      const plan = planMission(grid(16), makeRng(s), opts({ deadEnds, loops: 3, secret: 0, locks: 0 }))
      return plan.region.filter((_, i) => i !== plan.entrance && plan.edges.filter((e) => e.a === i || e.b === i).length === 1).length
    }))
    expect(deadEnds('Few')).toBeLessThan(deadEnds('Many'))
  })
})

function hops(edges: { a: number; b: number }[], from: number, to: number): number {
  const seen = new Map([[from, 0]])
  const queue = [from]
  while (queue.length) {
    const i = queue.shift()!
    for (const e of edges) {
      const j = e.a === i ? e.b : e.b === i ? e.a : -1
      if (j >= 0 && !seen.has(j)) {
        seen.set(j, seen.get(i)! + 1)
        queue.push(j)
      }
    }
  }
  return seen.get(to) ?? -1
}

// Many maps per test: slow on a busy machine.
describe('generated dungeons', { timeout: 60_000 }, () => {
  it('are solvable on the map itself for 200 seeds: every lock opens with a key found before it', { timeout: 120_000 }, () => {
    for (const [i, seed] of SEEDS.entries()) {
      const size = ['Small', 'Medium', 'Large'][i % 3]
      const map = generateMap(project, dungeon({ size, keyLocks: 1 + (i % 3), secretRooms: i % 3, loops: i % 5 }), seed)!
      const graph = mapGraph(map)!
      const m = metrics(graph)
      expect(m.unreachable, `seed ${seed}`).toEqual([])
      const check = lockCheck(map)!
      expect(check, `seed ${seed}`).toMatchObject({ ok: true, stuck: [], sealed: [] })
      // Exactly the locks asked for (a lock may guard more than one door into its region).
      expect([...new Set(graph.edges.flatMap((e) => (e.lock ? [e.lock] : [])))].sort(), `seed ${seed}`).toEqual(LOCK_NAMES.slice(0, 1 + (i % 3)).slice().sort())
      // Without any key the boss stays shut away, in the room graph and on the walkability grid.
      const boss = graph.nodes.find((n) => n.role === 'boss')!
      expect(reach(graph, graph.entrance, (e) => !e.lock).has(boss.id), `seed ${seed}`).toBe(false)
      // The walkability grid is slower to check; every fourth seed covers all sizes and lock counts.
      if (i % 4) continue
      const nav = mapNav(map)
      const shut = reachable(nav, entryPoint(map), { open: new Set() })
      expect(shut[Math.floor(boss.y / nav.cell) * nav.cols + Math.floor(boss.x / nav.cell)], `seed ${seed}`).toBe(0)
    }
  })

  it('meets the loop input when there is room for it', () => {
    const loopsOf = (loops: number) => mean(SEEDS.slice(0, 30).map((s) => metrics(mapGraph(generateMap(project, dungeon({ size: 'Large', loops, keyLocks: 0 }), s)!)!).loops))
    expect(loopsOf(0)).toBeLessThan(0.5)
    expect(loopsOf(4)).toBeGreaterThan(3)
  })

  it('places every key, chest and creature on the floor of its room, reachable from the entrance', () => {
    const p = createProject('Contents')
    for (const seed of SEEDS.slice(0, 30)) {
      const map = generateMap(p, dungeon({ size: 'Large', keyLocks: 2, secretRooms: 1 }), seed)!
      const rooms = all(map, 'rooms', 'chamber')
      for (const o of [...all(map, 'contents'), ...all(map, 'features', 'stairs')]) {
        expect(rooms.some((r) => inRoom(r, [o.x, o.y])), `${o.kind} seed ${seed}`).toBe(true)
      }
      expect(all(map, 'contents', 'key').map((k) => k.key).sort()).toEqual(['blue', 'red'])
      expect(unreachableObjects(map, ['chamber', 'marker', 'key', 'furniture']).map((o) => o.kind), `seed ${seed}`).toEqual([])
    }
  })

  it('uses every room shape and keeps the entrance and secret rooms plain', () => {
    const seen = new Set<string>()
    for (const seed of SEEDS.slice(0, 40)) {
      const map = generateMap(project, dungeon({ size: 'Large', secretRooms: 2 }), seed)!
      for (const r of all(map, 'rooms', 'chamber')) {
        seen.add(String(r.props?.shape ?? 'rect'))
        if (['entrance', 'secret'].includes(String(r.props?.role))) expect(r.props?.shape).toBeUndefined()
        expect(inRoom(r, roomAnchor(r), -8)).toBe(true)
      }
    }
    expect([...seen].sort()).toEqual([...ROOM_SHAPES].sort())
  })

  it('keeps the plan when only the corridors or doors are rerolled', () => {
    const location = dungeon({ size: 'Medium', keyLocks: 1 })
    const map = generateMap(project, location, 5)!
    let next = regenerateLayer(project, location, map, 'corridors')
    next = regenerateLayer(project, location, next, 'doors')
    expect(lockCheck(next)).toMatchObject({ ok: true })
    expect([...new Set(all(next, 'doors', 'door').flatMap((d) => (d.lock ? [d.lock] : [])))]).toEqual(['red'])
  })

  it('still links rooms that have no plan: older maps and rooms added by hand', () => {
    const map = generateMap(project, dungeon({ keyLocks: 0 }), 8)!
    const plain = (o: MapObject): MapObject => ({ ...o, props: { role: String(o.props?.role ?? 'room') } })
    const old: LocationMap = { ...map, layers: { ...map.layers, rooms: { ...map.layers.rooms, objects: map.layers.rooms.objects.map(plain) } } }
    const relinked = regenerateLayer(project, dungeon(), old, 'corridors')
    expect(metrics(mapGraph(relinked)!).unreachable).toEqual([])
    const added: MapObject = { id: 'hand', kind: 'chamber', x: 60, y: 60, w: 60, h: 50, pinned: true }
    const withNew: LocationMap = { ...map, layers: { ...map.layers, rooms: { ...map.layers.rooms, objects: [...map.layers.rooms.objects, added] } } }
    expect(metrics(mapGraph(regenerateLayer(project, dungeon(), withNew, 'corridors'))!).unreachable).toEqual([])
  })

  it('stores, reloads and draws shaped rooms, locks and keys', () => {
    const map = generateMap(project, dungeon({ size: 'Large', keyLocks: 2 }), 21)!
    expect(parseMap(JSON.parse(JSON.stringify(map)))).toEqual(map)
    const svg = locationSvg(project, { ...dungeon(), map })!
    expect(svg).toContain(PARCHMENT.locks.red)
    expect(svg).toContain(PARCHMENT.locks.blue)
  })
})

describe('room shapes', () => {
  const room = (shape: string, extra: Partial<MapObject> = {}): MapObject => ({ id: 'r', kind: 'chamber', x: 100, y: 100, w: 120, h: 80, props: { shape }, ...extra })

  it('tells floor from rock for each shape', () => {
    // The box spans x 40–160 and y 60–140.
    expect(inRoom(room('rect'), [45, 135])).toBe(true)
    expect(inRoom(room('round'), [45, 135])).toBe(false)
    expect(inRoom(room('round'), [100, 100])).toBe(true)
    expect(inRoom(room('cross'), [45, 65])).toBe(false)
    expect(inRoom(room('cross'), [45, 100])).toBe(true)
    // Cut 0 leaves out the top-left quarter.
    expect(inRoom(room('L', { props: { shape: 'L', cut: 0 } }), [60, 70])).toBe(false)
    expect(inRoom(room('L', { props: { shape: 'L', cut: 0 } }), [140, 130])).toBe(true)
    for (let cut = 0; cut < 4; cut++) {
      const l = room('L', { props: { shape: 'L', cut } })
      expect(inRoom(l, roomAnchor(l), -10), `cut ${cut}`).toBe(true)
      expect(inRoom(l, [100, 100], -2), `cut ${cut}`).toBe(false)
      expect(localOutline(l)).toHaveLength(6)
    }
  })

  it('turns with the room and grows or shrinks with a pad', () => {
    const r = room('rect', { rot: 90 })
    expect(inRoom(r, [100, 155])).toBe(true)
    expect(inRoom(r, [155, 100])).toBe(false)
    expect(inRoom(room('round'), [163, 100], 5)).toBe(true)
    expect(inRoom(room('round'), [155, 100], -6)).toBe(false)
  })
})
