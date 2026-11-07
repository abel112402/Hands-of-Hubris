import { describe, expect, it } from 'vitest'
import { createProject } from '../src/core/model/project'
import { useStore } from '../src/core/store/store'
import { getModule, getSection } from '../src/core/modules/registry'
import { analyzeDifficulty, cellsOf, customSettings, DIFFICULTY_DOC, levelSteps } from '../src/core/difficulty'
import { DIFFICULTY_GUIDE } from '../src/modules/guides/difficulty'
import { applyExample, previewProject } from '../src/ui/guides/ExamplePicker'
import { mapStates } from '../src/ui/guides/GuideMap'

const step = (id: string) => DIFFICULTY_GUIDE.steps.find((s) => s.id === id)!
const example = (id: string) => DIFFICULTY_GUIDE.examples.find((e) => e.id === id)!
const state = () => useStore.getState().project
/** Seeded: three presets and seven parameters with a direction, range and baseline, but no values. */
const load = () => {
  useStore.getState().loadProject(createProject('T'), 'x')
  useStore.getState().ensureDoc(DIFFICULTY_DOC)
}

describe('difficulty guide', () => {
  it('points every step, map node, example, concept and empty text at a real section', () => {
    const mod = getModule(DIFFICULTY_DOC)!
    const reg = createProject('t').registry
    const ids = [
      ...DIFFICULTY_GUIDE.steps.map((s) => s.section),
      ...DIFFICULTY_GUIDE.map.nodes.flatMap((n) => (n.section ? [n.section] : [])),
      ...DIFFICULTY_GUIDE.examples.map((e) => e.section),
      ...Object.keys(DIFFICULTY_GUIDE.concepts),
      ...Object.keys(DIFFICULTY_GUIDE.empty),
    ]
    for (const id of ids) expect(getSection(mod, reg, id), id).toBeTruthy()
    for (const n of DIFFICULTY_GUIDE.map.nodes) if (n.doc) expect(getModule(n.doc), n.doc).toBeTruthy()
    const cols = [...new Set(DIFFICULTY_GUIDE.map.nodes.map((n) => n.x))].sort((a, b) => a - b)
    cols.slice(1).forEach((x, i) => expect(x - cols[i]).toBe(210))
    expect(DIFFICULTY_GUIDE.steps.length).toBeGreaterThanOrEqual(8)
    expect(DIFFICULTY_GUIDE.steps.length).toBeLessThanOrEqual(10)
  })

  it('spreads values that tick the value, order and spacing steps, as one undo step', () => {
    load()
    expect(step('context').done!(state())).toBe(true)
    for (const id of ['values', 'order', 'spacing']) expect(step(id).done!(state()), id).toBe(false)
    const preview = previewProject(state(), example('spread-gentle'))
    expect(cellsOf(state())).toEqual({})
    applyExample(example('spread-gentle'))
    expect(cellsOf(state())).toEqual(cellsOf(preview))
    for (const id of ['values', 'order', 'spacing']) expect(step(id).done!(state()), id).toBe(true)
    expect(analyzeDifficulty(state()).reversals).toEqual([])
    expect(levelSteps(state()).every((s) => s.delta > 0.1)).toBe(true)
    useStore.getState().undo()
    expect(cellsOf(state())).toEqual({})
  })

  it('keeps cells the designer already set', () => {
    load()
    const id = state().documents[DIFFICULTY_DOC].data.params[0].id
    useStore.getState().mutate((d) => void (d.documents[DIFFICULTY_DOC].data.values.cells[`${id}|hard`] = 2.9))
    applyExample(example('spread-wide'))
    expect(cellsOf(state())[`${id}|hard`]).toBe(2.9)
    expect(cellsOf(state())[`${id}|easy`]).toBeTypeOf('number')
  })

  it('fills empty preset intents and links custom settings by name', () => {
    load()
    useStore.getState().mutate((d) => void (d.documents[DIFFICULTY_DOC].data.presets[1].intent = 'Mine'))
    applyExample(example('intents'))
    const presets = state().documents[DIFFICULTY_DOC].data.presets
    expect(presets.map((p: any) => p.intent.split(':')[0])).toEqual(['Relaxed', 'Mine', 'Punishing'])
    expect(step('intents').done!(state())).toBe(true)

    expect(step('custom').done!(state())).toBe(false)
    applyExample(example('custom'))
    applyExample(example('custom'))
    const settings = customSettings(state())
    expect(settings).toHaveLength(3)
    const names = new Map(state().documents[DIFFICULTY_DOC].data.params.map((p: any) => [p.id, p.name]))
    expect(settings.map((s) => s.params.map((id: string) => names.get(id)))).toEqual([['Hunger / thirst decay rate'], ['Enemy HP multiplier', 'Enemy damage multiplier'], ['Economy price multiplier']])
    expect(step('custom').done!(state())).toBe(true)
  })

  it('ticks the impact step once a system reads a parameter', () => {
    load()
    // The seeded project already links prices by name through Trade.
    expect(step('impact').done!(state())).toBe(true)
    const p = createProject('T', false)
    p.documents[DIFFICULTY_DOC] = { moduleVersion: 2, data: { params: [{ id: 'a', name: 'A' }] } }
    expect(step('impact').done!(p)).toBe(false)
  })

  it('colours map nodes by data', () => {
    const p = createProject('T', false)
    p.documents[DIFFICULTY_DOC] = { moduleVersion: 2, data: { presets: [], params: [], values: { cells: {} }, custom: [] } }
    expect(mapStates(p, DIFFICULTY_DOC, DIFFICULTY_GUIDE.map).params.state).toBe('empty')
    expect(mapStates(p, DIFFICULTY_DOC, DIFFICULTY_GUIDE.map).combat.state).toBe('external')
    p.documents[DIFFICULTY_DOC].data.params = [{ id: 'a', name: 'A' }]
    expect(mapStates(p, DIFFICULTY_DOC, DIFFICULTY_GUIDE.map).params.state).not.toBe('empty')
  })
})
