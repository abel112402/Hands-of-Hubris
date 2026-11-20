import type { Entity, Project } from '../../model/types'
import { dist } from '../geometry'
import { fractal, simplex2 } from '../noise'
import { hash, makeRng, type Rng } from '../rng'
import type { GenContext, LayerDef, LocationMap, LocationTypeDef, MapPoint as Pt, NewMapObject } from '../types'
import { trace, type Grid } from './cave'
import { clamp, objects, param, path, pos, sizeKey } from './shared'

/**
 * World: the whole setting on one card. A continent rises from noise out of the sea; the land is shared out among
 * the biomes of World › Biomes (each grows from its own seed over the nearest land); rivers run downhill from the
 * heights to the sea; every location that is not inside another one gets a site in its biome, linked so a click
 * opens its map; roads join the towns and villages.
 * Layers, bottom to top: sea, land, regions, rivers, roads, sites, labels.
 */
const SCALES = {
  Small: { w: 1000, h: 700 },
  Medium: { w: 1200, h: 840 },
  Large: { w: 1400, h: 980 },
}
const scaleOf = (location: Entity) => SCALES[sizeKey(location)]
const CELL = 20
/** Share of the map that is land. */
const LAND = 0.52

const biomesOf = (project: Project): Entity[] => {
  const list = project.documents['design.world']?.data.biomes
  return Array.isArray(list) ? list : []
}
const locationsOf = (project: Project): Entity[] => {
  const list = project.documents['design.world']?.data.locations
  return Array.isArray(list) ? list : []
}

/** Height of every cell: fractal noise lifted in the middle and sunk towards the edges, so the land is a continent. */
function heights(cols: number, rows: number, rand: Rng, rough: number): Float64Array {
  const n = fractal(simplex2(rand), 5)
  const out = new Float64Array(cols * rows)
  const [cx, cy] = [cols / 2 + rand.range(-cols * 0.08, cols * 0.08), rows / 2 + rand.range(-rows * 0.08, rows * 0.08)]
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const d = Math.hypot((c - cx) / (cols / 2), (r - cy) / (rows / 2))
      out[r * cols + c] = n(c * rough, r * rough) * 0.8 + (1 - d) * 0.9
    }
  }
  return out
}

/** The land as a grid: the highest cells up to the land share, with the outermost ring always sea. */
function landOf(h: Float64Array, cols: number, rows: number, share: number): { grid: Grid; level: number } {
  const sorted = Array.from(h).sort((a, b) => a - b)
  const level = sorted[Math.floor(sorted.length * (1 - share))]
  const floor = Array.from(h, (v, i) => {
    const [c, r] = [i % cols, Math.floor(i / cols)]
    return v > level && c > 1 && r > 1 && c < cols - 2 && r < rows - 2
  })
  return { grid: { cell: CELL, cols, rows, floor }, level }
}

/** The world's height and land grid, from the map's seed (the same for every layer, so they agree). */
function terrain(map: LocationMap): { h: Float64Array; land: Grid } {
  const [cols, rows] = [Math.floor(map.w / CELL), Math.floor(map.h / CELL)]
  // Every layer derives the same terrain from the map seed, not from its own random stream.
  const h = heights(cols, rows, makeRng(hash(map.seed, 'terrain')), param(map, 'roughness', 0.09))
  return { h, land: landOf(h, cols, rows, param(map, 'land', LAND)).grid }
}

const signedArea = (pts: Pt[]) => pts.reduce((s, p, i) => s + p[0] * pts[(i + 1) % pts.length][1] - pts[(i + 1) % pts.length][0] * p[1], 0) / 2
const centre = (pts: Pt[]): Pt => [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length]
const thin = (pts: Pt[], max: number) => {
  const stride = Math.ceil(pts.length / max)
  return stride > 1 ? pts.filter((_, i) => i % stride === 0) : pts
}

function sea({ map }: GenContext): NewMapObject[] {
  return [{ kind: 'sea', x: map.w / 2, y: map.h / 2, w: map.w, h: map.h }]
}

/** Coastlines: each island as land, and each lake inside the land as a lake. */
function land({ map }: GenContext): NewMapObject[] {
  const loops = trace(terrain(map).land)
  if (!loops.length) return []
  const sign = Math.sign(signedArea(loops[0]))
  return loops.slice(0, 60).map((l) => {
    const c = centre(l)
    const island = Math.sign(signedArea(l)) === sign
    return island ? { kind: 'land', x: c[0], y: c[1], points: thin(l, 380) } : { kind: 'pond', x: c[0], y: c[1], points: thin(l, 120) }
  })
}

/** Which biome owns each land cell: every biome grows from a seed cell over the land nearest to it. */
function ownership(project: Project, map: LocationMap): { owner: Int32Array; biomes: Entity[]; land: Grid } {
  const { land } = terrain(map)
  const biomes = biomesOf(project).slice(0, 24)
  const rand = makeRng(hash(map.seed, 'biomes'))
  const cells = land.floor.flatMap((f, i) => (f ? [i] : []))
  const xy = (i: number): Pt => [i % land.cols, Math.floor(i / land.cols)]
  const seeds: number[] = []
  for (let k = 0; k < Math.max(1, biomes.length); k++) {
    // Far from the seeds so far: the best of a few random land cells.
    let best = cells[rand.int(0, cells.length - 1)]
    let bestD = -1
    for (let t = 0; t < 30 && cells.length; t++) {
      const c = cells[rand.int(0, cells.length - 1)]
      const d = Math.min(Infinity, ...seeds.map((s) => dist(xy(s), xy(c))))
      if (d > bestD) [best, bestD] = [c, d]
    }
    if (best !== undefined) seeds.push(best)
  }
  const owner = new Int32Array(land.floor.length).fill(-1)
  for (const i of cells) {
    let [k, kd] = [0, Infinity]
    seeds.forEach((s, j) => {
      const d = dist(xy(s), xy(i))
      if (d < kd) [k, kd] = [j, d]
    })
    owner[i] = k
  }
  return { owner, biomes, land }
}

function regions({ project, map }: GenContext): NewMapObject[] {
  const { owner, biomes, land } = ownership(project, map)
  const out: NewMapObject[] = []
  const count = Math.max(1, biomes.length)
  for (let k = 0; k < count; k++) {
    const grid: Grid = { ...land, floor: Array.from(owner, (o) => o === k) }
    const b = biomes[k]
    for (const loop of trace(grid).slice(0, 6)) {
      if (Math.abs(signedArea(loop)) < CELL * CELL * 4) continue
      const c = centre(loop)
      out.push({
        kind: 'region',
        x: c[0],
        y: c[1],
        points: thin(loop, 200),
        label: String(b?.name ?? 'Wilds'),
        ...(b ? { refId: b.id } : {}),
        props: { ...(typeof b?.color === 'string' && /^#[0-9a-f]{6}$/i.test(b.color) ? { color: b.color } : {}), tone: k % 3 },
      })
    }
  }
  return out
}

/** Rivers: from a few high places, always down to the lowest neighbour, until the sea. */
function rivers({ map, rand }: GenContext): NewMapObject[] {
  const { h, land } = terrain(map)
  const { cols, rows } = land
  const high = land.floor.flatMap((f, i) => (f ? [i] : [])).sort((a, b) => h[b] - h[a])
  const out: NewMapObject[] = []
  const used = new Set<number>()
  for (const start of high.slice(0, 80)) {
    if (out.length >= rand.int(2, 4)) break
    if ([...used].some((u) => Math.hypot((u % cols) - (start % cols), Math.floor(u / cols) - Math.floor(start / cols)) < 8)) continue
    const course: number[] = [start]
    for (let at = start, steps = 0; land.floor[at] && steps < 200; steps++) {
      const [c, r] = [at % cols, Math.floor(at / cols)]
      let next = -1
      let lowest = h[at]
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const [nc, nr] = [c + dx, r + dy]
          if ((!dx && !dy) || nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue
          const j = nr * cols + nc
          if (h[j] < lowest && !course.includes(j)) [lowest, next] = [h[j], j]
        }
      }
      // A hollow with no way down: cut through to the nearest lower ground.
      if (next < 0) break
      course.push(next)
      at = next
    }
    const reachesSea = !land.floor[course[course.length - 1]]
    if (!reachesSea || course.length < 8) continue
    course.forEach((c) => used.add(c))
    const pts = course.filter((_, i) => i % 3 === 0 || i === course.length - 1).map((i) => [((i % cols) + 0.5) * CELL, (Math.floor(i / cols) + 0.5) * CELL] as Pt)
    out.push({ kind: 'river', x: pts[0][0], y: pts[0][1], ...path(rand, pts, 4), props: { width: 7 } })
  }
  return out
}

/** A site for every location that is not inside another one, in its own biome when it has one, linked to it. */
function sites({ project, location, map, rand }: GenContext): NewMapObject[] {
  const { owner, biomes, land } = ownership(project, map)
  const wet = objects(map, 'rivers')
  const out: NewMapObject[] = []
  const places = locationsOf(project).filter((l) => l.id !== location.id && !l.parent && l.type !== 'World')
  for (const place of places.slice(0, 60)) {
    const k = biomes.findIndex((b) => b.id === place.biome)
    const cells = land.floor.flatMap((f, i) => (f && (k < 0 || owner[i] === k) ? [i] : []))
    for (let tries = 0; tries < 40 && cells.length; tries++) {
      const i = cells[rand.int(0, cells.length - 1)]
      const p: Pt = [((i % land.cols) + 0.5) * CELL, (Math.floor(i / land.cols) + 0.5) * CELL]
      const nearWater = wet.some((r) => (r.points ?? []).some((q) => dist(q, p) < 14))
      if (nearWater || out.some((o) => dist(pos(o), p) < 70) || p[1] < 60) continue
      out.push({ kind: 'site', x: p[0], y: p[1], w: 24, h: 24, label: String(place.name ?? ''), refId: place.id, link: { locationId: place.id }, props: { type: String(place.type ?? 'Village') } })
      break
    }
  }
  return out
}

/** Roads between the towns and villages: each joins the nearest one already on the network. */
function roads({ map, rand }: GenContext): NewMapObject[] {
  const towns = objects(map, 'sites', 'site').filter((s) => s.props?.type === 'City' || s.props?.type === 'Village')
  if (towns.length < 2) return []
  const out: NewMapObject[] = []
  const joined = [towns[0]]
  for (const t of towns.slice(1).sort((a, b) => dist(pos(a), pos(joined[0])) - dist(pos(b), pos(joined[0])))) {
    const from = joined.reduce((best, j) => (dist(pos(j), pos(t)) < dist(pos(best), pos(t)) ? j : best))
    const mid: Pt = [(from.x + t.x) / 2 + rand.range(-30, 30), (from.y + t.y) / 2 + rand.range(-30, 30)]
    out.push({ kind: 'road', rank: 'main', x: from.x, y: from.y, ...path(rand, [pos(from), mid, pos(t)], 0), props: { width: 5 } })
    joined.push(t)
  }
  return out
}

function labels({ map }: GenContext): NewMapObject[] {
  // A biome's name once, at its largest region.
  const largest = new Map<string, { label: NewMapObject; area: number }>()
  for (const r of objects(map, 'regions', 'region')) {
    const area = Math.abs(signedArea(r.points ?? []))
    const key = r.label ?? ''
    if (!largest.has(key) || largest.get(key)!.area < area) largest.set(key, { label: { kind: 'label', x: r.x, y: r.y, label: key, props: { size: 'large' } }, area })
  }
  const out: NewMapObject[] = [...largest.values()].map((v) => v.label)
  for (const s of objects(map, 'sites', 'site')) out.push({ kind: 'label', x: s.x, y: s.y + 24, label: s.label })
  return out.map((l) => ({ ...l, x: clamp(l.x, 60, map.w - 60), y: clamp(l.y, 30, map.h - 20) }))
}

const LAYERS: LayerDef[] = [
  { id: 'sea', label: 'Sea', dependsOn: [], generate: sea },
  { id: 'land', label: 'Land', dependsOn: [], generate: land },
  { id: 'regions', label: 'Biome regions', dependsOn: [], generate: regions },
  { id: 'rivers', label: 'Rivers', dependsOn: [], generate: rivers },
  { id: 'roads', label: 'Roads', dependsOn: ['sites'], generate: roads, addable: ['road'] },
  { id: 'sites', label: 'Places', dependsOn: ['regions', 'rivers'], generate: sites, addable: ['site'] },
  { id: 'labels', label: 'Labels', dependsOn: ['regions', 'sites'], generate: labels, addable: ['label'] },
]

export const WORLD: LocationTypeDef = {
  id: 'World',
  size: (location) => ({ w: scaleOf(location).w, h: scaleOf(location).h }),
  layers: LAYERS,
  nav: { cell: 20, open: false },
  params: [
    { id: 'land', label: 'Land', min: 0.3, max: 0.72, step: 0.02, default: LAND, layers: ['land', 'regions', 'rivers'], help: 'How much of the map is land.' },
    { id: 'roughness', label: 'Coast detail', min: 0.04, max: 0.16, step: 0.01, default: 0.09, layers: ['land', 'regions', 'rivers'], help: 'Few large shapes, or many bays and islands.' },
  ],
}
