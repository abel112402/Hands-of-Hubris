import type { GuideExample, ModuleGuide } from '../../core/guides/types'
import { makeId } from '../../core/model/project'
import type { Entity, Project } from '../../core/model/types'
import { biomeWeather, dayCoverage, eventProblems, nightProblems, seasonYear, TIME_DOC, timeList, yearLength } from '../../core/timeWeather'

const data = (p: Project): Record<string, any> => p.documents[TIME_DOC]?.data ?? {}
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const filled = (v: unknown) => typeof v === 'string' && v.trim() !== ''
const catalog = (p: Project, id: string) => p.registry.catalogs[id]?.items ?? []
const ensureList = (p: Project, section: string): Entity[] => {
  const d = p.documents[TIME_DOC]?.data
  if (!d) return []
  if (!Array.isArray(d[section])) d[section] = []
  return d[section]
}
const ensureTime = (p: Project): Record<string, any> => {
  const d = p.documents[TIME_DOC]?.data
  if (!d) return {}
  if (!d.time || typeof d.time !== 'object') d.time = {}
  return d.time
}

/** Keeps only modifiers whose ids exist in the project's World modifiers catalog. */
const mods = (p: Project, m: Record<string, number>) => {
  const known = new Set(catalog(p, 'worldModifiers').map((x) => x.id))
  const out = Object.fromEntries(Object.entries(m).filter(([k]) => known.has(k)))
  return Object.keys(out).length ? { modifiers: out } : {}
}
/** Time-of-day catalog id for a phase name, when the catalog has it. */
const tod = (p: Project, id: string) => (catalog(p, 'timeOfDay').some((c) => c.id === id) ? { timeOfDay: id } : {})

/** Links day phases without a time of day to the catalog entry with the same name. */
export const linkPhasesByName = (p: Project) => {
  const items = catalog(p, 'timeOfDay')
  for (const ph of timeList(p, 'dayPhases')) {
    if (ph.timeOfDay) continue
    const match = items.find((c) => c.label.toLowerCase() === String(ph.name ?? '').trim().toLowerCase())
    if (match) ph.timeOfDay = match.id
  }
}

// ---------- Examples ----------

type PhaseSpec = { name: string; tod: string; start: number; duration: number; visibility: number; strength: number; color: string; m?: Record<string, number> }

const dayPreset = (id: string, title: string, description: string, phases: PhaseSpec[]): GuideExample => ({
  id,
  section: 'dayPhases',
  title,
  description: `${description} Replaces the current phases (one undo brings them back).`,
  preview: 'dayClock',
  apply: (p) => {
    const d = p.documents[TIME_DOC]?.data
    if (!d) return
    d.dayPhases = phases.map((s) => ({
      id: makeId(),
      name: s.name,
      start: s.start,
      duration: s.duration,
      ...tod(p, s.tod),
      visibility: s.visibility,
      monsterStrength: s.strength,
      color: s.color,
      ...mods(p, s.m ?? {}),
    }))
    ensureTime(p).dayLength ??= 24
  },
})

const NIGHT_MODS = { 'monster-spawn-rate': 1.5, 'npc-morale': 0.9 }

const seasonsPreset = (id: string, title: string, description: string, specs: { name: string; share: number; color: string; m: Record<string, number> }[]): GuideExample => ({
  id,
  section: 'seasons',
  title,
  description,
  preview: 'seasons',
  apply: (p) => {
    const t = ensureTime(p)
    t.daysPerYear ??= 360
    const year = t.daysPerYear
    const list = ensureList(p, 'seasons')
    let left = year
    specs.forEach((s, i) => {
      const days = i === specs.length - 1 ? left : Math.round(year * s.share)
      left -= days
      list.push({ id: makeId(), name: s.name, order: list.length + 1, days, color: s.color, ...mods(p, s.m) })
    })
  },
})

/** Rain, fog and storm for a biome (clear weather is the remainder). */
function insertWeather(p: Project, biomeId?: string) {
  const biome = (p.documents['design.world']?.data.biomes ?? []).find((b: Entity) => b.id === biomeId)
  const list = ensureList(p, 'weather')
  const specs: { name: string; frequency: number; visibility: number; duration: number; color: string; m: Record<string, number> }[] = [
    { name: 'Rain', frequency: 25, visibility: 70, duration: 6, color: '#4f9cf9', m: { 'crop-growth': 1.2, 'movement-speed': 0.95 } },
    { name: 'Fog', frequency: 10, visibility: 40, duration: 4, color: '#8b93a5', m: { 'monster-spawn-rate': 1.2 } },
    { name: 'Storm', frequency: 8, visibility: 30, duration: 3, color: '#d86be0', m: { 'movement-speed': 0.8, 'monster-spawn-rate': 1.3, 'npc-morale': 0.9 } },
  ]
  for (const s of specs)
    list.push({ id: makeId(), name: biome ? `${biome.name} ${s.name.toLowerCase()}` : s.name, ...(biome ? { biomes: [biome.id] } : {}), frequency: s.frequency, visibility: s.visibility, duration: s.duration, color: s.color, ...mods(p, s.m) })
}

/** Full moon, Blood moon and Holiday with schedules, effects and priorities; existing events of the same name are updated, not duplicated. */
function insertMoonEvents(p: Project) {
  const t = ensureTime(p)
  t.moonCycle ??= 28
  const year = yearLength(p)
  const list = ensureList(p, 'events')
  const specs: Record<string, unknown>[] = [
    { name: 'Full moon', schedule: 'Moon cycle', interval: 1, duration: 1, visibility: 60, priority: 1, stacks: true, ...mods(p, { 'monster-spawn-rate': 1.2 }) },
    { name: 'Blood moon', schedule: 'Moon cycle', interval: 3, duration: 1, monsterStrength: 1.5, priority: 3, rules: 'Monsters are stronger and more numerous; loot is better.', ...mods(p, { 'monster-spawn-rate': 2, 'loot-rarity': 1.5 }) },
    { name: 'Holiday', schedule: 'Every N days', interval: year, offset: Math.round(year * 0.4), duration: 2, priority: 2, rules: 'Towns celebrate; fewer monsters near settlements.', ...mods(p, { 'npc-morale': 1.3, 'monster-spawn-rate': 0.5 }) },
  ]
  for (const s of specs) {
    const existing = list.find((e) => String(e.name).toLowerCase() === String(s.name).toLowerCase())
    if (existing) Object.assign(existing, s)
    else list.push({ id: makeId(), ...s })
  }
}

const biomeParam = {
  key: 'biome',
  label: 'Biome',
  options: (p: Project) => [{ id: '', label: '— no biome —' }, ...((p.documents['design.world']?.data.biomes ?? []) as Entity[]).map((b) => ({ id: b.id, label: String(b.name ?? '') }))],
}

export const TIME_EXAMPLES: GuideExample[] = [
  dayPreset('day-four', 'Dawn, day, dusk, night (recommended)', '12 h of day, 8 h of night, two 2 h transitions.', [
    { name: 'Dawn', tod: 'dawn', start: 5, duration: 2, visibility: 60, strength: 1, color: '#f2c94c' },
    { name: 'Day', tod: 'day', start: 7, duration: 12, visibility: 100, strength: 1, color: '#5ad1d1' },
    { name: 'Dusk', tod: 'dusk', start: 19, duration: 2, visibility: 60, strength: 1.1, color: '#f97b4f' },
    { name: 'Night', tod: 'night', start: 21, duration: 8, visibility: 30, strength: 1.3, color: '#4f5b9c', m: NIGHT_MODS },
  ]),
  dayPreset('day-long-night', 'Long night', 'Night takes half the day: a harsher survival rhythm.', [
    { name: 'Dawn', tod: 'dawn', start: 6, duration: 2, visibility: 60, strength: 1, color: '#f2c94c' },
    { name: 'Day', tod: 'day', start: 8, duration: 8, visibility: 100, strength: 1, color: '#5ad1d1' },
    { name: 'Dusk', tod: 'dusk', start: 16, duration: 2, visibility: 50, strength: 1.2, color: '#f97b4f' },
    { name: 'Night', tod: 'night', start: 18, duration: 12, visibility: 25, strength: 1.4, color: '#4f5b9c', m: NIGHT_MODS },
  ]),
  dayPreset('day-two', 'Day and night', 'Two halves, no transitions: simple to read.', [
    { name: 'Day', tod: 'day', start: 6, duration: 12, visibility: 100, strength: 1, color: '#5ad1d1' },
    { name: 'Night', tod: 'night', start: 18, duration: 12, visibility: 30, strength: 1.3, color: '#4f5b9c', m: NIGHT_MODS },
  ]),
  seasonsPreset('seasons-four', 'Four seasons', 'Spring, summer, autumn, winter of equal length; winter slows crops and raises hunger.', [
    { name: 'Spring', share: 0.25, color: '#53c28b', m: { 'crop-growth': 1.2 } },
    { name: 'Summer', share: 0.25, color: '#f2c94c', m: { 'crop-growth': 1.0, 'hunger-thirst-decay': 1.1 } },
    { name: 'Autumn', share: 0.25, color: '#f97b4f', m: { 'crop-growth': 0.8 } },
    { name: 'Winter', share: 0.25, color: '#5ad1d1', m: { 'crop-growth': 0.2, 'hunger-thirst-decay': 1.3 } },
  ]),
  seasonsPreset('seasons-wet-dry', 'Wet and dry', 'Two halves: lush wet season, harsh dry season.', [
    { name: 'Wet season', share: 0.5, color: '#4f9cf9', m: { 'crop-growth': 1.3 } },
    { name: 'Dry season', share: 0.5, color: '#f2c94c', m: { 'crop-growth': 0.6, 'hunger-thirst-decay': 1.25 } },
  ]),
  {
    id: 'weather-set',
    section: 'weather',
    title: 'Rain, fog and storm',
    description: 'Three weathers at 25 / 10 / 8 % of the time; the remaining 57 % is clear.',
    param: biomeParam,
    preview: 'weatherMix',
    apply: (p, biome) => insertWeather(p, biome || undefined),
  },
  {
    id: 'moon-events',
    section: 'events',
    title: 'Moon events and a holiday',
    description: 'Full moon every cycle, Blood moon every third cycle (stronger, more monsters, better loot), Holiday once a year.',
    preview: 'yearEvents',
    apply: insertMoonEvents,
  },
]

// ---------- Guide ----------

export const TIME_GUIDE: ModuleGuide = {
  map: {
    width: 790,
    height: 330,
    nodes: [
      { id: 'time', label: 'Time system', section: 'time', x: 10, y: 14 },
      { id: 'seasons', label: 'Seasons', section: 'seasons', x: 220, y: 14 },
      { id: 'dayPhases', label: 'Day and night', section: 'dayPhases', x: 430, y: 14 },
      { id: 'npc', label: 'NPC routine', doc: 'design.npc', x: 640, y: 14 },
      { id: 'world', label: 'World', doc: 'design.world', x: 10, y: 102 },
      { id: 'weather', label: 'Weather', section: 'weather', x: 220, y: 102 },
      { id: 'player', label: 'Player', doc: 'design.player', x: 640, y: 102 },
      { id: 'story', label: 'Story', doc: 'design.story', x: 10, y: 190 },
      { id: 'events', label: 'Special events', section: 'events', x: 220, y: 190 },
      { id: 'eventSystem', label: 'Event system', section: 'eventSystem', x: 430, y: 190 },
      { id: 'combat', label: 'Combat', doc: 'design.combat', x: 640, y: 190 },
      { id: 'items', label: 'Items', doc: 'design.items', x: 220, y: 278 },
    ],
    edges: [
      { from: 'time', to: 'seasons', label: 'year' },
      { from: 'time', to: 'dayPhases', label: 'day length' },
      { from: 'dayPhases', to: 'npc', label: 'time of day' },
      { from: 'world', to: 'weather', label: 'biomes' },
      { from: 'seasons', to: 'weather', label: 'season' },
      { from: 'weather', to: 'player', label: 'modifiers' },
      { from: 'dayPhases', to: 'combat', label: 'night strength' },
      { from: 'story', to: 'events', label: 'triggers' },
      { from: 'events', to: 'eventSystem', label: 'priority' },
      { from: 'events', to: 'combat', label: 'variants' },
      { from: 'events', to: 'items', label: 'rewards' },
    ],
  },
  steps: [
    {
      id: 'clock',
      title: 'Set the clock',
      body: 'How many real minutes is an in-game day, and how many days is a year?',
      section: 'time',
      target: 'field-dayLength',
      done: (p) => isNum(data(p).time?.dayLength) && isNum(data(p).time?.daysPerYear),
    },
    {
      id: 'phases',
      title: 'Cover the day with phases',
      body: 'Day phases should cover all 24 hours without overlapping. Start from a preset and adjust.',
      section: 'dayPhases',
      target: 'examples',
      done: (p) => {
        const c = dayCoverage(p)
        return c.arcs.length > 0 && c.gaps.length === 0 && c.overlaps.length === 0
      },
      action: { label: 'Pick a day preset…', examples: 'dayPhases' },
    },
    {
      id: 'link',
      title: 'Link phases to times of day',
      body: 'NPC routines and music use the “Times of day” catalog. Linking each phase makes them follow your clock.',
      section: 'dayPhases',
      target: 'view-dayClock',
      done: (p) => timeList(p, 'dayPhases').length > 0 && timeList(p, 'dayPhases').every((ph) => ph.timeOfDay),
      action: { label: 'Link by name', run: linkPhasesByName },
    },
    {
      id: 'night',
      title: 'Make night harder',
      body: 'The game design says nights are darker and monsters stronger: give the night phase lower visibility and higher monster strength than the day.',
      section: 'dayPhases',
      target: 'view-dayClock',
      done: (p) => timeList(p, 'dayPhases').some((ph) => ph.timeOfDay === 'night') && nightProblems(p).length === 0,
    },
    {
      id: 'seasons',
      title: 'Add seasons',
      body: 'Seasons split the year and can change crops, hunger and weather.',
      section: 'seasons',
      target: 'examples',
      done: (p) => {
        const s = seasonYear(p)
        return s.ranges.length > 0 && s.total === s.year
      },
      action: { label: 'Pick seasons…', examples: 'seasons' },
    },
    {
      id: 'weather',
      title: 'Give every biome weather',
      body: 'Each weather has a share of time in its biomes. Insert a set per biome and tune it.',
      section: 'weather',
      target: 'examples',
      done: (p) => {
        const rows = biomeWeather(p)
        return rows.length > 0 && rows.every((r) => r.weathers.length > 0)
      },
      action: { label: 'Insert a weather set…', examples: 'weather' },
    },
    {
      id: 'mix',
      title: 'Check the weather mix',
      body: 'Weather by biome shows each biome’s mix; no biome should go over 100 %.',
      section: 'weather',
      target: 'view-biomeWeather',
      done: (p) => {
        const rows = biomeWeather(p)
        return rows.length > 0 && rows.every((r) => r.weathers.length > 0 && !r.over)
      },
    },
    {
      id: 'events',
      title: 'Schedule events',
      body: 'Give each event a schedule, a duration and its effects. The Year strip shows when they happen and when they coincide.',
      section: 'events',
      target: 'examples',
      done: (p) => timeList(p, 'events').length > 0 && eventProblems(p).length === 0,
      action: { label: 'Insert moon events…', examples: 'events' },
    },
    {
      id: 'simulate',
      title: 'Try the Conditions simulator',
      body: 'Pick night, the harshest weather and the Blood moon: is the combined effect what you want? Tick this step by hand.',
      section: 'events',
      target: 'view-conditions',
    },
    {
      id: 'rules',
      title: 'Write the event rules',
      body: 'Decide which event wins when two coincide, and whether their effects stack.',
      section: 'eventSystem',
      target: 'field-priority',
      done: (p) => filled(data(p).eventSystem?.priority) && filled(data(p).eventSystem?.stacking),
    },
  ],
  examples: TIME_EXAMPLES,
  concepts: {
    dayPhases: {
      title: 'Reading the day clock',
      body: 'Midnight is at the top and the day runs clockwise. Each phase is an arc; a phase may cross midnight. Every hour should belong to exactly one phase. The day length turns the arcs into real minutes.',
      diagram: 'dayClock',
    },
    events: {
      title: 'How conditions combine',
      body: 'At any moment a day phase, a weather, maybe an event and a season apply. Their multipliers multiply (×1.3 night × ×1.5 Blood moon = ×1.95) and the lowest visibility wins. The Conditions simulator shows the result.',
      diagram: 'modifierStack',
    },
    weather: {
      title: 'Weather as a share of time',
      body: 'Each weather holds for a share of the time in its biomes. Their shares add up, and the rest of the time is clear. A biome above 100 % has more weather than time.',
      diagram: 'weatherMix',
    },
    seasons: {
      title: 'A year of seasons and events',
      body: 'Seasons split the year. Events repeat on schedules: every N days, every moon cycle, once a season, or at random. When two land on the same day they coincide, and the event rules decide what happens.',
      diagram: 'eventCalendar',
    },
  },
  empty: {
    seasons: 'Seasons split the year and change crops, hunger and weather.',
    dayPhases: 'Day phases are the parts of the day: dawn, day, dusk, night. Start from a preset.',
    weather: 'Weather gives each biome its mood and its risks. A set per biome is a quick start.',
    events: 'Special events change the rules for a short time: Full moon, Blood moon, holidays.',
  },
}
