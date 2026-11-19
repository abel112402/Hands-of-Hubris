import { kindInfo } from './objects'
import type { LocationMap, MapObject } from './types'

/**
 * Snapping while dragging a box: its edges and middle line up with those of nearby boxes in the same layer when
 * they come within `SNAP` units (shown as guide lines), and a kind with a grid (rooms) keeps its edges on the grid
 * otherwise. Only boxes standing square (0°, 90°, 180°, 270°) line up by their edges.
 */
export const SNAP = 6
/** A guide line in map units: x0, y0, x1, y1. */
export type Guide = [number, number, number, number]

const square = (o: MapObject) => Math.round(((o.rot ?? 0) % 90 + 90) % 90) === 0
/** Left, middle and right (or top, middle, bottom) of a box standing square. */
function stops(o: MapObject, axis: 0 | 1): number[] {
  const turned = Math.round((((o.rot ?? 0) % 180) + 180) % 180) === 90
  const half = ((axis === 0) !== turned ? (o.w ?? 0) : (o.h ?? 0)) / 2
  const c = axis === 0 ? o.x : o.y
  return [c - half, c, c + half]
}

export function snapMove(map: LocationMap, o: MapObject, layerId: string): { object: MapObject; guides: Guide[] } {
  const info = kindInfo(o.kind)
  if (info?.shape !== 'box' || !o.w || !o.h) return { object: o, guides: [] }
  const others = (map.layers[layerId]?.objects ?? []).filter((x) => x.id !== o.id && x.w && x.h && square(x) && Math.hypot(x.x - o.x, x.y - o.y) < 400)
  const out = { ...o }
  const guides: Guide[] = []
  for (const axis of [0, 1] as const) {
    let best: { shift: number; at: number; other: MapObject } | null = null
    if (square(o)) {
      const mine = stops(o, axis)
      for (const x of others) {
        for (const s of stops(x, axis)) {
          for (const m of mine) {
            const shift = s - m
            if (Math.abs(shift) <= SNAP && (!best || Math.abs(shift) < Math.abs(best.shift))) best = { shift, at: s, other: x }
          }
        }
      }
    }
    if (best) {
      if (axis === 0) out.x = Math.round(o.x + best.shift)
      else out.y = Math.round(o.y + best.shift)
      const [a0, a1] = axis === 0 ? [Math.min(out.y, best.other.y), Math.max(out.y, best.other.y)] : [Math.min(out.x, best.other.x), Math.max(out.x, best.other.x)]
      const reach = Math.max(o.w, o.h, best.other.w ?? 0, best.other.h ?? 0) / 2
      guides.push(axis === 0 ? [best.at, a0 - reach, best.at, a1 + reach] : [a0 - reach, best.at, a1 + reach, best.at])
    } else if (info.grid) {
      // The low edge on the grid.
      const half = (axis === 0 ? o.w : o.h) / 2
      const c = axis === 0 ? o.x : o.y
      const snapped = Math.round((c - half) / info.grid) * info.grid + half
      if (axis === 0) out.x = Math.round(snapped)
      else out.y = Math.round(snapped)
    }
  }
  return { object: out, guides }
}
