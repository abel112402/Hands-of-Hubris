import { z } from 'zod'
import type { Entity } from '../model/types'
import { decodeRle, MAX_CELLS_PER_SIDE } from './raster'
import { ROAD_RANKS, SPAWN_ROLES, TIMES_OF_DAY, type LocationMap, type MapSnapshot } from './types'

/**
 * Stored maps come from project files, so they are parsed before use; anything malformed is dropped. A version 1
 * map is read as version 2: every field version 2 added is optional. An invalid optional field is dropped on its
 * own, so one bad value never costs the object or the map.
 */
export const MAX_OBJECTS_PER_LAYER = 2000
export const MAX_SNAPSHOTS = 10
const MAX_POINTS = 400
const LIMIT = 100_000

const coord = z.number().finite().min(-LIMIT).max(LIMIT)
const point = z.tuple([coord, coord])
const id = z.string().min(1).max(80)
const text = z.string().max(200)
/** An optional field that turns into "missing" instead of failing its parent. */
const opt = <T extends z.ZodType>(t: T) => t.optional().catch(undefined)
const poly = z.array(point).min(3).max(MAX_POINTS)

const object = z.object({
  id,
  kind: z.string().min(1).max(40),
  x: coord,
  y: coord,
  w: coord.optional(),
  h: coord.optional(),
  rot: coord.optional(),
  points: z.array(point).max(MAX_POINTS).optional(),
  ctrl: z.array(point).max(60).optional(),
  label: text.optional(),
  refId: z.string().max(80).optional(),
  props: z.record(z.string(), z.union([text, z.number().finite(), z.boolean()])).optional(),
  pinned: z.literal(true).optional(),
  rank: opt(z.enum(ROAD_RANKS)),
  zone: opt(id),
  attach: opt(z.object({ to: id, t: z.number().min(0).max(1), side: z.number().int().min(-1).max(1).optional(), off: z.number().min(0).max(2000).optional(), rot: z.number().min(-720).max(720).optional() })),
  link: opt(z.object({ locationId: id, anchor: z.string().max(80).optional() })),
  lock: opt(id),
  key: opt(id),
  secret: opt(z.literal(true)),
  light: opt(z.object({ radius: z.number().min(1).max(2000), color: z.string().regex(/^#[0-9a-f]{6}$/i).optional(), intensity: z.number().min(0).max(1).optional() })),
  spawn: opt(z.object({ role: z.enum(SPAWN_ROLES), refId: z.string().max(80).optional(), count: z.number().int().min(1).max(99).optional() })),
})
const flag = z.literal(true).optional().catch(undefined)
const layer = z.object({
  nonce: z.number().int().min(0).catch(0),
  hidden: flag,
  locked: flag,
  stale: flag,
  objects: z.array(z.unknown()).catch([]),
})
const side = z.number().int().min(1).max(MAX_CELLS_PER_SIDE)
const field = z
  .object({ cell: z.number().min(1).max(500), cols: side, rows: side, rle: z.string().max(MAX_CELLS_PER_SIDE * MAX_CELLS_PER_SIDE * 3) })
  .refine((f) => decodeRle(f.rle, f.cols * f.rows) !== null)
/** Keeps the entries of a list that parse, up to `max`. */
const listOf = <T extends z.ZodType>(item: T, max: number) =>
  opt(z.array(z.unknown()).transform((xs) => xs.slice(0, max).flatMap((x) => {
    const r = item.safeParse(x)
    return r.success ? [r.data as z.output<T>] : []
  })))
const map = z.object({
  v: z.union([z.literal(1), z.literal(2)]),
  type: z.string().max(40),
  seed: z.number().int().min(0),
  w: z.number().finite().min(100).max(4000),
  h: z.number().finite().min(100).max(4000),
  layers: z.record(z.string().max(40), z.unknown()),
  theme: opt(z.string().min(1).max(40)),
  params: opt(z.record(z.string().max(40), z.number().finite()).refine((r) => Object.keys(r).length <= 40)),
  fields: opt(z.record(z.string().max(40), z.unknown()).transform((r) => {
    const out: Record<string, z.output<typeof field>> = {}
    for (const [k, v] of Object.entries(r).slice(0, 8)) {
      const f = field.safeParse(v)
      if (f.success) out[k] = f.data
    }
    return out
  })),
  masks: listOf(z.object({ id, poly, label: text.optional() }), 50),
  env: opt(z.object({ sun: opt(z.number().min(0).max(360)), time: opt(z.enum(TIMES_OF_DAY)) })),
  snapshots: opt(z.array(z.unknown())),
  anchorStamp: opt(z.number().int().min(0)),
})

/** Drops keys whose value is undefined, so parsed data equals the data that was stored. */
const compact = <T extends Record<string, unknown>>(o: T): T => {
  for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k]
  return o
}

function parseBody(value: unknown): Omit<LocationMap, 'snapshots'> & { rawSnapshots?: unknown[] } | null {
  const m = map.safeParse(value)
  if (!m.success) return null
  const layers: LocationMap['layers'] = {}
  for (const [lid, raw] of Object.entries(m.data.layers)) {
    const l = layer.safeParse(raw)
    if (!l.success) continue
    const objects = l.data.objects
      .slice(0, MAX_OBJECTS_PER_LAYER)
      .map((o) => object.safeParse(o))
      .flatMap((r) => (r.success ? [compact(r.data)] : []))
    layers[lid] = compact({ nonce: l.data.nonce, hidden: l.data.hidden, locked: l.data.locked, stale: l.data.stale, objects })
  }
  const d = m.data
  const fields = d.fields && Object.keys(d.fields).length ? d.fields : undefined
  return compact({
    v: 2 as const,
    type: d.type,
    seed: d.seed,
    w: d.w,
    h: d.h,
    layers,
    theme: d.theme,
    params: d.params,
    fields,
    masks: d.masks?.length ? d.masks : undefined,
    env: d.env && compact(d.env) && Object.keys(d.env).length ? d.env : undefined,
    anchorStamp: d.anchorStamp,
    rawSnapshots: d.snapshots,
  })
}

/** Validates an untrusted value as a map. Bad objects and layers are skipped rather than failing the whole map. */
export function parseMap(value: unknown): LocationMap | null {
  const body = parseBody(value)
  if (!body) return null
  const { rawSnapshots, ...rest } = body
  const out: LocationMap = rest
  const snapshots = (rawSnapshots ?? []).slice(0, MAX_SNAPSHOTS).flatMap((s): MapSnapshot[] => {
    const head = z.object({ id, label: text, at: z.string().max(40), map: z.unknown() }).safeParse(s)
    const inner = head.success ? parseBody(head.data.map) : null
    if (!head.success || !inner) return []
    // A snapshot never holds snapshots of its own.
    const snap = { ...inner }
    delete snap.rawSnapshots
    return [{ id: head.data.id, label: head.data.label, at: head.data.at, map: snap }]
  })
  if (snapshots.length) out.snapshots = snapshots
  return out
}

const cache = new WeakMap<object, LocationMap | null>()

/** The map stored on a location, validated. Cached per stored object, which is immutable in the store. */
export function mapOf(location: Entity | undefined): LocationMap | null {
  const raw = location?.map
  if (!raw || typeof raw !== 'object') return null
  if (!cache.has(raw)) cache.set(raw, parseMap(raw))
  return cache.get(raw) ?? null
}
