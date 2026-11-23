import { describe, expect, it } from 'vitest'
import { buildReferenceSlice, IDS } from './fixtures/referenceSlice3d'
import { buildIR } from '../src/core/engine/ir'
import { buildBundle } from '../src/core/engine/bundle'
import { prototypeReport } from '../src/core/engine/capabilities'
import { inventoryRules } from '../src/core/gameplay'
import type { Entity, Project } from '../src/core/model/types'

/**
 * plans/UNITY_PLAYABLE_GAME_GENERATION_PLAN.md, phase 10: the inventory from the plan (slots, each item's stack size,
 * no hidden defaults) and the HUD elements bound to it (a Grid bound to the inventory, Counters bound to items).
 */
const AT = '2026-01-01T00:00:00.000Z'
const items = (p: Project) => p.documents['design.items'].data.items as Entity[]
const model = (p: Project) => p.documents['design.items'].data.model as Record<string, unknown>
const proto = (p: Project) => p.documents['technical.architecture'].data.prototype as Record<string, unknown>
const hud = (p: Project) => (p.documents['design.ui'].data.screens as { layout: { elements: { kind: string; bind?: { source: string } }[] } }[])[0]
const unityFile = (p: Project, path: string) => buildBundle(p, 'unity', AT).files.find((f) => f.path === path)?.content
const dataInvalid = (p: Project) => prototypeReport(p, 'unity').issues.filter((i) => i.code === 'proto.dataInvalid')

describe('inventory rules from the plan', () => {
  it('reads the slots, each item’s stack and what the HUD shows', () => {
    const { rules, issues } = inventoryRules(buildReferenceSlice())
    expect(issues).toEqual([])
    expect(rules).toEqual({
      slots: 8,
      items: [
        { item: IDS.itemKey, name: 'Brass Key', stack: 1 },
        { item: IDS.itemCoin, name: 'Coin', stack: 999 },
        { item: IDS.itemStick, name: 'Stick', stack: 1 },
        { item: IDS.itemPolished, name: 'Polished Key', stack: 1 },
      ],
      shown: { grid: true, counters: [IDS.itemCoin] },
    })
  })

  it('uses the Item model’s default stack for an item without one, and reports an item with neither', () => {
    const p = buildReferenceSlice()
    delete items(p)[1].stack
    expect(inventoryRules(p).rules.items[1]).toEqual({ item: IDS.itemCoin, name: 'Coin', stack: 1 })
    delete model(p).defaultStack
    const { rules, issues } = inventoryRules(p)
    expect(rules.items.map((i) => i.item)).toEqual([IDS.itemKey, IDS.itemStick, IDS.itemPolished])
    expect(issues).toEqual([expect.objectContaining({ level: 'error', code: 'gameplay.noStack', where: { doc: 'design.items', section: 'items', id: IDS.itemCoin, field: 'stack' } })])
    expect(dataInvalid(p).map((i) => i.field)).toEqual(['gameplay.noStack'])
  })

  it('reports a stack or slot count that is not a whole number ≥ 1', () => {
    const p = buildReferenceSlice()
    items(p)[0].stack = 2.5
    ;(p.documents['design.items'].data.inventory as Record<string, unknown>).slots = -1
    expect(inventoryRules(p).issues.map((i) => i.code).sort()).toEqual(['gameplay.badSlots', 'gameplay.badStack'])
  })

  it('warns when no HUD element shows the inventory', () => {
    const p = buildReferenceSlice()
    hud(p).layout.elements = hud(p).layout.elements.filter((e) => e.kind === 'questTracker')
    const w = prototypeReport(p, 'unity').issues.find((i) => i.field === 'gameplay.inventoryNotShown')
    expect(w?.level).toBe('warning')
    expect(w?.where).toEqual({ doc: 'design.ui', section: 'screens' })
  })

  it('checks nothing when the plan did not choose the inventory', () => {
    const p = buildReferenceSlice()
    delete model(p).defaultStack
    delete items(p)[1].stack
    proto(p).inventory = false
    expect(dataInvalid(p)).toEqual([])
    expect(buildIR(p).ir.gameplay?.inventory).toBeUndefined()
  })
})

describe('inventory in the IR and the Unity export', () => {
  it('carries the slots and items with their record keys', () => {
    expect(buildIR(buildReferenceSlice()).ir.gameplay?.inventory).toEqual({
      slots: 8,
      items: [
        { item: IDS.itemKey, key: 'item.brass_key', name: 'Brass Key', stack: 1 },
        { item: IDS.itemCoin, key: 'item.coin', name: 'Coin', stack: 999 },
        { item: IDS.itemStick, key: 'item.stick', name: 'Stick', stack: 1 },
        { item: IDS.itemPolished, key: 'item.polished_key', name: 'Polished Key', stack: 1 },
      ],
      shown: { grid: true, counters: [IDS.itemCoin] },
    })
  })

  it('is a working module in Unity; the export names the slots and the HUD bindings, and tests them in the scene', () => {
    const p = buildReferenceSlice()
    expect(prototypeReport(p, 'unity').systems.find((s) => s.id === 'inventory')?.level).toBe('template')
    const config = unityFile(p, 'Unity/Scripts/Generated/Gameplay/PlannerGameplay.cs')!
    expect(config).toContain('public const int InventorySlots = 8;')
    expect(config).toContain('public const bool HudShowsInventory = true;')
    expect(config).toContain(`HudItemCounters = { "${IDS.itemCoin}" };`)
    expect(unityFile(p, 'Unity/UI/Screens/Hud.uxml')).toContain('name="bind-inventory"')
    expect(unityFile(p, 'Unity/Tests/PlayMode/PlannerPrototypeSceneTests.cs')).toContain('PickingUpFillsTheInventoryAndTheHud')
    expect(buildBundle(p, 'unity', AT).manifest.requires?.runtime.version).toBe('0.15.0')
  })
})
