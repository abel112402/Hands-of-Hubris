import { describe, expect, it } from 'vitest'
import { buildReferenceSlice, IDS } from './fixtures/referenceSlice3d'
import { buildIR, IR_VERSION } from '../src/core/engine/ir'
import { buildBundle } from '../src/core/engine/bundle'
import { godot } from '../src/core/engine/adapters/godot'
import { unreal } from '../src/core/engine/adapters/unreal'
import { unity } from '../src/core/engine/adapters/unity'
import { deserializeProject } from '../src/core/persistence/serialize'
import type { Entity } from '../src/core/model/types'

/** plans/UNITY_PLAYABLE_GAME_GENERATION_PLAN.md, phase 3: gameplay in the engine IR, and compatibility. */
const fs: { readFileSync: (p: string, e: string) => string } = await import('node:fs' as string)
const cinderholm = () => deserializeProject(fs.readFileSync('examples/cinderholm.hohplan.json', 'utf8')).project

describe('IR v9 gameplay', () => {
  it('carries the profile, systems, typed quest rule and placements with planner IDs and record keys', () => {
    const { ir, issues } = buildIR(buildReferenceSlice())
    expect(ir.v).toBe(9)
    expect(IR_VERSION).toBe(9)
    // Phase 8: the only gameplay note is the visible default map scale (one walkability cell per metre).
    expect(issues.filter((i) => i.code.startsWith('gameplay.')).map((i) => [i.level, i.code, i.where?.field])).toEqual([
      ['info', 'gameplay.default', 'mapScale'],
      ['info', 'gameplay.default', undefined],
      ['info', 'gameplay.combatModel', undefined],
    ])
    const g = ir.gameplay!
    expect(g.profile).toEqual({ dimension: '3D', perspective: 'Third-person', renderPipeline: 'URP', platform: 'Windows' })
    expect(g.systems).toEqual(['movement', 'interaction', 'inventory', 'quests', 'saveLoad', 'crafting', 'combat', 'dialogue', 'progression', 'trade', 'time'])
    expect(g.quests).toEqual([
      {
        quest: IDS.quest,
        name: 'Find the brass key',
        completeWhen: { kind: 'holdItems', items: [{ item: IDS.itemKey, key: 'item.brass_key', count: 1 }] },
        onComplete: [{ kind: 'giveItems', items: [{ item: IDS.itemCoin, key: 'item.coin', count: 5 }] }],
        money: 5,
        xp: 10,
      },
    ])
    expect(g.placements.map((x) => [x.role, x.object, x.item, x.key, x.count])).toEqual([
      ['player', IDS.start, undefined, undefined, 1],
      ['item', IDS.pickup, IDS.itemKey, 'item.brass_key', 1],
      ['enemy', IDS.enemySpawn, undefined, undefined, 1],
      ['npc', IDS.npcSpawn, undefined, undefined, 1],
      ['merchant', IDS.merchantSpot, undefined, undefined, 1],
      ['item', IDS.caveCoin, IDS.itemCoin, 'item.coin', 3],
    ])
    expect(g.scene).toEqual({ scene: { id: IDS.scene, name: 'Keeper’s Yard' }, location: IDS.location, locationName: 'Keeper’s Yard', map: `Maps/${IDS.location}.json`, cell: 10 })
  })

  it('gives the same IR for the same plan', () => {
    const a = JSON.stringify(buildIR(buildReferenceSlice()).ir)
    expect(JSON.stringify(buildIR(buildReferenceSlice()).ir)).toBe(a)
    expect(JSON.stringify(buildIR(deserializeProject(fs.readFileSync('tests/fixtures/reference-slice-3d.hohplan.json', 'utf8')).project).ir)).toBe(a)
  })

  it('warns when a used item has no data record, and keeps the planner ID', () => {
    const p = buildReferenceSlice()
    p.documents['technical.dataDriven'].data.schemas = []
    const { ir, issues } = buildIR(p)
    expect(ir.gameplay!.quests[0].completeWhen!.items).toEqual([{ item: IDS.itemKey, count: 1 }])
    expect(issues.filter((i) => i.code === 'gameplay.itemNoRecord').map((i) => i.where?.id)).toEqual([IDS.itemKey, IDS.itemCoin])
  })
})

describe('compatibility', () => {
  it('leaves plans without a prototype without gameplay in the IR', () => {
    const { ir } = buildIR(cinderholm())
    expect('gameplay' in ir).toBe(false)
    expect(Object.keys(JSON.parse(JSON.stringify(ir)))).not.toContain('gameplay')
  })

  it('Godot and Unreal ignore the gameplay part; Unity adds the player files and nothing else changes', () => {
    const { ir } = buildIR(buildReferenceSlice())
    const { gameplay, ...without } = ir
    expect(gameplay).toBeDefined()
    for (const a of [godot, unreal]) expect(a.emit(ir)).toEqual(a.emit(without))
    const withPaths = unity.emit(ir).map((f) => f.path)
    const withoutPaths = unity.emit(without).map((f) => f.path)
    expect(withPaths.filter((p) => !withoutPaths.includes(p))).toEqual(['Scripts/Generated/Combat/PlannerDamageFormula.cs', 'Scripts/Generated/Save/PlannerSaveSlice.cs', 'Scripts/Generated/Story/PlannerQuestGraph.cs', 'Tests/PlayMode/PlannerPrototypeSceneTests.cs', 'Scripts/Generated/Gameplay/PlannerGameplay.cs', 'Tests/PlayMode/ReferenceSlice3D.PlannerPlayModeTests.asmdef', 'Tests/PlayMode/PlannerPlayerTests.cs'])
  })

  it('says plainly that Godot and Unreal do not make the chosen systems playable', () => {
    for (const engine of ['godot', 'unreal'] as const) {
      const b = buildBundle(buildReferenceSlice(), engine, '2026-01-01T00:00:00.000Z')
      expect(b.issues.filter((i) => i.code === 'proto.unsupported').map((i) => i.field)).toEqual(['movement', 'interaction', 'inventory', 'quests', 'saveLoad', 'crafting', 'combat', 'dialogue', 'progression', 'trade', 'time'])
      expect(b.files.find((f) => f.path === 'README.md')!.content).toContain('**Not playable yet.**')
    }
  })

  it('keeps old quest data intact next to the new typed fields', () => {
    const p = buildReferenceSlice()
    const q = (p.documents['design.story'].data.quests as Entity[])[0]
    expect(q.objectives).toEqual([{ id: IDS.objective, text: 'Pick up the Brass Key', done: false }])
    expect(buildIR(p).ir.story.quests[0].objectives).toEqual(['Pick up the Brass Key'])
  })
})
