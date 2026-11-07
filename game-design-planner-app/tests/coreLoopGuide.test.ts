import { describe, expect, it } from 'vitest'
import { createProject } from '../src/core/model/project'
import { useStore } from '../src/core/store/store'
import { getModule, getSection } from '../src/core/modules/registry'
import { CORE_LOOP_DOC, hasFeedback, loopGraph, loopList, loopPacing, wrongDirection } from '../src/core/coreLoop'
import { CORE_LOOP_GUIDE } from '../src/modules/guides/coreLoop'
import { applyExample, previewProject } from '../src/ui/guides/ExamplePicker'
import { mapStates } from '../src/ui/guides/GuideMap'

const step = (id: string) => CORE_LOOP_GUIDE.steps.find((s) => s.id === id)!
const example = (id: string) => CORE_LOOP_GUIDE.examples.find((e) => e.id === id)!
const state = () => useStore.getState().project
const load = () => {
  useStore.getState().loadProject(createProject('T', false), 'x')
  useStore.getState().ensureDoc(CORE_LOOP_DOC)
}

describe('core loop guide', () => {
  it('points every step, map node, example, concept and empty text at a real section', () => {
    const mod = getModule(CORE_LOOP_DOC)!
    const reg = createProject('t').registry
    const ids = [
      ...CORE_LOOP_GUIDE.steps.map((s) => s.section),
      ...CORE_LOOP_GUIDE.map.nodes.flatMap((n) => (n.section ? [n.section] : [])),
      ...CORE_LOOP_GUIDE.examples.map((e) => e.section),
      ...Object.keys(CORE_LOOP_GUIDE.concepts),
      ...Object.keys(CORE_LOOP_GUIDE.empty),
    ]
    for (const id of ids) expect(getSection(mod, reg, id), id).toBeTruthy()
    for (const n of CORE_LOOP_GUIDE.map.nodes) if (n.doc) expect(getModule(n.doc), n.doc).toBeTruthy()
    const cols = [...new Set(CORE_LOOP_GUIDE.map.nodes.map((n) => n.x))].sort((a, b) => a - b)
    cols.slice(1).forEach((x, i) => expect(x - cols[i]).toBe(210))
    expect(CORE_LOOP_GUIDE.steps.length).toBeGreaterThanOrEqual(8)
    expect(CORE_LOOP_GUIDE.steps.length).toBeLessThanOrEqual(10)
  })

  it('builds a chained loop set that ticks the scale, shape, length, chain and pacing steps', () => {
    load()
    for (const id of ['scales', 'shape', 'length', 'chain', 'pacing']) expect(step(id).done!(state()), id).toBe(false)
    applyExample(example('hoh'))
    for (const id of ['scales', 'shape', 'length', 'chain', 'pacing']) expect(step(id).done!(state()), id).toBe(true)
    expect(wrongDirection(state())).toEqual([])
    // Swing 3 s → gather 15 min: 300 cycles; gather → town 4 h: 16.
    expect(loopPacing(state()).flatMap((r) => r.links.map((l) => l.ratio))).toEqual([300, 16, 12.5])
  })

  it('previews an example on a copy, inserts it as one undo step, and never duplicates or rewires loops', () => {
    load()
    const before = state()
    const preview = previewProject(before, example('session'))
    expect(loopList(before)).toEqual([])
    expect(loopList(preview)).toHaveLength(3)
    applyExample(example('session'))
    applyExample(example('session'))
    expect(loopList(state())).toHaveLength(3)
    const links = loopList(state()).map((l) => l.leadsTo)
    useStore.getState().undo()
    useStore.getState().undo()
    expect(loopList(state())).toEqual([])
    applyExample(example('session'))
    applyExample(example('hoh'))
    // The second set adds four loops chained among themselves; the first set's links stay as they were.
    expect(loopList(state())).toHaveLength(7)
    expect(loopList(state()).slice(0, 3).map((l) => l.leadsTo?.length ?? 0)).toEqual(links.map((l) => l?.length ?? 0))
  })

  it('draws a diagram with a feedback edge to the right of existing nodes', () => {
    load()
    useStore.getState().mutate((d) => void d.documents[CORE_LOOP_DOC].data.loopGraph.nodes.push({ id: 'old', label: 'Old', kind: 'Action', x: 300, y: 0 }))
    expect(step('diagram').done!(state())).toBe(false)
    applyExample(example('gatherCraft'))
    const g = loopGraph(state())
    expect(g.nodes).toHaveLength(6)
    expect(hasFeedback(g)).toBe(true)
    expect(Math.min(...g.nodes.filter((n) => n.id !== 'old').map((n) => n.x))).toBe(500)
    expect(step('diagram').done!(state())).toBe(true)
  })

  it('ticks the pillar and reward steps from links', () => {
    load()
    applyExample(example('hoh'))
    useStore.getState().mutate((d) => {
      d.documents['overview.vision'] = { moduleVersion: 2, data: { pillars: [{ id: 'p1', name: 'Cozy' }] } }
    })
    expect(step('pillars').done!(state())).toBe(false)
    expect(step('rewardRefs').done!(state())).toBe(false)
    useStore.getState().mutate((d) => {
      for (const l of d.documents[CORE_LOOP_DOC].data.loops) {
        l.pillars = ['p1']
        l.rewardRefs = ['wood']
      }
    })
    expect(step('pillars').done!(state())).toBe(true)
    expect(step('rewardRefs').done!(state())).toBe(true)
  })

  it('colours map nodes by data', () => {
    const p = createProject('T', false)
    p.documents[CORE_LOOP_DOC] = { moduleVersion: 2, data: { loops: [], loopGraph: { nodes: [], edges: [] }, rewardsProgression: {} } }
    expect(mapStates(p, CORE_LOOP_DOC, CORE_LOOP_GUIDE.map).loops.state).toBe('empty')
    expect(mapStates(p, CORE_LOOP_DOC, CORE_LOOP_GUIDE.map).time.state).toBe('external')
    example('hoh').apply(p)
    expect(mapStates(p, CORE_LOOP_DOC, CORE_LOOP_GUIDE.map).loops.state).not.toBe('empty')
  })
})
