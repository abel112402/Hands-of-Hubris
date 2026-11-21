import { describe, expect, it } from 'vitest'
import { deserializeProject, serializeProject } from '../src/core/persistence/serialize'
import { applyReport, parseReport, storedReport } from '../src/core/engine/report'
import { balanceRows, nameFromKey, outOfRange, rangeState, unmatchedMeasurements } from '../src/core/engine/metrics'
import { collectHints, makeContext } from '../src/core/hints/engine'

const fs: { readFileSync: (path: string, enc: string) => string } = await import('node:fs' as string)

/** Cinderholm with a report that measured three things. */
function setup(metrics: unknown[]) {
  const p = deserializeProject(fs.readFileSync('examples/cinderholm.hohplan.json', 'utf8')).project
  const report = { format: 'hoh-engine-report', v: 1, engine: 'unity', engineVersion: '6000.0.40f1', generatedAt: '2026-11-21T12:00:00Z', records: [], classes: [], metrics }
  applyReport(p, parseReport(JSON.stringify(report), p).report)
  return p
}
const PLAYTEST = [
  { key: 'progress.act1_hours', value: 4.4, samples: 6, min: 3.9, max: 5.1, build: '0.3.1' },
  { key: 'combat.deaths_per_hour', value: 1.2, samples: 14, min: 0, max: 3, build: '0.3.1' },
  { key: 'economy.gold_per_hour', value: 310, samples: 9 },
]

describe('measured values on the Balance plan', () => {
  it('puts each measurement next to its metric and checks the range', () => {
    const rows = balanceRows(setup(PLAYTEST))
    const by = new Map(rows.map((r) => [r.key, r]))
    expect(by.get('progress.act1_hours')).toMatchObject({ target: 4, min: 3, max: 5, current: 5.2, state: 'in', measured: { value: 4.4, samples: 6, build: '0.3.1' } })
    expect(by.get('progress.act1_hours')!.offTarget).toBeCloseTo(0.1)
    expect(by.get('combat.deaths_per_hour')).toMatchObject({ state: 'high' })
    expect(by.get('town.starved_first_winter_pct')).toMatchObject({ state: 'notMeasured', measured: undefined })
  })

  it('lists measurements no metric names, and makes a name from the key', () => {
    const p = setup(PLAYTEST)
    expect(unmatchedMeasurements(p).map((m) => m.key)).toEqual(['economy.gold_per_hour'])
    expect(nameFromKey('economy.gold_per_hour')).toBe('Economy: gold per hour')
    expect(nameFromKey('combat.ttk.greenhollowBrute')).toBe('Combat: ttk greenhollow brute')
    expect(nameFromKey('fps')).toBe('Fps')
  })

  it('reads ranges with open ends and reversed bounds', () => {
    expect(rangeState(5, undefined, 4)).toBe('high')
    expect(rangeState(-1, 0)).toBe('low')
    expect(rangeState(3)).toBe('noRange')
    const p = setup(PLAYTEST)
    p.documents['qa.balance'].data.metrics[1].min = 2
    p.documents['qa.balance'].data.metrics[1].max = 1 // written the wrong way round
    expect(balanceRows(p).find((r) => r.key === 'combat.deaths_per_hour')).toMatchObject({ min: 1, max: 2, state: 'in' })
  })

  it('keeps min, max and build in the stored report and refuses invalid numbers', () => {
    const p = setup(PLAYTEST)
    const back = deserializeProject(serializeProject(p)).project
    expect(storedReport(back)!.metrics[0]).toEqual(PLAYTEST[0])
    const bad = { format: 'hoh-engine-report', v: 1, engine: 'unity', generatedAt: 'x', metrics: [{ key: 'a', value: 'lots' }] }
    expect(() => parseReport(JSON.stringify(bad), p)).toThrow(/metrics\.0\.value/)
  })

  it('gives a hint on the Balance plan when a measurement is out of range', () => {
    const p = setup(PLAYTEST)
    expect(outOfRange(p).map((r) => r.key)).toEqual(['combat.deaths_per_hour'])
    const h = collectHints(makeContext(p, { docId: 'qa.balance' })).find((x) => x.ruleId === 'engine.metricOutOfRange')
    expect(h).toMatchObject({ severity: 'suggest', params: { count: 1, names: 'Deaths per hour (Medium)' }, target: { docId: 'qa.balance', sectionId: 'metrics' } })
    expect(collectHints(makeContext(setup([PLAYTEST[0]]), { docId: 'qa.balance' })).some((x) => x.ruleId === 'engine.metricOutOfRange')).toBe(false)
  })
})
