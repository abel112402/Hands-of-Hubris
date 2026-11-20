import { findObject } from './edit'
import { withId } from './generate'
import { CURVE_STEP, dist, polylineLength, pointAlong, sampleSpline } from './geometry'
import { kindInfo } from './objects'
import { markDependentsStale } from './order'
import { emptyGrid, fieldOf, gridOf } from './raster'
import { getLocationType } from './registry'
import { MAX_OBJECTS_PER_LAYER } from './schema'
import type { LocationMap, MapObject, MapPoint as Pt, NewMapObject } from './types'

/**
 * Painting and drawing by hand: raster brushes (carve or fill a cave's rock, mark ground walkable or blocked),
 * redrawing a road or river along a stroke, splitting a room in two, and dropping ready-made stamps. Each returns a
 * new map; the Map view commits one stroke or click as one undo step.
 */

/** What each painted field holds, and how a new one is made when the map has none yet. */
export const BRUSH_FIELDS = {
  /** A cave's rock: 0 floor, 1 rock. Made by the cavern layer; carving redraws the outline. */
  rock: { carve: 0, fill: 1 },
  /** Walkability painted over everything else (nav.ts): 0 as drawn, 1 walkable, 2 blocked. */
  navOverride: { clear: 0, walk: 1, block: 2 },
} as const
export type BrushField = keyof typeof BRUSH_FIELDS
const NEW_FIELD_CELL = 10
/** Cave rock keeps a two-cell rim, so the outline never runs off the map. */
const RIM = 2

/** Paints a disc of `value` into a field at `p`; then lets the map's type redraw what it draws from that field. */
export function paintField(map: LocationMap, field: BrushField, p: Pt, radius: number, value: number): LocationMap {
  const stored = map.fields?.[field]
  if (!stored && field === 'rock') return map
  const g = stored ? gridOf(stored) : emptyGrid(map.w, map.h, NEW_FIELD_CELL)
  if (!g) return map
  const span = Math.ceil(radius / g.cell)
  const [c0, r0] = [Math.floor(p[0] / g.cell), Math.floor(p[1] / g.cell)]
  let touched = false
  for (let r = r0 - span; r <= r0 + span; r++) {
    for (let c = c0 - span; c <= c0 + span; c++) {
      if (c < 0 || r < 0 || c >= g.cols || r >= g.rows) continue
      if (field === 'rock' && (c < RIM || r < RIM || c >= g.cols - RIM || r >= g.rows - RIM)) continue
      if (dist([(c + 0.5) * g.cell, (r + 0.5) * g.cell], p) > radius) continue
      if (g.data[r * g.cols + c] !== value) {
        g.data[r * g.cols + c] = value
        touched = true
      }
    }
  }
  if (!touched) return map
  const next: LocationMap = { ...map, fields: { ...map.fields, [field]: fieldOf(g) } }
  return getLocationType(map.type)?.fromField?.(next, field) ?? next
}

/** A road, river or wall redrawn along a hand-drawn stroke: waypoints every ~60 units, the curve through them. */
export function redrawn(o: MapObject, stroke: Pt[]): MapObject | null {
  const shape = kindInfo(o.kind)?.shape
  if ((shape !== 'curve' && shape !== 'outline') || stroke.length < 2) return null
  const length = polylineLength(stroke)
  if (length < 20) return null
  const count = Math.max(3, Math.min(40, Math.round(length / 60) + 1))
  const ctrl = Array.from({ length: count }, (_, i) => pointAlong(stroke, (i / (count - 1)) * length).p.map((v) => Math.round(v)) as Pt)
  const closed = shape === 'outline'
  const centre: Pt = closed ? [ctrl.reduce((s, c) => s + c[0], 0) / ctrl.length, ctrl.reduce((s, c) => s + c[1], 0) / ctrl.length] : ctrl[0]
  return { ...o, x: Math.round(centre[0]), y: Math.round(centre[1]), ctrl, points: sampleSpline(ctrl, CURVE_STEP, closed).map(([x, y]) => [Math.round(x), Math.round(y)] as Pt) }
}

const MIN_PART = 40

/**
 * A room cut in two where `p` is: across its longer side, on the 10-unit grid. The first part keeps the room's id
 * and use; the second is a plain room with `newId`. Both are pinned; the doors become out of date.
 */
export function splitRoom(map: LocationMap, id: string, p: Pt, newId: string): LocationMap {
  const found = findObject(map, id)
  if (!found || !['room', 'chamber'].includes(found.object.kind) || findObject(map, newId)) return map
  const o = found.object
  const layer = map.layers[found.layerId]
  if (layer.locked) return map
  const [w, h] = [o.w ?? 0, o.h ?? 0]
  const wide = w >= h
  const [lo, size] = wide ? [o.x - w / 2, w] : [o.y - h / 2, h]
  const cut = Math.round((Math.min(Math.max((wide ? p[0] : p[1]) - lo, MIN_PART), size - MIN_PART)) / 10) * 10
  if (cut < MIN_PART || size - cut < MIN_PART) return map
  const first: MapObject = wide ? { ...o, x: lo + cut / 2, w: cut, pinned: true } : { ...o, y: lo + cut / 2, h: cut, pinned: true }
  const plain: NewMapObject = o.kind === 'room' ? { kind: 'room', x: 0, y: 0, label: 'Room', props: { floor: String(o.props?.floor ?? 'Wood') } } : { kind: 'chamber', x: 0, y: 0, props: { role: 'room' } }
  const second = withId(
    wide ? { ...plain, x: lo + cut + (size - cut) / 2, y: o.y, w: size - cut, h, pinned: true } : { ...plain, x: o.x, y: lo + cut + (size - cut) / 2, w, h: size - cut, pinned: true },
    newId,
  )
  const objects = layer.objects.flatMap((x) => (x.id === id ? [withId(first, id), second] : [x]))
  return markStale({ ...map, layers: { ...map.layers, [found.layerId]: { ...layer, objects } } }, found.layerId)
}

/** Drops a stamp's objects on a layer, each pinned, with ids from `ids` (one per object). */
export function addStamp(map: LocationMap, layerId: string, made: NewMapObject[], ids: string[]): LocationMap {
  const layer = map.layers[layerId]
  if (!layer || layer.locked || !made.length || layer.objects.length + made.length > MAX_OBJECTS_PER_LAYER) return map
  const added = made.map((o, i) => withId({ ...o, pinned: true }, ids[i]))
  return markStale({ ...map, layers: { ...map.layers, [layerId]: { ...layer, objects: [...layer.objects, ...added] } } }, layerId)
}

const markStale = (map: LocationMap, layerId: string) => markDependentsStale(map, [layerId], getLocationType(map.type))
