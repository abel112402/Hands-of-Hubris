import { describe, expect, it } from 'vitest'
import { produce } from 'immer'
import { createProject, makeId } from '../src/core/model/project'
import { deserializeProject, serializeProject } from '../src/core/persistence/serialize'
import { GENRES } from '../src/modules/genres'
import { GUIDES } from '../src/modules/guides'
import { BASE_PACK, GENRE_PACKS } from '../src/modules/walkthroughs'
import { collectHints, makeContext, ruleOf } from '../src/core/hints/engine'
import { composeWalkthrough, groupWalkthrough, textOf } from '../src/core/walkthrough/compose'
import { basePack, genrePack, parsePack } from '../src/core/walkthrough/schema'
import {
  evaluateWalkthrough,
  readGuideState,
  resetGuideState,
  setModuleStepManual,
  setStepManual,
  setStepSkipped,
} from '../src/core/walkthrough/evaluate'
import { projectWalkthrough, stepLink, validatePack } from '../src/core/walkthrough/project'
import type { BasePack, DoneRule, GenrePack, WalkStep } from '../src/core/walkthrough/types'
import type { Project } from '../src/core/model/types'

const step = (id: string, extra: Partial<WalkStep> = {}): WalkStep => ({
  id,
  kind: 'decide',
  phase: 'concept',
  chapter: 'a',
  title: id,
  body: `${id} body`,
  done: { kind: 'manual' },
  ...extra,
})

const BASE: BasePack = {
  id: 'base',
  version: 1,
  chapters: [
    { id: 'a', phase: 'concept', title: 'A' },
    { id: 'b', phase: 'concept', title: 'B' },
    { id: 's', phase: 'systems', title: 'S' },
  ],
  steps: [step('one'), step('two'), step('sys', { phase: 'systems', chapter: 's' }), step('bee', { chapter: 'b' })],
}
const ids = (packs: GenrePack[]) => composeWalkthrough(BASE, packs).steps.map((s) => s.id)
const empty = () => createProject('Test', false)
const withState = (p: Project, fn: (d: Project) => void) => produce(p, fn)

describe('built-in content', () => {
  it('passes the schema and the referential checks', () => {
    expect(() => basePack.parse(BASE_PACK)).not.toThrow()
    expect(validatePack(BASE_PACK)).toEqual([])
    const genreIds = new Set(GENRES.map((g) => g.id))
    for (const [id, pack] of Object.entries(GENRE_PACKS)) {
      expect(pack.id).toBe(id)
      expect(genreIds.has(id), id).toBe(true)
      expect(() => genrePack.parse(pack)).not.toThrow()
      expect(validatePack(pack), id).toEqual([])
    }
  })

  it('reports broken references in a pack', () => {
    const bad: GenrePack = {
      id: 'x',
      version: 1,
      insert: [{ after: 'nope', steps: [step('n', { chapter: 'ghost', target: { docId: 'design.ghost' }, done: { kind: 'sectionFilled', docId: 'overview.vision', section: 'ghost' } })] }],
      replace: { missing: { title: 'x' } },
      remove: ['gone'],
    }
    const errors = validatePack(bad).join('\n')
    for (const part of ['unknown anchor nope', 'unknown chapter ghost', 'unknown planner design.ghost', 'unknown section overview.vision/ghost', 'replace of unknown step missing', 'unknown step gone']) {
      expect(errors).toContain(part)
    }
  })

  it('rejects malformed packs at the schema', () => {
    expect(() => parsePack({ id: 'x', version: 1, insert: [{ after: 'a', steps: [{ id: 'bad id!' }] }] })).toThrow()
    expect(() => parsePack({ id: 'x', version: 0 })).toThrow()
  })
})

describe('composition', () => {
  it('without packs is the base, ordered by phase then chapter', () => {
    expect(ids([])).toEqual(['one', 'two', 'bee', 'sys'])
    const w = composeWalkthrough(BASE, [])
    expect(w.packs).toEqual({ base: 1 })
    expect(groupWalkthrough(w).map((p) => [p.phase, p.chapters.map((c) => c.id)])).toEqual([['concept', ['a', 'b']], ['systems', ['s']]])
  })

  it('inserts after anchors, keeps groups together and appends to the phase when the anchor is missing', () => {
    const p: GenrePack = { id: 'g', version: 1, insert: [{ after: 'one', steps: [step('g1'), step('g2')] }, { after: 'missing', steps: [step('g3', { phase: 'systems', chapter: 's' })] }] }
    expect(ids([p])).toEqual(['one', 'g1', 'g2', 'two', 'bee', 'sys', 'g3'])
    expect(composeWalkthrough(BASE, [p]).steps.find((s) => s.id === 'g1')!.sources).toEqual(['g'])
  })

  it('merges a step two genres share instead of duplicating it', () => {
    const a: GenrePack = { id: 'rpg', version: 1, insert: [{ after: 'one', steps: [step('progress', { title: 'RPG wording', tips: ['levels'] })] }] }
    const b: GenrePack = { id: 'rogue', version: 2, insert: [{ after: 'two', steps: [step('progress', { title: 'Rogue wording', tips: ['meta vs run'] })] }] }
    const w = composeWalkthrough(BASE, [a, b])
    expect(w.steps.filter((s) => s.id === 'progress')).toHaveLength(1)
    const s = w.steps.find((x) => x.id === 'progress')!
    expect(s.title).toBe('RPG wording')
    expect(s.sources).toEqual(['rpg', 'rogue'])
    expect(s.notes).toEqual([{ source: 'rogue', text: 'meta vs run' }])
    expect(w.packs).toEqual({ base: 1, rpg: 1, rogue: 2 })
  })

  it('applies replace and notes without changing IDs', () => {
    const p: GenrePack = { id: 'g', version: 1, replace: { two: { title: 'Two for g', id: 'hacked' } as never }, notes: { one: ['tip'] } }
    const w = composeWalkthrough(BASE, [p])
    expect(w.steps.find((s) => s.id === 'two')!.title).toBe('Two for g')
    expect(w.steps.some((s) => s.id === 'hacked')).toBe(false)
    expect(w.steps.find((s) => s.id === 'one')!.notes).toEqual([{ source: 'g', text: 'tip' }])
    expect(w.steps.find((s) => s.id === 'one')!.sources).toEqual(['base', 'g'])
  })

  it('removes a step only when every selected genre removes it', () => {
    const a: GenrePack = { id: 'a', version: 1, remove: ['two'] }
    const b: GenrePack = { id: 'b', version: 1 }
    const c: GenrePack = { id: 'c', version: 1, remove: ['two', 'two'] }
    expect(ids([a])).not.toContain('two')
    expect(ids([a, b])).toContain('two')
    expect(ids([a, c])).not.toContain('two')
  })

  it('does not mutate the packs', () => {
    const p: GenrePack = { id: 'g', version: 1, replace: { one: { title: 'X' } }, notes: { one: ['t'] } }
    const before = JSON.stringify([BASE, p])
    composeWalkthrough(BASE, [p])
    composeWalkthrough(BASE, [p])
    expect(JSON.stringify([BASE, p])).toBe(before)
  })

  it('resolves text per language with English fallback', () => {
    expect(textOf('plain', 'hu')).toBe('plain')
    expect(textOf({ en: 'Hello', hu: 'Szia' }, 'hu')).toBe('Szia')
    expect(textOf({ en: 'Hello' }, 'hu')).toBe('Hello')
  })
})

describe('completion', () => {
  const single = (done: DoneRule) => composeWalkthrough({ ...BASE, steps: [step('only', { done })] }, [])
  const statusOf = (done: DoneRule, project: Project) => evaluateWalkthrough(single(done), project).status.only

  it('sectionFilled honours the minimum number of entries', () => {
    let p = empty()
    const rule: DoneRule = { kind: 'sectionFilled', docId: 'overview.vision', section: 'pillars', min: 2 }
    expect(statusOf(rule, p)).toBe('open')
    p = withState(p, (d) => {
      d.documents['overview.vision'] ??= { moduleVersion: 1, data: {} }
      d.documents['overview.vision'].data.pillars = [{ id: makeId(), name: 'One' }]
    })
    expect(statusOf(rule, p)).toBe('open')
    p = withState(p, (d) => void d.documents['overview.vision'].data.pillars.push({ id: makeId(), name: 'Two' }))
    expect(statusOf(rule, p)).toBe('done')
    expect(statusOf({ kind: 'sectionFilled', docId: 'overview.vision', section: 'ghost' }, p)).toBe('open')
  })

  it('moduleStep reuses the module guide check, or its hand-made tick', () => {
    const entries = Object.entries(GUIDES).flatMap(([docId, g]) => g.steps.map((s) => ({ docId, s })))
    const manualOnly = entries.find((e) => !e.s.done)
    expect(manualOnly).toBeTruthy()
    const rule: DoneRule = { kind: 'moduleStep', docId: manualOnly!.docId, stepId: manualOnly!.s.id }
    let p = empty()
    expect(statusOf(rule, p)).toBe('open')
    p = withState(p, (d) => setModuleStepManual(d, manualOnly!.docId, manualOnly!.s.id, true))
    expect(statusOf(rule, p)).toBe('done')
    expect(statusOf({ kind: 'moduleStep', docId: 'overview.vision', stepId: 'ghost' }, p)).toBe('open')
  })

  it('hintsClear is a quality gate over raw rule output', () => {
    const p = empty()
    const firing = ruleOf(collectHints(makeContext(p))[0].ruleId)
    expect(statusOf({ kind: 'hintsClear', ruleIds: [firing] }, p)).toBe('open')
    expect(statusOf({ kind: 'hintsClear', ruleIds: ['no.such.rule'] }, p)).toBe('done')
    // Muting a hint does not count as fixing it.
    const muted = withState(p, (d) => void (d.meta.hints = { enabled: false, minSeverity: 'important', dismissed: {}, mutedRules: [firing], thresholds: {} as never }))
    expect(statusOf({ kind: 'hintsClear', ruleIds: [firing] }, muted)).toBe('open')
  })

  it('combines rules with all / any', () => {
    const p = empty()
    const yes: DoneRule = { kind: 'hintsClear', ruleIds: ['no.such.rule'] }
    const no: DoneRule = { kind: 'manual' }
    expect(statusOf({ kind: 'all', rules: [yes, no] }, p)).toBe('open')
    expect(statusOf({ kind: 'any', rules: [yes, no] }, p)).toBe('done')
  })

  it('counts manual ticks and skips, and picks the next required step', () => {
    const w = composeWalkthrough({ ...BASE, steps: [step('opt', { optional: true }), ...BASE.steps] }, [])
    let p = empty()
    let r = evaluateWalkthrough(w, p)
    expect(r.next?.id).toBe('one')
    expect(r.percent).toBe(0)
    p = withState(p, (d) => {
      setStepManual(d, 'one')
      setStepSkipped(d, 'two')
    })
    r = evaluateWalkthrough(w, p)
    expect([r.done, r.skipped, r.total]).toEqual([1, 1, 5])
    expect(r.percent).toBe(40)
    expect(r.next?.id).toBe('bee')
    expect(r.phases.map((x) => [x.phase, x.total, x.done, x.skipped])).toEqual([['concept', 4, 1, 1], ['systems', 1, 0, 0]])
    // Ticking a skipped step un-skips it; done wins over skipped.
    p = withState(p, (d) => setStepManual(d, 'two', true))
    expect(readGuideState(p).skipped).toEqual([])
    expect(evaluateWalkthrough(w, p).status.two).toBe('done')
    // Once only optional steps are open, the next step is the optional one.
    p = withState(p, (d) => ['bee', 'sys'].forEach((id) => setStepManual(d, id, true)))
    expect(evaluateWalkthrough(w, p).next?.id).toBe('opt')
  })

  it('resets hand-made state, optionally including module ticks', () => {
    let p = withState(empty(), (d) => {
      setStepManual(d, 'one')
      setStepSkipped(d, 'two')
      setModuleStepManual(d, 'design.player', 'x', true)
    })
    p = withState(p, (d) => resetGuideState(d))
    expect(readGuideState(p)).toMatchObject({ manual: [], skipped: [], modules: { 'design.player': ['x'] } })
    p = withState(p, (d) => resetGuideState(d, { modules: true }))
    expect(readGuideState(p).modules).toBeUndefined()
    p = withState(p, (d) => setModuleStepManual(d, 'design.player', 'x', true))
    p = withState(p, (d) => setModuleStepManual(d, 'design.player', 'x', false))
    expect(readGuideState(p).modules).toBeUndefined()
  })
})

describe('project integration', () => {
  it('gives every project the base walkthrough, plus packs of selected catalog genres', () => {
    expect(projectWalkthrough(empty()).steps.map((s) => s.id)).toEqual(BASE_PACK.steps.map((s) => s.id))
    const custom = createProject('T', false, { version: 1, genres: ['future-genre'], customGenres: ['Cozy'] })
    expect(projectWalkthrough(custom).packs).toEqual({ base: BASE_PACK.version })
    const pack: GenrePack = { id: 'survival', version: 3, insert: [{ after: 'concept.pitch', steps: [step('surv.needs')] }] }
    const survival = createProject('T', false, { version: 1, genres: ['rpg', 'survival'] })
    const w = projectWalkthrough(survival, { survival: pack })
    expect(w.packs).toEqual({ base: BASE_PACK.version, survival: 3 })
    expect(w.steps.map((s) => s.id)).toContain('surv.needs')
  })

  it('links steps to known planners only', () => {
    expect(stepLink({ docId: 'overview.vision', section: 'pitch' })).toBe('/doc/overview.vision?s=pitch')
    expect(stepLink({ docId: 'ghost' })).toBeUndefined()
    expect(stepLink(undefined)).toBeUndefined()
  })

  it('saves walkthrough state in the project file and keeps unknown keys', () => {
    let p = withState(empty(), (d) => {
      setStepManual(d, 'concept.pitch')
      setModuleStepManual(d, 'design.player', 'skills', true)
    })
    p = withState(p, (d) => void ((d.meta.guide as Record<string, unknown>).futureKey = { keep: true }))
    const back = deserializeProject(serializeProject(p)).project
    expect(back.meta.guide).toEqual(p.meta.guide)
  })

  it('loads files without walkthrough state as nothing ticked', () => {
    const { project } = deserializeProject(serializeProject(empty()))
    expect(project.meta.guide).toBeUndefined()
    expect(readGuideState(project)).toEqual({ version: 1, manual: [], skipped: [] })
  })
})

describe('module-guide ticks', () => {
  it('moves old browser-local ticks into the project on the first change, in one undo step', async () => {
    const { useStore } = await import('../src/core/store/store')
    const { manualDone, toggleManual } = await import('../src/ui/guides/guideStore')
    useStore.getState().loadProject(createProject('Legacy', false))
    localStorage.setItem('hohplan:guide:Legacy:design.player', JSON.stringify(['a', 'b']))
    // Shown before migration, without touching the project.
    expect(manualDone(useStore.getState().project, 'design.player')).toEqual(['a', 'b'])
    expect(useStore.getState().dirty).toBe(false)

    const before = useStore.getState().past.length
    toggleManual('design.player', 'b')
    expect(useStore.getState().project.meta.guide?.modules).toEqual({ 'design.player': ['a'] })
    expect(useStore.getState().past.length).toBe(before + 1)
    expect(localStorage.getItem('hohplan:guide:Legacy:design.player')).toBeNull()
    // Renaming the project keeps the ticks.
    useStore.getState().mutate((p) => void (p.meta.name = 'Renamed'))
    expect(manualDone(useStore.getState().project, 'design.player')).toEqual(['a'])
  })
})
