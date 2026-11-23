import { describe, expect, it } from 'vitest'
import { buildReferenceSlice, IDS } from './fixtures/referenceSlice3d'
import { buildIR } from '../src/core/engine/ir'
import { buildBundle } from '../src/core/engine/bundle'
import { prototypeReport } from '../src/core/engine/capabilities'
import { combatRules } from '../src/core/gameplay'
import type { Entity, Project } from '../src/core/model/types'

/**
 * plans/UNITY_PLAYABLE_GAME_GENERATION_PLAN.md, phase 15: the first supported combat model (melee), from the Combat,
 * Items and Player data; values and consequences are exported for tests, and unsupported attack modes are reported.
 */
const AT = '2026-01-01T00:00:00.000Z'
const enemies = (p: Project) => p.documents['design.combat'].data.enemies as Entity[]
const items = (p: Project) => p.documents['design.items'].data.items as Entity[]
const proto = (p: Project) => p.documents['technical.architecture'].data.prototype as Record<string, unknown>
const unityFile = (p: Project, path: string) => buildBundle(p, 'unity', AT).files.find((f) => f.path === path)?.content
const report = (p: Project) => prototypeReport(p, 'unity').issues

describe('combat rules from the plan', () => {
  it('reads the player, the weapon, the formula and each placed enemy with its loot', () => {
    const { rules, issues } = combatRules(buildReferenceSlice())
    expect(issues).toEqual([])
    expect(rules).toEqual({
      player: { hp: 30, weapon: { item: IDS.itemStick, damage: 6, attackRate: 2 } },
      formula: 'attack * 100 / (100 + armor) * (1 - resist / 100) * crit',
      enemies: [{ enemy: IDS.enemy, name: 'Yard Rat', hp: 20, damage: 3, attackRate: 1, armor: 10, resistances: {}, speed: 2, passive: false, aggression: 'Territorial', sight: 6, giveUp: 10, xp: 5, loot: [{ item: IDS.itemCoin, count: 1 }] }],
      defaults: ['damage formula = attack * 100 / (100 + armor) * (1 - resist / 100) * crit'],
    })
  })

  it('fills visible defaults: player health, weapon rate, enemy speed', () => {
    const p = buildReferenceSlice()
    p.documents['design.player'].data.survival = []
    delete items(p).find((i) => i.id === IDS.itemStick)!.attackSpeed
    delete enemies(p)[0].speed
    const { rules } = combatRules(p)
    expect(rules.player.hp).toBe(100)
    expect(rules.player.weapon?.attackRate).toBe(1)
    expect(rules.enemies[0].speed).toBe(2)
    expect(rules.defaults).toEqual(expect.arrayContaining([expect.stringContaining('player health = 100'), expect.stringContaining('Stick attacks per second = 1'), expect.stringContaining('Yard Rat speed = 2 m/s')]))
  })

  it('reports an attack mode the prototype does not run, as a blocking problem', () => {
    const p = buildReferenceSlice()
    enemies(p)[0].role = 'Ranged'
    const e = report(p).find((i) => i.field === 'gameplay.attackUnsupported')
    expect(e?.level).toBe('error')
    expect(e?.message).toContain('Yard Rat is a Ranged enemy: the prototype only runs melee attacks')
    expect(e?.where).toEqual({ doc: 'design.combat', section: 'enemies', id: IDS.enemy, field: 'role' })
    expect(combatRules(p).rules.enemies).toEqual([])
  })

  it('needs HP, damage and attack rate on a placed enemy', () => {
    const p = buildReferenceSlice()
    delete enemies(p)[0].attackRate
    expect(combatRules(p).issues.map((i) => i.message)).toContain('Yard Rat is placed on a map but has no Attacks per second.')
  })

  it('checks the damage formula', () => {
    const p = buildReferenceSlice()
    p.documents['design.combat'].data.damageModel = { damageFormula: 'attack * luck' }
    expect(combatRules(p).issues.map((i) => i.code)).toContain('gameplay.damageFormulaVars')
    p.documents['design.combat'].data.damageModel = { damageFormula: 'attack *' }
    expect(combatRules(p).issues.map((i) => i.code)).toContain('gameplay.damageFormula')
  })

  it('says what it does not run: crits, status effects, weighted loot, attack patterns', () => {
    const p = buildReferenceSlice()
    p.documents['design.combat'].data.damageModel = { critChance: 10 }
    p.documents['design.combat'].data.statusEffects = [{ id: 's1', name: 'Bleed' }]
    ;(p.documents['design.items'].data.loot as Entity[])[0].weights = { [IDS.itemKey]: 1 }
    enemies(p)[0].pattern = 'Bites twice'
    const codes = combatRules(p).issues.filter((i) => i.level === 'info').map((i) => i.code)
    expect(codes).toEqual(expect.arrayContaining(['gameplay.combatUnchecked', 'gameplay.lootRolls', 'gameplay.enemyUnchecked']))
  })
})

describe('combat in the capability matrix', () => {
  it('is a working module in Unity, and the reference stays playable', () => {
    const r = prototypeReport(buildReferenceSlice(), 'unity')
    expect(r.systems.find((s) => s.id === 'combat')?.level).toBe('template')
    expect(r.playable).toBe(true)
  })

  it('needs a placed enemy, a Player weapon and an Attack control', () => {
    const p = buildReferenceSlice()
    delete proto(p).weapon
    for (const c of p.documents['design.ui'].data.controls as Record<string, unknown>[]) if (c.drives === 'Attack') delete c.drives
    const missing = report(p).filter((i) => i.code === 'proto.dataMissing' && i.field === 'combat').map((i) => i.where?.field)
    expect(missing).toEqual(['weapon', 'drives'])
  })

  it('needs interaction and the inventory when an enemy drops loot, and a Combat save part when saving', () => {
    const p = buildReferenceSlice()
    proto(p).interaction = false
    expect(report(p)).toContainEqual(expect.objectContaining({ code: 'proto.requires', field: 'combat', where: expect.objectContaining({ field: 'interaction' }) }))
    const q = buildReferenceSlice()
    q.documents['technical.save'].data.parts = (q.documents['technical.save'].data.parts as Entity[]).filter((x) => x.state !== 'Combat')
    expect(report(q).some((i) => i.code === 'proto.dataMissing' && i.message.includes('Runtime state is Combat'))).toBe(true)
  })
})

describe('Unity export of combat', () => {
  it('carries the combat rules and the enemy placement in the IR', () => {
    const g = buildIR(buildReferenceSlice()).ir.gameplay!
    expect(g.combat?.player).toEqual({ hp: 30, attackRange: 1.5, weapon: { item: IDS.itemStick, key: 'item.stick', damage: 6, attackRate: 2 } })
    expect(g.combat?.enemies[0].loot).toEqual([{ item: IDS.itemCoin, key: 'item.coin', count: 1 }])
    expect(g.placements.find((x) => x.role === 'enemy')).toMatchObject({ object: IDS.enemySpawn, enemy: IDS.enemy })
  })

  it('generates the plan’s damage formula in C#, and the expected hits worked out by the planner', () => {
    const p = buildReferenceSlice()
    const formula = unityFile(p, 'Unity/Scripts/Generated/Combat/PlannerDamageFormula.cs')!
    expect(formula).toContain('public sealed class PlannerDamageFormula : UnityEngine.MonoBehaviour, global::HoHPlanner.Runtime.IPlannerDamageFormula')
    expect(formula).toMatch(/public float Damage\(float attack, float armor, float resist, float crit\) => attack \* 100f? \/ \(100f? \+ armor\) \* \(1f? - resist \/ 100f?\) \* crit;/)
    const config = unityFile(p, 'Unity/Scripts/Generated/Gameplay/PlannerGameplay.cs')!
    // 6 × 100 / 110 = 5.454545 per player hit, 3 per rat hit.
    expect(config).toContain(`("${IDS.enemySpawn}", "${IDS.enemy}", "Yard Rat", 20f, 5.454545f, 3f, 5, false, new (string, int)[] { ("${IDS.itemCoin}", 1) }, 6f, 10f, 3)`)
    expect(config).toContain('public const string AttackKey = "f";')
    expect(config).toContain('public const float PlayerHp = 30.0f;')
  })

  it('binds the Attack key and tests the encounter, the respawn and the saved fight in the scene', () => {
    const p = buildReferenceSlice()
    const map = JSON.parse(unityFile(p, 'Unity/Input/ReferenceSlice3D.inputactions')!).maps.find((m: { name: string }) => m.name === 'Prototype')
    expect(map.bindings.find((b: { action: string }) => b.action === 'Attack').path).toBe('<Keyboard>/f')
    const test = unityFile(p, 'Unity/Tests/PlayMode/PlannerPrototypeSceneTests.cs')!
    for (const t of ['TheEncounterPlaysAsPlanned', 'ADefeatedPlayerIsBackAtTheStart', 'TheFightIsTheSameAfterSavingAndLoading']) expect(test).toContain(t)
  })

  it('has no damage formula or combat test without the Combat system', () => {
    const p = buildReferenceSlice()
    proto(p).combat = false
    ;(p.documents['technical.save'].data.parts as Entity[]).pop()
    expect(unityFile(p, 'Unity/Scripts/Generated/Combat/PlannerDamageFormula.cs')).toBeUndefined()
    expect(unityFile(p, 'Unity/Tests/PlayMode/PlannerPrototypeSceneTests.cs')).not.toContain('TheEncounterPlaysAsPlanned')
  })
})
