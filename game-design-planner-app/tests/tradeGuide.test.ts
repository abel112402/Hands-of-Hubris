import { describe, expect, it } from 'vitest'
import { createProject } from '../src/core/model/project'
import { useStore } from '../src/core/store/store'
import { getModule, getSection } from '../src/core/modules/registry'
import { moneyFlow, priceOf, reputationGaps, TRADE_DOC, wanderingOdds } from '../src/core/trade'
import { TRADE_GUIDE } from '../src/modules/guides/trade'
import { applyExample, previewProject } from '../src/ui/guides/ExamplePicker'

const step = (id: string) => TRADE_GUIDE.steps.find((s) => s.id === id)!
const example = (id: string) => TRADE_GUIDE.examples.find((e) => e.id === id)!
const run = (id: string, p: ReturnType<typeof createProject>) => {
  const a = step(id).action!
  if ('run' in a) a.run(p)
}

function withItems() {
  const p = createProject('T')
  p.documents['design.items'].data.items = [
    { id: 'bread', name: 'Bread', value: 2, rarity: 'common' },
    { id: 'rope', name: 'Rope', value: 5, rarity: 'uncommon' },
    { id: 'blade', name: 'Star blade', value: 900, rarity: 'legendary' },
  ]
  p.documents['design.factions'].data.factions = [{ id: 'f1', name: 'Wardens' }]
  return p
}

describe('trade guide', () => {
  it('points every step, map node, example, concept and empty text at a real section', () => {
    const mod = getModule(TRADE_DOC)!
    const reg = createProject('t').registry
    const ids = [
      ...TRADE_GUIDE.steps.map((s) => s.section),
      ...TRADE_GUIDE.map.nodes.flatMap((n) => (n.section ? [n.section] : [])),
      ...TRADE_GUIDE.examples.map((e) => e.section),
      ...Object.keys(TRADE_GUIDE.concepts),
      ...Object.keys(TRADE_GUIDE.empty),
    ]
    for (const id of ids) expect(getSection(mod, reg, id), id).toBeTruthy()
    for (const n of TRADE_GUIDE.map.nodes) if (n.doc) expect(getModule(n.doc), n.doc).toBeTruthy()
  })

  it('ticks steps from data and runs the quick actions', () => {
    const p = createProject('T')
    p.documents['design.town'].data.economy = { buyMargin: 1.2 }
    expect(step('margins').done!(p)).toBe(false)
    run('margins', p)
    expect(p.documents[TRADE_DOC].data.margins).toMatchObject({ buyMultiplier: 1.2, sellMultiplier: 0.5 })
    expect(step('margins').done!(p)).toBe(true)
    run('currencies', p)
    expect(step('currencies').done!(p)).toBe(true)
  })

  it('merchant archetypes cover the three kinds and pick goods by rarity', () => {
    const p = withItems()
    example('merchant-peddler').apply(p)
    example('merchant-market').apply(p)
    expect(step('merchants').done!(p)).toBe(false)
    example('merchant-capital').apply(p, 'f1')
    expect(step('merchants').done!(p)).toBe(true)
    const [peddler, market, capital] = p.documents[TRADE_DOC].data.merchants
    expect(peddler.goods).toEqual(['bread', 'rope'])
    expect(wanderingOdds(p, peddler)).not.toBeNull()
    expect(step('wandering').done!(p)).toBe(true)
    expect(market.goods).toEqual(['bread'])
    expect(capital).toMatchObject({ name: 'Wardens quartermaster', faction: 'f1', goods: ['blade'], exclusive: ['blade'] })
    expect(capital.minLevel).toBeTruthy()
  })

  it('relationship ladders cover every level and make hostile prices higher', () => {
    const p = withItems()
    example('rep-harsh').apply(p)
    expect(reputationGaps(p)).toEqual([])
    expect(step('reputation').done!(p)).toBe(true)
    const levels = p.documents['design.factions'].data.thresholds
    const hostile = priceOf(p, 'rope', { side: 'buy', levelId: levels[0].id })!.price
    const allied = priceOf(p, 'rope', { side: 'buy', levelId: levels.at(-1).id })!.price
    expect(hostile).toBe(10)
    expect(allied).toBe(4)
    // Neutral (the level containing 0) stays at ×1; the steps in between are even.
    expect(Object.values(p.documents[TRADE_DOC].data.margins.byReputation)).toEqual([2, 1.5, 1, 0.9, 0.8])
  })

  it('previews a starter economy on a copy and inserts it as one undo step', () => {
    useStore.getState().loadProject(createProject('T'), 'x')
    const before = useStore.getState().project
    const preview = previewProject(before, example('flows-lean'))
    expect(before.documents[TRADE_DOC].data.flows).toHaveLength(0)
    expect(preview.documents[TRADE_DOC].data.flows).toHaveLength(6)
    expect(step('flows').done!(preview)).toBe(true)
    applyExample(example('flows-lean'))
    const after = useStore.getState().project
    expect(moneyFlow(after).periods.at(-1)!.wallet).toBe(moneyFlow(preview).periods.at(-1)!.wallet)
    useStore.getState().undo()
    expect(useStore.getState().project.documents[TRADE_DOC].data.flows).toHaveLength(0)
  })
})
