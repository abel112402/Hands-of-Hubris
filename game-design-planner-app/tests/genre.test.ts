import { describe, expect, it } from 'vitest'
import { produce } from 'immer'
import { createProject } from '../src/core/model/project'
import { deserializeProject, serializeProject } from '../src/core/persistence/serialize'
import { MODULES, getModule } from '../src/core/modules/registry'
import { ALWAYS_SHOWN_GROUPS, FOUNDATION_EDITORS, GENERAL_ORDER, GENRES } from '../src/modules/genres'
import {
  defaultRecommendations,
  editorGroups,
  onboardingOrder,
  projectGenres,
  readProfile,
  recommendEditors,
  restoreEditorDefaults,
  setEditorRecommended,
  setGenres,
} from '../src/core/genre'
import type { Project, ProjectProfile } from '../src/core/model/types'

const profile = (genres: string[], extra: Partial<ProjectProfile> = {}): ProjectProfile => ({ version: 1, genres, ...extra })
const ids = (p: ProjectProfile) => recommendEditors(p).map((r) => r.docId)
const roundTrip = (p: Project) => deserializeProject(serializeProject(p)).project

describe('genre catalog integrity', () => {
  it('uses unique IDs and only registered modules', () => {
    expect(new Set(GENRES.map((g) => g.id)).size).toBe(GENRES.length)
    for (const e of [...FOUNDATION_EDITORS, ...GENRES.flatMap((g) => g.editors)]) expect(getModule(e.docId), e.docId).toBeTruthy()
    for (const d of GENERAL_ORDER) expect(getModule(d), d).toBeTruthy()
    // Walkthrough packs per genre are checked in walkthrough.test.ts.
  })
})

describe('recommendations', () => {
  it('falls back to the general order without a known genre', () => {
    expect(ids(profile([]))).toEqual(GENERAL_ORDER)
    expect(ids(profile(['future-genre'], { customGenres: ['Cozy'] }))).toEqual(GENERAL_ORDER)
  })

  it('combines Survival + RPG deterministically: foundation first, union, no duplicates', () => {
    const a = ids(profile(['survival', 'rpg']))
    expect(a.slice(0, 2)).toEqual(['overview.vision', 'design.coreLoop'])
    expect(new Set(a).size).toBe(a.length)
    for (const d of ['design.player', 'design.world', 'design.items', 'design.story', 'design.timeWeather']) expect(a).toContain(d)
    // Shared top pick ranks first after the foundation.
    expect(a[2]).toBe('design.player')
    // Order is stable and independent of selection order for equal ranks.
    expect(ids(profile(['survival', 'rpg']))).toEqual(a)
    expect(new Set(ids(profile(['rpg', 'survival'])))).toEqual(new Set(a))
  })

  it('explains each recommendation with every contributing genre', () => {
    const player = defaultRecommendations(profile(['survival', 'rpg'])).find((r) => r.docId === 'design.player')!
    expect(player.reasons.map((r) => (r.kind === 'genre' ? r.genre : r.kind))).toEqual(['survival', 'rpg'])
  })

  it('applies explicit overrides last and ignores missing modules', () => {
    const p = profile(['survival'], { editors: { add: ['qa.bugs', 'gone.module'], remove: ['design.combat'] } })
    const list = ids(p)
    expect(list).not.toContain('design.combat')
    expect(list[list.length - 1]).toBe('qa.bugs')
    expect(list).not.toContain('gone.module')
    expect(recommendEditors(p).at(-1)!.reasons).toEqual([{ kind: 'manual' }])
  })
})

describe('editor groups', () => {
  const groupOf = (p: ProjectProfile, g: string) => editorGroups(p).find((x) => x.group === g)
  const all = (g: string) => MODULES.filter((m) => m.group === g).map((m) => m.id)

  it('always lists core groups in full; genres narrow only Game Design', () => {
    const p = profile(['strategy'])
    for (const g of ALWAYS_SHOWN_GROUPS) {
      const view = groupOf(p, g)
      if (!all(g).length) { expect(view).toBeUndefined(); continue }
      expect(view!.filtered).toBe(false)
      expect(view!.editors.map((e) => e.docId)).toEqual(all(g))
    }
    // Genre picks inside core groups stay marked and explained.
    const ai = groupOf(p, 'technical')!.editors.find((e) => e.docId === 'technical.ai')!
    expect(ai.recommended).toBe(true)
    expect(ai.reasons?.some((r) => r.kind === 'genre' && r.genre === 'strategy')).toBe(true)
    expect(groupOf(p, 'technical')!.editors.find((e) => e.docId === 'technical.save')!.recommended).toBe(false)

    const design = groupOf(p, 'design')!
    expect(design.filtered).toBe(true)
    expect(design.editors.map((e) => e.docId)).toEqual(ids(p).filter((d) => d.startsWith('design.')))
    expect(design.hidden).toBe(all('design').length - design.editors.length)
  })

  it('shows every planner unmarked without a known genre', () => {
    for (const v of editorGroups(profile(['future-genre']))) {
      expect(v.filtered).toBe(false)
      expect(v.editors.map((e) => e.docId)).toEqual(all(v.group))
      expect(v.editors.every((e) => !e.recommended)).toBe(true)
    }
  })

  it('applies editor overrides inside Game Design only', () => {
    const p = profile(['action'], { editors: { add: ['design.story'], remove: ['design.ui'] } })
    const design = groupOf(p, 'design')!.editors.map((e) => e.docId)
    expect(design).toContain('design.story')
    expect(design).not.toContain('design.ui')
  })
})

describe('profile edits', () => {
  it('records only real deviations and restores defaults', () => {
    let p = createProject('x', false)
    p = produce(p, (d) => setGenres(d, ['survival']))
    p = produce(p, (d) => setEditorRecommended(d, 'design.combat', false))
    p = produce(p, (d) => setEditorRecommended(d, 'qa.bugs', true))
    expect(p.meta.profile!.editors).toEqual({ add: ['qa.bugs'], remove: ['design.combat'] })
    p = produce(p, (d) => setEditorRecommended(d, 'design.combat', true))
    p = produce(p, (d) => setEditorRecommended(d, 'qa.bugs', false))
    expect(p.meta.profile!.editors).toBeUndefined()
    p = produce(p, (d) => setEditorRecommended(d, 'qa.bugs', true))
    p = produce(p, (d) => restoreEditorDefaults(d))
    expect(p.meta.profile!.editors).toBeUndefined()
  })

  it('changing genres never deletes documents and keeps overrides', () => {
    let p = createProject('x', true)
    const before = JSON.stringify(p.documents)
    p = produce(p, (d) => {
      setGenres(d, ['rpg'])
      setEditorRecommended(d, 'qa.bugs', true)
    })
    p = produce(p, (d) => setGenres(d, ['strategy', 'strategy', ' '], [' Cozy ', 'Cozy', '']))
    expect(JSON.stringify(p.documents)).toBe(before)
    expect(p.meta.profile).toMatchObject({ genres: ['strategy'], customGenres: ['Cozy'], editors: { add: ['qa.bugs'], remove: [] } })
    expect(projectGenres(p)).toEqual(['strategy'])
  })
})

describe('portable file format', () => {
  it('loads older files without a profile as neutral projects', () => {
    const files = import.meta.glob('../examples/*.hohplan.json', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
    expect(Object.keys(files).length).toBeGreaterThanOrEqual(2)
    for (const text of Object.values(files)) {
      const { project } = deserializeProject(text)
      expect(project.meta.profile).toBeUndefined()
      expect(readProfile(project).genres).toEqual([])
    }
  })

  it('round-trips the profile, unknown genres and unknown keys', () => {
    const p = createProject('x', false, { version: 1, genres: ['survival', 'from-the-future'], customGenres: ['Cozy'], editors: { add: ['qa.bugs'], remove: [] } })
    ;(p.meta.profile as any).futureKey = { keep: true }
    const back = roundTrip(p)
    expect(back.meta.profile).toEqual(p.meta.profile)
    expect(ids(back.meta.profile!)).toContain('design.player')
  })

  it('rejects a malformed profile', () => {
    const p = createProject('x', false) as any
    p.meta.profile = { version: 1, genres: 'rpg' }
    expect(() => deserializeProject(JSON.stringify(p))).toThrow(/meta\.profile\.genres/)
  })
})

describe('onboarding order', () => {
  it('matches the old fixed order for neutral projects', () => {
    expect(onboardingOrder(createProject('x', false))).toEqual(GENERAL_ORDER)
  })

  it('follows the genre recommendations, then general steps, without removed editors', () => {
    const p = createProject('x', false, profile(['action'], { editors: { add: [], remove: ['design.player'] } }))
    const order = onboardingOrder(p)
    expect(order.slice(0, 3)).toEqual(['overview.vision', 'design.coreLoop', 'design.combat'])
    expect(order).not.toContain('design.player')
    expect(order).toContain('qa.testPlan')
    expect(order.every((d) => MODULES.some((m) => m.id === d))).toBe(true)
  })
})
