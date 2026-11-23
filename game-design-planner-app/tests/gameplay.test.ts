import { describe, expect, it } from 'vitest'
import { buildReferenceSlice, IDS } from './fixtures/referenceSlice3d'
import { placements, questRules } from '../src/core/gameplay'
import { prototypeReport } from '../src/core/engine/capabilities'
import { deserializeProject, serializeProject } from '../src/core/persistence/serialize'
import { mapOf } from '../src/core/location/schema'
import type { Entity, Project } from '../src/core/model/types'

/** plans/UNITY_PLAYABLE_GAME_GENERATION_PLAN.md, phase 2: typed goals, rewards and placements. */
const fs: { readFileSync: (p: string, e: string) => string } = await import('node:fs' as string)
const quest = (p: Project) => (p.documents['design.story'].data.quests as Entity[])[0]
const yard = (p: Project) => (p.documents['design.world'].data.locations as Entity[])[0]
const mapObjects = (p: Project) => Object.values(mapOf(yard(p))!.layers).flatMap((l) => l.objects)

describe('quest rules', () => {
  it('reads the typed goal and the once-only item reward of the reference quest', () => {
    const { rules, issues } = questRules(buildReferenceSlice())
    expect(issues).toEqual([])
    expect(rules).toEqual([
      {
        quest: IDS.quest,
        name: 'Find the brass key',
        completeWhen: { kind: 'holdItems', items: [{ item: IDS.itemKey, count: 1 }] },
        onComplete: [{ kind: 'giveItems', items: [{ item: IDS.itemCoin, count: 5 }] }],
        money: 5,
        xp: 10,
        objectives: ['Pick up the Brass Key'],
      },
    ])
  })

  it('keeps a quest without a typed goal as text, and says so instead of guessing from the text', () => {
    const p = buildReferenceSlice()
    delete quest(p).collectItems
    const { rules, issues } = questRules(p)
    expect(rules[0].completeWhen).toBeUndefined()
    expect(rules[0].objectives).toEqual(['Pick up the Brass Key'])
    expect(issues).toEqual([expect.objectContaining({ level: 'info', code: 'gameplay.textOnlyGoal', where: { doc: 'design.story', section: 'quests', id: IDS.quest, field: 'collectItems' } })])
  })

  it('rejects unknown items and amounts that are not whole numbers of at least 1, never rounding them', () => {
    const p = buildReferenceSlice()
    quest(p).collectItems = { [IDS.itemKey]: 1.5, ghost: 1 }
    quest(p).rewardItems = { [IDS.itemCoin]: 0 }
    const { rules, issues } = questRules(p)
    expect(rules[0].completeWhen).toBeUndefined()
    expect(rules[0].onComplete).toEqual([])
    expect(issues.filter((i) => i.level === 'error').map((i) => [i.code, i.where.field])).toEqual([
      ['gameplay.badCount', 'collectItems'],
      ['gameplay.unknownItem', 'collectItems'],
      ['gameplay.badCount', 'rewardItems'],
    ])
  })
})

describe('placements', () => {
  it('finds the player start, the key pickup and the enemy on the location map', () => {
    const { placements: all, issues } = placements(buildReferenceSlice())
    expect(issues).toEqual([])
    expect(all.map((x) => [x.role, x.object, x.item, x.count])).toEqual([
      ['player', IDS.start, undefined, 1],
      ['item', IDS.pickup, IDS.itemKey, 1],
      ['enemy', IDS.enemySpawn, undefined, 1],
      ['npc', IDS.npcSpawn, undefined, 1],
      ['merchant', IDS.merchantSpot, undefined, 1],
      ['item', IDS.caveCoin, IDS.itemCoin, 3],
    ])
    expect(all.find((x) => x.role === 'npc')?.character).toBe(IDS.keeper)
    expect(all.find((x) => x.role === 'enemy')?.enemy).toBe(IDS.enemy)
  })

  it('reports a pickup of an unknown item and a second player start', () => {
    const p = buildReferenceSlice()
    const objs = mapObjects(p)
    objs.find((o) => o.id === IDS.pickup)!.spawn = { role: 'item', refId: 'ghost' }
    const layer = Object.values(mapOf(yard(p))!.layers)[0]
    layer.objects.push({ id: 'start2', kind: 'marker', x: 1, y: 1, spawn: { role: 'player' } })
    const { placements: all, issues } = placements(p)
    expect(all.filter((x) => x.role === 'item' && x.location === IDS.location)).toEqual([])
    expect(issues.map((i) => [i.level, i.code])).toEqual([['error', 'gameplay.unknownItem'], ['warning', 'gameplay.manyStarts']])
  })

  it('survives a save and load with the new spawn roles', () => {
    const back = deserializeProject(serializeProject(buildReferenceSlice()))
    expect(back.warnings).toEqual([])
    expect(placements(back.project).placements).toHaveLength(6)
  })
})

describe('prototype checks use the typed data', () => {
  it('asks for a typed goal and placements when quests, movement, combat and dialogue are chosen', () => {
    const p = buildReferenceSlice()
    delete quest(p).collectItems
    for (const o of mapObjects(p)) delete o.spawn
    const missing = prototypeReport(p, 'unity').issues.filter((i) => i.code === 'proto.dataMissing').map((i) => i.field)
    // Without the yard's spawns there is no NPC either: dialogue misses the placed NPC and its starting line. The cave's
    // Coin pile is still an item to pick up, so interaction misses nothing.
    // No merchant placed either: trading misses the placed merchant and its offers.
    expect(missing).toEqual(['movement', 'quests', 'combat', 'dialogue', 'dialogue', 'trade', 'trade'])
  })

  it('blocks on invalid typed data', () => {
    const p = buildReferenceSlice()
    quest(p).rewardItems = { [IDS.itemCoin]: -2 }
    expect(prototypeReport(p, 'unity').issues).toContainEqual(expect.objectContaining({ level: 'error', code: 'proto.dataInvalid', field: 'gameplay.badCount' }))
  })
})

describe('older plans', () => {
  it('load and save without losing data, and their quests are text-only goals', () => {
    const text = fs.readFileSync('examples/cinderholm.hohplan.json', 'utf8')
    const { project, warnings } = deserializeProject(text)
    expect(warnings).toEqual([])
    expect(deserializeProject(serializeProject(project)).project).toEqual(project)
    const { rules, issues } = questRules(project)
    expect(rules).toHaveLength(9)
    expect(rules.every((r) => !r.completeWhen)).toBe(true)
    expect(issues.every((i) => i.code === 'gameplay.textOnlyGoal')).toBe(true)
  })
})
