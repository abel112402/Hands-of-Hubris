import { describe, expect, it } from 'vitest'
import { buildReferenceSlice, IDS, KNOWN_GAPS } from './fixtures/referenceSlice3d'
import { deserializeProject, serializeProject } from '../src/core/persistence/serialize'
import { buildIR } from '../src/core/engine/ir'
import { buildBundle } from '../src/core/engine/bundle'

/**
 * plans/UNITY_PLAYABLE_GAME_GENERATION_PLAN.md, phase 0: the small 3D reference plan and the baseline of what the
 * current export makes of it. The "baseline gaps" tests pin today's limits on purpose: when a later phase closes
 * one, update the test and KNOWN_GAPS together. Run with UPDATE_REFERENCE_FIXTURES=1 to rewrite the fixture file.
 */
const fs: { readFileSync: (p: string, e: string) => string; writeFileSync: (p: string, t: string) => void; existsSync: (p: string) => boolean } = await import('node:fs' as string)
const env: Record<string, string | undefined> = ((globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env) ?? {}
const FILE = 'tests/fixtures/reference-slice-3d.hohplan.json'

const text = serializeProject(buildReferenceSlice()) + '\n'
if (env.UPDATE_REFERENCE_FIXTURES) fs.writeFileSync(FILE, text)
const loaded = () => deserializeProject(fs.readFileSync(FILE, 'utf8'))

describe('3D reference slice fixture', () => {
  it('is current and loads without warnings', () => {
    expect(fs.existsSync(FILE), `${FILE} is missing; run the tests with UPDATE_REFERENCE_FIXTURES=1`).toBe(true)
    expect(fs.readFileSync(FILE, 'utf8').replace(/\r\n/g, '\n'), `${FILE} is out of date; run the tests with UPDATE_REFERENCE_FIXTURES=1`).toBe(text)
    expect(loaded().warnings).toEqual([])
  })

  it('is deterministic', () => {
    expect(serializeProject(buildReferenceSlice())).toBe(serializeProject(buildReferenceSlice()))
    expect(JSON.stringify(buildIR(loaded().project).ir)).toBe(JSON.stringify(buildIR(loaded().project).ir))
  })
})

describe('baseline export of the reference slice', () => {
  const { ir, issues } = buildIR(loaded().project)
  const bundle = buildBundle(loaded().project, 'unity', '2026-01-01T00:00:00.000Z')
  const paths = bundle.files.map((f) => f.path)

  it('exports the item records, controls, quest, save parts, scene and map', () => {
    expect(ir.records.map((r) => [r.plannerId, r.key])).toEqual([[IDS.itemKey, 'item.brass_key'], [IDS.itemCoin, 'item.coin'], [IDS.itemStick, 'item.stick'], [IDS.itemPolished, 'item.polished_key'], [IDS.recipe, 'rcp.polished_key']])
    expect(ir.input.actions.map((a) => a.name)).toEqual(['Move forward', 'Move back', 'Move left', 'Move right', 'Interact', 'Inventory', 'Crafting', 'Attack', 'Pause'])
    expect(ir.story.quests.map((q) => [q.id, q.objectives])).toEqual([[IDS.quest, ['Pick up the Brass Key']]])
    expect(ir.save).toMatchObject({ version: 1, manualSlots: 1, autoSlots: 0 })
    expect(ir.save.parts.map((p) => p.key)).toEqual(['player', 'inventory', 'quest_log', 'combat'])
    expect(ir.scenes.scenes.map((s) => s.name)).toEqual(['Keeper’s Yard'])
    expect(ir.ui.screens.map((s) => [s.name, s.entry])).toEqual([['HUD', true]])
    expect(paths).toContain(`Maps/${IDS.location}.json`)
    expect(paths).toEqual(expect.arrayContaining(['Unity/Input/ReferenceSlice3D.inputactions', 'Unity/Scripts/Generated/Story/PlannerQuestLog.cs', 'Unity/Scripts/Generated/Save/PlannerSave.cs', 'Unity/UI/Screens/Hud.uxml']))
  })

  it('has no data problems, nothing blocks and no system is only a frame: the export says Playable', () => {
    expect(issues.filter((i) => i.level !== 'info')).toEqual([])
    const proto = bundle.issues.filter((i) => i.code.startsWith('proto.'))
    expect(bundle.issues.filter((i) => !i.code.startsWith('proto.')).map((i) => i.code).sort()).toEqual(['gameplay.combatModel', 'gameplay.default', 'gameplay.default', 'record.assetUnset', 'unity.renamed', 'unity.renamed'])
    expect(proto.filter((i) => i.level === 'error').map((i) => [i.code, i.field])).toEqual([])
    expect(proto.filter((i) => i.level === 'warning').map((i) => i.field)).toEqual([])
    expect(bundle.files.find((f) => f.path === 'README.md')!.content).toContain('**Playable.** Profile: 3D, Third-person, URP, Windows.')
  })

  it('pins the baseline gaps that later phases close (KNOWN_GAPS)', () => {
    expect(KNOWN_GAPS.length).toBeGreaterThan(0)
    // Phase 3: the profile and typed gameplay are in the IR; no engine generates code from them yet (phase 4+).
    expect(ir.gameplay?.profile).toEqual({ dimension: '3D', perspective: 'Third-person', renderPipeline: 'URP', platform: 'Windows' })
    // Phases 7–9: the player, and the prototype scene's test with picking up; no inventory yet.
    expect(paths).toContain('Unity/Scripts/Generated/Gameplay/PlannerGameplay.cs')
    expect(bundle.files.find((f) => f.path === 'Unity/Tests/PlayMode/PlannerPrototypeSceneTests.cs')!.content).toContain('PicksUpThePlannedItemOnceWithTheInteractKey')
    // Phase 12: the slice is saved and loaded into a fresh game.
    expect(bundle.files.find((f) => f.path === 'Unity/Tests/PlayMode/PlannerPrototypeSceneTests.cs')!.content).toContain('TheSliceIsTheSameAfterSavingAndLoadingIntoAFreshGame')
    expect(paths).toContain('Unity/Scripts/Generated/Save/PlannerSaveSlice.cs')
    // Phase 11: the quest completes by playing and rewards once; the generated quest graph serves the runtime.
    expect(bundle.files.find((f) => f.path === 'Unity/Tests/PlayMode/PlannerPrototypeSceneTests.cs')!.content).toContain('TheQuestCompletesOnlyByPlayingAndRewardsOnce')
    expect(paths).toContain('Unity/Scripts/Generated/Story/PlannerQuestGraph.cs')
    // Phase 10: the inventory and its HUD binding are tested in the scene.
    expect(bundle.files.find((f) => f.path === 'Unity/Tests/PlayMode/PlannerPrototypeSceneTests.cs')!.content).toContain('PickingUpFillsTheInventoryAndTheHud')
    // Phase 7: the four Move controls become one Move stick (a 2D-vector composite) in the Prototype map.
    const asset = JSON.parse(bundle.files.find((f) => f.path === 'Unity/Input/ReferenceSlice3D.inputactions')!.content)
    const map = asset.maps.find((m: { name: string }) => m.name === 'Prototype')
    expect(map.actions.map((a: { name: string; expectedControlType: string }) => [a.name, a.expectedControlType])).toEqual([['Move', 'Vector2'], ['Interact', 'Button'], ['Crafting', 'Button'], ['Attack', 'Button']])
    expect(map.bindings.map((b: { name: string; path: string }) => [b.name, b.path])).toEqual([['Keys', '2DVector'], ['up', '<Keyboard>/w'], ['down', '<Keyboard>/s'], ['left', '<Keyboard>/a'], ['right', '<Keyboard>/d'], ['', '<Keyboard>/e'], ['', '<Keyboard>/f'], ['', '<Keyboard>/c']])
    // The placements already reach the map export as hoh-location spawns.
    const spawns = JSON.parse(bundle.files.find((f) => f.path === `Maps/${IDS.location}.json`)!.content).spawns
    expect(spawns.map((s: { role: string; refId?: string }) => [s.role, s.refId])).toEqual([['player', undefined], ['item', IDS.itemKey], ['enemy', IDS.enemy]])
  })
})
