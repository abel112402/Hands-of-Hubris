import type { Entity, Project } from '../../model/types'
import { getLocationType } from '../registry'
import { mapOf } from '../schema'
import type { LocationMap, MapLayer } from '../types'
import { CARD, cardSize, frame, frameDefs, paper } from './frame'
import { GLYPHS } from './glyphs'
import { el, toSvgString, type SvgNode } from './node'
import { PARCHMENT, type MapTheme } from './theme'

const biomeName = (project: Project, location: Entity): string => {
  const biomes: Entity[] = project.documents['design.world']?.data.biomes ?? []
  return String(biomes.find((b) => b.id === location.biome)?.name ?? '')
}

/** One layer: every casing first, then every object, each object in its own group so the editor can find it. */
function layerNode(id: string, layer: MapLayer, theme: MapTheme): SvgNode {
  const known = layer.objects.filter((o) => GLYPHS[o.kind])
  return el('g', { 'data-layer': id }, [
    ...known.flatMap((o) => GLYPHS[o.kind].under?.(o, theme) ?? []),
    ...known.map((o) => el('g', { 'data-obj': o.id }, GLYPHS[o.kind].draw(o, theme))),
  ])
}

export type MapRender = { w: number; h: number; node: SvgNode }

/** The whole card as an SVG tree. Layers of the map's type are drawn bottom to top; hidden ones are skipped. */
export function renderMap(project: Project, location: Entity, map: LocationMap, o: { uid?: string; theme?: MapTheme } = {}): MapRender {
  const theme = o.theme ?? PARCHMENT
  const uid = o.uid ?? 'loc'
  const card = cardSize(map.w, map.h)
  const order = getLocationType(map.type)?.layers.map((l) => l.id) ?? Object.keys(map.layers)
  const layers = order.flatMap((id) => (map.layers[id] && !map.layers[id].hidden ? [layerNode(id, map.layers[id], theme)] : []))
  const subtitle = [map.type, biomeName(project, location)].filter(Boolean).join(' · ')
  const node = el('svg', { xmlns: 'http://www.w3.org/2000/svg', viewBox: `0 0 ${card.w} ${card.h}`, role: 'img' }, [
    el('title', {}, `${String(location.name ?? '')} (${subtitle})`),
    frameDefs(theme, uid, map.w, map.h, map.seed),
    ...paper(theme, uid, map.w, map.h),
    el('g', { transform: `translate(${CARD.side} ${CARD.top})`, 'clip-path': `url(#${uid}-map)` }, layers),
    ...frame(theme, map.w, map.h, { title: String(location.name ?? ''), subtitle, seed: map.seed }),
  ])
  return { ...card, node }
}

/** A standalone SVG file of a location's map (thumbnails and the export); null when it has no map. */
export function locationSvg(project: Project, location: Entity): string | null {
  const map = mapOf(location)
  if (!map) return null
  const r = renderMap(project, location, map)
  return toSvgString({ ...r.node, attrs: { ...r.node.attrs, width: r.w, height: r.h } })
}
