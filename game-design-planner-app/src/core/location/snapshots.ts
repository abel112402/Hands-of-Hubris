import { MAX_SNAPSHOTS } from './schema'
import type { LocationMap, MapSnapshot } from './types'

/**
 * Named versions of one map, kept on the map itself (at most MAX_SNAPSHOTS, oldest dropped first). Restoring one
 * replaces the map with it and keeps the list, so a restore is a normal, undoable edit and the designer can try
 * another direction from any saved point.
 */
const bodyOf = (map: LocationMap): MapSnapshot['map'] => {
  const body: LocationMap = { ...map }
  delete body.snapshots
  return body
}

export function saveSnapshot(map: LocationMap, id: string, label: string, at: string): LocationMap {
  const name = label.trim() || `Version ${(map.snapshots?.length ?? 0) + 1}`
  const list = [...(map.snapshots ?? []), { id, label: name.slice(0, 80), at, map: bodyOf(map) }]
  return { ...map, snapshots: list.slice(-MAX_SNAPSHOTS) }
}

export function restoreSnapshot(map: LocationMap, id: string): LocationMap {
  const snap = map.snapshots?.find((s) => s.id === id)
  return snap ? { ...snap.map, ...(map.snapshots ? { snapshots: map.snapshots } : {}) } : map
}

export function removeSnapshot(map: LocationMap, id: string): LocationMap {
  const snapshots = (map.snapshots ?? []).filter((s) => s.id !== id)
  const next: LocationMap = { ...map, snapshots }
  if (!snapshots.length) delete next.snapshots
  return next
}
