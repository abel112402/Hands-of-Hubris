import type { LayerDef, LocationMap, LocationTypeDef, MapLayer, MapObject, NewMapObject } from './types'

/** Layer order and object replacement for one location type. No registry import, so type files may use it. */

/** Whole numbers, and never -0, which JSON would turn into 0 and so change a map on save and load. */
const int = (n: number) => Math.round(n) || 0

/** A generated object with its id, its numbers rounded to whole map units. */
export function withId(o: NewMapObject, id: string): MapObject {
  const out: MapObject = { ...o, id, x: int(o.x), y: int(o.y) }
  if (o.w !== undefined) out.w = int(o.w)
  if (o.h !== undefined) out.h = int(o.h)
  if (o.rot !== undefined) out.rot = int(o.rot)
  if (o.points) out.points = o.points.map(([x, y]) => [int(x), int(y)])
  if (o.ctrl) out.ctrl = o.ctrl.map(([x, y]) => [int(x), int(y)])
  return out
}

/**
 * The order layers are generated in: every layer after the ones it reads. `type.layers` is the drawing order, which
 * can differ (a corridor is drawn under the rooms it was routed between).
 */
export function generationOrder(type: LocationTypeDef): LayerDef[] {
  const out: LayerDef[] = []
  const visit = (l: LayerDef, trail: string[]) => {
    if (out.includes(l) || trail.includes(l.id)) return
    for (const d of l.dependsOn) {
      const dep = type.layers.find((x) => x.id === d)
      if (dep) visit(dep, [...trail, l.id])
    }
    out.push(l)
  }
  for (const l of type.layers) visit(l, [])
  return out
}

/** Layers that read `layerId`, directly or through another layer. */
export function dependents(type: LocationTypeDef, layerId: string): string[] {
  const hit = new Set([layerId])
  for (const l of generationOrder(type)) if (l.dependsOn.some((d) => hit.has(d))) hit.add(l.id)
  hit.delete(layerId)
  return type.layers.filter((l) => hit.has(l.id)).map((l) => l.id)
}

/** Replaces objects across layers and marks the layers that read a changed layer stale. Locked layers stay. */
export function replaceObjects(map: LocationMap, changed: Map<string, MapObject>, type: LocationTypeDef | undefined): LocationMap {
  if (!changed.size) return map
  const layers: Record<string, MapLayer> = { ...map.layers }
  const touched: string[] = []
  for (const [id, layer] of Object.entries(map.layers)) {
    if (layer.locked || !layer.objects.some((o) => changed.has(o.id))) continue
    layers[id] = { ...layer, objects: layer.objects.map((o) => changed.get(o.id) ?? o) }
    touched.push(id)
  }
  if (!touched.length) return map
  return markDependentsStale({ ...map, layers }, touched, type)
}

/** Marks the layers that read any of `changed` as out of date (not the changed layers themselves, nor locked ones). */
export function markDependentsStale(map: LocationMap, changed: string[], type: LocationTypeDef | undefined): LocationMap {
  if (!type) return map
  const layers: Record<string, MapLayer> = { ...map.layers }
  for (const id of changed) {
    for (const d of dependents(type, id)) {
      const l = layers[d]
      if (l && !l.locked && !l.stale && !changed.includes(d)) layers[d] = { ...l, stale: true }
    }
  }
  return { ...map, layers }
}
