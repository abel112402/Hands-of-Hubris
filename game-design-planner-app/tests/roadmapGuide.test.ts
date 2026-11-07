import { describe, expect, it } from 'vitest'
import { createProject } from '../src/core/model/project'
import { useStore } from '../src/core/store/store'
import { getModule, getSection } from '../src/core/modules/registry'
import { cutSavings, ROADMAP_DOC, roadmapList } from '../src/core/roadmap'
import { ROADMAP_GUIDE } from '../src/modules/guides/roadmap'
import { applyExample, previewProject } from '../src/ui/guides/ExamplePicker'
import { mapStates } from '../src/ui/guides/GuideMap'

const step = (id: string) => ROADMAP_GUIDE.steps.find((s) => s.id === id)!
const example = (id: string) => ROADMAP_GUIDE.examples.find((e) => e.id === id)!
const state = () => useStore.getState().project
/** A seeded project: the roadmap comes with the doc's seven phases (phase0 … phase6). */
const load = () => {
  useStore.getState().loadProject(createProject('T'), 'x')
  useStore.getState().ensureDoc(ROADMAP_DOC)
}

describe('roadmap guide', () => {
  it('points every step, map node, example, concept and empty text at a real section', () => {
    const mod = getModule(ROADMAP_DOC)!
    const reg = createProject('t').registry
    const ids = [
      ...ROADMAP_GUIDE.steps.map((s) => s.section),
      ...ROADMAP_GUIDE.map.nodes.flatMap((n) => (n.section ? [n.section] : [])),
      ...ROADMAP_GUIDE.examples.map((e) => e.section),
      ...Object.keys(ROADMAP_GUIDE.concepts),
      ...Object.keys(ROADMAP_GUIDE.empty),
    ]
    for (const id of ids) expect(getSection(mod, reg, id), id).toBeTruthy()
    for (const n of ROADMAP_GUIDE.map.nodes) if (n.doc) expect(getModule(n.doc), n.doc).toBeTruthy()
    const cols = [...new Set(ROADMAP_GUIDE.map.nodes.map((n) => n.x))].sort((a, b) => a - b)
    cols.slice(1).forEach((x, i) => expect(x - cols[i]).toBe(210))
    expect(ROADMAP_GUIDE.steps.length).toBeGreaterThanOrEqual(8)
    expect(ROADMAP_GUIDE.steps.length).toBeLessThanOrEqual(10)
  })

  it('ticks steps from the data and runs the tracking quick action', () => {
    load()
    expect(step('phases').done!(state())).toBe(true)
    expect(step('gates').done!(state())).toBe(false)
    applyExample(example('gates'))
    expect(step('gates').done!(state())).toBe(true)
    expect(step('tracking').done!(state())).toBe(false)
    const a = step('tracking').action!
    useStore.getState().mutate((d) => void ('run' in a && a.run(d)))
    expect(step('tracking').done!(state())).toBe(true)
    expect(state().documents[ROADMAP_DOC].data.tracking.velocityThreshold).toBe(70)
  })

  it('places example tasks inside the chosen phase', () => {
    load()
    const p = previewProject(state(), example('prep'), 'phase1')
    const added = roadmapList(p, 'tasks').filter((t) => t.phase === 'phase1')
    expect(added).toHaveLength(6)
    // Prototype starts at week 6; the first task starts there.
    expect(Math.min(...added.map((t) => t.start))).toBe(6)
    expect(step('tasks').done!(p)).toBe(true)
  })

  it('previews an example on a copy, inserts it as one undo step, and does not duplicate it', () => {
    load()
    const before = state()
    const preview = previewProject(before, example('cuts'))
    expect(roadmapList(before, 'cuts')).toEqual([])
    expect(roadmapList(preview, 'cuts').map((c) => c.order)).toEqual([1, 2, 3, 4, 5, 6])
    applyExample(example('cuts'))
    applyExample(example('cuts'))
    expect(roadmapList(state(), 'cuts')).toHaveLength(6)
    useStore.getState().undo()
    useStore.getState().undo()
    expect(roadmapList(state(), 'cuts')).toEqual([])
    // The doc has G0–G5; the seventh (post-release) phase gets a generic G6.
    applyExample(example('gates'))
    const gates = roadmapList(state(), 'gates')
    expect(gates.map((g) => g.phase)).toEqual(['phase0', 'phase1', 'phase2', 'phase3', 'phase4', 'phase5', 'phase6'])
    expect(gates.map((g) => g.name)).toEqual(['G0', 'G1', 'G2', 'G3', 'G4', 'G5', 'G6'])
  })

  it('links cut savings to example tasks', () => {
    load()
    applyExample(example('prep'), 'phase0')
    applyExample(example('cuts'))
    const t = roadmapList(state(), 'tasks').slice(0, 2).map((x) => x.id)
    useStore.getState().mutate((d) => void (d.documents[ROADMAP_DOC].data.cuts[0].affectsTasks = t))
    expect(cutSavings(state())[0].saving).toBe(3)
  })

  it('colours map nodes by data', () => {
    const p = createProject('T', false)
    p.documents[ROADMAP_DOC] = { moduleVersion: 2, data: { assumptions: {}, phases: [], tasks: [], gates: [], cuts: [] } }
    expect(mapStates(p, ROADMAP_DOC, ROADMAP_GUIDE.map).cuts.state).toBe('empty')
    expect(mapStates(p, ROADMAP_DOC, ROADMAP_GUIDE.map).vision.state).toBe('external')
    example('cuts').apply(p)
    expect(mapStates(p, ROADMAP_DOC, ROADMAP_GUIDE.map).cuts.state).not.toBe('empty')
  })
})
