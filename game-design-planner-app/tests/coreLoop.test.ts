import { describe, expect, it } from 'vitest'
import { collectHints, makeContext } from '../src/core/hints/engine'
import { createProject, makeId } from '../src/core/model/project'
import { MODULES, ensureDocument } from '../src/core/modules/registry'
import { moduleToMarkdown } from '../src/core/export/markdown'
import { deserializeProject, serializeProject } from '../src/core/persistence/serialize'
import { CORE_LOOP_DOC, formatMinutes, hasFeedback, loopPacing, pillarLoops, wrongDirection } from '../src/core/coreLoop'

const mod = MODULES.find((m) => m.id === CORE_LOOP_DOC)!
const build = (loops: any[], extra: Record<string, any> = {}) => {
  const p = createProject('T', false)
  p.documents[CORE_LOOP_DOC] = { moduleVersion: 2, data: { loops, loopGraph: { nodes: [], edges: [] }, rewardsProgression: {}, ...extra } }
  return p
}
const LOOPS = [
  { id: 'm', name: 'Swing', scale: 'Moment-to-moment', cycleMinutes: 0.05, leadsTo: ['s'] },
  { id: 's', name: 'Gather', scale: 'Short (minutes)', cycleMinutes: 15, leadsTo: ['d', 'm'] },
  { id: 'd', name: 'Town', scale: 'Medium (hours / days)', cycleMinutes: 240, leadsTo: ['l'] },
  { id: 'l', name: 'Campaign', scale: 'Long (campaign)', cycleMinutes: 3000 },
]
const rules = (p: ReturnType<typeof build>, docId: string = CORE_LOOP_DOC) =>
  collectHints(makeContext(p, { docId })).filter((h) => h.ruleId.startsWith('coreLoop.'))
const ruleIds = (p: ReturnType<typeof build>, docId?: string) => rules(p, docId).map((h) => h.ruleId)

describe('core loop analysis', () => {
  it('finds links to the same or a shorter time scale', () => {
    const p = build(LOOPS)
    expect(wrongDirection(p).map((l) => `${l.from.id}>${l.to.id}`)).toEqual(['s>m'])
  })

  it('computes nesting ratios and in-game days, sorted by scale', () => {
    const p = build(LOOPS)
    p.documents['design.timeWeather'] = { moduleVersion: 2, data: { time: { dayLength: 30 } } }
    const rows = loopPacing(p)
    expect(rows.map((r) => r.loop.id)).toEqual(['m', 's', 'd', 'l'])
    const [m, s, d] = rows
    expect(m.links).toEqual([{ to: LOOPS[1], ratio: 300, inverted: false }])
    // Gather (15 min) → Town (240): 16 cycles; → Swing is shorter, so inverted.
    expect(s.links.map((l) => [l.to.id, l.ratio, l.inverted])).toEqual([
      ['d', 16, false],
      ['m', 0.05 / 15, true],
    ])
    expect(d.days).toBe(8)
    expect(s.days).toBe(0.5)
  })

  it('leaves days and links out when lengths are missing', () => {
    const p = build([{ id: 'a', name: 'A', scale: 'Short (minutes)', leadsTo: ['b'] }, { id: 'b', name: 'B', scale: 'Long (campaign)', cycleMinutes: 100 }])
    const [a, b] = loopPacing(p)
    expect(a).toMatchObject({ minutes: undefined, links: [] })
    expect(b.days).toBeUndefined()
  })

  it('lists the loops serving each Vision pillar', () => {
    const p = build([{ id: 'a', name: 'A', pillars: ['p1'] }, { id: 'b', name: 'B', pillars: ['p1', 'p2'] }])
    p.documents['overview.vision'] = { moduleVersion: 2, data: { pillars: [{ id: 'p1', name: 'Cozy' }, { id: 'p2', name: 'Industry' }, { id: 'p3', name: 'Magic' }] } }
    expect(pillarLoops(p).map((c) => [c.pillar.id, c.loops.map((l) => l.id)])).toEqual([
      ['p1', ['a', 'b']],
      ['p2', ['b']],
      ['p3', []],
    ])
  })

  it('detects a feedback path and formats real time', () => {
    const n = (id: string) => ({ id, label: id, kind: 'Action', x: 0, y: 0 })
    expect(hasFeedback({ nodes: [n('a'), n('b')], edges: [{ id: '1', source: 'a', target: 'b' }] })).toBe(false)
    expect(hasFeedback({ nodes: [n('a'), n('b')], edges: [{ id: '1', source: 'a', target: 'b' }, { id: '2', source: 'b', target: 'a' }] })).toBe(true)
    expect([0.05, 15, 240, 3000].map(formatMinutes)).toEqual(['3 s', '15 min', '4 h', '2.1 d'])
  })
})

describe('core loop schema and export', () => {
  it('keeps v2 loops unchanged when loaded (new fields are optional)', () => {
    const p = build([{ id: 'a', name: 'A', scale: 'Short (minutes)', reward: 'Wood', leadsTo: [] }])
    const back = deserializeProject(serializeProject(p)).project
    ensureDocument(back, mod, makeId)
    expect(back.documents[CORE_LOOP_DOC].data.loops).toEqual([{ id: 'a', name: 'A', scale: 'Short (minutes)', reward: 'Wood', leadsTo: [] }])
  })

  it('adds the pacing table and pillar coverage under rewards and progression', () => {
    const p = build(LOOPS.map((l) => ({ ...l, pillars: l.id === 's' ? ['p1'] : [] })), { rewardsProgression: { rewardsProgression: 'Gathering feeds the town.' } })
    p.documents['overview.vision'] = { moduleVersion: 2, data: { pillars: [{ id: 'p1', name: 'Cozy' }, { id: 'p2', name: 'Industry' }] } }
    const md = moduleToMarkdown(p, mod)
    const headings = [...md.matchAll(/^## \d+\. (.+)$/gm)].map((m) => m[1])
    expect(headings).toEqual(['Moment-to-moment', 'Short-term loop (minutes)', 'Medium-term loop (hours / days)', 'Long-term loop (campaign)', 'Rewards and progression systems', 'Gameplay diagrams'])
    const ch5 = md.slice(md.indexOf('Rewards and progression systems'), md.indexOf('Gameplay diagrams'))
    expect(ch5).toContain('Gathering feeds the town.')
    expect(ch5).toContain('| Gather | Short (minutes) | 15 min | Town ×16, Swing (not longer) |')
    expect(ch5).toContain('**Pillars served by loops:** Cozy (Gather); Industry (none)')
  })
})

describe('core loop hints', () => {
  it('stay quiet on an empty doc and in other editors', () => {
    expect(ruleIds(build([]))).toEqual([])
    expect(ruleIds(build(LOOPS), 'design.items')).toEqual([])
  })

  it('flags wrong-direction and inverted-pacing links, and not once fixed', () => {
    const p = build(LOOPS.map((l) => ({ ...l })))
    expect(ruleIds(p)).toEqual(expect.arrayContaining(['coreLoop.direction', 'coreLoop.pacing']))
    expect(rules(p).find((h) => h.ruleId === 'coreLoop.direction')?.params?.names).toBe('Gather → Swing')
    p.documents[CORE_LOOP_DOC].data.loops[1].leadsTo = ['d']
    expect(ruleIds(p)).not.toContain('coreLoop.direction')
    expect(ruleIds(p)).not.toContain('coreLoop.pacing')
  })

  it('flags pacing when lengths contradict the scales even if the scales point the right way', () => {
    const p = build([
      { id: 'a', name: 'A', scale: 'Short (minutes)', cycleMinutes: 300, leadsTo: ['b'] },
      { id: 'b', name: 'B', scale: 'Medium (hours / days)', cycleMinutes: 60 },
    ])
    expect(ruleIds(p)).toContain('coreLoop.pacing')
    expect(ruleIds(p)).not.toContain('coreLoop.direction')
  })

  it('flags pillars no loop serves, once loops are tagged', () => {
    const p = build([{ id: 'a', name: 'A' }])
    p.documents['overview.vision'] = { moduleVersion: 2, data: { pillars: [{ id: 'p1', name: 'Cozy' }, { id: 'p2', name: 'Industry' }] } }
    expect(ruleIds(p)).not.toContain('coreLoop.pillars')
    p.documents[CORE_LOOP_DOC].data.loops[0].pillars = ['p1']
    expect(rules(p).find((h) => h.ruleId === 'coreLoop.pillars')?.params).toEqual({ count: 1, names: 'Industry' })
    p.documents[CORE_LOOP_DOC].data.loops[0].pillars = ['p1', 'p2']
    expect(ruleIds(p)).not.toContain('coreLoop.pillars')
  })

  it('flags rewards without refs once one loop has them', () => {
    const p = build([{ id: 'a', name: 'A', reward: 'Wood' }, { id: 'b', name: 'B', reward: 'Tools' }])
    expect(ruleIds(p)).not.toContain('coreLoop.rewardRefs')
    p.documents[CORE_LOOP_DOC].data.loops[0].rewardRefs = ['wood']
    expect(rules(p).find((h) => h.ruleId === 'coreLoop.rewardRefs')?.params).toEqual({ count: 1, names: 'B' })
  })

  it('never reaches important severity', () => {
    const p = build(LOOPS)
    p.documents['overview.vision'] = { moduleVersion: 2, data: { pillars: [{ id: 'p1', name: 'Cozy' }] } }
    p.documents[CORE_LOOP_DOC].data.loops[0].pillars = ['x']
    const hints = rules(p)
    expect(hints.length).toBeGreaterThan(0)
    expect(hints.every((h) => h.severity !== 'important')).toBe(true)
  })
})
