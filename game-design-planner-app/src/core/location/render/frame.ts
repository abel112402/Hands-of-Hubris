import { el, type SvgNode } from './node'
import type { MapTheme } from './theme'

/** The card around a map: parchment, border, title banner, footer and compass. All sizes are in map units. */
export const CARD = { side: 44, top: 96, bottom: 64 }
export const cardSize = (w: number, h: number) => ({ w: w + CARD.side * 2, h: h + CARD.top + CARD.bottom })

export type FrameText = { title: string; subtitle: string; seed: number }

/** Gradient, grain and clip definitions. `uid` keeps ids apart when several maps share a page. */
export function frameDefs(t: MapTheme, uid: string, w: number, h: number, seed: number): SvgNode {
  return el('defs', {}, [
    el('filter', { id: `${uid}-grain`, x: 0, y: 0, width: '100%', height: '100%' }, [
      el('feTurbulence', { type: 'fractalNoise', baseFrequency: 0.035, numOctaves: 4, seed: seed % 997, result: 'noise' }),
      el('feColorMatrix', { in: 'noise', type: 'matrix', values: '0 0 0 0 0.42  0 0 0 0 0.3  0 0 0 0 0.14  0 0 0 0.55 0', result: 'stain' }),
      el('feComposite', { in: 'stain', in2: 'SourceGraphic', operator: 'atop' }),
    ]),
    el('radialGradient', { id: `${uid}-edge`, cx: '50%', cy: '50%', r: '72%' }, [
      el('stop', { offset: '55%', 'stop-color': t.paperShade, 'stop-opacity': 0 }),
      el('stop', { offset: '100%', 'stop-color': t.paperShade, 'stop-opacity': 0.5 }),
    ]),
    el('clipPath', { id: `${uid}-map` }, [el('rect', { x: 0, y: 0, width: w, height: h })]),
  ])
}

export function paper(t: MapTheme, uid: string, w: number, h: number): SvgNode[] {
  const c = cardSize(w, h)
  return [
    el('rect', { x: 0, y: 0, width: c.w, height: c.h, rx: 20, fill: t.card }),
    el('rect', { x: 9, y: 9, width: c.w - 18, height: c.h - 18, rx: 13, fill: t.paper, filter: `url(#${uid}-grain)` }),
    el('rect', { x: 9, y: 9, width: c.w - 18, height: c.h - 18, rx: 13, fill: `url(#${uid}-edge)` }),
    el('rect', { x: 15, y: 15, width: c.w - 30, height: c.h - 30, rx: 9, fill: 'none', stroke: t.gilt, 'stroke-width': 1.5 }),
  ]
}

function compass(t: MapTheme, x: number, y: number): SvgNode {
  const star = (long: number, short: number) => `M0,${-long}L${short},${-short}L${long},0L${short},${short}L0,${long}L${-short},${short}L${-long},0L${-short},${-short}Z`
  return el('g', { transform: `translate(${x} ${y})` }, [
    el('circle', { r: 21, fill: t.paper, stroke: t.ink, 'stroke-width': 1.2, opacity: 0.9 }),
    el('path', { d: star(18, 4.5), fill: t.paper, stroke: t.ink, 'stroke-width': 1 }),
    el('path', { d: 'M0,-18L4.5,-4.5L0,0Z M0,18L-4.5,4.5L0,0Z M18,0L4.5,4.5L0,0Z M-18,0L-4.5,-4.5L0,0Z', fill: t.ink }),
    el('text', { y: -25, 'text-anchor': 'middle', 'font-family': t.fontDisplay, 'font-size': 13, 'font-weight': 700, fill: t.ink }, 'N'),
  ])
}

/** Everything drawn above the map: its border, the banner, the footer and the compass. */
export function frame(t: MapTheme, w: number, h: number, text: FrameText): SvgNode[] {
  const c = cardSize(w, h)
  const [x, y] = [CARD.side, CARD.top]
  const half = Math.min(c.w / 2 - 70, Math.max(150, text.title.length * 11 + 60))
  const cx = c.w / 2
  const ribbon = `M${cx - half},34 L${cx + half},34 L${cx + half + 22},54 L${cx + half},74 L${cx - half},74 L${cx - half - 22},54 Z`
  const corner = (px: number, py: number) => el('path', { d: `M${px},${py - 7}L${px + 7},${py}L${px},${py + 7}L${px - 7},${py}Z`, fill: t.gilt, stroke: t.ink, 'stroke-width': 1 })
  return [
    el('rect', { x: x - 5, y: y - 5, width: w + 10, height: h + 10, fill: 'none', stroke: t.ink, 'stroke-width': 1 }),
    el('rect', { x, y, width: w, height: h, fill: 'none', stroke: t.ink, 'stroke-width': 2.5 }),
    ...[[x - 5, y - 5], [x + w + 5, y - 5], [x - 5, y + h + 5], [x + w + 5, y + h + 5]].map(([px, py]) => corner(px, py)),
    compass(t, x + w - 42, y + 50),
    el('path', { d: ribbon, fill: t.shadow, opacity: 0.3, transform: 'translate(2 4)' }),
    el('path', { d: ribbon, fill: t.banner, stroke: t.ink, 'stroke-width': 1.6, 'stroke-linejoin': 'round' }),
    el('path', { d: `M${cx - half + 6},39 L${cx + half - 6},39 M${cx - half + 6},69 L${cx + half - 6},69`, stroke: t.gilt, 'stroke-width': 1, fill: 'none' }),
    el('text', { x: cx, y: 62, 'text-anchor': 'middle', 'font-family': t.fontDisplay, 'font-size': 24, 'font-weight': 700, 'letter-spacing': 1, fill: t.bannerText }, text.title),
    el('text', { x: cx, y: y + h + 36, 'text-anchor': 'middle', 'font-family': t.fontDisplay, 'font-size': 15, 'letter-spacing': 3, fill: t.ink }, text.subtitle.toUpperCase()),
    el('text', { x: x + w, y: y + h + 36, 'text-anchor': 'end', 'font-family': t.fontBody, 'font-style': 'italic', 'font-size': 11, fill: t.inkSoft }, `№ ${text.seed}`),
  ]
}
