import type { Entity, Project } from '../model/types'
import { staleLayers } from './generate'
import { lightGrid, type LightGrid } from './light'
import { buildNav, reachable, type NavGrid } from './nav'
import { inRoom } from './rooms'
import { getLocationType } from './registry'
import { mapOf } from './schema'
import { checkPlan } from './architecture'
import { buildGraph, checkLocks, metrics, nodeAt, type KeyAt, type LockCheck, type MapGraph } from './topology'
import { privacyOf } from './types/dwelling'
import type { LocationMap, MapObject, MapPoint as Pt, NavSpec } from './types'

/** Questions about the Locations section as a whole, for hints and the guide. Pure reads of the project. */
export const LOCATIONS_DOC = 'design.world'

export function locationsOf(project: Project): Entity[] {
  const list = project.documents[LOCATIONS_DOC]?.data.locations
  return Array.isArray(list) ? list : []
}

/** The location's map, when it has one that was generated for its current type. */
export function currentMap(location: Entity): LocationMap | null {
  const map = mapOf(location)
  return map && map.type === location.type ? map : null
}

export const untypedLocations = (project: Project) => locationsOf(project).filter((l) => !getLocationType(l.type))
/** Locations whose type can be drawn but that have no map yet (or one left over from another type). */
export const unmappedLocations = (project: Project) => locationsOf(project).filter((l) => getLocationType(l.type) && !currentMap(l))
/** Locations whose map has layers waiting for "Update out of date". */
export const staleLocations = (project: Project) =>
  locationsOf(project).filter((l) => {
    const map = currentMap(l)
    return !!map && staleLayers(map).length > 0
  })
export const locationsWithoutBiome = (project: Project) => locationsOf(project).filter((l) => !l.biome)
/** Whether any object on the location's map was placed or changed by hand. */
export const hasHandEdits = (location: Entity) => Object.values(currentMap(location)?.layers ?? {}).some((layer) => layer.objects.some((o) => o.pinned))

// ---------- Gameplay structure of one map (plans/LOCATIONS_V2_PLAN.md) ----------

const DEFAULT_NAV: NavSpec = { cell: 10, open: true }
const navCache = new WeakMap<LocationMap, NavGrid>()
const graphCache = new WeakMap<LocationMap, MapGraph | null>()

/** The map's walkability grid. Cached per map object, which is immutable in the store. */
export function mapNav(map: LocationMap): NavGrid {
  let g = navCache.get(map)
  if (!g) {
    const type = getLocationType(map.type)
    g = buildNav(map, type?.nav ?? DEFAULT_NAV, type?.layers.map((l) => l.id) ?? [])
    navCache.set(map, g)
  }
  return g
}

const lightCache = new WeakMap<LocationMap, LightGrid>()
/** Light over the map's walkability grid (light.ts). Cached per map object. */
export function mapLight(map: LocationMap): LightGrid {
  let g = lightCache.get(map)
  if (!g) lightCache.set(map, (g = lightGrid(map, mapNav(map))))
  return g
}

/** The map's room graph; null for types that are not made of rooms. */
export function mapGraph(map: LocationMap): MapGraph | null {
  if (!graphCache.has(map)) {
    const spec = getLocationType(map.type)?.topology
    graphCache.set(map, spec ? buildGraph(map, spec) : null)
  }
  return graphCache.get(map) ?? null
}

/** Where a visitor starts: the entrance of the room graph, else entrance stairs, else the middle of the map. */
export function entryPoint(map: LocationMap): Pt {
  const g = mapGraph(map)
  const node = g?.nodes.find((n) => n.id === g.entrance)
  if (node) return [node.x, node.y]
  const stairs = Object.values(map.layers).flatMap((l) => l.objects).find((o) => o.kind === 'stairs')
  return stairs ? [stairs.x, stairs.y] : [map.w / 2, map.h / 2]
}

/** Keys on the map and the room each lies in. */
export function keysOnMap(map: LocationMap): KeyAt[] {
  const spec = getLocationType(map.type)?.topology
  if (!spec) return []
  return Object.values(map.layers)
    .flatMap((l) => l.objects)
    .flatMap((o) => {
      const node = o.key ? nodeAt(map, spec, [o.x, o.y]) : undefined
      return o.key && node ? [{ key: o.key, node }] : []
    })
}

/** Whether every lock on the map can be opened with a key found before it; null without a room graph. */
export function lockCheck(map: LocationMap): LockCheck | null {
  const g = mapGraph(map)
  return g && checkLocks(g, keysOnMap(map))
}

/** One problem with a map, and the objects it is about (the first is the one to select). */
export type MapCheck = { id: string; text: string; objects: string[] }

/**
 * What a map's own rules say is wrong with it as it stands, hand edits included: house rules for a dwelling
 * (architecture.ts), locks whose key cannot be reached in time, and rooms no way leads into. Empty when all is well.
 */
export function mapChecks(location: Entity, map: LocationMap): MapCheck[] {
  const all = Object.values(map.layers).flatMap((l) => l.objects)
  // Creatures, people and keys one cannot walk to (locks open, secrets known), on every kind of map.
  const stranded: MapCheck[] = unreachableObjects(map, ['marker', 'key']).map((o) => ({
    id: `reach-${o.id}`,
    text: `${o.label ?? (o.kind === 'key' ? 'A key' : 'A creature')} cannot be reached from the entrance.`,
    objects: [o.id],
  }))
  const graph = mapGraph(map)
  if (!graph) return stranded
  const unreachable = metrics(graph).unreachable
  const name = (id: string) => String(all.find((o) => o.id === id)?.label ?? 'a room')
  if (map.type === 'Dwelling') {
    const rooms = all.filter((o) => o.kind === 'room')
    return [...checkPlan(graph, rooms, privacyOf(location), unreachable).map((issue, i) => ({ id: `${issue.rule}-${i}`, text: issue.text, objects: issue.rooms })), ...stranded]
  }
  const out: MapCheck[] = unreachable.map((id) => ({ id: `unreachable-${id}`, text: `Nothing leads into ${name(id) === 'a room' ? 'a room' : `the ${name(id)}`}.`, objects: [id] }))
  out.push(...stranded)
  // The boss waits in the boss room.
  const bossRoom = all.find((o) => o.kind === 'chamber' && o.props?.role === 'boss')
  for (const boss of all.filter((o) => o.kind === 'marker' && o.props?.type === 'boss')) {
    if (bossRoom && !inRoom(bossRoom, [boss.x, boss.y])) out.push({ id: `boss-${boss.id}`, text: `${boss.label ?? 'The boss'} is not in the boss room.`, objects: [boss.id, bossRoom.id] })
  }
  const locks = lockCheck(map)
  if (locks) {
    for (const lock of locks.stuck) {
      const doors = graph.edges.filter((e) => e.lock === lock).flatMap((e) => e.via)
      out.push({ id: `lock-${lock}`, text: `The ${lock} lock cannot be opened: its key is missing or lies behind it.`, objects: doors })
    }
  }
  return out
}

/**
 * Objects of the given kinds a visitor cannot walk to from the entry point (locks open, secrets known). An object
 * counts as reached when a reached cell lies on it or right next to it.
 */
export function unreachableObjects(map: LocationMap, kinds: string[]): MapObject[] {
  const nav = mapNav(map)
  const seen = reachable(nav, entryPoint(map))
  const near = (o: MapObject) => {
    const r = Math.hypot(o.w ?? 0, o.h ?? 0) / 2 + nav.cell * 1.5
    const [c0, c1] = [Math.max(0, Math.floor((o.x - r) / nav.cell)), Math.min(nav.cols - 1, Math.floor((o.x + r) / nav.cell))]
    const [r0, r1] = [Math.max(0, Math.floor((o.y - r) / nav.cell)), Math.min(nav.rows - 1, Math.floor((o.y + r) / nav.cell))]
    for (let row = r0; row <= r1; row++) {
      for (let c = c0; c <= c1; c++) {
        const i = row * nav.cols + c
        if (seen[i] && Math.hypot((c + 0.5) * nav.cell - o.x, (row + 0.5) * nav.cell - o.y) <= r) return true
      }
    }
    return false
  }
  return Object.values(map.layers)
    .flatMap((l) => l.objects)
    .filter((o) => kinds.includes(o.kind) && !near(o))
}
