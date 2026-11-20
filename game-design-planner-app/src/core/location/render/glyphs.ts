import { polyPath, smoothPath, wobble } from '../geometry'
import { hash, makeRng } from '../rng'
import type { MapObject, MapPoint as Pt } from '../types'
import { emits } from '../light'
import { localOutline, scanline, shapeOf } from '../rooms'
import { roadRank } from '../types/shared'
import { zoneOf } from '../zoning'
import { el, type SvgAttrs, type SvgNode } from './node'
import type { MapTheme } from './theme'

/**
 * How each object kind is drawn. `under` is drawn for every object of a layer before any `draw`, so casings of
 * roads and rivers merge at junctions. To add a drawable thing, add an entry to GLYPHS.
 */
export type Glyph = { draw: (o: MapObject, t: MapTheme) => SvgNode[]; under?: (o: MapObject, t: MapTheme) => SvgNode[] }

const randOf = (o: MapObject) => makeRng(hash(o.id, o.kind))
const pick = (list: string[], i: unknown) => list[Math.abs(Math.round(Number(i) || 0)) % list.length]
const size = (o: MapObject, fallback: number): [number, number] => [o.w ?? fallback, o.h ?? fallback]
const width = (o: MapObject, fallback: number) => (typeof o.props?.width === 'number' ? o.props.width : fallback)
/** Draws in the object's own frame: origin at its centre, x along its length. */
const local = (o: MapObject, children: SvgNode[]) => el('g', { transform: `translate(${o.x} ${o.y}) rotate(${o.rot ?? 0})` }, children)
const box = (w: number, h: number): Pt[] => [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]]
const ink = (t: MapTheme, d: string, sw = 1.3, extra: Record<string, string | number> = {}) =>
  el('path', { d, fill: 'none', stroke: t.ink, 'stroke-width': sw, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', ...extra })
/** Where a shadow falls, as an offset of `reach`: away from the sun (`t.sun`), else towards the lower right. */
function shadowOffset(t: MapTheme, reach: number): [number, number] {
  if (t.sun === undefined) return [reach * 0.7, reach]
  const a = (t.sun * Math.PI) / 180
  // The sun at angle a (clockwise from north) lies towards (sin a, −cos a); the shadow points the other way.
  return [-Math.sin(a) * reach * 1.25, Math.cos(a) * reach * 1.25]
}

/** A soft drop shadow away from the light, whatever the object's rotation. */
function shadow(o: MapObject, t: MapTheme, d: string, reach = 4): SvgNode {
  const a = (-(o.rot ?? 0) * Math.PI) / 180
  const [dx, dy] = shadowOffset(t, reach)
  return el('path', { d, fill: t.shadow, opacity: 0.28, transform: `translate(${(dx * Math.cos(a) - dy * Math.sin(a)).toFixed(1)} ${(dx * Math.sin(a) + dy * Math.cos(a)).toFixed(1)})` })
}
const line = (o: MapObject) => smoothPath(o.points ?? [], false)

/** A hip roof seen from above: two long slopes, two short ones, and the ridge between. */
function roofed(o: MapObject, t: MapTheme, fill: string, outline: number): SvgNode[] {
  let [w, h] = size(o, 24)
  let rot = o.rot ?? 0
  if (h > w) [w, h, rot] = [h, w, rot + 90]
  const rand = randOf(o)
  const r = Math.max(0, w / 2 - h * 0.45)
  const edge = wobble(box(w, h), rand, 0.9)
  const [a, b, c, d] = edge
  const [l, rr]: Pt[] = [[-r, 0], [r, 0]]
  const slope = (pts: Pt[], shade: number) => el('path', { d: polyPath(pts, true), fill: t.roofShade, opacity: shade })
  return [
    local({ ...o, rot }, [
      shadow({ ...o, rot }, t, polyPath(edge, true)),
      el('path', { d: polyPath(edge, true), fill }),
      slope([d, c, rr, l], 0.26),
      slope([b, c, rr], 0.14),
      slope([a, d, l], 0.07),
      ink(t, polyPath(edge, true), outline),
      ink(t, polyPath([l, rr]) + polyPath([a, l, d]) + polyPath([b, rr, c]), 0.8, { opacity: 0.75 }),
      ...(o.props?.chimney ? [el('rect', { x: r * 0.5 - 2, y: -h * 0.3, width: 4, height: 4, fill: t.stone, stroke: t.ink, 'stroke-width': 0.8 })] : []),
    ]),
  ]
}

export const GLYPHS: Record<string, Glyph> = {
  patch: {
    draw: (o, t) => [el('path', { d: smoothPath(o.points ?? [], true), fill: typeof o.props?.tint === 'string' ? o.props.tint : pick(t.ground, o.props?.tone), opacity: 0.3 })],
  },
  river: {
    under: (o, t) => [ink(t, line(o), width(o, 30) + 3.5)],
    draw: (o, t) => [
      el('path', { d: line(o), fill: 'none', stroke: t.water, 'stroke-width': width(o, 30), 'stroke-linecap': 'round' }),
      el('path', { d: line(o), fill: 'none', stroke: t.waterLight, 'stroke-width': width(o, 30) * 0.3, 'stroke-dasharray': '26 34', 'stroke-linecap': 'round', opacity: 0.75 }),
    ],
  },
  coast: {
    draw: (o, t) => {
      const d = polyPath(o.points ?? [], true)
      return [
        el('path', { d, fill: t.water }),
        ink(t, d, 1.8),
        ...[12, 26].map((dy, i) => el('path', { d, fill: 'none', stroke: t.waterLight, 'stroke-width': 1.6, 'stroke-dasharray': i ? '18 30' : '40 22', opacity: 0.8, transform: `translate(0 ${dy})` })),
      ]
    },
  },
  pond: {
    draw: (o, t) => {
      const d = smoothPath(o.points ?? [], true)
      return [el('path', { d, fill: t.water }), ink(t, d, 1.6), el('ellipse', { cx: o.x, cy: o.y, rx: (o.w ?? 40) * 0.22, ry: (o.h ?? 30) * 0.16, fill: 'none', stroke: t.waterLight, 'stroke-width': 1.4, opacity: 0.8 })]
    },
  },
  district: {
    // A faint wash and a dotted boundary: the quarter shows without competing with the streets.
    draw: (o, t) => {
      const d = polyPath(o.points ?? [], true)
      const zone = zoneOf(o)
      return [
        el('path', { d, fill: t.zones[zone], opacity: zone === 'residential' ? 0.1 : 0.18 }),
        ink(t, d, 1.1, { stroke: t.inkSoft, 'stroke-dasharray': '2 5', opacity: 0.45 }),
      ]
    },
  },
  road: {
    // Main roads get a heavier edge and cobbles down the middle; alleys a thin edge.
    under: (o, t) => [ink(t, line(o), width(o, 12) + (roadRank(o) === 'main' ? 3.6 : roadRank(o) === 'alley' ? 1.6 : 2.6))],
    draw: (o, t) => [
      el('path', { d: line(o), fill: 'none', stroke: t.road, 'stroke-width': width(o, 12), 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }),
      ...(roadRank(o) === 'main'
        ? [ink(t, line(o), width(o, 16) * 0.45, { stroke: t.inkSoft, 'stroke-dasharray': '0.5 5', opacity: 0.35 })]
        : []),
    ],
  },
  plaza: {
    under: (o, t) => [el('circle', { cx: o.x, cy: o.y, r: (o.w ?? 60) / 2 + 1.3, fill: t.ink })],
    draw: (o, t) => [el('circle', { cx: o.x, cy: o.y, r: (o.w ?? 60) / 2, fill: t.road })],
  },
  bridge: {
    draw: (o, t) => {
      const [w, h] = size(o, 30)
      const planks = Array.from({ length: Math.floor(w / 6) }, (_, i) => polyPath([[-w / 2 + (i + 1) * 6, -h / 2], [-w / 2 + (i + 1) * 6, h / 2]])).join('')
      return [local(o, [el('path', { d: polyPath(box(w, h), true), fill: t.wood }), ink(t, planks, 0.7, { opacity: 0.6 }), ink(t, polyPath(box(w, h), true), 1.5)])]
    },
  },
  wall: {
    draw: (o, t) => {
      const d = smoothPath(o.points ?? [], true)
      if (o.props?.style === 'Stone') {
        const towers = (o.points ?? []).filter((_, i, all) => i % Math.max(1, Math.round(all.length / 9)) === 0)
        return [
          ink(t, d, 10),
          el('path', { d, fill: 'none', stroke: t.stone, 'stroke-width': 7 }),
          ink(t, d, 1, { 'stroke-dasharray': '1 9', opacity: 0.7 }),
          ...towers.map((p) => el('circle', { cx: p[0], cy: p[1], r: 9, fill: t.stone, stroke: t.ink, 'stroke-width': 1.5 })),
        ]
      }
      return [ink(t, d, 6.5), el('path', { d, fill: 'none', stroke: t.wood, 'stroke-width': 4 }), ink(t, d, 4, { 'stroke-dasharray': '1 5', opacity: 0.55 })]
    },
  },
  gate: {
    draw: (o, t) => {
      const [w, h] = size(o, 18)
      const post = o.props?.style === 'Stone' ? t.stone : t.wood
      return [
        local(o, [
          el('rect', { x: -w / 2, y: -h / 2, width: w, height: h, fill: t.road }),
          ...[-1, 1].map((side) => el('circle', { cx: 0, cy: side * (h / 2 + 4), r: 6, fill: post, stroke: t.ink, 'stroke-width': 1.4 })),
        ]),
      ]
    },
  },
  field: {
    draw: (o, t) => {
      const [w, h] = size(o, 120)
      const edge = polyPath(wobble(box(w, h), randOf(o), 2.5), true)
      const furrows = Array.from({ length: Math.max(0, Math.floor(h / 9) - 1) }, (_, i) => polyPath([[-w / 2 + 4, -h / 2 + (i + 1) * 9], [w / 2 - 4, -h / 2 + (i + 1) * 9]])).join('')
      return [local(o, [el('path', { d: edge, fill: pick(t.crops, o.props?.crop), opacity: 0.85 }), ink(t, furrows, 0.8, { stroke: t.inkSoft, opacity: 0.5 }), ink(t, edge, 1.1, { stroke: t.inkSoft })])]
    },
  },
  house: {
    draw: (o, t) => {
      const use = o.props?.use
      if (use === 'stall') return stall(o, t)
      if (use === 'shrine') return [...roofed(o, t, t.landmarkRoof, 1.4), local(o, [ink(t, polyPath([[0, -4.5], [0, 4.5]]) + polyPath([[-3, -1.5], [3, -1.5]]), 1.6, { stroke: t.paper }), ink(t, polyPath([[0, -4.5], [0, 4.5]]) + polyPath([[-3, -1.5], [3, -1.5]]), 0.9)])]
      if (use === 'barracks') {
        // A long hall with a banner pole at one end.
        const [w] = size(o, 40)
        return [...roofed(o, t, pick(t.roofs, o.props?.roof), 1.4), local(o, [el('circle', { cx: -w / 2 + 5, cy: 0, r: 2.4, fill: t.banner, stroke: t.ink, 'stroke-width': 0.8 })])]
      }
      return roofed(o, t, pick(t.roofs, o.props?.roof), 1.2)
    },
  },
  landmark: { draw: (o, t) => roofed(o, t, t.landmarkRoof, 1.8) },
  well: {
    draw: (o, t) => [
      el('circle', { cx: o.x + 1.5, cy: o.y + 2, r: 8, fill: t.shadow, opacity: 0.28 }),
      el('circle', { cx: o.x, cy: o.y, r: 8, fill: t.stone, stroke: t.ink, 'stroke-width': 1.4 }),
      el('circle', { cx: o.x, cy: o.y, r: 4, fill: t.water, stroke: t.ink, 'stroke-width': 0.9 }),
    ],
  },
  tree: {
    draw: (o, t) => {
      const r = (o.w ?? 18) / 2
      const rand = randOf(o)
      const crown = Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * Math.PI * 2
        const k = r * rand.range(0.82, 1.12)
        return [o.x + Math.cos(a) * k, o.y + Math.sin(a) * k] as Pt
      })
      const d = smoothPath(crown, true)
      return [
        el('path', { d, fill: t.shadow, opacity: 0.25, transform: `translate(${shadowOffset(t, r * 0.45).map((v) => v.toFixed(1)).join(' ')})` }),
        el('path', { d, fill: pick(t.trees, o.props?.tone) }),
        el('circle', { cx: o.x - r * 0.25, cy: o.y - r * 0.3, r: r * 0.42, fill: '#fff', opacity: 0.16 }),
        ink(t, d, 1),
      ]
    },
  },
  rock: {
    draw: (o, t) => {
      const [w, h] = size(o, 100)
      const rand = randOf(o)
      const [x0, y0] = [o.x - w / 2, o.y - h / 2]
      // Short pen strokes, all leaning the same way, as an engraver shades solid rock.
      const hatch = Array.from({ length: Math.round((w * h) / 2400) }, () => {
        const [x, y, len, a] = [x0 + rand.range(0, w), y0 + rand.range(0, h), rand.range(7, 15), rand.range(0.5, 0.9)]
        return polyPath([[x, y], [x + Math.cos(a) * len, y - Math.sin(a) * len]])
      }).join('')
      return [el('rect', { x: x0, y: y0, width: w, height: h, fill: t.rock }), ink(t, hatch, 0.9, { opacity: 0.32 })]
    },
  },
  cavern: {
    draw: (o, t) => {
      const d = smoothPath(o.points ?? [], true)
      return [el('path', { d, fill: t.floors.Stone }), el('path', { d, fill: 'none', stroke: t.rock, 'stroke-width': 9, opacity: 0.35 }), ink(t, d, 2.6)]
    },
  },
  rockpile: {
    draw: (o, t) => {
      const d = smoothPath(o.points ?? [], true)
      return [el('path', { d, fill: t.rock }), ink(t, d, 2)]
    },
  },
  corridor: {
    under: (o, t) => [ink(t, polyPath(o.points ?? []), width(o, 16) + 4)],
    draw: (o, t) => [
      el('path', { d: polyPath(o.points ?? []), fill: 'none', stroke: t.floors.Stone, 'stroke-width': width(o, 16), 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }),
      ...(o.props?.secret ? [ink(t, polyPath(o.points ?? []), 1, { 'stroke-dasharray': '3 6', opacity: 0.6 })] : []),
    ],
  },
  room: { draw: (o, t) => floored(o, t, String(o.props?.floor ?? 'Wood'), false) },
  chamber: { draw: (o, t) => floored(o, t, 'Stone', o.props?.role === 'secret') },
  door: {
    draw: (o, t) => {
      const [w] = size(o, 22)
      const style = o.props?.entrance ? 'entrance' : String(o.props?.style ?? 'door')
      const gap = el('rect', { x: -w / 2, y: -4.5, width: w, height: 9, fill: t.road })
      const slab = (thick: number, fill: string) => el('rect', { x: -w / 2 + 1.5, y: -thick / 2, width: w - 3, height: thick, fill, stroke: t.ink, 'stroke-width': 0.9 })
      const posts = [-1, 1].map((side) => el('rect', { x: side * (w / 2) - 2.5, y: -5.5, width: 5, height: 11, fill: t.stone, stroke: t.ink, 'stroke-width': 1 }))
      const parts: Record<string, SvgNode[]> = {
        open: [gap],
        door: [gap, slab(3.5, t.wood)],
        entrance: [gap, slab(5, t.wood), ...posts],
        gate: [gap, slab(6, t.inkSoft), ...posts],
        secret: [gap, el('text', { y: 3.5, 'text-anchor': 'middle', 'font-family': t.fontBody, 'font-size': 10, 'font-weight': 700, fill: t.ink }, 'S')],
      }
      // A locked door carries a padlock in its key's colour.
      const padlock = o.lock
        ? [
            el('path', { d: 'M-2.6,-1 v-2 a2.6,2.6 0 0 1 5.2,0 v2', fill: 'none', stroke: t.ink, 'stroke-width': 1.2 }),
            el('rect', { x: -3.8, y: -1.2, width: 7.6, height: 6, rx: 1, fill: lockColor(t, o.lock), stroke: t.ink, 'stroke-width': 0.9 }),
          ]
        : []
      return [local(o, [...(parts[style] ?? parts.door), ...(padlock.length ? [el('g', { transform: `rotate(${-(o.rot ?? 0)}) scale(1.7)` }, padlock)] : [])])]
    },
  },
  // A cave chamber is gameplay data (the room graph), not drawn: the cavern outline already shows it.
  hollow: { draw: () => [] },
  // The world map.
  sea: {
    draw: (o, t) => {
      const [w, h] = size(o, 400)
      const rand = randOf(o)
      const waves = Array.from({ length: Math.round((w * h) / 9000) }, () => {
        const [x, y] = [o.x - w / 2 + rand.range(0, w), o.y - h / 2 + rand.range(0, h)]
        return `M${x.toFixed(0)},${y.toFixed(0)}q5,-4 10,0q5,4 10,0`
      }).join('')
      return [el('rect', { x: o.x - w / 2, y: o.y - h / 2, width: w, height: h, fill: t.water }), ink(t, waves, 1, { stroke: t.waterLight, opacity: 0.7 })]
    },
  },
  land: {
    // A pale shore line just off the coast, then the land and its inked edge.
    under: (o, t) => [el('path', { d: smoothPath(o.points ?? [], true), fill: 'none', stroke: t.waterLight, 'stroke-width': 9, opacity: 0.6 })],
    draw: (o, t) => {
      const d = smoothPath(o.points ?? [], true)
      return [el('path', { d, fill: t.paper }), el('path', { d, fill: t.ground[1], opacity: 0.25 }), ink(t, d, 1.8)]
    },
  },
  region: {
    draw: (o, t) => {
      const d = smoothPath(o.points ?? [], true)
      const fill = typeof o.props?.color === 'string' ? o.props.color : pick(t.ground, o.props?.tone)
      return [el('path', { d, fill, opacity: 0.32 }), ink(t, d, 1, { stroke: t.inkSoft, 'stroke-dasharray': '3 4', opacity: 0.6 })]
    },
  },
  site: {
    draw: (o, t) => {
      const type = String(o.props?.type ?? 'Village')
      const roofs = (n: number) =>
        Array.from({ length: n }, (_, i) => {
          const x = (i - (n - 1) / 2) * 8
          return el('path', { d: `M${x - 4},3 V-1 L${x},-5 L${x + 4},-1 V3 Z`, fill: pick(t.roofs, i), stroke: t.ink, 'stroke-width': 0.9 })
        })
      const icons: Record<string, SvgNode[]> = {
        City: [el('path', { d: 'M-9,5 V-4 H-6 V-7 H-3 V-4 H3 V-7 H6 V-4 H9 V5 Z', fill: t.stone, stroke: t.ink, 'stroke-width': 1.1 }), el('rect', { x: -2, y: 0, width: 4, height: 5, fill: t.ink })],
        Village: roofs(3),
        Dwelling: roofs(1),
        Dungeon: [el('path', { d: 'M-8,5 V-2 A8,8 0 0 1 8,-2 V5 Z', fill: t.rock, stroke: t.ink, 'stroke-width': 1.1 }), el('path', { d: 'M-3,5 V0 A3,3 0 0 1 3,0 V5 Z', fill: t.ink })],
        Cave: [el('path', { d: 'M-10,5 L-4,-6 L1,-2 L5,-7 L10,5 Z', fill: t.rock, stroke: t.ink, 'stroke-width': 1.1 }), el('path', { d: 'M-3,5 Q0,-2 3,5 Z', fill: t.ink })],
      }
      return [el('g', { transform: `translate(${o.x} ${o.y})` }, [el('circle', { r: 11, fill: t.paper, stroke: t.ink, 'stroke-width': 1.2, opacity: 0.9 }), ...(icons[type] ?? icons.Village)])]
    },
  },
  light: {
    // A soft pool of light under everything of its layer, and a small icon for the source.
    under: (o, t) => {
      const e = emits(o)
      const g = t.glow ?? 1
      // The glow lies over other objects; clicks go through it to them.
      return e && g > 0
        ? [
            el('circle', { cx: o.x, cy: o.y, r: e.radius * 0.45, fill: e.color, opacity: 0.16 * g, 'pointer-events': 'none' }),
            el('circle', { cx: o.x, cy: o.y, r: e.radius * 0.22, fill: e.color, opacity: 0.18 * g, 'pointer-events': 'none' }),
          ]
        : []
    },
    draw: (o, t) => {
      const type = String(o.props?.type ?? 'torch')
      const color = emits(o)?.color ?? t.gilt
      const flame = el('path', { d: 'M0,-6 C3,-2 3.5,1 0,4 C-3.5,1 -3,-2 0,-6 Z', fill: color, stroke: t.ink, 'stroke-width': 0.8 })
      const parts: Record<string, SvgNode[]> = {
        torch: [el('rect', { x: -1.3, y: 1, width: 2.6, height: 6, fill: t.wood, stroke: t.ink, 'stroke-width': 0.6 }), flame],
        brazier: [el('circle', { r: 6.5, fill: t.stone, stroke: t.ink, 'stroke-width': 1 }), el('g', { transform: 'translate(0 1) scale(0.9)' }, [flame])],
        lamp: [el('circle', { r: 4.5, fill: color, stroke: t.ink, 'stroke-width': 1 }), el('circle', { r: 1.6, fill: '#fff', opacity: 0.7 })],
        candle: [el('rect', { x: -1.5, y: 0, width: 3, height: 5, fill: t.linen, stroke: t.ink, 'stroke-width': 0.5 }), el('g', { transform: 'translate(0 -1) scale(0.55)' }, [flame])],
        hearth: [flame],
        campfire: [el('path', { d: 'M-6,4 L6,-1 M-6,-1 L6,4', stroke: t.wood, 'stroke-width': 2.2, 'stroke-linecap': 'round' }), el('g', { transform: 'translate(0 -1)' }, [flame])],
        crystal: [el('path', { d: 'M0,-7 L4,0 L0,7 L-4,0 Z', fill: color, stroke: t.ink, 'stroke-width': 0.9 })],
        // Daylight through a window: only its glow, the window itself is drawn on the wall.
        window: [],
      }
      return [el('g', { transform: `translate(${o.x} ${o.y})` }, parts[type] ?? parts.torch)]
    },
  },
  key: {
    draw: (o, t) => {
      const fill = lockColor(t, typeof o.key === 'string' ? o.key : String(o.props?.color ?? ''))
      return [
        el('g', { transform: `translate(${o.x} ${o.y}) rotate(-35)` }, [
          el('circle', { cx: -4, cy: 0, r: 4.2, fill, stroke: t.ink, 'stroke-width': 1.2 }),
          el('circle', { cx: -4, cy: 0, r: 1.5, fill: t.paper }),
          el('path', { d: 'M0,-1.2 H8 V1.2 H0 Z M5,1.2 V4 M7.5,1.2 V3.4', fill, stroke: t.ink, 'stroke-width': 1.1 }),
        ]),
      ]
    },
  },
  window: {
    draw: (o, t) => {
      const [w] = size(o, 22)
      return [local(o, [el('rect', { x: -w / 2, y: -3.5, width: w, height: 7, fill: t.waterLight, stroke: t.ink, 'stroke-width': 0.9 }), ink(t, polyPath([[-w / 2, 0], [w / 2, 0]]), 0.7)])]
    },
  },
  furniture: {
    draw: (o, t) => {
      const [w, h] = size(o, 20)
      const frame = (fill: string, extra: SvgAttrs = {}) => el('rect', { x: -w / 2, y: -h / 2, width: w, height: h, rx: 1.5, fill, stroke: t.ink, 'stroke-width': 1, ...extra })
      const disc = (r: number, fill: string) => el('circle', { r, fill, stroke: t.ink, 'stroke-width': 1 })
      const parts: Record<string, () => SvgNode[]> = {
        bed: () => [frame(t.wood), el('rect', { x: -w / 2 + 2, y: -h / 2 + 2, width: w - 4, height: h - 4, fill: t.linen }), el('rect', { x: -w / 2 + w * 0.34, y: -h / 2 + 2, width: w * 0.66 - 2, height: h - 4, fill: t.roofs[0], opacity: 0.85 }), ink(t, polyPath([[-w / 2 + w * 0.34, -h / 2 + 2], [-w / 2 + w * 0.34, h / 2 - 2]]), 0.7)],
        table: () => [frame(t.wood), ink(t, polyPath([[-w / 2 + 3, 0], [w / 2 - 3, 0]]), 0.6, { opacity: 0.5 })],
        hearth: () => [frame(t.stone), el('circle', { r: h * 0.3, fill: '#d9772b' }), el('circle', { r: h * 0.14, fill: '#f1c24a' })],
        chest: () => [frame(t.wood), ink(t, polyPath([[-w / 2, -h * 0.15], [w / 2, -h * 0.15]]), 0.8), el('rect', { x: -1.5, y: -h * 0.15 - 1, width: 3, height: 4, fill: t.gilt, stroke: t.ink, 'stroke-width': 0.5 })],
        barrel: () => [disc(w / 2, t.wood), el('circle', { r: w * 0.3, fill: 'none', stroke: t.ink, 'stroke-width': 0.7, opacity: 0.6 })],
        shelf: () => [frame(t.wood), ink(t, [1, 2, 3].map((i) => polyPath([[-w / 2 + (i * w) / 4, -h / 2], [-w / 2 + (i * w) / 4, h / 2]])).join(''), 0.7)],
        rug: () => [frame(t.roofs[2], { rx: 3, opacity: 0.8, 'stroke-width': 0.8 }), el('rect', { x: -w / 2 + 4, y: -h / 2 + 4, width: w - 8, height: h - 8, fill: 'none', stroke: t.gilt, 'stroke-width': 1.2 })],
        stool: () => [disc(Math.min(w, h) / 2, t.wood)],
      }
      return [local(o, (parts[String(o.props?.type)] ?? parts.chest)())]
    },
  },
  stairs: {
    draw: (o, t) => {
      const [w, h] = size(o, 26)
      const steps = Array.from({ length: 4 }, (_, i) => polyPath([[-w / 2, -h / 2 + ((i + 1) * h) / 5], [w / 2, -h / 2 + ((i + 1) * h) / 5]])).join('')
      return [local(o, [el('rect', { x: -w / 2, y: -h / 2, width: w, height: h, fill: t.stone, stroke: t.ink, 'stroke-width': 1.3 }), ink(t, steps, 0.9), el('path', { d: `M0,${h / 2 + 9}L-5,${h / 2 + 2}L5,${h / 2 + 2}Z`, fill: t.ink })])]
    },
  },
  trap: {
    draw: (o, t) => [
      el('rect', { x: o.x - 6, y: o.y - 6, width: 12, height: 12, fill: t.paper, stroke: t.banner, 'stroke-width': 1.4 }),
      el('path', { d: polyPath([[o.x - 4, o.y - 4], [o.x + 4, o.y + 4]]) + polyPath([[o.x + 4, o.y - 4], [o.x - 4, o.y + 4]]), stroke: t.banner, 'stroke-width': 1.4, fill: 'none' }),
    ],
  },
  pillar: {
    draw: (o, t) => [el('circle', { cx: o.x + 1.5, cy: o.y + 2, r: 6, fill: t.shadow, opacity: 0.28 }), el('circle', { cx: o.x, cy: o.y, r: 6, fill: t.stone, stroke: t.ink, 'stroke-width': 1.3 })],
  },
  marker: {
    // Foes are dark with a cross, the boss red with a crown; residents green with a head, merchants gold with a coin.
    draw: (o, t) => {
      const type = String(o.props?.type ?? 'enemy')
      const boss = type === 'boss'
      const r = boss ? 12 : 8.5
      const marks: Record<string, [string, SvgNode]> = {
        boss: [t.banner, el('path', { d: `M-7,4L-7,-4L-3.5,0L0,-6L3.5,0L7,-4L7,4Z`, fill: t.bannerText, stroke: t.ink, 'stroke-width': 0.7 })],
        enemy: [t.foe, el('path', { d: 'M-4,-4L4,4M4,-4L-4,4', stroke: t.bannerText, 'stroke-width': 1.8, 'stroke-linecap': 'round', fill: 'none' })],
        npc: [t.friend, el('path', { d: 'M0,-5 a2.4,2.4 0 1 1 0.01,0 Z M-4.2,5 C-4,0.5 4,0.5 4.2,5 Z', fill: t.bannerText })],
        merchant: [t.gilt, el('g', {}, [el('circle', { r: 4.4, fill: t.bannerText, stroke: t.ink, 'stroke-width': 0.7 }), el('path', { d: 'M0,-2.6 V2.6', stroke: t.ink, 'stroke-width': 1.1 })])],
      }
      const [fill, mark] = marks[type] ?? marks.enemy
      return [el('g', { transform: `translate(${o.x} ${o.y})` }, [el('circle', { cx: 1.5, cy: 2, r, fill: t.shadow, opacity: 0.3 }), el('circle', { r, fill, stroke: t.ink, 'stroke-width': 1.5 }), mark])]
    },
  },
  stalagmite: {
    draw: (o, t) => {
      const [w, h] = size(o, 10)
      return [el('g', { transform: `translate(${o.x} ${o.y})` }, [el('path', { d: `M${-w / 2},${h / 2}L0,${-h / 2}L${w / 2},${h / 2}Z`, fill: t.stone, stroke: t.ink, 'stroke-width': 1, 'stroke-linejoin': 'round' }), ink(t, `M0,${-h / 2}L${w * 0.12},${h / 2}`, 0.6, { opacity: 0.5 })])]
    },
  },
  ore: {
    draw: (o, t) => {
      const gem = (x: number, y: number, r: number) => el('path', { d: `M${x},${y - r}L${x + r * 0.7},${y}L${x},${y + r}L${x - r * 0.7},${y}Z`, fill: pick(t.ores, o.props?.tone), stroke: t.ink, 'stroke-width': 0.8, 'stroke-linejoin': 'round' })
      return [el('g', { transform: `translate(${o.x} ${o.y})` }, [gem(-5, 2, 5), gem(4, 3, 4), gem(0, -3, 6)])]
    },
  },
  label: {
    draw: (o, t) => {
      const large = o.props?.size === 'large'
      return [
        el(
          'text',
          {
            x: o.x,
            y: o.y,
            'text-anchor': 'middle',
            'font-family': large ? t.fontDisplay : t.fontBody,
            'font-style': large ? undefined : 'italic',
            'font-weight': large ? 700 : undefined,
            'letter-spacing': large ? 1.5 : undefined,
            'font-size': large ? 17 : 13,
            fill: t.ink,
            stroke: t.paper,
            'stroke-width': 3.5,
            'stroke-linejoin': 'round',
            'paint-order': 'stroke',
          },
          o.label ?? '',
        ),
      ]
    },
  },
}

/** A market booth: a striped awning over a counter. */
function stall(o: MapObject, t: MapTheme): SvgNode[] {
  const [w, h] = size(o, 18)
  const n = Math.max(3, Math.round(w / 4))
  const stripes = Array.from({ length: n }, (_, i) =>
    el('rect', { x: -w / 2 + (i * w) / n, y: -h / 2, width: w / n + 0.2, height: h, fill: t.awning[i % 2] }),
  )
  const edge = polyPath(box(w, h), true)
  return [local(o, [shadow(o, t, edge, 3), ...stripes, ink(t, edge, 1)])]
}

const lockColor = (t: MapTheme, lock: string) => t.locks[lock] ?? t.gilt

/**
 * A walled room seen from above: its floor (planks, flagstones or bare earth) inside a thick inked wall. The floor
 * follows the room's shape (rooms.ts); floor lines are cut to it.
 */
function floored(o: MapObject, t: MapTheme, floor: string, hidden: boolean): SvgNode[] {
  const [w, h] = size(o, 80)
  const outline = localOutline({ ...o, rot: 0 })
  const lines: string[] = []
  // Horizontal lines cut to the floor; vertical ones by scanning the outline turned a quarter.
  const across = (y: number) => scanline(outline, y).map(([x0, x1]) => polyPath([[x0, y], [x1, y]])).join('')
  const turned = outline.map(([x, y]) => [y, x] as Pt)
  const down = (x: number) => scanline(turned, x).map(([y0, y1]) => polyPath([[x, y0], [x, y1]])).join('')
  if (floor === 'Wood') for (let y = -h / 2 + 11; y < h / 2 - 2; y += 11) lines.push(across(y))
  if (floor === 'Stone') {
    for (let y = -h / 2 + 20; y < h / 2 - 2; y += 20) lines.push(across(y))
    for (let x = -w / 2 + 20; x < w / 2 - 2; x += 20) lines.push(down(x))
  }
  const edge = shapeOf(o) === 'round' ? smoothPath(outline, true) : polyPath(outline, true)
  return [
    local({ ...o, rot: 0 }, [
      shadow({ ...o, rot: 0 }, t, edge, 5),
      el('path', { d: edge, fill: t.floors[floor] ?? t.floors.Stone }),
      ink(t, lines.join(''), 0.7, { stroke: t.inkSoft, opacity: 0.3 }),
      ink(t, edge, hidden ? 3 : 5, { 'stroke-linejoin': 'miter', ...(hidden ? { 'stroke-dasharray': '7 5' } : {}) }),
    ]),
  ]
}

/** A building from above as a plan: its outline, a thin inner wall line, and a cross for a landmark. */
function planBox(o: MapObject, t: MapTheme, landmark: boolean): SvgNode[] {
  const [w, h] = size(o, 24)
  const edge = polyPath(box(w, h), true)
  const inner = polyPath(box(Math.max(2, w - 5), Math.max(2, h - 5)), true)
  return [
    local(o, [
      el('path', { d: edge, fill: landmark ? t.landmarkRoof : pick(t.roofs, o.props?.roof) }),
      ink(t, edge, 1.4, { 'stroke-linejoin': 'miter' }),
      ink(t, inner, 0.6, { opacity: 0.6 }),
      ...(landmark ? [ink(t, polyPath([[-w / 2, -h / 2], [w / 2, h / 2]]) + polyPath([[w / 2, -h / 2], [-w / 2, h / 2]]), 0.6, { opacity: 0.5 })] : []),
    ]),
  ]
}

/** Glyphs for the plan-style themes (blueprint, modern plan): flat outlines instead of roofs and crowns. */
export const PLAN_GLYPHS: Partial<Record<string, Glyph>> = {
  house: { draw: (o, t) => (o.props?.use === 'stall' ? GLYPHS.house.draw(o, t) : planBox(o, t, false)) },
  landmark: { draw: (o, t) => planBox(o, t, true) },
  tree: {
    draw: (o, t) => {
      const r = (o.w ?? 18) / 2
      return [el('circle', { cx: o.x, cy: o.y, r, fill: pick(t.trees, o.props?.tone), opacity: 0.6 }), el('circle', { cx: o.x, cy: o.y, r, fill: 'none', stroke: t.inkSoft, 'stroke-width': 0.8, 'stroke-dasharray': '2 2' })]
    },
  },
}
