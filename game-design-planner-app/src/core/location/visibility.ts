import { dist } from './geometry'
import type { LocationMap, MapObject } from './types'

/**
 * The player's version of a map: what a game master knows and players should not see is left out. That is every
 * object marked `secret` (secret rooms, their doors and corridors, traps), creatures and spawn points, and keys,
 * plus the labels that name what was left out.
 */
const GM_ONLY_KINDS = new Set(['marker', 'trap', 'key'])
export const gmOnly = (o: MapObject) => o.secret === true || GM_ONLY_KINDS.has(o.kind) || !!o.spawn

export function playerView(map: LocationMap): LocationMap {
  const hidden = Object.values(map.layers).flatMap((l) => l.objects).filter(gmOnly)
  // A label goes too when it names a hidden object close by.
  const names = (o: MapObject) => o.kind === 'label' && hidden.some((h) => h.label === o.label && dist([h.x, h.y], [o.x, o.y]) < Math.max(60, (h.h ?? 0) + 30))
  const layers = Object.fromEntries(
    Object.entries(map.layers).map(([id, l]) => [id, { ...l, objects: l.objects.filter((o) => !gmOnly(o) && !names(o)) }]),
  )
  return { ...map, layers }
}
