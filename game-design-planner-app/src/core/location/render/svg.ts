import type { Entity, Project } from '../../model/types'
import { getLocationType } from '../registry'
import { mapOf } from '../schema'
import type { LocationMap, MapLayer } from '../types'
import { ambientOf } from '../light'
import { playerView } from '../visibility'
import { CARD, cardSize, frame, frameDefs, paper } from './frame'
import { GLYPHS } from './glyphs'
import { el, toSvgString, type SvgNode } from './node'
import { themeOf, type MapTheme } from './theme'

const biomeName = (project: Project, location: Entity): string => {
  const biomes: Entity[] = project.documents['design.world']?.data.biomes ?? []
  return String(biomes.find((b) => b.id === location.biome)?.name ?? '')
}

/** One layer: every casing first, then every object, each object in its own group so the editor can find it. */
function layerNode(id: string, layer: MapLayer, theme: MapTheme): SvgNode {
  // A theme may draw some kinds its own way.
  const glyph = (kind: string) => theme.glyphs?.[kind] ?? GLYPHS[kind]
  const known = layer.objects.filter((o) => glyph(o.kind))
  return el('g', { 'data-layer': id }, [
    ...known.flatMap((o) => glyph(o.kind)!.under?.(o, theme) ?? []),
    ...known.map((o) => el('g', { 'data-obj': o.id }, glyph(o.kind)!.draw(o, theme))),
  ])
}

export type MapRender = { w: number; h: number; node: SvgNode }

/** A wash over the whole map for the time of day; none by day. */
const TIME_TINT: Record<string, { fill: string; opacity: number }> = { dusk: { fill: '#c8642a', opacity: 0.16 }, night: { fill: '#14203d', opacity: 0.42 } }

export type RenderOptions = {
  uid?: string
  theme?: MapTheme
  /** The players' version: secrets, creatures, traps and keys left out (visibility.ts). */
  player?: boolean
  /** Only the map area, without the card frame, title and footer (for VTT and engine pictures). */
  bare?: boolean
}

/**
 * The whole card as an SVG tree. Layers of the map's type are drawn bottom to top; hidden ones are skipped.
 * Shadows fall away from the map's sun, and dusk and night tint the map.
 */
export function renderMap(project: Project, location: Entity, stored: LocationMap, o: RenderOptions = {}): MapRender {
  const map = o.player ? playerView(stored) : stored
  const base = o.theme ?? themeOf(map.theme)
  // Lights glow by how dark the place is: little in daylight outdoors, fully underground or at night.
  const glow = Math.min(1, Math.max(0.2, 1.1 - ambientOf(map)))
  const theme: MapTheme = { ...base, glow, ...(map.env?.sun !== undefined ? { sun: map.env.sun } : {}) }
  const uid = o.uid ?? 'loc'
  const card = cardSize(map.w, map.h)
  const order = getLocationType(map.type)?.layers.map((l) => l.id) ?? Object.keys(map.layers)
  const layers = order.flatMap((id) => (map.layers[id] && !map.layers[id].hidden ? [layerNode(id, map.layers[id], theme)] : []))
  const tint = TIME_TINT[map.env?.time ?? 'day']
  if (tint) layers.push(el('rect', { x: 0, y: 0, width: map.w, height: map.h, fill: tint.fill, opacity: tint.opacity, 'pointer-events': 'none' }))
  const subtitle = [map.type, biomeName(project, location)].filter(Boolean).join(' · ')
  const node = el('svg', { xmlns: 'http://www.w3.org/2000/svg', viewBox: o.bare ? `${CARD.side} ${CARD.top} ${map.w} ${map.h}` : `0 0 ${card.w} ${card.h}`, role: 'img' }, [
    el('title', {}, `${String(location.name ?? '')} (${subtitle})`),
    frameDefs(theme, uid, map.w, map.h, map.seed),
    ...paper(theme, uid, map.w, map.h),
    el('g', { transform: `translate(${CARD.side} ${CARD.top})`, 'clip-path': `url(#${uid}-map)` }, layers),
    ...frame(theme, map.w, map.h, { title: String(location.name ?? ''), subtitle, seed: map.seed }),
  ])
  return o.bare ? { w: map.w, h: map.h, node } : { ...card, node }
}

/** A standalone SVG file of a location's map (thumbnails and the export); null when it has no map. */
export function locationSvg(project: Project, location: Entity, o: Pick<RenderOptions, 'player' | 'bare'> = {}): string | null {
  const map = mapOf(location)
  if (!map) return null
  const r = renderMap(project, location, map, o)
  return toSvgString({ ...r.node, attrs: { ...r.node.attrs, width: r.w, height: r.h } })
}
