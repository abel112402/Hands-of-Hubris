import { describe, expect, it } from 'vitest'
import { moduleToMarkdown } from '../src/core/export/markdown'
import { collectHints, makeContext } from '../src/core/hints/engine'
import { createProject, makeId } from '../src/core/model/project'
import { ensureDocument, getModule, getSection } from '../src/core/modules/registry'
import { decidedNotWrittenBack, decidedWithoutDecision, OPEN_QUESTIONS_DOC as DOC, overdue, questionStats } from '../src/core/openQuestions'
import { useStore } from '../src/core/store/store'
import { GUIDES } from '../src/modules/guides'
import { OPEN_QUESTIONS_GUIDE as G } from '../src/modules/guides/openQuestions'
import { applyExample, previewProject } from '../src/ui/guides/ExamplePicker'

const mod = getModule(DOC)!
const NOW = new Date(2026, 10, 7, 12).getTime() // 2026-11-07

const project = (questions: Record<string, unknown>[]) => {
  const p = createProject('t')
  p.documents[DOC].data.questions = questions.map((q, i) => ({ id: `q${i + 1}`, ...q }))
  return p
}
const ruleIds = (p: ReturnType<typeof createProject>, docId = DOC) =>
  collectHints(makeContext(p, { docId, now: NOW })).filter((h) => h.ruleId.startsWith('oq.')).map((h) => h.ruleId)

describe('open questions v2', () => {
  it('migrates v1: ids kept, known areas kept, free text moved into earlier notes', () => {
    const p = createProject('t')
    p.documents[DOC] = {
      moduleVersion: 1,
      data: {
        questions: [
          { id: 'a', name: 'Money?', area: 'economy', owner: 'Ábel', due: 'end of sprint 3', status: 'Open' },
          { id: 'b', name: 'Ships?', area: 'Naval', due: '2026-12-01' },
          { id: 'c', name: 'Blank', area: '', owner: '' },
        ],
      },
    }
    const doc = ensureDocument(p, mod, makeId)
    expect(doc.moduleVersion).toBe(2)
    const [a, b, c] = doc.data.questions
    expect(doc.data.questions.map((q: any) => q.id)).toEqual(['a', 'b', 'c'])
    expect(a).toMatchObject({ area: 'Economy', status: 'Open', legacyNotes: 'Owner: Ábel\nDue: end of sprint 3' })
    expect(a.owner).toBeUndefined()
    expect(a.due).toBeUndefined()
    expect(b).toMatchObject({ area: 'Other', due: '2026-12-01', legacyNotes: 'Area: Naval' })
    expect(c.area).toBeUndefined()
    expect(c.owner).toBeUndefined()
    expect(c.legacyNotes).toBeUndefined()
  })

  it('counts statuses and finds overdue, undecided-text and not-written-back questions', () => {
    const p = project([
      { name: 'A', status: 'Open', due: '2026-11-01' },
      { name: 'B', status: 'Discussion', due: '2026-11-07' },
      { name: 'C', status: 'Decided', due: '2026-01-01', decision: 'Yes', affects: ['NPC System'] },
      { name: 'D', status: 'Decided' },
      { name: 'E' },
    ])
    expect(questionStats(p, NOW)).toEqual({ open: 2, discussion: 1, decided: 2, overdue: 1 })
    expect(overdue(p, NOW).map((q) => q.name)).toEqual(['A'])
    expect(decidedWithoutDecision(p).map((q) => q.name)).toEqual(['D'])
    expect(decidedNotWrittenBack(p).map((q) => q.name)).toEqual(['D'])
  })

  it('exports the doc’s table columns in order with a summary line', () => {
    const p = project([{ name: 'Money?', area: 'Economy', options: 'A / B', decision: 'A', status: 'Decided', due: '2026-12-01', affects: ['NPC System'], legacyNotes: 'Owner: X' }])
    const md = moduleToMarkdown(p, mod)
    expect(md).toContain('| # | Question | Area | Options | Decision | Status | Owner | Due | Updated in docs |')
    expect(md).toContain('| 1 | Money? | Economy | A / B | A | Decided |  | 2026-12-01 | NPC System |')
    expect(md).toMatch(/Open: 0 \(0 in discussion\) · Decided: 1 · Overdue: 0/)
    expect(md).toContain('* **Money?**, earlier notes: Owner: X')
  })
})

describe('open questions hints', () => {
  it('stay quiet on a fresh (seeded) project and in other editors, and never exceed suggest', () => {
    expect(ruleIds(createProject('x'))).toEqual([])
    const p = project([{ name: 'A', status: 'Decided', due: '2020-01-01' }, { name: 'B', due: '2020-01-01' }])
    expect(ruleIds(p, 'design.items')).toEqual([])
    const hints = collectHints(makeContext(p, { docId: DOC, now: NOW })).filter((h) => h.ruleId.startsWith('oq.'))
    expect(hints.map((h) => h.ruleId).sort()).toEqual(['oq.decidedNoText', 'oq.notWrittenBack', 'oq.overdue'])
    expect(hints.every((h) => h.severity === 'suggest')).toBe(true)
  })

  const cases: [string, Record<string, unknown>, Record<string, unknown>][] = [
    ['oq.decidedNoText', { status: 'Decided', affects: ['x'] }, { status: 'Decided', affects: ['x'], decision: 'B' }],
    ['oq.notWrittenBack', { status: 'Decided', decision: 'B' }, { status: 'Decided', decision: 'B', affects: ['NPC System'] }],
    ['oq.overdue', { status: 'Open', due: '2026-11-06' }, { status: 'Open', due: '2026-11-07' }],
  ]
  for (const [rule, bad, good] of cases)
    it(`${rule}: fires on the problem and not without it`, () => {
      expect(ruleIds(project([{ name: 'Q', ...bad }]))).toContain(rule)
      expect(ruleIds(project([{ name: 'Q', ...good }]))).not.toContain(rule)
    })
})

describe('open questions guide', () => {
  it('points every step, node, example and empty text at a real section or doc', () => {
    const reg = createProject('t').registry
    for (const id of [...G.steps.map((s) => s.section), ...G.examples.map((e) => e.section), ...Object.keys(G.empty), ...G.map.nodes.flatMap((n) => (n.section ? [n.section] : []))])
      expect(getSection(mod, reg, id), id).toBeTruthy()
    for (const n of G.map.nodes) if (n.doc) expect(getModule(n.doc), n.doc).toBeTruthy()
    for (const e of G.map.edges) expect(G.map.nodes.some((n) => n.id === e.from) && G.map.nodes.some((n) => n.id === e.to)).toBe(true)
    expect(GUIDES[DOC]).toBe(G)
  })

  it('ticks steps from the data', () => {
    const step = (id: string) => G.steps.find((s) => s.id === id)!
    const p = project([{ name: 'Q', area: 'NPC' }])
    expect(step('add').done!(p)).toBe(true)
    expect(step('area').done!(p)).toBe(true)
    expect(step('options').done!(p)).toBe(false)
    expect(step('decide').done!(p)).toBe(false)
    p.documents[DOC].data.questions[0] = { ...p.documents[DOC].data.questions[0], status: 'Decided', decision: 'Yes', affects: ['NPC System'] }
    expect(step('decide').done!(p)).toBe(true)
  })

  it('previews the starter set on a copy, fills options on the seeds, and undoes in one step', () => {
    useStore.getState().loadProject(createProject('T'), 'x')
    const before = useStore.getState().project
    const ex = G.examples[0]
    const preview = previewProject(before, ex)
    expect(preview.documents[DOC].data.questions).toHaveLength(5)
    expect(preview.documents[DOC].data.questions.every((q: any) => q.options)).toBe(true)
    expect(before.documents[DOC].data.questions.some((q: any) => q.options)).toBe(false)
    applyExample(ex)
    expect(useStore.getState().project.documents[DOC].data.questions).toEqual(preview.documents[DOC].data.questions)
    useStore.getState().undo()
    expect(useStore.getState().project.documents[DOC].data.questions.some((q: any) => q.options)).toBe(false)
  })
})
