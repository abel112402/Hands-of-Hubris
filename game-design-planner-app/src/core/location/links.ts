import type { Entity, Project } from '../model/types'
import { dist, toRad } from './geometry'
import { hash } from './rng'
import { mapOf } from './schema'
import type { LocationMap, MapObject, MapPoint as Pt } from './types'

/**
 * Maps inside maps: a house on a village map opens its floor plan, a cellar door opens the dungeon below. The
 * object on the outer map carries `link.locationId`; the inner location names its `parent`. The inner map's way in
 * (its front door, its stairs up) links back. When the inner map is generated, its entrance is placed to match the
 * outer object: a house's front door faces the road the house stands on. The outer object's fingerprint is kept
 * (`anchorStamp`), so a later change to it can be noticed.
 */
const LOCATIONS = (project: Project): Entity[] => {
  const list = project.documents['design.world']?.data.locations
  return Array.isArray(list) ? list : []
}

export const locationById = (project: Project, id: unknown): Entity | undefined => LOCATIONS(project).find((l) => l.id === id)

/** The chain of locations from the outermost down to `location` itself. Stops at a loop. */
export function parentChain(project: Project, location: Entity): Entity[] {
  const out: Entity[] = [location]
  for (let at = locationById(project, location.parent); at && !out.includes(at); at = locationById(project, at.parent)) out.unshift(at)
  return out
}

/** Locations that name `location` as their parent. */
export const childrenOf = (project: Project, location: Entity): Entity[] => LOCATIONS(project).filter((l) => l.parent === location.id)

/** Every object of a map that opens another location. */
export const linkedObjects = (map: LocationMap): MapObject[] => Object.values(map.layers).flatMap((l) => l.objects).filter((o) => o.link)

export type Anchor = {
  parent: Entity
  parentMap: LocationMap
  /** The object on the parent map that opens this location. */
  object: MapObject
  /** Which side of the inner map the way in should be on, seen from above (north up). */
  side: 'south' | 'north' | 'east' | 'west'
  stamp: number
}

/** A fingerprint of the parts of an object that decide where an inner map's entrance goes. */
export const stampOf = (o: MapObject): number => hash(o.id, Math.round(o.x), Math.round(o.y), Math.round(o.rot ?? 0), Math.round(o.w ?? 0), Math.round(o.h ?? 0)) >>> 0

/** The nearest point of any road on a map to `p`. */
function nearestRoad(map: LocationMap, p: Pt): Pt | null {
  let best: { at: Pt; d: number } | null = null
  for (const o of Object.values(map.layers).flatMap((l) => l.objects)) {
    if (o.kind !== 'road' || !o.points) continue
    for (let i = 1; i < o.points.length; i++) {
      const [a, b] = [o.points[i - 1], o.points[i]]
      const [dx, dy] = [b[0] - a[0], b[1] - a[1]]
      const len2 = dx * dx + dy * dy
      const t = len2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2)) : 0
      const q: Pt = [a[0] + dx * t, a[1] + dy * t]
      const d = dist(p, q)
      if (!best || d < best.d) best = { at: q, d }
    }
  }
  return best && best.d < 400 ? best.at : null
}

/**
 * Where a location sits on its parent's map, and which way its entrance should face: for a building, towards the
 * nearest road (in the building's own frame, so a house turned along its road still has its door on the road
 * side); otherwise the parent object's facing, south by default.
 */
export function anchorOf(project: Project, location: Entity): Anchor | null {
  const parent = locationById(project, location.parent)
  const parentMap = parent && mapOf(parent)
  if (!parent || !parentMap) return null
  const object = linkedObjects(parentMap).find((o) => o.link!.locationId === location.id)
  if (!object) return null
  let side: Anchor['side'] = 'south'
  const road = nearestRoad(parentMap, [object.x, object.y])
  if (road && dist(road, [object.x, object.y]) > 0.5) {
    // The direction to the road, turned into the building's frame.
    const a = -toRad(object.rot ?? 0)
    const [dx, dy] = [road[0] - object.x, road[1] - object.y]
    const [lx, ly] = [dx * Math.cos(a) - dy * Math.sin(a), dx * Math.sin(a) + dy * Math.cos(a)]
    side = Math.abs(lx) > Math.abs(ly) ? (lx > 0 ? 'east' : 'west') : ly > 0 ? 'south' : 'north'
  }
  return { parent, parentMap, object, side, stamp: stampOf(object) }
}

/** Whether the parent object changed since the inner map was generated (null when there is no parent object). */
export function anchorMoved(project: Project, location: Entity, map: LocationMap): boolean | null {
  const anchor = anchorOf(project, location)
  if (!anchor || map.anchorStamp === undefined) return null
  return anchor.stamp !== map.anchorStamp
}

/** The object on an inner map that leads back out: its front door, else its first stairs. */
export function wayOut(map: LocationMap): MapObject | undefined {
  const all = Object.values(map.layers).flatMap((l) => l.objects)
  return all.find((o) => o.kind === 'door' && o.props?.entrance) ?? all.find((o) => o.kind === 'stairs')
}

/**
 * After generating an inner map: the way out links back to the parent, and the anchor's fingerprint is kept.
 * Maps without a parent are returned unchanged.
 */
export function linkBack(project: Project, location: Entity, map: LocationMap): LocationMap {
  const parent = locationById(project, location.parent)
  if (!parent) return map
  const anchor = anchorOf(project, location)
  const out = wayOut(map)
  let next = map
  if (out && !out.pinned && out.link?.locationId !== parent.id) {
    const layers = Object.fromEntries(
      Object.entries(map.layers).map(([id, l]) => [id, l.objects.includes(out) ? { ...l, objects: l.objects.map((o) => (o === out ? { ...o, link: { locationId: parent.id } } : o)) } : l]),
    )
    next = { ...map, layers }
  }
  if (anchor && next.anchorStamp !== anchor.stamp) next = { ...next, anchorStamp: anchor.stamp }
  return next
}

/** Which kind of location a linked map of an object should be by default. */
export function defaultChildType(o: MapObject, parentType: string): string {
  if (o.kind === 'house' || o.kind === 'landmark') return 'Dwelling'
  if (o.kind === 'site') return String(o.props?.type ?? 'Village')
  if (o.kind === 'stairs' || o.kind === 'door') return parentType === 'Dwelling' ? 'Dungeon' : 'Cave'
  return 'Dwelling'
}

/** Kinds that can open a linked map. */
export const LINKABLE = new Set(['house', 'landmark', 'door', 'stairs', 'site', 'gate'])
