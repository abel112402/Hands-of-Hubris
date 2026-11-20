import type { Entity, Project } from '../../model/types'
import { CURVE_STEP, dist, radiusOf, sampleSpline } from '../geometry'
import type { Rng } from '../rng'
import type { LocationMap, MapObject, MapPoint as Pt, RoadRank } from '../types'

/** Helpers every location type's generators share. */
export const objects = (map: LocationMap, layer: string, kind?: string): MapObject[] =>
  (map.layers[layer]?.objects ?? []).filter((o) => !kind || o.kind === kind)
export const pos = (o: { x: number; y: number }): Pt => [o.x, o.y]
export const widthOf = (o: MapObject, fallback: number) => (typeof o.props?.width === 'number' ? o.props.width : fallback)
/** A road's rank; roads from before ranks existed count as main roads when they are as wide as one. */
export const roadRank = (o: MapObject): RoadRank => o.rank ?? (widthOf(o, 12) >= 16 ? 'main' : widthOf(o, 12) <= 7 ? 'alley' : 'street')
export const between = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
export const snap = (n: number, step = 10) => Math.round(n / step) * step
export const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n))

/** A generator slider's value on this map (`map.params`), or `fallback` when it was never moved. */
export const param = (map: LocationMap, id: string, fallback: number): number => {
  const v = map.params?.[id]
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

/** The `size` input as one of three steps; anything else counts as Medium. */
export const sizeKey = (location: Entity): 'Small' | 'Medium' | 'Large' => (location.size === 'Small' || location.size === 'Large' ? location.size : 'Medium')

/** Whether a disc at `p` would sit on any of the box-like `others`. */
export const touches = (p: Pt, r: number, others: { x: number; y: number; w?: number; h?: number }[]) =>
  others.some((o) => dist(p, pos(o)) < (radiusOf(o) + r) * 0.85)

/** A curve through a few waypoints, each nudged sideways: the waypoints (`ctrl`) and the curve sampled densely enough to measure against. */
export function path(rand: Rng, waypoints: Pt[], sway: number): { points: Pt[]; ctrl: Pt[] } {
  const ctrl = waypoints.map((p, i) => (i === 0 || i === waypoints.length - 1 ? p : ([p[0] + rand.range(-sway, sway), p[1] + rand.range(-sway, sway)] as Pt)))
  return { points: sampleSpline(ctrl, CURVE_STEP), ctrl }
}
/** A closed, smooth outline through the points of a blob. */
export const outlineOf = (ctrl: Pt[]): { points: Pt[]; ctrl: Pt[] } => ({ points: sampleSpline(ctrl, CURVE_STEP, true), ctrl })

/** The colour of the location's biome, when it has a valid one. */
export function biomeTint(project: Project, location: Entity): string | undefined {
  const biomes: Entity[] = project.documents['design.world']?.data.biomes ?? []
  const color = biomes.find((b) => b.id === location.biome)?.color
  return typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color) ? color : undefined
}

/** The entries a multiref or ref field points at, with their names; ids that no longer exist are skipped. */
export function refsOf(project: Project, value: unknown, docId: string, section: string): { id: string; name: string }[] {
  const ids = Array.isArray(value) ? value : value ? [value] : []
  const data = project.documents[docId]?.data[section]
  const entries: Entity[] = Array.isArray(data) ? data : []
  return ids.flatMap((id) => {
    const e = entries.find((x) => x.id === id)
    return e ? [{ id: String(id), name: String(e.name ?? '') }] : []
  })
}

/** Catalog items a multiref field points at. */
export function catalogRefs(project: Project, value: unknown, catalog: string): { id: string; name: string }[] {
  const items = project.registry.catalogs[catalog]?.items ?? []
  return (Array.isArray(value) ? value : []).flatMap((id) => {
    const item = items.find((x) => x.id === id)
    return item ? [{ id: String(id), name: item.label }] : []
  })
}

export type Rect = { x: number; y: number; w: number; h: number }

/**
 * Splits a rectangle (top-left based) into about `count` smaller ones: the largest is cut across its longer side
 * until there are enough, or until no piece can be cut without going under `min`. Cuts land on a 10-unit grid.
 */
export function splitRects(rect: Rect, count: number, rand: Rng, min: number): Rect[] {
  const out = [rect]
  while (out.length < count) {
    const order = out.map((_, i) => i).sort((a, b) => out[b].w * out[b].h - out[a].w * out[a].h)
    const i = order.find((k) => Math.max(out[k].w, out[k].h) >= min * 2)
    if (i === undefined) break
    const r = out[i]
    const wide = r.w >= r.h
    const length = wide ? r.w : r.h
    const cut = clamp(snap(length * rand.range(0.38, 0.62)), min, length - min)
    out.splice(i, 1, wide ? { x: r.x, y: r.y, w: cut, h: r.h } : { x: r.x, y: r.y, w: r.w, h: cut }, wide ? { x: r.x + cut, y: r.y, w: r.w - cut, h: r.h } : { x: r.x, y: r.y + cut, w: r.w, h: r.h - cut })
  }
  return out
}
export const centreOf = (r: Rect): Pt => [r.x + r.w / 2, r.y + r.h / 2]
