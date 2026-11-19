import { dependents, withId } from './generate'
import { CURVE_STEP, sampleSpline, toDeg, toRad } from './geometry'
import { heal } from './heal'
import { kindInfo } from './objects'
import { getLocationType } from './registry'
import { MAX_OBJECTS_PER_LAYER } from './schema'
import type { LocationMap, MapLayer, MapObject, MapPoint as Pt } from './types'

/**
 * Manual edits. Two levels: pure changes to one object (`moved`, `resized`, …), and changes to the map that put the
 * result back (`putObject`, `removeObject`, …). An edited object is pinned, so regenerating its layer keeps it, and
 * the layers that read its layer are marked stale. Locked layers refuse every edit.
 */
const MIN_SIZE = 6

export function findObject(map: LocationMap, id: string | null | undefined): { layerId: string; object: MapObject } | null {
  if (!id) return null
  for (const [layerId, layer] of Object.entries(map.layers)) {
    const object = layer.objects.find((o) => o.id === id)
    if (object) return { layerId, object }
  }
  return null
}

// ---------- One object ----------

const shift = (pts: Pt[] | undefined, dx: number, dy: number): Pt[] | undefined => pts?.map(([x, y]) => [x + dx, y + dy])
const tidy = (o: MapObject): MapObject => {
  const out = { ...o }
  if (!out.points) delete out.points
  if (!out.ctrl) delete out.ctrl
  return out
}

export const moved = (o: MapObject, dx: number, dy: number): MapObject =>
  tidy({ ...o, x: o.x + dx, y: o.y + dy, points: shift(o.points, dx, dy), ctrl: shift(o.ctrl, dx, dy) })

/** A box whose corner handle was dragged to `p`: it grows about its centre, in its own rotated frame. */
export function resizedTo(o: MapObject, p: Pt): MapObject {
  const a = toRad(-(o.rot ?? 0))
  const [dx, dy] = [p[0] - o.x, p[1] - o.y]
  const w = Math.max(MIN_SIZE, Math.abs(dx * Math.cos(a) - dy * Math.sin(a)) * 2)
  const h = Math.max(MIN_SIZE, Math.abs(dx * Math.sin(a) + dy * Math.cos(a)) * 2)
  return resized(o, w, h)
}

export function resized(o: MapObject, w: number, h: number): MapObject {
  const [nw, nh] = [Math.max(MIN_SIZE, Math.round(w)), Math.max(MIN_SIZE, Math.round(h))]
  return kindInfo(o.kind)?.square ? { ...o, w: Math.max(nw, nh), h: Math.max(nw, nh) } : { ...o, w: nw, h: nh }
}

/** A box whose rotation handle (above its top edge) was dragged to `p`. */
export const rotatedTo = (o: MapObject, p: Pt): MapObject => ({ ...o, rot: Math.round(toDeg(Math.atan2(p[1] - o.y, p[0] - o.x)) + 90) })

/** A curve with one waypoint moved; the curve is redrawn through the waypoints. */
export function ctrlMoved(o: MapObject, index: number, p: Pt): MapObject {
  if (!o.ctrl || !o.ctrl[index]) return o
  const ctrl = o.ctrl.map((c, i) => (i === index ? p : c))
  const closed = kindInfo(o.kind)?.shape === 'outline'
  const centre: Pt = closed ? [ctrl.reduce((s, c) => s + c[0], 0) / ctrl.length, ctrl.reduce((s, c) => s + c[1], 0) / ctrl.length] : [o.x, o.y]
  return { ...o, x: centre[0], y: centre[1], ctrl, points: sampleSpline(ctrl, CURVE_STEP, closed) }
}

// ---------- The map ----------

function withLayer(map: LocationMap, layerId: string, fn: (layer: MapLayer) => MapLayer | null): LocationMap {
  const layer = map.layers[layerId]
  if (!layer || layer.locked) return map
  const next = fn(layer)
  if (!next) return map
  const layers = { ...map.layers, [layerId]: next }
  const type = getLocationType(map.type)
  for (const id of type ? dependents(type, layerId) : []) {
    const l = layers[id]
    if (l && !l.locked && !l.stale) layers[id] = { ...l, stale: true }
  }
  return { ...map, layers }
}

/**
 * Puts a changed object back in place of the one with its id, pinned, and heals the map around it (heal.ts):
 * what is attached to it or stands in it follows, corridors and shared walls adjust. `heal: false` skips that.
 */
export function putObject(map: LocationMap, object: MapObject, o: { heal?: boolean } = {}): LocationMap {
  const found = findObject(map, object.id)
  if (!found) return map
  const next = withId({ ...object, pinned: true }, object.id)
  const out = withLayer(map, found.layerId, (layer) => ({ ...layer, objects: layer.objects.map((x) => (x.id === object.id ? next : x)) }))
  return out === map || o.heal === false ? out : heal(out, found.object, next)
}

/** Pins or releases an object without otherwise changing it; nothing becomes stale. */
export function setPinned(map: LocationMap, id: string, pinned: boolean): LocationMap {
  const found = findObject(map, id)
  const layer = found && map.layers[found.layerId]
  if (!found || !layer || layer.locked) return map
  const next: MapObject = { ...found.object }
  if (pinned) next.pinned = true
  else delete next.pinned
  return { ...map, layers: { ...map.layers, [found.layerId]: { ...layer, objects: layer.objects.map((o) => (o.id === id ? next : o)) } } }
}

export function removeObject(map: LocationMap, id: string): LocationMap {
  const found = findObject(map, id)
  return found ? withLayer(map, found.layerId, (layer) => ({ ...layer, objects: layer.objects.filter((o) => o.id !== id) })) : map
}

/** Adds a new object of `kind` to a layer at a point. `id` must be new; the object is pinned from the start. */
export function addObject(map: LocationMap, layerId: string, kind: string, at: Pt, id: string): LocationMap {
  const make = kindInfo(kind)?.make
  if (!make || findObject(map, id)) return map
  return withLayer(map, layerId, (layer) => (layer.objects.length >= MAX_OBJECTS_PER_LAYER ? null : { ...layer, objects: [...layer.objects, withId({ ...make(at[0], at[1]), pinned: true }, id)] }))
}

/** A copy of an object, a little to the lower right, in the same layer. */
export function duplicateObject(map: LocationMap, id: string, newId: string): LocationMap {
  const found = findObject(map, id)
  if (!found || findObject(map, newId)) return map
  return withLayer(map, found.layerId, (layer) =>
    layer.objects.length >= MAX_OBJECTS_PER_LAYER ? null : { ...layer, objects: [...layer.objects, withId({ ...moved(found.object, 14, 14), pinned: true }, newId)] },
  )
}

// ---------- Masks ----------

const MAX_MASKS = 50

/** Adds a mask: everything inside it survives every reroll (generate.ts). */
export function addMask(map: LocationMap, poly: Pt[], id: string, label?: string): LocationMap {
  if (poly.length < 3 || (map.masks ?? []).length >= MAX_MASKS || map.masks?.some((m) => m.id === id)) return map
  const mask = { id, poly: poly.map(([x, y]) => [Math.round(x) || 0, Math.round(y) || 0] as Pt), ...(label ? { label } : {}) }
  return { ...map, masks: [...(map.masks ?? []), mask] }
}

export function removeMask(map: LocationMap, id: string): LocationMap {
  const masks = (map.masks ?? []).filter((m) => m.id !== id)
  const next: LocationMap = { ...map, masks }
  if (!masks.length) delete next.masks
  return next
}

/** A rectangle from two corners, as a mask outline. */
export const rectPoly = (a: Pt, b: Pt): Pt[] => {
  const [x0, x1, y0, y1] = [Math.min(a[0], b[0]), Math.max(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[1], b[1])]
  return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]
}

/** A rectangle around an object with some room to spare, to mask it and what stands in it. */
export function maskAround(o: MapObject, pad = 12): Pt[] {
  if (o.points?.length) {
    const xs = o.points.map((p) => p[0])
    const ys = o.points.map((p) => p[1])
    return rectPoly([Math.min(...xs) - pad, Math.min(...ys) - pad], [Math.max(...xs) + pad, Math.max(...ys) + pad])
  }
  const r = Math.hypot(o.w ?? 20, o.h ?? 20) / 2 + pad
  return rectPoly([o.x - r, o.y - r], [o.x + r, o.y + r])
}

/** Locks or unlocks a layer. A locked layer is not edited and not regenerated. */
export function setLayerLocked(map: LocationMap, layerId: string, locked: boolean): LocationMap {
  const l = map.layers[layerId]
  if (!l) return map
  const next: MapLayer = { ...l }
  if (locked) next.locked = true
  else delete next.locked
  return { ...map, layers: { ...map.layers, [layerId]: next } }
}
