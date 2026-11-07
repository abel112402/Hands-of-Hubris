import { describe, expect, it } from 'vitest'
import { createProject } from '../src/core/model/project'
import { useStore } from '../src/core/store/store'
import { getModule, getSection } from '../src/core/modules/registry'
import { analyzeRanges, DIPLOMACY_DOC, factionsOf, levelsOf, relationCells, relationPairs, scaleOf, simulateActions } from '../src/core/diplomacy'
import { DIPLOMACY_GUIDE } from '../src/modules/guides/diplomacy'
import { applyExample, previewProject } from '../src/ui/guides/ExamplePicker'
import { mapStates } from '../src/ui/guides/GuideMap'

const step = (id: string) => DIPLOMACY_GUIDE.steps.find((s) => s.id === id)!
const example = (id: string) => DIPLOMACY_GUIDE.examples.find((e) => e.id === id)!
const state = () => useStore.getState().project
const load = () => {
  useStore.getState().loadProject(createProject('T'), 'x')
  useStore.getState().ensureDoc(DIPLOMACY_DOC)
}

describe('diplomacy guide', () => {
  it('points every step, map node, example, concept and empty text at a real section', () => {
    const mod = getModule(DIPLOMACY_DOC)!
    const reg = createProject('t').registry
    const ids = [
      ...DIPLOMACY_GUIDE.steps.map((s) => s.section),
      ...DIPLOMACY_GUIDE.map.nodes.flatMap((n) => (n.section ? [n.section] : [])),
      ...DIPLOMACY_GUIDE.examples.map((e) => e.section),
      ...Object.keys(DIPLOMACY_GUIDE.concepts),
      ...Object.keys(DIPLOMACY_GUIDE.empty),
    ]
    for (const id of ids) expect(getSection(mod, reg, id), id).toBeTruthy()
    for (const n of DIPLOMACY_GUIDE.map.nodes) if (n.doc) expect(getModule(n.doc), n.doc).toBeTruthy()
    const cols = [...new Set(DIPLOMACY_GUIDE.map.nodes.map((n) => n.x))].sort((a, b) => a - b)
    cols.slice(1).forEach((x, i) => expect(x - cols[i]).toBe(210))
    expect(DIPLOMACY_GUIDE.steps.length).toBeGreaterThanOrEqual(8)
    expect(DIPLOMACY_GUIDE.steps.length).toBeLessThanOrEqual(10)
  })

  it('builds a whole faction setup from the examples, each one undo step', () => {
    load()
    for (const id of ['factions', 'relations', 'levels', 'consequences', 'actions']) expect(step(id).done!(state()), id).toBe(false)

    const preview = previewProject(state(), example('factions'))
    expect(factionsOf(state())).toEqual([])
    applyExample(example('factions'))
    applyExample(example('factions'))
    expect(factionsOf(state()).map((f) => f.name)).toEqual(factionsOf(preview).map((f) => f.name))
    expect(factionsOf(state())).toHaveLength(4)
    expect(step('factions').done!(state())).toBe(true)

    applyExample(example('rivalry'))
    expect(step('relations').done!(state())).toBe(true)
    const pairs = relationPairs(state())
    expect(pairs.filter((p) => p.standing === 'ally').map((p) => `${p.a.name}-${p.b.name}`)).toEqual(['Iron Crown-Old Faith', 'Free Guilds-Ash Clans'])
    expect(pairs.filter((p) => p.standing === 'enemy')).toHaveLength(4)

    applyExample(example('levels'))
    expect(step('levels').done!(state())).toBe(true)
    expect(step('consequences').done!(state())).toBe(true)
    const rows = analyzeRanges(levelsOf(state()), scaleOf(state())).rows
    expect([rows[0].from, rows[rows.length - 1].to]).toEqual([-100, 100])

    applyExample(example('actions'))
    expect(step('actions').done!(state())).toBe(true)
    // "Aid Iron Crown" helps the crown and its ally, and costs standing with its two rivals.
    const aid = state().documents[DIPLOMACY_DOC].data.actions[0]
    const sim = simulateActions(state(), [aid.id])
    expect(sim.map((r) => r.end)).toEqual([15, -10, 5, -10])

    useStore.getState().undo()
    expect(state().documents[DIPLOMACY_DOC].data.actions).toEqual([])
  })

  it('keeps relation cells the designer already set', () => {
    load()
    applyExample(example('factions'))
    const [a, b] = factionsOf(state())
    useStore.getState().mutate((d) => void (d.documents[DIPLOMACY_DOC].data.relations.cells[`${a.id}|${b.id}`] = 99))
    applyExample(example('rivalry'))
    expect(relationCells(state())[`${a.id}|${b.id}`]).toBe(99)
  })

  it('ticks the scale step from the overview', () => {
    load()
    expect(step('scale').done!(state())).toBe(false)
    useStore.getState().mutate((d) => void (d.documents[DIPLOMACY_DOC].data.overview.startValue = 0))
    expect(step('scale').done!(state())).toBe(true)
  })

  it('colours map nodes by data', () => {
    const p = createProject('T', false)
    p.documents[DIPLOMACY_DOC] = { moduleVersion: 2, data: { factions: [], actions: [], thresholds: [], endings: [] } }
    expect(mapStates(p, DIPLOMACY_DOC, DIPLOMACY_GUIDE.map).factions.state).toBe('empty')
    expect(mapStates(p, DIPLOMACY_DOC, DIPLOMACY_GUIDE.map).trade.state).toBe('external')
    p.documents[DIPLOMACY_DOC].data.factions = [{ id: 'a', name: 'A' }]
    expect(mapStates(p, DIPLOMACY_DOC, DIPLOMACY_GUIDE.map).factions.state).not.toBe('empty')
  })
})
