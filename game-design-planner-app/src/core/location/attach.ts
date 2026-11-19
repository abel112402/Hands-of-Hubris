import { pointAlong, polylineLength, toDeg } from './geometry'
import { kindInfo } from './objects'
import { roomOutline } from './rooms'
import type { MapObject, MapPoint as Pt } from './types'

/**
 * Glue between objects: a door on a room's wall, a house beside a road, a bridge on a road, a gate on a town wall.
 * The attached object stores where it sits along its host (`attach.t`, 0–1 of the host's outline or line) and, for
 * things beside a line, which side and how far (`side`, `off`). When the host is edited, `reproject` puts the
 * object back in the same place relative to the host.
 */
export type Attach = NonNullable<MapObject['attach']>

/** The line an object can carry others along: a box's outline (closed), a curve's points, an outline's points. */
export function hostPath(host: MapObject): { pts: Pt[]; closed: boolean } | null {
  const shape = kindInfo(host.kind)?.shape
  if (host.points?.length && host.points.length > 1) return { pts: host.points, closed: shape === 'outline' }
  if (host.w && host.h) return { pts: roomOutline(host), closed: true }
  return null
}

const ring = (p: { pts: Pt[]; closed: boolean }) => (p.closed ? [...p.pts, p.pts[0]] : p.pts)

/** Where along a host's path the point nearest to `p` lies (0–1), which side of it `p` is on and how far. */
export function attachAt(host: MapObject, p: Pt): Attach | null {
  const path = hostPath(host)
  if (!path) return null
  const pts = ring(path)
  const total = polylineLength(pts)
  if (!total) return null
  let [best, at, walked, side] = [Infinity, 0, 0, 1]
  for (let i = 1; i < pts.length; i++) {
    const [a, b] = [pts[i - 1], pts[i]]
    const [dx, dy] = [b[0] - a[0], b[1] - a[1]]
    const len = Math.hypot(dx, dy)
    const t = len ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (len * len))) : 0
    const q: Pt = [a[0] + dx * t, a[1] + dy * t]
    const d = Math.hypot(p[0] - q[0], p[1] - q[1])
    if (d < best) {
      best = d
      at = walked + len * t
      side = dx * (p[1] - a[1]) - dy * (p[0] - a[0]) >= 0 ? 1 : -1
    }
    walked += len
  }
  const out: Attach = { to: host.id, t: Math.round((at / total) * 10000) / 10000 }
  if (best > 1) Object.assign(out, { side, off: Math.round(best) })
  return out
}

/**
 * The object moved back to its place on an edited host; unchanged when it is pinned or the host has no path. Its
 * turn follows the host's change of direction there, so a gate stays across its road and a door along its wall.
 */
export function reproject(o: MapObject, host: MapObject): MapObject {
  if (!o.attach || o.pinned) return o
  const path = hostPath(host)
  if (!path) return o
  const pts = ring(path)
  const { p, angle } = pointAlong(pts, o.attach.t * polylineLength(pts))
  const off = (o.attach.off ?? 0) * (o.attach.side ?? 1)
  // The normal on the side `side` points to (left of the direction of travel when positive).
  const at: Pt = [p[0] - Math.sin(angle) * off, p[1] + Math.cos(angle) * off]
  const along = toDeg(angle)
  const out: MapObject = { ...o, x: Math.round(at[0]) || 0, y: Math.round(at[1]) || 0 }
  if (o.rot !== undefined && !kindInfo(o.kind)?.fixedAngle) {
    // Only the host's change of direction is applied; the object's own turn relative to the host stays.
    let before = o.attach.rot ?? along
    // The nearest equivalent direction, so a wrap-around at ±180° is not read as a half turn.
    while (along - before > 180) before += 360
    while (before - along > 180) before -= 360
    out.rot = Math.round(o.rot + (along - before)) || 0
    out.attach = { ...o.attach, rot: Math.round(along * 100) / 100 }
  }
  return out
}

/** `attach` for a new object at `p` on `host`, including the host's direction there (so later turns can follow). */
export function attachFor(host: MapObject, p: Pt): Attach | undefined {
  const a = attachAt(host, p)
  if (!a) return undefined
  const path = hostPath(host)!
  const pts = ring(path)
  const { angle } = pointAlong(pts, a.t * polylineLength(pts))
  return { ...a, rot: Math.round(toDeg(angle) * 100) / 100 }
}
