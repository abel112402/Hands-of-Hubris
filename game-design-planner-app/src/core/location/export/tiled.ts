import type { Entity } from '../../model/types'
import { mapNav } from '../analysis'
import { toRad } from '../geometry'
import { emits } from '../light'
import { TAG, type NavGrid } from '../nav'
import { kindInfo } from '../objects'
import { getLocationType } from '../registry'
import type { LocationMap, MapObject } from '../types'
import { playerView } from '../visibility'

/**
 * The map as a Tiled map (`.tmj`, Tiled 1.10 JSON), which Tiled opens and Unity (SuperTiled2Unity) and Godot (its
 * Tiled importer) import. It holds the map picture as an image layer, a walkability tile layer (one tile per grid
 * cell: floor, wall, water, door, locked door, slow ground), and one object layer per map layer with every object
 * and its gameplay metadata as Tiled properties. The tileset picture and the map picture are separate files the
 * export writes next to it (`tilesetSvg` draws the tiles).
 */
export const WALK_TILES = [
  { name: 'floor', walkable: true, color: '#e8dcc0' },
  { name: 'wall', walkable: false, color: '#3a2a1c' },
  { name: 'water', walkable: true, color: '#8fb6c4' },
  { name: 'door', walkable: true, color: '#2f8f4e' },
  { name: 'locked door', walkable: false, color: '#b3362a' },
  { name: 'slow', walkable: true, color: '#c98a1a' },
] as const

/** Which walkability tile a cell is (0-based tile id). */
export function walkTile(nav: NavGrid, i: number): number {
  if (!nav.cost[i]) return 1
  const t = nav.tags[i]
  if (t & TAG.locked) return 4
  if (t & TAG.door) return 3
  if (t & TAG.water) return 2
  return nav.cost[i] >= 3 ? 5 : 0
}

/** The tileset picture: the walkability tiles side by side, each `cell` units square. */
export function tilesetSvg(cell: number): string {
  const rects = WALK_TILES.map((t, i) => `<rect x="${i * cell}" y="0" width="${cell}" height="${cell}" fill="${t.color}"/>`).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WALK_TILES.length * cell}" height="${cell}" viewBox="0 0 ${WALK_TILES.length * cell} ${cell}">${rects}</svg>`
}

type Property = { name: string; type: 'string' | 'int' | 'float' | 'bool'; value: string | number | boolean }
const prop = (name: string, value: string | number | boolean): Property => ({
  name,
  type: typeof value === 'boolean' ? 'bool' : typeof value === 'number' ? (Number.isInteger(value) ? 'int' : 'float') : 'string',
  value,
})

/** An object's gameplay metadata as Tiled properties. */
function properties(o: MapObject): Property[] {
  const out: Property[] = [prop('kind', o.kind)]
  if (o.refId) out.push(prop('refId', o.refId))
  if (o.rank) out.push(prop('rank', o.rank))
  if (o.zone) out.push(prop('zone', o.zone))
  if (o.lock) out.push(prop('lock', o.lock))
  if (o.key) out.push(prop('key', o.key))
  if (o.secret) out.push(prop('secret', true))
  if (o.spawn) {
    out.push(prop('spawnRole', o.spawn.role))
    if (o.spawn.refId) out.push(prop('spawnRef', o.spawn.refId))
    if (o.spawn.count) out.push(prop('spawnCount', o.spawn.count))
  }
  if (o.link) out.push(prop('linkLocation', o.link.locationId))
  const light = emits(o)
  if (light) out.push(prop('lightRadius', light.radius), prop('lightColor', light.color), prop('lightIntensity', light.intensity))
  for (const [k, v] of Object.entries(o.props ?? {})) out.push(prop(`props.${k}`, v))
  return out
}

/**
 * One map object as a Tiled object. Boxes: Tiled places a rectangle by its top-left corner and turns it about that
 * corner, so the corner is found by turning the half-size back from the centre. Lines and outlines become
 * polylines and polygons; things without a size become points.
 */
function tiledObject(o: MapObject, id: number) {
  const base = { id, name: o.label ?? '', type: o.kind, visible: true, rotation: 0, properties: properties(o) }
  if (o.points && o.points.length > 1) {
    const [x0, y0] = o.points[0]
    const pts = o.points.map(([x, y]) => ({ x: x - x0, y: y - y0 }))
    const closed = kindInfo(o.kind)?.shape === 'outline' || (!o.ctrl && ['land', 'pond', 'cavern', 'rockpile', 'district', 'region', 'coast', 'patch'].includes(o.kind))
    return { ...base, x: x0, y: y0, width: 0, height: 0, ...(closed ? { polygon: pts } : { polyline: pts }) }
  }
  if (o.w && o.h) {
    const a = toRad(o.rot ?? 0)
    const [hw, hh] = [o.w / 2, o.h / 2]
    const x = o.x - (hw * Math.cos(a) - hh * Math.sin(a))
    const y = o.y - (hw * Math.sin(a) + hh * Math.cos(a))
    return { ...base, x: round(x), y: round(y), width: o.w, height: o.h, rotation: o.rot ?? 0 }
  }
  return { ...base, x: o.x, y: o.y, width: 0, height: 0, point: true }
}
const round = (n: number) => Math.round(n * 100) / 100

/** The `.tmj` map. `imageName` is the map picture's file name next to it; the tileset picture is `hoh-walkability.png`. */
export function tiledMap(location: Entity, stored: LocationMap, o: { player?: boolean; imageName: string }): object {
  const map = o.player ? playerView(stored) : stored
  const nav = mapNav(map)
  const type = getLocationType(map.type)
  const order = type?.layers.map((l) => [l.id, l.label] as const) ?? Object.keys(map.layers).map((id) => [id, id] as const)
  let nextObject = 1
  const objectLayers = order.flatMap(([id, label], i) =>
    map.layers[id]
      ? [{ id: i + 3, name: label, type: 'objectgroup', draworder: 'index', visible: !map.layers[id].hidden, opacity: 1, x: 0, y: 0, objects: map.layers[id].objects.map((x) => tiledObject(x, nextObject++)) }]
      : [],
  )
  return {
    type: 'map',
    version: '1.10',
    tiledversion: '1.10.2',
    orientation: 'orthogonal',
    renderorder: 'right-down',
    infinite: false,
    width: nav.cols,
    height: nav.rows,
    tilewidth: nav.cell,
    tileheight: nav.cell,
    nextlayerid: objectLayers.length + 3,
    nextobjectid: nextObject,
    properties: [prop('format', 'hoh-location/1'), prop('name', String(location.name ?? '')), prop('locationType', map.type), prop('seed', map.seed)],
    tilesets: [
      {
        firstgid: 1,
        name: 'hoh-walkability',
        tilewidth: nav.cell,
        tileheight: nav.cell,
        tilecount: WALK_TILES.length,
        columns: WALK_TILES.length,
        margin: 0,
        spacing: 0,
        image: 'hoh-walkability.png',
        imagewidth: WALK_TILES.length * nav.cell,
        imageheight: nav.cell,
        tiles: WALK_TILES.map((t, id) => ({ id, type: 'walkability', properties: [prop('kind', t.name), prop('walkable', t.walkable)] })),
      },
    ],
    layers: [
      { id: 1, name: 'Map', type: 'imagelayer', image: o.imageName, x: 0, y: 0, offsetx: 0, offsety: 0, opacity: 1, visible: true, repeatx: false, repeaty: false },
      {
        id: 2,
        name: 'Walkability',
        type: 'tilelayer',
        x: 0,
        y: 0,
        width: nav.cols,
        height: nav.rows,
        opacity: 0.5,
        visible: false,
        data: Array.from({ length: nav.cols * nav.rows }, (_, i) => walkTile(nav, i) + 1),
      },
      ...objectLayers,
    ],
  }
}
