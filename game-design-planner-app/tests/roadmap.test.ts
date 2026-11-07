import { describe, expect, it } from 'vitest'
import { collectHints, makeContext } from '../src/core/hints/engine'
import { createProject, makeId } from '../src/core/model/project'
import { MODULES, ensureDocument } from '../src/core/modules/registry'
import { moduleToMarkdown } from '../src/core/export/markdown'
import { deserializeProject, serializeProject } from '../src/core/persistence/serialize'
import { cutSavings, cutsToRecover, overload, phaseProgress, planEnd, protectedConflicts, ROADMAP_DOC } from '../src/core/roadmap'

const NOW = Date.parse('2026-06-01T12:00:00Z')
const mod = MODULES.find((m) => m.id === ROADMAP_DOC)!

const build = (data: Record<string, any> = {}) => {
  const p = createProject('T', false)
  p.documents[ROADMAP_DOC] = { moduleVersion: 2, data: { assumptions: {}, phases: [], tasks: [], dependencies: [], gates: [], cuts: [], changelog: [], ...data } }
  return p
}
const phases = [
  { id: 'a', name: 'Prep', start: 0, duration: 4, capacity: 6 },
  { id: 'b', name: 'Proto', start: 4, duration: 6, dependsOn: ['a'], capacity: 4 },
]
const tasks = [
  { id: 't1', name: 'T1', phase: 'a', effort: 3, status: 'Done' },
  { id: 't2', name: 'T2', phase: 'a', effort: 2, status: 'Blocked' },
  { id: 't3', name: 'T3', phase: 'b', effort: 5 },
  { id: 't4', name: 'T4', phase: 'b', effort: 2 },
]
const rules = (p: ReturnType<typeof build>, docId: string | undefined = ROADMAP_DOC) =>
  collectHints(makeContext(p, { docId, now: NOW })).filter((h) => h.ruleId.startsWith('roadmap.'))
const ruleIds = (p: ReturnType<typeof build>, docId?: string) => rules(p, docId).map((h) => h.ruleId)

describe('roadmap analysis', () => {
  it('computes phase progress, capacity and lateness', () => {
    // Start 2026-04-01: phase a ends week 4 (2026-04-29, past), b ends week 10 (2026-06-10, not yet).
    const p = build({ assumptions: { startDate: '2026-04-01' }, phases, tasks })
    const [a, b] = phaseProgress(p, NOW)
    expect(a).toMatchObject({ tasks: 2, done: 1, blocked: 1, effort: 5, effortDone: 3, capacity: 6, over: false, endDate: '2026-04-29', late: true })
    expect(b).toMatchObject({ tasks: 2, done: 0, effort: 7, capacity: 4, over: true, endDate: '2026-06-10', late: false })
  })

  it('is never late without a start date', () => {
    expect(phaseProgress(build({ phases, tasks }), NOW).some((r) => r.late)).toBe(false)
  })

  it('sums the overload and the planned end with buffer', () => {
    const p = build({ assumptions: { buffer: 15 }, phases, tasks })
    expect(overload(p)).toBe(3)
    expect(planEnd(p)).toEqual({ end: 10, buffered: 12 })
  })

  it('orders cuts and does not count a task twice or count done tasks', () => {
    const p = build({
      phases,
      tasks,
      cuts: [
        { id: 'c3', name: 'Third', affectsTasks: ['t3'] },
        { id: 'c2', name: 'Second', order: 2, affectsTasks: ['t4', 't3'] },
        { id: 'c1', name: 'First', order: 1, affectsTasks: ['t1', 't4'] },
        { id: 'c4', name: 'Manual', order: 3, saving: 1.5, affectsTasks: ['t3'] },
      ],
    })
    const s = cutSavings(p)
    expect(s.map((c) => c.cut.id)).toEqual(['c1', 'c2', 'c4', 'c3'])
    expect(s.map((c) => c.saving)).toEqual([2, 5, 1.5, 0])
    expect(s.map((c) => c.source)).toEqual(['tasks', 'tasks', 'manual', 'none'])
    expect(s.map((c) => c.cumulative)).toEqual([2, 7, 8.5, 8.5])
    // Overload 3: cut 1 saves 2, cuts 1–2 save 7.
    expect(cutsToRecover(p)).toBe(2)
  })

  it('reports when the cuts do not recover the overload', () => {
    const p = build({ phases, tasks, cuts: [{ id: 'c', name: 'C', order: 1, saving: 1 }] })
    expect(cutsToRecover(p)).toBeNull()
    expect(cutsToRecover(build({ phases: [{ id: 'a', name: 'A', capacity: 10 }], tasks }))).toBe(0)
  })

  it('finds cuts that drop scope serving a protected pillar', () => {
    const p = build({ cuts: [{ id: 'c', name: 'Drop farming', scopeItems: ['s1', 's2'] }, { id: 'd', name: 'Other', scopeItems: ['s2'] }], protected: { pillars: ['p1'] } })
    p.documents['overview.vision'] = {
      moduleVersion: 2,
      data: { pillars: [{ id: 'p1', name: 'Cozy' }, { id: 'p2', name: 'Industry' }], scope: [{ id: 's1', name: 'Farming', pillars: ['p1', 'p2'] }, { id: 's2', name: 'Raids', pillars: ['p2'] }] },
    }
    const c = protectedConflicts(p)
    expect(c.map((x) => x.cut.id)).toEqual(['c'])
    expect(c[0].items.map((e) => e.id)).toEqual(['s1'])
    expect(c[0].pillars.map((e) => e.name)).toEqual(['Cozy'])
    p.documents[ROADMAP_DOC].data.protected = { pillars: [] }
    expect(protectedConflicts(p)).toEqual([])
  })
})

describe('roadmap schema', () => {
  it('adds the new sections to older documents without changing existing data', () => {
    const p = createProject('T', false)
    p.documents[ROADMAP_DOC] = { moduleVersion: 2, data: { phases: [{ id: 'x', name: 'Keep', start: 1, duration: 2 }] } }
    const back = deserializeProject(serializeProject(p)).project
    ensureDocument(back, mod, makeId)
    const d = back.documents[ROADMAP_DOC].data
    expect(d.phases).toEqual([{ id: 'x', name: 'Keep', start: 1, duration: 2 }])
    expect(d.protected).toEqual({})
    expect(d.tracking).toEqual({})
  })

  it('exports chapters in doc order with progress and savings summaries', () => {
    const p = build({ phases, tasks, cuts: [{ id: 'c1', name: 'First', order: 1, affectsTasks: ['t3'] }], tracking: { velocityThreshold: 70 } })
    ensureDocument(p, mod, makeId)
    const md = moduleToMarkdown(p, mod)
    const headings = [...md.matchAll(/^## \d+\. (.+)$/gm)].map((m) => m[1])
    expect(headings).toEqual(['Assumptions', 'Phases', 'Tasks & milestones', 'Critical dependencies', 'Gate reviews', 'Scope reduction order', 'Not cuttable', 'Metrics and tracking', 'Change log'])
    expect(md).toContain('| Prep | 1/2 | 3 / 5 | 6 |')
    expect(md).toContain('| Proto | 0/2 | 0 / 7 | 4 (over) |')
    expect(md).toContain('| 1 | First | 5 | 5 |')
    expect(md).toContain('the first cut recovers it')
  })
})

describe('roadmap hints', () => {
  it('stay quiet on an empty doc and in other editors', () => {
    expect(ruleIds(createProject('T', false) as any)).toEqual([])
    expect(ruleIds(build({ phases, tasks }), 'design.items')).toEqual([])
  })

  it('flags late phases only when the end date has passed with open tasks', () => {
    const p = build({ assumptions: { startDate: '2026-04-01' }, phases, tasks })
    expect(ruleIds(p)).toContain('roadmap.late')
    p.documents[ROADMAP_DOC].data.tasks[1].status = 'Done'
    expect(ruleIds(p)).not.toContain('roadmap.late')
  })

  it('flags a cut plan that does not cover the overload', () => {
    const p = build({ phases, tasks, cuts: [{ id: 'c', name: 'C', order: 1, saving: 1 }] })
    expect(rules(p).find((h) => h.ruleId === 'roadmap.cutsShort')?.params).toEqual({ over: 3, saved: 1 })
    p.documents[ROADMAP_DOC].data.cuts[0].saving = 3
    expect(ruleIds(p)).not.toContain('roadmap.cutsShort')
    expect(ruleIds(build({ phases: [{ id: 'a', name: 'A', start: 0, duration: 1 }] }))).not.toContain('roadmap.cutsShort')
  })

  it('flags cuts touching protected pillars', () => {
    const p = build({ cuts: [{ id: 'c', name: 'Drop farming', order: 1, scopeItems: ['s1'] }], protected: { pillars: ['p1'] } })
    p.documents['overview.vision'] = { moduleVersion: 2, data: { pillars: [{ id: 'p1', name: 'Cozy' }], scope: [{ id: 's1', name: 'Farming', pillars: ['p1'] }] } }
    expect(ruleIds(p)).toContain('roadmap.cutProtected')
    p.documents['overview.vision'].data.scope[0].pillars = []
    expect(ruleIds(p)).not.toContain('roadmap.cutProtected')
  })

  it('never reaches important severity', () => {
    const p = build({ assumptions: { startDate: '2026-04-01' }, phases, tasks, cuts: [{ id: 'c', name: 'C', saving: 0 }] })
    const hints = rules(p)
    expect(hints.length).toBeGreaterThan(0)
    expect(hints.every((h) => h.severity !== 'important')).toBe(true)
  })
})
