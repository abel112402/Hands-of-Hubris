import { describe, expect, it } from 'vitest'
import { deserializeProject } from '../src/core/persistence/serialize'
import { buildIR } from '../src/core/engine/ir'
import { unity } from '../src/core/engine/adapters/unity'

/** Plan § 7, fifth round: I7 quest graph and its reachability test, I9 save system, I19 scenes by roadmap phase. */
const fs: { readFileSync: (p: string, e: string) => string } = await import('node:fs' as string)
const cinderholm = () => deserializeProject(fs.readFileSync('examples/cinderholm.hohplan.json', 'utf8')).project
const { ir } = buildIR(cinderholm())
const files = new Map(unity.emit(ir).map((f) => [f.path, f.content]))

describe('quest graph (I7)', () => {
  it('takes quests, choices and endings with what they need', () => {
    expect(ir.story.quests).toHaveLength(9)
    const relight = ir.story.choices.find((c) => c.name === 'Relight it')!
    expect(relight).toMatchObject({ decision: 'Fate of the lighthouse', quest: 'TvZ4GG54', leadsTo: ['3o-ey99u'], blocks: ['5DNa7eM6'] })
    expect(ir.story.endings.find((e) => e.name === 'The beacon')).toMatchObject({ requiresQuests: ['3o-ey99u'], requiresChoices: ['TLXzmcGI'] })
  })

  it('writes the graph, a quest log that follows it, and a test that plays every choice', () => {
    const story = files.get('Scripts/Generated/Story/PlannerStory.cs')!
    expect(story).toContain('public enum PlannerQuest')
    expect(story).toContain('new ChoiceInfo("TLXzmcGI", "Relight it", "Fate of the lighthouse", PlannerQuest.TheIslandSSecret, new PlannerQuest[] { PlannerQuest.KeepTheLightBurning }, new PlannerQuest[] { PlannerQuest.IntoTheDarkTide }),')
    expect(files.get('Scripts/Generated/Story/PlannerQuestLog.cs')).toContain('public bool Complete(PlannerQuest quest)')
    expect(files.get('Tests/Editor/PlannerStoryTests.cs')).toContain('public void EveryQuestAndEndingCanBeReached()')
  })
})

describe('save system (I9)', () => {
  it('takes the version, slots and parts, and reads slots from the text when the fields are empty', () => {
    expect(ir.save).toMatchObject({ version: 3, manualSlots: 3, autoSlots: 3, compressed: true })
    expect(ir.save.parts.map((p) => [p.key, p.since])).toEqual([['town', 1], ['villagers', 1], ['hero', 1], ['quest_log', 2], ['world_clock', 3]])
    const p = cinderholm()
    const s = p.documents['technical.save'].data.save as Record<string, unknown>
    delete s.manualSlots
    delete s.autoSlots
    s.requirements = '2 manual slots + 4 rotating autosaves'
    expect(buildIR(p).ir.save).toMatchObject({ manualSlots: 2, autoSlots: 4 })
  })

  it('writes the save system with keys, migrations and a test', () => {
    const code = files.get('Scripts/Generated/Save/PlannerSave.cs')!
    expect(code).toContain('public const int Version = 3;')
    expect(code).toContain('public const string QuestLog = "quest_log";')
    expect(code).toContain('[QuestLog] = 2,')
    expect(code).toContain('public static void AddMigration(int fromVersion, Action<PlannerSaveFile> step)')
    expect(files.get('Tests/Editor/PlannerSaveTests.cs')).toContain('public void MigratesAnOldSaveAndKeepsPartsItDoesNotHave()')
  })
})

describe('scenes by phase (I19)', () => {
  it('orders the scenes by load order with the phase from which builds include them', () => {
    expect(ir.scenes.scenes.map((s) => [s.name, s.phase])).toEqual([['Bootstrap', 0], ['Persistent systems', 1], ['Main menu', 1], ['World', 1], ['HUD', 2]])
    const code = files.get('Scripts/Generated/PlannerScenes.cs')!
    expect(code).toContain('new Entry("HUD", "Additive UI", 3, 2),')
    expect(code).toContain('public static string[] PlannerBuildSettings(int phase)')
    expect(fs.readFileSync('engine-packages/unity/com.handsofhubris.planner-bridge/Editor/PlannerCI.cs', 'utf8')).toContain('public static void BuildScenes()')
  })
})
