import type { GuideExample, ModuleGuide } from '../../core/guides/types'
import { itemList } from '../../core/items'
import { makeId } from '../../core/model/project'
import type { Entity, Project } from '../../core/model/types'
import { actsOf, arbitrage, merchantsOf, reputationGaps, reputationLevels, TRADE_DOC, tradeList, unscopedRules, wanderingOdds } from '../../core/trade'

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const data = (p: Project): Record<string, any> => p.documents[TRADE_DOC]?.data ?? {}
const ensureForm = (p: Project, id: string): Record<string, any> => {
  const d = p.documents[TRADE_DOC]?.data
  if (!d) return {}
  if (!d[id] || typeof d[id] !== 'object' || Array.isArray(d[id])) d[id] = {}
  return d[id]
}
const ensureList = (p: Project, section: string): Entity[] => {
  const d = p.documents[TRADE_DOC]?.data
  if (!d) return []
  if (!Array.isArray(d[section])) d[section] = []
  return d[section]
}
const rarityIds = (p: Project) => (p.registry.catalogs.rarities?.items ?? []).map((r) => r.id)

/** Items with a value, of the given rarity ranks (catalog order), cheapest first. */
function goodsAt(p: Project, ranks: number[], max: number): string[] {
  const rar = rarityIds(p)
  const want = new Set(ranks.map((i) => rar[i]).filter(Boolean))
  return itemList(p, 'items')
    .filter((i) => isNum(i.value) && want.has(i.rarity))
    .sort((a, b) => a.value - b.value)
    .slice(0, max)
    .map((i) => i.id)
}

/** Levels from Factions, sorted from the most hostile up; default levels are added when there are none. */
function ensureLevels(p: Project): Entity[] {
  const fac = p.documents['design.factions']?.data
  if (fac && (!Array.isArray(fac.thresholds) || fac.thresholds.length === 0)) {
    fac.thresholds = [
      ['Hostile', -100, -50],
      ['Unfriendly', -50, -10],
      ['Neutral', -10, 10],
      ['Friendly', 10, 50],
      ['Allied', 50, 100],
    ].map(([name, min, max]) => ({ id: makeId(), name, min, max }))
  }
  return [...reputationLevels(p)].sort((a, b) => (isNum(a.min) ? a.min : 0) - (isNum(b.min) ? b.min : 0))
}

/** Copies Town's buy/sell multipliers into Trade, or sets ×1 / ×0.5. */
export function applyTownMargins(p: Project) {
  const m = ensureForm(p, 'margins')
  const town = p.documents['design.town']?.data.economy ?? {}
  m.buyMultiplier ??= isNum(town.buyMargin) ? town.buyMargin : 1
  m.sellMultiplier ??= isNum(town.sellMargin) ? town.sellMargin : 0.5
}

// ---------- Examples ----------

const factionParam = {
  key: 'faction',
  label: 'Faction',
  options: (p: Project) => [{ id: '', label: '— no faction —' }, ...((p.documents['design.factions']?.data.factions ?? []) as Entity[]).map((f) => ({ id: f.id, label: String(f.name ?? '') }))],
}

const ladder = (id: string, title: string, description: string, from: number, to: number): GuideExample => ({
  id,
  section: 'margins',
  title,
  description: `${description} Adds the usual relationship levels to Factions if there are none.`,
  preview: 'priceLadder',
  apply: (p) => {
    const levels = ensureLevels(p)
    const m = ensureForm(p, 'margins')
    applyTownMargins(p)
    // The level containing 0 (else the middle one) is neutral at ×1; factors run to `from` below it and to `to` above it.
    const zero = levels.findIndex((l) => isNum(l.min) && l.min <= 0 && (!isNum(l.max) || l.max >= 0))
    const n = zero >= 0 ? zero : Math.floor((levels.length - 1) / 2)
    const last = levels.length - 1
    const map: Record<string, number> = {}
    levels.forEach((l, i) => {
      const f = i < n ? from + (1 - from) * (i / n) : i > n ? 1 + (to - 1) * ((i - n) / (last - n)) : 1
      map[l.id] = Math.round(f * 100) / 100
    })
    m.byReputation = map
  },
})

type FlowSpec = { name: string; direction: 'Source' | 'Sink'; kind: string; amount: number; per?: 'Day' | 'Event'; perDay?: number; fromAct?: number }

const flowPreset = (id: string, title: string, description: string, start: number, specs: FlowSpec[]): GuideExample => ({
  id,
  section: 'flows',
  title,
  description,
  preview: 'moneyFlow',
  apply: (p) => {
    const acts = actsOf(p)
    const cur = ensureForm(p, 'currency')
    cur.startingMoney ??= start
    const list = ensureList(p, 'flows')
    for (const s of specs)
      list.push({
        id: makeId(),
        name: s.name,
        direction: s.direction,
        kind: s.kind,
        amount: s.amount,
        per: s.per ?? 'Day',
        ...(s.perDay !== undefined ? { perDay: s.perDay } : {}),
        ...(s.fromAct !== undefined && acts[s.fromAct] ? { fromAct: acts[s.fromAct].id } : {}),
      })
  },
})

export const TRADE_EXAMPLES: GuideExample[] = [
  {
    id: 'merchant-peddler',
    section: 'merchants',
    title: 'Wandering peddler',
    description: 'Comes every 7 days with a 40 % chance, stays 2 days, sells cheap common and uncommon goods at a high markup.',
    preview: 'merchants',
    apply: (p) => {
      const w = ensureForm(p, 'wandering')
      w.interval ??= 7
      w.chance ??= 40
      w.stayDays ??= 2
      const rar = rarityIds(p)
      ensureList(p, 'merchants').push({ id: makeId(), name: 'Wandering peddler', type: 'Wandering', goods: goodsAt(p, [0, 1], 5), markup: 1.3, buyback: 0.8, ...(rar[1] ? { rarityCap: rar[1] } : {}), stockSize: 8, stayDays: 2 })
    },
  },
  {
    id: 'merchant-market',
    section: 'merchants',
    title: 'Town market stall',
    description: 'Always there from the first act, restocks every 3 days, everyday goods at a small markup and a low buyback.',
    preview: 'merchants',
    apply: (p) => {
      const act = actsOf(p)[0]
      const rar = rarityIds(p)
      ensureList(p, 'merchants').push({ id: makeId(), name: 'Market stall', type: 'Town market', goods: goodsAt(p, [0], 8), markup: 1.1, buyback: 0.6, restockDays: 3, ...(act ? { unlockAct: act.id } : {}), ...(rar[0] ? { rarityCap: rar[0] } : {}), stockSize: 12 })
    },
  },
  {
    id: 'merchant-capital',
    section: 'merchants',
    title: 'Faction capital trader',
    description: 'Sells the rarest goods, exclusively, once the player is on good terms with the faction.',
    param: factionParam,
    preview: 'merchants',
    apply: (p, faction) => {
      const levels = ensureLevels(p)
      const gate = levels[Math.max(0, levels.length - 2)]
      const rar = rarityIds(p)
      const rare = goodsAt(p, [rar.length - 1, rar.length - 2, rar.length - 3], 3)
      const fac = ((p.documents['design.factions']?.data.factions ?? []) as Entity[]).find((f) => f.id === faction)
      ensureList(p, 'merchants').push({
        id: makeId(),
        name: fac ? `${fac.name} quartermaster` : 'Capital trader',
        type: 'Faction capital',
        ...(fac ? { faction: fac.id } : {}),
        ...(gate ? { minLevel: gate.id } : {}),
        goods: rare,
        exclusive: rare,
        markup: 1.2,
        buyback: 0.7,
      })
    },
  },
  ladder('rep-gentle', 'Gentle relationship prices', 'Hostile pays ×1.25, allies ×0.9: relationships matter but never lock trade.', 1.25, 0.9),
  ladder('rep-harsh', 'Harsh relationship prices', 'Hostile pays ×2, allies ×0.8: reputation is a real economic lever.', 2, 0.8),
  flowPreset('flows-lean', 'Survival-lean economy', 'Little income, steady repairs and food: money stays tight all game.', 50, [
    { name: 'Selling loot', direction: 'Source', kind: 'Selling loot', amount: 25 },
    { name: 'Quest rewards', direction: 'Source', kind: 'Quest reward', amount: 120, per: 'Event', perDay: 0.15 },
    { name: 'Town tax share', direction: 'Source', kind: 'Wages / tax', amount: 5, fromAct: 1 },
    { name: 'Food and supplies', direction: 'Sink', kind: 'Buying', amount: 15 },
    { name: 'Repairs', direction: 'Sink', kind: 'Repair', amount: 8 },
    { name: 'Building upkeep', direction: 'Sink', kind: 'Upkeep', amount: 6, fromAct: 1 },
  ]),
  flowPreset('flows-trader', 'Trader-friendly economy', 'Generous loot and trade income, with growing late-game sinks to stop money piling up.', 100, [
    { name: 'Selling loot', direction: 'Source', kind: 'Selling loot', amount: 45 },
    { name: 'Quest rewards', direction: 'Source', kind: 'Quest reward', amount: 200, per: 'Event', perDay: 0.2 },
    { name: 'Trade route profits', direction: 'Source', kind: 'Wages / tax', amount: 20, fromAct: 1 },
    { name: 'Gear and supplies', direction: 'Sink', kind: 'Buying', amount: 25 },
    { name: 'Repairs', direction: 'Sink', kind: 'Repair', amount: 10 },
    { name: 'Building projects', direction: 'Sink', kind: 'Building cost', amount: 30, fromAct: 1 },
    { name: 'Guild fees', direction: 'Sink', kind: 'Fee', amount: 15, fromAct: 2 },
  ]),
]

// ---------- Guide ----------

const allTypes = (p: Project) => ['Wandering', 'Town market', 'Faction capital'].every((t) => merchantsOf(p, t).length > 0)

export const TRADE_GUIDE: ModuleGuide = {
  map: {
    width: 790,
    height: 420,
    nodes: [
      { id: 'items', label: 'Items', doc: 'design.items', x: 10, y: 14 },
      { id: 'currency', label: 'Currency', section: 'currency', x: 220, y: 14 },
      { id: 'currencyTypes', label: 'Currencies', section: 'currencyTypes', x: 430, y: 14 },
      { id: 'difficulty', label: 'Difficulty', doc: 'design.difficulty', x: 640, y: 14 },
      { id: 'factions', label: 'Factions', doc: 'design.factions', x: 10, y: 102 },
      { id: 'margins', label: 'Margins', section: 'margins', x: 220, y: 102 },
      { id: 'priceRules', label: 'Price rules', section: 'priceRules', x: 430, y: 102 },
      { id: 'pricing', label: 'Price formulas', section: 'pricing', x: 640, y: 102 },
      { id: 'town', label: 'Town', doc: 'design.town', x: 10, y: 190 },
      { id: 'market', label: 'Town market', section: 'market', x: 220, y: 190 },
      { id: 'merchants', label: 'Merchants', section: 'merchants', x: 430, y: 190 },
      { id: 'capital', label: 'Capital trade', section: 'capital', x: 640, y: 190 },
      { id: 'world', label: 'World', doc: 'design.world', x: 10, y: 278 },
      { id: 'wandering', label: 'Wandering', section: 'wandering', x: 220, y: 278 },
      { id: 'flows', label: 'Money flows', section: 'flows', x: 430, y: 278 },
      { id: 'balance', label: 'Balance', section: 'balance', x: 640, y: 278 },
      { id: 'story', label: 'Story', doc: 'design.story', x: 430, y: 366 },
    ],
    edges: [
      { from: 'items', to: 'currency', label: 'base unit' },
      { from: 'currency', to: 'currencyTypes', label: 'rates' },
      { from: 'items', to: 'margins', label: 'value ×' },
      { from: 'factions', to: 'margins', label: 'rep ×' },
      { from: 'difficulty', to: 'priceRules', label: 'price ×' },
      { from: 'margins', to: 'priceRules', label: 'then' },
      { from: 'priceRules', to: 'pricing', label: 'or formula' },
      { from: 'margins', to: 'merchants', label: 'prices' },
      { from: 'town', to: 'market', label: 'hosts' },
      { from: 'market', to: 'merchants', label: 'rules' },
      { from: 'capital', to: 'merchants', label: 'gates' },
      { from: 'world', to: 'wandering', label: 'biomes' },
      { from: 'wandering', to: 'merchants', label: 'visits' },
      { from: 'merchants', to: 'flows', label: 'sales' },
      { from: 'flows', to: 'balance', label: 'net' },
      { from: 'story', to: 'flows', label: 'acts' },
    ],
  },
  steps: [
    {
      id: 'currencies',
      title: 'List your currencies',
      body: 'The base unit comes from Items › Item model. Add every coin, barter good or faction scrip with what it is worth in base units.',
      section: 'currencyTypes',
      target: 'add',
      done: (p) => tradeList(p, 'currencyTypes').length > 0,
      action: {
        label: 'Add the base coin',
        run: (p) => {
          const unit = String(p.documents['design.items']?.data.model?.currency ?? '').trim()
          ensureList(p, 'currencyTypes').push({ id: makeId(), name: unit || 'Coin', kind: 'Coin', rate: 1 })
        },
      },
    },
    {
      id: 'margins',
      title: 'Set buy and sell margins',
      body: 'What does the player pay and get, × item value? Keep the sell margin below the buy margin, or buying and selling back makes money.',
      section: 'margins',
      target: 'field-buyMultiplier',
      done: (p) => isNum(data(p).margins?.buyMultiplier) && isNum(data(p).margins?.sellMultiplier),
      action: { label: 'Use Town’s values', run: applyTownMargins },
    },
    {
      id: 'reputation',
      title: 'Price by relationship',
      body: 'Give each Factions relationship level a buy price factor: hostile pays more, allies less. Selling divides by the same factor.',
      section: 'margins',
      target: 'examples',
      done: (p) => reputationLevels(p).length > 0 && Object.keys(data(p).margins?.byReputation ?? {}).length > 0 && reputationGaps(p).length === 0,
      action: { label: 'Pick a relationship ladder…', examples: 'margins' },
    },
    {
      id: 'merchants',
      title: 'Add one merchant of each kind',
      body: 'A wandering peddler, a town market stall and a faction capital trader. Each kind shows its own field group.',
      section: 'merchants',
      target: 'examples',
      done: allTypes,
      action: { label: 'Insert a merchant…', examples: 'merchants' },
    },
    {
      id: 'wandering',
      title: 'Decide how often the peddler comes',
      body: 'Set a roll interval and a chance, then read the Wandering calendar: how likely is a visit in a week?',
      section: 'merchants',
      target: 'view-wanderingCalendar',
      done: (p) => merchantsOf(p, 'Wandering').length > 0 && merchantsOf(p, 'Wandering').every((m) => wanderingOdds(p, m)),
    },
    {
      id: 'markets',
      title: 'Place the markets',
      body: 'Give each Town market a Town building and the act it opens in, so stock follows progression.',
      section: 'merchants',
      target: 'add',
      done: (p) => merchantsOf(p, 'Town market').length > 0 && merchantsOf(p, 'Town market').every((m) => m.building && m.unlockAct),
    },
    {
      id: 'rules',
      title: 'Scope your price rules',
      body: 'Each rule needs a side (buy, sell or both) and what it applies to. Rules without a scope are not applied.',
      section: 'priceRules',
      target: 'add',
      done: (p) => tradeList(p, 'priceRules').length > 0 && unscopedRules(p).length === 0,
    },
    {
      id: 'loops',
      title: 'Check for money loops',
      body: 'The Price ladder lists every way to buy low and sell high, including crafting from bought ingredients. Aim for none.',
      section: 'priceRules',
      target: 'view-priceLadder',
      done: (p) => {
        const a = arbitrage(p)
        return merchantsOf(p).some((m) => (m.goods ?? []).length > 0) && !a.inverse && !a.trade.length && !a.craft.length
      },
    },
    {
      id: 'flows',
      title: 'Balance money in and out',
      body: 'Add at least three sources and three sinks, then check Money flow: does the wallet stay meaningful in the last act?',
      section: 'flows',
      target: 'view-moneyFlow',
      done: (p) => {
        const f = tradeList(p, 'flows')
        return f.filter((x) => x.direction === 'Source').length >= 3 && f.filter((x) => x.direction === 'Sink').length >= 3
      },
      action: { label: 'Insert a starter economy…', examples: 'flows' },
    },
  ],
  examples: TRADE_EXAMPLES,
  concepts: {
    margins: {
      title: 'How a price is made',
      body: 'Item value (base × rarity × quality) is multiplied by the margin, the merchant’s markup, the relationship factor, difficulty and any matching price rules. Selling uses the sell margin and buyback, and divides by the relationship and difficulty factors.',
      diagram: 'priceChain',
    },
    priceRules: {
      title: 'Spread and money loops',
      body: 'The gap between what the player pays and what they get back is the spread. If any merchant buys something for more than another sells it for, the player can repeat that trade forever.',
      diagram: 'spread',
    },
    merchants: {
      title: 'Wandering odds',
      body: 'Every N days the game rolls for a visit. Rolls every 10 days at 50 % give 3 visits in 60 days on average, and an 88 % chance of at least one in 30 days.',
      diagram: 'wanderOdds',
    },
    flows: {
      title: 'Sources and sinks',
      body: 'Money flows into the wallet from sources and out through sinks. If sources win every act, money piles up and prices stop mattering; sinks that grow with progression keep it in check.',
      diagram: 'sourceSink',
    },
  },
  empty: {
    currencyTypes: 'Currencies are what the player pays with: coins, barter goods, faction scrip.',
    merchants: 'Merchants are where the player buys and sells: wandering peddlers, town markets and faction capitals.',
    priceRules: 'Price rules are extra factors on top of the margins: festival discounts, scarcity premiums, faction deals.',
    flows: 'Money flows are where money comes from and where it goes. A starter economy is a quick start.',
  },
}
