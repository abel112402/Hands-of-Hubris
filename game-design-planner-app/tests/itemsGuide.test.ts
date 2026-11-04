import { describe, expect, it } from 'vitest'
import { createProject } from '../src/core/model/project'
import { useStore } from '../src/core/store/store'
import { getModule, getSection } from '../src/core/modules/registry'
import { ITEMS_DOC, lootOdds, multiplier, rawCost } from '../src/core/items'
import { ITEMS_GUIDE } from '../src/modules/guides/items'
import { applyExample, previewProject } from '../src/ui/guides/ExamplePicker'

const step = (id: string) => ITEMS_GUIDE.steps.find((s) => s.id === id)!
const example = (id: string) => ITEMS_GUIDE.examples.find((e) => e.id === id)!
const run = (id: string, p: ReturnType<typeof createProject>) => {
  const a = step(id).action!
  if ('run' in a) a.run(p)
}

describe('items guide', () => {
  it('points every step, map node, example, concept and empty text at a real section', () => {
    const mod = getModule(ITEMS_DOC)!
    const reg = createProject('t').registry
    const ids = [
      ...ITEMS_GUIDE.steps.map((s) => s.section),
      ...ITEMS_GUIDE.map.nodes.flatMap((n) => (n.section ? [n.section] : [])),
      ...ITEMS_GUIDE.examples.map((e) => e.section),
      ...Object.keys(ITEMS_GUIDE.concepts),
      ...Object.keys(ITEMS_GUIDE.empty),
    ]
    for (const id of ids) expect(getSection(mod, reg, id), id).toBeTruthy()
    for (const n of ITEMS_GUIDE.map.nodes) if (n.doc) expect(getModule(n.doc), n.doc).toBeTruthy()
  })

  it('ticks tier and type steps after their quick actions', () => {
    const p = createProject('T', false)
    useStore.getState().loadProject(p, 'x')
    useStore.getState().ensureDoc(ITEMS_DOC)
    // New documents come with the default type profiles; start from none to test the quick action.
    useStore.getState().mutate((d) => void (d.documents[ITEMS_DOC].data.types = []))
    const q = useStore.getState().project
    for (const id of ['rarity', 'quality', 'types']) {
      expect(step(id).done!(q)).toBe(false)
      useStore.getState().mutate((d) => run(id, d))
      expect(step(id).done!(useStore.getState().project)).toBe(true)
    }
    const tiers = useStore.getState().project.documents[ITEMS_DOC].data.rarityTiers
    expect(tiers.map((t: any) => t.dropWeight)).toEqual([100, 40, 10, 3, 1])
    expect(step('tree').done).toBeUndefined()
  })

  it('previews a starter chain on a copy and inserts it as one undo step', () => {
    useStore.getState().loadProject(createProject('T'), 'x')
    const before = useStore.getState().project
    const preview = previewProject(before, example('chain-starter'), 'ore')
    expect(before.documents[ITEMS_DOC].data.recipes).toEqual([])
    const sword = preview.documents[ITEMS_DOC].data.items.find((i: any) => i.name === 'Iron sword')
    // Sword = blade (2 ingots) + 1 ingot = 3 ingots = 6 ore.
    expect(rawCost(preview, sword.id).resources).toEqual({ ore: 6 })
    applyExample(example('chain-starter'), 'ore')
    expect(useStore.getState().project.documents[ITEMS_DOC].data.recipes).toHaveLength(3)
    useStore.getState().undo()
    expect(useStore.getState().project.documents[ITEMS_DOC].data.recipes).toEqual([])
  })

  it('builds multiplier presets and loot presets from existing items', () => {
    const p = createProject('T')
    example('mult-steep').apply(p)
    expect(multiplier(p, 'common', 'poor')).toBe(1)
    expect(multiplier(p, 'legendary', 'poor')).toBe(10.5)
    example('chain-starter').apply(p, 'wood')
    p.documents[ITEMS_DOC].data.items.push({ id: 'relic', name: 'Relic', rarity: 'legendary', value: 900 })
    example('loot-boss').apply(p, '')
    const table = p.documents[ITEMS_DOC].data.loot.at(-1)
    expect(table.rolls).toBe(3)
    expect(table.guaranteed).toEqual(['relic'])
    expect(lootOdds(p, table).rows.find((r) => r.id === 'relic')!.perDrop).toBe(1)
    example('loot-trash').apply(p, '')
    expect(Object.keys(p.documents[ITEMS_DOC].data.loot.at(-1).weights)).not.toContain('relic')
  })
})
