import { describe, expect, it } from 'vitest'
import { collectHints, makeContext } from '../src/core/hints/engine'
import { moduleToMarkdown } from '../src/core/export/markdown'
import { createProject, makeId } from '../src/core/model/project'
import { ensureDocument, getModule, getSections } from '../src/core/modules/registry'
import {
  evaluateFor,
  formulaProblems,
  jobBuildingMismatches,
  lifecycleIssues,
  NPC_DOC,
  needsBalance,
  rangeProblems,
  stageAnalysis,
  statVar,
  statsOutOfRange,
} from '../src/core/npc'
import { TOWN_DOC } from '../src/core/town'

const npc = getModule(NPC_DOC)!

function npcProject() {
  const p = createProject('T')
  p.registry.catalogs.npcStats = { label: 'NPC stats', items: [{ id: 'strength', label: 'Strength' }, { id: 'quick-wit', label: 'Quick wit' }, { id: 'health', label: 'Health' }] }
  p.registry.catalogs.needs = { label: 'NPC needs', items: [{ id: 'food', label: 'Food' }, { id: 'housing', label: 'Housing' }] }
  p.registry.catalogs.resources = { label: 'Resources', items: [{ id: 'food', label: 'Food' }] }
  p.registry.catalogs.professions = { label: 'NPC professions', items: [{ id: 'farmer', label: 'Farmer' }, { id: 'miner', label: 'Miner' }] }
  const town = p.documents[TOWN_DOC].data
  town.buildings = [
    { id: 'farm', name: 'Farm', count: 2, cycle: 1, outputs: { food: 3 }, workers: ['farmer'] },
    { id: 'house', name: 'House', count: 3, capacity: 4 },
  ]
  const d = p.documents[NPC_DOC].data
  d.archetypes = [
    { id: 'a1', name: 'Farmer', profession: 'farmer', share: 60, stats: { strength: 6, 'quick-wit': 3 }, needs: { food: 2, housing: 1 } },
    { id: 'a2', name: 'Miner', profession: 'miner', share: 40, stats: { strength: 8 }, needs: { food: 3, housing: 1 } },
  ]
  return p
}
const hints = (p: ReturnType<typeof createProject>) =>
  collectHints(makeContext(p, { docId: NPC_DOC })).filter((h) => h.ruleId.startsWith('npc.'))
const ruleIds = (p: ReturnType<typeof createProject>) => hints(p).map((h) => h.ruleId)

describe('npc module v2', () => {
  it('migrates the v1 "Other" form into its own sections', () => {
    const p = createProject('t')
    p.documents[NPC_DOC] = { moduleVersion: 1, data: { archetypes: [{ id: 'x', name: 'Old', stats: { strength: 4 } }], misc: { equipment: 'Two hands', mercenaries: 'Hire at tavern', ai: 'Utility AI', generation: 'Random names' } } }
    const doc = ensureDocument(p, npc, makeId)
    expect(doc.moduleVersion).toBe(2)
    expect(doc.data.misc).toBeUndefined()
    expect(doc.data.equipmentRules.notes).toBe('Two hands')
    expect(doc.data.mercenaries.notes).toBe('Hire at tavern')
    expect(doc.data.behaviour.routine).toBe('Utility AI')
    expect(doc.data.generation.notes).toBe('Random names')
    expect(doc.data.archetypes[0].stats.strength).toBe(4)
    expect(doc.data.scenarios).toEqual([])
  })

  it('exports in the order of the npc_system.md outline', () => {
    const heads = moduleToMarkdown(npcProject(), npc).split('\n').filter((l) => l.startsWith('## ')).map((l) => l.replace(/^## \d+\. /, ''))
    const order = ['Overview', 'Stats', 'Needs', 'Life stages', 'Work and professions', 'Relationships', 'Random events', 'Equipment', 'Mercenary armies', 'Behaviour (AI)', 'Generation, names and appearance']
    const positions = order.map((h) => heads.indexOf(h))
    expect(positions.every((i) => i >= 0)).toBe(true)
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
  })

  it('shows life stages on a ranges view instead of the timeline', () => {
    const sec = getSections(npc, createProject('t').registry).find((s) => s.id === 'lifeStages')!
    // The visual Lifespan view was added in front of the table (NPC visual-editor upgrade).
    expect(sec.kind === 'collection' && sec.views.map((v) => v.kind)).toEqual(['npcLifespan', 'table', 'ranges'])
  })

  it('evaluates formulas with kebab-case stat ids, level and age', () => {
    const p = npcProject()
    const farmer = p.documents[NPC_DOC].data.archetypes[0]
    expect(statVar('quick-wit')).toBe('quick_wit')
    expect(evaluateFor(p, 'strength * 2 + quick_wit + level', farmer, { level: 3 })).toEqual({ ok: true, value: 18 })
    // unset stats count as the bottom of the scale
    expect(evaluateFor(p, 'health', farmer)).toEqual({ ok: true, value: 0 })
    p.documents[NPC_DOC].data.statRules = [{ id: 'r', name: 'Carry', stat: 'strength', formula: 'strength + agility' }]
    expect(formulaProblems(p).map((x) => x.error)).toEqual(['Unknown variable agility'])
  })

  it('flags stats outside the overview scale', () => {
    const p = npcProject()
    expect(statsOutOfRange(p)).toEqual([])
    p.documents[NPC_DOC].data.overview = { statMin: 0, statMax: 5 }
    expect(statsOutOfRange(p).map((a) => a.name)).toEqual(['Farmer', 'Miner'])
  })

  it('balances daily needs against Town supply', () => {
    const p = npcProject()
    p.documents[NPC_DOC].data.needRules = [
      { id: 'n1', name: 'Food', need: 'food', resource: 'food' },
      { id: 'n2', name: 'Housing', need: 'housing', buildings: ['house'] },
    ]
    p.documents[NPC_DOC].data.overview = { unitsPerDay: 2 }
    const b = needsBalance(p, { id: 's', name: 'Early', population: { a1: 4, a2: 2 } })
    expect(b.population).toBe(6)
    const food = b.rows.find((r) => r.needId === 'food')!
    // demand 4×2 + 2×3 = 14; supply 2 farms × 3 per unit × 2 units per day = 12
    expect(food).toMatchObject({ demand: 14, supply: 12, basis: 'resource', short: true })
    // 3 houses × 4 places
    expect(b.rows.find((r) => r.needId === 'housing')).toMatchObject({ demand: 6, supply: 12, basis: 'capacity', short: false })
  })

  it('checks the life cycle graph and life stage ranges', () => {
    const p = npcProject()
    const d = p.documents[NPC_DOC].data
    expect(lifecycleIssues(p)).toBeNull()
    d.lifeStages = [{ id: 'child', name: 'Child', ageFrom: 0, ageTo: 15 }, { id: 'adult', name: 'Adult', ageFrom: 18 }]
    expect(rangeProblems(stageAnalysis(p))).toEqual(['gap before Adult'])
    d.lifecycle = {
      nodes: [
        { id: 's', kind: 'Start', label: 'Born', x: 0, y: 0 },
        { id: 'c', kind: 'State', label: 'Child', refId: 'child', x: 0, y: 0 },
        { id: 'lost', kind: 'State', label: 'Lost', x: 0, y: 0 },
      ],
      edges: [{ id: 'e1', source: 's', target: 'c', kind: 'on event' }],
    }
    const l = lifecycleIssues(p)!
    expect(l.noStart).toBe(false)
    expect(l.noEnd).toBe(true)
    expect(l.unreachable.map((n) => n.label)).toEqual(['Lost'])
    expect(l.deadEnds.map((n) => n.label)).toEqual(['Child', 'Lost'])
    expect(l.eventEdgesWithoutEvent).toBe(1)
    expect(l.stagesMissing.map((s) => s.name)).toEqual(['Adult'])
  })

  it('cross-checks jobs with Town worker professions', () => {
    const p = npcProject()
    p.documents[NPC_DOC].data.jobs = [{ id: 'j', name: 'Mining', profession: 'miner', buildings: ['farm'] }]
    expect(jobBuildingMismatches(p).map((m) => m.building.name)).toEqual(['Farm'])
  })
})

describe('npc design checks', () => {
  it('stays quiet on an empty document and outside the NPC editor', () => {
    const p = createProject('T', false)
    ensureDocument(p, npc, makeId)
    expect(ruleIds(p)).toEqual([])
    expect(collectHints(makeContext(npcProject(), { docId: 'design.world' })).filter((h) => h.ruleId.startsWith('npc.'))).toEqual([])
  })

  it('flags missing rules, out-of-range stats, stage gaps, life cycle and balance problems', () => {
    const p = npcProject()
    const d = p.documents[NPC_DOC].data
    d.overview = { statMin: 0, statMax: 5 }
    d.needRules = [{ id: 'n1', name: 'Food', need: 'food', resource: 'food' }]
    d.lifeStages = [{ id: 'child', name: 'Child', ageFrom: 0, ageTo: 15 }, { id: 'adult', name: 'Adult', ageFrom: 18 }]
    d.lifecycle = { nodes: [{ id: 'x', kind: 'State', label: 'Alive', x: 0, y: 0 }], edges: [] }
    d.events = [{ id: 'e', name: 'Wedding', category: 'Marriage' }]
    d.scenarios = [{ id: 's', name: 'Big town', population: { a1: 20 } }]
    d.archetypes[1].share = 30
    expect(ruleIds(p)).toEqual(
      expect.arrayContaining(['npc.statCoverage', 'npc.needCoverage', 'npc.needConsequence', 'npc.statRange', 'npc.stages', 'npc.lifecycle', 'npc.professions', 'npc.shares', 'npc.events', 'npc.balance']),
    )
  })

  it('does not flag a complete, balanced setup', () => {
    const p = npcProject()
    const d = p.documents[NPC_DOC].data
    d.statRules = [{ id: 'r1', stat: 'strength', formula: 'strength * 2' }, { id: 'r2', stat: 'quick-wit' }, { id: 'r3', stat: 'health' }]
    d.needRules = [
      { id: 'n1', need: 'food', resource: 'food', consequence: 'Morale loss' },
      { id: 'n2', need: 'housing', buildings: ['house'], consequence: 'Leaves town' },
    ]
    d.jobs = [{ id: 'j1', profession: 'farmer', buildings: ['farm'] }, { id: 'j2', profession: 'miner' }]
    d.lifeStages = [{ id: 'child', name: 'Child', ageFrom: 0, ageTo: 17 }, { id: 'adult', name: 'Adult', ageFrom: 18, canWork: true }] // canWork: a stage that never works now gets a tip
    d.lifecycle = {
      nodes: [
        { id: 's', kind: 'Start', label: 'Born', x: 0, y: 0 },
        { id: 'c', kind: 'State', label: 'Child', refId: 'child', x: 0, y: 0 },
        { id: 'a', kind: 'State', label: 'Adult', refId: 'adult', x: 0, y: 0 },
        { id: 'end', kind: 'End', label: 'Dies', x: 0, y: 0 },
      ],
      edges: [
        { id: 'e1', source: 's', target: 'c' },
        { id: 'e2', source: 'c', target: 'a' },
        { id: 'e3', source: 'a', target: 'end' },
      ],
    }
    d.events = [{ id: 'e', name: 'Wedding', chance: 5, effect: 'Two NPCs marry' }]
    d.scenarios = [{ id: 's', name: 'Small', population: { a1: 2 } }]
    expect(ruleIds(p)).toEqual([])
  })

  it('never exceeds suggest severity', () => {
    const p = npcProject()
    p.documents[NPC_DOC].data.overview = { statMax: 1 }
    expect(hints(p).every((h) => h.severity !== 'important')).toBe(true)
  })
})
