import type { Rng } from './rng'
import type { MapPoint as Pt } from './types'

/** Plain 2D helpers shared by the generators and the renderer. Angles are radians unless a name says `deg`. */
export const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1])
export const toDeg = (rad: number) => (rad * 180) / Math.PI
export const toRad = (deg: number) => (deg * Math.PI) / 180
const num = (n: number) => String(Math.round(n * 10) / 10)

export function polylineLength(pts: Pt[]): number {
  let total = 0
  for (let i = 1; i < pts.length; i++) total += dist(pts[i - 1], pts[i])
  return total
}

/** The point `d` along a polyline from its start, and the direction of travel there. */
export function pointAlong(pts: Pt[], d: number): { p: Pt; angle: number } {
  let left = Math.max(0, d)
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]
    const b = pts[i]
    const len = dist(a, b)
    if (left <= len || i === pts.length - 1) {
      const t = len ? Math.min(1, left / len) : 0
      return { p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], angle: Math.atan2(b[1] - a[1], b[0] - a[0]) }
    }
    left -= len
  }
  return { p: pts[0] ?? [0, 0], angle: 0 }
}

function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const len2 = dx * dx + dy * dy
  const t = len2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2)) : 0
  return Math.hypot(p[0] - (a[0] + dx * t), p[1] - (a[1] + dy * t))
}

export function distToPolyline(p: Pt, pts: Pt[], closed = false): number {
  let best = Infinity
  for (let i = 1; i < pts.length; i++) best = Math.min(best, distToSegment(p, pts[i - 1], pts[i]))
  if (closed && pts.length > 2) best = Math.min(best, distToSegment(p, pts[pts.length - 1], pts[0]))
  return best
}

function segmentCrossing(a: Pt, b: Pt, c: Pt, d: Pt): Pt | null {
  const rx = b[0] - a[0]
  const ry = b[1] - a[1]
  const sx = d[0] - c[0]
  const sy = d[1] - c[1]
  const den = rx * sy - ry * sx
  if (!den) return null
  const t = ((c[0] - a[0]) * sy - (c[1] - a[1]) * sx) / den
  const u = ((c[0] - a[0]) * ry - (c[1] - a[1]) * rx) / den
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? [a[0] + rx * t, a[1] + ry * t] : null
}

/** Where polyline `a` crosses polyline `b`, with the direction of `a` at each crossing. */
export function crossings(a: Pt[], b: Pt[], bClosed = false): { p: Pt; angle: number }[] {
  const out: { p: Pt; angle: number }[] = []
  const bs = bClosed && b.length > 2 ? [...b, b[0]] : b
  for (let i = 1; i < a.length; i++) {
    for (let j = 1; j < bs.length; j++) {
      const p = segmentCrossing(a[i - 1], a[i], bs[j - 1], bs[j])
      if (p) out.push({ p, angle: Math.atan2(a[i][1] - a[i - 1][1], a[i][0] - a[i - 1][0]) })
    }
  }
  return out
}

export function inPolygon(p: Pt, poly: Pt[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** An irregular closed outline around a centre: `n` points on an ellipse, each pushed in or out by up to `jitter`. */
export function blob(cx: number, cy: number, rx: number, ry: number, rand: Rng, n = 10, jitter = 0.22): Pt[] {
  const start = rand.range(0, Math.PI * 2)
  return Array.from({ length: n }, (_, i) => {
    const a = start + (i / n) * Math.PI * 2
    const k = 1 + rand.range(-jitter, jitter)
    return [cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k] as Pt
  })
}

const at = (pts: Pt[], i: number, closed: boolean): Pt =>
  closed ? pts[((i % pts.length) + pts.length) % pts.length] : pts[Math.max(0, Math.min(pts.length - 1, i))]

/** Spacing of the points stored for a curve. */
export const CURVE_STEP = 26

/** Points every `step` along the Catmull-Rom curve through `pts` (back to the start when `closed`), so generators and the renderer agree on a curve. */
export function sampleSpline(pts: Pt[], step: number, closed = false): Pt[] {
  if (pts.length < 3) return pts.slice()
  const out: Pt[] = [pts[0]]
  for (let i = 0; i < (closed ? pts.length : pts.length - 1); i++) {
    const [p0, p1, p2, p3] = [at(pts, i - 1, closed), at(pts, i, closed), at(pts, i + 1, closed), at(pts, i + 2, closed)]
    const n = Math.max(1, Math.ceil(dist(p1, p2) / step))
    for (let k = 1; k <= n; k++) {
      const t = k / n
      const t2 = t * t
      const t3 = t2 * t
      const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (3 * b - a - 3 * c + d) * t3)
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])])
    }
  }
  // A closed curve ends where it began; the outline does not repeat that point.
  if (closed) out.pop()
  return out
}

/** SVG path data: straight segments. */
export function polyPath(pts: Pt[], closed = false): string {
  if (!pts.length) return ''
  return 'M' + pts.map((p) => `${num(p[0])},${num(p[1])}`).join('L') + (closed ? 'Z' : '')
}

/** SVG path data: a smooth curve through the points (Catmull-Rom as cubic Béziers). */
export function smoothPath(pts: Pt[], closed = false): string {
  if (pts.length < 3) return polyPath(pts, closed)
  const last = closed ? pts.length : pts.length - 1
  let d = `M${num(pts[0][0])},${num(pts[0][1])}`
  for (let i = 0; i < last; i++) {
    const [p0, p1, p2, p3] = [at(pts, i - 1, closed), at(pts, i, closed), at(pts, i + 1, closed), at(pts, i + 2, closed)]
    d += `C${num(p1[0] + (p2[0] - p0[0]) / 6)},${num(p1[1] + (p2[1] - p0[1]) / 6)} ${num(p2[0] - (p3[0] - p1[0]) / 6)},${num(p2[1] - (p3[1] - p1[1]) / 6)} ${num(p2[0])},${num(p2[1])}`
  }
  return d + (closed ? 'Z' : '')
}

/** A closed outline with every point nudged by up to `amp`: the unsteady hand of an inked line. */
export function wobble(pts: Pt[], rand: Rng, amp: number): Pt[] {
  return pts.map((p) => [p[0] + rand.range(-amp, amp), p[1] + rand.range(-amp, amp)] as Pt)
}

/** Rough radius of a box-like object, for cheap overlap tests. */
export const radiusOf = (o: { w?: number; h?: number }) => Math.hypot(o.w ?? 0, o.h ?? 0) / 2
