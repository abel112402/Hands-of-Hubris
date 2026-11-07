import { threat } from './combat'
import type { CanvasItem, Entity, Project } from './model/types'

export const WORLD_DOC = 'design.world'
export const ROLE_ORDER = ['Starter', 'Early', 'Mid', 'Late', 'Final']
/** A biome whose median enemy threat is this many times the previous stage's is flagged as a spike. */
export const SPIKE_RATIO = 3
/** Logical size of the map sketch canvas (see CanvasEditor). */
export const MAP_W = 1000
export const MAP_H = 640

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const ids = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
const filled = (v: unknown) => typeof v === 'string' && v.trim() !== ''
const listOf = (project: Project, docId: string, section: string): Entity[] => {
  const d = project.documents[docId]?.data[section]
  return Array.isArray(d) ? d : []
}
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null
}

const data = (project: Project) => project.documents[WORLD_DOC]?.data ?? {}
const biomes = (project: Project): any[] => data(project).biomes ?? []
const nodes = (project: Project): any[] => data(project).progression?.nodes ?? []
const edges = (project: Project): any[] => data(project).progression?.edges ?? []
const mapItems = (project: Project): CanvasItem[] => (Array.isArray(data(project).map?.items) ? data(project).map.items : [])
const zones = (project: Project): any[] => mapItems(project).filter((i: any) => i.kind === 'Biome zone')

export const biomeList = (project: Project): Entity[] => biomes(project)
export const worldList = (project: Project, section: string) => listOf(project, WORLD_DOC, section)
export const nameOf = (e: Entity | undefined) => (e ? String(e.name ?? '') || '(unnamed)' : '⚠ missing')

/** Starter = 0 … Final = 4, or null without a role. */
export function roleIndex(b: Entity): number | null {
  const i = ROLE_ORDER.indexOf(b.role)
  return i >= 0 ? i : null
}

/** Biomes by role (no role last), keeping document order within a role. */
export const biomesInOrder = (project: Project): Entity[] =>
  biomeList(project)
    .map((b, i) => ({ b, i }))
    .sort((x, y) => (roleIndex(x.b) ?? 99) - (roleIndex(y.b) ?? 99) || x.i - y.i)
    .map((x) => x.b)

const ENTRY_WORD: Record<string, string> = { Story: 'story', Faction: 'faction', Boss: 'boss' }

/** Nodes that stand for a biome: tagged with its id. */
const nodesOf = (project: Project, biomeId: string) => nodes(project).filter((n) => n.refId === biomeId)

/**
 * Biomes nothing leads into: no gate placed in another biome (see unlockPath) and no incoming progression-graph arrow.
 * Starters and optional biomes are exempt.
 */
export function unreachedBiomes(project: Project) {
  const linked = new Set(unlockPath(project).links.filter((l) => l.from && l.from !== l.to).map((l) => l.to))
  return biomes(project).filter((b) => {
    if (b.optional || b.role === 'Starter' || linked.has(b.id)) return false
    const ns = nodesOf(project, b.id)
    return ns.length === 0 || !ns.some((n) => edges(project).some((e) => e.target === n.id))
  })
}

export const biomesWithoutEntry = (project: Project) =>
  biomes(project).filter((b) => b.role !== 'Starter' && !b.optional && (!b.entryType || b.entryType === 'None') && !String(b.entry ?? '').trim())

export const biomesWithoutZone = (project: Project) =>
  biomes(project).filter((b) => !zones(project).some((z) => z.refId === b.id))

export const unlinkedZones = (project: Project) => {
  const ids = new Set(biomes(project).map((b) => b.id))
  return zones(project).filter((z) => !z.refId || !ids.has(z.refId))
}

/** A biome whose structured entry type names a kind of unlock that none of its incoming connections use. */
export function graphDisagreements(project: Project) {
  return biomes(project).filter((b) => {
    const word = ENTRY_WORD[b.entryType]
    if (!word) return false
    const incoming = nodesOf(project, b.id).flatMap((n) => edges(project).filter((e) => e.target === n.id))
    return incoming.length > 0 && !incoming.some((e) => String(e.kind ?? '').includes(word))
  })
}

export const outpostsMissing = (project: Project) => {
  const outposts: any[] = data(project).outposts ?? []
  const lacks = (o: any, refs: string, text: string) => !(o[refs]?.length) && !String(o[text] ?? '').trim()
  return {
    noReward: outposts.filter((o) => lacks(o, 'rewardRefs', 'reward')),
    noDefenders: outposts.filter((o) => lacks(o, 'defenderRefs', 'defenders')),
  }
}

/** Biomes with no enemy or boss on either side of the link (the biome's lists or the Combat entry's Biome field). */
export const biomesWithoutEnemies = (project: Project) =>
  biomes(project).filter((b) => {
    const c = biomeContent(project, b)
    return !c.enemies.length && !c.bosses.length
  })

// ---------- Content per biome ----------

export type BiomeContent = {
  enemies: Entity[]
  bosses: Entity[]
  outposts: Entity[]
  weather: Entity[]
  acts: Entity[]
  quests: Entity[]
}

/** Everything other modules place in a biome: the biome's own lists plus entries whose Biome field points at it. */
export function biomeContent(project: Project, b: Entity): BiomeContent {
  const pick = (list: Entity[], own: string[], match: (e: Entity) => boolean) => list.filter((e) => own.includes(e.id) || match(e))
  return {
    enemies: pick(listOf(project, 'design.combat', 'enemies'), ids(b.enemies), (e) => e.biome === b.id),
    bosses: pick(listOf(project, 'design.combat', 'bosses'), ids(b.bosses), (e) => e.biome === b.id),
    outposts: pick(worldList(project, 'outposts'), ids(b.garrisons), (e) => e.biome === b.id),
    weather: listOf(project, 'design.timeWeather', 'weather').filter((w) => ids(w.biomes).includes(b.id)),
    acts: listOf(project, 'design.story', 'acts').filter((a) => a.biome === b.id || ids(a.extraBiomes).includes(b.id)),
    quests: listOf(project, 'design.story', 'quests').filter((q) => ids(q.locations).includes(b.id)),
  }
}

// ---------- Unlock path ----------

export type UnlockVia = 'boss' | 'quest' | 'faction' | 'graph'

/** One gate on a biome. `from` is the biome where the gate is met (null when it can't be placed, e.g. a faction). */
export type UnlockLink = {
  from: string | null
  to: string
  via: UnlockVia
  gate: string
  gateId?: string
  /** The gate is met in a biome of a later role than the one it opens. */
  backward: boolean
  /** The gate is met inside the biome it opens, so the player can't reach it. */
  inside: boolean
}

export type UnlockPath = {
  links: UnlockLink[]
  /** Unlock wave per reachable biome: 0 = open from the start, 1 = opened by wave-0 biomes, … */
  wave: Map<string, number>
  /** Biomes that never open because a gate sits in a biome that never opens (or inside itself). */
  locked: Entity[]
}

/** Biome a quest happens in: its first location, else its act's main biome. */
function questBiome(project: Project, q: Entity): string | null {
  const loc = ids(q.locations)[0]
  if (loc) return loc
  const act = listOf(project, 'design.story', 'acts').find((a) => a.id === q.act)
  return typeof act?.biome === 'string' && act.biome ? act.biome : null
}

/** Biome a boss lives in: its Biome field, else the first biome that lists it. */
function bossBiome(project: Project, boss: Entity): string | null {
  if (typeof boss.biome === 'string' && boss.biome) return boss.biome
  return biomeList(project).find((b) => ids(b.bosses).includes(boss.id))?.id ?? null
}

/**
 * Gates worked out from each biome's entry condition (authoritative), plus progression-graph arrows between biome
 * nodes that no entry condition already explains. A biome opens once every placed gate's biome is open; gates that
 * can't be placed (factions, quests without a location) are assumed reachable. This is a planning check, not a solver.
 */
export function unlockPath(project: Project): UnlockPath {
  const list = biomeList(project)
  const byId = new Map(list.map((b) => [b.id, b]))
  const bosses = new Map(listOf(project, 'design.combat', 'bosses').map((e) => [e.id, e]))
  const quests = new Map(listOf(project, 'design.story', 'quests').map((e) => [e.id, e]))
  const factions = new Map(listOf(project, 'design.factions', 'factions').map((e) => [e.id, e]))
  const links: UnlockLink[] = []
  const add = (from: string | null, to: Entity, via: UnlockVia, gate: string, gateId?: string) => {
    const src = from ? byId.get(from) : undefined
    const fi = src ? roleIndex(src) : null
    const ti = roleIndex(to)
    links.push({ from: src ? from : null, to: to.id, via, gate, gateId, inside: from === to.id, backward: from !== to.id && fi !== null && ti !== null && fi > ti })
  }
  for (const b of list) {
    for (const id of ids(b.entryBosses)) {
      const boss = bosses.get(id)
      add(boss ? bossBiome(project, boss) : null, b, 'boss', nameOf(boss), id)
    }
    for (const id of ids(b.entryQuests)) {
      const q = quests.get(id)
      add(q ? questBiome(project, q) : null, b, 'quest', nameOf(q), id)
    }
    for (const id of ids(b.entryFactions)) add(null, b, 'faction', nameOf(factions.get(id)), id)
  }
  const nodeBiome = new Map(nodes(project).filter((n) => n.refId && byId.has(n.refId)).map((n) => [n.id, n.refId as string]))
  for (const e of edges(project)) {
    const from = nodeBiome.get(e.source)
    const to = nodeBiome.get(e.target)
    if (!from || !to || from === to) continue
    if (links.some((l) => l.from === from && l.to === to)) continue
    add(from, byId.get(to)!, 'graph', String(e.label || e.kind || 'graph arrow'))
  }

  const wave = new Map<string, number>()
  const placed = (b: Entity) => links.filter((l) => l.to === b.id && l.via !== 'graph' && l.from !== null)
  for (let step = 0; step <= list.length; step++) {
    const opened = list.filter((b) => !wave.has(b.id) && placed(b).every((l) => !l.inside && wave.has(l.from!) && wave.get(l.from!)! < step))
    if (!opened.length && step > 0) break
    for (const b of opened) wave.set(b.id, step)
  }
  return { links, wave, locked: list.filter((b) => !wave.has(b.id)) }
}

// ---------- Threat by biome ----------

export type BiomeThreatRow = {
  biome: Entity
  stage: number | null
  enemies: number
  min: number | null
  median: number | null
  max: number | null
  boss: number | null
  levelMin: number | null
  levelMax: number | null
  flag: 'spike' | 'dip' | null
}

/**
 * Enemy threat (damage per second × HP, from Combat) per biome in role order, with the biome's level range.
 * A dip is a median below an earlier stage's median; a spike is a median over SPIKE_RATIO × the previous stage's.
 */
export function biomeThreat(project: Project): BiomeThreatRow[] {
  const rows: BiomeThreatRow[] = biomesInOrder(project).map((biome) => {
    const c = biomeContent(project, biome)
    const ts = c.enemies.map(threat).filter(isNum)
    const bs = c.bosses.map(threat).filter(isNum)
    return {
      biome,
      stage: roleIndex(biome),
      enemies: c.enemies.length,
      min: ts.length ? Math.min(...ts) : null,
      median: median(ts),
      max: ts.length ? Math.max(...ts) : null,
      boss: bs.length ? Math.max(...bs) : null,
      levelMin: isNum(biome.levelMin) ? biome.levelMin : null,
      levelMax: isNum(biome.levelMax) ? biome.levelMax : isNum(biome.levelMin) ? biome.levelMin : null,
      flag: null,
    }
  })
  for (const r of rows) {
    if (r.stage === null || r.median === null) continue
    const earlier = rows.filter((x) => x.stage !== null && x.stage < r.stage! && x.median !== null)
    if (!earlier.length) continue
    const prevStage = Math.max(...earlier.map((x) => x.stage!))
    const prev = median(earlier.filter((x) => x.stage === prevStage).map((x) => x.median!))!
    if (earlier.some((x) => r.median! < x.median!)) r.flag = 'dip'
    else if (prev > 0 && r.median > prev * SPIKE_RATIO) r.flag = 'spike'
  }
  return rows
}

/** Biomes whose level range starts below the start of a biome from an earlier role. */
export function levelInversions(project: Project): Entity[] {
  const rows = biomesInOrder(project).filter((b) => roleIndex(b) !== null && isNum(b.levelMin))
  return rows.filter((b) => rows.some((x) => roleIndex(x)! < roleIndex(b)! && x.levelMin > b.levelMin))
}

// ---------- Coverage ----------

export const COVERAGE_COLUMNS = [
  { key: 'resources', label: 'Resources' },
  { key: 'enemies', label: 'Enemies' },
  { key: 'bosses', label: 'Bosses' },
  { key: 'outposts', label: 'Outposts' },
  { key: 'pois', label: 'POIs' },
  { key: 'weather', label: 'Weather' },
  { key: 'story', label: 'Story' },
  { key: 'hazards', label: 'Hazards' },
  { key: 'entry', label: 'Entry' },
  { key: 'levels', label: 'Levels' },
  { key: 'zone', label: 'On map' },
] as const

export type CoverageKey = (typeof COVERAGE_COLUMNS)[number]['key']
export type CoverageRow = { biome: Entity; cells: Record<CoverageKey, number>; score: number }

/** Per biome: how many things of each kind it has (yes/no columns are 1 or 0) and the share of columns filled. */
export function biomeCoverage(project: Project): CoverageRow[] {
  const placed = new Set(zones(project).map((z) => z.refId))
  return biomesInOrder(project).map((biome) => {
    const c = biomeContent(project, biome)
    const cells: Record<CoverageKey, number> = {
      resources: ids(biome.resources).length,
      enemies: c.enemies.length,
      bosses: c.bosses.length,
      outposts: c.outposts.length,
      pois: Array.isArray(biome.pois) ? biome.pois.filter(filled).length : 0,
      weather: c.weather.length,
      story: c.acts.length + c.quests.length,
      hazards: filled(biome.hazards) ? 1 : 0,
      entry: biome.role === 'Starter' || biome.optional || (biome.entryType && biome.entryType !== 'None') || filled(biome.entry) ? 1 : 0,
      levels: isNum(biome.levelMin) ? 1 : 0,
      zone: placed.has(biome.id) ? 1 : 0,
    }
    const score = Object.values(cells).filter((n) => n > 0).length / COVERAGE_COLUMNS.length
    return { biome, cells, score }
  })
}

// ---------- Atlas ----------

export type AtlasModel = {
  zones: { item: CanvasItem; biome?: Entity }[]
  markers: { item: CanvasItem; biomeId?: string }[]
  /** Border pairs from the biomes' Borders field, each once. */
  borders: [string, string][]
  unplaced: Entity[]
}

const inside = (it: CanvasItem, x: number, y: number) => x >= it.x && x <= it.x + it.w && y >= it.y && y <= it.y + it.h

/** Smallest linked zone that contains the point. */
export function zoneAt(project: Project, x: number, y: number): string | undefined {
  return zones(project)
    .filter((z) => z.refId && inside(z, x, y))
    .sort((a, b) => a.w * a.h - b.w * b.h)[0]?.refId
}

export function atlasModel(project: Project): AtlasModel {
  const byId = new Map(biomeList(project).map((b) => [b.id, b]))
  const zs = zones(project).map((item) => ({ item, biome: item.refId ? byId.get(item.refId) : undefined }))
  const markers = mapItems(project)
    .filter((i) => i.kind !== 'Biome zone')
    .map((item) => ({ item, biomeId: zoneAt(project, item.x + item.w / 2, item.y + item.h / 2) }))
  const seen = new Set<string>()
  const borders: [string, string][] = []
  for (const b of biomeList(project)) {
    for (const n of ids(b.neighbors)) {
      if (n === b.id || !byId.has(n)) continue
      const key = [b.id, n].sort().join('|')
      if (seen.has(key)) continue
      seen.add(key)
      borders.push([b.id, n])
    }
  }
  const linked = new Set(zs.map((z) => z.biome?.id))
  return { zones: zs, markers, borders, unplaced: biomeList(project).filter((b) => !linked.has(b.id)) }
}

/** Zones that overlap or touch (within `gap` px) on the map but are not recorded as borders yet. */
export function touchingWithoutBorder(project: Project, gap = 10): [string, string][] {
  const m = atlasModel(project)
  const known = new Set(m.borders.map(([a, b]) => [a, b].sort().join('|')))
  const out: [string, string][] = []
  const zs = m.zones.filter((z) => z.biome)
  for (let i = 0; i < zs.length; i++) {
    for (let j = i + 1; j < zs.length; j++) {
      const a = zs[i].item
      const b = zs[j].item
      if (a.refId === b.refId) continue
      const touch = a.x <= b.x + b.w + gap && b.x <= a.x + a.w + gap && a.y <= b.y + b.h + gap && b.y <= a.y + a.h + gap
      const key = [a.refId!, b.refId!].sort().join('|')
      if (touch && !known.has(key)) {
        known.add(key)
        out.push([a.refId!, b.refId!])
      }
    }
  }
  return out
}

/** Records each pair as a border on the first biome (one undo step when run inside `mutate`). */
export function addBorders(project: Project, pairs: [string, string][]) {
  for (const [a, b] of pairs) {
    const biome = biomeList(project).find((x) => x.id === a)
    if (!biome) continue
    const list = ids(biome.neighbors)
    if (!list.includes(b)) biome.neighbors = [...list, b]
  }
}

/** Adds a biome zone for each biome without one, laid out in role columns. */
export function placeUnplaced(project: Project, makeId: () => string) {
  const d = project.documents[WORLD_DOC]?.data
  if (!d) return
  if (!d.map || !Array.isArray(d.map.items)) d.map = { items: [] }
  const todo = atlasModel(project).unplaced
  const perColumn = new Map<number, number>()
  for (const b of todo) {
    const col = roleIndex(b) ?? ROLE_ORDER.length
    const row = perColumn.get(col) ?? 0
    perColumn.set(col, row + 1)
    d.map.items.push({ id: makeId(), kind: 'Biome zone', label: nameOf(b), refId: b.id, x: 20 + col * 160, y: 20 + row * 130, w: 150, h: 120 })
  }
}

// ---------- Dossier ----------

export type Dossier = {
  biome: Entity
  content: BiomeContent
  gates: UnlockLink[]
  opens: UnlockLink[]
  wave: number | null
  threat?: BiomeThreatRow
  coverage?: CoverageRow
  zone?: CanvasItem
  markers: CanvasItem[]
  neighbors: Entity[]
}

export function dossier(project: Project, biomeId: string): Dossier | null {
  const biome = biomeList(project).find((b) => b.id === biomeId)
  if (!biome) return null
  const path = unlockPath(project)
  const atlas = atlasModel(project)
  const byId = new Map(biomeList(project).map((b) => [b.id, b]))
  const neighbors = atlas.borders.filter((p) => p.includes(biomeId)).map(([a, b]) => byId.get(a === biomeId ? b : a)!)
  return {
    biome,
    content: biomeContent(project, biome),
    gates: path.links.filter((l) => l.to === biomeId),
    opens: path.links.filter((l) => l.from === biomeId && l.to !== biomeId),
    wave: path.wave.get(biomeId) ?? null,
    threat: biomeThreat(project).find((r) => r.biome.id === biomeId),
    coverage: biomeCoverage(project).find((r) => r.biome.id === biomeId),
    zone: atlas.zones.find((z) => z.biome?.id === biomeId)?.item,
    markers: atlas.markers.filter((m) => m.biomeId === biomeId).map((m) => m.item),
    neighbors,
  }
}
