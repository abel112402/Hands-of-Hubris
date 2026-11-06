import { describe, expect, it } from 'vitest'
import { createProject } from '../src/core/model/project'
import { useStore } from '../src/core/store/store'
import { getModule, getSection } from '../src/core/modules/registry'
import { biomeWeather, dayCoverage, eventCalendar, seasonYear, TIME_DOC } from '../src/core/timeWeather'
import { TIME_GUIDE } from '../src/modules/guides/timeWeather'
import { applyExample, previewProject } from '../src/ui/guides/ExamplePicker'

const step = (id: string) => TIME_GUIDE.steps.find((s) => s.id === id)!
const example = (id: string) => TIME_GUIDE.examples.find((e) => e.id === id)!

describe('time & weather guide', () => {
  it('points every step, map node, example, concept and empty text at a real section', () => {
    const mod = getModule(TIME_DOC)!
    const reg = createProject('t').registry
    const ids = [
      ...TIME_GUIDE.steps.map((s) => s.section),
      ...TIME_GUIDE.map.nodes.flatMap((n) => (n.section ? [n.section] : [])),
      ...TIME_GUIDE.examples.map((e) => e.section),
      ...Object.keys(TIME_GUIDE.concepts),
      ...Object.keys(TIME_GUIDE.empty),
    ]
    for (const id of ids) expect(getSection(mod, reg, id), id).toBeTruthy()
    for (const n of TIME_GUIDE.map.nodes) if (n.doc) expect(getModule(n.doc), n.doc).toBeTruthy()
  })

  it('every day preset covers 24 hours and makes night harder', () => {
    for (const id of ['day-four', 'day-long-night', 'day-two']) {
      const p = createProject('T')
      example(id).apply(p)
      const c = dayCoverage(p)
      expect(c.gaps, id).toEqual([])
      expect(c.overlaps, id).toEqual([])
      expect(step('night').done!(p), id).toBe(true)
      expect(step('link').done!(p), id).toBe(true)
    }
  })

  it('links phases by name and ticks steps from data', () => {
    const p = createProject('T')
    p.documents[TIME_DOC].data.dayPhases = [{ id: 'a', name: 'night', start: 0, duration: 24 }]
    expect(step('link').done!(p)).toBe(false)
    const a = step('link').action!
    if ('run' in a) a.run(p)
    expect(p.documents[TIME_DOC].data.dayPhases[0].timeOfDay).toBe('night')
    expect(step('simulate').done).toBeUndefined()
  })

  it('season presets fill the year and the weather set leaves clear weather', () => {
    for (const id of ['seasons-four', 'seasons-wet-dry']) {
      const p = createProject('T')
      example(id).apply(p)
      const s = seasonYear(p)
      expect(s.total, id).toBe(s.year)
    }
    const p = createProject('T')
    p.documents['design.world'].data.biomes = [{ id: 'm', name: 'Marsh' }]
    example('weather-set').apply(p, 'm')
    expect(biomeWeather(p)[0]).toMatchObject({ total: 43, clear: 57, over: false })
  })

  it('previews moon events on a copy, updates seeded events and inserts as one undo step', () => {
    useStore.getState().loadProject(createProject('T'), 'x')
    const before = useStore.getState().project
    const seeded = before.documents[TIME_DOC].data.events.length
    const preview = previewProject(before, example('moon-events'))
    expect(preview.documents[TIME_DOC].data.events).toHaveLength(seeded)
    const blood = eventCalendar(preview).occurrences.filter((o) => o.event.name === 'Blood moon').map((o) => o.day)
    expect(blood).toEqual([84, 168, 252, 336])
    applyExample(example('moon-events'))
    expect(useStore.getState().project.documents[TIME_DOC].data.events.find((e: any) => e.name === 'Blood moon').monsterStrength).toBe(1.5)
    useStore.getState().undo()
    expect(useStore.getState().project.documents[TIME_DOC].data.events.find((e: any) => e.name === 'Blood moon').priority).toBeUndefined()
  })
})
