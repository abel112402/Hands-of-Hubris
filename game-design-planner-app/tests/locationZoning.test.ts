import { describe, expect, it } from 'vitest'
import { unreachableObjects } from '../src/core/location/analysis'
import { generateMap, regenerateLayer } from '../src/core/location/generate'
import { distToPolyline, inPolygon } from '../src/core/location/geometry'
import { PARCHMENT } from '../src/core/location/render/theme'
import { locationSvg } from '../src/core/location/render/svg'
import type { LocationMap, MapObject, MapPoint as Pt, ZoneKind } from '../src/core/location/types'
import { roadRank } from '../src/core/location/types/shared'
import { area, assignZones, neighbours, voronoi, zoneCounts, zoneOf, type Ward } from '../src/core/location/zoning'
import { createProject } from '../src/core/model/project'
import type { Entity } from '../src/core/model/types'

const project = createProject('Zoning')
const city = (extra: Partial<Entity> = {}): Entity => ({ id: 'c', name: 'Highgate', type: 'City', walls: 'Stone', water: 'River', ...extra })
const all = (map: LocationMap, layer: string, kind?: string) => (map.layers[layer]?.objects ?? []).filter((o) => !kind || o.kind === kind)
const districts = (map: LocationMap) => all(map, 'districts', 'district')
const byZone = (map: LocationMap, zone: ZoneKind) => districts(map).filter((d) => zoneOf(d) === zone)
const tally = (map: LocationMap) => districts(map).reduce<Record<string, number>>((t, d) => ({ ...t, [zoneOf(d)]: (t[zoneOf(d)] ?? 0) + 1 }), {})
const seeds = [3, 11, 29, 47, 83, 131]

describe('ward geometry and zone rules', () => {
  it('splits a boundary into cells that cover it, one per seed', () => {
    const bound: Pt[] = [[0, 0], [400, 0], [400, 300], [0, 300]]
    const pts: Pt[] = [[50, 50], [350, 60], [200, 150], [80, 260], [330, 250]]
    const cells = voronoi(pts, bound)
    expect(cells.reduce((s, c) => s + area(c), 0)).toBeCloseTo(400 * 300, 0)
    cells.forEach((c, i) => expect(inPolygon(pts[i], c)).toBe(true))
    expect(neighbours(cells)[2].length).toBeGreaterThanOrEqual(3)
  })

  it('turns shares into ward counts and always leaves homes', () => {
    expect(zoneCounts(12, { market: 15, industrial: 15, military: 10, sacred: 10 })).toEqual({ residential: 6, market: 2, industrial: 2, military: 1, sacred: 1 })
    expect(zoneCounts(4, { market: 1 })).toMatchObject({ market: 1, residential: 3 })
    expect(zoneCounts(3, { market: 100, sacred: 100 })).toMatchObject({ residential: 1 })
    expect(zoneCounts(1, { market: 50 })).toMatchObject({ market: 1, residential: 0 })
    expect(zoneCounts(5, {})).toMatchObject({ residential: 5, market: 0 })
  })

  it('puts each zone where its rule scores best and keeps workshops away from temples', () => {
    const w = (o: Partial<Ward>): Ward => ({ outward: 0.5, mainRoad: false, wall: false, gate: false, water: false, ...o })
    const wards = [w({ outward: 0.1, mainRoad: true }), w({ outward: 0.9, wall: true, gate: true }), w({ outward: 0.2 }), w({ outward: 0.8, water: true }), w({ outward: 0.85, water: true })]
    // Ward 3 borders the temple ward (2), ward 4 does not.
    const adjacent = [[1, 2], [0], [0, 3], [2, 4], [3]]
    expect(assignZones(wards, { residential: 1, market: 1, military: 1, sacred: 1, industrial: 1 }, adjacent)).toEqual(['market', 'military', 'sacred', 'residential', 'industrial'])
  })
})

// Many maps per test: slow on a busy machine.
describe('settlement districts', { timeout: 60_000 }, () => {
  it('covers the settled area with zoned districts in the default shares', () => {
    for (const seed of seeds) {
      const map = generateMap(project, city(), seed)!
      const ds = districts(map)
      expect(ds.length, `seed ${seed}`).toBeGreaterThanOrEqual(10)
      expect(tally(map), `seed ${seed}`).toEqual(zoneCounts(ds.length, { market: 15, industrial: 15, military: 10, sacred: 10 }))
      // Every house stands in the district it names.
      for (const h of all(map, 'buildings', 'house')) {
        const d = ds.find((x) => x.id === h.zone)
        if (d) expect(inPolygon([h.x, h.y], d.points!) || distToPolyline([h.x, h.y], d.points!, true) < 2).toBe(true)
      }
    }
  })

  it('follows the rules: market on a trade route, garrison by a gate, homes in the rest', () => {
    for (const seed of seeds) {
      const map = generateMap(project, city(), seed)!
      const mains = all(map, 'roads', 'road').filter((r) => roadRank(r) === 'main')
      expect(byZone(map, 'market').every((d) => mains.some((r) => r.points!.some((p) => inPolygon(p, d.points!)))), `seed ${seed}`).toBe(true)
      const gates = all(map, 'walls', 'gate')
      expect(byZone(map, 'military').some((d) => gates.some((g) => inPolygon([g.x, g.y], d.points!) || distToPolyline([g.x, g.y], d.points!, true) < 30)), `seed ${seed}`).toBe(true)
    }
  })

  it('follows the share inputs', () => {
    const none = generateMap(project, city({ zoneMilitary: 0, zoneIndustry: 0, size: 'Large' }), 5)!
    expect(byZone(none, 'military')).toEqual([])
    expect(byZone(none, 'industrial')).toEqual([])
    const markets = generateMap(project, city({ zoneMarket: 40, size: 'Large' }), 5)!
    expect(byZone(markets, 'market').length).toBeGreaterThan(byZone(none, 'market').length)
    const village = generateMap(project, { id: 'v', name: 'Oakham', type: 'Village' }, 5)!
    expect(tally(village)).toMatchObject({ market: 1, sacred: 1 })
  })

  it('places landmarks in a district of their kind', () => {
    for (const seed of seeds) {
      const map = generateMap(project, city(), seed)!
      const zoneAt = (o: MapObject) => zoneOf(districts(map).find((d) => d.id === o.zone))
      const marks = all(map, 'landmarks', 'landmark')
      const expectIn = (label: string, zone: ZoneKind) => {
        const m = marks.find((x) => x.label === label)
        if (m && byZone(map, zone).length) expect(zoneAt(m), `${label} seed ${seed}`).toBe(zone)
      }
      expectIn('Keep', 'military')
      expectIn('Temple', 'sacred')
      expectIn('Market hall', 'market')
    }
  })

  it('builds stalls, workshops, barracks and shrines only in their own quarter', () => {
    const seen = new Set<string>()
    const home: Record<string, ZoneKind> = { stall: 'market', workshop: 'industrial', barracks: 'military', shrine: 'sacred' }
    for (const seed of seeds) {
      const map = generateMap(project, city({ size: 'Large' }), seed)!
      for (const h of all(map, 'buildings', 'house')) {
        const use = h.props?.use
        if (typeof use !== 'string') continue
        seen.add(use)
        expect(zoneOf(districts(map).find((d) => d.id === h.zone))).toBe(home[use])
      }
    }
    expect([...seen].sort()).toEqual(['barracks', 'shrine', 'stall', 'workshop'])
  })

  it('stays fully walkable with districts, alleys and zoned houses', () => {
    for (const seed of seeds.slice(0, 3)) {
      const map = generateMap(project, city({ size: 'Large' }), seed)!
      expect(unreachableObjects(map, ['house', 'landmark']).length, `seed ${seed}`).toBe(0)
    }
  })
})

describe('road hierarchy', { timeout: 60_000 }, () => {
  it('ranks trade routes, streets and alleys and draws them apart', () => {
    for (const seed of seeds) {
      const map = generateMap(project, city(), seed)!
      const ranks = [...all(map, 'roads', 'road'), ...all(map, 'alleys', 'road')].map(roadRank)
      expect(ranks.filter((r) => r === 'main').length, `seed ${seed}`).toBeGreaterThanOrEqual(2)
      expect(ranks.filter((r) => r === 'street').length).toBeGreaterThanOrEqual(2)
      expect(ranks.filter((r) => r === 'alley').length).toBeGreaterThanOrEqual(4)
      const wall = all(map, 'walls', 'wall')[0].points!
      for (const a of all(map, 'alleys', 'road')) {
        expect(a.rank).toBe('alley')
        // Alleys stay in town: they never reach the wall, so they need no gate.
        expect(a.points!.every((p) => inPolygon(p, wall)), `seed ${seed}`).toBe(true)
      }
    }
    const svg = locationSvg(project, { ...city(), map: generateMap(project, city(), 3)! })
    expect(svg).toContain(PARCHMENT.zones.market)
    expect(svg).toContain(PARCHMENT.awning[0])
  })

  it('reads ranks of roads made before ranks existed from their width', () => {
    const road = (width: number): MapObject => ({ id: 'r', kind: 'road', x: 0, y: 0, props: { width } })
    expect([16, 11, 10, 6].map((w) => roadRank(road(w)))).toEqual(['main', 'street', 'street', 'alley'])
    expect(roadRank({ ...road(16), rank: 'alley' })).toBe('alley')
  })

  it('a village has no alleys, and rerolling the roads leaves districts and houses waiting to update', () => {
    const village: Entity = { id: 'v', name: 'Oakham', type: 'Village' }
    const map = generateMap(project, village, 9)!
    expect(all(map, 'alleys')).toEqual([])
    const next = regenerateLayer(project, village, map, 'roads')
    expect(['districts', 'alleys', 'buildings'].every((id) => next.layers[id].stale)).toBe(true)
  })
})
