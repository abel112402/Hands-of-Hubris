import { describe, expect, it } from 'vitest'
import { collectHints, makeContext } from '../src/core/hints/engine'
import { moduleToMarkdown } from '../src/core/export/markdown'
import { createProject, makeId } from '../src/core/model/project'
import { ensureDocument, getModule } from '../src/core/modules/registry'
import {
  bossGates,
  COMBAT_DOC,
  damagePerHit,
  fighterOf,
  immuneFighters,
  phaseCoverage,
  threatRamp,
  timeToDie,
  timeToKill,
  variantFighter,
} from '../src/core/combat'

const combat = getModule(COMBAT_DOC)!

function combatProject() {
  const p = createProject('T')
  p.documents['design.world'].data.biomes = [
    { id: 'start', name: 'Shore', role: 'Starter' },
    { id: 'marsh', name: 'Marsh', role: 'Mid', entryBosses: ['b1'] },
  ]
  p.documents['design.items'].data.items = [{ id: 'sword', name: 'Sword', type: 'weapon', damage: 20, attackSpeed: 1, damageType: 'physical' }]
  p.documents['design.player'].data.abilities = []
  const d = p.documents[COMBAT_DOC].data
  d.enemies = [{ id: 'e1', name: 'Crab', biome: 'start', hp: 100, armor: 100, damage: 10, attackRate: 1 }]
  d.loadouts = [{ id: 'l1', name: 'Soldier', level: 1, weapon: 'sword', hp: 100 }]
  return p
}
const ruleIds = (p: ReturnType<typeof createProject>) =>
  collectHints(makeContext(p, { docId: COMBAT_DOC })).filter((h) => h.ruleId.startsWith('combat.')).map((h) => h.ruleId)

describe('combat module v2', () => {
  it('migrates drops, boss texts and status text into notes', () => {
    const p = createProject('t')
    p.documents[COMBAT_DOC] = {
      moduleVersion: 1,
      data: {
        system: { model: 'Action', status: 'Burn, poison' },
        enemies: [{ id: 'e', name: 'Wolf', hp: 40, drops: ['Fang', 'Hide'] }],
        bosses: [{ id: 'b', name: 'Hydra', unlocks: 'Marsh', reward: 'Scale', phases: 'Three heads' }],
      },
    }
    const doc = ensureDocument(p, combat, makeId)
    expect(doc.moduleVersion).toBe(2)
    expect(doc.data.system).toEqual({ model: 'Action', statusNotes: 'Burn, poison' })
    expect(doc.data.enemies[0]).toEqual({ id: 'e', name: 'Wolf', hp: 40, legacyNotes: 'Drops: Fang, Hide' })
    expect(doc.data.bosses[0]).toEqual({ id: 'b', name: 'Hydra', unlockNotes: 'Marsh', rewardNotes: 'Scale', phaseNotes: 'Three heads' })
    expect(doc.data.loadouts).toEqual([])
  })

  it('exports in the order of combat_enemies.md with sheets and a time-to-kill table', () => {
    const md = moduleToMarkdown(combatProject(), combat)
    const heads = md.split('\n').filter((l) => l.startsWith('## ')).map((l) => l.replace(/^## \d+\. /, ''))
    const order = ['Combat system', 'Damage and defense model', 'Enemies', 'Bosses', 'Night and event variants', 'NPC combat and sieges']
    const pos = order.map((h) => heads.indexOf(h))
    expect(pos.every((i) => i >= 0)).toBe(true)
    expect([...pos].sort((a, b) => a - b)).toEqual(pos)
    expect(md).toContain('* **Crab:** Shore · HP 100, damage 10 × 1/s, armor 100 · drops: none')
    expect(md).toContain('(20 attack against 100 armor: 10 per hit)')
    expect(md).toContain('| Soldier | 10 / 10 |')
  })

  it('applies armor, resistance and weakness in the damage formula', () => {
    const p = combatProject()
    expect(damagePerHit(p, 20, { armor: 100, resistances: {}, weaknesses: [] })).toBe(10)
    expect(damagePerHit(p, 20, { armor: 0, resistances: { fire: 50 }, weaknesses: [] }, 'fire')).toBe(10)
    expect(damagePerHit(p, 20, { armor: 0, resistances: {}, weaknesses: ['fire'] }, 'fire')).toBe(25)
    p.documents[COMBAT_DOC].data.damageModel = { damageFormula: 'attack - armor' }
    expect(damagePerHit(p, 20, { armor: 5, resistances: {}, weaknesses: [] })).toBe(15)
  })

  it('computes time to kill and die with difficulty and night multipliers', () => {
    const p = combatProject()
    const crab = fighterOf(p.documents[COMBAT_DOC].data.enemies[0])
    const l = p.documents[COMBAT_DOC].data.loadouts[0]
    expect(timeToKill(p, l, crab)).toMatchObject({ hits: 10, seconds: 10, perHit: 10, source: 'Sword' })
    expect(timeToDie(p, l, crab)).toMatchObject({ hits: 10, seconds: 10 })
    const params = p.documents['design.difficulty'].data.params
    const hp = params.find((x: any) => /enemy hp/i.test(x.name))
    p.documents['design.difficulty'].data.values = { cells: { [`${hp.id}|hard`]: 2 * (hp.baseline ?? 1) } }
    p.documents[COMBAT_DOC].data.damageModel = { hpParam: hp.id, useNightStrength: true }
    expect(timeToKill(p, l, crab, { levelId: 'hard' })!.seconds).toBe(20)
    p.documents['design.timeWeather'].data.dayPhases = [{ id: 'n', name: 'Night', monsterStrength: 1.5 }]
    expect(timeToDie(p, l, crab, { night: true })).toMatchObject({ perHit: 15, hits: 7, seconds: 7 })
    p.documents[COMBAT_DOC].data.variants = [{ id: 'v', name: 'Night crab', base: 'e1', hpMult: 2 }]
    expect(variantFighter(p, p.documents[COMBAT_DOC].data.variants[0])!.hp).toBe(200)
  })

  it('finds threat dips, immune enemies, phase gaps and boss gates', () => {
    const p = combatProject()
    const d = p.documents[COMBAT_DOC].data
    d.enemies.push({ id: 'e2', name: 'Frog', biome: 'marsh', hp: 50, damage: 5, attackRate: 1 }, { id: 'e3', name: 'Golem', biome: 'marsh', hp: 900, damage: 9, resistances: { physical: 100 } })
    expect(threatRamp(p).dips.map((x) => x.enemy.id)).toEqual(['e2'])
    expect(immuneFighters(p).map((e) => e.id)).toEqual(['e3'])
    d.bosses = [{ id: 'b1', name: 'Hydra' }]
    d.phases = [
      { id: 'p1', boss: 'b1', name: 'A', hpFrom: 100, hpTo: 60, mechanics: 'x' },
      { id: 'p2', boss: 'b1', name: 'B', hpFrom: 50, hpTo: 0, mechanics: 'y' },
    ]
    expect(phaseCoverage(p, 'b1').gaps).toEqual([[60, 50]])
    d.phases[1].hpFrom = 70
    expect(phaseCoverage(p, 'b1')).toMatchObject({ gaps: [], overlaps: [[70, 60]] })
    expect(bossGates(p, 'b1')).toEqual(['Marsh (entry)'])
  })
})

describe('combat design checks', () => {
  it('stays quiet on an empty document and in other editors', () => {
    const p = createProject('T', false)
    ensureDocument(p, combat, makeId)
    expect(ruleIds(p)).toEqual([])
    expect(collectHints(makeContext(combatProject(), { docId: 'design.world' })).filter((h) => h.ruleId.startsWith('combat.'))).toEqual([])
  })

  it('does not flag a balanced setup with loot', () => {
    const p = combatProject()
    p.documents['design.items'].data.loot = [{ id: 'l', name: 'Crab loot', sources: ['e1'], weights: { sword: 1 } }]
    expect(ruleIds(p)).toEqual([])
  })

  it('flags basics, pacing, ramp, immunity, loot, phases, gates, variants, status and formula', () => {
    const p = combatProject()
    const d = p.documents[COMBAT_DOC].data
    d.enemies.push(
      { id: 'e2', name: 'Frog', biome: 'marsh', hp: 50, damage: 5, attackRate: 1 },
      { id: 'e3', name: 'Golem', biome: 'marsh', hp: 90000, damage: 900, attackRate: 1, resistances: { physical: 100 } },
      { id: 'e4', name: 'Blob' },
    )
    d.bosses = [{ id: 'b2', name: 'Lonely' }]
    d.variants = [{ id: 'v', name: 'Ghost' }]
    d.statusEffects = [{ id: 's', name: 'Burn', tickDamage: 2 }]
    d.damageModel = { damageFormula: 'attack * nope' }
    expect(ruleIds(p)).toEqual(
      expect.arrayContaining(['combat.enemyBasics', 'combat.threatRamp', 'combat.immune', 'combat.noLoot', 'combat.phases', 'combat.bossGates', 'combat.variants', 'combat.status', 'combat.formula']),
    )
    d.damageModel = {}
    expect(ruleIds(p)).toContain('combat.ttk')
  })

  it('never exceeds suggest severity', () => {
    const p = combatProject()
    p.documents[COMBAT_DOC].data.damageModel = { damageFormula: '(' }
    expect(collectHints(makeContext(p, { docId: COMBAT_DOC })).filter((h) => h.ruleId.startsWith('combat.')).every((h) => h.severity !== 'important')).toBe(true)
  })
})
