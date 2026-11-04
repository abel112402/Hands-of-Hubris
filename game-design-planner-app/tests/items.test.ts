import { describe, expect, it } from 'vitest'
import { collectHints, makeContext } from '../src/core/hints/engine'
import { moduleToMarkdown } from '../src/core/export/markdown'
import { createProject, makeId } from '../src/core/model/project'
import { ensureDocument, getModule, getSection } from '../src/core/modules/registry'
import { hiddenGroups } from '../src/core/groupFilter'
import { coverage, finalValue, ITEMS_DOC, itemSources, itemUses, lootOdds, rawCost, simulateLoot, valueAdded } from '../src/core/items'
import type { CollectionSection } from '../src/core/model/types'

const itemsMod = getModule(ITEMS_DOC)!

function itemsProject() {
  const p = createProject('T')
  const d = p.documents[ITEMS_DOC].data
  d.items = [
    { id: 'plank', name: 'Plank', type: 'resource-item', rarity: 'common', quality: 'normal', value: 2, stack: 50 },
    { id: 'hatchet', name: 'Hatchet', type: 'tool', rarity: 'common', quality: 'normal', value: 10, weight: 1.5, durability: 100 },
  ]
  d.stations = [{ id: 's1', name: 'Workbench' }]
  d.recipes = [
    { id: 'r1', name: 'Plank', result: 'plank', outputQty: 2, resources: { wood: 2 }, station: 's1', tier: 1 },
    { id: 'r2', name: 'Hatchet', result: 'hatchet', ingredients: { plank: 3 }, station: 's1', tier: 2 },
  ]
  return p
}
const ruleIds = (p: ReturnType<typeof createProject>) =>
  collectHints(makeContext(p, { docId: ITEMS_DOC })).filter((h) => h.ruleId.startsWith('items.')).map((h) => h.ruleId)

describe('items module v2', () => {
  it('migrates quantities, stations, loot lines and free text', () => {
    const p = createProject('t')
    p.documents[ITEMS_DOC] = {
      moduleVersion: 1,
      data: {
        items: [
          { id: 'iron', name: 'Iron', stats: '+1 armor', sources: 'Mines' },
          { id: 'gem', name: 'Gem' },
        ],
        recipes: [
          { id: 'r', name: 'Blade', result: 'iron', ingredients: ['iron', 'gem'], station: 'Forge' },
          { id: 'r2', name: 'Ring', result: 'gem', ingredients: [], station: 'forge' },
        ],
        loot: [{ id: 'l', name: 'Goblin', source: 'Goblins', entries: ['Iron, 20%', 'gem: 5', 'Mystery box 1%'] }],
        inventory: { slots: '20 slots' },
      },
    }
    const doc = ensureDocument(p, itemsMod, makeId)
    expect(doc.moduleVersion).toBe(2)
    expect(doc.data.items[0]).toMatchObject({ notes: '+1 armor', legacyNotes: 'Sources: Mines' })
    expect(doc.data.items[0].stats).toBeUndefined()
    expect(doc.data.recipes[0].ingredients).toEqual({ iron: 1, gem: 1 })
    expect(doc.data.stations).toHaveLength(1)
    expect(doc.data.recipes[0].station).toBe(doc.data.stations[0].id)
    expect(doc.data.recipes[1].station).toBe(doc.data.stations[0].id)
    expect(doc.data.loot[0]).toMatchObject({ weights: { iron: 20, gem: 5 }, legacyNotes: 'Source: Goblins\nMystery box 1%' })
    expect(doc.data.loot[0].entries).toBeUndefined()
    expect(doc.data.inventory).toEqual({ notes: '20 slots' })
  })

  it('exports in the order of items_crafting.md with summaries and item sheets', () => {
    const md = moduleToMarkdown(itemsProject(), itemsMod)
    const heads = md.split('\n').filter((l) => l.startsWith('## ')).map((l) => l.replace(/^## \d+\. /, ''))
    const order = ['Item model', 'Rarity tiers', 'Quality tiers', 'Item types', 'Items', 'Recipes', 'Inventory and storage', 'Loot tables']
    const pos = order.map((h) => heads.indexOf(h))
    expect(pos.every((i) => i >= 0)).toBe(true)
    expect([...pos].sort((a, b) => a - b)).toEqual(pos)
    expect(md).toContain('**Coverage**')
    expect(md).toContain('* **Hatchet:** Tool / Common / Normal · value 10 · weight 1.5 · obtained from crafted: Hatchet')
    expect(md).toContain('| Hatchet | 3 Wood | 2 | ×1.67 |')
    expect(md).toContain('i_plank["Plank"] --> i_hatchet["Hatchet"]')
  })

  it('computes final value from the rarity × quality multiplier', () => {
    const p = itemsProject()
    const sword = { id: 'sw', name: 'Sword', rarity: 'rare', quality: 'normal', value: 70 }
    expect(finalValue(p, sword)).toBe(70)
    p.documents[ITEMS_DOC].data.multipliers = { cells: { 'rare|normal': 3, 'rare|good': 4 } }
    expect(finalValue(p, sword)).toBe(210)
    expect(finalValue(p, sword, 'good')).toBe(280)
    expect(finalValue(p, { id: 'x' })).toBeNull()
  })

  it('expands crafting chains with output quantities, depth, value added and cycles', () => {
    const p = itemsProject()
    expect(rawCost(p, 'hatchet')).toMatchObject({ resources: { wood: 3 }, depth: 2, stations: ['Workbench'], cycle: false })
    expect(valueAdded(p, p.documents[ITEMS_DOC].data.recipes[1])).toEqual({ output: 10, input: 6, ratio: 10 / 6 })
    p.documents[ITEMS_DOC].data.recipes[0].ingredients = { hatchet: 1 }
    expect(rawCost(p, 'hatchet').cycle).toBe(true)
  })

  it('finds sources and uses across modules', () => {
    const p = itemsProject()
    p.documents['design.trade'].data.merchants = [{ id: 'm', name: 'Peddler', goods: ['hatchet'] }]
    p.documents['design.player'].data.casts = [{ id: 'c', name: 'Builder', startGear: ['hatchet'] }]
    expect(itemSources(p, 'hatchet').map((s) => s.kind)).toEqual(['crafted', 'sold', 'starting gear'])
    expect(itemUses(p, 'plank').map((s) => s.kind)).toEqual(['ingredient'])
    // A resource item named like a resource is produced by Town buildings that output it.
    p.documents[ITEMS_DOC].data.items.push({ id: 'w', name: 'Wood', type: 'resource-item' })
    p.documents['design.town'].data.buildings[0].outputs = { wood: 3 }
    expect(itemSources(p, 'w').map((s) => s.kind)).toEqual(['town output'])
  })

  it('computes loot odds, kills needed and a deterministic simulation', () => {
    const p = itemsProject()
    const table = { id: 'l', name: 'Boss', rolls: 3, weights: { plank: 99, hatchet: 1 } }
    const odds = lootOdds(p, table)
    const rare = odds.rows.find((r) => r.id === 'hatchet')!
    expect(rare.perRoll).toBeCloseTo(0.01)
    expect(rare.perDrop).toBeCloseTo(0.029701, 5)
    expect(rare.killsFor90).toBe(77)
    expect(lootOdds(p, table, 1).rows.find((r) => r.id === 'hatchet')!.perDrop).toBeCloseTo(0.01)
    expect(simulateLoot(table, 50)).toEqual(simulateLoot(table, 50))
    const counts = simulateLoot(table, 100)
    expect((counts.plank ?? 0) + (counts.hatchet ?? 0)).toBe(300)
  })

  it('finds rarity holes per type and hides field groups by type profile', () => {
    const p = itemsProject()
    p.documents[ITEMS_DOC].data.items.push({ id: 'a', type: 'weapon', rarity: 'common' }, { id: 'b', type: 'weapon', rarity: 'epic' })
    expect(coverage(p).holes.map((h) => `${h.type.id}|${h.rarity.id}`)).toEqual(['weapon|uncommon', 'weapon|rare'])
    const sec = getSection(itemsMod, p.registry, 'items') as CollectionSection
    expect([...hiddenGroups(p, ITEMS_DOC, sec, { id: 'd', type: 'decoration' })].sort()).toEqual(['Combat', 'Tool', 'Use'])
    expect(hiddenGroups(p, ITEMS_DOC, sec, { id: 'n' }).size).toBe(0)
  })
})

describe('items design checks', () => {
  it('stays quiet on an empty document and in other editors', () => {
    const p = createProject('T', false)
    ensureDocument(p, itemsMod, makeId)
    expect(ruleIds(p)).toEqual([])
    expect(collectHints(makeContext(itemsProject(), { docId: 'design.world' })).filter((h) => h.ruleId.startsWith('items.'))).toEqual([])
  })

  it('does not flag a complete chain', () => {
    expect(ruleIds(itemsProject())).toEqual([])
  })

  it('flags sources, uses, recipes, value, coverage, tiers, loot, type fields and basics', () => {
    const p = itemsProject()
    const d = p.documents[ITEMS_DOC].data
    d.items.push(
      { id: 'gem', name: 'Gem', type: 'valuable', rarity: 'rare' },
      { id: 'w1', name: 'Club', type: 'weapon', rarity: 'common', weight: 1, durability: 5 },
      { id: 'w2', name: 'Doom', type: 'weapon', rarity: 'epic', weight: 1, durability: 5 },
      { id: 'vase', name: 'Vase', type: 'decoration', rarity: 'common', damage: 3 },
      { id: 'ore', name: 'Ore lump', type: 'resource-item', rarity: 'common' },
    )
    d.recipes.push({ id: 'r3', name: 'Broken' }, { id: 'r4', name: 'Gold hatchet', result: 'hatchet', ingredients: { plank: 1 }, station: 's1' })
    d.recipes[1].ingredients = { plank: 1 }
    d.rarityTiers = [{ id: 't1', rarity: 'common', dropWeight: 10 }, { id: 't2', rarity: 'uncommon', dropWeight: 50 }]
    d.loot = [{ id: 'l', name: 'Empty chest' }]
    expect(ruleIds(p)).toEqual(
      expect.arrayContaining(['items.noSource', 'items.unused', 'items.recipeShape', 'items.valueLoss', 'items.coverage', 'items.tiers', 'items.loot', 'items.typeFields', 'items.basics']),
    )
  })

  it('never exceeds suggest severity', () => {
    const p = itemsProject()
    p.documents[ITEMS_DOC].data.recipes.push({ id: 'x', name: 'X' })
    expect(collectHints(makeContext(p, { docId: ITEMS_DOC })).filter((h) => h.ruleId.startsWith('items.')).every((h) => h.severity !== 'important')).toBe(true)
  })
})
