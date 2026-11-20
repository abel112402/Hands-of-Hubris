import type { NavGrid } from './nav'
import type { LocationMap, MapObject, MapPoint as Pt, NewMapObject } from './types'

/**
 * Light on a map: sources are objects with a `light` field (torches, lamps, braziers, hearths, windows); each lights
 * the cells it can see within its radius, fading with distance, and walls (blocked cells of the walkability grid)
 * cast shadows. Ambient light depends on the kind of place and the time of day. Derived, never stored.
 */
export type LightGrid = { cell: number; cols: number; rows: number; level: Float32Array }

/** What each light source is, how far it reaches and its colour; generators and "Add" use these. */
export const LIGHT_TYPES: Record<string, { radius: number; intensity: number; color: string }> = {
  torch: { radius: 95, intensity: 0.9, color: '#ffb347' },
  brazier: { radius: 150, intensity: 1, color: '#ff8c2a' },
  lamp: { radius: 120, intensity: 0.85, color: '#ffd27a' },
  candle: { radius: 60, intensity: 0.6, color: '#ffe0a0' },
  hearth: { radius: 110, intensity: 0.9, color: '#ff9a3c' },
  campfire: { radius: 130, intensity: 0.95, color: '#ff9a3c' },
  crystal: { radius: 75, intensity: 0.55, color: '#8fd3ff' },
  window: { radius: 70, intensity: 0.7, color: '#fff4d6' },
}
/** A light source object. Its reach and colour follow its type, so changing the type by hand changes the light. */
export const lightOf = (type: string, x: number, y: number, extra: Partial<NewMapObject> = {}): NewMapObject => ({ kind: 'light', x, y, w: 12, h: 12, props: { type }, ...extra })

/** The light an object gives: its own `light` field, else (for a light source) its type's. */
export function emits(o: MapObject): { radius: number; color: string; intensity: number } | null {
  if (o.light) return { color: '#ffd27a', intensity: 1, ...o.light }
  if (o.kind !== 'light') return null
  return LIGHT_TYPES[String(o.props?.type)] ?? LIGHT_TYPES.torch
}

/** Light from the sky by kind of place and time of day: outdoors, indoors with windows, underground. */
const AMBIENT: Record<'outdoor' | 'indoor' | 'underground', Record<string, number>> = {
  outdoor: { day: 1, dusk: 0.5, night: 0.12 },
  indoor: { day: 0.35, dusk: 0.2, night: 0.04 },
  underground: { day: 0, dusk: 0, night: 0 },
}
const PLACE: Record<string, keyof typeof AMBIENT> = { City: 'outdoor', Village: 'outdoor', Dwelling: 'indoor', Dungeon: 'underground', Cave: 'underground' }
/** Daylight through windows by time of day. */
const DAYLIGHT: Record<string, number> = { day: 1, dusk: 0.4, night: 0 }

export const ambientOf = (map: LocationMap) => AMBIENT[PLACE[map.type] ?? 'outdoor'][map.env?.time ?? 'day']

/** Whether a straight line between two cells crosses a blocked cell (the end cells themselves do not count). */
function blockedBetween(nav: NavGrid, c0: number, r0: number, c1: number, r1: number): boolean {
  let [x, y] = [c0, r0]
  const [dx, dy] = [Math.abs(c1 - c0), -Math.abs(r1 - r0)]
  const [sx, sy] = [c0 < c1 ? 1 : -1, r0 < r1 ? 1 : -1]
  let err = dx + dy
  for (;;) {
    if (x === c1 && y === r1) return false
    if (!(x === c0 && y === r0) && !nav.cost[y * nav.cols + x]) return true
    const e2 = 2 * err
    if (e2 >= dy) [err, x] = [err + dy, x + sx]
    if (e2 <= dx) [err, y] = [err + dx, y + sy]
  }
}

export const lightSources = (map: LocationMap): MapObject[] => Object.values(map.layers).flatMap((l) => l.objects).filter((o) => emits(o))

export function lightGrid(map: LocationMap, nav: NavGrid): LightGrid {
  const level = new Float32Array(nav.cols * nav.rows).fill(ambientOf(map))
  const daylight = DAYLIGHT[map.env?.time ?? 'day']
  for (const o of lightSources(map)) {
    const { radius, intensity } = emits(o)!
    const strength = intensity * (o.props?.type === 'window' ? daylight : 1)
    if (strength <= 0) continue
    const [c0, r0] = [Math.floor(o.x / nav.cell), Math.floor(o.y / nav.cell)]
    const span = Math.ceil(radius / nav.cell)
    for (let r = Math.max(0, r0 - span); r <= Math.min(nav.rows - 1, r0 + span); r++) {
      for (let c = Math.max(0, c0 - span); c <= Math.min(nav.cols - 1, c0 + span); c++) {
        const d = Math.hypot((c + 0.5) * nav.cell - o.x, (r + 0.5) * nav.cell - o.y)
        if (d > radius) continue
        const i = r * nav.cols + c
        // A light on a wall (a torch in its bracket) still lights the room: start from the source's own cell.
        if (c0 >= 0 && r0 >= 0 && c0 < nav.cols && r0 < nav.rows && blockedBetween(nav, c0, r0, c, r)) continue
        level[i] = Math.min(1, level[i] + strength * (1 - d / radius) ** 1.5)
      }
    }
  }
  return { cell: nav.cell, cols: nav.cols, rows: nav.rows, level }
}

/** Walkable cells darker than `below`: where the shadows are. */
export function darkCells(light: LightGrid, nav: NavGrid, below = 0.2): number[] {
  const out: number[] = []
  for (let i = 0; i < light.level.length; i++) if (nav.cost[i] && light.level[i] < below) out.push(i)
  return out
}

/** The light at a point of the map. */
export const lightAt = (light: LightGrid, p: Pt) => {
  const [c, r] = [Math.floor(p[0] / light.cell), Math.floor(p[1] / light.cell)]
  return c < 0 || r < 0 || c >= light.cols || r >= light.rows ? 0 : light.level[r * light.cols + c]
}
