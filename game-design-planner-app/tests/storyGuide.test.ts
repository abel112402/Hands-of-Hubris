import { describe, expect, it } from 'vitest'
import { createProject } from '../src/core/model/project'
import { useStore } from '../src/core/store/store'
import { getModule, getSection } from '../src/core/modules/registry'
import { actPacing, endingReachability, questDeps, simulatePath, STORY_DOC, storyList } from '../src/core/story'
import { STORY_GUIDE } from '../src/modules/guides/story'
import { applyExample, previewProject } from '../src/ui/guides/ExamplePicker'

const step = (id: string) => STORY_GUIDE.steps.find((s) => s.id === id)!
const example = (id: string) => STORY_GUIDE.examples.find((e) => e.id === id)!
const run = (id: string, p: ReturnType<typeof createProject>) => {
  const a = step(id).action!
  if ('run' in a) a.run(p)
}

describe('story guide', () => {
  it('points every step, map node, example, concept and empty text at a real section', () => {
    const mod = getModule(STORY_DOC)!
    const reg = createProject('t').registry
    const ids = [
      ...STORY_GUIDE.steps.map((s) => s.section),
      ...STORY_GUIDE.map.nodes.flatMap((n) => (n.section ? [n.section] : [])),
      ...STORY_GUIDE.examples.map((e) => e.section),
      ...Object.keys(STORY_GUIDE.concepts),
      ...Object.keys(STORY_GUIDE.empty),
    ]
    for (const id of ids) expect(getSection(mod, reg, id), id).toBeTruthy()
    for (const n of STORY_GUIDE.map.nodes) if (n.doc) expect(getModule(n.doc), n.doc).toBeTruthy()
  })

  it('creates the quest types once and ticks the step', () => {
    const p = createProject('T')
    p.documents[STORY_DOC].data.questTypes = []
    expect(step('types').done!(p)).toBe(false)
    run('types', p)
    run('types', p)
    expect(storyList(p, 'questTypes')).toHaveLength(4)
    expect(step('types').done!(p)).toBe(true)
  })

  it('act presets chain acts, pick biomes by role and take hours per day from the day length', () => {
    const p = createProject('T')
    p.documents['design.world'].data.biomes = [{ id: 'm', name: 'Marsh', role: 'Mid' }, { id: 's', name: 'Shore', role: 'Starter' }]
    p.documents['design.timeWeather'].data.time = { dayLength: 30 }
    example('acts-three').apply(p)
    const acts = storyList(p, 'acts')
    expect(acts.map((a) => [a.start, a.duration])).toEqual([[0, 10], [10, 20], [30, 15]])
    expect(acts.map((a) => a.biome)).toEqual(['s', 'm', undefined])
    expect(p.documents[STORY_DOC].data.structure.hoursPerDay).toBe(0.5)
    expect(step('acts').done!(p)).toBe(true)
  })

  it('the main questline is one chain spread over the acts and fits a flat XP curve', () => {
    const p = createProject('T')
    p.documents['design.player'].data.leveling = { xpFormula: '100', levelCap: 20 }
    p.documents['design.player'].data.xpSources = []
    example('acts-three').apply(p)
    example('main-questline').apply(p)
    const d = questDeps(p)
    expect(d.mainPath.map((q) => q.name)).toEqual(['Washed ashore', 'The old lighthouse', 'Voices in the fog', 'The island’s secret'])
    expect(d.cycles).toEqual([])
    expect(d.actInversions).toEqual([])
    expect(step('questline').done!(p)).toBe(true)
    expect(step('flow').done!(p)).toBe(true)
    // 100 + 150 XP in act 1 → level 3; +200 = 450 in act 2 → level 5; +300 = 750 in act 3 → level 8.
    expect(actPacing(p).map((r) => r.level)).toEqual([3, 5, 8])
  })

  it('previews the branching decision on a copy and inserts it as one undo step', () => {
    useStore.getState().loadProject(createProject('T'), 'x')
    const before = useStore.getState().project
    const preview = previewProject(before, example('branch'))
    expect(storyList(before, 'endings')).toHaveLength(0)
    expect(endingReachability(preview).map((r) => r.reachable)).toEqual([true, true])
    const [a] = storyList(preview, 'choices')
    expect(simulatePath(preview, [a.id]).openEndings.map((e) => e.name)).toEqual(['The beacon'])
    expect(step('endings').done!(preview)).toBe(true)
    applyExample(example('branch'))
    expect(storyList(useStore.getState().project, 'choices')).toHaveLength(2)
    useStore.getState().undo()
    expect(storyList(useStore.getState().project, 'choices')).toHaveLength(0)
  })
})
