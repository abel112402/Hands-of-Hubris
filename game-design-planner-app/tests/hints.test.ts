import { describe, expect, it } from 'vitest'
import { collectHints, dedupeHints, evaluateHints, makeContext, splitByScope } from '../src/core/hints/engine'
import { createProject, makeId } from '../src/core/model/project'
import { defaultHintPrefs } from '../src/core/model/types'
import { deserializeProject, serializeProject } from '../src/core/persistence/serialize'

const empty = () => createProject('T', false)
const ids = (p: ReturnType<typeof empty>, docId?: string, sectionId?: string) =>
  collectHints(makeContext(p, { docId, sectionId })).map((h) => h.ruleId)

describe('hint rules', () => {
  it('suggests the next documents on an empty project, in order', () => {
    const hints = collectHints(makeContext(empty())).filter((h) => h.ruleId === 'onboarding.next')
    expect(hints.map((h) => h.target.docId)).toEqual(['overview.vision', 'design.coreLoop', 'design.player'])
  })

  it('asks for the vision first once design docs have content', () => {
    const p = empty()
    expect(ids(p)).not.toContain('dependency.visionFirst')
    p.documents['design.coreLoop'] = { moduleVersion: 1, data: { loops: [{ id: 'a', name: 'Loop' }] } }
    expect(ids(p)).toContain('dependency.visionFirst')
  })

  it('flags empty sections with an addEntity action for collections', () => {
    const hint = collectHints(makeContext(createProject('T', false), { docId: 'design.items' })).find(
      (h) => h.ruleId === 'completeness.emptySection' && h.target.sectionId === 'items',
    )
    expect(hint?.action?.kind).toBe('addEntity')
  })

  it('detects numeric outliers with the configurable IQR threshold', () => {
    const p = empty()
    const items = [1, 2, 2, 3, 3, 3, 4, 4, 5, 500].map((value, i) => ({ id: makeId(), name: `I${i}`, value }))
    p.documents['design.items'] = { moduleVersion: 1, data: { items } }
    expect(ids(p, 'design.items')).toContain('balance.outlier')
    p.meta.hints = { ...defaultHintPrefs(), thresholds: { ...defaultHintPrefs().thresholds, outlierIqr: 1000 } }
    expect(ids(p, 'design.items')).not.toContain('balance.outlier')
  })

  it('finds isolated graph nodes', () => {
    const p = empty()
    p.documents['design.coreLoop'] = {
      moduleVersion: 1,
      data: {
        loopGraph: {
          nodes: [
            { id: 'a', label: 'A', kind: 'Action', x: 0, y: 0 },
            { id: 'b', label: 'B', kind: 'Action', x: 0, y: 0 },
            { id: 'c', label: 'C', kind: 'Action', x: 0, y: 0 },
          ],
          edges: [{ id: 'e', source: 'a', target: 'b' }],
        },
      },
    }
    expect(collectHints(makeContext(p, { docId: 'design.coreLoop' })).find((h) => h.ruleId === 'editor.graph')?.params?.names).toBe('C')
  })

  it('reports undefined formula variables', () => {
    const p = empty()
    p.documents['design.combat'] = { moduleVersion: 1, data: { damage: { items: [{ id: 'f', name: 'Dmg', expr: 'atk * 2', vars: {} }] } } }
    const h = collectHints(makeContext(p, { docId: 'design.combat' })).filter((x) => x.ruleId === 'formula.check')
    expect(h).toHaveLength(1)
    expect(h[0].params?.vars).toBe('atk')
  })

  it('flags overdue milestones', () => {
    const p = empty()
    p.documents['production.milestones'] = { moduleVersion: 1, data: { milestones: [{ id: 'm', name: 'M1', due: '2020-01-01', status: 'In progress' }] } }
    expect(ids(p, 'production.milestones')).toContain('process.milestones')
  })

  it('evaluates user-defined declarative rules', () => {
    const p = empty()
    p.registry.hintRules = [
      { id: 'r1', doc: 'design.npc', section: 'archetypes', when: { kind: 'count', op: '<', value: 3 }, severity: 'suggest', title: 'Few NPCs', body: 'Only {count}' },
    ]
    const h = collectHints(makeContext(p, { docId: 'design.npc' })).find((x) => x.ruleId === 'user:r1')
    expect(h?.title).toBe('Few NPCs')
  })
})

describe('hint engine', () => {
  const base = () => {
    const p = empty()
    return p
  }
  it('is deterministic and limited to 5 active hints', () => {
    const p = base()
    const a = evaluateHints(makeContext(p, { docId: 'design.items' }))
    const b = evaluateHints(makeContext(p, { docId: 'design.items' }))
    expect(a.visible.map((h) => h.id)).toEqual(b.visible.map((h) => h.id))
    expect(a.visible.length).toBeLessThanOrEqual(5)
  })

  it('ranks hints of the current document first', () => {
    const { visible } = evaluateHints(makeContext(base(), { docId: 'design.items' }))
    expect(visible[0].target.docId).toBe('design.items')
  })

  it('honours dismiss, mute, snooze, severity and disable', () => {
    const p = base()
    const first = evaluateHints(makeContext(p, { docId: 'design.items' })).visible[0]
    p.meta.hints = { ...defaultHintPrefs(), dismissed: { [first.id]: true } }
    expect(evaluateHints(makeContext(p, { docId: 'design.items' })).visible.map((h) => h.id)).not.toContain(first.id)

    p.meta.hints = { ...defaultHintPrefs(), mutedRules: [first.ruleId] }
    expect(evaluateHints(makeContext(p, { docId: 'design.items' })).visible.map((h) => h.ruleId)).not.toContain(first.ruleId)

    p.meta.hints = defaultHintPrefs()
    const ctx = makeContext(p, { docId: 'design.items' })
    expect(evaluateHints(ctx, { [first.id]: ctx.now + 1000 }).visible.map((h) => h.id)).not.toContain(first.id)

    p.meta.hints = { ...defaultHintPrefs(), minSeverity: 'important' }
    expect(evaluateHints(makeContext(p, { docId: 'design.items' })).visible.every((h) => h.severity === 'important')).toBe(true)

    p.meta.hints = { ...defaultHintPrefs(), enabled: false }
    expect(evaluateHints(makeContext(p, { docId: 'design.items' })).total).toBe(0)
  })

  it('stores preferences in the project file and loads older files without them', () => {
    const p = base()
    p.meta.hints = { ...defaultHintPrefs(), dismissed: { x: true } }
    expect(deserializeProject(serializeProject(p)).project.meta.hints?.dismissed).toEqual({ x: true })
    const old = base()
    expect(deserializeProject(serializeProject(old)).project.meta.hints).toBeUndefined()
  })
})

describe('vision readiness rules', () => {
  const vision = () => {
    const p = empty()
    p.documents['overview.vision'] = {
      moduleVersion: 2,
      data: { pitch: {}, pillars: [], usps: [], scope: [], audience: { audience: 'Cozy builders' } },
    }
    return p
  }
  const vids = (p: ReturnType<typeof empty>) => ids(p, 'overview.vision')

  it('stays quiet for an empty vision and for other documents', () => {
    const p = empty()
    expect(vids(p).filter((r) => r.startsWith('vision.'))).toEqual([])
    expect(ids(vision(), 'design.items').filter((r) => r.startsWith('vision.'))).toEqual([])
  })

  it('prompts for a pitch and pillars once the vision has content', () => {
    expect(vids(vision())).toEqual(expect.arrayContaining(['vision.pitch', 'vision.pillars']))
  })

  it('checks pillar count, decision tests, USP benefits and scope buckets', () => {
    const p = vision()
    const d = p.documents['overview.vision'].data
    d.pitch = { pitch: 'A town sim' }
    d.pillars = [{ id: 'a', name: 'Cozy' }]
    d.usps = [{ id: 'u', name: 'Magic', description: 'x' }]
    d.scope = [{ id: 's1', name: 'Combat' }, { id: 's2', name: 'Trade', bucket: 'Later' }]
    const r = vids(p)
    expect(r).toEqual(expect.arrayContaining(['vision.pillarCount', 'vision.pillarTest', 'vision.uspBenefit', 'vision.scopeBucket']))
    expect(r).not.toContain('vision.pitch')
    d.scope[0].bucket = 'Later'
    expect(vids(p)).toContain('vision.scopeMvp')
    d.scope[0].bucket = 'In MVP'
    expect(vids(p)).not.toContain('vision.scopeMvp')
  })

  it('never exceeds suggest severity', () => {
    const hints = collectHints(makeContext(vision(), { docId: 'overview.vision' })).filter((h) => h.ruleId.startsWith('vision.'))
    expect(hints.length).toBeGreaterThan(0)
    expect(hints.every((h) => h.severity !== 'important')).toBe(true)
  })
})

describe('roadmap readiness rules', () => {
  const roadmap = (data: Record<string, any>) => {
    const p = empty()
    p.documents['overview.roadmap'] = { moduleVersion: 2, data: { assumptions: {}, phases: [], tasks: [], gates: [], ...data } }
    return p
  }
  const rids = (p: ReturnType<typeof empty>, now?: number) =>
    collectHints(makeContext(p, { docId: 'overview.roadmap', ...(now ? { now } : {}) })).map((h) => h.ruleId)

  it('stays quiet for an empty roadmap and for other documents', () => {
    expect(rids(empty()).filter((r) => r.startsWith('roadmap.'))).toEqual([])
    expect(ids(roadmap({ phases: [{ id: 'a', name: 'A' }] }), 'design.items').filter((r) => r.startsWith('roadmap.'))).toEqual([])
  })

  it('flags conflicts, cycles, missing values, exit criteria and gates', () => {
    const p = roadmap({
      phases: [{ id: 'a', name: 'A', start: 0, duration: 4 }, { id: 'b', name: 'B', start: 2, duration: 4, dependsOn: ['a'] }],
      tasks: [{ id: 't1', name: 'T1', dependsOn: ['t2'] }, { id: 't2', name: 'T2', dependsOn: ['t1'] }],
    })
    expect(rids(p)).toEqual(
      expect.arrayContaining(['roadmap.conflict', 'roadmap.cycle', 'roadmap.missing', 'roadmap.exit', 'roadmap.gate']),
    )
  })

  it('flags overload, low confidence and overdue gate decisions', () => {
    const p = roadmap({
      assumptions: { startDate: '2020-01-06' },
      phases: [{ id: 'a', name: 'A', start: 0, duration: 4, capacity: 2, exit: [{ id: 'e', text: 'x', done: true }] }],
      tasks: [{ id: 't', name: 'T', phase: 'a', start: 0, duration: 1, effort: 5, confidence: 'Low', status: 'Planned' }],
      gates: [{ id: 'g', name: 'G0', phase: 'a', decision: 'Pending' }],
    })
    expect(rids(p)).toEqual(expect.arrayContaining(['roadmap.overload', 'roadmap.confidence', 'roadmap.decision']))
    expect(rids(p)).not.toContain('roadmap.gate')
    expect(collectHints(makeContext(p, { docId: 'overview.roadmap' })).filter((h) => h.ruleId.startsWith('roadmap.')).every((h) => h.severity !== 'important')).toBe(true)
  })
})

describe('core loop design checks', () => {
  const loop = (data: Record<string, any>) => {
    const p = empty()
    p.documents['design.coreLoop'] = { moduleVersion: 2, data: { loops: [], loopGraph: { nodes: [], edges: [] }, ...data } }
    return collectHints(makeContext(p, { docId: 'design.coreLoop' })).map((h) => h.ruleId).filter((r) => r.startsWith('coreLoop.'))
  }
  const node = (id: string) => ({ id, kind: 'Action', label: id, x: 0, y: 0 })

  it('stays quiet for an empty loop document', () => {
    expect(loop({})).toEqual([])
  })

  it('flags missing scales, rewards, decisions, progression and unlinked loops', () => {
    const r = loop({
      loops: [
        { id: 'a', name: 'A', scale: 'Short (minutes)' },
        { id: 'b', name: 'B', scale: 'Long (campaign)', reward: 'x', nextDecision: 'y', nodes: [] },
      ],
      loopGraph: { nodes: [node('n')], edges: [] },
    })
    expect(r).toEqual(expect.arrayContaining(['coreLoop.scales', 'coreLoop.reward', 'coreLoop.decision', 'coreLoop.progression', 'coreLoop.unlinked']))
  })

  it('flags isolated nodes and a diagram without a feedback path, but not once it loops', () => {
    const line = { nodes: [node('a'), node('b'), node('c'), node('d')], edges: [{ id: 'e1', source: 'a', target: 'b' }, { id: 'e2', source: 'b', target: 'c' }] }
    expect(loop({ loopGraph: line })).toEqual(expect.arrayContaining(['coreLoop.isolated', 'coreLoop.feedback']))
    const cyc = { nodes: line.nodes, edges: [...line.edges, { id: 'e3', source: 'c', target: 'a' }, { id: 'e4', source: 'd', target: 'a' }] }
    expect(loop({ loopGraph: cyc })).not.toEqual(expect.arrayContaining(['coreLoop.feedback']))
    expect(loop({ loopGraph: cyc })).not.toEqual(expect.arrayContaining(['coreLoop.isolated']))
  })
})

describe('difficulty tuning checks', () => {
  const diff = (params: any[], cells: Record<string, number>, presets: any[] = [{ id: 'p', name: 'Easy', intent: 'x' }]) => {
    const p = empty()
    p.documents['design.difficulty'] = { moduleVersion: 2, data: { params, presets, values: { cells } } }
    return collectHints(makeContext(p, { docId: 'design.difficulty' })).map((h) => h.ruleId).filter((r) => r.startsWith('difficulty.'))
  }
  const param = (extra: Record<string, any> = {}) => ({ id: 'a', name: 'A', direction: 'Higher = harder', min: 0, max: 2, ...extra })

  it('stays quiet without parameters', () => {
    expect(diff([], {})).toEqual([])
  })

  it('flags missing values and out-of-range values', () => {
    expect(diff([param()], { 'a|easy': 1, 'a|medium': 5 })).toEqual(expect.arrayContaining(['difficulty.missing', 'difficulty.range']))
  })

  it('flags reversals, unless the parameter is an intentional exception', () => {
    const cells = { 'a|easy': 1, 'a|medium': 2, 'a|hard': 1.5 }
    expect(diff([param()], cells)).toContain('difficulty.reversal')
    expect(diff([param({ exception: true })], cells)).not.toContain('difficulty.reversal')
    expect(diff([param({ direction: 'Higher = easier' })], { 'a|easy': 2, 'a|medium': 1, 'a|hard': 0 })).not.toContain('difficulty.reversal')
  })

  it('asks for tuning context and preset intent', () => {
    expect(diff([param({ direction: undefined })], {}, [{ id: 'p', name: 'Easy' }])).toEqual(expect.arrayContaining(['difficulty.context', 'difficulty.intent']))
  })
})

describe('factions advisory checks', () => {
  const fac = (data: Record<string, any>) => {
    const p = empty()
    p.documents['design.factions'] = { moduleVersion: 2, data: { factions: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], thresholds: [], actions: [], relations: { cells: {} }, ...data } }
    return collectHints(makeContext(p, { docId: 'design.factions' })).map((h) => h.ruleId).filter((r) => r.startsWith('diplomacy.'))
  }

  it('stays quiet when there are no factions', () => {
    expect(fac({ factions: [] })).toEqual([])
  })

  it('flags incomplete profiles, missing levels and empty matrix cells', () => {
    expect(fac({})).toEqual(expect.arrayContaining(['diplomacy.profile', 'diplomacy.thresholds', 'diplomacy.matrix']))
  })

  it('flags threshold gaps, asymmetry, graph conflicts and missing spillover', () => {
    const r = fac({
      thresholds: [{ id: 't1', name: 'Low', min: -100, max: -20 }, { id: 't2', name: 'High', min: 20 }],
      relations: { cells: { 'a|b': -80, 'b|a': 30 } },
      relationGraph: { nodes: [{ id: 'n1', refId: 'a', kind: 'Faction', label: 'A' }, { id: 'n2', refId: 'b', kind: 'Faction', label: 'B' }], edges: [{ id: 'e', source: 'n1', target: 'n2', kind: 'Ally' }] },
      actions: [{ id: 'x', name: 'Help A', faction: 'a' }],
    })
    expect(r).toEqual(expect.arrayContaining(['diplomacy.ranges', 'diplomacy.asymmetry', 'diplomacy.graph', 'diplomacy.spillover']))
  })
})

describe('world advisory checks', () => {
  const world = (data: Record<string, any>) => {
    const p = empty()
    p.documents['design.world'] = { moduleVersion: 2, data: { biomes: [{ id: 'b1', name: 'Home', role: 'Starter' }, { id: 'b2', name: 'Marsh', role: 'Mid' }], progression: { nodes: [], edges: [] }, map: { items: [] }, outposts: [], ...data } }
    return collectHints(makeContext(p, { docId: 'design.world' })).map((h) => h.ruleId).filter((r) => r.startsWith('world.'))
  }

  it('stays quiet without biomes', () => {
    expect(world({ biomes: [] })).toEqual([])
  })

  it('flags unreachable biomes, missing entry, zones, enemies and outpost gaps', () => {
    expect(world({ outposts: [{ id: 'o', name: 'Fort' }] })).toEqual(
      expect.arrayContaining(['world.reach', 'world.entry', 'world.zones', 'world.enemies', 'world.outposts']),
    )
  })

  it('accepts optional biomes and flags a graph mismatch', () => {
    const r = world({
      biomes: [{ id: 'b1', name: 'Home', role: 'Starter' }, { id: 'b2', name: 'Marsh', role: 'Mid', entryType: 'Boss' }],
      progression: { nodes: [{ id: 'n1', refId: 'b1', kind: 'Biome', label: 'Home' }, { id: 'n2', refId: 'b2', kind: 'Biome', label: 'Marsh' }], edges: [{ id: 'e', source: 'n1', target: 'n2', kind: 'unlocks via story' }] },
    })
    expect(r).toContain('world.graph')
    expect(r).not.toContain('world.reach')
  })
})

describe('hint de-duplication and scope', () => {
  const withCoreLoop = () => {
    const p = empty()
    p.documents['design.coreLoop'] = { moduleVersion: 1, data: { loops: [{ id: 'a', name: 'Loop' }] } }
    return p
  }

  it('shows one Vision hint when the vision-first and onboarding hints point at the same doc', () => {
    const { all } = evaluateHints(makeContext(withCoreLoop()))
    const toVision = all.filter((h) => h.action?.kind === 'goto' && h.action.docId === 'overview.vision')
    expect(toVision.map((h) => h.ruleId)).toEqual(['dependency.visionFirst'])
  })

  it('never merges page-level hints that share a target', () => {
    const h = (id: string) => ({ id, ruleId: id, severity: 'suggest' as const, scope: 'section' as const, target: { docId: 'd', sectionId: 's' }, action: { kind: 'goto' as const, docId: 'd', sectionId: 's' } })
    expect(dedupeHints([h('a'), h('b')])).toHaveLength(2)
  })

  it('gives every onboarding step the same severity', () => {
    const steps = collectHints(makeContext(empty())).filter((h) => h.ruleId === 'onboarding.next')
    expect(new Set(steps.map((h) => h.severity))).toEqual(new Set(['info']))
  })

  it('splits hints into this page and other planners', () => {
    const p = withCoreLoop()
    const { all } = evaluateHints(makeContext(p, { docId: 'design.coreLoop' }))
    const { here, elsewhere } = splitByScope(all, { docId: 'design.coreLoop' })
    expect(here.length + elsewhere.length).toBe(all.length)
    expect(elsewhere.every((h) => h.scope === 'project' && h.target.docId !== 'design.coreLoop')).toBe(true)
    expect(here.some((h) => h.target.docId === 'design.coreLoop')).toBe(true)
    expect(elsewhere.some((h) => h.ruleId === 'dependency.visionFirst')).toBe(true)
  })
})
