import { describe, expect, it } from 'vitest'
import { buildReferenceSlice, IDS } from './fixtures/referenceSlice3d'
import { buildBundle } from '../src/core/engine/bundle'
import { buildIR } from '../src/core/engine/ir'
import { prototypeReport } from '../src/core/engine/capabilities'
import { progressionRules, timeRules, tradeRules } from '../src/core/gameplay'
import { withoutSystems } from '../scripts/unityGate'
import type { Entity, Project } from '../src/core/model/types'

/**
 * plans/UNITY_PLAYABLE_GAME_GENERATION_PLAN.md, phase 20: progression, trading and day and night as separately
 * selectable modules, each with its minimal rules from existing planner data, its acceptance test and its save;
 * settlement's rules are fixed but it is not supported yet.
 */
const AT = '2026-01-01T00:00:00.000Z'
const proto = (p: Project) => p.documents['technical.architecture'].data.prototype as Record<string, unknown>
const errors = (p: Project) => prototypeReport(p, 'unity').issues.filter((i) => i.level === 'error')
const file = (p: Project, path: string) => buildBundle(p, 'unity', AT).files.find((f) => f.path === path)?.content ?? ''
const SCENE_TEST = 'Unity/Tests/PlayMode/PlannerPrototypeSceneTests.cs'
const leveling = (p: Project) => p.documents['design.player'].data.leveling as Record<string, unknown>

describe('player progression', () => {
  it('works out the XP table from the plan’s formula up to the cap', () => {
    expect(progressionRules(buildReferenceSlice()).rules).toEqual({ levelCap: 5, xpToNext: [10, 20, 30, 40], skillPointsPerLevel: 1, statPointsPerLevel: 2, startSkillPoints: 0, defaults: [] })
  })

  it('reports a formula with other variables or below 1, and fills the cap visibly', () => {
    const p = buildReferenceSlice()
    leveling(p).xpFormula = 'level * strength'
    expect(progressionRules(p).issues.map((i) => i.code)).toEqual(['gameplay.xpFormulaVars'])
    leveling(p).xpFormula = '1 - level'
    expect(progressionRules(p).issues.map((i) => i.code)).toEqual(['gameplay.xpFormulaValue'])
    delete leveling(p).levelCap
    leveling(p).xpFormula = '10'
    expect(progressionRules(p).rules).toMatchObject({ levelCap: 10, defaults: ['level cap = 10'] })
  })

  it('needs an XP source: quests or combat', () => {
    const p = buildReferenceSlice()
    withoutSystems(['quests', 'combat', 'crafting', 'dialogue'])(p)
    expect(errors(p)).toEqual([expect.objectContaining({ code: 'proto.requires', field: 'progression' })])
  })
})

describe('trading', () => {
  it('prices the peddler’s goods by Value × markup and what it buys by Value × buyback, leaving out items without a value', () => {
    const { rules, issues } = tradeRules(buildReferenceSlice())
    expect(rules).toEqual({ startMoney: 10, walletCap: 999, merchants: [{ merchant: IDS.merchant, name: 'Peddler', sells: [{ item: IDS.itemStick, price: 6 }], buys: [{ item: IDS.itemStick, price: 2 }, { item: IDS.itemPolished, price: 2 }], gold: 20 }] })
    expect(issues).toEqual([])
  })

  it('reports an unknown merchant on a map, goods without a value, and a merchant that trades nothing', () => {
    const p = buildReferenceSlice()
    const m = (p.documents['design.trade'].data.merchants as Entity[])[0]
    m.goods = [IDS.itemKey]
    m.buys = []
    expect(tradeRules(p).issues.map((i) => [i.level, i.code])).toEqual([['info', 'gameplay.noValue'], ['error', 'gameplay.merchantEmpty']])
  })

  it('needs interaction and the inventory', () => {
    const p = buildReferenceSlice()
    proto(p).inventory = false
    expect(errors(p).filter((i) => i.field === 'trade').map((i) => i.where?.field)).toEqual(['inventory'])
  })
})

describe('day and night', () => {
  it('reads the day length and the phases, with the start hour as a visible default', () => {
    const { rules, issues } = timeRules(buildReferenceSlice())
    expect(rules).toEqual({
      dayMinutes: 4,
      startHour: 8,
      phases: [
        { phase: IDS.dayPhase, name: 'Day', start: 6, duration: 12, visibility: 100, strength: 1 },
        { phase: IDS.nightPhase, name: 'Night', start: 18, duration: 12, visibility: 35, strength: 1.5 },
      ],
      defaults: ['start hour = 8:00'],
    })
    expect(issues).toEqual([])
  })

  it('warns about overlapping phases and uncovered hours, and needs the day length', () => {
    const p = buildReferenceSlice()
    ;(p.documents['design.timeWeather'].data.dayPhases as Entity[])[1].duration = 6
    expect(timeRules(p).issues.map((i) => i.code)).toEqual(['gameplay.phaseGap'])
    ;(p.documents['design.timeWeather'].data.dayPhases as Entity[])[1].duration = 14
    expect(timeRules(p).issues.map((i) => i.code)).toEqual(['gameplay.phaseOverlap'])
    p.documents['design.timeWeather'].data.time = {}
    expect(errors(p).map((i) => i.field)).toContain('time')
  })
})

describe('settlement', () => {
  it('is not supported yet, and says what is missing instead of guessing', () => {
    const p = buildReferenceSlice()
    proto(p).settlement = true
    const e = errors(p).find((i) => i.code === 'proto.unsupported' && i.field === 'settlement')!
    expect(e.message).toContain('Production cycle')
    expect(e.message).toContain('nothing is guessed')
  })
})

describe('each module on its own', () => {
  it.each([['progression'], ['trade'], ['time'], ['progression', 'trade', 'time']])('without %s the rest still exports playable, without its test and saved part', (...off) => {
    const p = buildReferenceSlice()
    withoutSystems(off)(p)
    expect(errors(p)).toEqual([])
    const test = file(p, SCENE_TEST)
    if (off.includes('progression')) expect(test).not.toContain('XpFromPlayingRaisesTheLevel')
    if (off.includes('trade')) expect(test).not.toContain('TheMerchantBuysAndSellsAtThePlannedPrices')
    if (off.includes('time')) expect(test).not.toContain('TheClockRunsAtThePlannedDayLength')
    const linked = buildIR(p).ir.gameplay!.save!.parts.map((x) => x.state)
    for (const [system, state] of [['progression', 'Progression'], ['trade', 'Trade'], ['time', 'Time']]) expect(linked.includes(state as never)).toBe(!off.includes(system))
  })

  it('the full reference tests all three and their save', () => {
    const test = file(buildReferenceSlice(), SCENE_TEST)
    for (const t of ['XpFromPlayingRaisesTheLevel', 'TheMerchantBuysAndSellsAtThePlannedPrices', 'TheClockRunsAtThePlannedDayLength', 'TheEconomyIsTheSameAfterSavingAndLoading']) expect(test).toContain(t)
    const config = file(buildReferenceSlice(), 'Unity/Scripts/Generated/Gameplay/PlannerGameplay.cs')
    expect(config).toContain('XpToNext = { 10, 20, 30, 40 };')
    expect(config).toContain(`("${IDS.merchantSpot}", "${IDS.merchant}", "Peddler", new (string, int)[] { ("${IDS.itemStick}", 6) }`)
    expect(config).toContain(`("${IDS.nightPhase}", "Night", 18.0f, 12.0f, 35.0f, 1.5f)`)
  })
})
