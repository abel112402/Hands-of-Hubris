import { describe, expect, it } from 'vitest'
import { createProject } from '../src/core/model/project'
import { useStore } from '../src/core/store/store'
import { getModule, getSection } from '../src/core/modules/registry'
import { bondLadder, eventOdds, lifespan, needChains, NPC_DOC, npcList, populationMix, workforceFlow } from '../src/core/npc'
import { NPC_GUIDE } from '../src/modules/guides/npc'
import { guideOf } from '../src/modules/guides'
import { applyExample, previewProject } from '../src/ui/guides/ExamplePicker'
import { mapStates } from '../src/ui/guides/GuideMap'

const step = (id: string) => NPC_GUIDE.steps.find((s) => s.id === id)!
const example = (id: string) => NPC_GUIDE.examples.find((e) => e.id === id)!
const state = () => useStore.getState().project
const load = () => {
  const p = createProject('T', false)
  useStore.getState().loadProject(p, 'x')
  useStore.getState().ensureDoc(NPC_DOC)
}

describe('npc guide', () => {
  it('is registered and points every step, node, example, concept and empty text at a real section', () => {
    expect(guideOf(NPC_DOC)).toBe(NPC_GUIDE)
    const mod = getModule(NPC_DOC)!
    const reg = createProject('t').registry
    const ids = [
      ...NPC_GUIDE.steps.map((s) => s.section),
      ...NPC_GUIDE.map.nodes.flatMap((n) => (n.section ? [n.section] : [])),
      ...NPC_GUIDE.examples.map((e) => e.section),
      ...Object.keys(NPC_GUIDE.concepts),
      ...Object.keys(NPC_GUIDE.empty),
    ]
    for (const id of ids) expect(getSection(mod, reg, id), id).toBeTruthy()
    for (const n of NPC_GUIDE.map.nodes) if (n.doc) expect(getModule(n.doc), n.doc).toBeTruthy()
    const cols = [...new Set(NPC_GUIDE.map.nodes.map((n) => n.x))].sort((a, b) => a - b)
    cols.slice(1).forEach((x, i) => expect(x - cols[i]).toBe(210))
    const nodeIds = new Set(NPC_GUIDE.map.nodes.map((n) => n.id))
    for (const e of NPC_GUIDE.map.edges) expect(nodeIds.has(e.from) && nodeIds.has(e.to), `${e.from}→${e.to}`).toBe(true)
    expect(NPC_GUIDE.steps.length).toBeGreaterThanOrEqual(8)
    expect(NPC_GUIDE.steps.length).toBeLessThanOrEqual(10)
  })

  it('builds a full NPC setup from the examples, each one undo step', () => {
    load()
    for (const id of ['archetypes', 'mix', 'needs', 'lifespan', 'jobs', 'relations', 'events']) expect(step(id).done!(state()), id).toBe(false)

    const preview = previewProject(state(), example('npc-village-cast'))
    expect(npcList(state(), 'archetypes')).toEqual([])
    applyExample(example('npc-village-cast'))
    expect(npcList(state(), 'archetypes').map((a) => a.name)).toEqual(npcList(preview, 'archetypes').map((a) => a.name))
    expect(populationMix(state()).total).toBe(100)
    expect(step('archetypes').done!(state())).toBe(true)
    expect(step('mix').done!(state())).toBe(true)

    applyExample(example('npc-basic-needs'))
    expect(needChains(state()).filter((r) => r.rule).map((r) => r.label)).toEqual(['Food', 'Drink', 'Housing'])
    expect(step('needs').done!(state())).toBe(true)

    applyExample(example('npc-human-lifespan'))
    const l = lifespan(state())
    expect(l.problems).toEqual([])
    expect([l.rows[0].from, l.rows[l.rows.length - 1].to]).toEqual([0, 100])
    expect(step('lifespan').done!(state())).toBe(true)

    applyExample(example('npc-jobs-for-cast'))
    expect(npcList(state(), 'jobs')).toHaveLength(4)
    expect(workforceFlow(state()).jobless).toEqual([])
    expect(step('jobs').done!(state())).toBe(true)

    applyExample(example('npc-bond-set'))
    const b = bondLadder(state())
    expect(b.problems).toEqual([])
    expect(b.loose).toEqual([])
    expect(b.levels.find((x) => x.name === 'Close')?.bonds.map((x) => x.name)).toEqual(['Sweethearts', 'Married'])
    expect(step('relations').done!(state())).toBe(true)

    applyExample(example('npc-village-events'))
    expect(eventOdds(state(), 360, 4).every((r) => r.perYear !== null)).toBe(true)
    expect(step('events').done!(state())).toBe(true)

    useStore.getState().undo()
    expect(npcList(state(), 'events')).toEqual([])
  })

  it('does not duplicate the ladder or jobs when inserted twice', () => {
    load()
    applyExample(example('npc-affinity-ladder'))
    applyExample(example('npc-bond-set'))
    expect(npcList(state(), 'relationLevels')).toHaveLength(5)
    applyExample(example('npc-village-cast'))
    applyExample(example('npc-jobs-for-cast'))
    applyExample(example('npc-jobs-for-cast'))
    expect(npcList(state(), 'jobs')).toHaveLength(4)
  })

  it('colours map nodes by data', () => {
    const p = createProject('T', false)
    p.documents[NPC_DOC] = { moduleVersion: 2, data: { archetypes: [] } }
    expect(mapStates(p, NPC_DOC, NPC_GUIDE.map).archetypes.state).toBe('empty')
    expect(mapStates(p, NPC_DOC, NPC_GUIDE.map).town.state).toBe('external')
    p.documents[NPC_DOC].data.archetypes = [{ id: 'a', name: 'A' }]
    expect(mapStates(p, NPC_DOC, NPC_GUIDE.map).archetypes.state).not.toBe('empty')
  })
})
