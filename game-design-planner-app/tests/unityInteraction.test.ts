import { describe, expect, it } from 'vitest'
import { buildReferenceSlice, IDS } from './fixtures/referenceSlice3d'
import { buildIR } from '../src/core/engine/ir'
import { buildBundle } from '../src/core/engine/bundle'
import { prototypeReport } from '../src/core/engine/capabilities'
import { playerSettings } from '../src/core/gameplay'
import type { Project } from '../src/core/model/types'

/**
 * plans/UNITY_PLAYABLE_GAME_GENERATION_PLAN.md, phase 9: interaction and picking up items. The range comes from the plan
 * (Player Character › Interaction range, a visible default otherwise), the pickups' items and amounts from the map, and
 * the Unity export generates PlayMode tests that pick the planned item up once and nothing from too far away.
 */
const AT = '2026-01-01T00:00:00.000Z'
const controls = (p: Project) => p.documents['design.player'].data.controls as Record<string, unknown>
const proto = (p: Project) => p.documents['technical.architecture'].data.prototype as Record<string, unknown>
const file = (p: Project, path: string) => buildBundle(p, 'unity', AT).files.find((f) => f.path === path)?.content

describe('interaction range in the plan', () => {
  it('comes from Player Character › Interaction range', () => {
    const p = buildReferenceSlice()
    controls(p).interactRange = 1.25
    expect(buildIR(p).ir.gameplay?.player.interactRange).toBe(1.25)
    expect(file(p, 'Unity/Scripts/Generated/Gameplay/PlannerGameplay.cs')).toContain('public const float InteractRange = 1.25f;')
  })

  it('has a visible default, reported only when the plan chose interaction', () => {
    const p = buildReferenceSlice()
    delete controls(p).interactRange
    expect(playerSettings(p)).toMatchObject({ interactRange: 2, defaulted: ['interactRange'] })
    const note = () => buildIR(p).issues.find((i) => i.code === 'gameplay.default' && i.where?.doc === 'design.player')
    expect(note()?.message).toContain('interactRange = 2')
    proto(p).interaction = false
    expect(note()).toBeUndefined()
    expect(buildIR(p).ir.gameplay?.player.defaulted).toEqual([])
  })
})

describe('interaction support', () => {
  it('is a working module in Unity, so the reference has nothing that blocks', () => {
    const r = prototypeReport(buildReferenceSlice(), 'unity')
    expect(r.systems.find((s) => s.id === 'interaction')?.level).toBe('template')
    expect(r.issues.filter((i) => i.level === 'error')).toEqual([])
    expect(r.playable).toBe(true) // since phase 12 every system of the slice works
  })

  it('still needs an Interact control and an item on the map', () => {
    const p = buildReferenceSlice()
    for (const c of p.documents['design.ui'].data.controls as Record<string, unknown>[]) if (c.drives === 'Interact') delete c.drives
    const missing = prototypeReport(p, 'unity').issues.filter((i) => i.code === 'proto.dataMissing' && i.field === 'interaction')
    expect(missing.map((i) => i.where)).toEqual([{ doc: 'design.ui', section: 'controls', field: 'drives' }])
  })
})

describe('Unity export of picking up', () => {
  it('lists the scene pickups with planner IDs, record keys and counts', () => {
    const config = file(buildReferenceSlice(), 'Unity/Scripts/Generated/Gameplay/PlannerGameplay.cs')!
    expect(config).toContain(`Pickups = { ("${IDS.itemKey}", "item.brass_key", 1) };`)
  })

  it('generates the pick-up PlayMode tests only when the plan chose interaction', () => {
    const p = buildReferenceSlice()
    const test = file(p, 'Unity/Tests/PlayMode/PlannerPrototypeSceneTests.cs')!
    expect(test).toContain('PicksUpThePlannedItemOnceWithTheInteractKey')
    expect(test).toContain('GivesNothingFromTooFarAway')
    expect(test).toContain('Pressing again gives nothing more')
    proto(p).interaction = false
    proto(p).inventory = false
    const without = file(p, 'Unity/Tests/PlayMode/PlannerPrototypeSceneTests.cs')!
    expect(without).toContain('StartsWithNothingMissing')
    expect(without).not.toContain('PicksUpThePlannedItemOnceWithTheInteractKey')
  })
})
