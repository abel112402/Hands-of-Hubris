import type { Entity } from '../../model/types'
import { blob, crossings, dist, distToPolyline, inPolygon, pointAlong, polylineLength, radiusOf, toDeg } from '../geometry'
import { attachFor } from '../attach'
import { poolAt } from './cave'
import { lightOf } from '../light'
import { replaceObjects } from '../order'
import type { GenContext, LayerDef, LocationMap, LocationTypeDef, MapObject, MapPoint as Pt, NewMapObject, RoadRank, ZoneKind } from '../types'
import { area, assignZones, centroid, clipToBox, convexHull, districtAt, districtsOf, neighbours, relax, voronoi, ZONE_LABEL, zoneCounts, zoneOf, type Ward, type ZoneShares } from '../zoning'
import { between, biomeTint, clamp, objects, outlineOf, param, path, pos, refsOf, roadRank, sizeKey, touches, widthOf } from './shared'

/**
 * Settlements: Village and City share one engine and differ only in their Plan.
 * A village is a few roads through a green with houses along them and fields around; a city adds a second main
 * street, a ring street with radial lanes, alleys, three rows of smaller houses and a wider wall.
 * The settled area is cut into districts, each zoned by rules (zoning.ts): the market on the trade route, the
 * garrison at a gate, the temple quarter in the quiet middle, workshops by the water. Houses and landmarks follow
 * their district.
 * Layers, bottom to top: ground, water, districts, roads, alleys, walls, landmarks, fields, buildings, vegetation,
 * labels.
 */
type Scale = { w: number; h: number; houses: number; sideRoads: number; fields: number; trees: number; wards: number }
type Plan = {
  id: 'Village' | 'City'
  scales: Record<'Small' | 'Medium' | 'Large', Scale>
  /** Width and depth ranges of a house. */
  house: { w: [number, number]; h: [number, number] }
  /** Rows of houses behind each side of a road. */
  rows: number
  /** Distance between houses along a road. */
  spacing: [number, number]
  peoplePerHouse: number
  maxHouses: number
  /** A second main street and a ring street with lanes running outward. */
  streets: boolean
  /** Wall radius as a share of the map's width and height. */
  wall: [number, number]
  /** Landmarks drawn when none are chosen (not on a Small map). */
  landmarks: string[]
  /** Default share of districts per zone, in percent; the rest are homes. */
  zones: ZoneShares
  /** Alleys per district, on average. */
  alleys: number
  /** Name the non-residential districts on the map when the user has not named them. */
  zoneLabels: boolean
}

const VILLAGE_PLAN: Plan = {
  id: 'Village',
  scales: {
    Small: { w: 800, h: 560, houses: 12, sideRoads: 1, fields: 4, trees: 55, wards: 3 },
    Medium: { w: 1000, h: 700, houses: 24, sideRoads: 2, fields: 6, trees: 85, wards: 4 },
    Large: { w: 1200, h: 840, houses: 40, sideRoads: 3, fields: 9, trees: 120, wards: 5 },
  },
  house: { w: [28, 42], h: [21, 29] },
  rows: 2,
  spacing: [40, 54],
  peoplePerHouse: 5,
  maxHouses: 90,
  streets: false,
  wall: [0.33, 0.34],
  landmarks: ['Hall', 'Chapel'],
  zones: { market: 25, sacred: 25 },
  alleys: 0,
  zoneLabels: false,
}

const CITY_PLAN: Plan = {
  id: 'City',
  scales: {
    Small: { w: 1000, h: 700, houses: 90, sideRoads: 4, fields: 3, trees: 50, wards: 9 },
    Medium: { w: 1200, h: 840, houses: 140, sideRoads: 6, fields: 4, trees: 70, wards: 12 },
    Large: { w: 1400, h: 980, houses: 200, sideRoads: 8, fields: 5, trees: 90, wards: 16 },
  },
  house: { w: [22, 34], h: [17, 24] },
  rows: 3,
  spacing: [30, 40],
  peoplePerHouse: 8,
  maxHouses: 320,
  streets: true,
  wall: [0.4, 0.42],
  landmarks: ['Keep', 'Temple', 'Market hall'],
  zones: { market: 15, industrial: 15, military: 10, sacred: 10 },
  alleys: 1.6,
  zoneLabels: true,
}

const DENSITY: Record<string, number> = { Sparse: 0.7, Normal: 1, Dense: 1.4 }
const EDGE = 24
/** Road width per rank. */
const ROAD_WIDTH: Record<RoadRank, number> = { main: 16, street: 11, alley: 6 }

/** The zone inputs: percent of districts; an empty input keeps the plan's default. */
const ZONE_INPUTS: Record<keyof ZoneShares, string> = { market: 'zoneMarket', industrial: 'zoneIndustry', military: 'zoneMilitary', sacred: 'zoneSacred' }

/**
 * How a zone builds. `keep` thins out the house plots, `scale` sizes the houses, and `use` turns some of them into
 * a stall, workshop, barracks or shrine (`useOn: 'front'` only on the front row of a main road).
 */
type ZoneStyle = { keep: number; scale: number; use?: string; useChance?: number; useOn?: 'front' }
const ZONE_STYLE: Record<ZoneKind, ZoneStyle> = {
  residential: { keep: 1, scale: 1 },
  market: { keep: 1, scale: 0.9, use: 'stall', useChance: 0.45, useOn: 'front' },
  industrial: { keep: 0.75, scale: 1.25, use: 'workshop', useChance: 0.6 },
  military: { keep: 0.55, scale: 1.2, use: 'barracks', useChance: 0.7 },
  sacred: { keep: 0.4, scale: 1, use: 'shrine', useChance: 0.25 },
}

/** Which district a landmark belongs in, by its name. */
const LANDMARK_ZONES: [RegExp, ZoneKind][] = [
  [/temple|church|chapel|shrine|abbey|monaster|cathedral|sanctuar|cemetery|graveyard/i, 'sacred'],
  [/keep|castle|barrack|garrison|fort|citadel|armou?ry|guard/i, 'military'],
  [/market|guild|bank|exchange|inn\b|tavern|trade|merchant|hall/i, 'market'],
  [/smith|forge|mill|workshop|tanner|foundry|mine|dock|warehouse|brew/i, 'industrial'],
]
const landmarkZone = (label: string): ZoneKind | undefined => LANDMARK_ZONES.find(([re]) => re.test(label))?.[1]

/** What the layers below have put on the map, in the shape the placement checks need. */
type Scene = {
  w: number
  h: number
  centre: Pt
  roads: { pts: Pt[]; width: number; rank: RoadRank; obj: MapObject }[]
  river?: { pts: Pt[]; width: number }
  coast?: Pt[]
  ponds: MapObject[]
  plaza?: MapObject
  wall?: Pt[]
}

/** The scene; `alleys` = false leaves the alleys out, for the layers the alleys are made from. */
function sceneOf(map: LocationMap, alleys = true): Scene {
  const river = objects(map, 'water', 'river')[0]
  const plaza = objects(map, 'roads', 'plaza')[0]
  const roads = [...objects(map, 'roads', 'road'), ...(alleys ? objects(map, 'alleys', 'road') : [])]
  return {
    w: map.w,
    h: map.h,
    centre: plaza ? pos(plaza) : [map.w / 2, map.h / 2],
    roads: roads.flatMap((r) => (r.points ? [{ pts: r.points, width: widthOf(r, 12), rank: roadRank(r), obj: r }] : [])),
    river: river?.points ? { pts: river.points, width: widthOf(river, 30) } : undefined,
    coast: objects(map, 'water', 'coast')[0]?.points,
    ponds: objects(map, 'water', 'pond'),
    plaza,
    wall: objects(map, 'walls', 'wall')[0]?.points,
  }
}

const inBounds = (s: Scene, p: Pt, pad: number) => p[0] > pad && p[1] > pad && p[0] < s.w - pad && p[1] < s.h - pad
const wet = (s: Scene, p: Pt, pad: number) =>
  (!!s.river && distToPolyline(p, s.river.pts) < s.river.width / 2 + pad) ||
  (!!s.coast && (inPolygon(p, s.coast) || distToPolyline(p, s.coast, true) < pad)) ||
  s.ponds.some((o) => dist(p, pos(o)) < Math.max(o.w ?? 0, o.h ?? 0) / 2 + pad)
const onRoad = (s: Scene, p: Pt, pad: number) =>
  s.roads.some((r) => distToPolyline(p, r.pts) < r.width / 2 + pad) || (!!s.plaza && dist(p, s.centre) < (s.plaza.w ?? 0) / 2 + pad)
/** Inside the wall when there is one, with room to spare; anywhere otherwise. */
const withinWall = (s: Scene, p: Pt, pad: number) => !s.wall || (inPolygon(p, s.wall) && distToPolyline(p, s.wall, true) > pad)
const outsideWall = (s: Scene, p: Pt, pad: number) => !s.wall || (!inPolygon(p, s.wall) && distToPolyline(p, s.wall, true) > pad)

function layersOf(plan: Plan): LayerDef[] {
  const scaleOf = (location: Entity) => plan.scales[sizeKey(location)]

  function ground({ project, location, map, rand }: GenContext): NewMapObject[] {
    const tint = biomeTint(project, location)
    return Array.from({ length: rand.int(7, 10) }, () => {
      const rx = rand.range(90, 230)
      const ry = rx * rand.range(0.55, 0.9)
      const [x, y] = [rand.range(0, map.w), rand.range(0, map.h)]
      return { kind: 'patch', x, y, ...outlineOf(blob(x, y, rx, ry, rand, 9)), props: { tone: rand.int(0, 2), ...(tint ? { tint } : {}) } }
    })
  }

  function water({ location, map, rand }: GenContext): NewMapObject[] {
    const { w, h } = map
    if (location.water === 'River') {
      const x = w * (rand.chance(0.5) ? rand.range(0.2, 0.3) : rand.range(0.7, 0.8))
      const course = path(rand, [[x + rand.range(-50, 50), -30], [x, h * 0.3], [x, h * 0.65], [x + rand.range(-50, 50), h + 30]], 45)
      return [{ kind: 'river', x, y: h / 2, ...course, props: { width: rand.int(26, 38) } }]
    }
    if (location.water === 'Coast') {
      const y = h * 0.8
      const shore = path(rand, [[-30, y + rand.range(-20, 20)], [w * 0.3, y], [w * 0.65, y], [w + 30, y + rand.range(-20, 20)]], 28).points
      return [{ kind: 'coast', x: w / 2, y: h, points: [...shore, [w + 30, h + 30], [-30, h + 30]] }]
    }
    if (!rand.chance(0.4)) return []
    const [x, y] = [w * (rand.chance(0.5) ? rand.range(0.12, 0.25) : rand.range(0.75, 0.88)), h * rand.range(0.2, 0.8)]
    const r = rand.range(34, 56)
    return [{ kind: 'pond', x, y, w: r * 2, h: r * 1.5, ...outlineOf(blob(x, y, r, r * 0.75, rand, 9, 0.18)) }]
  }

  function roads({ location, map, rand }: GenContext): NewMapObject[] {
    const { w, h } = map
    // How much the roads wander (the Irregularity slider).
    const sway = 30 * param(map, 'sway', 1)
    const coast = objects(map, 'water', 'coast').length > 0
    const centre: Pt = [w / 2 + rand.range(-40, 40), (coast ? h * 0.42 : h / 2) + rand.range(-25, 25)]
    // The main roads are the trade routes: in at one edge, through the market square, out at another.
    const main = path(rand, [[-20, centre[1] + rand.range(-90, 90)], between([-20, centre[1]], centre, 0.5), centre, between(centre, [w + 20, centre[1]], 0.5), [w + 20, centre[1] + rand.range(-90, 90)]], sway)
    const out: NewMapObject[] = [{ kind: 'road', rank: 'main', x: centre[0], y: centre[1], ...main, props: { width: ROAD_WIDTH.main } }]
    const lane = (from: Pt, to: Pt, width: number) =>
      out.push({ kind: 'road', rank: 'street', x: from[0], y: from[1], ...path(rand, [from, between(from, to, 0.35), between(from, to, 0.7), to], sway), props: { width } })

    if (plan.streets) {
      // The second main street, north to south (only north when the sea is to the south).
      const top: Pt = [centre[0] + rand.range(-90, 90), -20]
      const cross = coast
        ? path(rand, [top, between(top, centre, 0.5), centre], sway)
        : path(rand, [top, between(top, centre, 0.5), centre, between(centre, [centre[0], h + 20], 0.5), [centre[0] + rand.range(-90, 90), h + 20]], sway)
      out.push({ kind: 'road', rank: 'main', x: centre[0], y: centre[1], ...cross, props: { width: ROAD_WIDTH.main } })
      // A ring street around the centre, stored as a curve that ends where it starts.
      const ring = outlineOf(blob(centre[0], centre[1], w * 0.19, h * 0.2, rand, 10, 0.1))
      out.push({ kind: 'road', rank: 'street', x: centre[0], y: centre[1], points: [...ring.points, ring.points[0]], ctrl: [...ring.ctrl, ring.ctrl[0]], props: { width: ROAD_WIDTH.street } })
      const far = Math.max(w, h)
      const turn = rand.range(0, Math.PI * 2)
      for (let i = 0; i < scaleOf(location).sideRoads; i++) {
        const a = turn + ((i + rand.range(-0.25, 0.25)) / scaleOf(location).sideRoads) * Math.PI * 2
        if (coast && Math.sin(a) > 0.25) continue
        const [dx, dy] = [Math.cos(a), Math.sin(a)]
        lane([centre[0] + dx * w * 0.19, centre[1] + dy * h * 0.2], [centre[0] + dx * far, centre[1] + dy * far], 10)
      }
    } else {
      const mainLength = polylineLength(main.points)
      for (let i = 0; i < scaleOf(location).sideRoads; i++) {
        const up = coast || i % 2 === 0
        const start = i < 2 ? centre : pointAlong(main.points, mainLength * (rand.chance(0.5) ? 0.3 : 0.7)).p
        lane(start, [start[0] + rand.range(-0.28, 0.28) * w, up ? -20 : h + 20], ROAD_WIDTH.street)
      }
    }

    const plaza = rand.int(58, 76)
    out.push({ kind: 'plaza', x: centre[0], y: centre[1], w: plaza, h: plaza })
    const river = objects(map, 'water', 'river')[0]
    if (river?.points) {
      for (const r of out.filter((o) => o.kind === 'road')) {
        const width = Number(r.props?.width)
        for (const c of crossings(r.points!, river.points)) out.push({ kind: 'bridge', x: c.p[0], y: c.p[1], w: widthOf(river, 30) + 18, h: width + 8, rot: toDeg(c.angle) })
      }
    }
    return out
  }

  function walls({ location, map, rand }: GenContext): NewMapObject[] {
    const style = location.walls === 'Palisade' || location.walls === 'Stone' ? location.walls : null
    if (!style) return []
    const s = sceneOf(map, false)
    const ring = outlineOf(blob(s.centre[0], s.centre[1], map.w * plan.wall[0], map.h * plan.wall[1], rand, 12, 0.1))
    const out: NewMapObject[] = [{ kind: 'wall', x: s.centre[0], y: s.centre[1], ...ring, props: { style } }]
    for (const r of s.roads) for (const c of crossings(r.pts, ring.points, true)) out.push({ kind: 'gate', x: c.p[0], y: c.p[1], w: 18, h: r.width + 6, rot: toDeg(c.angle), props: { style } })
    return out
  }

  /** The settled area: inside the wall, or the oval a wall would follow. Convex, and inside the map. */
  function settledArea(map: LocationMap, s: Scene): Pt[] {
    const ring: Pt[] = s.wall ?? Array.from({ length: 20 }, (_, i) => {
      const a = (i / 20) * Math.PI * 2
      return [s.centre[0] + Math.cos(a) * map.w * plan.wall[0], s.centre[1] + Math.sin(a) * map.h * plan.wall[1]] as Pt
    })
    return clipToBox(convexHull(ring), [EDGE, EDGE, map.w - EDGE, map.h - EDGE])
  }

  function districts({ location, map, rand }: GenContext): NewMapObject[] {
    const s = sceneOf(map, false)
    const bound = settledArea(map, s)
    if (bound.length < 3) return []
    const [x0, y0] = [Math.min(...bound.map((p) => p[0])), Math.min(...bound.map((p) => p[1]))]
    const [x1, y1] = [Math.max(...bound.map((p) => p[0])), Math.max(...bound.map((p) => p[1]))]
    const seeds: Pt[] = []
    for (let tries = 0; tries < 400 && seeds.length < scaleOf(location).wards; tries++) {
      const p: Pt = [rand.range(x0, x1), rand.range(y0, y1)]
      if (inPolygon(p, bound)) seeds.push(p)
    }
    const cells = voronoi(relax(seeds, bound, 2), bound).filter((c) => c.length >= 3)
    const reach = Math.max(...bound.map((p) => dist(p, s.centre)), 1)
    const gates = objects(map, 'walls', 'gate').map(pos)
    const mains = s.roads.filter((r) => r.rank === 'main')
    const near = (cell: Pt[], p: Pt, pad: number) => inPolygon(p, cell) || distToPolyline(p, cell, true) < pad
    const wards: Ward[] = cells.map((cell) => ({
      outward: Math.min(1, dist(centroid(cell), s.centre) / reach),
      mainRoad: mains.some((r) => r.pts.some((p) => inPolygon(p, cell))),
      wall: !!s.wall && cell.some((v) => distToPolyline(v, s.wall!, true) < 25),
      gate: gates.some((g) => near(cell, g, 30)),
      water: cell.some((v) => wet(s, v, 30)),
    }))
    const shares: ZoneShares = { ...plan.zones }
    for (const [zone, input] of Object.entries(ZONE_INPUTS) as [keyof ZoneShares, string][]) {
      const v = location[input]
      if (v !== undefined && v !== null && v !== '' && Number.isFinite(Number(v))) shares[zone] = Number(v)
    }
    const zones = assignZones(wards, zoneCounts(cells.length, shares), neighbours(cells))
    return cells.map((cell, i) => {
      const c = centroid(cell)
      return { kind: 'district', x: c[0], y: c[1], points: cell, props: { zone: zones[i] } }
    })
  }

  /** Narrow lanes off the streets into the districts; dead ends allowed. None in the temple quarter. */
  function alleys({ map, rand }: GenContext): NewMapObject[] {
    if (!plan.alleys) return []
    const s = sceneOf(map, false)
    const out: NewMapObject[] = []
    const starts: Pt[] = []
    for (const d of districtsOf(map)) {
      const zone = zoneOf(d)
      if (zone === 'sacred' || !d.points) continue
      const cell = d.points
      // Points along the streets inside this district, with the way the street runs there.
      const along = s.roads.flatMap((r) => {
        const len = polylineLength(r.pts)
        return Array.from({ length: Math.floor(len / 20) }, (_, i) => ({ ...pointAlong(r.pts, (i + 0.5) * 20), width: r.width }))
      }).filter((a) => inPolygon(a.p, cell))
      const want = Math.round(plan.alleys * (zone === 'market' ? 1.5 : 1) * rand.range(0.6, 1.4))
      for (let k = 0, tries = 0; k < want && tries < 30 && along.length; tries++) {
        const at = rand.pick(along)
        const c = centroid(cell)
        // Turn off the street towards the middle of the district.
        let a = at.angle + Math.PI / 2
        if (Math.cos(a) * (c[0] - at.p[0]) + Math.sin(a) * (c[1] - at.p[1]) < 0) a += Math.PI
        const start: Pt = [at.p[0] + Math.cos(a) * at.width / 2, at.p[1] + Math.sin(a) * at.width / 2]
        const length = rand.range(50, 110)
        const bend = a + rand.range(-0.35, 0.35)
        const mid: Pt = [start[0] + Math.cos(a) * length * 0.5, start[1] + Math.sin(a) * length * 0.5]
        const end: Pt = [mid[0] + Math.cos(bend) * length * 0.5, mid[1] + Math.sin(bend) * length * 0.5]
        const ok = (p: Pt) => inPolygon(p, cell) && inBounds(s, p, EDGE) && !wet(s, p, 6) && withinWall(s, p, 10)
        if (!ok(mid) || !ok(end) || starts.some((q) => dist(q, start) < 36)) continue
        starts.push(start)
        out.push({ kind: 'road', rank: 'alley', x: start[0], y: start[1], ...path(rand, [start, mid, end], 6), props: { width: ROAD_WIDTH.alley } })
        k++
      }
    }
    return out
  }

  function landmarks({ project, location, map, rand }: GenContext): NewMapObject[] {
    const s = sceneOf(map)
    const out: NewMapObject[] = [{ kind: 'well', x: s.centre[0] + rand.range(-8, 8), y: s.centre[1] + rand.range(-8, 8), w: 18, h: 18 }]
    const wanted: { label: string; refId?: string }[] = refsOf(project, location.landmarks, 'design.town', 'buildings').map((b) => ({ label: b.name, refId: b.id }))
    if (!wanted.length && location.size !== 'Small') wanted.push(...plan.landmarks.map((label) => ({ label })))
    const placed: NewMapObject[] = []
    const fits = (p: Pt, w: number, h: number) =>
      inBounds(s, p, EDGE + w / 2) && !onRoad(s, p, h / 2 + 5) && !wet(s, p, w / 2) && withinWall(s, p, w / 2 + 6) && !touches(p, radiusOf({ w, h }), placed)
    for (const want of wanted.slice(0, 12)) {
      const [w, h] = [rand.int(46, 60), rand.int(32, 42)]
      const zone = landmarkZone(want.label)
      // In a district of its own kind when there is one, else near the centre.
      const homes = zone ? districtsOf(map).filter((d) => zoneOf(d) === zone && d.points) : []
      let spot: Pt | undefined
      for (let tries = 0; tries < 60 && homes.length && !spot; tries++) {
        const d = rand.pick(homes)
        const c = centroid(d.points!)
        const p: Pt = [c[0] + rand.range(-1, 1) * (40 + tries * 2), c[1] + rand.range(-1, 1) * (30 + tries * 2)]
        if (inPolygon(p, d.points!) && fits(p, w, h)) spot = p
      }
      for (let tries = 0; tries < 60 && !spot; tries++) {
        const a = rand.range(0, Math.PI * 2)
        const d = (s.plaza?.w ?? 60) / 2 + rand.range(34, 80 + tries * 2)
        const p: Pt = [s.centre[0] + Math.cos(a) * d, s.centre[1] + Math.sin(a) * d]
        if (fits(p, w, h)) spot = p
      }
      if (!spot) continue
      const district = districtAt(map, spot)
      placed.push({ kind: 'landmark', x: spot[0], y: spot[1], w, h, rot: rand.range(-12, 12), label: want.label, ...(want.refId ? { refId: want.refId } : {}), ...(district ? { zone: district.id } : {}) })
    }
    return [...out, ...placed]
  }

  function fields({ location, map, rand }: GenContext): NewMapObject[] {
    const s = sceneOf(map)
    const solid = objects(map, 'landmarks')
    const out: NewMapObject[] = []
    const core = Math.min(map.w, map.h) * (plan.streets ? 0.42 : 0.3)
    for (let tries = 0; tries < 400 && out.length < scaleOf(location).fields; tries++) {
      const [w, h] = [rand.range(110, 190), rand.range(70, 125)]
      const r = Math.max(w, h) / 2
      const p: Pt = [rand.range(0, map.w), rand.range(0, map.h)]
      if (!inBounds(s, p, r * 0.75) || (!s.wall && dist(p, s.centre) < core + r * 0.6) || !outsideWall(s, p, r) || onRoad(s, p, r * 0.75) || wet(s, p, r * 0.8) || touches(p, r, out) || touches(p, r, solid)) continue
      out.push({ kind: 'field', x: p[0], y: p[1], w, h, rot: rand.range(-28, 28), props: { crop: rand.int(0, 2) } })
    }
    return out
  }

  function buildings({ location, map, rand }: GenContext): NewMapObject[] {
    const s = sceneOf(map)
    const density = (DENSITY[String(location.density)] ?? 1) * param(map, 'density', 1)
    const population = Number(location.population)
    const target = population > 0 ? clamp(Math.round(population / plan.peoplePerHouse), 4, plan.maxHouses) : Math.round(scaleOf(location).houses * density)
    type Slot = { p: Pt; w: number; h: number; rot: number; order: number; front: boolean; district?: MapObject; keep: number; road: MapObject }
    const slots: Slot[] = []
    for (const road of s.roads) {
      const length = polylineLength(road.pts)
      // An alley has one row of houses each side; streets and main roads the plan's number.
      const rows = road.rank === 'alley' ? 1 : plan.rows
      for (let d = 24; d < length - 24; d += rand.range(plan.spacing[0], plan.spacing[1]) / density) {
        for (const side of [-1, 1]) {
          for (let row = 0; row < rows; row++) {
            const [w0, h0] = [rand.int(plan.house.w[0], plan.house.w[1]), rand.int(plan.house.h[0], plan.house.h[1])]
            const at = pointAlong(road.pts, d + rand.range(-5, 5))
            const keep = rand.next()
            const probe: Pt = [at.p[0] - Math.sin(at.angle) * side * (road.width / 2 + h0), at.p[1] + Math.cos(at.angle) * side * (road.width / 2 + h0)]
            const district = districtAt(map, probe)
            const scale = ZONE_STYLE[zoneOf(district)].scale
            const [w, h] = [w0 * scale, h0 * Math.sqrt(scale)]
            const off = side * (road.width / 2 + h / 2 + 5 + row * (h + 13) + rand.range(0, 5))
            const p: Pt = [at.p[0] - Math.sin(at.angle) * off, at.p[1] + Math.cos(at.angle) * off]
            // The house belongs to the district it ends up in (none outside the settled area); its size came from
            // the one beside the road.
            const home = districtAt(map, p)
            slots.push({ p, w, h, rot: toDeg(at.angle) + rand.range(-6, 6), order: dist(p, s.centre) + row * 70 + rand.range(0, 40), front: row === 0 && road.rank === 'main', district: home, keep, road: road.obj })
          }
        }
      }
    }
    const blocked = [...objects(map, 'landmarks'), ...objects(map, 'fields')]
    const out: NewMapObject[] = []
    for (const slot of slots.sort((a, b) => a.order - b.order)) {
      if (out.length >= target) break
      const style = ZONE_STYLE[zoneOf(slot.district)]
      if (slot.keep > style.keep) continue
      const r = radiusOf(slot)
      if (!inBounds(s, slot.p, EDGE) || onRoad(s, slot.p, slot.h / 2 + 2) || wet(s, slot.p, r + 4) || !withinWall(s, slot.p, r + 8) || touches(slot.p, r, out) || touches(slot.p, r, blocked)) continue
      const props: NonNullable<MapObject['props']> = { roof: rand.int(0, 3), chimney: rand.chance(0.45) }
      const use = style.use && rand.chance(style.useChance ?? 0) && (style.useOn !== 'front' || slot.front) ? style.use : undefined
      if (use) props.use = use
      if (use === 'workshop') Object.assign(props, { roof: 2, chimney: true })
      if (use === 'barracks') props.roof = 2
      // A barracks is a long hall; a stall is a small booth.
      const [w, h] = use === 'barracks' ? [slot.w * 1.5, slot.h] : use === 'stall' ? [slot.w * 0.6, slot.h * 0.7] : [slot.w, slot.h]
      // Attached to its road (attach.ts), so it moves with the road when the road is redrawn by hand.
      const attach = attachFor(slot.road, slot.p)
      out.push({ kind: 'house', x: slot.p[0], y: slot.p[1], w, h, rot: slot.rot, props, ...(slot.district ? { zone: slot.district.id } : {}), ...(attach ? { attach } : {}) })
    }
    // Every special quarter shows what it is: when chance gave it none of its buildings, the house nearest its
    // middle becomes one. Stalls are left to chance, since they only stand on the main road.
    for (const d of districtsOf(map)) {
      const style = ZONE_STYLE[zoneOf(d)]
      const mine = out.filter((o) => o.zone === d.id)
      if (!style.use || style.useOn || !mine.length || mine.some((o) => o.props?.use === style.use)) continue
      const c = centroid(d.points!)
      const pick = mine.reduce((best, o) => (dist(pos(o), c) < dist(pos(best), c) ? o : best))
      pick.props = { ...pick.props, use: style.use, ...(style.use === 'workshop' ? { roof: 2, chimney: true } : style.use === 'barracks' ? { roof: 2 } : {}) }
    }
    return out
  }

  function vegetation({ location, map, rand }: GenContext): NewMapObject[] {
    const s = sceneOf(map)
    const solid = [...objects(map, 'landmarks'), ...objects(map, 'buildings'), ...objects(map, 'fields'), ...objects(map, 'roads', 'bridge')]
    const groves = Array.from({ length: rand.int(6, 10) }, () => [rand.range(0, map.w), rand.range(0, map.h)] as Pt)
    const out: NewMapObject[] = []
    const want = Math.round(scaleOf(location).trees * param(map, 'greenery', 1))
    for (let tries = 0; tries < want * 8 && out.length < want; tries++) {
      const grove = rand.pick(groves)
      const p: Pt = rand.chance(0.25) ? [rand.range(0, map.w), rand.range(0, map.h)] : [grove[0] + rand.range(-90, 90), grove[1] + rand.range(-70, 70)]
      const r = rand.range(7, 13)
      if (!inBounds(s, p, r + 4) || onRoad(s, p, r + 3) || wet(s, p, r + 2) || (!!s.wall && distToPolyline(p, s.wall, true) < r + 8) || touches(p, r, solid) || touches(p, r * 0.6, out)) continue
      out.push({ kind: 'tree', x: p[0], y: p[1], w: r * 2, h: r * 2, props: { tone: rand.int(0, 2) } })
    }
    // Lower trees first, so nearer crowns overlap the ones behind them.
    return out.sort((a, b) => a.y - b.y)
  }

  function labels({ location, map }: GenContext): NewMapObject[] {
    const s = sceneOf(map)
    const out: NewMapObject[] = objects(map, 'landmarks', 'landmark')
      .filter((o) => o.label)
      .map((o) => ({ kind: 'label', x: o.x, y: o.y - (o.h ?? 0) / 2 - 12, label: o.label }))
    // District names: the user's names go to the largest districts in order; in a city the other special
    // districts are named after their zone.
    const names: string[] = (Array.isArray(location.districts) ? location.districts : []).filter((d: unknown) => typeof d === 'string' && d.trim()).slice(0, 16)
    const wards = districtsOf(map).filter((d) => d.points).sort((a, b) => area(b.points!) - area(a.points!))
    if (wards.length) {
      wards.forEach((d, i) => {
        const zone = zoneOf(d)
        const name = names[i] ?? (plan.zoneLabels && zone !== 'residential' ? ZONE_LABEL[zone] : undefined)
        const c = centroid(d.points!)
        if (name) out.push({ kind: 'label', x: clamp(c[0], 80, map.w - 80), y: clamp(c[1], 40, map.h - 40), label: name, props: { size: 'large' } })
      })
      return out
    }
    // A map from before districts: names spread around the centre.
    names.slice(0, 8).forEach((name, i, list) => {
      const a = ((i + 0.5) / list.length) * Math.PI * 2 - Math.PI / 2
      out.push({ kind: 'label', x: clamp(s.centre[0] + Math.cos(a) * map.w * 0.26, 80, map.w - 80), y: clamp(s.centre[1] + Math.sin(a) * map.h * 0.27, 40, map.h - 40), label: name, props: { size: 'large' } })
    })
    return out
  }

  /** Lamps along the trade routes and round the square (fewer in a village), braziers either side of each gate. */
  function lights({ map }: GenContext): NewMapObject[] {
    const s = sceneOf(map)
    const out: NewMapObject[] = []
    const free = (p: Pt) => inBounds(s, p, 10) && !wet(s, p, 4) && !out.some((o) => dist(pos(o), p) < 60)
    const solid = [...objects(map, 'buildings'), ...objects(map, 'landmarks')]
    const spacing = plan.streets ? 120 : 190
    for (const road of s.roads.filter((r) => r.rank === 'main')) {
      const len = polylineLength(road.pts)
      for (let d = spacing / 2, side = 1; d < len; d += spacing, side = -side) {
        const at = pointAlong(road.pts, d)
        const off = road.width / 2 + 6
        const p: Pt = [at.p[0] - Math.sin(at.angle) * off * side, at.p[1] + Math.cos(at.angle) * off * side]
        const attach = attachFor(road.obj, p)
        if (free(p) && withinWall(s, p, 6) && !touches(p, 6, solid)) out.push(lightOf('lamp', p[0], p[1], attach ? { attach } : {}))
      }
    }
    if (s.plaza) {
      const r = (s.plaza.w ?? 60) / 2 - 6
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2 + Math.PI / 4
        out.push(lightOf('lamp', s.centre[0] + Math.cos(a) * r, s.centre[1] + Math.sin(a) * r))
      }
    }
    for (const g of objects(map, 'walls', 'gate')) {
      for (const side of [-1, 1]) {
        const a = ((g.rot ?? 0) * Math.PI) / 180 + Math.PI / 2
        const reach = (g.h ?? 18) / 2 + 12
        out.push(lightOf('brazier', g.x + Math.cos(a) * reach * side, g.y + Math.sin(a) * reach * side))
      }
    }
    return out
  }

  /**
   * People as spawn points: merchants at the market stalls (else on the trade route in the market), residents by
   * the landmarks and in front of houses spread over the town.
   */
  function people({ project, location, map, rand }: GenContext): NewMapObject[] {
    const s = sceneOf(map)
    const merchants = refsOf(project, location.merchants, 'design.trade', 'merchants')
    const residents = refsOf(project, location.residents, 'design.npc', 'archetypes')
    if (!merchants.length && !residents.length) return []
    const out: NewMapObject[] = []
    const solid = [...objects(map, 'buildings'), ...objects(map, 'landmarks')]
    /** A walkable spot beside a building, on its road side when it can. */
    const beside = (o: MapObject): Pt | null => {
      for (let tries = 0; tries < 16; tries++) {
        const a = rand.range(0, Math.PI * 2)
        const reach = Math.max(o.w ?? 20, o.h ?? 20) / 2 + 12
        const p: Pt = [o.x + Math.cos(a) * reach, o.y + Math.sin(a) * reach]
        if (inBounds(s, p, EDGE) && !wet(s, p, 4) && !touches(p, 9, solid) && !touches(p, 9, out)) return p
      }
      return null
    }
    const stalls = objects(map, 'buildings', 'house').filter((h) => h.props?.use === 'stall')
    const market = districtsOf(map).filter((d) => zoneOf(d) === 'market')
    const roadside = s.roads.filter((r) => r.rank === 'main').flatMap((r) => {
      const len = polylineLength(r.pts)
      return Array.from({ length: Math.floor(len / 30) }, (_, i) => {
        const at = pointAlong(r.pts, i * 30 + 15)
        return [at.p[0] - Math.sin(at.angle) * (r.width / 2 + 8), at.p[1] + Math.cos(at.angle) * (r.width / 2 + 8)] as Pt
      })
    }).filter((p) => !market.length || market.some((d) => inPolygon(p, d.points!)))
    merchants.forEach((m, i) => {
      const p = stalls[i] ? beside(stalls[i]) : roadside.length ? rand.pick(roadside) : null
      if (p) out.push({ kind: 'marker', x: p[0], y: p[1], w: 18, h: 18, label: m.name, refId: m.id, props: { type: 'merchant' }, spawn: { role: 'merchant', refId: m.id } })
    })
    const homes = [...objects(map, 'landmarks', 'landmark'), ...objects(map, 'buildings', 'house').filter((h) => h.props?.use !== 'stall')]
    const per = clamp(Math.round(homes.length / 12), 1, 4)
    for (const r of residents) {
      for (let k = 0; k < per && homes.length; k++) {
        const p = beside(k === 0 && objects(map, 'landmarks', 'landmark').length ? rand.pick(objects(map, 'landmarks', 'landmark')) : rand.pick(homes))
        if (p) out.push({ kind: 'marker', x: p[0], y: p[1], w: 18, h: 18, label: r.name, refId: r.id, props: { type: 'npc' }, spawn: { role: 'npc', refId: r.id } })
      }
    }
    return out
  }

  // Drawing order. Districts are drawn under the roads but made from them; alleys come off the streets.
  return [
    { id: 'ground', label: 'Ground', dependsOn: [], generate: ground },
    { id: 'water', label: 'Water', dependsOn: [], generate: water },
    { id: 'districts', label: 'Districts', dependsOn: ['water', 'roads', 'walls'], generate: districts },
    { id: 'roads', label: plan.streets ? 'Streets' : 'Roads', dependsOn: ['water'], generate: roads, addable: ['road', 'bridge'] },
    { id: 'alleys', label: 'Alleys', dependsOn: ['water', 'roads', 'walls', 'districts'], generate: alleys, addable: ['road'] },
    { id: 'walls', label: 'Walls and gates', dependsOn: ['roads'], generate: walls, addable: ['gate'] },
    { id: 'landmarks', label: 'Landmarks', dependsOn: ['water', 'roads', 'alleys', 'walls', 'districts'], generate: landmarks, addable: ['landmark', 'well'] },
    { id: 'fields', label: 'Fields', dependsOn: ['water', 'roads', 'alleys', 'walls', 'landmarks'], generate: fields, addable: ['field'] },
    { id: 'buildings', label: 'Houses', dependsOn: ['water', 'roads', 'alleys', 'walls', 'districts', 'landmarks', 'fields'], generate: buildings, addable: ['house'] },
    { id: 'vegetation', label: 'Trees', dependsOn: ['water', 'roads', 'alleys', 'walls', 'landmarks', 'fields', 'buildings'], generate: vegetation, addable: ['tree'] },
    { id: 'people', label: 'People', dependsOn: ['roads', 'alleys', 'districts', 'landmarks', 'buildings'], generate: people, addable: ['marker'] },
    { id: 'lights', label: 'Lights', dependsOn: ['roads', 'walls', 'landmarks', 'buildings'], generate: lights, addable: ['light'] },
    { id: 'labels', label: 'Labels', dependsOn: ['roads', 'districts', 'landmarks'], generate: labels, addable: ['label'] },
  ]
}

/**
 * After a road, river or wall is edited by hand, each bridge moves to the nearest place where a road crosses the
 * river, and each gate to the nearest place where a road crosses the wall (houses and lamps follow their road by
 * themselves, being attached to it). Pinned bridges and gates stay.
 */
function healCrossings(map: LocationMap, after: MapObject, type: LocationTypeDef): LocationMap {
  if (!['road', 'river', 'wall'].includes(after.kind)) return map
  const roads = [...objects(map, 'roads', 'road'), ...objects(map, 'alleys', 'road')].filter((r) => r.points)
  const changed = new Map<string, MapObject>()
  const snap = (items: MapObject[], line: Pt[] | undefined, closed: boolean) => {
    if (!line) return
    const spots = roads.flatMap((r) => crossings(r.points!, line, closed))
    for (const o of items) {
      if (o.pinned) continue
      const best = spots.sort((p, q) => dist(p.p, pos(o)) - dist(q.p, pos(o)))[0]
      if (best && dist(best.p, pos(o)) < 250 && dist(best.p, pos(o)) > 0.5) changed.set(o.id, { ...o, x: Math.round(best.p[0]), y: Math.round(best.p[1]), rot: Math.round(toDeg(best.angle)) })
    }
  }
  snap(objects(map, 'roads', 'bridge'), objects(map, 'water', 'river')[0]?.points, false)
  snap(objects(map, 'walls', 'gate'), objects(map, 'walls', 'wall')[0]?.points, true)
  return replaceObjects(map, changed, type)
}

const typeOf = (plan: Plan): LocationTypeDef => {
  const def: LocationTypeDef = {
    id: plan.id,
    size: (location) => ({ w: plan.scales[sizeKey(location)].w, h: plan.scales[sizeKey(location)].h }),
    layers: layersOf(plan),
    nav: { cell: 10, open: true },
    heal: (map, _before, after) => healCrossings(map, after, def),
    params: [
      { id: 'density', label: 'Density', min: 0.4, max: 1.8, step: 0.1, default: 1, layers: ['buildings'], help: 'How closely houses stand along the roads.' },
      { id: 'sway', label: 'Irregularity', min: 0, max: 2.5, step: 0.1, default: 1, layers: ['roads'], help: 'How much the roads wander.' },
      { id: 'greenery', label: 'Trees', min: 0, max: 2.5, step: 0.1, default: 1, layers: ['vegetation'] },
    ],
    stamps: [
      {
        id: 'houses',
        label: 'Cluster of houses',
        layer: 'buildings',
        make: (x, y) => [[-22, -16, 0], [22, -16, 1], [-22, 16, 2], [22, 16, 3]].map(([dx, dy, roof]) => ({ kind: 'house', x: x + dx, y: y + dy, w: 34, h: 24, rot: 0, props: { roof, chimney: roof % 2 === 0 } })),
      },
      { id: 'pond', label: 'Pond', layer: 'water', make: (x, y) => [poolAt(x, y, 46, 34)] },
    ],
  }
  return def
}

export const VILLAGE = typeOf(VILLAGE_PLAN)
export const CITY = typeOf(CITY_PLAN)
