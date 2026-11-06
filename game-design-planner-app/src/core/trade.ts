import { cellsOf, paramsOf } from './difficulty'
import { tryEvaluate, variablesOf } from './formula'
import { itemList, multiplier } from './items'
import type { CatalogItem, Entity, FormulaData, Project } from './model/types'
import { actDays, actsInOrder } from './story'

/**
 * Trade & Economy analysis. Every number here is a planning estimate built from averages, not a simulation.
 */
export const TRADE_DOC = 'design.trade'
export const MERCHANT_TYPES = ['Wandering', 'Town market', 'Faction capital'] as const
/** Variables a price formula may use; see the Price formulas section description. */
export const PRICE_VARS = ['value', 'base', 'mult', 'margin', 'markup', 'rep', 'difficulty', 'rule']

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const num = (v: unknown, fallback: number) => (isNum(v) ? v : fallback)
const ids = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
const asMap = (v: unknown): Record<string, number> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, number>) : {})
const listOf = (project: Project, docId: string, section: string): Entity[] => {
  const d = project.documents[docId]?.data[section]
  return Array.isArray(d) ? d : []
}
const catalogItems = (project: Project, id: string): CatalogItem[] => project.registry.catalogs[id]?.items ?? []

export const tradeList = (project: Project, section: string) => listOf(project, TRADE_DOC, section)
export const tradeForm = (project: Project, section: string): Record<string, any> => {
  const d = project.documents[TRADE_DOC]?.data[section]
  return d && typeof d === 'object' && !Array.isArray(d) ? d : {}
}
export const merchantsOf = (project: Project, type?: string) => tradeList(project, 'merchants').filter((m) => !type || m.type === type)
/** Relationship levels from Factions (`thresholds`). */
export const reputationLevels = (project: Project) => listOf(project, 'design.factions', 'thresholds')
/** Story acts in timeline order; lives in core/story.ts. */
export const actsOf = actsInOrder

// ---------- Margins, reputation, difficulty ----------

export type Margins = { buy: number; sell: number; buySource: 'trade' | 'town' | 'default'; sellSource: 'trade' | 'town' | 'default' }

/** Trade's buy/sell multipliers; Town › Economy model is the fallback, then ×1. */
export function marginsOf(project: Project): Margins {
  const m = tradeForm(project, 'margins')
  const town = project.documents['design.town']?.data.economy ?? {}
  const pick = (own: unknown, other: unknown) => (isNum(own) ? ([own, 'trade'] as const) : isNum(other) ? ([other, 'town'] as const) : ([1, 'default'] as const))
  const [buy, buySource] = pick(m.buyMultiplier, town.buyMargin)
  const [sell, sellSource] = pick(m.sellMultiplier, town.sellMargin)
  return { buy, sell, buySource, sellSource }
}

/** Both Trade and Town set a margin, and they differ. */
export function marginConflicts(project: Project): string[] {
  const m = tradeForm(project, 'margins')
  const town = project.documents['design.town']?.data.economy ?? {}
  const out: string[] = []
  if (isNum(m.buyMultiplier) && isNum(town.buyMargin) && m.buyMultiplier !== town.buyMargin) out.push(`buy ×${m.buyMultiplier} vs ×${town.buyMargin}`)
  if (isNum(m.sellMultiplier) && isNum(town.sellMargin) && m.sellMultiplier !== town.sellMargin) out.push(`sell ×${m.sellMultiplier} vs ×${town.sellMargin}`)
  return out
}

/** The Difficulty parameter that scales prices: the linked one, else one named like “price”. */
export function difficultyParam(project: Project): Entity | undefined {
  const params = paramsOf(project)
  const linked = tradeForm(project, 'margins').difficultyParam
  if (linked) return params.find((p) => p.id === linked)
  return params.find((p) => /price/i.test(String(p.name ?? '')))
}

/** × price multiplier at a difficulty level; 1 without a level, parameter or value. */
export function difficultyPriceMult(project: Project, levelId?: string): number {
  const param = levelId ? difficultyParam(project) : undefined
  const v = param ? cellsOf(project)[`${param.id}|${levelId}`] : undefined
  return isNum(v) && v > 0 ? v : 1
}

/** × buy price at a relationship level; 1 when unset. */
export function repFactor(project: Project, levelId?: string): number {
  const v = levelId ? asMap(tradeForm(project, 'margins').byReputation)[levelId] : undefined
  return isNum(v) && v > 0 ? v : 1
}

// ---------- Prices ----------

export const sellsItem = (m: Entity, item: Entity) => ids(m.goods).includes(item.id)
/** A merchant buys what it sells and every item of the types it lists. */
export const buysItem = (m: Entity, item: Entity) => sellsItem(m, item) || (!!item.type && ids(m.buys).includes(item.type))

export type Side = 'buy' | 'sell'
export type PriceCtx = { side: Side; merchantId?: string; quality?: string; levelId?: string; difficultyId?: string }
export type PriceStep = { label: string; factor: number | null; value: number; ruleId?: string }
export type Price = { price: number; steps: PriceStep[]; formula?: string; formulaError?: string }

/** Whether a price rule applies; rules without a scope or factor, or paused, never do. */
export function ruleApplies(rule: Entity, side: Side, ctx: { merchant?: Entity; item: Entity; levelId?: string }): boolean {
  if (rule.paused || !isNum(rule.factor) || !rule.scope) return false
  if (rule.side === 'Buy' && side !== 'buy') return false
  if (rule.side === 'Sell' && side !== 'sell') return false
  const m = ctx.merchant
  switch (rule.scope) {
    case 'Global':
      return true
    case 'Merchant type':
      return !!rule.merchantType && m?.type === rule.merchantType
    case 'Merchant':
      return !!rule.merchant && m?.id === rule.merchant
    case 'Faction':
      return !!rule.faction && m?.faction === rule.faction
    case 'Reputation level':
      return !!rule.level && ctx.levelId === rule.level
    case 'Item type':
      return !!rule.itemType && ctx.item.type === rule.itemType
    case 'Rarity':
      return !!rule.rarity && ctx.item.rarity === rule.rarity
    default:
      return false
  }
}

/** The pricing formula for a side: one whose name contains “buy” or “sell”. */
export function formulaFor(project: Project, side: Side) {
  const items = (tradeForm(project, 'pricing') as Partial<FormulaData>).items ?? []
  return items.find((f) => String(f.name ?? '').toLowerCase().includes(side) && String(f.expr ?? '').trim())
}

/** Formula variables that are neither price variables nor set on the formula itself. */
export function unknownFormulaVars(project: Project): string[] {
  const out: string[] = []
  for (const side of ['buy', 'sell'] as const) {
    const f = formulaFor(project, side)
    if (!f) continue
    for (const v of variablesOf(f.expr)) if (!PRICE_VARS.includes(v) && !(v in (f.vars ?? {})) && !out.includes(v)) out.push(v)
  }
  return out
}

/**
 * Price of an item for the player, step by step: base value → rarity × quality (Items) → margin → merchant markup or
 * buyback → relationship → difficulty → price rules. Selling divides by the relationship and difficulty factors.
 * A “buy price” / “sell price” formula, if set, replaces the result. Null when the item has no base value.
 */
export function priceOf(project: Project, itemId: string, ctx: PriceCtx): Price | null {
  const item = itemList(project, 'items').find((i) => i.id === itemId)
  if (!item || !isNum(item.value)) return null
  const merchant = ctx.merchantId ? tradeList(project, 'merchants').find((m) => m.id === ctx.merchantId) : undefined
  const buy = ctx.side === 'buy'
  const mult = multiplier(project, item.rarity, ctx.quality ?? item.quality)
  const margins = marginsOf(project)
  const margin = buy ? margins.buy : margins.sell
  const markup = merchant ? num(buy ? merchant.markup : merchant.buyback, 1) : 1
  const rep = repFactor(project, ctx.levelId)
  const diff = difficultyPriceMult(project, ctx.difficultyId)
  const repF = buy ? rep : 1 / rep
  const diffF = buy ? diff : 1 / diff
  const rules = tradeList(project, 'priceRules').filter((r) => ruleApplies(r, ctx.side, { merchant, item, levelId: ctx.levelId }))
  const ruleF = rules.reduce((s, r) => s * r.factor, 1)

  const steps: PriceStep[] = [{ label: 'Base value', factor: null, value: item.value }]
  const push = (label: string, factor: number, ruleId?: string) => steps.push({ label, factor, value: steps[steps.length - 1].value * factor, ...(ruleId ? { ruleId } : {}) })
  push('Rarity × quality', mult)
  push(buy ? 'Buy margin' : 'Sell margin', margin)
  push(buy ? 'Merchant markup' : 'Merchant buyback', markup)
  push('Relationship', repF)
  push('Difficulty', diffF)
  for (const r of rules) push(String(r.name ?? 'Rule'), r.factor, r.id)

  const out: Price = { price: steps[steps.length - 1].value, steps }
  const f = formulaFor(project, ctx.side)
  if (f) {
    const res = tryEvaluate(f.expr, { ...(f.vars ?? {}), value: item.value * mult, base: item.value, mult, margin, markup, rep: repF, difficulty: diffF, rule: ruleF })
    out.formula = f.name
    if (res.ok) {
      out.price = res.value
      steps.push({ label: `Formula “${f.name}”`, factor: null, value: res.value })
    } else out.formulaError = res.error
  }
  return out
}

const price = (project: Project, itemId: string, ctx: PriceCtx) => priceOf(project, itemId, ctx)?.price ?? null

/** Buy and sell price at every merchant that trades the item. */
export function spread(project: Project, itemId: string, ctx: Omit<PriceCtx, 'side' | 'merchantId'> = {}) {
  const item = itemList(project, 'items').find((i) => i.id === itemId)
  if (!item) return []
  return merchantsOf(project)
    .filter((m) => buysItem(m, item))
    .map((m) => ({
      merchant: m,
      buy: sellsItem(m, item) ? price(project, itemId, { ...ctx, side: 'buy', merchantId: m.id }) : null,
      sell: price(project, itemId, { ...ctx, side: 'sell', merchantId: m.id }),
    }))
}

export type TradeLoop = { item: Entity; from: Entity; to: Entity; buy: number; sell: number }
export type CraftLoop = { recipe: Entity; item: Entity; cost: number; income: number }
export type Arbitrage = { trade: TradeLoop[]; craft: CraftLoop[]; inverse: boolean }

/**
 * Ways to make money from nothing, at neutral relationship and no difficulty:
 * buying from one merchant and selling to another (or the same) for more; buying a recipe's item ingredients and
 * selling the result for more (recipes that also need raw resources are skipped: gathering is not a loop);
 * and a sell margin at or above the buy margin.
 */
export function arbitrage(project: Project): Arbitrage {
  const items = itemList(project, 'items')
  const merchants = merchantsOf(project)
  const byId = new Map(items.map((i) => [i.id, i]))
  const cheapestBuy = (item: Entity) => {
    let best: { m: Entity; p: number } | null = null
    for (const m of merchants) {
      if (!sellsItem(m, item)) continue
      const p = price(project, item.id, { side: 'buy', merchantId: m.id })
      if (p !== null && (!best || p < best.p)) best = { m, p }
    }
    return best
  }
  const bestSell = (item: Entity) => {
    let best: { m: Entity; p: number } | null = null
    for (const m of merchants) {
      if (!buysItem(m, item)) continue
      const p = price(project, item.id, { side: 'sell', merchantId: m.id })
      if (p !== null && (!best || p > best.p)) best = { m, p }
    }
    return best
  }
  const trade: TradeLoop[] = []
  for (const item of items) {
    const from = cheapestBuy(item)
    const to = bestSell(item)
    if (from && to && to.p > from.p + 1e-9) trade.push({ item, from: from.m, to: to.m, buy: from.p, sell: to.p })
  }
  const craft: CraftLoop[] = []
  for (const recipe of itemList(project, 'recipes')) {
    const item = byId.get(recipe.result)
    const parts = Object.entries(asMap(recipe.ingredients)).filter(([, n]) => isNum(n) && n > 0)
    if (!item || !parts.length || Object.values(asMap(recipe.resources)).some((n) => isNum(n) && n > 0)) continue
    let cost = 0
    let ok = true
    for (const [id, n] of parts) {
      const ing = byId.get(id)
      const b = ing && cheapestBuy(ing)
      if (!b) {
        ok = false
        break
      }
      cost += b.p * n
    }
    const s = bestSell(item)
    if (!ok || !s) continue
    const income = s.p * (isNum(recipe.outputQty) && recipe.outputQty > 0 ? recipe.outputQty : 1)
    if (income > cost + 1e-9) craft.push({ recipe, item, cost, income })
  }
  const m = marginsOf(project)
  const inverse = (m.buySource !== 'default' || m.sellSource !== 'default') && m.sell >= m.buy
  return { trade, craft, inverse }
}

// ---------- Wandering merchant ----------

export type WanderOdds = { interval: number; chance: number; stayDays: number; expected: (days: number) => number; atLeastOne: (days: number) => number; avgGap: number }

/** Visit odds from a roll every `interval` days with `chance` %; the merchant's own values override the Wandering rules. */
export function wanderingOdds(project: Project, merchant?: Entity): WanderOdds | null {
  const w = tradeForm(project, 'wandering')
  const interval = isNum(merchant?.interval) ? merchant.interval : w.interval
  const pct = isNum(merchant?.chance) ? merchant.chance : w.chance
  if (!isNum(interval) || interval <= 0 || !isNum(pct)) return null
  const c = Math.min(1, Math.max(0, pct / 100))
  const rolls = (days: number) => Math.floor(days / interval)
  return {
    interval,
    chance: c,
    stayDays: isNum(merchant?.stayDays) ? merchant.stayDays : num(w.stayDays, 1),
    expected: (days) => rolls(days) * c,
    atLeastOne: (days) => 1 - Math.pow(1 - c, rolls(days)),
    avgGap: c > 0 ? interval / c : Infinity,
  }
}

/** Deterministic example season: the days a visit starts within `days` (seeded LCG, same result for the same seed). */
export function rollVisits(odds: WanderOdds, days: number, seed = 11): number[] {
  let s = seed >>> 0
  const rand = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296)
  const out: number[] = []
  for (let d = odds.interval; d <= days; d += odds.interval) if (rand() < odds.chance) out.push(d)
  return out
}

// ---------- Stock ----------

export type StockRow = { merchant: Entity; byRarity: Record<string, number>; byType: Record<string, number>; overCap: Entity[] }
export type StockCoverage = { rarities: CatalogItem[]; types: CatalogItem[]; rows: StockRow[]; unsold: Entity[]; leaked: { merchant: Entity; item: Entity; other: Entity }[] }

/**
 * What each merchant sells by rarity and type, goods above a merchant's highest rarity, items with a value that no
 * merchant sells or buys, and exclusive goods that another merchant also sells.
 */
export function stockCoverage(project: Project): StockCoverage {
  const rarities = catalogItems(project, 'rarities')
  const types = catalogItems(project, 'itemTypes')
  const items = itemList(project, 'items')
  const byId = new Map(items.map((i) => [i.id, i]))
  const rank = (r?: string) => rarities.findIndex((x) => x.id === r)
  const merchants = merchantsOf(project)
  const rows: StockRow[] = merchants.map((m) => {
    const goods = ids(m.goods).map((id) => byId.get(id)).filter((i): i is Entity => !!i)
    const byRarity: Record<string, number> = {}
    const byType: Record<string, number> = {}
    for (const g of goods) {
      if (g.rarity) byRarity[g.rarity] = (byRarity[g.rarity] ?? 0) + 1
      if (g.type) byType[g.type] = (byType[g.type] ?? 0) + 1
    }
    const cap = m.rarityCap ? rank(m.rarityCap) : -1
    const overCap = cap >= 0 ? goods.filter((g) => rank(g.rarity) > cap) : []
    return { merchant: m, byRarity, byType, overCap }
  })
  const unsold = merchants.length ? items.filter((i) => isNum(i.value) && i.value > 0 && !merchants.some((m) => buysItem(m, i))) : []
  const leaked: StockCoverage['leaked'] = []
  for (const m of merchants)
    for (const id of ids(m.exclusive)) {
      const item = byId.get(id)
      const other = item && merchants.find((o) => o.id !== m.id && sellsItem(o, item))
      if (item && other) leaked.push({ merchant: m, item, other })
    }
  return { rarities, types, rows, unsold, leaked }
}

// ---------- Money flow ----------

export type FlowPeriod = { id: string; label: string; days: number; sources: number; sinks: number; net: number; perDay: number; wallet: number; kept: number }
export type MoneyFlow = { periods: FlowPeriod[]; byAct: boolean; start: number }

const SCALED_SINKS = new Set(['Buying', 'Repair'])

/** Average money per day from a flow (per-event flows × events per day, default 1). */
export const dailyAmount = (flow: Entity) => (flow.per === 'Event' ? num(flow.amount, 0) * num(flow.perDay, 1) : num(flow.amount, 0))

/**
 * Money in and out per Story act (or per day without acts), with the player's wallet at the end of each period.
 * Difficulty multiplies buying and repair costs and divides loot sales, like prices.
 */
export function moneyFlow(project: Project, difficultyId?: string): MoneyFlow {
  const bal = tradeForm(project, 'balance')
  const cur = tradeForm(project, 'currency')
  const start = num(cur.startingMoney, 0)
  const cap = isNum(cur.walletCap) && cur.walletCap > 0 ? cur.walletCap : Infinity
  const d = difficultyPriceMult(project, difficultyId)
  const acts = actsOf(project)
  const actIndex = new Map(acts.map((a, i) => [a.id, i]))
  const flows = tradeList(project, 'flows')
  const byAct = acts.length > 0
  const periods: { id: string; label: string; days: number; idx: number }[] = byAct
    ? acts.map((a, i) => ({ id: a.id, label: String(a.name ?? `Act ${i + 1}`), days: actDays(project, a) * num(bal.actDays, 1), idx: i }))
    : Array.from({ length: Math.min(365, Math.max(1, Math.round(num(bal.horizonDays, 30)))) }, (_, i) => ({ id: `d${i + 1}`, label: `Day ${i + 1}`, days: 1, idx: i }))
  let wallet = start
  const out: FlowPeriod[] = periods.map((p) => {
    let sources = 0
    let sinks = 0
    for (const f of flows) {
      if (byAct) {
        const from = f.fromAct && actIndex.has(f.fromAct) ? actIndex.get(f.fromAct)! : 0
        const to = f.toAct && actIndex.has(f.toAct) ? actIndex.get(f.toAct)! : acts.length - 1
        if (p.idx < from || p.idx > to) continue
      }
      const daily = dailyAmount(f)
      if (f.direction === 'Sink') sinks += daily * (SCALED_SINKS.has(f.kind) ? d : 1) * p.days
      else if (f.direction === 'Source') sources += (daily / (f.kind === 'Selling loot' ? d : 1)) * p.days
    }
    const net = sources - sinks
    wallet = Math.min(cap, wallet + net)
    return { id: p.id, label: p.label, days: p.days, sources, sinks, net, perDay: p.days > 0 ? net / p.days : 0, wallet, kept: sources > 0 ? net / sources : 0 }
  })
  return { periods: out, byAct, start }
}

/** Days of net income a period needs to buy an item at its cheapest merchant (or at plain value × margin); null if income is not positive. */
export function affordability(project: Project, itemId: string, period: FlowPeriod, difficultyId?: string): { price: number; days: number | null } | null {
  const item = itemList(project, 'items').find((i) => i.id === itemId)
  if (!item) return null
  const sellers = merchantsOf(project).filter((m) => sellsItem(m, item))
  const prices = (sellers.length ? sellers.map((m) => price(project, itemId, { side: 'buy', merchantId: m.id, difficultyId })) : [price(project, itemId, { side: 'buy', difficultyId })]).filter(isNum)
  if (!prices.length) return null
  const p = Math.min(...prices)
  return { price: p, days: period.perDay > 0 ? p / period.perDay : null }
}

// ---------- Checks used by hints ----------

export const unscopedRules = (project: Project) => tradeList(project, 'priceRules').filter((r) => isNum(r.factor) && !r.paused && (!r.scope || (r.scope !== 'Global' && !scopeTarget(r))))
const scopeTarget = (r: Entity) =>
  ({ 'Merchant type': r.merchantType, Merchant: r.merchant, Faction: r.faction, 'Reputation level': r.level, 'Item type': r.itemType, Rarity: r.rarity })[r.scope as string]

export const wanderingWithoutRule = (project: Project) => merchantsOf(project, 'Wandering').filter((m) => !wanderingOdds(project, m))

export const capitalsWithoutGate = (project: Project) => {
  const fallback = tradeForm(project, 'capital').minLevel
  return merchantsOf(project, 'Faction capital').filter((m) => !m.faction || !(m.minLevel || fallback))
}

/** Relationship levels the reputation price map leaves out (only once the map has any entry). */
export function reputationGaps(project: Project): Entity[] {
  const map = asMap(tradeForm(project, 'margins').byReputation)
  if (!Object.values(map).some(isNum)) return []
  return reputationLevels(project).filter((l) => !isNum(map[l.id]))
}

/** 'noSinks' when money only comes in; 'piling' when the last period keeps more income than the tolerance. */
export function balanceProblem(project: Project): { kind: 'noSinks' } | { kind: 'piling'; kept: number; tolerance: number } | null {
  const flows = tradeList(project, 'flows')
  const sources = flows.filter((f) => f.direction === 'Source' && dailyAmount(f) > 0)
  if (!sources.length) return null
  if (!flows.some((f) => f.direction === 'Sink' && dailyAmount(f) > 0)) return { kind: 'noSinks' }
  const last = moneyFlow(project).periods.at(-1)
  const tolerance = num(tradeForm(project, 'balance').keepTolerance, 50) / 100
  return last && last.kept > tolerance ? { kind: 'piling', kept: last.kept, tolerance } : null
}
