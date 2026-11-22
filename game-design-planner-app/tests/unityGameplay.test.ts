import { describe, expect, it } from 'vitest'
import { buildReferenceSlice } from './fixtures/referenceSlice3d'
import { buildBundle } from '../src/core/engine/bundle'
import { playerSettings, runtimeControls } from '../src/core/gameplay'
import type { Entity, Project } from '../src/core/model/types'

/** plans/UNITY_PLAYABLE_GAME_GENERATION_PLAN.md, phase 7: the planned player in the Unity export. */
const bundle = (p: Project) => buildBundle(p, 'unity', '2026-01-01T00:00:00.000Z')
const file = (p: Project, path: string) => bundle(p).files.find((f) => f.path === path)?.content
const controls = (p: Project) => p.documents['design.ui'].data.controls as Entity[]
// The map with the Move stick (a plan may have its own category called “Prototype”).
const protoMap = (p: Project) => JSON.parse(file(p, 'Unity/Input/ReferenceSlice3D.inputactions')!).maps.find((m: { actions: { expectedControlType: string }[] }) => m.actions.some((a) => a.expectedControlType === 'Vector2'))

describe('the planned player', () => {
  it('takes its settings and keys from the plan', () => {
    const code = file(buildReferenceSlice(), 'Unity/Scripts/Generated/Gameplay/PlannerGameplay.cs')!
    expect(code).toContain('public const float MoveSpeed = 4.5f;')
    expect(code).toContain('public const float CameraDistance = 4.0f;')
    expect(code).toContain('public const float CameraHeight = 2.0f;')
    expect(code).toContain('public const string ForwardKey = "w";')
    expect(code).toContain('public const string InteractKey = "e";')
    expect(code).toContain('public const string InputMap = "Prototype";')
    expect(code).toContain('Every value comes from the plan.')
    expect(file(buildReferenceSlice(), 'Unity/Scripts/ReferenceSlice3D.asmdef')).toContain('"HoHPlanner.Runtime"')
  })

  it('fills empty settings with visible defaults and says so', () => {
    const p = buildReferenceSlice()
    const form = p.documents['design.player'].data.controls as Record<string, unknown>
    delete form.moveSpeed
    form.cameraDistance = 0
    expect(playerSettings(p)).toMatchObject({ moveSpeed: 4, cameraDistance: 5, defaulted: ['moveSpeed', 'cameraDistance'] })
    expect(file(p, 'Unity/Scripts/Generated/Gameplay/PlannerGameplay.cs')).toContain('Defaults (empty in the plan): moveSpeed, cameraDistance.')
    expect(bundle(p).issues).toContainEqual(expect.objectContaining({ level: 'info', code: 'gameplay.default', message: expect.stringContaining('moveSpeed = 4, cameraDistance = 5') }))
  })

  it('never guesses runtime actions from names, and reports a second control for the same action', () => {
    const p = buildReferenceSlice()
    for (const c of controls(p)) delete c.drives
    expect(runtimeControls(p).controls).toEqual({ move: {} })
    const q = buildReferenceSlice()
    controls(q).push({ id: 'up2', name: 'Walk up', category: 'Movement', key: 'Up', drives: 'Move forward' })
    expect(runtimeControls(q).issues).toEqual([expect.objectContaining({ code: 'gameplay.twoControls', message: 'Walk up and Move forward are both “Move forward”; Move forward is used.' })])
  })

  it('adds the left stick only when the plan has a gamepad', () => {
    expect(protoMap(buildReferenceSlice()).bindings.some((b: { path: string }) => b.path === '<Gamepad>/leftStick')).toBe(false)
    const p = buildReferenceSlice()
    ;(p.documents['design.ui'].data.input as { devices: string[] }).devices = ['Keyboard & mouse', 'Xbox gamepad']
    expect(protoMap(p).bindings.some((b: { path: string }) => b.path === '<Gamepad>/leftStick')).toBe(true)
  })

  it('warns about a Move key the export cannot bind, and keeps the map name free of the plan’s categories', () => {
    const p = buildReferenceSlice()
    controls(p).find((c) => c.drives === 'Move left')!.key = 'Left thumb'
    expect(bundle(p).issues).toContainEqual(expect.objectContaining({ level: 'warning', code: 'unity.moveKey' }))
    expect(protoMap(p).bindings.map((b: { name: string }) => b.name)).not.toContain('left')
    const q = buildReferenceSlice()
    controls(q)[5].category = 'Prototype'
    expect(protoMap(q).name).toBe('Planner prototype')
  })

  it('writes nothing for the player when movement is not chosen', () => {
    const p = buildReferenceSlice()
    delete (p.documents['technical.architecture'].data.prototype as Record<string, unknown>).movement
    const paths = bundle(p).files.map((f) => f.path)
    expect(paths.some((x) => x.includes('Gameplay') || x.includes('PlayMode'))).toBe(false)
    expect(file(p, 'Unity/Scripts/ReferenceSlice3D.asmdef')).toContain('"references": []')
  })
})
