import { describe, expect, it } from 'vitest'
import { createProject } from '../src/core/model/project'
import type { Entity } from '../src/core/model/types'
import { generateMap, generationOrder, regenerateLayer, regenerateStale, staleLayers } from '../src/core/location/generate'
import { KINDS } from '../src/core/location/objects'
import { getLocationType, LOCATION_TYPES } from '../src/core/location/registry'
import { GLYPHS } from '../src/core/location/render/glyphs'
import { locationSvg } from '../src/core/location/render/svg'
import { parseMap } from '../src/core/location/schema'
import { LOCATION_TYPES_ALL, type LocationMap, type MapObject } from '../src/core/location/types'
import { carve, trace } from '../src/core/location/types/cave'
import { makeRng } from '../src/core/location/rng'
import { inPolygon } from '../src/core/location/geometry'
import { inRoom } from '../src/core/location/rooms'
import { gridOf } from '../src/core/location/raster'

const project = createProject('Location types')
const SEEDS = [1, 2, 3, 4, 5, 6]
const gen = (location: Entity, seed = 11) => generateMap(project, location, seed)!
const all = (map: LocationMap, layer: string, kind?: string) => (map.layers[layer]?.objects ?? []).filter((o) => !kind || o.kind === kind)
const left = (o: MapObject) => o.x - (o.w ?? 0) / 2
const right = (o: MapObject) => o.x + (o.w ?? 0) / 2
const top = (o: MapObject) => o.y - (o.h ?? 0) / 2
const bottom = (o: MapObject) => o.y + (o.h ?? 0) / 2
const within = (o: MapObject, x: number, y: number, pad = 0) => x > left(o) - pad && x < right(o) + pad && y > top(o) - pad && y < bottom(o) + pad

/** Groups of indices joined by `links`; one group means everything is connected. */
function groups(n: number, links: [number, number][]): number {
  const parent = Array.from({ length: n }, (_, i) => i)
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  for (const [a, b] of links) parent[find(a)] = find(b)
  return new Set(parent.map((_, i) => find(i))).size
}

describe('every location type', () => {
  it('has a generator', () => {
    expect(LOCATION_TYPES.map((t) => t.id).sort()).toEqual([...LOCATION_TYPES_ALL].sort())
  })

  it.each(LOCATION_TYPES_ALL)('%s: generates the same map twice, with known kinds, and survives save and load', (type) => {
    const def = getLocationType(type)!
    for (const seed of SEEDS) {
      const location: Entity = { id: 'l', name: `Test ${type}`, type }
      const map = gen(location, seed)
      expect(gen(location, seed)).toEqual(map)
      expect(Object.keys(map.layers).sort()).toEqual(def.layers.map((l) => l.id).sort())
      for (const o of Object.values(map.layers).flatMap((l) => l.objects)) {
        expect(KINDS[o.kind], o.kind).toBeTruthy()
        expect(GLYPHS[o.kind], o.kind).toBeTruthy()
        expect(Number.isInteger(o.x) && Number.isInteger(o.y)).toBe(true)
      }
      expect(parseMap(JSON.parse(JSON.stringify(map)))).toEqual(map)
      const svg = locationSvg(project, { ...location, map })!
      for (const l of def.layers) expect(svg).toContain(`data-layer="${l.id}"`)
      expect(svg).not.toContain('NaN')
    }
  })

  it.each(LOCATION_TYPES_ALL)('%s: generates each layer after the layers it reads, and can add what it lists', (type) => {
    const def = getLocationType(type)!
    const order = generationOrder(def).map((l) => l.id)
    expect([...order].sort()).toEqual(def.layers.map((l) => l.id).sort())
    for (const l of def.layers) {
      for (const d of l.dependsOn) expect(order.indexOf(d), `${l.id} reads ${d}`).toBeLessThan(order.indexOf(l.id))
      for (const kind of l.addable ?? []) expect(KINDS[kind]?.make, kind).toBeTruthy()
    }
  })

  it.each(LOCATION_TYPES_ALL)('%s: rerolling the first generated layer leaves nothing stale after an update', (type) => {
    const def = getLocationType(type)!
    const location: Entity = { id: 'l', name: 'Reroll', type }
    const first = generationOrder(def).find((l) => def.layers.some((x) => x.dependsOn.includes(l.id)))!
    const rerolled = regenerateLayer(project, location, gen(location), first.id)
    expect(staleLayers(rerolled).length).toBeGreaterThan(0)
    expect(staleLayers(regenerateStale(project, location, rerolled))).toEqual([])
  })
})

describe('city', () => {
  it('is denser than a village and has streets, gates and district names', () => {
    const city = gen({ id: 'c', name: 'Highgate', type: 'City', walls: 'Stone', water: 'River', districts: ['Old Town', 'Docks', ''] })
    const village = gen({ id: 'v', name: 'Oakham', type: 'Village' })
    expect(all(city, 'buildings').length).toBeGreaterThan(all(village, 'buildings').length * 2)
    expect(all(city, 'roads', 'road').length).toBeGreaterThanOrEqual(6)
    expect(all(city, 'walls', 'gate').length).toBeGreaterThanOrEqual(4)
    expect(all(city, 'roads', 'bridge').length).toBeGreaterThan(0)
    // The user's names go to the two largest districts; the other special districts are named after their zone.
    const names = all(city, 'labels').filter((o) => o.props?.size === 'large').map((o) => o.label)
    expect(names.slice(0, 2)).toEqual(['Old Town', 'Docks'])
    expect(names.slice(2).every((n) => ['Market', 'Craft quarter', 'Garrison', 'Temple quarter'].includes(n!))).toBe(true)
    expect(all(city, 'landmarks', 'landmark').map((o) => o.label)).toEqual(expect.arrayContaining(['Keep']))
  })

  it('follows the population', () => {
    const houses = (population: number) => all(gen({ id: 'c', name: 'C', type: 'City', population }), 'buildings').length
    expect(houses(400)).toBeLessThan(houses(1600))
  })
})

describe('dwelling', () => {
  const rooms = (map: LocationMap) => all(map, 'rooms', 'room')

  it('cuts the footprint into the wanted rooms without gaps', () => {
    for (const seed of SEEDS) {
      const map = gen({ id: 'd', name: 'Mill house', type: 'Dwelling', footprint: 'Manor', dwellingRooms: 7 }, seed)
      const list = rooms(map)
      expect(list.length).toBe(7)
      const [x0, x1, y0, y1] = [Math.min(...list.map(left)), Math.max(...list.map(right)), Math.min(...list.map(top)), Math.max(...list.map(bottom))]
      expect(list.reduce((s, r) => s + r.w! * r.h!, 0)).toBe((x1 - x0) * (y1 - y0))
      for (const r of list) expect(Math.min(r.w!, r.h!)).toBeGreaterThanOrEqual(70)
    }
  })

  it('joins every room by doors and has exactly one entrance', () => {
    for (const seed of SEEDS) {
      const map = gen({ id: 'd', name: 'Manor', type: 'Dwelling', footprint: 'Manor' }, seed)
      const list = rooms(map)
      const doors = all(map, 'doors', 'door')
      expect(doors.filter((d) => d.props?.entrance).length).toBe(1)
      const links = doors.flatMap((d): [number, number][] => {
        const touching = list.flatMap((r, i) => (within(r, d.x, d.y, 2) ? [i] : []))
        return touching.length === 2 ? [[touching[0], touching[1]]] : []
      })
      expect(groups(list.length, links)).toBe(1)
    }
  })

  it('furnishes rooms inside their walls, more when rich, and names the owner', () => {
    const p = createProject('Owner')
    p.documents['design.npc'].data.archetypes = [{ id: 'smith', name: 'Blacksmith' }]
    const sparse = generateMap(p, { id: 'd', name: 'Forge', type: 'Dwelling', furnishing: 'Sparse', owner: 'smith' }, 3)!
    const rich = generateMap(p, { id: 'd', name: 'Forge', type: 'Dwelling', furnishing: 'Rich', owner: 'smith' }, 3)!
    expect(all(rich, 'furniture').length).toBeGreaterThan(all(sparse, 'furniture').length)
    for (const f of all(rich, 'furniture')) expect(rooms(rich).some((r) => within(r, f.x, f.y))).toBe(true)
    expect(all(rich, 'labels').map((o) => o.label)).toContain('Home of Blacksmith')
    expect(gen({ id: 'h', name: 'Hut', type: 'Dwelling', footprint: 'Hut' }).w).toBeLessThan(gen({ id: 'm', name: 'Manor', type: 'Dwelling', footprint: 'Manor' }).w)
  })
})

describe('dungeon', () => {
  const rooms = (map: LocationMap) => all(map, 'rooms', 'chamber')
  const roles = (map: LocationMap, role: string) => rooms(map).filter((r) => r.props?.role === role)

  it('makes the wanted rooms, all reachable, with one entrance and one boss room', () => {
    for (const layoutStyle of ['Rooms and corridors', 'Labyrinth']) {
      for (const seed of SEEDS) {
        const map = gen({ id: 'd', name: 'Crypt', type: 'Dungeon', rooms: 9, secretRooms: 2, layoutStyle }, seed)
        const list = rooms(map)
        expect(list.length).toBe(11)
        expect([roles(map, 'entrance').length, roles(map, 'boss').length, roles(map, 'secret').length]).toEqual([1, 1, 2])
        expect(roles(map, 'treasure').length).toBeGreaterThan(0)
        // Corridors end on a room's floor (its middle, or the inner quarter of an L-shaped room).
        const roomAt = (p: [number, number]) => list.findIndex((r) => inRoom(r, p))
        const links = all(map, 'corridors', 'corridor').map((c): [number, number] => [roomAt(c.points![0]), roomAt(c.points![c.points!.length - 1])])
        expect(links.flat()).not.toContain(-1)
        expect(groups(list.length, links)).toBe(1)
        for (const r of list) expect(left(r) >= 0 && top(r) >= 0 && right(r) <= map.w && bottom(r) <= map.h).toBe(true)
        expect(all(map, 'doors', 'door').length).toBeGreaterThanOrEqual(list.length - 1)
        expect(all(map, 'features', 'stairs').length).toBe(1)
      }
    }
  })

  it('has more loops as a labyrinth and traps only when asked', () => {
    const corridors = (layoutStyle: string) => SEEDS.reduce((s, seed) => s + all(gen({ id: 'd', name: 'D', type: 'Dungeon', rooms: 12, layoutStyle }, seed), 'corridors').length, 0)
    expect(corridors('Labyrinth')).toBeGreaterThan(corridors('Rooms and corridors'))
    const traps = (on: boolean) => SEEDS.reduce((s, seed) => s + all(gen({ id: 'd', name: 'D', type: 'Dungeon', traps: on }, seed), 'features', 'trap').length, 0)
    expect(traps(false)).toBe(0)
    expect(traps(true)).toBeGreaterThan(0)
  })

  it('puts the boss, enemies and loot from the other planners on the map', () => {
    const p = createProject('Contents')
    p.documents['design.combat'].data.bosses = [{ id: 'lich', name: 'The Lich' }]
    p.documents['design.combat'].data.enemies = [{ id: 'rat', name: 'Giant rat' }]
    p.documents['design.items'].data.items = [{ id: 'crown', name: 'Bone crown' }]
    const map = generateMap(p, { id: 'd', name: 'Crypt', type: 'Dungeon', boss: 'lich', enemies: ['rat'], loot: ['crown'] }, 5)!
    const things = all(map, 'contents')
    const boss = things.find((o) => o.props?.type === 'boss')!
    expect([boss.label, boss.refId]).toEqual(['The Lich', 'lich'])
    expect(within(roles(map, 'boss')[0], boss.x, boss.y)).toBe(true)
    expect(things.filter((o) => o.props?.type === 'enemy').every((o) => o.label === 'Giant rat')).toBe(true)
    expect(things.some((o) => o.kind === 'furniture' && o.label === 'Bone crown')).toBe(true)
    expect(all(map, 'labels').map((o) => o.label)).toEqual(expect.arrayContaining(['Entrance', 'The Lich', 'Treasury']))
    expect(all(gen({ id: 'd', name: 'Empty', type: 'Dungeon' }), 'contents').find((o) => o.props?.type === 'boss')!.label).toBe('Boss')
  })
})

describe('cave', () => {
  it('carves one connected floor, whatever the openness', () => {
    for (const openness of [0.8, 1, 1.3]) {
      for (const seed of SEEDS) {
        const g = carve(1000, 700, 7, openness, makeRng(seed))
        const floor = g.floor.filter(Boolean).length
        expect(floor).toBeGreaterThan(100)
        const start = g.floor.indexOf(true)
        const seen = new Set<number>()
        const queue = [start]
        while (queue.length) {
          const i = queue.pop()!
          if (seen.has(i) || !g.floor[i]) continue
          seen.add(i)
          queue.push(i + 1, i - 1, i + g.cols, i - g.cols)
        }
        expect(seen.size).toBe(floor)
        // The border stays rock, so the outline never runs off the map.
        for (let x = 0; x < g.cols; x++) expect(g.floor[x] || g.floor[(g.rows - 1) * g.cols + x]).toBe(false)
        const loops = trace(g)
        expect(loops.length).toBeGreaterThan(0)
        expect(loops[0].length).toBeGreaterThan(20)
      }
    }
  })

  it('is more open when asked, and has the wanted entrances', () => {
    // Floor cells in the stored rock field (0 is floor).
    const area = (openness: string) =>
      SEEDS.reduce((s, seed) => s + (gridOf(gen({ id: 'c', name: 'C', type: 'Cave', openness }, seed).fields!.rock)!.data.filter((v) => v === 0).length), 0)
    expect(area('Open')).toBeGreaterThan(area('Tight'))
    const map = gen({ id: 'c', name: 'Deep cave', type: 'Cave', entrances: 3 })
    expect(all(map, 'entrances', 'stairs').length).toBe(3)
    expect(all(map, 'entrances', 'corridor').length).toBe(3)
    expect(all(map, 'cavern', 'cavern')[0].points!.length).toBeLessThanOrEqual(380)
    expect(all(map, 'labels').filter((o) => o.label === 'Entrance').length).toBe(3)
  })

  it('keeps pools, ore and enemies on the cave floor', () => {
    const p = createProject('Cave contents')
    p.documents['design.combat'].data.enemies = [{ id: 'bat', name: 'Cave bat' }]
    const resource = p.registry.catalogs.resources.items[0]
    for (const seed of SEEDS) {
      const map = generateMap(p, { id: 'c', name: 'Mine', type: 'Cave', caveWater: 'Pools', enemies: ['bat'], resources: [resource.id], size: 'Large' }, seed)!
      const floor = all(map, 'cavern', 'cavern')[0].points!
      const placed = [...all(map, 'water', 'pond'), ...all(map, 'features'), ...all(map, 'contents')]
      expect(all(map, 'water', 'pond').length).toBeGreaterThan(0)
      expect(all(map, 'features', 'ore').length).toBeGreaterThan(0)
      expect(all(map, 'contents', 'marker').length).toBeGreaterThan(0)
      for (const o of placed) expect(inPolygon([o.x, o.y], floor), `${o.kind} at ${o.x},${o.y}`).toBe(true)
      expect(all(map, 'labels').map((o) => o.label)).toEqual(expect.arrayContaining([resource.label, 'Cave bat']))
    }
    expect(all(gen({ id: 'c', name: 'River cave', type: 'Cave', caveWater: 'Underground river' }), 'water', 'river').length).toBe(1)
  })
})
