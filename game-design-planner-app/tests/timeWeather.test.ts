import { describe, expect, it } from 'vitest'
import { collectHints, makeContext } from '../src/core/hints/engine'
import { moduleToMarkdown } from '../src/core/export/markdown'
import { createProject, makeId } from '../src/core/model/project'
import { ensureDocument, getModule } from '../src/core/modules/registry'
import { deserializeProject, serializeProject } from '../src/core/persistence/serialize'
import { biomeWeather, conditions, dayCoverage, eventCalendar, occurrencesOf, TIME_DOC, variantsFor } from '../src/core/timeWeather'

const tw = getModule(TIME_DOC)!

function twProject() {
  const p = createProject('T')
  p.documents['design.world'].data.biomes = [{ id: 'b1', name: 'Marsh', role: 'Mid' }, { id: 'b2', name: 'Shore', role: 'Starter' }]
  const d = p.documents[TIME_DOC].data
  d.time = { dayLength: 48, daysPerYear: 360, moonCycle: 28 }
  d.dayPhases = [
    { id: 'day', name: 'Day', start: 6, duration: 15, timeOfDay: 'day', visibility: 100, monsterStrength: 1 },
    { id: 'night', name: 'Night', start: 21, duration: 9, timeOfDay: 'night', visibility: 30, monsterStrength: 1.3 },
  ]
  d.weather = [
    { id: 'rain', name: 'Rain', biomes: ['b1', 'b2'], frequency: 30, visibility: 70 },
    { id: 'storm', name: 'Storm', biomes: ['b1'], frequency: 10, visibility: 25, monsterStrength: 1.2, modifiers: { 'movement-speed': 0.8 } },
  ]
  d.events = [
    { id: 'blood', name: 'Blood moon', schedule: 'Moon cycle', interval: 3, duration: 1, monsterStrength: 1.5, priority: 2, modifiers: { 'movement-speed': 0.9 } },
    { id: 'holiday', name: 'Holiday', schedule: 'Every N days', interval: 360, offset: 100, duration: 2, priority: 1, rules: 'Feast' },
  ]
  d.eventSystem = { priority: 'Higher wins', stacking: 'Multipliers multiply' }
  return p
}
const ruleIds = (p: ReturnType<typeof createProject>) =>
  collectHints(makeContext(p, { docId: TIME_DOC })).filter((h) => h.ruleId.startsWith('time.')).map((h) => h.ruleId)

describe('time & weather module v2', () => {
  it('links phases to times of day by name and schedules moon events', () => {
    const p = createProject('t')
    p.documents[TIME_DOC] = {
      moduleVersion: 1,
      data: {
        time: { dayLength: 20, calendar: 'Four seasons' },
        dayPhases: [{ id: 'a', name: 'Night', start: 21, duration: 9 }, { id: 'b', name: 'Siesta', start: 13, duration: 1 }],
        events: [{ id: 'f', name: 'Full moon', trigger: 'Every 28 days' }, { id: 'bm', name: 'Blood moon' }, { id: 'h', name: 'Holiday' }],
      },
    }
    const doc = ensureDocument(p, tw, makeId)
    expect(doc.moduleVersion).toBe(2)
    expect(doc.data.dayPhases.map((x: any) => x.timeOfDay)).toEqual(['night', undefined])
    expect(doc.data.events[0]).toMatchObject({ schedule: 'Moon cycle', interval: 1, trigger: 'Every 28 days' })
    expect(doc.data.events[1]).toMatchObject({ schedule: 'Moon cycle', interval: 3 })
    expect(doc.data.events[2].schedule).toBeUndefined()
    expect(doc.data.time.calendar).toBe('Four seasons')
  })

  it('adds missing default catalogs on load and keeps edited ones', () => {
    const p = createProject('t')
    delete (p.registry.catalogs as Record<string, unknown>).worldModifiers
    p.registry.catalogs.timeOfDay.items = [{ id: 'night', label: 'Night' }]
    const back = deserializeProject(serializeProject(p)).project
    expect(back.registry.catalogs.worldModifiers.items.map((i) => i.id)).toContain('crop-growth')
    expect(back.registry.catalogs.timeOfDay.items).toEqual([{ id: 'night', label: 'Night' }])
  })

  it('exports in the order of time_weather_events.md with summaries', () => {
    const md = moduleToMarkdown(twProject(), tw)
    const heads = md.split('\n').filter((l) => l.startsWith('## ')).map((l) => l.replace(/^## \d+\. /, ''))
    const order = ['Time system', 'Day and night', 'Weather', 'Special events', 'Event system']
    const pos = order.map((h) => heads.indexOf(h))
    expect(pos.every((i) => i >= 0)).toBe(true)
    expect([...pos].sort((a, b) => a - b)).toEqual(pos)
    expect(md).toContain('| Night | 21:00 – 06:00 | 18 |')
    expect(md).toContain('* **Marsh:** Rain 30%, Storm 10%, clear 60%')
    expect(md).toContain('* **Blood moon:** 4 time(s): day 84, 168, 252, 336')
  })

  it('covers the day across midnight and finds gaps and overlaps', () => {
    const p = twProject()
    expect(dayCoverage(p)).toMatchObject({ gaps: [], overlaps: [] })
    p.documents[TIME_DOC].data.dayPhases[1].duration = 8
    expect(dayCoverage(p).gaps).toEqual([[5, 6]])
    p.documents[TIME_DOC].data.dayPhases[1].duration = 11
    expect(dayCoverage(p).overlaps).toEqual([[6, 8]])
    p.documents[TIME_DOC].data.dayPhases = [{ id: 'x', name: 'Day', start: 8, duration: 4 }]
    expect(dayCoverage(p).gaps).toEqual([[12, 8]])
  })

  it('computes each biome’s weather mix and flags biomes over 100 %', () => {
    const p = twProject()
    const [marsh, shore] = biomeWeather(p)
    expect(marsh).toMatchObject({ total: 40, clear: 60, over: false })
    expect(shore).toMatchObject({ total: 30, clear: 70 })
    p.documents[TIME_DOC].data.weather[1].frequency = 80
    expect(biomeWeather(p)[0]).toMatchObject({ total: 110, clear: 0, over: true })
  })

  it('places scheduled events, finds coincidences and keeps random events repeatable', () => {
    const p = twProject()
    const d = p.documents[TIME_DOC].data
    expect(occurrencesOf(p, d.events[0]).list.map((o) => o.day)).toEqual([84, 168, 252, 336])
    d.events[1].offset = 168
    const cal = eventCalendar(p)
    expect(cal.coincidences.map((c) => [c.day, c.a.event.name, c.b.event.name])).toEqual([[168, 'Blood moon', 'Holiday']])
    d.seasons = [{ id: 's1', name: 'Spring', order: 1, days: 90 }, { id: 's2', name: 'Summer', order: 2, days: 90 }]
    expect(occurrencesOf(p, { id: 'e', schedule: 'Season', season: 's2', offset: 5 }).list.map((o) => o.day)).toEqual([95])
    const rnd = { id: 'quake', schedule: 'Random chance', chance: 2, duration: 1 }
    expect(occurrencesOf(p, rnd).expected).toBeCloseTo(7.2)
    expect(occurrencesOf(p, rnd).list.map((o) => o.day)).toEqual(occurrencesOf(p, rnd).list.map((o) => o.day))
  })

  it('combines conditions with sources and finds the Combat variants that appear', () => {
    const p = twProject()
    p.documents['design.combat'].data.variants = [{ id: 'v', name: 'Night crab', base: 'e', when: ['night'], hpMult: 2 }]
    const c = conditions(p, { phase: 'night', weather: 'storm', event: 'blood' })
    expect(c.visibility).toBe(25)
    expect(c.visibilitySource).toBe('Storm')
    const strength = c.factors.find((f) => f.key === 'monsterStrength')!
    expect(strength.value).toBeCloseTo(2.34)
    expect(strength.sources.map((s) => s.name)).toEqual(['Night', 'Storm', 'Blood moon'])
    expect(c.factors.find((f) => f.key === 'movement-speed')!.value).toBeCloseTo(0.72)
    expect(c.variants.map((v) => v.name)).toEqual(['Night crab'])
    expect(variantsFor(p, ['day'])).toEqual([])
  })
})

describe('time & weather design checks', () => {
  it('stays quiet on an empty document and in other editors', () => {
    const p = createProject('T', false)
    ensureDocument(p, tw, makeId)
    p.documents[TIME_DOC].data.events = []
    expect(ruleIds(p)).toEqual([])
    expect(collectHints(makeContext(twProject(), { docId: 'design.world' })).filter((h) => h.ruleId.startsWith('time.'))).toEqual([])
  })

  it('does not flag a complete setup', () => {
    expect(ruleIds(twProject())).toEqual([])
  })

  it('flags coverage, basics, night, weather, events, coincidences, seasons and extremes', () => {
    const p = twProject()
    const d = p.documents[TIME_DOC].data
    d.time = { daysPerYear: 360, moonCycle: 28 }
    d.dayPhases[1] = { ...d.dayPhases[1], duration: 8, monsterStrength: 1, visibility: 100 }
    d.dayPhases.push({ id: 'x', name: 'Odd' })
    d.weather[1].frequency = 80
    d.weather[1].modifiers = { 'movement-speed': 0 }
    // Two events without priority on the same days coincide unresolved; a biome without weather.
    d.events.push(
      { id: 'n', name: 'Nothing' },
      { id: 'c1', name: 'Fair', schedule: 'Every N days', interval: 50, duration: 1, rules: 'x' },
      { id: 'c2', name: 'Market', schedule: 'Every N days', interval: 50, duration: 1, rules: 'y' },
    )
    p.documents['design.world'].data.biomes.push({ id: 'b3', name: 'Peaks', role: 'Late' })
    d.seasons = [{ id: 's', name: 'Only', days: 100 }]
    expect(ruleIds(p)).toEqual(
      expect.arrayContaining(['time.dayCoverage', 'time.dayLength', 'time.basics', 'time.nightHarder', 'time.weatherShare', 'time.weatherNone', 'time.events', 'time.coincide', 'time.seasons', 'time.extremes']),
    )
  })

  it('never exceeds suggest severity', () => {
    const p = twProject()
    p.documents[TIME_DOC].data.dayPhases[1].duration = 2
    expect(collectHints(makeContext(p, { docId: TIME_DOC })).filter((h) => h.ruleId.startsWith('time.')).every((h) => h.severity !== 'important')).toBe(true)
  })
})
