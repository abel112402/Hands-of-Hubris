import { describe, expect, it } from 'vitest'
import { createProject } from '../src/core/model/project'
import { useStore } from '../src/core/store/store'
import { getModule, getSection } from '../src/core/modules/registry'
import { ARCH_DOC, archList, bootSequence, dependencies, dependencyCycles, extensionCoverage, messageFlow, tickBudget } from '../src/core/architecture'
import { ARCHITECTURE_GUIDE as G } from '../src/modules/guides/architecture'
import { guideOf } from '../src/modules/guides'
import { applyExample, previewProject } from '../src/ui/guides/ExamplePicker'
import { mapStates } from '../src/ui/guides/GuideMap'

const step = (id: string) => G.steps.find((s) => s.id === id)!
const example = (id: string) => G.examples.find((e) => e.id === id)!
const state = () => useStore.getState().project
const load = () => {
  useStore.getState().loadProject(createProject('T', false), 'x')
  useStore.getState().ensureDoc(ARCH_DOC)
}

describe('architecture guide', () => {
  it('is registered and points every step, node, example, concept and empty text at a real section', () => {
    expect(guideOf(ARCH_DOC)).toBe(G)
    const mod = getModule(ARCH_DOC)!
    const reg = createProject('t').registry
    const ids = [...G.steps.map((s) => s.section), ...G.map.nodes.flatMap((n) => (n.section ? [n.section] : [])), ...G.examples.map((e) => e.section), ...Object.keys(G.concepts), ...Object.keys(G.empty)]
    for (const id of ids) expect(getSection(mod, reg, id), id).toBeTruthy()
    for (const n of G.map.nodes) if (n.doc) expect(getModule(n.doc), n.doc).toBeTruthy()
    const cols = [...new Set(G.map.nodes.map((n) => n.x))].sort((a, b) => a - b)
    cols.slice(1).forEach((x, i) => expect(x - cols[i]).toBe(210))
    const nodeIds = new Set(G.map.nodes.map((n) => n.id))
    for (const e of G.map.edges) expect(nodeIds.has(e.from) && nodeIds.has(e.to), `${e.from}→${e.to}`).toBe(true)
    expect(G.steps.length).toBeGreaterThanOrEqual(8)
    expect(G.steps.length).toBeLessThanOrEqual(10)
  })

  it('builds a clean architecture from the examples, each one undo step', () => {
    load()
    for (const id of ['goals', 'stack', 'modules', 'deps', 'clean', 'channels', 'extensions', 'ticks', 'scenes']) expect(step(id).done!(state()), id).toBe(false)

    const preview = previewProject(state(), example('arch-colony-modules'))
    expect(archList(state(), 'modules')).toEqual([])
    applyExample(example('arch-colony-modules'))
    expect(archList(state(), 'modules').map((m) => m.name)).toEqual(archList(preview, 'modules').map((m) => m.name))
    expect(archList(state(), 'modules')).toHaveLength(8)
    expect(dependencies(state()).some((d) => d.issue)).toBe(false)
    expect(dependencyCycles(state())).toEqual([])
    for (const id of ['modules', 'deps', 'clean']) expect(step(id).done!(state()), id).toBe(true)

    applyExample(example('arch-unity-stack'))
    expect(archList(state(), 'stack').find((s) => s.name === 'Jobs + Burst')?.usedBy).toHaveLength(1)
    applyExample(example('arch-event-channels'))
    expect(messageFlow(state()).every((r) => !r.orphan)).toBe(true)
    applyExample(example('arch-data-extensions'))
    expect(extensionCoverage(state()).uncovered).toEqual([])
    applyExample(example('arch-town-ticks'))
    const b = tickBudget(state())
    expect(b.rows).toHaveLength(5)
    expect(b.overAverage).toBe(false)
    applyExample(example('arch-boot-scenes'))
    const boot = bootSequence(state())
    expect(boot.noBootstrap).toBe(false)
    expect(boot.unreachable).toEqual([])
    expect(boot.neverLoaded.map((m) => m.name)).toEqual(['Tools.Debug'])
    for (const id of ['stack', 'channels', 'extensions', 'ticks', 'scenes']) expect(step(id).done!(state()), id).toBe(true)

    useStore.getState().undo()
    expect(archList(state(), 'scenes')).toEqual([])
  })

  it('does not duplicate layers or modules when examples are inserted twice', () => {
    load()
    const before = archList(state(), 'layers').length
    applyExample(example('arch-default-layers'))
    applyExample(example('arch-colony-modules'))
    applyExample(example('arch-event-channels'))
    applyExample(example('arch-event-channels'))
    expect(archList(state(), 'layers')).toHaveLength(Math.max(before, 6))
    expect(archList(state(), 'modules')).toHaveLength(8)
    expect(archList(state(), 'channels')).toHaveLength(4)
  })

  it('colours map nodes by data', () => {
    const p = createProject('T', false)
    p.documents[ARCH_DOC] = { moduleVersion: 2, data: { modules: [] } }
    expect(mapStates(p, ARCH_DOC, G.map).modules.state).toBe('empty')
    expect(mapStates(p, ARCH_DOC, G.map).performance.state).toBe('external')
    p.documents[ARCH_DOC].data.modules = [{ id: 'a', name: 'A' }]
    expect(mapStates(p, ARCH_DOC, G.map).modules.state).not.toBe('empty')
  })
})
