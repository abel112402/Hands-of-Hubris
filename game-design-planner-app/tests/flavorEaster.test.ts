import { describe, expect, it } from 'vitest'
import en from '../src/core/i18n/en.json'
import hu from '../src/core/i18n/hu.json'
import { brandClicks, BRAND_CLICKS, isAprilFools, isLongAbsence, KONAMI, konamiStep, RETURN_GAP_MS, timeBucket, undoSpree, UNDO_SPREE, type TimeBucket } from '../src/core/flavor/easter'

// 2026-11-09 is a Monday; 11-13 a Friday; 11-14 a Saturday.
const at = (day: number, hour: number) => new Date(2026, 10, day, hour, 30)

describe('time of day', () => {
  it('buckets hours, Friday afternoon and weekends', () => {
    expect(timeBucket(at(9, 2))).toBe('night')
    expect(timeBucket(at(9, 8))).toBe('morning')
    expect(timeBucket(at(9, 15))).toBe('afternoon')
    expect(timeBucket(at(13, 15))).toBe('fridayAfternoon')
    expect(timeBucket(at(13, 12))).toBe('afternoon')
    expect(timeBucket(at(9, 20))).toBe('evening')
    expect(timeBucket(at(14, 11))).toBe('weekend')
    expect(timeBucket(at(14, 21))).toBe('evening')
    expect(timeBucket(at(14, 3))).toBe('night')
  })

  it('every bucket has a greeting in both languages', () => {
    const buckets: TimeBucket[] = ['night', 'morning', 'afternoon', 'fridayAfternoon', 'evening', 'weekend']
    for (const b of buckets) {
      expect(en.flavor.greeting[b].length, b).toBeGreaterThan(0)
      expect(hu.flavor.greeting[b].length, b).toBeGreaterThan(0)
    }
  })
})

describe('returning and dates', () => {
  it('needs a previous visit at least two weeks ago', () => {
    expect(isLongAbsence(null, 1e12)).toBe(false)
    expect(isLongAbsence(1e12, 1e12 + RETURN_GAP_MS - 1)).toBe(false)
    expect(isLongAbsence(1e12, 1e12 + RETURN_GAP_MS)).toBe(true)
  })

  it('knows April Fools’ Day', () => {
    expect(isAprilFools(new Date(2027, 3, 1))).toBe(true)
    expect(isAprilFools(new Date(2027, 3, 2))).toBe(false)
  })
})

describe('Konami code', () => {
  const run = (keys: string[]) => keys.reduce(konamiStep, 0)

  it('matches the full sequence, case-insensitively', () => {
    expect(run(KONAMI)).toBe(KONAMI.length)
    expect(run(['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'B', 'A'])).toBe(KONAMI.length)
  })

  it('restarts on a wrong key and tolerates an extra "up"', () => {
    expect(run(['arrowup', 'arrowup', 'x'])).toBe(0)
    expect(run(['arrowup', 'arrowup', 'arrowup', ...KONAMI.slice(2)])).toBe(KONAMI.length)
    expect(run(['arrowdown', ...KONAMI])).toBe(KONAMI.length)
  })
})

describe('sprees', () => {
  it('fires after enough undos inside the window, then starts over', () => {
    let times: number[] = []
    let hit = false
    for (let i = 0; i < UNDO_SPREE.count; i++) ({ times, hit } = undoSpree(times, 1000 + i * 100))
    expect(hit).toBe(true)
    expect(times).toEqual([])
  })

  it('forgets undos older than the window', () => {
    let times: number[] = []
    let hit = false
    for (let i = 0; i < UNDO_SPREE.count; i++) ({ times, hit } = undoSpree(times, i * UNDO_SPREE.windowMs))
    expect(hit).toBe(false)
  })

  it('counts logo clicks the same way', () => {
    let times: number[] = []
    let hit = false
    for (let i = 0; i < BRAND_CLICKS.count; i++) ({ times, hit } = brandClicks(times, i * 50))
    expect(hit).toBe(true)
  })
})
