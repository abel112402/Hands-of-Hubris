import { describe, expect, it } from 'vitest'
import { buildReferenceSlice, IDS } from './fixtures/referenceSlice3d'
import { buildBundle } from '../src/core/engine/bundle'
import { prototypeReport } from '../src/core/engine/capabilities'
import type { Entity, Project } from '../src/core/model/types'

/**
 * plans/UNITY_PLAYABLE_GAME_GENERATION_PLAN.md, phase 11: typed quest goals and rewards in the runtime. The plan's quest
 * graph stays the authority (the generated PlannerQuestLog, exposed to the runtime by the generated PlannerQuestGraph);
 * text-only quests are shown as not executable.
 */
const AT = '2026-01-01T00:00:00.000Z'
const proto = (p: Project) => p.documents['technical.architecture'].data.prototype as Record<string, unknown>
const quests = (p: Project) => p.documents['design.story'].data.quests as Entity[]
const unityFile = (p: Project, path: string) => buildBundle(p, 'unity', AT).files.find((f) => f.path === path)?.content
const issues = (p: Project) => prototypeReport(p, 'unity').issues

describe('quests in the capability matrix', () => {
  it('are a working module in Unity; no system of the reference is left a frame', () => {
    const r = prototypeReport(buildReferenceSlice(), 'unity')
    expect(r.systems.find((s) => s.id === 'quests')?.level).toBe('template')
    expect(r.systems.filter((s) => s.level === 'frame').map((s) => s.id)).toEqual([])
    expect(r.issues.filter((i) => i.level === 'error')).toEqual([])
  })

  it('need the inventory, because their goals are items to hold', () => {
    const p = buildReferenceSlice()
    proto(p).inventory = false
    expect(issues(p)).toContainEqual(expect.objectContaining({ level: 'error', code: 'proto.requires', field: 'quests', where: expect.objectContaining({ field: 'inventory' }) }))
  })

  it('show a quest with only objective texts as not executable', () => {
    const p = buildReferenceSlice()
    quests(p).push({ id: 'refQuestTalk', name: 'Talk to the keeper', objectives: [{ text: 'Find the keeper' }] })
    const w = issues(p).find((i) => i.code === 'proto.questTextOnly')
    expect(w).toMatchObject({ level: 'warning', field: 'refQuestTalk', where: { doc: 'design.story', section: 'quests', id: 'refQuestTalk', field: 'collectItems' } })
    expect(w?.message).toContain('Talk to the keeper has no typed goal')
  })

  it('stop the export on a reference to an item that does not exist', () => {
    const p = buildReferenceSlice()
    quests(p)[0].rewardItems = { noSuchItem: 2 }
    expect(issues(p)).toContainEqual(expect.objectContaining({ level: 'error', code: 'proto.dataInvalid', field: 'gameplay.unknownItem' }))
  })
})

describe('Unity export of quests', () => {
  it('generates the quest graph for the runtime over PlannerQuestLog', () => {
    const graph = unityFile(buildReferenceSlice(), 'Unity/Scripts/Generated/Story/PlannerQuestGraph.cs')!
    expect(graph).toContain('public sealed class PlannerQuestGraph : UnityEngine.MonoBehaviour, global::HoHPlanner.Runtime.IPlannerQuestGraph')
    expect(graph).toContain('public PlannerQuestLog Log = new PlannerQuestLog();')
    expect(graph).toContain('public bool Complete(string questId) => TryFind(questId, out var q) && Log.Complete(q);')
  })

  it('names the typed quests with goals and rewards, and tests them in the scene', () => {
    const p = buildReferenceSlice()
    const config = unityFile(p, 'Unity/Scripts/Generated/Gameplay/PlannerGameplay.cs')!
    expect(config).toContain(`Quests = { ("${IDS.quest}", "Find the brass key", new (string, int)[] { ("${IDS.itemKey}", 1) }, new (string, int)[] { ("${IDS.itemCoin}", 5) }) };`)
    const test = unityFile(p, 'Unity/Tests/PlayMode/PlannerPrototypeSceneTests.cs')!
    expect(test).toContain('TheQuestCompletesOnlyByPlayingAndRewardsOnce')
    expect(test).toContain('The reward is given exactly once')
  })

  it('has no quest graph or quest test without the Quests system', () => {
    const p = buildReferenceSlice()
    proto(p).quests = false
    expect(unityFile(p, 'Unity/Scripts/Generated/Story/PlannerQuestGraph.cs')).toBeUndefined()
    expect(unityFile(p, 'Unity/Tests/PlayMode/PlannerPrototypeSceneTests.cs')).not.toContain('TheQuestCompletesOnlyByPlayingAndRewardsOnce')
  })
})
