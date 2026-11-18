import type { Entity, Project } from '../model/types'
import { dist, radiusOf } from './geometry'
import { getLocationType } from './registry'
import { hash, makeRng } from './rng'
import { MAX_OBJECTS_PER_LAYER } from './schema'
import { HAND_FIELDS, MAP_SETTINGS, type LayerDef, type LocationMap, type LocationTypeDef, type MapLayer, type MapObject, type NewMapObject } from './types'

/**
 * Runs the layer generators of a location type. All functions are pure: they return a new map and never touch the
 * one passed in, so the caller can store the result through `useStore.mutate` as one undo step.
 */
/** Whole numbers, and never -0, which JSON would turn into 0 and so change a map on save and load. */
const int = (n: number) => Math.round(n) || 0

export function withId(o: NewMapObject, id: string): MapObject {
  const out: MapObject = { ...o, id, x: int(o.x), y: int(o.y) }
  if (o.w !== undefined) out.w = int(o.w)
  if (o.h !== undefined) out.h = int(o.h)
  if (o.rot !== undefined) out.rot = int(o.rot)
  if (o.points) out.points = o.points.map(([x, y]) => [int(x), int(y)])
  if (o.ctrl) out.ctrl = o.ctrl.map(([x, y]) => [int(x), int(y)])
  return out
}

/** A generated box-like object gives way to a pinned one it would sit on. Lines and outlines never do. */
const blockedBy = (o: MapObject, pinned: MapObject[]) =>
  !o.points && pinned.some((p) => !p.points && dist([o.x, o.y], [p.x, p.y]) < (Math.max(radiusOf(o), 6) + Math.max(radiusOf(p), 6)) * 0.8)

/** Runs one layer's generator and returns the map with that layer (and any fields it owns) replaced. */
function runLayer(def: LayerDef, project: Project, location: Entity, map: LocationMap, nonce: number): LocationMap {
  const old = map.layers[def.id]
  const pinned = (old?.objects ?? []).filter((o) => o.pinned)
  const rand = makeRng(hash(map.seed, def.id, nonce))
  const result = def.generate({ project, location, map, rand })
  const output = Array.isArray(result) ? { objects: result } : result
  const made = output.objects
    .map((o, i) => withId(o, `${def.id}.${nonce}.${i}`))
    .filter((o) => !blockedBy(o, pinned))
    .slice(0, MAX_OBJECTS_PER_LAYER - pinned.length)
  const layer: MapLayer = { nonce, objects: [...made, ...pinned] }
  if (old?.hidden) layer.hidden = true
  if (old?.locked) layer.locked = true
  const next: LocationMap = { ...map, layers: { ...map.layers, [def.id]: layer } }
  if (output.fields) next.fields = { ...map.fields, ...output.fields }
  return next
}

/** Layers that read `layerId`, directly or through another layer. */
export function dependents(type: LocationTypeDef, layerId: string): string[] {
  const hit = new Set([layerId])
  for (const l of generationOrder(type)) if (l.dependsOn.some((d) => hit.has(d))) hit.add(l.id)
  hit.delete(layerId)
  return type.layers.filter((l) => hit.has(l.id)).map((l) => l.id)
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

/** The designer's settings and hand-painted fields of a map, which a new roll keeps. */
function settingsOf(keep: LocationMap): Partial<LocationMap> {
  const out: Partial<LocationMap> = {}
  for (const k of MAP_SETTINGS) if (keep[k] !== undefined) Object.assign(out, { [k]: keep[k] })
  const fields = Object.fromEntries(HAND_FIELDS.flatMap((k) => (keep.fields?.[k] ? [[k, keep.fields[k]]] : [])))
  if (Object.keys(fields).length) out.fields = fields
  return out
}

/**
 * A whole new map for a location; null when its type has no generator. Pinned objects, settings (theme, sliders,
 * masks, lighting, snapshots) and hand-painted fields of `keep` are carried over.
 */
export function generateMap(project: Project, location: Entity, seed: number, keep?: LocationMap | null): LocationMap | null {
  const type = getLocationType(location.type)
  if (!type) return null
  const { w, h } = type.size(location)
  const same = keep?.type === type.id
  let map: LocationMap = { v: 2, type: type.id, seed: seed >>> 0, w, h, layers: same ? keep.layers : {}, ...(same ? settingsOf(keep) : {}) }
  for (const def of generationOrder(type)) {
    if (map.layers[def.id]?.locked) continue
    map = runLayer(def, project, location, map, 0)
  }
  return map
}

function rerun(project: Project, location: Entity, map: LocationMap, layerId: string, bump: boolean): LocationMap {
  const type = getLocationType(map.type)
  const def = type?.layers.find((l) => l.id === layerId)
  if (!type || !def || map.layers[layerId]?.locked) return map
  const nonce = (map.layers[layerId]?.nonce ?? 0) + (bump ? 1 : 0)
  const next = runLayer(def, project, location, map, nonce)
  const layers = { ...next.layers }
  for (const id of dependents(type, layerId)) {
    const l = layers[id]
    if (l && !l.locked) layers[id] = { ...l, stale: true }
  }
  return { ...next, layers }
}

/** A new roll of one layer; pinned objects stay, and the layers that read it are marked stale, not rewritten. */
export const regenerateLayer = (project: Project, location: Entity, map: LocationMap, layerId: string): LocationMap =>
  rerun(project, location, map, layerId, true)

/** Re-runs every stale layer, bottom to top, with its current roll, so it fits the layers below again. */
export function regenerateStale(project: Project, location: Entity, map: LocationMap): LocationMap {
  const type = getLocationType(map.type)
  if (!type) return map
  let out = map
  for (const def of generationOrder(type)) if (out.layers[def.id]?.stale) out = rerun(project, location, out, def.id, false)
  return out
}

export const staleLayers = (map: LocationMap): string[] => Object.entries(map.layers).filter(([, l]) => l.stale).map(([id]) => id)

/** Shows or hides a layer. */
export function setLayerHidden(map: LocationMap, layerId: string, hidden: boolean): LocationMap {
  const l = map.layers[layerId]
  if (!l) return map
  const next: MapLayer = { ...l }
  if (hidden) next.hidden = true
  else delete next.hidden
  return { ...map, layers: { ...map.layers, [layerId]: next } }
}
