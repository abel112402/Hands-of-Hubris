import { describe, expect, it } from 'vitest'
import { buildReferenceSlice, IDS } from './fixtures/referenceSlice3d'
import { buildBundle } from '../src/core/engine/bundle'
import { prototypeReport } from '../src/core/engine/capabilities'
import { handWork } from '../src/core/engine/handWork'
import { buildIR } from '../src/core/engine/ir'
import { coverageOf, renderMarkdown, withoutSystems, type GateReport } from '../scripts/unityGate'
import type { Entity, Project } from '../src/core/model/types'

/**
 * plans/UNITY_PLAYABLE_GAME_GENERATION_PLAN.md, phase 17: the extended prototype gate. The reference has crafting,
 * combat and an NPC; each module still works when chosen separately; the player can save and load while playing;
 * the export says what is a placeholder or manual work; and the gate wants evidence of every chosen system.
 */
const AT = '2026-01-01T00:00:00.000Z'
const bundle = (p: Project) => buildBundle(p, 'unity', AT)
const errors = (p: Project) => bundle(p).issues.filter((i) => i.level === 'error')
const file = (p: Project, path: string) => bundle(p).files.find((f) => f.path === path)?.content ?? ''
const without = (...systems: string[]) => {
  const p = buildReferenceSlice()
  withoutSystems(systems)(p)
  return p
}
const SCENE_TEST = 'Unity/Tests/PlayMode/PlannerPrototypeSceneTests.cs'

describe('modules stay separately selectable', () => {
  it('the full reference has crafting, combat and an NPC, and is playable', () => {
    const r = prototypeReport(buildReferenceSlice(), 'unity')
    expect(r.profile.systems).toEqual(['movement', 'interaction', 'inventory', 'quests', 'saveLoad', 'crafting', 'combat', 'dialogue', 'progression', 'trade', 'time'])
    expect(r.playable).toBe(true)
  })

  it.each([['saveLoad'], ['crafting'], ['combat'], ['dialogue'], ['crafting', 'combat', 'dialogue'], ['saveLoad', 'crafting', 'combat', 'dialogue'], ['quests', 'crafting', 'dialogue']])('without %s it still exports playable, without that module', (...off) => {
    const p = without(...off)
    expect(errors(p)).toEqual([])
    expect(prototypeReport(p, 'unity').playable).toBe(true)
    const test = file(p, SCENE_TEST)
    if (off.includes('combat')) expect(test).not.toContain('TheEncounterPlaysAsPlanned')
    if (off.includes('dialogue')) expect(test).not.toContain('TalkingToTheNpc')
    if (off.includes('crafting')) expect(test).not.toContain('CraftsExactly')
    if (off.includes('saveLoad')) expect(test).not.toContain('TheQuickSaveAndLoadKeysWorkWhilePlaying')
  })

  it.each([['movement'], ['interaction'], ['inventory'], ['quests']])('without %s, which others need, it says which system needs it instead of exporting a broken game', (off) => {
    const e = errors(without(off))
    expect(e.length).toBeGreaterThan(0)
    expect(e.every((i) => i.code === 'proto.requires' && i.where?.field === off)).toBe(true)
  })

  it('links a saved part only while its system is chosen, and says so', () => {
    const p = without('combat', 'dialogue')
    const { ir, issues } = buildIR(p)
    expect(ir.gameplay?.save?.parts.map((x) => x.state)).toEqual(['Player position', 'Inventory', 'Quests', 'Progression', 'Trade', 'Time'])
    expect(issues.filter((i) => i.code === 'gameplay.saveStateUnchosen').map((i) => i.where?.id)).toEqual(['refSpCombat', 'refSpDialog'])
    expect(file(p, 'Unity/Scripts/Generated/Save/PlannerSave.cs')).toContain('Combat')
  })
})

describe('quick save and quick load while playing', () => {
  it('saving needs the Quick save and Quick load controls', () => {
    const p = buildReferenceSlice()
    for (const c of p.documents['design.ui'].data.controls as Entity[]) if (c.drives === 'Quick load') delete c.drives
    expect(errors(p)).toEqual([expect.objectContaining({ code: 'proto.dataMissing', field: 'saveLoad', message: expect.stringContaining('Quick save and Quick load') })])
  })

  it('binds F5 and F9, names the keys, and tests them in the scene', () => {
    const p = buildReferenceSlice()
    expect(buildIR(p).ir.gameplay?.input).toMatchObject({ quickSave: { control: 'refCtlQSave', key: 'F5' }, quickLoad: { control: 'refCtlQLoad', key: 'F9' } })
    const config = file(p, 'Unity/Scripts/Generated/Gameplay/PlannerGameplay.cs')
    expect(config).toContain('public const string QuickSaveKey = "f5";')
    expect(config).toContain('public const string QuickLoadKey = "f9";')
    expect(file(p, SCENE_TEST)).toContain('TheQuickSaveAndLoadKeysWorkWhilePlaying')
  })
})

describe('placeholders and manual work', () => {
  it('lists the stand-ins, the records without art, the plain UI and the manual work of each chosen system', () => {
    const p = buildReferenceSlice()
    const b = bundle(p)
    const w = handWork(b.ir, prototypeReport(p, 'unity'), b.issues, 'unity')
    expect(w.standIns).toEqual([
      expect.stringContaining('`Prototype/Player.prefab`'),
      expect.stringContaining('`Prototype/Prefabs/item.brass_key.prefab`'),
      expect.stringContaining(`\`Prototype/Prefabs/${IDS.enemy}.prefab\` — the body of Yard Rat`),
      expect.stringContaining('`Prototype/Prefabs/MerchantPeddler.prefab` — the body of Peddler'),
      expect.stringContaining('`Prototype/Prefabs/NpcKeeper.prefab` — the body of Keeper'),
    ])
    expect(w.noArt).toHaveLength(4)
    expect(w.builtInUi.map((x) => x.slice(0, 25))).toEqual(['The interaction prompt (“', 'The crafting panel (`Plan', 'The dialogue panel (`Plan', 'The quick save message (`', 'The trade panel and the m', 'The level and XP label (`', 'The clock label (`Planner'])
    expect(w.byHand.map((x) => x.system)).toEqual(['Player movement and camera', 'Interaction (pick up, use)', 'Inventory', 'Quests and rewards', 'Save and load', 'Crafting', 'Combat', 'NPC dialogue', 'Player progression (XP, levels)', 'Trading (money, merchants)', 'Day and night'])
    expect(w.defaults).toEqual([expect.stringContaining('Map scale'), expect.stringContaining('damage formula'), expect.stringContaining('start hour = 8:00')])
    expect(w.notRun).toContain("Combat: melee only; an enemy guards its spot or walks its patrol route on the level's navigation mesh, sees the player within its sight range (walls block it), chases, hits within 1.5 m, and goes back after losing sight for 3 s or past its give-up range; a defeated player is back at the start with full health.")
    const readme = b.files.find((f) => f.path === 'README.md')!.content
    expect(readme).toContain('## Placeholders and manual work')
    expect(readme).toContain('**By hand** — not generated for the chosen systems:')
  })

  it('follows the choice: without combat and dialogue there is no enemy or NPC stand-in, and other engines get no Unity stand-ins', () => {
    const p = without('combat', 'dialogue')
    const b = bundle(p)
    const w = handWork(b.ir, prototypeReport(p, 'unity'), b.issues, 'unity')
    expect(w.standIns.some((x) => /Yard Rat|Keeper/.test(x))).toBe(false)
    expect(w.byHand.map((x) => x.system)).not.toContain('Combat')
    expect(w.notRun.some((x) => x.includes('Saved part “Combat”'))).toBe(true)
    const q = buildReferenceSlice()
    const g = buildBundle(q, 'godot', AT)
    expect(handWork(g.ir, prototypeReport(q, 'godot'), g.issues, 'godot')).toMatchObject({ standIns: [], builtInUi: [], byHand: [] })
  })

  it('a plan without a prototype gets no such section', () => {
    const p = buildReferenceSlice()
    p.documents['technical.architecture'].data.prototype = {}
    expect(file(p, 'README.md')).not.toContain('Placeholders and manual work')
  })
})

describe('the gate wants evidence of every chosen system', () => {
  const nunit = (passed: string[], failed: string[] = []) => ({ total: passed.length + failed.length, passed: passed.length, failed: failed.length, skipped: 0, passedNames: passed.map((n) => `Ref.PlannerPlayModeTests.PlannerPrototypeSceneTests.${n}`), failedNames: failed.map((n) => `Ref.PlannerPlayModeTests.PlannerPrototypeSceneTests.${n}`) })

  it('covers a system by its own scene test and self-test check', () => {
    const c = coverageOf(['combat', 'dialogue'], nunit(['TheEncounterPlaysAsPlanned', 'TalkingToTheNpcMakesThePlannedChoiceOnce']), [{ name: 'fight Yard Rat', passed: true }, { name: 'talk to Keeper', passed: true }])
    expect(c).toEqual([
      { system: 'combat', ok: true, tests: ['TheEncounterPlaysAsPlanned'], self: ['fight Yard Rat'] },
      { system: 'dialogue', ok: true, tests: ['TalkingToTheNpcMakesThePlannedChoiceOnce'], self: ['talk to Keeper'] },
    ])
  })

  it('fails a system with no passing evidence, a failed test or a failed check — other tests do not count for it', () => {
    const c = coverageOf(['crafting', 'combat', 'dialogue'], nunit(['TheEncounterPlaysAsPlanned', 'CraftsExactlyAndNeverConsumesInPart'], ['ADefeatedPlayerIsBackAtTheStart']), [{ name: 'craft Polished Key', passed: true }, { name: 'fight Yard Rat', passed: true }, { name: 'talk to Keeper', passed: false }])
    expect(c.map((x) => [x.system, x.ok, x.why])).toEqual([
      ['crafting', true, undefined],
      ['combat', false, 'failed: ADefeatedPlayerIsBackAtTheStart'],
      ['dialogue', false, 'no generated scene test of it passed; no player self-test check of it passed; self-test failed: talk to Keeper'],
    ])
    // A runtime package test with the same name is not the plan's scene test.
    const other = { ...nunit([]), passedNames: ['HoHPlanner.Runtime.Tests.PlannerCombatTests.TheEncounterPlaysAsPlanned'], passed: 1, total: 1 }
    expect(coverageOf(['combat'], other, null)[0]).toMatchObject({ ok: false, why: 'no generated scene test of it passed' })
  })

  it('reports the coverage, the systems left out and the hand work', () => {
    const r: GateReport = { startedAt: 'now', plan: 'plan', breaks: [], without: ['combat'], systems: ['movement'], editors: [], coverage: coverageOf(['movement'], nunit(['ThePlayerWalksWithThePlannedKeys']), [{ name: 'runtime runs', passed: true }]), handWork: '\n## Placeholders and manual work\n\n- x\n', overall: 'passed' }
    const md = renderMarkdown(r)
    expect(md).toContain('**without:** combat')
    expect(md).toContain('Chosen systems: movement')
    expect(md).toContain('| movement | ✅ | ThePlayerWalksWithThePlannedKeys | runtime runs |')
    expect(md).toContain('## Placeholders and manual work')
  })
})
