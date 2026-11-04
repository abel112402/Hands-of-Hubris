import { describe, expect, it } from 'vitest'
import { createProject } from '../src/core/model/project'
import { useStore } from '../src/core/store/store'
import { PLAYER_DOC, levelCap, treeAnalysis } from '../src/core/player'
import { GUIDES } from '../src/modules/guides'
import { PLAYER_GUIDE } from '../src/modules/guides/player'
import { applyExample, previewProject } from '../src/ui/guides/ExamplePicker'
import { mapStates } from '../src/ui/guides/GuideMap'
import { getModule, getSection } from '../src/core/modules/registry'

const step = (id: string) => PLAYER_GUIDE.steps.find((s) => s.id === id)!
const example = (id: string) => PLAYER_GUIDE.examples.find((e) => e.id === id)!

describe('guide content', () => {
  it('points every step, map node, example, concept and empty text at a real section', () => {
    const mod = getModule(PLAYER_DOC)!
    const reg = createProject('t').registry
    const ids = [
      ...PLAYER_GUIDE.steps.map((s) => s.section),
      ...PLAYER_GUIDE.map.nodes.flatMap((n) => (n.section ? [n.section] : [])),
      ...PLAYER_GUIDE.examples.map((e) => e.section),
      ...Object.keys(PLAYER_GUIDE.concepts),
      ...Object.keys(PLAYER_GUIDE.empty),
    ]
    for (const id of ids) expect(getSection(mod, reg, id), id).toBeTruthy()
    for (const n of PLAYER_GUIDE.map.nodes) if (n.doc) expect(getModule(n.doc), n.doc).toBeTruthy()
    for (const e of PLAYER_GUIDE.map.edges) expect(PLAYER_GUIDE.map.nodes.some((n) => n.id === e.from) && PLAYER_GUIDE.map.nodes.some((n) => n.id === e.to)).toBe(true)
    expect(Object.keys(GUIDES)).toContain(PLAYER_DOC)
  })

  it('ticks steps from the data and runs their quick actions', () => {
    const p = createProject('T')
    expect(step('survival').done!(p)).toBe(false)
    const action = step('survival').action!
    if ('run' in action) action.run(p)
    expect(step('survival').done!(p)).toBe(true)
    expect(p.documents[PLAYER_DOC].data.survival.map((s: any) => s.stat)).toEqual(p.registry.catalogs.survivalStats.items.map((i) => i.id))
    expect(step('leveling').done!(p)).toBe(false)
    example('xp-poly').apply(p)
    expect(step('leveling').done!(p)).toBe(true)
    expect(step('build').done).toBeUndefined()
  })

  it('previews an example on a copy and inserts it as one undo step', () => {
    useStore.getState().loadProject(createProject('T'), 'x')
    const before = useStore.getState().project
    const preview = previewProject(before, example('tree-3x3'), 'ranger')
    expect(treeAnalysis(preview).casts.find((c) => c.cast.id === 'ranger')!.skills).toHaveLength(9)
    expect(before.documents[PLAYER_DOC].data.skills).toEqual([])
    applyExample(example('xp-poly'))
    applyExample(example('tree-3x3'), 'ranger')
    const after = useStore.getState().project
    expect(after.documents[PLAYER_DOC].data.skills).toHaveLength(9)
    expect(levelCap(after)).toBe(30)
    useStore.getState().undo()
    expect(useStore.getState().project.documents[PLAYER_DOC].data.skills).toEqual([])
    expect(levelCap(useStore.getState().project)).toBe(30)
  })

  it('builds tiered skills whose costs fit and whose prerequisites chain', () => {
    const p = createProject('T')
    example('xp-poly').apply(p)
    example('tree-3x3').apply(p, 'warrior')
    const skills = p.documents[PLAYER_DOC].data.skills
    const t3 = skills.filter((s: any) => s.tier === 3)
    expect(t3).toHaveLength(3)
    expect(t3.every((s: any) => skills.find((x: any) => x.id === s.requires[0]).tier === 2)).toBe(true)
    expect(treeAnalysis(p).cycles).toEqual([])
  })

  it('colours map nodes by data and open tips', () => {
    const p = createProject('T')
    const empty = mapStates(p, PLAYER_DOC, PLAYER_GUIDE.map)
    expect(empty.survival.state).toBe('empty')
    expect(empty.items.state).toBe('external')
    p.documents[PLAYER_DOC].data.survival = [{ id: 's', name: 'Hunger', stat: 'hunger', max: 100, decay: 2 }]
    expect(mapStates(p, PLAYER_DOC, PLAYER_GUIDE.map).survival.state).toBe('started')
    p.documents[PLAYER_DOC].data.survival[0].restore = 'Food'
    p.documents[PLAYER_DOC].data.survival[0].difficultyParam = p.documents['design.difficulty'].data.params.find((x: any) => x.category === 'Survival')?.id
    expect(mapStates(p, PLAYER_DOC, PLAYER_GUIDE.map).survival.state).toBe('done')
  })
})
