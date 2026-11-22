import type { Entity } from '../../model/types'
import { mapGraph, mapLight, mapNav } from '../analysis'
import { emits } from '../light'
import { TAG } from '../nav'
import { encodeRle } from '../raster'
import { getLocationType } from '../registry'
import type { LocationMap, MapObject } from '../types'
import { playerView } from '../visibility'

/**
 * The map as data for a game engine (format `hoh-location`, version 1): every object with its gameplay metadata,
 * grouped by layer in drawing order, the room graph, and the walkability and light grids. Coordinates are map
 * units with the origin top left, x right, y down; box objects are given by their centre. Map units have no fixed
 * size: a playable prototype turns them into metres by Technical Architecture › Playable prototype › Map scale, or
 * else one `nav.cell` per metre (the Unity greybox and prototype scene; x east, y south).
 *
 * Grids are run-length encoded (raster.ts): a value 0–51 is one letter A–z, a run is its length then the letter.
 * `nav.cost`: 0 blocked, else the cost of stepping in (1 easy). `nav.tags`: bit flags (1 water, 2 door, 4 locked,
 * 8 secret). `light.level`: 0 (dark) to 10 (full light).
 */
export const LOCATION_JSON_FORMAT = 'hoh-location'
export const LOCATION_JSON_VERSION = 1

export type ExportObject = Omit<MapObject, 'pinned' | 'ctrl'> & { layer: string }

export type LocationJson = {
  format: typeof LOCATION_JSON_FORMAT
  version: typeof LOCATION_JSON_VERSION
  name: string
  type: string
  size: { w: number; h: number }
  seed: number
  layers: { id: string; label: string; objects: ExportObject[] }[]
  /** Rooms and their links (doors and corridors), with locks; null for maps that are not made of rooms. */
  graph: { entrance?: string; nodes: { id: string; x: number; y: number; role: string; label?: string }[]; edges: { a: string; b: string; lock?: string; secret?: true }[] } | null
  /** Shortcuts for the engine: every spawn point, light, lock and key. */
  spawns: { id: string; role: string; refId?: string; count?: number; x: number; y: number; label?: string }[]
  lights: { id: string; x: number; y: number; radius: number; color: string; intensity: number }[]
  locks: { id: string; lock: string; x: number; y: number }[]
  keys: { id: string; key: string; x: number; y: number }[]
  nav: { cell: number; cols: number; rows: number; cost: string; tags: string; legend: typeof TAG }
  light: { cell: number; cols: number; rows: number; level: string }
}

/** The engine's copy of an object: everything but what only the editor needs (pins, curve waypoints). */
function exported(o: MapObject, layer: string): ExportObject {
  const out: ExportObject & { pinned?: true; ctrl?: unknown } = { ...o, layer }
  delete out.pinned
  delete out.ctrl
  return out
}

export function locationJson(location: Entity, stored: LocationMap, o: { player?: boolean } = {}): LocationJson {
  const map = o.player ? playerView(stored) : stored
  const type = getLocationType(map.type)
  const order = type?.layers.map((l) => [l.id, l.label] as const) ?? Object.keys(map.layers).map((id) => [id, id] as const)
  const layers = order.flatMap(([id, label]) => (map.layers[id] ? [{ id, label, objects: map.layers[id].objects.map((x) => exported(x, id)) }] : []))
  const all = layers.flatMap((l) => l.objects)
  const graph = mapGraph(map)
  const nav = mapNav(map)
  const light = mapLight(map)
  return {
    format: LOCATION_JSON_FORMAT,
    version: LOCATION_JSON_VERSION,
    name: String(location.name ?? ''),
    type: map.type,
    size: { w: map.w, h: map.h },
    seed: map.seed,
    layers,
    graph: graph && {
      ...(graph.entrance ? { entrance: graph.entrance } : {}),
      nodes: graph.nodes.map((n) => ({ id: n.id, x: n.x, y: n.y, role: n.role, ...(n.label ? { label: n.label } : {}) })),
      edges: graph.edges.map((e) => ({ a: e.a, b: e.b, ...(e.lock ? { lock: e.lock } : {}), ...(e.secret ? { secret: true as const } : {}) })),
    },
    spawns: all.flatMap((x) => (x.spawn ? [{ id: x.id, role: x.spawn.role, ...(x.spawn.refId ? { refId: x.spawn.refId } : {}), ...(x.spawn.count ? { count: x.spawn.count } : {}), x: x.x, y: x.y, ...(x.label ? { label: x.label } : {}) }] : [])),
    lights: all.flatMap((x) => {
      const e = emits(x)
      return e ? [{ id: x.id, x: x.x, y: x.y, radius: e.radius, color: e.color, intensity: e.intensity }] : []
    }),
    locks: all.flatMap((x) => (x.lock ? [{ id: x.id, lock: x.lock, x: x.x, y: x.y }] : [])),
    keys: all.flatMap((x) => (x.key ? [{ id: x.id, key: x.key, x: x.x, y: x.y }] : [])),
    nav: { cell: nav.cell, cols: nav.cols, rows: nav.rows, cost: encodeRle(Array.from(nav.cost, (c) => Math.min(51, c))), tags: encodeRle(nav.tags), legend: TAG },
    light: { cell: light.cell, cols: light.cols, rows: light.rows, level: encodeRle(Array.from(light.level, (v) => Math.round(v * 10))) },
  }
}
