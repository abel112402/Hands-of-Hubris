import { describe, expect, it } from 'vitest'
import { buildReferenceSlice, IDS } from './fixtures/referenceSlice3d'
import { buildIR } from '../src/core/engine/ir'
import { buildBundle } from '../src/core/engine/bundle'
import type { Project } from '../src/core/model/types'

/**
 * plans/UNITY_PLAYABLE_GAME_GENERATION_PLAN.md, phase 8: the prototype scene. The plan names the planned scene the
 * prototype is played in and, optionally, the map scale; the IR carries both with the location and its map file; the
 * Unity export names the scene and generates a PlayMode test of it. The bridge builds the scene itself (Unity side).
 */
const AT = '2026-01-01T00:00:00.000Z'
const proto = (p: Project) => p.documents['technical.architecture'].data.prototype as Record<string, unknown>
const file = (p: Project, path: string) => buildBundle(p, 'unity', AT).files.find((f) => f.path === path)?.content

describe('prototype scene in the plan and the IR', () => {
  it('names the planned scene, the location with the player start, its map file and the default scale', () => {
    const p = buildReferenceSlice()
    const { ir, issues } = buildIR(p)
    expect(ir.gameplay?.scene).toEqual({ scene: { id: IDS.scene, name: 'Keeper’s Yard' }, location: IDS.location, locationName: 'Keeper’s Yard', map: `Maps/${IDS.location}.json`, cell: 10 })
    const note = issues.find((i) => i.code === 'gameplay.default')!
    expect(note.message).toContain('one walkability cell (10 map units) of Keeper’s Yard is one metre, 0.1 m per map unit')
    // The map file the IR names is the one the bundle writes.
    expect(buildBundle(p, 'unity', AT).files.some((f) => f.path === ir.gameplay!.scene!.map)).toBe(true)
  })

  it('uses a planned map scale instead of the default, and reports a bad one', () => {
    const p = buildReferenceSlice()
    proto(p).mapScale = 0.25
    const { ir, issues } = buildIR(p)
    expect(ir.gameplay?.scene?.metresPerUnit).toBe(0.25)
    expect(ir.gameplay?.scene?.cell).toBeUndefined()
    expect(issues.some((i) => i.code === 'gameplay.default' && i.where?.field === 'mapScale')).toBe(false)

    proto(p).mapScale = -1
    const bad = buildBundle(p, 'unity', AT).issues.find((i) => i.code === 'proto.dataInvalid' && i.field === 'gameplay.badScale')
    expect(bad?.level).toBe('error')
    expect(bad?.where).toEqual({ doc: 'technical.architecture', section: 'prototype', field: 'mapScale' })
  })

  it('blocks player movement without a chosen scene, and says where to choose it', () => {
    const p = buildReferenceSlice()
    delete proto(p).scene
    const b = buildBundle(p, 'unity', AT)
    const missing = b.issues.find((i) => i.code === 'proto.dataMissing' && i.field === 'movement')
    expect(missing?.message).toContain('the scene the prototype is played in')
    expect(missing?.where).toEqual({ doc: 'technical.architecture', section: 'prototype', field: 'scene' })
    expect(b.files.some((f) => f.path.endsWith('PlannerPrototypeSceneTests.cs'))).toBe(false)
    expect(file(p, 'Unity/Scripts/Generated/Gameplay/PlannerGameplay.cs')).toContain('public const string Scene = null;')
  })

  it('reports a scene reference that is not a planned scene', () => {
    const p = buildReferenceSlice()
    proto(p).scene = 'noSuchScene'
    const b = buildBundle(p, 'unity', AT)
    expect(b.issues.find((i) => i.field === 'gameplay.unknownScene')?.level).toBe('error')
    expect(buildIR(p).ir.gameplay?.scene?.scene).toBeUndefined()
  })

  it('has no scene without a player start', () => {
    const p = buildReferenceSlice()
    const loc = (p.documents['design.world'].data.locations as { id: string; map: { layers: Record<string, { objects: { spawn?: unknown }[] }> } }[]).find((l) => l.id === IDS.location)!
    for (const layer of Object.values(loc.map.layers)) for (const o of layer.objects) delete o.spawn
    expect(buildIR(p).ir.gameplay?.scene).toBeUndefined()
  })
})

describe('Unity export of the prototype scene', () => {
  it('names the scene and its pickups in PlannerGameplay and generates its PlayMode test', () => {
    const p = buildReferenceSlice()
    const config = file(p, 'Unity/Scripts/Generated/Gameplay/PlannerGameplay.cs')!
    expect(config).toContain('public const string Scene = "Keeper’s Yard";')
    expect(config).toContain('public const string SceneLabel = "PlannerPrototype";')
    expect(config).toContain('public const int PlacedItems = 2;')
    const test = file(p, 'Unity/Tests/PlayMode/PlannerPrototypeSceneTests.cs')!
    expect(test).toContain('public class PlannerPrototypeSceneTests')
    expect(test).toContain('LoadSceneAsyncInPlayMode')
    expect(test).toContain('has a missing script')
    expect(test).toContain('PlannerRuntimeState.Running')
  })

  it('asks for runtime 0.15.0 (placements, interaction, inventory, quests, saving, self-test, crafting, combat, dialogue, quick save, passages, enemy behaviour, progression, trade, time)', () => {
    const b = buildBundle(buildReferenceSlice(), 'unity', AT)
    expect(b.manifest.requires?.runtime).toEqual({ package: 'com.handsofhubris.planner-runtime', version: '0.15.0' })
  })
})
