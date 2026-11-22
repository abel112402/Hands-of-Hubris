import { describe, expect, it } from 'vitest'
import { buildReferenceSlice, IDS } from './fixtures/referenceSlice3d'
import { buildIR } from '../src/core/engine/ir'
import { buildBundle } from '../src/core/engine/bundle'
import { prototypeReport } from '../src/core/engine/capabilities'
import { recipeRules } from '../src/core/gameplay'
import type { Entity, Project } from '../src/core/model/types'

/**
 * plans/UNITY_PLAYABLE_GAME_GENERATION_PLAN.md, phase 14: the plan's recipes as typed rules (item inputs, one output,
 * unlocking quests) that the Unity runtime crafts all or nothing; what the prototype does not run is reported.
 */
const AT = '2026-01-01T00:00:00.000Z'
const recipes = (p: Project) => p.documents['design.items'].data.recipes as Entity[]
const proto = (p: Project) => p.documents['technical.architecture'].data.prototype as Record<string, unknown>
const unityFile = (p: Project, path: string) => buildBundle(p, 'unity', AT).files.find((f) => f.path === path)?.content
const withRecipe = (extra: Record<string, unknown>) => {
  const p = buildReferenceSlice()
  recipes(p).push({ id: 'rcpX', name: 'Test recipe', result: IDS.itemPolished, ingredients: { [IDS.itemCoin]: 1 }, ...extra })
  return p
}

describe('recipe rules from the plan', () => {
  it('reads inputs, output and unlocking quests', () => {
    const { rules, issues } = recipeRules(buildReferenceSlice())
    expect(issues).toEqual([])
    expect(rules).toEqual([
      { recipe: IDS.recipe, name: 'Polished Key', inputs: [{ item: IDS.itemKey, count: 1 }, { item: IDS.itemCoin, count: 2 }], output: { item: IDS.itemPolished, count: 1 }, unlockQuests: [IDS.quest] },
    ])
  })

  it('takes an empty Output quantity as 1, as the field says, and refuses a bad one', () => {
    expect(recipeRules(withRecipe({})).rules.find((r) => r.recipe === 'rcpX')?.output).toEqual({ item: IDS.itemPolished, count: 1 })
    const bad = recipeRules(withRecipe({ outputQty: 0 }))
    expect(bad.rules.some((r) => r.recipe === 'rcpX')).toBe(false)
    expect(bad.issues).toContainEqual(expect.objectContaining({ level: 'error', code: 'gameplay.badCount', where: expect.objectContaining({ id: 'rcpX', field: 'outputQty' }) }))
  })

  it('reports a recipe without a result or without ingredients', () => {
    expect(recipeRules(withRecipe({ result: 'nope' })).issues.map((i) => i.code)).toContain('gameplay.recipeResult')
    expect(recipeRules(withRecipe({ ingredients: {} })).issues.map((i) => i.code)).toContain('gameplay.recipeNoInputs')
    expect(recipeRules(withRecipe({ ingredients: { ghost: 1 } })).issues.map((i) => i.code)).toContain('gameplay.unknownItem')
  })

  it('leaves out a recipe that needs raw resources, saying why', () => {
    const { rules, issues } = recipeRules(withRecipe({ resources: { wood: 2 } }))
    expect(rules.some((r) => r.recipe === 'rcpX')).toBe(false)
    expect(issues).toContainEqual(expect.objectContaining({ level: 'warning', code: 'gameplay.recipeResources' }))
  })

  it('says what it does not check: station, skill, other unlocks, craft time; and that several quests must all be done', () => {
    const p = withRecipe({ station: 'st1', craftTime: 5, unlockedBy: [IDS.quest, 'refQuestOther'] })
    ;(p.documents['design.story'].data.quests as Entity[]).push({ id: 'refQuestOther', name: 'Other' })
    const { rules, issues } = recipeRules(p)
    expect(rules.find((r) => r.recipe === 'rcpX')?.unlockQuests).toEqual([IDS.quest, 'refQuestOther'])
    expect(issues.find((i) => i.code === 'gameplay.recipeUnchecked')?.message).toBe('Test recipe: the prototype does not check station, craft time (crafting is instant).')
    expect(issues.find((i) => i.code === 'gameplay.recipeUnlocks')?.message).toContain('all 2 quests')
  })
})

describe('crafting in the capability matrix', () => {
  it('is a working module in Unity, and the reference stays playable with it', () => {
    const r = prototypeReport(buildReferenceSlice(), 'unity')
    expect(r.systems.find((s) => s.id === 'crafting')?.level).toBe('template')
    expect(r.playable).toBe(true)
  })

  it('needs a crafting control and a recipe the prototype can craft', () => {
    const p = buildReferenceSlice()
    for (const c of p.documents['design.ui'].data.controls as Record<string, unknown>[]) if (c.drives === 'Open crafting') delete c.drives
    recipes(p)[0].resources = { wood: 1 }
    const missing = prototypeReport(p, 'unity').issues.filter((i) => i.code === 'proto.dataMissing' && i.field === 'crafting').map((i) => i.message)
    expect(missing).toEqual([expect.stringContaining('a recipe the prototype can craft'), expect.stringContaining('Open crafting')])
  })

  it('needs Quests when a recipe is unlocked by one', () => {
    const p = buildReferenceSlice()
    proto(p).quests = false
    expect(prototypeReport(p, 'unity').issues).toContainEqual(expect.objectContaining({ level: 'error', code: 'proto.requires', field: 'crafting', where: expect.objectContaining({ field: 'quests' }) }))
  })
})

describe('Unity export of crafting', () => {
  it('carries the recipes with record keys in the IR', () => {
    expect(buildIR(buildReferenceSlice()).ir.gameplay?.crafting).toEqual({
      recipes: [
        {
          recipe: IDS.recipe,
          key: 'rcp.polished_key',
          name: 'Polished Key',
          inputs: [{ item: IDS.itemKey, key: 'item.brass_key', count: 1 }, { item: IDS.itemCoin, key: 'item.coin', count: 2 }],
          output: { item: IDS.itemPolished, key: 'item.polished_key', count: 1 },
          unlockQuests: [IDS.quest],
        },
      ],
    })
  })

  it('binds the planned crafting key, names the recipes and tests crafting in the scene', () => {
    const p = buildReferenceSlice()
    const asset = JSON.parse(unityFile(p, 'Unity/Input/ReferenceSlice3D.inputactions')!)
    const map = asset.maps.find((m: { name: string }) => m.name === 'Prototype')
    expect(map.bindings.find((b: { action: string }) => b.action === 'Crafting').path).toBe('<Keyboard>/c')
    const config = unityFile(p, 'Unity/Scripts/Generated/Gameplay/PlannerGameplay.cs')!
    expect(config).toContain('public const string CraftingKey = "c";')
    expect(config).toContain(`("${IDS.recipe}", "Polished Key", new (string, int)[] { ("${IDS.itemKey}", 1), ("${IDS.itemCoin}", 2) }, ("${IDS.itemPolished}", 1), new string[] { "${IDS.quest}" })`)
    const test = unityFile(p, 'Unity/Tests/PlayMode/PlannerPrototypeSceneTests.cs')!
    expect(test).toContain('CraftsExactlyAndNeverConsumesInPart')
    expect(test).toContain('Nothing consumed in part')
  })

  it('has no crafting action or test without the Crafting system', () => {
    const p = buildReferenceSlice()
    proto(p).crafting = false
    expect(buildIR(p).ir.gameplay?.crafting).toBeUndefined()
    expect(unityFile(p, 'Unity/Tests/PlayMode/PlannerPrototypeSceneTests.cs')).not.toContain('CraftsExactlyAndNeverConsumesInPart')
  })
})
