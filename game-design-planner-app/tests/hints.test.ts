import { describe, expect, it } from 'vitest'
import { collectHints, evaluateHints, makeContext } from '../src/core/hints/engine'
import { createProject, makeId } from '../src/core/model/project'
import { defaultHintPrefs } from '../src/core/model/types'
import { deserializeProject, serializeProject } from '../src/core/persistence/serialize'

const empty = () => createProject('T', false)
const ids = (p: ReturnType<typeof empty>, docId?: string, sectionId?: string) =>
  collectHints(makeContext(p, { docId, sectionId })).map((h) => h.ruleId)

describe('hint rules', () => {
  it('suggests the next documents on an empty project, in order', () => {
    const hints = collectHints(makeContext(empty())).filter((h) => h.ruleId === 'onboarding.next')
    expect(hints.map((h) => h.target.docId)).toEqual(['overview.vision', 'design.coreLoop', 'design.player'])
  })

  it('asks for the vision first once design docs have content', () => {
    const p = empty()
    expect(ids(p)).not.toContain('dependency.visionFirst')
    p.documents['design.coreLoop'] = { moduleVersion: 1, data: { loops: [{ id: 'a', name: 'Loop' }] } }
    expect(ids(p)).toContain('dependency.visionFirst')
  })

  it('flags empty sections with an addEntity action for collections', () => {
    const hint = collectHints(makeContext(createProject('T', false), { docId: 'design.items' })).find(
      (h) => h.ruleId === 'completeness.emptySection' && h.target.sectionId === 'items',
    )
    expect(hint?.action?.kind).toBe('addEntity')
  })

  it('detects numeric outliers with the configurable IQR threshold', () => {
    const p = empty()
    const items = [1, 2, 2, 3, 3, 3, 4, 4, 5, 500].map((value, i) => ({ id: makeId(), name: `I${i}`, value }))
    p.documents['design.items'] = { moduleVersion: 1, data: { items } }
    expect(ids(p, 'design.items')).toContain('balance.outlier')
    p.meta.hints = { ...defaultHintPrefs(), thresholds: { ...defaultHintPrefs().thresholds, outlierIqr: 1000 } }
    expect(ids(p, 'design.items')).not.toContain('balance.outlier')
  })

  it('finds isolated graph nodes', () => {
    const p = empty()
    p.documents['design.coreLoop'] = {
      moduleVersion: 1,
      data: {
        loopGraph: {
          nodes: [
            { id: 'a', label: 'A', kind: 'Action', x: 0, y: 0 },
            { id: 'b', label: 'B', kind: 'Action', x: 0, y: 0 },
            { id: 'c', label: 'C', kind: 'Action', x: 0, y: 0 },
          ],
          edges: [{ id: 'e', source: 'a', target: 'b' }],
        },
      },
    }
    expect(collectHints(makeContext(p, { docId: 'design.coreLoop' })).find((h) => h.ruleId === 'editor.graph')?.params?.names).toBe('C')
  })

  it('reports undefined formula variables', () => {
    const p = empty()
    p.documents['design.combat'] = { moduleVersion: 1, data: { damage: { items: [{ id: 'f', name: 'Dmg', expr: 'atk * 2', vars: {} }] } } }
    const h = collectHints(makeContext(p, { docId: 'design.combat' })).filter((x) => x.ruleId === 'formula.check')
    expect(h).toHaveLength(1)
    expect(h[0].params?.vars).toBe('atk')
  })

  it('flags overdue milestones', () => {
    const p = empty()
    p.documents['production.milestones'] = { moduleVersion: 1, data: { milestones: [{ id: 'm', name: 'M1', due: '2020-01-01', status: 'In progress' }] } }
    expect(ids(p, 'production.milestones')).toContain('process.milestones')
  })

  it('evaluates user-defined declarative rules', () => {
    const p = empty()
    p.registry.hintRules = [
      { id: 'r1', doc: 'design.npc', section: 'archetypes', when: { kind: 'count', op: '<', value: 3 }, severity: 'suggest', title: 'Few NPCs', body: 'Only {count}' },
    ]
    const h = collectHints(makeContext(p, { docId: 'design.npc' })).find((x) => x.ruleId === 'user:r1')
    expect(h?.title).toBe('Few NPCs')
  })
})

describe('hint engine', () => {
  const base = () => {
    const p = empty()
    return p
  }
  it('is deterministic and limited to 5 active hints', () => {
    const p = base()
    const a = evaluateHints(makeContext(p, { docId: 'design.items' }))
    const b = evaluateHints(makeContext(p, { docId: 'design.items' }))
    expect(a.visible.map((h) => h.id)).toEqual(b.visible.map((h) => h.id))
    expect(a.visible.length).toBeLessThanOrEqual(5)
  })

  it('ranks hints of the current document first', () => {
    const { visible } = evaluateHints(makeContext(base(), { docId: 'design.items' }))
    expect(visible[0].target.docId).toBe('design.items')
  })

  it('honours dismiss, mute, snooze, severity and disable', () => {
    const p = base()
    const first = evaluateHints(makeContext(p, { docId: 'design.items' })).visible[0]
    p.meta.hints = { ...defaultHintPrefs(), dismissed: { [first.id]: true } }
    expect(evaluateHints(makeContext(p, { docId: 'design.items' })).visible.map((h) => h.id)).not.toContain(first.id)

    p.meta.hints = { ...defaultHintPrefs(), mutedRules: [first.ruleId] }
    expect(evaluateHints(makeContext(p, { docId: 'design.items' })).visible.map((h) => h.ruleId)).not.toContain(first.ruleId)

    p.meta.hints = defaultHintPrefs()
    const ctx = makeContext(p, { docId: 'design.items' })
    expect(evaluateHints(ctx, { [first.id]: ctx.now + 1000 }).visible.map((h) => h.id)).not.toContain(first.id)

    p.meta.hints = { ...defaultHintPrefs(), minSeverity: 'important' }
    expect(evaluateHints(makeContext(p, { docId: 'design.items' })).visible.every((h) => h.severity === 'important')).toBe(true)

    p.meta.hints = { ...defaultHintPrefs(), enabled: false }
    expect(evaluateHints(makeContext(p, { docId: 'design.items' })).total).toBe(0)
  })

  it('stores preferences in the project file and loads older files without them', () => {
    const p = base()
    p.meta.hints = { ...defaultHintPrefs(), dismissed: { x: true } }
    expect(deserializeProject(serializeProject(p)).project.meta.hints?.dismissed).toEqual({ x: true })
    const old = base()
    expect(deserializeProject(serializeProject(old)).project.meta.hints).toBeUndefined()
  })
})
