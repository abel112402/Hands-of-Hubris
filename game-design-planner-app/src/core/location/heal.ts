import { reproject } from './attach'
import { kindInfo } from './objects'
import { replaceObjects } from './order'
import { getLocationType } from './registry'
import { inRoom } from './rooms'
import type { LocationMap, MapObject } from './types'

/**
 * Keeps a map whole after a hand edit, in one step with the edit (so one undo undoes both):
 * 1. Things standing inside a room that was moved (furniture, creatures, pillars, lights) move with it.
 * 2. Things attached to an edited object (attach.ts) go back to their place on it.
 * 3. The map type's own repair runs (`LocationTypeDef.heal`): corridors follow their rooms, a house's
 *    neighbouring rooms follow a shared wall, bridges and gates find their crossing again.
 * 4. Whatever is attached to the objects that step 3 changed follows them too.
 * Pinned objects never move: they were placed by hand.
 */
export function heal(map: LocationMap, before: MapObject, after: MapObject): LocationMap {
  let out = carry(map, before, after)
  out = follow(out, new Set([after.id]))
  const hook = getLocationType(map.type)?.heal
  if (!hook) return out
  const fixed = hook(out, before, after)
  return fixed === out ? out : follow(fixed, changedIds(out, fixed))
}

/** Ids of objects that are new or different in `b`. */
function changedIds(a: LocationMap, b: LocationMap): Set<string> {
  const out = new Set<string>()
  for (const [id, layer] of Object.entries(b.layers)) {
    if (a.layers[id] === layer) continue
    const old = new Map((a.layers[id]?.objects ?? []).map((o) => [o.id, o]))
    for (const o of layer.objects) if (old.get(o.id) !== o) out.add(o.id)
  }
  return out
}

const replace = (map: LocationMap, changed: Map<string, MapObject>) => replaceObjects(map, changed, getLocationType(map.type))

/** Moves the contents of a room that was moved (not resized) by the same amount. */
function carry(map: LocationMap, before: MapObject, after: MapObject): LocationMap {
  if (!kindInfo(after.kind)?.carries || before.w !== after.w || before.h !== after.h || (before.rot ?? 0) !== (after.rot ?? 0)) return map
  const [dx, dy] = [after.x - before.x, after.y - before.y]
  if (!dx && !dy) return map
  const changed = new Map<string, MapObject>()
  for (const layer of Object.values(map.layers)) {
    for (const o of layer.objects) {
      if (o.id === after.id || o.pinned || o.attach || o.points || o.kind === after.kind || kindInfo(o.kind)?.shape === 'backdrop') continue
      if (inRoom(before, [o.x, o.y])) changed.set(o.id, { ...o, x: o.x + dx, y: o.y + dy })
    }
  }
  return replace(map, changed)
}

/** Puts everything attached to the given objects back in its place on them; twice, for things attached to those. */
function follow(map: LocationMap, ids: Set<string>): LocationMap {
  let out = map
  let hosts = ids
  for (let round = 0; round < 2 && hosts.size; round++) {
    const all = Object.values(out.layers).flatMap((l) => l.objects)
    const byId = new Map(all.map((o) => [o.id, o]))
    const changed = new Map<string, MapObject>()
    for (const o of all) {
      if (!o.attach || !hosts.has(o.attach.to)) continue
      const host = byId.get(o.attach.to)
      const moved = host && reproject(o, host)
      if (moved && (moved.x !== o.x || moved.y !== o.y || moved.rot !== o.rot)) changed.set(o.id, moved)
    }
    out = replace(out, changed)
    hosts = new Set(changed.keys())
  }
  return out
}
