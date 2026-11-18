import { distToPolyline, inPolygon, toRad } from './geometry'
import type { MapObject, MapPoint as Pt } from './types'

/**
 * Room shapes: a room is still a box (move, resize and pin work as for any box), and `props.shape` says what part
 * of the box is floor. Generators, the walkability grid, the room graph and the renderer all ask here, so they
 * agree on where a room is.
 */
export const ROOM_SHAPES = ['rect', 'round', 'cross', 'L'] as const
export type RoomShape = (typeof ROOM_SHAPES)[number]

export const shapeOf = (o: MapObject): RoomShape => {
  const s = o.props?.shape
  return typeof s === 'string' && (ROOM_SHAPES as readonly string[]).includes(s) ? (s as RoomShape) : 'rect'
}
/** Which quarter an L-shaped room leaves out: 0 top left, 1 top right, 2 bottom right, 3 bottom left. */
const cutOf = (o: MapObject) => ((Math.round(Number(o.props?.cut) || 0) % 4) + 4) % 4
const CUT_SIGN: Pt[] = [[-1, -1], [1, -1], [1, 1], [-1, 1]]

/** The floor outline in the room's own frame (centre at 0, 0, no rotation). */
export function localOutline(o: MapObject): Pt[] {
  const [hw, hh] = [(o.w ?? 0) / 2, (o.h ?? 0) / 2]
  switch (shapeOf(o)) {
    case 'round':
      return Array.from({ length: 28 }, (_, i) => {
        const a = (i / 28) * Math.PI * 2
        return [Math.cos(a) * hw, Math.sin(a) * hh] as Pt
      })
    case 'cross': {
      const [ax, ay] = [hw * 0.45, hh * 0.45]
      return [[-ax, -hh], [ax, -hh], [ax, -ay], [hw, -ay], [hw, ay], [ax, ay], [ax, hh], [-ax, hh], [-ax, ay], [-hw, ay], [-hw, -ay], [-ax, -ay]]
    }
    case 'L': {
      // Round the box's corners; the cut corner is replaced by a notch to the middle. Going from the corner before
      // it, the notch runs along that corner's edge, in to the middle, and out along the next edge.
      const corners: Pt[] = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]]
      const cut = cutOf(o)
      const out: Pt[] = []
      corners.forEach((c, i) => {
        if (i !== cut) return void out.push(c)
        // Corners 0 and 2 are entered along a vertical edge, 1 and 3 along a horizontal one.
        out.push(...((i % 2 === 0 ? [[c[0], 0], [0, 0], [0, c[1]]] : [[0, c[1]], [0, 0], [c[0], 0]]) as Pt[]))
      })
      return out
    }
    default:
      return [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]]
  }
}

/** Outlines are asked for very often while generating; objects are immutable, so one per object is enough. */
const outlines = new WeakMap<MapObject, Pt[]>()
function outlineCached(o: MapObject): Pt[] {
  let poly = outlines.get(o)
  if (!poly) outlines.set(o, (poly = localOutline(o)))
  return poly
}

const toWorld = (o: MapObject, p: Pt): Pt => {
  const a = toRad(o.rot ?? 0)
  return [o.x + p[0] * Math.cos(a) - p[1] * Math.sin(a), o.y + p[0] * Math.sin(a) + p[1] * Math.cos(a)]
}
const toLocal = (o: MapObject, p: Pt): Pt => {
  const a = -toRad(o.rot ?? 0)
  const [dx, dy] = [p[0] - o.x, p[1] - o.y]
  return [dx * Math.cos(a) - dy * Math.sin(a), dx * Math.sin(a) + dy * Math.cos(a)]
}

/** The floor outline in map coordinates. */
export const roomOutline = (o: MapObject): Pt[] => localOutline(o).map((p) => toWorld(o, p))

/**
 * Whether a point is on the room's floor. `pad` grows the floor by that much on every side, or with a negative
 * value keeps the point that far from every wall.
 */
export function inRoom(o: MapObject, p: Pt, pad = 0): boolean {
  const l = toLocal(o, p)
  const inBox = Math.abs(l[0]) <= (o.w ?? 0) / 2 + Math.max(pad, 0) && Math.abs(l[1]) <= (o.h ?? 0) / 2 + Math.max(pad, 0)
  if (shapeOf(o) === 'rect') return Math.abs(l[0]) <= (o.w ?? 0) / 2 + pad && Math.abs(l[1]) <= (o.h ?? 0) / 2 + pad
  if (!inBox) return false
  const poly = outlineCached(o)
  const inside = inPolygon(l, poly)
  if (pad === 0) return inside
  const edge = distToPolyline(l, poly, true)
  return pad > 0 ? inside || edge <= pad : inside && edge >= -pad
}

/**
 * A point well inside the floor that corridors aim for: the middle, except in an L-shaped room, whose middle is
 * its inner corner; there it is the middle of the quarter opposite the cut.
 */
export function roomAnchor(o: MapObject): Pt {
  if (shapeOf(o) !== 'L') return [o.x, o.y]
  const [sx, sy] = CUT_SIGN[cutOf(o)]
  return toWorld(o, [(-sx * (o.w ?? 0)) / 4, (-sy * (o.h ?? 0)) / 4])
}

/** Stretches of a horizontal line (y in the room's frame) that lie on the floor, as [x0, x1] pairs. */
export function scanline(poly: Pt[], y: number): [number, number][] {
  const xs: number[] = []
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [a, b] = [poly[j], poly[i]]
    if (a[1] > y !== b[1] > y) xs.push(a[0] + ((y - a[1]) * (b[0] - a[0])) / (b[1] - a[1]))
  }
  xs.sort((p, q) => p - q)
  const out: [number, number][] = []
  for (let i = 0; i + 1 < xs.length; i += 2) out.push([xs[i], xs[i + 1]])
  return out
}
