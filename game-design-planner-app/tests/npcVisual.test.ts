import { describe, expect, it } from 'vitest'
import { collectHints, makeContext } from '../src/core/hints/engine'
import { moduleToMarkdown } from '../src/core/export/markdown'
import { createProject } from '../src/core/model/project'
import { getModule } from '../src/core/modules/registry'
import { bondLadder, eventOdds, lifespan, needChains, NPC_DOC, populationMix, routineStrips, workforceFlow } from '../src/core/npc'
import { TOWN_DOC } from '../src/core/town'

function project() {
  const p = createProject('T')
  p.registry.catalogs.npcStats = { label: 'NPC stats', items: [{ id: 'strength', label: 'Strength' }, { id: 'wit', label: 'Wit' }, { id: 'health', label: 'Health' }] }
  p.registry.catalogs.needs = { label: 'NPC needs', items: [{ id: 'food', label: 'Food' }, { id: 'housing', label: 'Housing' }] }
  p.registry.catalogs.resources = { label: 'Resources', items: [{ id: 'grain', label: 'Grain' }] }
  p.registry.catalogs.professions = { label: 'NPC professions', items: [{ id: 'farmer', label: 'Farmer' }, { id: 'miner', label: 'Miner' }] }
  p.registry.catalogs.timeOfDay = { label: 'Times of day', items: [{ id: 'day', label: 'Day' }, { id: 'night', label: 'Night' }] }
  p.documents[TOWN_DOC].data.buildings = [
    { id: 'farm', name: 'Farm', workers: ['farmer'] },
    { id: 'mine', name: 'Mine', workers: ['miner'] },
  ]
  const d = p.documents[NPC_DOC].data
  d.archetypes = [
    { id: 'a1', name: 'Farmer', profession: 'farmer', share: 75, needs: { food: 2 } },
    { id: 'a2', name: 'Miner', profession: 'miner', share: 25, needs: { food: 4, housing: 1 } },
  ]
  return p
}
const ruleIds = (p: ReturnType<typeof createProject>, docId = NPC_DOC) =>
  collectHints(makeContext(p, { docId }))
    .filter((h) => h.ruleId.startsWith('npc.'))
    .map((h) => h.ruleId)

describe('npc visual analysis', () => {
  it('sums the population mix and what is left to 100%', () => {
    const p = project()
    p.documents[NPC_DOC].data.archetypes[0].share = 60
    p.documents[NPC_DOC].data.archetypes[1].share = 30
    p.documents[NPC_DOC].data.archetypes.push({ id: 'a3', name: 'Kid' })
    const m = populationMix(p)
    expect([m.total, m.remainder]).toEqual([90, 10])
    expect(m.unset.map((a) => a.name)).toEqual(['Kid'])
  })

  it('lays life stages on the age axis and measures working age', () => {
    const p = project()
    p.documents[NPC_DOC].data.lifeStages = [
      { id: 'c', name: 'Child', ageFrom: 0, ageTo: 13, needModifier: -40, statModifiers: { strength: -50 } },
      { id: 'a', name: 'Adult', ageFrom: 14, ageTo: 59, canWork: true },
      { id: 'e', name: 'Elder', ageFrom: 60 },
    ]
    const l = lifespan(p)
    expect(l.rows.map((r) => [r.from, r.to])).toEqual([[0, 13], [14, 59], [60, 100]])
    // 46 working years (14…59) out of 101 ages (0…100).
    expect(l.workShare).toBeCloseTo(46 / 101)
    expect(l.rows[0].statModifiers).toEqual({ strength: -50 })
    expect(l.problems).toEqual([])
  })

  it('chains needs from share-weighted demand to supply and consequence', () => {
    const p = project()
    p.documents[NPC_DOC].data.needRules = [{ id: 'n1', need: 'food', resource: 'grain', graceDays: 2, consequence: 'Morale loss' }]
    const [food, housing] = needChains(p)
    // 75 farmers × 2 + 25 miners × 4 = 250 per 100 NPCs.
    expect(food).toMatchObject({ per100: 250, supply: ['Grain'], supplyKind: 'resource', status: 'ok', graceDays: 2 })
    expect(housing).toMatchObject({ per100: 25, status: 'noRule' })
  })

  it('maps the workforce and flags a building that does not employ the profession', () => {
    const p = project()
    p.documents[NPC_DOC].data.jobs = [{ id: 'j1', name: 'Field work', profession: 'farmer', buildings: ['farm', 'mine'] }]
    const f = workforceFlow(p)
    expect(f.links.filter((l) => l.mismatch)).toEqual([{ from: 'j:j1', to: 'b:mine', mismatch: true }])
    expect(f.links.find((l) => l.to === 'b:farm')?.mismatch).toBe(false)
    expect(f.jobless.map((x) => x.id)).toEqual(['miner'])
    expect(f.nodes.filter((n) => n.column === 0)).toHaveLength(2)
  })

  it('reads the routine matrix as strips', () => {
    const p = project()
    p.documents[NPC_DOC].data.routine = { cells: { 'farmer|day': 'Work', 'farmer|night': 'Sleep' } }
    const r = routineStrips(p)
    expect(r.rows.find((x) => x.profession.id === 'farmer')?.slots).toEqual(['Work', 'Sleep'])
    expect(r.rows.find((x) => x.profession.id === 'miner')?.slots).toEqual(['', ''])
  })

  it('pins bonds to their relationship level', () => {
    const p = project()
    const d = p.documents[NPC_DOC].data
    d.relationships = { start: 0 }
    d.relationLevels = [{ id: 'l1', name: 'Neutral', min: -100, max: 19 }, { id: 'l2', name: 'Friend', min: 20 }]
    d.bonds = [{ id: 'b1', name: 'Friends', requiresLevel: 'l2' }, { id: 'b2', name: 'Anyone' }]
    const b = bondLadder(p)
    expect(b.levels.map((l) => [l.name, l.to, l.bonds.map((x) => x.name)])).toEqual([['Neutral', 19, []], ['Friend', 100, ['Friends']]])
    expect(b.loose.map((x) => x.name)).toEqual(['Anyone'])
    expect(b.start).toBe(0)
  })

  it('estimates events per year with the cooldown cap', () => {
    const p = project()
    p.documents[NPC_DOC].data.events = [
      { id: 'e1', name: 'Daily', chance: 2, period: 'day' },
      { id: 'e2', name: 'Season', chance: 50, period: 'season' },
      { id: 'e3', name: 'Capped', chance: 10, period: 'day', cooldown: 30 },
      { id: 'e4', name: 'Once', chance: 100, period: 'once' },
      { id: 'e5', name: 'Weekly', chance: 70, period: 'week' },
    ]
    const rows = eventOdds(p, 360, 4)
    expect(rows.map((r) => r.perYear)).toEqual([7.2, 2, 12, null, expect.closeTo(36, 5)])
    expect(rows.map((r) => r.capped)).toEqual([false, false, true, false, false])
  })
})

describe('npc visual hints', () => {
  it('flags lifespans with no working stage, only in the NPC editor', () => {
    const p = project()
    p.documents[NPC_DOC].data.lifeStages = [{ id: 'c', name: 'Child', ageFrom: 0 }]
    expect(ruleIds(p)).toContain('npc.noWorkStage')
    expect(ruleIds(p, TOWN_DOC)).not.toContain('npc.noWorkStage')
    p.documents[NPC_DOC].data.lifeStages[0].canWork = true
    expect(ruleIds(p)).not.toContain('npc.noWorkStage')
  })

  it('flags bonds without a level only when levels exist', () => {
    const p = project()
    p.documents[NPC_DOC].data.bonds = [{ id: 'b', name: 'Friends' }]
    expect(ruleIds(p)).not.toContain('npc.bondLevel')
    p.documents[NPC_DOC].data.relationLevels = [{ id: 'l', name: 'Friend', min: 0 }]
    expect(ruleIds(p)).toContain('npc.bondLevel')
    p.documents[NPC_DOC].data.bonds[0].requiresLevel = 'l'
    expect(ruleIds(p)).not.toContain('npc.bondLevel')
  })

  it('flags events that fire more than weekly', () => {
    const p = project()
    p.documents[NPC_DOC].data.events = [{ id: 'e', name: 'Spam', chance: 50, period: 'day', effect: 'x' }]
    expect(ruleIds(p)).toContain('npc.eventFrequent')
    p.documents[NPC_DOC].data.events[0].cooldown = 30
    expect(ruleIds(p)).not.toContain('npc.eventFrequent')
  })

  it('flags professions with a job but no work slot, once the routine is started', () => {
    const p = project()
    p.documents[NPC_DOC].data.jobs = [{ id: 'j', name: 'Farm', profession: 'farmer', buildings: ['farm'] }]
    expect(ruleIds(p)).not.toContain('npc.routineWork')
    p.documents[NPC_DOC].data.routine = { cells: { 'farmer|night': 'Sleep' } }
    expect(ruleIds(p)).toContain('npc.routineWork')
    p.documents[NPC_DOC].data.routine.cells['farmer|day'] = 'Work'
    expect(ruleIds(p)).not.toContain('npc.routineWork')
  })

  it('stays quiet on an empty doc and never goes above suggest', () => {
    const p = createProject('T', false)
    expect(ruleIds(p)).toEqual([])
    const q = project()
    q.documents[NPC_DOC].data.lifeStages = [{ id: 'c', name: 'Child', ageFrom: 0 }]
    expect(collectHints(makeContext(q, { docId: NPC_DOC })).filter((h) => h.ruleId.startsWith('npc.')).every((h) => h.severity !== 'important')).toBe(true)
  })
})

describe('npc visual export', () => {
  it('adds mix, need chain, lifespan and event summaries', () => {
    const p = project()
    const d = p.documents[NPC_DOC].data
    d.needRules = [{ id: 'n1', need: 'food', resource: 'grain', consequence: 'Morale loss' }]
    d.lifeStages = [{ id: 'a', name: 'Adult', ageFrom: 0, canWork: true }]
    d.jobs = [{ id: 'j1', name: 'Field work', profession: 'farmer', buildings: ['mine'] }]
    d.events = [{ id: 'e', name: 'Fair', chance: 100, period: 'year' }]
    const md = moduleToMarkdown(p, getModule(NPC_DOC)!)
    expect(md).toContain('Population mix: Farmer 75%, Miner 25% (total 100%)')
    expect(md).toContain('| Food | 250 | Grain |')
    expect(md).toContain('working age 100% of a lifetime')
    expect(md).toContain('-.->|wrong workers|')
    expect(md).toContain('Fair ≈ 1')
  })
})
