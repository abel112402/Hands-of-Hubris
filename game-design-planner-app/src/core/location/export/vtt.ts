import { mapNav } from '../analysis'
import { toRad } from '../geometry'
import { ambientOf, emits } from '../light'
import type { NavGrid } from '../nav'
import type { LocationMap, MapPoint as Pt } from '../types'
import { playerView } from '../visibility'

/**
 * The map for a virtual tabletop as Universal VTT (`.dd2vtt`, format 0.3): Foundry VTT reads it with the Universal
 * Battlemap Importer, Roll20 with its UniversalVTTImporter script. It carries the picture (base64 PNG, added by the
 * caller, which can draw), the grid, walls that block sight, doors as portals, and lights. Positions are in grid
 * squares; one square is `gridSize` map units. It is always the players' version: secrets and creatures stay out
 * of the picture, but secret doors stay walls.
 */
export type UvttPoint = { x: number; y: number }
export type Uvtt = {
  format: number
  resolution: { map_origin: UvttPoint; map_size: UvttPoint; pixels_per_grid: number }
  line_of_sight: UvttPoint[][]
  objects_line_of_sight: UvttPoint[][]
  portals: { position: UvttPoint; bounds: [UvttPoint, UvttPoint]; rotation: number; closed: boolean; freestanding: boolean }[]
  environment: { baked_lighting: boolean; ambient_light: string }
  lights: { position: UvttPoint; range: number; intensity: number; color: string; shadows: boolean }[]
  image: string
}

/**
 * Walls from the walkability grid: every edge between a blocked cell and an open one, joined into straight runs
 * along rows and columns. In map units.
 */
export function gridWalls(nav: NavGrid): [Pt, Pt][] {
  const open = (c: number, r: number) => c >= 0 && r >= 0 && c < nav.cols && r < nav.rows && nav.cost[r * nav.cols + c] > 0
  const out: [Pt, Pt][] = []
  // Horizontal edges: between row r-1 and row r.
  for (let r = 0; r <= nav.rows; r++) {
    let start = -1
    for (let c = 0; c <= nav.cols; c++) {
      const edge = c < nav.cols && open(c, r - 1) !== open(c, r)
      if (edge && start < 0) start = c
      if (!edge && start >= 0) {
        out.push([[start * nav.cell, r * nav.cell], [c * nav.cell, r * nav.cell]])
        start = -1
      }
    }
  }
  // Vertical edges: between column c-1 and column c.
  for (let c = 0; c <= nav.cols; c++) {
    let start = -1
    for (let r = 0; r <= nav.rows; r++) {
      const edge = r < nav.rows && open(c - 1, r) !== open(c, r)
      if (edge && start < 0) start = r
      if (!edge && start >= 0) {
        out.push([[c * nav.cell, start * nav.cell], [c * nav.cell, r * nav.cell]])
        start = -1
      }
    }
  }
  return out
}

const hex = (c: string) => c.replace('#', '').padStart(6, '0').slice(0, 6)

export function universalVtt(stored: LocationMap, o: { gridSize?: number; pixelsPerGrid?: number; image?: string } = {}): Uvtt {
  const grid = o.gridSize ?? 50
  const g = (p: Pt): UvttPoint => ({ x: Math.round((p[0] / grid) * 1000) / 1000, y: Math.round((p[1] / grid) * 1000) / 1000 })
  // Walls from the players' version: a secret door, room or corridor is not there for them, so it stays rock.
  const map = playerView(stored)
  const nav = mapNav(map)
  const all = Object.values(map.layers).flatMap((l) => l.objects)
  // Doors are drawn as portals, not walls: the grid already leaves their cells open.
  const portals = all
    .filter((d) => d.kind === 'door' || d.kind === 'gate')
    .map((d) => {
      const a = toRad(d.rot ?? 0)
      const half = (d.w ?? 20) / 2
      const ends: [Pt, Pt] = [[d.x - Math.cos(a) * half, d.y - Math.sin(a) * half], [d.x + Math.cos(a) * half, d.y + Math.sin(a) * half]]
      return { position: g([d.x, d.y]), bounds: [g(ends[0]), g(ends[1])] as [UvttPoint, UvttPoint], rotation: Math.round(a * 1000) / 1000, closed: d.props?.style !== 'open', freestanding: false }
    })
  const ambient = Math.round(ambientOf(stored) * 255).toString(16).padStart(2, '0')
  return {
    format: 0.3,
    resolution: { map_origin: { x: 0, y: 0 }, map_size: g([stored.w, stored.h]), pixels_per_grid: o.pixelsPerGrid ?? 70 },
    line_of_sight: gridWalls(nav).map(([a, b]) => [g(a), g(b)]),
    objects_line_of_sight: [],
    portals,
    environment: { baked_lighting: false, ambient_light: `ff${ambient}${ambient}${ambient}` },
    lights: all.flatMap((x) => {
      const e = emits(x)
      return e ? [{ position: g([x.x, x.y]), range: Math.round((e.radius / grid) * 100) / 100, intensity: e.intensity, color: `ff${hex(e.color)}`, shadows: true }] : []
    }),
    image: o.image ?? '',
  }
}
