import { describe, expect, it } from 'vitest'
import { createProject } from '../src/core/model/project'
import { useStore } from '../src/core/store/store'
import { getModule, getSection } from '../src/core/modules/registry'
import { ARCH_DOC, branchFlow, CODING_DOC, codingList, enforcementSummary, exampleIssues, lfsCoverage, moduleFolders, namespaceCheck } from '../src/core/coding'
import { CODING_GUIDE as G } from '../src/modules/guides/coding'
import { guideOf } from '../src/modules/guides'
import { applyExample, previewProject } from '../src/ui/guides/ExamplePicker'
import { mapStates } from '../src/ui/guides/GuideMap'

const step = (id: string) => G.steps.find((s) => s.id === id)!
const example = (id: string) => G.examples.find((e) => e.id === id)!
const state = () => useStore.getState().project
const load = () => {
  useStore.getState().loadProject(createProject('T', false), 'x')
  useStore.getState().ensureDoc(CODING_DOC)
}

describe('coding standards guide', () => {
  it('is registered and points every step, node, example, concept and empty text at a real section', () => {
    expect(guideOf(CODING_DOC)).toBe(G)
    const mod = getModule(CODING_DOC)!
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

  it('builds a clean standard from the examples, each one undo step', () => {
    load()
    for (const s of G.steps) if (s.done) expect(s.done(state()), s.id).toBe(false)

    const preview = previewProject(state(), example('coding-csharp-names'))
    expect(codingList(state(), 'naming')).toEqual([])
    applyExample(example('coding-csharp-names'))
    expect(codingList(state(), 'naming').map((r) => r.name)).toEqual(codingList(preview, 'naming').map((r) => r.name))
    applyExample(example('coding-asset-names'))
    expect(exampleIssues(state())).toEqual([])
    for (const id of ['naming', 'test']) expect(step(id).done!(state()), id).toBe(true)

    applyExample(example('coding-unity-folders'))
    applyExample(example('coding-asset-rules'))
    expect(codingList(state(), 'assetRules').every((r) => r.folder)).toBe(true)
    applyExample(example('coding-git-flow'))
    expect(branchFlow(state()).every((r) => !r.issues.length)).toBe(true)
    expect(lfsCoverage(state()).some((r) => !r.covered)).toBe(true)
    const git = step('git').action as { run: (p: ReturnType<typeof state>) => void }
    useStore.getState().mutate((p) => git.run(p))
    expect(lfsCoverage(state()).every((r) => r.covered)).toBe(true)
    applyExample(example('coding-review-unity'))
    expect(enforcementSummary(state()).total.automated).toBeGreaterThan(0)
    for (const id of ['folders', 'assets', 'branches', 'git', 'review']) expect(step(id).done!(state()), id).toBe(true)

    useStore.getState().undo()
    expect(codingList(state(), 'review')).toEqual([])
  })

  it('links folders and namespaces to the Architecture modules', () => {
    load()
    useStore.getState().mutate((p) => {
      p.documents[ARCH_DOC] = { moduleVersion: 2, data: { modules: [{ id: 'm1', name: 'Core.Events', assembly: 'HoH.Core.Events' }, { id: 'm2', name: 'UI.Hud', assembly: 'HoH.UI.Hud' }] } }
    })
    applyExample(example('coding-unity-folders'))
    expect(moduleFolders(state()).unplaced).toEqual([])
    expect(step('place').done!(state())).toBe(true)
    applyExample(example('coding-csharp-names'))
    expect(namespaceCheck(state()).rows.every((r) => r.check.pass)).toBe(true)
  })

  it('does not duplicate entries when examples are inserted twice', () => {
    load()
    for (const id of ['coding-csharp-names', 'coding-unity-folders', 'coding-git-flow', 'coding-trunk', 'coding-review-unity']) {
      applyExample(example(id))
      applyExample(example(id))
    }
    expect(codingList(state(), 'naming')).toHaveLength(9)
    expect(codingList(state(), 'folders')).toHaveLength(15)
    expect(codingList(state(), 'branches').map((b) => b.name)).toEqual(['main', 'develop', 'feature', 'release', 'hotfix', 'task'])
    expect(codingList(state(), 'review')).toHaveLength(10)
  })

  it('colours map nodes by data', () => {
    const p = createProject('T', false)
    p.documents[CODING_DOC] = { moduleVersion: 2, data: { naming: [] } }
    expect(mapStates(p, CODING_DOC, G.map).naming.state).toBe('empty')
    expect(mapStates(p, CODING_DOC, G.map).tools.state).toBe('external')
    p.documents[CODING_DOC].data.naming = [{ id: 'a', name: 'A' }]
    expect(mapStates(p, CODING_DOC, G.map).naming.state).not.toBe('empty')
  })
})
