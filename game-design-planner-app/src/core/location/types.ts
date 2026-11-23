import type { Entity, Project } from '../model/types'
import type { Rng } from './rng'

/**
 * Location maps: a layered, procedurally generated and hand-editable top-down map stored on a location entity
 * (`location.map`). See plans/LOCATIONS_MAP_PLAN.md.
 */
export const LOCATION_TYPES_ALL = ['World', 'City', 'Village', 'Dungeon', 'Cave', 'Dwelling'] as const
export type LocationTypeId = (typeof LOCATION_TYPES_ALL)[number]

export type MapPoint = [number, number]

/** One drawable thing. Box-like objects are centred on (x, y); `rot` is in degrees. */
export type MapObject = {
  id: string
  /** Glyph id (see render/glyphs.ts): 'house', 'road', 'tree', … */
  kind: string
  x: number
  y: number
  w?: number
  h?: number
  rot?: number
  /** Polylines and polygons (roads, rivers, walls). */
  points?: MapPoint[]
  /** The few waypoints a curve was drawn through; dragging one redraws `points`. */
  ctrl?: MapPoint[]
  label?: string
  /** Entry this object stands for (e.g. a Town building for a landmark). */
  refId?: string
  /** Glyph variants: roof tone, crop, wall style. */
  props?: Record<string, string | number | boolean>
  /** Survives regeneration of its layer. Set when the object is edited by hand. */
  pinned?: true
  // Gameplay metadata (plans/LOCATIONS_V2_PLAN.md). All optional; a v1 map has none of them.
  /** Road hierarchy: trade route, street or alley. */
  rank?: RoadRank
  /** Id of the `district` object the object stands in. */
  zone?: string
  /**
   * Glued to another object (attach.ts): `t` is the position along the host's outline or line (0–1), `side` and
   * `off` how far to which side of it, `rot` the host's direction there when it was attached.
   */
  attach?: { to: string; t: number; side?: number; off?: number; rot?: number }
  /** Opens another location's map (house → floor plan, cellar door → dungeon). */
  link?: { locationId: string; anchor?: string }
  /** Lock id on a door, gate or chest; the object with the same `key` opens it. */
  lock?: string
  key?: string
  /** Left out of the player version of an export. */
  secret?: true
  light?: { radius: number; color?: string; intensity?: number }
  /** `route`: for an enemy, the id of a line on the same map (a path, a road) it patrols. */
  spawn?: { role: SpawnRole; refId?: string; count?: number; route?: string }
}
export type NewMapObject = Omit<MapObject, 'id'>

export const ROAD_RANKS = ['main', 'street', 'alley'] as const
export type RoadRank = (typeof ROAD_RANKS)[number]
/** `player`: where the player starts. `item`: an item lying here to pick up (`refId` = Items & Crafting item, `count` = amount). */
export const SPAWN_ROLES = ['enemy', 'npc', 'merchant', 'boss', 'player', 'item'] as const
export type SpawnRole = (typeof SPAWN_ROLES)[number]
export const ZONE_KINDS = ['residential', 'market', 'industrial', 'military', 'sacred'] as const
export type ZoneKind = (typeof ZONE_KINDS)[number]
export const TIMES_OF_DAY = ['day', 'dusk', 'night'] as const

/**
 * A grid of small values over the map (cave rock, painted terrain, walkability overrides), run-length encoded
 * by `raster.ts`. Cell (c, r) covers x ∈ [c·cell, (c+1)·cell).
 */
export type RasterField = { cell: number; cols: number; rows: number; rle: string }
/** A region whose contents survive every regeneration. */
export type MapMask = { id: string; poly: MapPoint[]; label?: string }
export type MapEnv = { /** Direction the sunlight comes from, degrees clockwise from north. */ sun?: number; time?: (typeof TIMES_OF_DAY)[number] }
export type MapSnapshot = { id: string; label: string; at: string; map: Omit<LocationMap, 'snapshots'> }

export type MapLayer = {
  /** Bumped by "regenerate this layer"; part of the layer's random seed. */
  nonce: number
  hidden?: true
  locked?: true
  /** A layer this one reads has changed since it was generated. */
  stale?: true
  objects: MapObject[]
}

/** Version 2 adds the optional fields after `layers`; a stored version 1 map is read as version 2 (see schema.ts). */
export type LocationMap = {
  v: 2
  /** Location type the map was generated for. */
  type: string
  seed: number
  w: number
  h: number
  /** Keyed by LayerDef.id; drawing order comes from the type definition. */
  layers: Record<string, MapLayer>
  /** MapTheme id; the type's default when missing. */
  theme?: string
  /** Generator slider values (density, irregularity, depth, …). */
  params?: Record<string, number>
  /** Keyed by field id: 'rock', 'terrain', 'navOverride'. */
  fields?: Record<string, RasterField>
  masks?: MapMask[]
  env?: MapEnv
  snapshots?: MapSnapshot[]
  /**
   * For a map inside another (a house in a town, a cellar under a house): a fingerprint of the object on the
   * parent map it was generated for. When that object changes, the entrance may no longer match (links.ts).
   */
  anchorStamp?: number
}

/** Map settings a new roll keeps: they are the designer's choices, not generated content. */
export const MAP_SETTINGS = ['theme', 'params', 'masks', 'env', 'snapshots'] as const
/** Raster fields painted by hand, which a new roll keeps too. */
export const HAND_FIELDS = ['navOverride'] as const

export type GenContext = {
  project: Project
  /** The input fields. */
  location: Entity
  /** Layers generated so far, including manual edits. */
  map: LocationMap
  /** This layer's own random stream. */
  rand: Rng
}

/** What a layer makes besides objects: raster fields it owns, replaced whenever the layer is generated again. */
export type LayerOutput = { objects: NewMapObject[]; fields?: Record<string, RasterField> }

export type LayerDef = {
  id: string
  label: string
  /** Layers whose objects this one reads; they become stale when one of these changes. */
  dependsOn: string[]
  /** The layer's objects; a layer that owns raster fields (a cave's rock) returns them too. */
  generate: (ctx: GenContext) => NewMapObject[] | LayerOutput
  /** Object kinds the user may add to this layer by hand. */
  addable?: string[]
}

/** Where to find the parts of a map's room graph (see topology.ts). */
export type TopologySpec = {
  rooms: { layer: string; kind: string }
  /** Lines that join the rooms they run through. */
  corridors?: { layer: string; kind: string }
  /** Doors on corridors carry their lock to the corridor's link; doors between rooms are links themselves. */
  doors?: { layer: string; kind: string }
  /** The rooms list their own links (`props.node`, `props.links`), as a cave's chambers do. */
  planned?: boolean
}

/** How the walkability grid (nav.ts) is laid over a map. */
export type NavSpec = {
  /** Cell size in map units. */
  cell: number
  /** Ground is walkable unless something blocks it (outdoors), or blocked unless something opens it (underground). */
  open: boolean
}

export type LocationTypeDef = {
  id: LocationTypeId
  size: (location: Entity) => { w: number; h: number }
  /** Bottom to top. */
  layers: LayerDef[]
  /** Types made of rooms say where the rooms and their links are. */
  topology?: TopologySpec
  /** Defaults to open ground with 10-unit cells. */
  nav?: NavSpec
  /**
   * Repairs the map after `before` was edited by hand into `after` (heal.ts): corridors that follow their rooms,
   * neighbouring rooms that follow a shared wall. Must not move pinned objects. Returns the map unchanged when there
   * is nothing to do.
   */
  heal?: (map: LocationMap, before: MapObject, after: MapObject) => LocationMap
  /** Redraws what is drawn from a raster field after the field was painted by hand (a cave's outline from its rock). */
  fromField?: (map: LocationMap, fieldId: string) => LocationMap
  /** Ready-made groups of objects the user can drop on a layer. */
  stamps?: Stamp[]
  /** Sliders for the generators (stored in `map.params`); each lists the layers it changes. */
  params?: ParamDef[]
}

/** A generator slider: a number between `min` and `max`, read by the generators of `layers`. */
export type ParamDef = { id: string; label: string; min: number; max: number; step: number; default: number; layers: string[]; help?: string }

/** A ready-made group of objects for a layer: a round hall, a cluster of houses, a pond. Made around a point. */
export type Stamp = { id: string; label: string; layer: string; make: (x: number, y: number) => NewMapObject[] }
