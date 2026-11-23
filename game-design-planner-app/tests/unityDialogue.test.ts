import { describe, expect, it } from 'vitest'
import { buildReferenceSlice, IDS } from './fixtures/referenceSlice3d'
import { buildIR } from '../src/core/engine/ir'
import { buildBundle } from '../src/core/engine/bundle'
import { prototypeReport } from '../src/core/engine/capabilities'
import { dialogueRules } from '../src/core/gameplay'
import type { Entity, Project } from '../src/core/model/types'

/**
 * plans/UNITY_PLAYABLE_GAME_GENERATION_PLAN.md, phase 16: an NPC placed on the map talks from the plan's typed Dialogue
 * lines; an option's story choice and items happen once, are saved, and are tested in the generated scene test.
 */
const AT = '2026-01-01T00:00:00.000Z'
const lines = (p: Project) => p.documents['design.story'].data.dialogueLines as Entity[]
const line = (p: Project, id: string) => lines(p).find((l) => l.id === id)!
const proto = (p: Project) => p.documents['technical.architecture'].data.prototype as Record<string, unknown>
const unityFile = (p: Project, path: string) => buildBundle(p, 'unity', AT).files.find((f) => f.path === path)?.content
const report = (p: Project) => prototypeReport(p, 'unity').issues

describe('dialogue rules from the plan', () => {
  it('reads the typed lines: the start, the options with their choice and items', () => {
    const { lines: rules, issues } = dialogueRules(buildReferenceSlice())
    expect(issues).toEqual([])
    expect(rules).toEqual([
      { line: IDS.lineGreet, speaker: IDS.keeper, text: 'Lost something? The old key went down by the well.', give: [] },
      { line: IDS.lineHelp, speaker: IDS.keeper, text: 'Good. Here, for your trouble.', after: IDS.lineGreet, option: 'I will find it.', choice: IDS.choiceHelp, give: [{ item: IDS.itemCoin, count: 2 }] },
      { line: IDS.lineRefuse, speaker: IDS.keeper, text: 'Suit yourself.', after: IDS.lineGreet, option: 'Not my problem.', choice: IDS.choiceRefuse, give: [] },
    ])
  })

  it('reports what cannot run, and leaves those lines out', () => {
    const p = buildReferenceSlice()
    line(p, IDS.lineHelp).speaker = 'ghost'
    delete line(p, IDS.lineRefuse).option
    line(p, IDS.lineGreet).choice = IDS.choiceHelp
    lines(p).push({ id: 'refLnLost', name: 'Lost', speaker: IDS.keeper, text: 'Hm?', after: 'nowhere', option: '?', choice: 'noChoice', giveItems: { ghostItem: 1 } })
    const { lines: rules, issues } = dialogueRules(p)
    expect(issues.map((i) => [i.code, i.where.id, i.where.field])).toEqual([
      ['gameplay.lineChoice', IDS.lineGreet, 'choice'],
      ['gameplay.lineSpeaker', IDS.lineHelp, 'speaker'],
      ['gameplay.lineOption', IDS.lineRefuse, 'option'],
      ['gameplay.lineAfter', 'refLnLost', 'after'],
      ['gameplay.lineChoice', 'refLnLost', 'choice'],
      ['gameplay.unknownItem', 'refLnLost', 'giveItems'],
    ])
    expect(rules).toEqual([])
  })

  it('refuses a loop and warns about a second start', () => {
    const p = buildReferenceSlice()
    line(p, IDS.lineGreet).after = IDS.lineHelp
    line(p, IDS.lineGreet).option = 'Again?'
    const loop = dialogueRules(p)
    expect(loop.issues.some((i) => i.code === 'gameplay.lineLoop')).toBe(true)
    expect(loop.lines).toEqual([])
    const q = buildReferenceSlice()
    lines(q).push({ id: 'refLnBye', name: 'Bye', speaker: IDS.keeper, text: 'Off you go.' })
    expect(dialogueRules(q).issues).toEqual([expect.objectContaining({ level: 'warning', code: 'gameplay.manyStarts', where: expect.objectContaining({ id: 'refLnBye' }) })])
  })
})

describe('NPC dialogue in the capability matrix', () => {
  it('is a template in Unity, and the reference is playable with it', () => {
    const r = prototypeReport(buildReferenceSlice(), 'unity')
    expect(r.systems.find((s) => s.id === 'dialogue')?.level).toBe('template')
    expect(r.playable).toBe(true)
  })

  it('asks for a placed NPC with a starting line, and for Quests, the Inventory and a Dialogue save part when they are used', () => {
    const p = buildReferenceSlice()
    proto(p).quests = false
    proto(p).inventory = false
    const requires = report(p).filter((i) => i.code === 'proto.requires' && i.field === 'dialogue').map((i) => i.where?.field)
    expect(requires).toEqual(['quests', 'inventory'])

    const q = buildReferenceSlice()
    line(q, IDS.lineGreet).speaker = 'ghost'
    const missing = report(q).filter((i) => i.code === 'proto.dataMissing' && i.field === 'dialogue')
    expect(missing.map((i) => i.message)).toEqual([expect.stringContaining('starts the conversation of a placed NPC')])

    const s = buildReferenceSlice()
    s.documents['technical.save'].data.parts = (s.documents['technical.save'].data.parts as Entity[]).filter((x) => x.state !== 'Dialogue')
    expect(report(s).some((i) => i.code === 'proto.dataMissing' && i.message.includes('Runtime state is Dialogue'))).toBe(true)
  })

  it('says that the dialogue style text does not run', () => {
    const p = buildReferenceSlice()
    p.documents['design.story'].data.dialogue = { tone: 'Wry and short.' }
    expect(report(p)).toContainEqual(expect.objectContaining({ level: 'info', code: 'proto.dialogueStyle' }))
  })
})

describe('Unity export of NPC dialogue', () => {
  it('carries the characters and lines in the IR and the NPC placement', () => {
    const g = buildIR(buildReferenceSlice()).ir.gameplay!
    expect(g.dialogue?.characters).toEqual([{ character: IDS.keeper, name: 'Keeper' }])
    expect(g.dialogue?.lines.map((l) => [l.line, l.after, l.choice, l.give])).toEqual([
      [IDS.lineGreet, undefined, undefined, []],
      [IDS.lineHelp, IDS.lineGreet, IDS.choiceHelp, [{ item: IDS.itemCoin, key: 'item.coin', count: 2 }]],
      [IDS.lineRefuse, IDS.lineGreet, IDS.choiceRefuse, []],
    ])
    expect(g.placements.find((x) => x.role === 'npc')).toMatchObject({ object: IDS.npcSpawn, character: IDS.keeper })
  })

  it('makes choices through the generated quest graph by planner ID', () => {
    const graph = unityFile(buildReferenceSlice(), 'Unity/Scripts/Generated/Story/PlannerQuestGraph.cs')!
    expect(graph).toContain('public bool KnowsChoice(string choiceId) => TryFindChoice(choiceId, out _);')
    expect(graph).toContain('public bool Choose(string choiceId) => TryFindChoice(choiceId, out var c) && Log.Choose(c);')
    expect(graph).toContain('public bool IsDecided(string choiceId)')
  })

  it('names the NPCs and lines, and tests the conversation in the scene, also after saving and loading', () => {
    const p = buildReferenceSlice()
    const config = unityFile(p, 'Unity/Scripts/Generated/Gameplay/PlannerGameplay.cs')!
    expect(config).toContain(`Npcs = { ("${IDS.npcSpawn}", "${IDS.keeper}", "Keeper", "${IDS.lineGreet}") };`)
    expect(config).toContain(`("${IDS.lineHelp}", "${IDS.keeper}", "${IDS.lineGreet}", "I will find it.", "${IDS.choiceHelp}", new (string, int)[] { ("${IDS.itemCoin}", 2) })`)
    const test = unityFile(p, 'Unity/Tests/PlayMode/PlannerPrototypeSceneTests.cs')!
    expect(test).toContain('TalkingToTheNpcMakesThePlannedChoiceOnce')
    expect(test).toContain('TheConversationIsTheSameAfterSavingAndLoading')
    expect(unityFile(p, 'Unity/Scripts/Generated/Save/PlannerSave.cs')).toContain('Dialogue')

    proto(p).dialogue = false
    expect(unityFile(p, 'Unity/Tests/PlayMode/PlannerPrototypeSceneTests.cs')).not.toContain('TalkingToTheNpc')
    expect(unityFile(p, 'Unity/Scripts/Generated/Gameplay/PlannerGameplay.cs')).toContain('Npcs = {  };')
  })
})
