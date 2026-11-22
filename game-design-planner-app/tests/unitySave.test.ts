import { describe, expect, it } from 'vitest'
import { buildReferenceSlice } from './fixtures/referenceSlice3d'
import { buildIR } from '../src/core/engine/ir'
import { buildBundle } from '../src/core/engine/bundle'
import { prototypeReport } from '../src/core/engine/capabilities'
import { saveLinks } from '../src/core/gameplay'
import { getModule, getSections } from '../src/core/modules/registry'
import type { Entity, Project } from '../src/core/model/types'

/**
 * plans/UNITY_PLAYABLE_GAME_GENERATION_PLAN.md, phase 12: the saveable vertical slice. Each saved part says which runtime
 * state it holds (never guessed from its name); the generated PlannerSave refuses damaged and newer saves and restores
 * in the planned order; the generated PlannerSaveSlice ties the parts to the runtime.
 */
const AT = '2026-01-01T00:00:00.000Z'
const parts = (p: Project) => p.documents['technical.save'].data.parts as Entity[]
const unityFile = (p: Project, path: string) => buildBundle(p, 'unity', AT).files.find((f) => f.path === path)?.content
const issues = (p: Project) => prototypeReport(p, 'unity').issues

describe('saved parts linked to runtime state', () => {
  it('is a field of Save System › Saved parts', () => {
    const p = buildReferenceSlice()
    const sec = getSections(getModule('technical.save')!, p.registry).find((s) => s.id === 'parts')!
    if (sec.kind !== 'collection') throw new Error('Saved parts must be a collection')
    const field = sec.fields.find((f) => f.key === 'state')!
    expect(field).toMatchObject({ label: 'Runtime state', type: 'enum', options: ['Player position', 'Inventory', 'Quests'] })
  })

  it('reads the links in plan order, and reports a second part for the same state', () => {
    const p = buildReferenceSlice()
    expect(saveLinks(p).links.map((l) => [l.name, l.state])).toEqual([
      ['Player', 'Player position'],
      ['Inventory', 'Inventory'],
      ['Quest log', 'Quests'],
    ])
    parts(p).push({ id: 'refSpInv2', name: 'Bag', since: 1, state: 'Inventory' })
    expect(saveLinks(p).issues).toEqual([expect.objectContaining({ level: 'warning', code: 'gameplay.twoSaveParts', where: { doc: 'technical.save', section: 'parts', id: 'refSpInv2', field: 'state' } })])
  })

  it('does not guess a link from a part’s name', () => {
    const p = buildReferenceSlice()
    for (const part of parts(p)) delete part.state
    expect(saveLinks(p).links).toEqual([])
    const missing = issues(p).filter((i) => i.code === 'proto.dataMissing' && i.field === 'saveLoad')
    expect(missing.map((i) => i.message)).toEqual([
      expect.stringContaining('Runtime state is Player position'),
      expect.stringContaining('Runtime state is Inventory'),
      expect.stringContaining('Runtime state is Quests'),
    ])
    expect(missing[0].where).toEqual({ doc: 'technical.save', section: 'parts', field: 'state' })
  })

  it('makes the reference playable: Save and load works in Unity', () => {
    const r = prototypeReport(buildReferenceSlice(), 'unity')
    expect(r.systems.find((s) => s.id === 'saveLoad')?.level).toBe('template')
    expect(r.playable).toBe(true)
  })

  it('carries the links with their save keys in the IR', () => {
    expect(buildIR(buildReferenceSlice()).ir.gameplay?.save).toEqual({
      parts: [
        { part: 'refSpPlayr', key: 'player', state: 'Player position' },
        { part: 'refSpInv', key: 'inventory', state: 'Inventory' },
        { part: 'refSpQuest', key: 'quest_log', state: 'Quests' },
      ],
    })
  })
})

describe('Unity save code', () => {
  it('refuses damaged and newer saves and restores in the planned order', () => {
    const save = unityFile(buildReferenceSlice(), 'Unity/Scripts/Generated/Save/PlannerSave.cs')!
    expect(save).toContain('public sealed class PlannerSaveException : InvalidOperationException')
    expect(save).toContain('public static readonly string[] Order = { Player, Inventory, QuestLog };')
    expect(save).toContain('is damaged and was not loaded')
    expect(save).toContain('newer than this build')
    expect(save).toContain('no migration from save version')
    const test = unityFile(buildReferenceSlice(), 'Unity/Tests/Editor/PlannerSaveTests.cs')!
    for (const t of ['RefusesADamagedSaveAndRestoresNothing', 'RefusesASaveFromANewerBuild', 'RestoresInThePlannedOrder', 'MigratesAnOldSaveAndKeepsPartsItDoesNotHave']) expect(test).toContain(t)
  })

  it('generates the save slice and the PlayMode test of saving into a fresh game', () => {
    const p = buildReferenceSlice()
    const slice = unityFile(p, 'Unity/Scripts/Generated/Save/PlannerSaveSlice.cs')!
    expect(slice).toContain('public sealed class PlannerSaveSlice : UnityEngine.MonoBehaviour, global::HoHPlanner.Runtime.IPlannerSaveSystem')
    expect(slice).toContain('State.Check(p.Kind, json);')
    expect(slice).toContain('State.BeginRestore();')
    const test = unityFile(p, 'Unity/Tests/PlayMode/PlannerPrototypeSceneTests.cs')!
    expect(test).toContain('TheSliceIsTheSameAfterSavingAndLoadingIntoAFreshGame')
    expect(test).toContain('Loading gives no second reward')
    expect(unityFile(p, 'Unity/Scripts/Generated/Story/PlannerQuestGraph.cs')).toContain('public string SaveState() => UnityEngine.JsonUtility.ToJson(Log);')
  })

  it('has no save slice without Save and load', () => {
    const p = buildReferenceSlice()
    ;(p.documents['technical.architecture'].data.prototype as Record<string, unknown>).saveLoad = false
    expect(unityFile(p, 'Unity/Scripts/Generated/Save/PlannerSaveSlice.cs')).toBeUndefined()
    expect(unityFile(p, 'Unity/Tests/PlayMode/PlannerPrototypeSceneTests.cs')).not.toContain('TheSliceIsTheSameAfterSavingAndLoadingIntoAFreshGame')
  })
})
