import { dist } from './geometry'
import type { Rng } from './rng'
import type { MapPoint as Pt } from './types'

/**
 * The plan of a dungeon before it is drawn: which rooms link to which, where the entrance and the boss are, which
 * links are locked and where each key lies. Planning first and drawing second is what makes the layout follow
 * the level-design inputs (loops, branching, dead ends, locks) and keeps every key in front of its lock.
 *
 * 1. A spanning tree grows from the entrance; `chain` is how often it extends from the room it just added (long
 *    corridors of rooms) rather than from any room (many branches).
 * 2. The boss takes the room deepest in the tree; secret rooms take small dead ends.
 * 3. Locks go on the way from the entrance to the boss, the last one on the boss room's door. A room's region is
 *    the number of locks between it and the entrance.
 * 4. Loops are added only between rooms of the same region, so no loop ever goes round a lock.
 * 5. The key to each lock lies in a room of the region in front of it, a dead end off the main way when possible.
 */
export type PlanRoom = { at: Pt; area: number }
export type PlanOptions = {
  /** Extra links that close loops. */
  loops: number
  /** 0–1: share of growth steps that extend the newest room. */
  chain: number
  deadEnds: 'Few' | 'Some' | 'Many'
  secret: number
  treasure: number
  locks: number
  /** Longest loop link, in map units. */
  reach: number
}
export type PlanEdge = { a: number; b: number; lock?: string; secret?: true }
export type MissionPlan = {
  entrance: number
  boss: number
  /** `a` is the room nearer the entrance. */
  edges: PlanEdge[]
  roles: string[]
  /** Locks crossed on the way from the entrance. */
  region: number[]
  keys: { lock: string; room: number }[]
}

export const LOCK_NAMES = ['red', 'blue', 'green', 'gold'] as const

function treeDepth(n: number, edges: PlanEdge[], from: number): number[] {
  const depth = Array<number>(n).fill(-1)
  depth[from] = 0
  const queue = [from]
  while (queue.length) {
    const i = queue.shift()!
    for (const e of edges) {
      const j = e.a === i ? e.b : e.b === i ? e.a : -1
      if (j >= 0 && depth[j] < 0) {
        depth[j] = depth[i] + 1
        queue.push(j)
      }
    }
  }
  return depth
}

export function planMission(rooms: PlanRoom[], rand: Rng, o: PlanOptions): MissionPlan {
  const n = rooms.length
  const entrance = rooms.reduce((best, r, i) => (r.at[1] > rooms[best].at[1] ? i : best), 0)
  if (n < 2) return { entrance, boss: entrance, edges: [], roles: rooms.map(() => 'entrance'), region: rooms.map(() => 0), keys: [] }
  const d = (i: number, j: number) => dist(rooms[i].at, rooms[j].at)
  // Each room may link to its four nearest rooms; that keeps links short and mostly uncrossed.
  const near = rooms.map((_, i) =>
    rooms
      .map((__, j) => j)
      .filter((j) => j !== i)
      .sort((p, q) => d(i, p) - d(i, q))
      .slice(0, 4),
  )

  // Secret rooms are the smallest; they stay out of the tree and hang off it as dead ends afterwards.
  const secret = new Set(
    rooms
      .map((_, i) => i)
      .filter((i) => i !== entrance)
      .sort((p, q) => rooms[p].area - rooms[q].area)
      .slice(0, Math.max(0, Math.min(o.secret, n - 2))),
  )

  // 1. The tree.
  const joined = new Set([entrance])
  const tree: PlanEdge[] = []
  let newest = entrance
  const open = n - secret.size
  while (joined.size < open) {
    const from = rand.chance(o.chain) ? newest : rand.pick([...joined])
    let to = near[from].find((j) => !joined.has(j) && !secret.has(j))
    let src = from
    if (to === undefined) {
      // Nothing free near that room: the shortest link from any joined room to any free one.
      let best: [number, number, number] | null = null
      for (const i of joined) for (let j = 0; j < n; j++) if (!joined.has(j) && !secret.has(j) && (!best || d(i, j) < best[2])) best = [i, j, d(i, j)]
      ;[src, to] = [best![0], best![1]]
    }
    tree.push({ a: src, b: to })
    joined.add(to)
    newest = to
  }
  const degree = (edges: PlanEdge[], i: number) => edges.filter((e) => e.a === i || e.b === i).length

  // 2. The boss takes the deepest room; then each secret room joins its nearest room as a dead end.
  const deep = treeDepth(n, tree, entrance)
  const boss = rooms.reduce(
    (best, _, i) => (i !== entrance && !secret.has(i) && (deep[i] > deep[best] || (deep[i] === deep[best] && d(i, entrance) > d(best, entrance))) ? i : best),
    rooms.findIndex((_, i) => i !== entrance && !secret.has(i)),
  )
  for (const s of secret) {
    const host = [...joined].filter((i) => i !== boss).sort((p, q) => d(s, p) - d(s, q))[0] ?? entrance
    tree.push({ a: host, b: s, secret: true })
  }
  const depth = treeDepth(n, tree, entrance)

  // 3. Locks on the way to the boss.
  const way: PlanEdge[] = []
  for (let at = boss; at !== entrance; ) {
    const e = tree.find((x) => x.b === at)!
    way.unshift(e)
    at = e.a
  }
  const lockCount = Math.min(o.locks, way.length, LOCK_NAMES.length)
  for (let k = 1; k <= lockCount; k++) way[Math.round((k * way.length) / lockCount) - 1].lock = LOCK_NAMES[k - 1]
  const region = Array<number>(n).fill(0)
  const order = [...rooms.keys()].sort((p, q) => depth[p] - depth[q])
  for (const i of order) {
    const up = tree.find((e) => e.b === i)
    if (up) region[i] = region[up.a] + (up.lock ? 1 : 0)
  }

  // 4. Loops inside a region, at least three links round, never through a secret room.
  const leaf = (i: number) => degree(tree, i) === 1 && i !== entrance
  const linked = (i: number, j: number) => tree.some((e) => (e.a === i && e.b === j) || (e.a === j && e.b === i))
  const candidates: [number, number, number][] = []
  for (let i = 0; i < n; i++) {
    for (const j of near[i]) {
      if (j <= i && near[j].includes(i)) continue
      if (linked(i, j) || secret.has(i) || secret.has(j) || region[i] !== region[j] || d(i, j) > o.reach) continue
      if (treeHops(tree, i, j) < 3) continue
      const leafy = (leaf(i) ? 1 : 0) + (leaf(j) ? 1 : 0)
      const bias = o.deadEnds === 'Few' ? -leafy : o.deadEnds === 'Many' ? leafy : 0
      candidates.push([i, j, bias * 1000 + d(i, j) * rand.range(0.8, 1.2)])
    }
  }
  candidates.sort((p, q) => p[2] - q[2])
  const extra: PlanEdge[] = []
  for (const [i, j] of candidates) {
    if (extra.length >= o.loops) break
    if (extra.some((e) => (e.a === i && e.b === j) || (e.a === j && e.b === i))) continue
    extra.push(depth[i] <= depth[j] ? { a: i, b: j } : { a: j, b: i })
  }
  const edges = [...tree, ...extra]

  // Roles: treasure in the smallest dead ends that are left, else in the smallest rooms off the main way.
  const roles: string[] = rooms.map((_, i) => (i === entrance ? 'entrance' : i === boss ? 'boss' : secret.has(i) ? 'secret' : 'room'))
  const wayRooms = new Set(way.flatMap((e) => [e.a, e.b]))
  rooms
    .map((_, i) => i)
    .filter((i) => roles[i] === 'room')
    .sort((p, q) => Number(degree(edges, q) === 1) - Number(degree(edges, p) === 1) || Number(wayRooms.has(p)) - Number(wayRooms.has(q)) || rooms[p].area - rooms[q].area)
    .slice(0, o.treasure)
    .forEach((i) => (roles[i] = 'treasure'))

  // 5. Keys.
  const onWay = new Set(way.flatMap((e) => [e.a, e.b]))
  const keys: MissionPlan['keys'] = []
  for (let k = 0; k < lockCount; k++) {
    const taken = new Set(keys.map((x) => x.room))
    const fits = (i: number) => region[i] <= k && !secret.has(i) && !taken.has(i)
    const score = (i: number) => (region[i] === k ? 100 : 0) + (i === entrance ? -50 : 0) + (onWay.has(i) ? 0 : 20) + (degree(edges, i) === 1 ? 10 : 0) + depth[i]
    const room = rooms.map((_, i) => i).filter(fits).sort((p, q) => score(q) - score(p))[0] ?? entrance
    keys.push({ lock: LOCK_NAMES[k], room })
  }
  return { entrance, boss, edges, roles, region, keys }
}

/** Links between two rooms along the tree. */
function treeHops(tree: PlanEdge[], i: number, j: number): number {
  const n = Math.max(...tree.flatMap((e) => [e.a, e.b])) + 1
  return treeDepth(n, tree, i)[j]
}
