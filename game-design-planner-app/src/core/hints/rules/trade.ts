import {
  arbitrage,
  balanceProblem,
  capitalsWithoutGate,
  marginConflicts,
  reputationGaps,
  stockCoverage,
  TRADE_DOC as DOC,
  tradeList,
  unknownFormulaVars,
  unscopedRules,
  wanderingWithoutRule,
} from '../../trade'
import type { Hint, HintRule } from '../types'
import { hintId, isDocEmpty, shortList } from '../util'

type Draft = Omit<Hint, 'id' | 'scope' | 'target' | 'titleKey' | 'bodyKey'> & { key: string; sectionId: string; entityId?: string }

const hint = (d: Draft): Hint => ({
  id: hintId(d.ruleId, d.entityId),
  ruleId: d.ruleId,
  severity: d.severity,
  scope: d.entityId ? 'entity' : 'section',
  target: { docId: DOC, sectionId: d.sectionId, entityId: d.entityId },
  titleKey: `hints.${d.key}.title`,
  bodyKey: `hints.${d.key}.body`,
  params: d.params,
  action: d.action ?? { kind: 'goto', docId: DOC, sectionId: d.sectionId },
})

const active = (id: string, evaluate: HintRule['evaluate']): HintRule => ({
  id,
  scope: 'section',
  appliesTo: ({ project, docId }) => docId === DOC && !isDocEmpty(project, DOC),
  evaluate,
})

const names = (l: Record<string, any>[]) => shortList(l.map((x) => String(x.name ?? '') || '(unnamed)'))
const r2 = (n: number) => Math.round(n * 100) / 100

/** Advisory trade and economy checks; nothing exceeds 'suggest'. */
export const tradeRules: HintRule[] = [
  active('trade.arbitrage', ({ project }) => {
    const a = arbitrage(project)
    const loops = [
      ...(a.inverse ? ['sell margin ≥ buy margin'] : []),
      ...a.trade.map((l) => `${l.item.name}: buy ${r2(l.buy)} at ${l.from.name}, sell ${r2(l.sell)} at ${l.to.name}`),
      ...a.craft.map((l) => `craft ${l.item.name} for ${r2(l.cost)}, sell for ${r2(l.income)}`),
    ]
    return loops.length ? [hint({ key: 'tradeArbitrage', ruleId: 'trade.arbitrage', severity: 'suggest', sectionId: 'priceRules', params: { count: loops.length, names: shortList(loops) } })] : []
  }),
  active('trade.marginConflict', ({ project }) => {
    const c = marginConflicts(project)
    return c.length ? [hint({ key: 'tradeMarginConflict', ruleId: 'trade.marginConflict', severity: 'info', sectionId: 'margins', params: { names: c.join(', ') } })] : []
  }),
  active('trade.ruleScope', ({ project }) => {
    const rows = unscopedRules(project)
    return rows.length ? [hint({ key: 'tradeRuleScope', ruleId: 'trade.ruleScope', severity: 'suggest', sectionId: 'priceRules', entityId: rows[0].id, params: { count: rows.length, names: names(rows) } })] : []
  }),
  active('trade.formulaVars', ({ project }) => {
    const vars = unknownFormulaVars(project)
    return vars.length ? [hint({ key: 'tradeFormulaVars', ruleId: 'trade.formulaVars', severity: 'suggest', sectionId: 'pricing', params: { names: vars.join(', ') } })] : []
  }),
  active('trade.wanderingRule', ({ project }) => {
    const rows = wanderingWithoutRule(project)
    return rows.length ? [hint({ key: 'tradeWanderingRule', ruleId: 'trade.wanderingRule', severity: 'suggest', sectionId: 'wandering', params: { count: rows.length, names: names(rows) } })] : []
  }),
  active('trade.capitalGate', ({ project }) => {
    const rows = capitalsWithoutGate(project)
    return rows.length ? [hint({ key: 'tradeCapitalGate', ruleId: 'trade.capitalGate', severity: 'suggest', sectionId: 'merchants', entityId: rows[0].id, params: { count: rows.length, names: names(rows) } })] : []
  }),
  active('trade.stock', ({ project }) => {
    if (!tradeList(project, 'merchants').length) return []
    const c = stockCoverage(project)
    const out: Hint[] = []
    const over = c.rows.filter((r) => r.overCap.length)
    if (over.length)
      out.push(hint({ key: 'tradeRarityCap', ruleId: 'trade.rarityCap', severity: 'suggest', sectionId: 'merchants', entityId: over[0].merchant.id, params: { names: shortList(over.map((r) => `${r.merchant.name}: ${r.overCap.map((g) => g.name).join(', ')}`)) } }))
    if (c.leaked.length)
      out.push(hint({ key: 'tradeExclusive', ruleId: 'trade.exclusive', severity: 'suggest', sectionId: 'merchants', entityId: c.leaked[0].merchant.id, params: { names: shortList(c.leaked.map((l) => `${l.item.name} (also ${l.other.name})`)) } }))
    if (c.unsold.length) out.push(hint({ key: 'tradeUnsold', ruleId: 'trade.unsold', severity: 'info', sectionId: 'merchants', params: { count: c.unsold.length, names: shortList(c.unsold.map((i) => String(i.name ?? '')), 5) } }))
    return out
  }),
  active('trade.balance', ({ project }) => {
    const b = balanceProblem(project)
    if (!b) return []
    return b.kind === 'noSinks'
      ? [hint({ key: 'tradeNoSinks', ruleId: 'trade.noSinks', severity: 'suggest', sectionId: 'flows', action: { kind: 'addEntity', docId: DOC, sectionId: 'flows', init: { direction: 'Sink', per: 'Day' } } })]
      : [hint({ key: 'tradePiling', ruleId: 'trade.noSinks', severity: 'suggest', sectionId: 'flows', params: { kept: Math.round(b.kept * 100), tolerance: Math.round(b.tolerance * 100) } })]
  }),
  active('trade.repCoverage', ({ project }) => {
    const rows = reputationGaps(project)
    return rows.length ? [hint({ key: 'tradeRepCoverage', ruleId: 'trade.repCoverage', severity: 'info', sectionId: 'margins', params: { count: rows.length, names: names(rows) } })] : []
  }),
]
