import { describe, expect, it } from 'vitest'
import { collectHints, makeContext } from '../src/core/hints/engine'
import { moduleToMarkdown } from '../src/core/export/markdown'
import { createProject, makeId } from '../src/core/model/project'
import { ensureDocument, getModule } from '../src/core/modules/registry'
import {
  ARCH_DOC,
  bootSequence,
  coupling,
  DATA_DOC,
  dependencies,
  dependencyCycles,
  extensionCoverage,
  layerOrder,
  messageFlow,
  tickBudget,
  tickPattern,
} from '../src/core/architecture'

const arch = getModule(ARCH_DOC)!
const LAYERS = [
  { id: 'core', name: 'Core', order: 0 },
  { id: 'sim', name: 'Simulation', order: 1 },
  { id: 'ui', name: 'UI', order: 2 },
]

function project(modules: Record<string, unknown>[] = []) {
  const p = createProject('T', false)
  p.documents[ARCH_DOC] = { moduleVersion: 2, data: { layers: LAYERS.map((l) => ({ ...l })), modules } }
  return p
}
const m = (id: string, layer: string, dependsOn: string[] = []) => ({ id, name: id.toUpperCase(), layer, dependsOn })
const ruleIds = (p: ReturnType<typeof createProject>, docId = ARCH_DOC) =>
  collectHints(makeContext(p, { docId }))
    .filter((h) => h.ruleId.startsWith('arch.'))
    .map((h) => h.ruleId)

describe('architecture module v2', () => {
  it('migrates v1 free text into notes and fixed layer names into layer refs, keeping ids', () => {
    const p = createProject('t', false)
    p.documents[ARCH_DOC] = {
      moduleVersion: 1,
      data: {
        principles: { goals: 'Extensible', stack: 'Unity 6', communication: 'Event bus', simulation: '', scenes: 'Bootstrap scene' },
        modules: [{ id: 'm1', name: 'Events', layer: 'Core' }, { id: 'm2', name: 'Net', layer: 'Network' }, { id: 'm3', name: 'Free' }],
        dependencies: { nodes: [{ id: 'n', kind: 'External', label: 'Steam', x: 0, y: 0 }], edges: [] },
        extensionPoints: [{ id: 'x1', name: 'Items', how: 'Add asset' }],
      },
    }
    const doc = ensureDocument(p, arch, makeId)
    expect(doc.moduleVersion).toBe(2)
    expect(doc.data.principles.goals).toBe('Extensible')
    expect(doc.data.principles.stack).toBeUndefined()
    expect(doc.data.principles.legacyNotes).toBe('Technology stack: Unity 6\n\nCommunication patterns: Event bus\n\nScenes and lifecycle: Bootstrap scene')
    expect(doc.data.modules.map((x: { layer?: string }) => x.layer)).toEqual(['layer-core', 'layer-network', undefined])
    expect(doc.data.layers.find((l: { id: string }) => l.id === 'layer-network')).toMatchObject({ name: 'Network', order: 6 })
    expect(doc.data.dependencies.nodes[0].label).toBe('Steam')
    expect(doc.data.extensionPoints[0]).toMatchObject({ id: 'x1', how: 'Add asset' })
    expect(Array.isArray(doc.data.channels) && Array.isArray(doc.data.systems) && Array.isArray(doc.data.scenes)).toBe(true)
  })

  it('exports sections in doc-chapter order', () => {
    const p = createProject('T')
    const md = moduleToMarkdown(p, arch)
    const order = ['Goals and principles', 'Technology stack', 'Systems overview (layers)', 'Modules / assemblies', 'Communication channels', 'Extension points', 'Simulation architecture', 'Simulation systems', 'Scenes and lifecycle']
    const at = order.map((h) => md.indexOf(h))
    expect(at.every((x) => x >= 0)).toBe(true)
    expect([...at].sort((a, b) => a - b)).toEqual(at)
  })
})

describe('architecture analysis', () => {
  it('sorts layers and flags upward dependencies unless allowed', () => {
    const p = project([m('a', 'core'), m('b', 'sim', ['a']), m('c', 'core', ['b']), m('d', 'ui', ['b', 'gone'])])
    expect(layerOrder(p).map((l) => l.name)).toEqual(['Core', 'Simulation', 'UI'])
    const issues = dependencies(p).map((d) => `${d.from.id}>${d.toId}:${d.issue ?? 'ok'}`)
    expect(issues).toEqual(['b>a:ok', 'c>b:upward', 'd>b:ok', 'd>gone:missing'])
    p.documents[ARCH_DOC].data.layers[0].mayUse = ['sim']
    expect(dependencies(p).find((d) => d.from.id === 'c')?.issue).toBeUndefined()
  })

  it('finds dependency cycles, including self-dependencies', () => {
    const p = project([m('a', 'core', ['b']), m('b', 'core', ['c']), m('c', 'core', ['a']), m('d', 'ui', ['d']), m('e', 'ui', ['a'])])
    expect(dependencyCycles(p).map((c) => c.map((x) => x.id).sort())).toEqual([['a', 'b', 'c'], ['d']])
  })

  it('computes fan-in, fan-out and instability', () => {
    const p = project([m('a', 'core'), m('b', 'sim', ['a']), m('c', 'ui', ['a', 'b']), m('z', 'ui')])
    const rows = Object.fromEntries(coupling(p).map((r) => [r.module.id, [r.fanIn, r.fanOut, r.instability]]))
    expect(rows).toEqual({ a: [2, 0, 0], b: [1, 1, 0.5], c: [0, 2, 1], z: [0, 0, null] })
  })

  it('resolves channels and flags missing sides', () => {
    const p = project([m('a', 'core'), m('b', 'ui')])
    p.documents[ARCH_DOC].data.channels = [
      { id: 'c1', name: 'Ok', publishers: ['a'], subscribers: ['b'] },
      { id: 'c2', name: 'Shout', publishers: ['a'] },
      { id: 'c3', name: 'Silent', subscribers: ['b', 'gone'] },
    ]
    expect(messageFlow(p).map((r) => [r.channel.id, r.orphan, r.subscribers.length])).toEqual([['c1', null, 1], ['c2', 'noSubscriber', 0], ['c3', 'noPublisher', 1]])
  })

  it('crosses Data-driven schemas with extension points', () => {
    const p = project([m('a', 'core')])
    p.documents[DATA_DOC] = { moduleVersion: 1, data: { schemas: [{ id: 's1', name: 'Item' }, { id: 's2', name: 'Quest' }] } }
    p.documents[ARCH_DOC].data.extensionPoints = [{ id: 'x', name: 'Defs', host: 'a', schemas: ['s1'] }, { id: 'y', name: 'Loose' }]
    const cov = extensionCoverage(p)
    expect(cov.rows.map((r) => [r.schema.name, r.points.map((x) => x.id)])).toEqual([['Item', ['x']], ['Quest', []]])
    expect(cov.uncovered.map((s) => s.name)).toEqual(['Quest'])
    expect(cov.hostless.map((x) => x.id)).toEqual(['y'])
  })

  it('estimates the tick budget by hand-checked numbers', () => {
    const p = project()
    const d = p.documents[ARCH_DOC].data
    d.simulation = { tickRate: 10, targetFps: 50, simShare: 25, farInstances: 4 }
    d.systems = [
      { id: 's1', name: 'Needs', every: 1, costMs: 0.5, farEvery: 10, farCostMs: 0.2 },
      { id: 's2', name: 'Prices', every: 5, costMs: 2 },
      { id: 's3', name: 'Paths', every: 1, costMs: 1, thread: 'Async' },
    ]
    const b = tickBudget(p)
    // Frame 20 ms, budget 5 ms. Needs: 0.5×10 + 0.2×4×10/10 = 5.8 ms/s; Prices 2×10/5 = 4; Paths 10 (off main thread).
    expect([b.frameMs, b.budgetMs]).toEqual([20, 5])
    expect(b.rows.map((r) => r.perSecond)).toEqual([5.8, 4, 10])
    expect(b.avgFrameMs).toBeCloseTo((5.8 + 4) / 50)
    // Worst tick: 0.5 + 0.2×4 + 2 + 1 = 4.3 ms.
    expect(b.worstTickMs).toBeCloseTo(4.3)
    expect([b.overAverage, b.overWorst]).toEqual([false, false])
    expect(tickPattern(p).map((t) => t.running.length)).toEqual([3, 2, 2, 2, 2, 3, 2, 2, 2, 2])
  })

  it('uses defaults for empty simulation settings', () => {
    const b = tickBudget(project())
    expect([b.tickRate, b.fps, b.share]).toEqual([10, 60, 25])
    expect(b.rows).toEqual([])
  })

  it('orders the boot sequence and checks reachability', () => {
    const p = project([m('a', 'core'), m('b', 'ui'), m('c', 'ui')])
    p.documents[ARCH_DOC].data.scenes = [
      { id: 'boot', name: 'Boot', kind: 'Bootstrap', loadOrder: 0, loads: ['a'], loadSeconds: 1, next: ['menu'] },
      { id: 'menu', name: 'Menu', kind: 'Level', loadOrder: 1, loadSeconds: 0.5 },
      { id: 'hud', name: 'HUD', kind: 'Additive UI', loadOrder: 1, loads: ['b'], loadSeconds: 2 },
      { id: 'lost', name: 'Lost', kind: 'Level', loadOrder: 2 },
      { id: 'x', name: 'Unordered', kind: 'Level' },
    ]
    const boot = bootSequence(p)
    expect(boot.steps.map((s) => [s.order, s.scenes.map((x) => x.id), s.seconds])).toEqual([[0, ['boot'], 1], [1, ['menu', 'hud'], 2], [2, ['lost'], 0]])
    expect(boot.totalSeconds).toBe(3)
    expect(boot.unreachable.map((s) => s.id)).toEqual(['lost', 'x'])
    expect(boot.neverLoaded.map((x) => x.id)).toEqual(['c'])
    expect(boot.unordered.map((s) => s.id)).toEqual(['x'])
  })
})

describe('architecture hints', () => {
  it('flags upward dependencies and cycles, only in this editor', () => {
    const p = project([m('a', 'core', ['b']), m('b', 'ui', ['a'])])
    expect(ruleIds(p)).toEqual(expect.arrayContaining(['arch.upward', 'arch.cycle']))
    expect(ruleIds(p, 'design.npc')).toEqual([])
    p.documents[ARCH_DOC].data.modules[0].dependsOn = []
    expect(ruleIds(p)).not.toContain('arch.upward')
    expect(ruleIds(p)).not.toContain('arch.cycle')
  })

  it('flags modules without a layer, incomplete channels and uncovered schemas', () => {
    const p = project([m('a', ''), m('b', 'core')])
    p.documents[ARCH_DOC].data.channels = [{ id: 'c', name: 'C', publishers: ['a'] }]
    p.documents[DATA_DOC] = { moduleVersion: 1, data: { schemas: [{ id: 's', name: 'Item' }] } }
    expect(ruleIds(p)).not.toContain('arch.uncovered')
    p.documents[ARCH_DOC].data.extensionPoints = [{ id: 'x', name: 'X' }]
    expect(ruleIds(p)).toEqual(expect.arrayContaining(['arch.noLayer', 'arch.channel', 'arch.uncovered']))
    p.documents[ARCH_DOC].data.modules[0].layer = 'core'
    p.documents[ARCH_DOC].data.channels[0].subscribers = ['b']
    p.documents[ARCH_DOC].data.extensionPoints[0].schemas = ['s']
    expect(ruleIds(p)).toEqual([])
  })

  it('flags an over-budget simulation and broken scene flow', () => {
    const p = project([m('a', 'core')])
    p.documents[ARCH_DOC].data.systems = [{ id: 's', name: 'Heavy', costMs: 30 }]
    p.documents[ARCH_DOC].data.scenes = [{ id: 'w', name: 'World', kind: 'Level', loadOrder: 0 }]
    expect(ruleIds(p)).toEqual(expect.arrayContaining(['arch.tickBudget', 'arch.boot']))
    p.documents[ARCH_DOC].data.systems[0].costMs = 0.1
    p.documents[ARCH_DOC].data.scenes[0].kind = 'Bootstrap'
    expect(ruleIds(p)).toEqual([])
  })

  it('stays quiet on an empty doc and never goes above suggest', () => {
    expect(ruleIds(createProject('T', false))).toEqual([])
    const p = project([m('a', 'core', ['b']), m('b', 'ui', ['a'])])
    p.documents[ARCH_DOC].data.principles = { legacyNotes: 'Stack: Unity' }
    const hints = collectHints(makeContext(p, { docId: ARCH_DOC })).filter((h) => h.ruleId.startsWith('arch.'))
    expect(hints.map((h) => h.ruleId)).toContain('arch.legacy')
    expect(hints.every((h) => h.severity !== 'important')).toBe(true)
  })
})

describe('architecture export', () => {
  it('draws layers as Mermaid subgraphs and adds the budget and boot order', () => {
    const p = project([m('a', 'core'), m('b', 'ui', ['a']), m('c', 'core', ['b'])])
    p.documents[ARCH_DOC].data.systems = [{ id: 's', name: 'Needs', costMs: 1 }]
    p.documents[ARCH_DOC].data.scenes = [{ id: 'boot', name: 'Boot', kind: 'Bootstrap', loadOrder: 0, loadSeconds: 1 }]
    const md = moduleToMarkdown(p, arch)
    expect(md).toContain('subgraph Lcore["Core"]')
    expect(md).toContain('c["C"] -.->|upward| b["B"]')
    expect(md).toContain('upward: C → B')
    expect(md).toContain('| Needs | 1 | 10 | Main thread |')
    expect(md).toContain('Boot order: Boot (1 s)')
  })
})
