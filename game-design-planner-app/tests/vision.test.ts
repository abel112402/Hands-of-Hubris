import { describe, expect, it } from 'vitest'
import { collectHints, makeContext } from '../src/core/hints/engine'
import { createProject } from '../src/core/model/project'
import { pillarCoverage, pitchCheck, scopeCounts, scopeWithoutPillar, uspWithoutPillar, visionReadiness } from '../src/core/vision'

const DOC = 'overview.vision'
const build = (data: Record<string, any> = {}) => {
  const p = createProject('T', false)
  p.documents[DOC] = { moduleVersion: 2, data: { pitch: {}, pillars: [], usps: [], scope: [], audience: { audience: 'Cozy builders' }, ...data } }
  return p
}
const pillars = [
  { id: 'a', name: 'Cozy', decisionTest: 'x' },
  { id: 'b', name: 'Industry', decisionTest: 'x' },
  { id: 'c', name: 'Magic', decisionTest: 'x' },
]
const rules = (p: ReturnType<typeof build>, docId: string | undefined = DOC) =>
  collectHints(makeContext(p, { docId })).filter((h) => h.ruleId.startsWith('vision.'))
const ruleIds = (p: ReturnType<typeof build>, docId: string | undefined = DOC) => rules(p, docId).map((h) => h.ruleId)

describe('vision analysis', () => {
  const p = build({
    pillars,
    usps: [{ id: 'u1', name: 'Hybrid', pillars: ['b', 'c'] }, { id: 'u2', name: 'Loose' }],
    scope: [
      { id: 's1', name: 'Farming', bucket: 'In MVP', pillars: ['a'] },
      { id: 's2', name: 'Factories', bucket: 'In MVP', pillars: ['b', 'gone'] },
      { id: 's3', name: 'Raids', bucket: 'Later', pillars: ['c'] },
      { id: 's4', name: 'Orphan', bucket: 'In MVP' },
      { id: 's5', name: 'Stale', bucket: 'Out of scope', pillars: ['gone'] },
      { id: 's6', name: 'Undecided' },
    ],
  })

  it('computes pillar coverage', () => {
    const cov = Object.fromEntries(pillarCoverage(p).map((c) => [c.pillar.id, c]))
    expect(cov.a.scope.map((e) => e.id)).toEqual(['s1'])
    expect(cov.a.usps).toEqual([])
    expect(cov.b.mvp.map((e) => e.id)).toEqual(['s2'])
    expect(cov.b.usps.map((e) => e.id)).toEqual(['u1'])
    expect(cov.c.notInMvp).toBe(true)
    expect(cov.c.unused).toBe(false)
  })

  it('marks a pillar nothing points at as unused', () => {
    const q = build({ pillars, scope: [{ id: 's', name: 'S', pillars: ['a'] }] })
    expect(pillarCoverage(q).filter((c) => c.unused).map((c) => c.pillar.id)).toEqual(['b', 'c'])
  })

  it('finds scope items and USPs with no existing pillar', () => {
    expect(scopeWithoutPillar(p).map((e) => e.id)).toEqual(['s4', 's5', 's6'])
    expect(uspWithoutPillar(p).map((e) => e.id)).toEqual(['u2'])
  })

  it('counts scope buckets', () => {
    expect(scopeCounts(p)).toEqual({ 'In MVP': 3, Later: 1, 'Out of scope': 1, Undecided: 1 })
  })

  it('checks the pitch shape', () => {
    expect(pitchCheck('').problems).toEqual(['empty'])
    expect(pitchCheck('A town sim').problems).toEqual(['short'])
    expect(pitchCheck('A cozy management game where you rebuild a town in order to restore its magic.').problems).toEqual([])
    expect(pitchCheck('A cozy management game where you rebuild a town to restore magic. It is also about trade.').problems).toContain('multiSentence')
    expect(pitchCheck('word '.repeat(45)).problems).toContain('long')
  })

  it('reports readiness per chapter in doc order', () => {
    const r = visionReadiness(p)
    expect(r.map((x) => x.sectionId)).toEqual(['pitch', 'references', 'audience', 'usps', 'pillars', 'tone', 'scope', 'platform', 'monetization'])
    expect(r.filter((x) => x.filled).map((x) => x.sectionId)).toEqual(['audience', 'usps', 'pillars', 'scope'])
  })
})

describe('vision link hints', () => {
  it('stay quiet on an empty doc and in other editors', () => {
    expect(ruleIds(createProject('T', false))).toEqual([])
    const p = build({ pillars, scope: [{ id: 's', name: 'S', bucket: 'In MVP' }] })
    expect(ruleIds(p, 'design.items')).toEqual([])
  })

  it('flags MVP items without a pillar, and USPs without one', () => {
    const p = build({
      pillars,
      usps: [{ id: 'u', name: 'U', playerBenefit: 'x' }],
      scope: [{ id: 's', name: 'S', bucket: 'In MVP' }, { id: 't', name: 'T', bucket: 'Later' }],
    })
    const r = ruleIds(p)
    expect(r).toContain('vision.scopeNoPillar')
    expect(r).toContain('vision.uspPillar')
    // Later items without a pillar are not flagged: only the MVP one is counted.
    expect(rules(p).find((h) => h.ruleId === 'vision.scopeNoPillar')?.params?.count).toBe(1)
  })

  it('does not flag link hints when there are no pillars yet', () => {
    const p = build({ usps: [{ id: 'u', name: 'U' }], scope: [{ id: 's', name: 'S', bucket: 'In MVP' }] })
    expect(ruleIds(p)).not.toContain('vision.scopeNoPillar')
    expect(ruleIds(p)).not.toContain('vision.uspPillar')
  })

  it('flags unused pillars and pillars missing from the MVP once links exist', () => {
    const p = build({ pillars, scope: [{ id: 's', name: 'S', bucket: 'In MVP', pillars: ['a'] }, { id: 't', name: 'T', bucket: 'Later', pillars: ['b'] }] })
    const r = ruleIds(p)
    expect(r).toContain('vision.pillarUnused')
    expect(r).toContain('vision.pillarNotInMvp')
    p.documents[DOC].data.scope.push({ id: 'u', name: 'U', bucket: 'In MVP', pillars: ['b', 'c'] })
    expect(ruleIds(p)).not.toContain('vision.pillarUnused')
    expect(ruleIds(p)).not.toContain('vision.pillarNotInMvp')
  })

  it('stays quiet about pillar usage until something is linked', () => {
    const p = build({ pillars, scope: [{ id: 's', name: 'S', bucket: 'In MVP' }] })
    expect(ruleIds(p)).not.toContain('vision.pillarUnused')
  })

  it('flags an odd pitch only when one is written', () => {
    expect(ruleIds(build({ pitch: { pitch: 'A town sim' } }))).toContain('vision.pitchShape')
    expect(ruleIds(build({ pitch: { pitch: 'A cozy management game where you rebuild a town in order to restore its magic.' } }))).not.toContain('vision.pitchShape')
    expect(ruleIds(build())).not.toContain('vision.pitchShape')
  })

  it('never reaches important severity', () => {
    const p = build({ pillars: [], usps: [{ id: 'u', name: 'U' }], scope: [{ id: 's', name: 'S', bucket: 'In MVP' }], pitch: { pitch: 'Short' } })
    const hints = rules(p)
    expect(hints.length).toBeGreaterThan(0)
    expect(hints.every((h) => h.severity !== 'important')).toBe(true)
  })
})

describe('vision export', () => {
  it('adds a pillar coverage table after the scope section', async () => {
    const { moduleToMarkdown } = await import('../src/core/export/markdown')
    const { MODULES } = await import('../src/core/modules/registry')
    const mod = MODULES.find((m) => m.id === DOC)!
    const p = build({
      pillars: [{ id: 'a', name: 'Cozy' }, { id: 'b', name: 'Industry' }],
      scope: [{ id: 's1', name: 'Farming', bucket: 'In MVP', pillars: ['a'] }, { id: 's2', name: 'Raids', bucket: 'Later' }],
    })
    const md = moduleToMarkdown(p, mod)
    expect(md).toContain('| Scope item | Bucket | Cozy | Industry |')
    expect(md).toContain('| Farming | In MVP | x |  |')
    expect(md).toContain('| **Items / in MVP** | | 1 / 1 | 0 / 0 |')
    expect(md).toContain('Serving no pillar yet: Raids')
  })
})
