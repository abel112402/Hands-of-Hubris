import type { CatalogItem, Entity, Project } from './model/types'

export const TIME_DOC = 'design.timeWeather'
export const DEFAULT_YEAR = 360
export const DEFAULT_MOON = 28

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const asMap = (v: unknown): Record<string, number> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, number>) : {})
const ids = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
const listOf = (project: Project, docId: string, section: string): Entity[] => {
  const d = project.documents[docId]?.data[section]
  return Array.isArray(d) ? d : []
}
export const timeList = (project: Project, section: string) => listOf(project, TIME_DOC, section)
const timeForm = (project: Project): Record<string, any> => project.documents[TIME_DOC]?.data.time ?? {}
const label = (e: Entity | undefined) => (e ? String(e.name ?? '') || '(unnamed)' : '⚠ missing')
const catalogItems = (project: Project, id: string): CatalogItem[] => project.registry.catalogs[id]?.items ?? []

export const yearLength = (project: Project) => (isNum(timeForm(project).daysPerYear) && timeForm(project).daysPerYear > 0 ? timeForm(project).daysPerYear : DEFAULT_YEAR)
export const moonLength = (project: Project) => (isNum(timeForm(project).moonCycle) && timeForm(project).moonCycle > 0 ? timeForm(project).moonCycle : DEFAULT_MOON)

/** Real minutes for a number of in-game hours, or null without a day length. */
export function realMinutes(project: Project, hours: number): number | null {
  const len = timeForm(project).dayLength
  return isNum(len) && len > 0 ? (hours / 24) * len : null
}

// ---------- Day phases ----------

export type Arc = { phase: Entity; from: number; to: number }
export type DayCoverage = { arcs: Arc[]; gaps: [number, number][]; overlaps: [number, number][]; unset: Entity[] }

const norm = (h: number) => ((h % 24) + 24) % 24

/** Phases on a 24 h circle (wrapping across midnight), with uncovered and doubly covered hours. */
export function dayCoverage(project: Project): DayCoverage {
  const phases = timeList(project, 'dayPhases')
  const unset = phases.filter((p) => !isNum(p.start) || !isNum(p.duration))
  const arcs: Arc[] = phases.filter((p) => isNum(p.start) && isNum(p.duration) && p.duration > 0).map((p) => ({ phase: p, from: norm(p.start), to: norm(p.start + Math.min(24, p.duration)) }))
  if (!arcs.length) return { arcs, gaps: [], overlaps: [], unset }
  // Linear segments within [0, 24), splitting arcs that cross midnight (or cover the whole day).
  const segs: [number, number][] = arcs.flatMap((a) => {
    const full = isNum(a.phase.duration) && a.phase.duration >= 24
    if (full) return [[0, 24] as [number, number]]
    return a.from < a.to ? [[a.from, a.to] as [number, number]] : [[a.from, 24] as [number, number], [0, a.to] as [number, number]].filter(([x, y]) => y > x)
  })
  const cuts = [...new Set([0, 24, ...segs.flat()])].sort((a, b) => a - b)
  const pieces: { from: number; to: number; count: number }[] = []
  for (let i = 0; i < cuts.length - 1; i++) {
    const mid = (cuts[i] + cuts[i + 1]) / 2
    pieces.push({ from: cuts[i], to: cuts[i + 1], count: segs.filter(([x, y]) => mid >= x && mid < y).length })
  }
  const collect = (pred: (n: number) => boolean) => {
    const out: [number, number][] = []
    for (const p of pieces) {
      if (!pred(p.count)) continue
      const last = out[out.length - 1]
      if (last && last[1] === p.from) last[1] = p.to
      else out.push([p.from, p.to])
    }
    // Join a range ending at midnight with one starting at midnight.
    if (out.length > 1 && out[0][0] === 0 && out[out.length - 1][1] === 24) {
      const last = out.pop()!
      out[0] = [last[0], out[0][1]]
    }
    return out
  }
  return { arcs, gaps: collect((n) => n === 0), overlaps: collect((n) => n > 1), unset }
}

/** The night phase: linked to the "night" time of day, else the one with the lowest visibility. */
export function nightPhase(project: Project): Entity | undefined {
  const phases = timeList(project, 'dayPhases')
  return phases.find((p) => p.timeOfDay === 'night') ?? [...phases].filter((p) => isNum(p.visibility)).sort((a, b) => a.visibility - b.visibility)[0]
}

/** The day phase: linked to the "day" time of day, else the one with the highest visibility. */
export function dayPhase(project: Project): Entity | undefined {
  const phases = timeList(project, 'dayPhases')
  return phases.find((p) => p.timeOfDay === 'day') ?? [...phases].filter((p) => isNum(p.visibility)).sort((a, b) => b.visibility - a.visibility)[0]
}

// ---------- Weather ----------

export type BiomeWeather = { biome: Entity; weathers: { weather: Entity; frequency: number }[]; total: number; clear: number; over: boolean }

/** Each World biome's weather mix: share per weather, the clear remainder, and whether it exceeds 100 %. */
export function biomeWeather(project: Project): BiomeWeather[] {
  const weather = timeList(project, 'weather')
  return listOf(project, 'design.world', 'biomes').map((biome) => {
    const weathers = weather.filter((w) => ids(w.biomes).includes(biome.id)).map((w) => ({ weather: w, frequency: isNum(w.frequency) ? w.frequency : 0 }))
    const total = weathers.reduce((s, w) => s + w.frequency, 0)
    return { biome, weathers, total, clear: Math.max(0, 100 - total), over: total > 100 }
  })
}

// ---------- Seasons and events ----------

export type SeasonRange = { season: Entity; from: number; to: number }

/** Seasons laid out over the year in order; `total` is their summed length. */
export function seasonYear(project: Project): { ranges: SeasonRange[]; total: number; year: number } {
  const seasons = timeList(project, 'seasons')
    .map((s, i) => ({ s, i }))
    .sort((a, b) => (isNum(a.s.order) ? a.s.order : 99 + a.i) - (isNum(b.s.order) ? b.s.order : 99 + b.i))
    .map((x) => x.s)
  let at = 0
  const ranges = seasons.filter((s) => isNum(s.days) && s.days > 0).map((season) => {
    const r = { season, from: at, to: at + season.days }
    at += season.days
    return r
  })
  return { ranges, total: at, year: yearLength(project) }
}

export type Occurrence = { event: Entity; day: number; until: number; example?: boolean }

const hash = (s: string) => {
  let h = 2166136261
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  return h >>> 0
}

/** Occurrences of one event over `years`; random events get example days from a seeded generator, plus their expected count. */
export function occurrencesOf(project: Project, e: Entity, years = 1): { list: Occurrence[]; expected: number | null } {
  const days = yearLength(project) * years
  const dur = isNum(e.duration) && e.duration > 0 ? e.duration : 1
  const at = (day: number, example = false): Occurrence => ({ event: e, day, until: day + dur, ...(example ? { example } : {}) })
  const list: Occurrence[] = []
  const n = isNum(e.interval) && e.interval >= 1 ? e.interval : null
  const offset = isNum(e.offset) ? e.offset : null
  switch (e.schedule) {
    case 'Every N days':
      if (n) for (let d = offset ?? n; d < days; d += n) list.push(at(d))
      return { list, expected: list.length }
    case 'Moon cycle': {
      const step = moonLength(project) * (n ?? 1)
      for (let d = offset ?? step; d < days; d += step) list.push(at(d))
      return { list, expected: list.length }
    }
    case 'Season': {
      const range = seasonYear(project).ranges.find((r) => r.season.id === e.season)
      if (range) for (let y = 0; y < years; y++) list.push(at(y * yearLength(project) + range.from + (offset ?? 0)))
      return { list, expected: list.length }
    }
    case 'Random chance': {
      const p = isNum(e.chance) ? e.chance / 100 : 0
      let s = hash(String(e.id)) || 1
      const rand = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296)
      for (let d = 0; d < days; d++) if (rand() < p) {
        list.push(at(d, true))
        d += Math.ceil(dur) - 1
      }
      return { list, expected: p * days }
    }
    default:
      return { list, expected: null }
  }
}

export type Coincidence = { day: number; a: Occurrence; b: Occurrence }

/** Every scheduled occurrence of every event, and the days where two different events overlap. */
export function eventCalendar(project: Project, years = 1, includeRandom = true) {
  const events = timeList(project, 'events')
  const all = events.flatMap((e) => occurrencesOf(project, e, years).list).filter((o) => includeRandom || !o.example)
  const sorted = [...all].sort((x, y) => x.day - y.day)
  const coincidences: Coincidence[] = []
  for (let i = 0; i < sorted.length; i++)
    for (let j = i + 1; j < sorted.length && sorted[j].day < sorted[i].until; j++)
      if (sorted[j].event.id !== sorted[i].event.id) coincidences.push({ day: sorted[j].day, a: sorted[i], b: sorted[j] })
  return { occurrences: sorted, coincidences, expected: new Map(events.map((e) => [e.id, occurrencesOf(project, e, years).expected])) }
}

// ---------- Combined conditions ----------

export type Selection = { phase?: string; weather?: string; event?: string; season?: string }
export type Factor = { key: string; label: string; value: number; sources: { name: string; value: number }[] }

/** Combined effect of a day phase, weather, event and season: lowest visibility, multiplied strength and world modifiers. */
export function conditions(project: Project, sel: Selection) {
  const pick = (section: string, id?: string) => (id ? timeList(project, section).find((e) => e.id === id) : undefined)
  const sources = [pick('dayPhases', sel.phase), pick('weather', sel.weather), pick('events', sel.event), pick('seasons', sel.season)].filter((e): e is Entity => !!e)
  const vis = sources.filter((s) => isNum(s.visibility))
  const visibility = vis.length ? Math.min(...vis.map((s) => s.visibility)) : 100
  const strength = sources.filter((s) => isNum(s.monsterStrength))
  const product = (xs: { name: string; value: number }[], key: string, lbl: string): Factor => ({ key, label: lbl, value: xs.reduce((p, x) => p * x.value, 1), sources: xs })
  const factors: Factor[] = [product(strength.map((s) => ({ name: label(s), value: s.monsterStrength })), 'monsterStrength', 'Monster strength')]
  for (const m of catalogItems(project, 'worldModifiers')) {
    const xs = sources.filter((s) => isNum(asMap(s.modifiers)[m.id])).map((s) => ({ name: label(s), value: asMap(s.modifiers)[m.id] }))
    factors.push(product(xs, m.id, m.label))
  }
  return {
    sources,
    visibility,
    visibilitySource: vis.length ? label(vis.sort((a, b) => a.visibility - b.visibility)[0]) : null,
    factors,
    variants: variantsFor(project, sources.map((s) => s.id)),
  }
}

/** Combat variants that appear during any of the given day phases or events. */
export const variantsFor = (project: Project, idList: string[]) => listOf(project, 'design.combat', 'variants').filter((v) => ids(v.when).some((id) => idList.includes(id)))

// ---------- Checks used by hints ----------

const REQUIRED: Record<string, (e: Entity) => boolean> = {
  'Every N days': (e) => isNum(e.interval),
  'Moon cycle': () => true,
  'Random chance': (e) => isNum(e.chance) && e.chance > 0,
  Season: (e) => !!e.season,
  'Story trigger': (e) => !!e.storyTrigger,
}

/** Events without a usable schedule or duration, or with no effect at all. */
export const eventProblems = (project: Project) =>
  timeList(project, 'events').filter((e) => {
    const scheduled = e.schedule && (REQUIRED[e.schedule]?.(e) ?? true)
    const effect = Object.keys(asMap(e.modifiers)).length || String(e.rules ?? '').trim() || isNum(e.monsterStrength) || isNum(e.visibility)
    return !scheduled || !isNum(e.duration) || !effect
  })

/** Coinciding pairs where neither event has a priority and they do not both stack. */
export const unresolvedCoincidences = (project: Project) =>
  eventCalendar(project, 1, false).coincidences.filter((c) => !isNum(c.a.event.priority) && !isNum(c.b.event.priority) && !(c.a.event.stacks && c.b.event.stacks))

/** Multipliers of ×0 or above ×5 on phases, weather, events and seasons (likely typos). */
export function extremeModifiers(project: Project): string[] {
  const out: string[] = []
  const names = new Map(catalogItems(project, 'worldModifiers').map((m) => [m.id, m.label]))
  for (const section of ['dayPhases', 'weather', 'events', 'seasons'])
    for (const e of timeList(project, section)) {
      for (const [k, v] of Object.entries(asMap(e.modifiers))) if (isNum(v) && (v === 0 || v > 5)) out.push(`${label(e)}: ${names.get(k) ?? k} ×${v}`)
      if (isNum(e.monsterStrength) && (e.monsterStrength === 0 || e.monsterStrength > 5)) out.push(`${label(e)}: monster strength ×${e.monsterStrength}`)
    }
  return out
}

/** Problems that make night no more dangerous than day: strength not higher, or visibility not lower. */
export function nightProblems(project: Project): string[] {
  const night = nightPhase(project)
  const day = dayPhase(project)
  if (!night || !day || night.id === day.id) return []
  const out: string[] = []
  if (isNum(night.monsterStrength) && isNum(day.monsterStrength) && night.monsterStrength <= day.monsterStrength) out.push(`monster strength at night (×${night.monsterStrength}) is not above day (×${day.monsterStrength})`)
  if (isNum(night.visibility) && isNum(day.visibility) && night.visibility >= day.visibility) out.push(`visibility at night (${night.visibility}%) is not below day (${day.visibility}%)`)
  return out
}

export const phaseBasicsMissing = (project: Project) => {
  const hasCatalog = catalogItems(project, 'timeOfDay').length > 0
  return timeList(project, 'dayPhases').filter((p) => !isNum(p.start) || !isNum(p.duration) || (hasCatalog && !p.timeOfDay))
}
