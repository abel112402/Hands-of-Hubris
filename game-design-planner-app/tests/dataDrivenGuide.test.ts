import { describe, expect, it } from 'vitest'
import { createProject } from '../src/core/model/project'
import { useStore } from '../src/core/store/store'
import { getModule, getSection } from '../src/core/modules/registry'
import { DATA_DOC, dataList, dataModel, loadPlan, pipelineReadiness, sampleRecord, validateRecord } from '../src/core/dataDriven'
import { extensionCoverage } from '../src/core/architecture'
import { DATA_DRIVEN_GUIDE as G } from '../src/modules/guides/dataDriven'
import { ARCHITECTURE_GUIDE } from '../src/modules/guides/architecture'
import { guideOf } from '../src/modules/guides'
import { applyExample, previewProject } from '../src/ui/guides/ExamplePicker'
import { mapStates } from '../src/ui/guides/GuideMap'

const step = (id: string) => G.steps.find((s) => s.id === id)!
const example = (id: string) => G.examples.find((e) => e.id === id)!
const state = () => useStore.getState().project
const load = () => {
  useStore.getState().loadProject(createProject('T', false), 'x')
  useStore.getState().ensureDoc(DATA_DOC)
}
const run = (id: string) => {
  const a = step(id).action as { run: (p: ReturnType<typeof state>) => void }
  useStore.getState().mutate((p) => a.run(p))
}

describe('data-driven guide', () => {
  it('is registered and points every step, node, example, concept and empty text at a real section', () => {
    expect(guideOf(DATA_DOC)).toBe(G)
    const mod = getModule(DATA_DOC)!
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

  it('builds a working pipeline from the examples, each one undo step', () => {
    load()
    // ensureDoc seeds the default formats and the six schema names (unchanged from v1), so only the later steps start open.
    for (const id of ['fields', 'refs', 'ids', 'sources', 'loading', 'validators']) expect(step(id).done!(state()), id).toBe(false)

    const preview = previewProject(state(), example('data-colony-schemas'))
    expect(dataList(state(), 'schemas').every((x) => !x.required)).toBe(true)
    applyExample(example('data-colony-schemas'))
    expect(dataList(state(), 'schemas').map((s) => s.name)).toEqual(dataList(preview, 'schemas').map((s) => s.name))
    expect(dataList(state(), 'formats').map((f) => f.name)).toEqual(['ScriptableObject', 'JSON', 'CSV'])
    const model = dataModel(state())
    expect(model.problems).toEqual([])
    expect(model.edges.some((e) => e.from.name === 'Quest' && e.to.name === 'Quest')).toBe(true)
    expect(dataList(state(), 'schemas').map((s) => s.source ?? '-')).toEqual(['Items — Items & Crafting', 'Buildings — Town Management', '-', 'Recipes — Items & Crafting', 'Enemies — Combat', 'Quests — Story & Quests'])
    for (const s of dataList(state(), 'schemas')) expect(validateRecord(state(), s, JSON.stringify(sampleRecord(state(), s))), String(s.name)).toEqual([])
    for (const id of ['formats', 'fields', 'refs', 'sources']) expect(step(id).done!(state()), id).toBe(true)

    expect(step('ids').done!(state())).toBe(false)
    run('ids')
    expect(step('ids').done!(state())).toBe(true)

    applyExample(example('data-load-groups'))
    expect(loadPlan(state()).unassigned).toEqual([])
    applyExample(example('data-validators'))
    expect(dataList(state(), 'validators').filter((v) => v.schema)).toHaveLength(3)
    for (const id of ['loading', 'validators']) expect(step(id).done!(state()), id).toBe(true)
    expect(pipelineReadiness(state()).rows.every((r) => r.cells.validation.ok && r.cells.loading.ok)).toBe(true)

    useStore.getState().undo()
    expect(dataList(state(), 'validators')).toEqual([])
  })

  it('fills only empty fields of existing schemas and does not duplicate', () => {
    load()
    useStore.getState().mutate((p) => {
      p.documents[DATA_DOC].data.schemas = [{ id: 'keep', name: 'Item', idPrefix: 'itm.' }, { id: 'n', name: 'Faction' }]
      p.documents[DATA_DOC].data.formats = []
    })
    applyExample(example('data-colony-schemas'))
    applyExample(example('data-colony-schemas'))
    applyExample(example('data-unity-formats'))
    const schemas = dataList(state(), 'schemas')
    expect(schemas).toHaveLength(7)
    expect(schemas[0]).toMatchObject({ id: 'keep', idPrefix: 'itm.' })
    expect(dataList(state(), 'formats')).toHaveLength(3)
    run('sources')
    expect(schemas.find((s) => s.name === 'Faction')).toBeTruthy()
    expect(dataList(state(), 'schemas').find((s) => s.name === 'Faction')?.source).toBe('Factions — Factions & Diplomacy')
  })

  it('keeps the Architecture extension example working with format refs', () => {
    load()
    useStore.getState().mutate((p) => {
      p.documents[DATA_DOC].data.schemas = []
      p.documents[DATA_DOC].data.formats = []
    })
    applyExample(ARCHITECTURE_GUIDE.examples.find((e) => e.id === 'arch-data-extensions')!)
    const formats = dataList(state(), 'formats')
    const typed = dataList(state(), 'schemas').filter((s) => s.format)
    expect(typed.length).toBeGreaterThan(0)
    expect(typed.every((s) => formats.some((f) => f.id === s.format))).toBe(true)
    expect(extensionCoverage(state()).uncovered).toEqual([])
  })

  it('colours map nodes by data', () => {
    const p = createProject('T', false)
    p.documents[DATA_DOC] = { moduleVersion: 2, data: { schemas: [] } }
    expect(mapStates(p, DATA_DOC, G.map).schemas.state).toBe('empty')
    expect(mapStates(p, DATA_DOC, G.map).items.state).toBe('external')
    p.documents[DATA_DOC].data.schemas = [{ id: 'a', name: 'A' }]
    expect(mapStates(p, DATA_DOC, G.map).schemas.state).not.toBe('empty')
  })
})
