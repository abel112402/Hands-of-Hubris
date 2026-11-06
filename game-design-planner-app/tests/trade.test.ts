import { describe, expect, it } from 'vitest'
import { collectHints, makeContext } from '../src/core/hints/engine'
import { moduleToMarkdown } from '../src/core/export/markdown'
import { hiddenGroups } from '../src/core/groupFilter'
import { createProject, makeId } from '../src/core/model/project'
import type { CollectionSection } from '../src/core/model/types'
import { ensureDocument, getModule, getSection } from '../src/core/modules/registry'
import { itemSources } from '../src/core/items'
import { affordability, arbitrage, marginsOf, moneyFlow, priceOf, stockCoverage, TRADE_DOC, wanderingOdds } from '../src/core/trade'

const trade = getModule(TRADE_DOC)!

/** A sword worth 100 × 2 (rare/normal), ore, a recipe, two merchants, three relationship levels and a price difficulty parameter. */
function tradeProject() {
  const p = createProject('T')
  const items = p.documents['design.items'].data
  items.items = [
    { id: 'sword', name: 'Iron sword', value: 100, rarity: 'rare', quality: 'normal', type: 'weapon' },
    { id: 'ore', name: 'Ore', value: 10, rarity: 'common', quality: 'normal', type: 'resource-item' },
    { id: 'ingot', name: 'Ingot', value: 50, rarity: 'common', quality: 'normal', type: 'resource-item' },
  ]
  items.multipliers = { cells: { 'rare|normal': 2 } }
  items.recipes = [{ id: 'r1', name: 'Smelt', result: 'ingot', ingredients: { ore: 2 } }]
  p.documents['design.factions'].data.thresholds = [
    { id: 'hostile', name: 'Hostile', min: -100, max: -50 },
    { id: 'neutral', name: 'Neutral', min: -50, max: 50 },
    { id: 'allied', name: 'Allied', min: 50, max: 100 },
  ]
  p.documents['design.difficulty'].data.params = [{ id: 'price', name: 'Economy price multiplier' }]
  p.documents['design.difficulty'].data.values = { cells: { 'price|hard': 1.2 } }
  p.documents['design.story'].data.acts = [
    { id: 'a2', name: 'Act 2', start: 10, duration: 20 },
    { id: 'a1', name: 'Act 1', start: 0, duration: 10 },
  ]
  const d = p.documents[TRADE_DOC].data
  d.currency = { startingMoney: 100 }
  d.margins = { buyMultiplier: 1, sellMultiplier: 0.5, byReputation: { hostile: 1.5, neutral: 1, allied: 0.8 } }
  d.merchants = [
    { id: 'peddler', name: 'Peddler', type: 'Wandering', goods: ['sword'], markup: 1.25, buyback: 0.8, chance: 50, interval: 10 },
    { id: 'market', name: 'Market', type: 'Town market', goods: ['ore'], buys: ['weapon'], markup: 1.1, buyback: 0.6 },
  ]
  d.priceRules = [{ id: 'fest', name: 'Festival', factor: 0.9, side: 'Buy', scope: 'Global' }]
  d.flows = [
    { id: 'loot', name: 'Loot', direction: 'Source', kind: 'Selling loot', amount: 30, per: 'Day' },
    { id: 'quest', name: 'Quests', direction: 'Source', kind: 'Quest reward', amount: 100, per: 'Event', perDay: 0.1 },
    { id: 'repair', name: 'Repairs', direction: 'Sink', kind: 'Repair', amount: 10, per: 'Day' },
    { id: 'build', name: 'Building', direction: 'Sink', kind: 'Building cost', amount: 20, per: 'Day', fromAct: 'a2' },
  ]
  return p
}
type P = ReturnType<typeof tradeProject>
const ruleIds = (p: P, docId = TRADE_DOC) => collectHints(makeContext(p, { docId })).filter((h) => h.ruleId.startsWith('trade.')).map((h) => h.ruleId)

describe('trade module v2', () => {
  it('migrates v1 data, keeping ids and text and leaving rules unscoped', () => {
    const p = createProject('t')
    p.documents[TRADE_DOC] = {
      moduleVersion: 1,
      data: {
        currency: { currencies: 'Silver shillings' },
        pricing: { items: [] },
        merchants: [{ id: 'm1', name: 'Peddler', type: 'Wandering', goods: 'sword', appearance: 'On clear days', stock: 'Random' }],
        priceRules: [{ id: 'r1', name: 'Allies', factor: 0.9, description: 'Allied factions' }],
        balance: { sinks: 'Repairs', inflation: 'Caps' },
      },
    }
    const doc = ensureDocument(p, trade, makeId)
    expect(doc.moduleVersion).toBe(2)
    expect(doc.data.merchants[0]).toMatchObject({ id: 'm1', goods: ['sword'], appearance: 'On clear days', stock: 'Random' })
    expect(doc.data.priceRules[0]).toMatchObject({ id: 'r1', factor: 0.9, description: 'Allied factions' })
    expect(doc.data.priceRules[0].scope).toBeUndefined()
    expect(doc.data.currency.currencies).toBe('Silver shillings')
    expect(doc.data.balance).toMatchObject({ sinks: 'Repairs', inflation: 'Caps' })
    expect(doc.data.flows).toEqual([])
    expect(doc.data.margins).toEqual({})
  })

  it('keeps merchant goods visible to Items as a source', () => {
    expect(itemSources(tradeProject(), 'sword').map((s) => s.kind)).toContain('sold')
  })

  it('hides the field groups of the other merchant kinds', () => {
    const p = tradeProject()
    const sec = getSection(trade, p.registry, 'merchants') as CollectionSection
    expect([...hiddenGroups(p, TRADE_DOC, sec, { id: 'x', type: 'Wandering' })].sort()).toEqual(['Capital', 'Market'])
    expect([...hiddenGroups(p, TRADE_DOC, sec, { id: 'x', type: 'Faction capital' })].sort()).toEqual(['Market', 'Wandering'])
    expect(hiddenGroups(p, TRADE_DOC, sec, { id: 'x' }).size).toBe(0)
    // Price rules show only the target field of their scope, so a scoped rule does not count as incomplete.
    const rules = getSection(trade, p.registry, 'priceRules') as CollectionSection
    expect([...hiddenGroups(p, TRADE_DOC, rules, { id: 'r', scope: 'Faction' })]).not.toContain('Faction')
    expect(hiddenGroups(p, TRADE_DOC, rules, { id: 'r', scope: 'Faction' }).size).toBe(5)
    expect(hiddenGroups(p, TRADE_DOC, rules, { id: 'r', scope: 'Global' }).size).toBe(6)
    p.documents[TRADE_DOC].data.priceRules = [{ id: 'g', name: 'Festival', factor: 0.9, side: 'Buy', scope: 'Global', description: 'Harvest' }]
    const sparse = collectHints(makeContext(p, { docId: TRADE_DOC })).filter((h) => h.ruleId === 'completeness.sparseEntities' && h.target.sectionId === 'priceRules')
    expect(sparse).toEqual([])
  })

  it('exports in the order of trade_economy.md with summaries', () => {
    const md = moduleToMarkdown(tradeProject(), trade)
    const heads = md.split('\n').filter((l) => l.startsWith('## ')).map((l) => l.replace(/^## \d+\. /, ''))
    const order = ['Currency', 'Wandering merchant', 'Town market', 'Faction capital trade', 'Price formulas', 'Margins', 'Economic balance']
    const pos = order.map((h) => heads.indexOf(h))
    expect(pos.every((i) => i >= 0)).toBe(true)
    expect([...pos].sort((a, b) => a - b)).toEqual(pos)
    expect(md).toContain('**Wandering merchants:**')
    expect(md).toContain('* **Peddler:** Iron sword')
    expect(md).toContain('| Peddler | 10 d | 50% | 3 | 87.5% |')
    expect(md).toContain('| Act 1 | 400 | 100 | 30 | 400 | 75% |')
    expect(md).toContain('```mermaid')
  })

  it('builds a price step by step for both sides', () => {
    const p = tradeProject()
    const buy = priceOf(p, 'sword', { side: 'buy', merchantId: 'peddler', levelId: 'allied', difficultyId: 'hard' })!
    // 100 × 2 (rare/normal) × 1 × 1.25 × 0.8 × 1.2 × 0.9 (festival) = 216
    expect(buy.price).toBeCloseTo(216)
    expect(buy.steps.map((s) => s.label)).toEqual(['Base value', 'Rarity × quality', 'Buy margin', 'Merchant markup', 'Relationship', 'Difficulty', 'Festival'])
    const sell = priceOf(p, 'sword', { side: 'sell', merchantId: 'market', levelId: 'hostile', difficultyId: 'hard' })!
    // 200 × 0.5 × 0.6 ÷ 1.5 ÷ 1.2 = 33.33; the festival rule is buy-only
    expect(sell.price).toBeCloseTo(33.333, 2)
    expect(priceOf(p, 'nothing', { side: 'buy' })).toBeNull()
  })

  it('lets a buy-price formula replace the chain', () => {
    const p = tradeProject()
    p.documents[TRADE_DOC].data.pricing = { items: [{ id: 'f', name: 'Buy price', expr: 'value * markup + tax', vars: { tax: 5 } }] }
    expect(priceOf(p, 'sword', { side: 'buy', merchantId: 'peddler' })!.price).toBe(255)
    expect(priceOf(p, 'sword', { side: 'sell', merchantId: 'peddler' })!.formula).toBeUndefined()
  })

  it('falls back to Town margins', () => {
    const p = tradeProject()
    p.documents[TRADE_DOC].data.margins = {}
    p.documents['design.town'].data.economy = { buyMargin: 1.4 }
    expect(marginsOf(p)).toMatchObject({ buy: 1.4, buySource: 'town', sell: 1, sellSource: 'default' })
  })

  it('finds trade, craft and margin loops', () => {
    const p = tradeProject()
    expect(arbitrage(p)).toEqual({ trade: [], craft: [], inverse: false })
    p.documents[TRADE_DOC].data.merchants[1].buyback = 3
    // Market pays 200 × 0.5 × 3 = 300 for a sword the peddler sells for 200 × 1.25 × 0.9 = 225.
    // The same buyback also makes ore a loop at the market itself: bought for 9.9, sold back for 15.
    expect(arbitrage(p).trade).toMatchObject([
      { item: { id: 'sword' }, from: { id: 'peddler' }, to: { id: 'market' }, buy: 225, sell: 300 },
      { item: { id: 'ore' }, from: { id: 'market' }, to: { id: 'market' }, sell: 15 },
    ])
    const q = tradeProject()
    q.documents['design.items'].data.items[2].value = 80
    q.documents[TRADE_DOC].data.merchants[1].buys.push('resource-item')
    // 2 ore at 10 × 1.1 × 0.9 = 19.8; one ingot sells for 80 × 0.5 × 0.6 = 24.
    const craft = arbitrage(q).craft
    expect(craft).toHaveLength(1)
    expect(craft[0].cost).toBeCloseTo(19.8)
    expect(craft[0].income).toBeCloseTo(24)
    q.documents[TRADE_DOC].data.margins.sellMultiplier = 1
    expect(arbitrage(q).inverse).toBe(true)
  })

  it('computes wandering odds', () => {
    const o = wanderingOdds(tradeProject(), tradeProject().documents[TRADE_DOC].data.merchants[0])!
    expect(o.expected(60)).toBe(3)
    expect(o.atLeastOne(30)).toBeCloseTo(0.875)
    expect(o.avgGap).toBe(20)
    expect(wanderingOdds(createProject('x'))).toBeNull()
  })

  it('reports stock coverage', () => {
    const p = tradeProject()
    const m = p.documents[TRADE_DOC].data.merchants
    m[0].rarityCap = 'common'
    m[1].exclusive = ['ore']
    m[0].goods.push('ore')
    const c = stockCoverage(p)
    expect(c.rows[0].byRarity).toEqual({ rare: 1, common: 1 })
    expect(c.rows[0].overCap.map((i) => i.id)).toEqual(['sword'])
    expect(c.leaked).toMatchObject([{ merchant: { id: 'market' }, item: { id: 'ore' }, other: { id: 'peddler' } }])
    expect(c.unsold.map((i) => i.id)).toEqual(['ingot'])
  })

  it('adds up money per act, with difficulty and affordability', () => {
    const p = tradeProject()
    const f = moneyFlow(p)
    expect(f.byAct).toBe(true)
    expect(f.periods.map((x) => x.label)).toEqual(['Act 1', 'Act 2'])
    expect(f.periods[0]).toMatchObject({ days: 10, sources: 400, sinks: 100, net: 300, wallet: 400, perDay: 30 })
    expect(f.periods[1]).toMatchObject({ days: 20, sources: 800, sinks: 600, net: 200, wallet: 600, kept: 0.25 })
    const hard = moneyFlow(p, 'hard').periods[0]
    expect(hard.sources).toBeCloseTo(10 * (30 / 1.2 + 10))
    expect(hard.sinks).toBeCloseTo(120)
    // Sword at the peddler: 225; Act 1 nets 30 a day.
    expect(affordability(p, 'sword', f.periods[0])).toEqual({ price: 225, days: 7.5 })
    p.documents['design.story'].data.acts = []
    expect(moneyFlow(p).periods).toHaveLength(30)
  })
})

describe('trade hints', () => {
  it('stay quiet on an empty doc and in other editors, and never exceed suggest', () => {
    expect(ruleIds(createProject('x') as P)).toEqual([])
    const p = tradeProject()
    p.documents[TRADE_DOC].data.merchants[1].buyback = 3
    expect(ruleIds(p, 'design.items')).toEqual([])
    const hints = collectHints(makeContext(p, { docId: TRADE_DOC })).filter((h) => h.ruleId.startsWith('trade.'))
    expect(hints.length).toBeGreaterThan(0)
    expect(hints.every((h) => h.severity !== 'important')).toBe(true)
  })

  const cases: [string, (p: P) => void][] = [
    ['trade.arbitrage', (p) => (p.documents[TRADE_DOC].data.merchants[1].buyback = 3)],
    ['trade.marginConflict', (p) => (p.documents['design.town'].data.economy = { buyMargin: 1.3 })],
    ['trade.ruleScope', (p) => p.documents[TRADE_DOC].data.priceRules.push({ id: 'r2', name: 'Old', factor: 1.1 })],
    ['trade.formulaVars', (p) => (p.documents[TRADE_DOC].data.pricing = { items: [{ id: 'f', name: 'buy price', expr: 'value * foo', vars: {} }] })],
    ['trade.wanderingRule', (p) => delete p.documents[TRADE_DOC].data.merchants[0].chance],
    ['trade.capitalGate', (p) => p.documents[TRADE_DOC].data.merchants.push({ id: 'c', name: 'Capital', type: 'Faction capital' })],
    ['trade.rarityCap', (p) => (p.documents[TRADE_DOC].data.merchants[0].rarityCap = 'common')],
    ['trade.exclusive', (p) => (p.documents[TRADE_DOC].data.merchants[0].exclusive = ['ore'])],
    ['trade.noSinks', (p) => (p.documents[TRADE_DOC].data.flows = p.documents[TRADE_DOC].data.flows.filter((f: any) => f.direction === 'Source'))],
    ['trade.repCoverage', (p) => delete p.documents[TRADE_DOC].data.margins.byReputation.neutral],
  ]
  for (const [id, make] of cases)
    it(`${id} fires only when its problem exists`, () => {
      const p = tradeProject()
      expect(ruleIds(p)).not.toContain(id)
      make(p)
      expect(ruleIds(p)).toContain(id)
    })

  it('trade.unsold lists valuable items nobody trades (info)', () => {
    const p = tradeProject()
    const h = collectHints(makeContext(p, { docId: TRADE_DOC })).find((x) => x.ruleId === 'trade.unsold')
    expect(h?.severity).toBe('info')
    expect(h?.params?.names).toBe('Ingot')
    p.documents[TRADE_DOC].data.merchants[1].goods.push('ingot')
    expect(ruleIds(p)).not.toContain('trade.unsold')
  })

  it('flags money piling up past the tolerance', () => {
    const p = tradeProject()
    p.documents[TRADE_DOC].data.balance = { keepTolerance: 20 }
    const h = collectHints(makeContext(p, { docId: TRADE_DOC })).find((x) => x.ruleId === 'trade.noSinks')
    expect(h?.params).toEqual({ kept: 25, tolerance: 20 })
  })
})
