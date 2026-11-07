import { describe, expect, it } from 'vitest'
import { createProject } from '../src/core/model/project'
import { useStore } from '../src/core/store/store'
import { getModule, getSection } from '../src/core/modules/registry'
import { pillarList, VISION_DOC } from '../src/core/vision'
import { VISION_GUIDE } from '../src/modules/guides/vision'
import { applyExample, previewProject } from '../src/ui/guides/ExamplePicker'
import { mapStates } from '../src/ui/guides/GuideMap'

const step = (id: string) => VISION_GUIDE.steps.find((s) => s.id === id)!
const example = (id: string) => VISION_GUIDE.examples.find((e) => e.id === id)!
const data = (p: ReturnType<typeof createProject>) => p.documents[VISION_DOC].data

describe('vision guide', () => {
  it('points every step, map node, example, concept and empty text at a real section', () => {
    const mod = getModule(VISION_DOC)!
    const reg = createProject('t').registry
    const ids = [
      ...VISION_GUIDE.steps.map((s) => s.section),
      ...VISION_GUIDE.map.nodes.flatMap((n) => (n.section ? [n.section] : [])),
      ...VISION_GUIDE.examples.map((e) => e.section),
      ...Object.keys(VISION_GUIDE.concepts),
      ...Object.keys(VISION_GUIDE.empty),
    ]
    for (const id of ids) expect(getSection(mod, reg, id), id).toBeTruthy()
    for (const n of VISION_GUIDE.map.nodes) if (n.doc) expect(getModule(n.doc), n.doc).toBeTruthy()
  })

  it('has 8-10 steps with unique ids and a node spacing of 210px between columns', () => {
    expect(VISION_GUIDE.steps.length).toBeGreaterThanOrEqual(8)
    expect(VISION_GUIDE.steps.length).toBeLessThanOrEqual(10)
    expect(new Set(VISION_GUIDE.steps.map((s) => s.id)).size).toBe(VISION_GUIDE.steps.length)
    const cols = [...new Set(VISION_GUIDE.map.nodes.map((n) => n.x))].sort((a, b) => a - b)
    cols.slice(1).forEach((x, i) => expect(x - cols[i]).toBe(210))
  })

  it('ticks steps from the data', () => {
    const p = createProject('T', false)
    useStore.getState().loadProject(p, 'x')
    useStore.getState().ensureDoc(VISION_DOC)
    const q = () => useStore.getState().project
    expect(step('pitch').done!(q())).toBe(false)
    useStore.getState().mutate((d) => void (d.documents[VISION_DOC].data.pitch = { pitch: 'A cozy management game where you rebuild a town in order to restore its magic.' }))
    expect(step('pitch').done!(q())).toBe(true)

    applyExample(example('industry'))
    expect(step('pillars').done!(q())).toBe(true)
    expect(step('decisionTest').done!(q())).toBe(true)

    applyExample(example('mvp'))
    expect(step('scope').done!(q())).toBe(true)
    expect(step('scopePillars').done!(q())).toBe(false)
    const [first] = pillarList(q())
    useStore.getState().mutate((d) => {
      for (const e of data(d).scope) if (e.bucket === 'In MVP') e.pillars = [first.id]
    })
    expect(step('scopePillars').done!(q())).toBe(true)
  })

  it('previews an example on a copy, and inserting it is one undo step', () => {
    useStore.getState().loadProject(createProject('T', false), 'x')
    useStore.getState().ensureDoc(VISION_DOC)
    const before = useStore.getState().project
    const preview = previewProject(before, example('industry'))
    expect(data(before).pillars).toEqual([])
    expect(data(preview).pillars).toHaveLength(3)
    applyExample(example('industry'))
    expect(useStore.getState().project.documents[VISION_DOC].data.pillars).toEqual(data(preview).pillars.map((e: any) => ({ ...e, id: expect.any(String) })))
    useStore.getState().undo()
    expect(useStore.getState().project.documents[VISION_DOC].data.pillars).toEqual([])
  })

  it('does not duplicate rows when an example is applied twice', () => {
    const q = createProject('T', false)
    q.documents[VISION_DOC] = { moduleVersion: 2, data: { pillars: [], usps: [], scope: [] } }
    example('cozy').apply(q)
    example('cozy').apply(q)
    example('usps').apply(q)
    example('usps').apply(q)
    expect(data(q).pillars).toHaveLength(3)
    expect(data(q).usps).toHaveLength(2)
  })

  it('colours map nodes by data', () => {
    const p = createProject('T', false)
    p.documents[VISION_DOC] = { moduleVersion: 2, data: { pillars: [], usps: [], scope: [] } }
    expect(mapStates(p, VISION_DOC, VISION_GUIDE.map).pillars.state).toBe('empty')
    expect(mapStates(p, VISION_DOC, VISION_GUIDE.map).roadmap.state).toBe('external')
    example('industry').apply(p)
    expect(mapStates(p, VISION_DOC, VISION_GUIDE.map).pillars.state).not.toBe('empty')
  })
})
