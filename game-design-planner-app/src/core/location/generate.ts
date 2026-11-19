import type { Entity, Project } from '../model/types'
import { dist, inPolygon, radiusOf } from './geometry'
import { kindInfo } from './objects'
import { dependents, generationOrder, withId } from './order'
import { linkBack } from './links'
import { getLocationType } from './registry'
import { hash, makeRng } from './rng'
import { MAX_OBJECTS_PER_LAYER } from './schema'
import { HAND_FIELDS, MAP_SETTINGS, type LayerDef, type LocationMap, type MapLayer, type MapObject, type NewMapObject } from './types'

/**
 * Runs the layer generators of a location type. All functions are pure: they return a new map and never touch the
 * one passed in, so the caller can store the result through `useStore.mutate` as one undo step.
 */
export { withId }

/** A generated box-like object gives way to a pinned one it would sit on. Lines and outlines never do. */
const blockedBy = (o: MapObject, pinned: MapObject[]) =>
  !o.points && pinned.some((p) => !p.points && dist([o.x, o.y], [p.x, p.y]) < (Math.max(radiusOf(o), 6) + Math.max(radiusOf(p), 6)) * 0.8)

/**
 * Whether an object stands in one of the map's masks. Scenery (rock, ground, districts) is never masked: it is
 * regenerated whole.
 */
export function masked(map: LocationMap, o: MapObject | NewMapObject): boolean {
  if (!map.masks?.length || o.kind === 'district' || kindInfo(o.kind)?.shape === 'backdrop') return false
  return map.masks.some((m) => inPolygon([o.x, o.y], m.poly))
}

/**
 * Runs one layer's generator and returns the map with that layer (and any fields it owns) replaced. Pinned objects
 * and objects inside a mask stay; new objects that would sit on them, or inside a mask, are left out.
 */
function runLayer(def: LayerDef, project: Project, location: Entity, map: LocationMap, nonce: number): LocationMap {
  const old = map.layers[def.id]
  const pinned = (old?.objects ?? []).filter((o) => o.pinned || masked(map, o))
  const rand = makeRng(hash(map.seed, def.id, nonce))
  const result = def.generate({ project, location, map, rand })
  const output = Array.isArray(result) ? { objects: result } : result
  const made = output.objects
    .filter((o) => !masked(map, o))
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

export { dependents, generationOrder }

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
  return linkBack(project, location, map)
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
  return linkBack(project, location, { ...next, layers })
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

/**
 * The map with generator sliders set: the layers those sliders feed are generated again with their current roll
 * (so only the slider's effect shows), then everything drawn from them is brought up to date. Used for the live
 * preview while a slider moves, and committed when it is let go.
 */
export function withParams(project: Project, location: Entity, map: LocationMap, change: Record<string, number>): LocationMap {
  const type = getLocationType(map.type)
  if (!type) return map
  const params = { ...map.params, ...change }
  let out: LocationMap = { ...map, params }
  const touched = new Set((type.params ?? []).filter((p) => p.id in change).flatMap((p) => p.layers))
  for (const def of generationOrder(type)) if (touched.has(def.id)) out = rerun(project, location, out, def.id, false)
  return regenerateStale(project, location, out)
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
