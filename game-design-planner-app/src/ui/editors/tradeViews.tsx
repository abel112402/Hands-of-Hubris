import { useState } from 'react'
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { Entity, Project } from '../../core/model/types'
import { itemList } from '../../core/items'
import { levelsOf } from '../../core/difficulty'
import {
  affordability,
  arbitrage,
  merchantsOf,
  moneyFlow,
  priceOf,
  reputationLevels,
  rollVisits,
  stockCoverage,
  tradeForm,
  wanderingOdds,
  type Price,
  type WanderOdds,
} from '../../core/trade'
import { useProject } from '../hooks'
import type { ViewProps } from './CollectionEditor'

const fmt = (n: number) => (Math.abs(n) >= 100 ? Math.round(n).toString() : (Math.round(n * 100) / 100).toString())
const pct = (p: number) => `${Math.round(p * 1000) / 10}%`
const nameOf = (e?: Entity) => (e ? String(e.name ?? '') || '(unnamed)' : '—')
const unitOf = (project: Project) => String(project.documents['design.items']?.data.model?.currency ?? '').trim()

function Picker({ label, value, onChange, options, none }: { label: string; value: string; onChange: (v: string) => void; options: { id: string; label: string }[]; none?: string }) {
  return (
    <label className="row">
      <span className="muted">{label}</span>
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
        {none !== undefined && <option value="">{none}</option>}
        {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
    </label>
  )
}

const difficultyOptions = (project: Project) => levelsOf(project).map((l) => ({ id: l.id, label: l.label }))

// ---------- Price ladder ----------

function Ladder({ title, price, side, onSelect, testId }: { title: string; price: Price | null; side: string; onSelect: (id?: string) => void; testId: string }) {
  if (!price) return <p className="empty">No base value.</p>
  const max = Math.max(1, ...price.steps.map((s) => s.value))
  return (
    <div className="price-ladder">
      <strong>{title}: <span data-testid={testId}>{fmt(price.price)}</span></strong>
      <table className="grid">
        <tbody>
          {price.steps.map((s, i) => (
            <tr key={i} className={s.ruleId ? 'clickable' : ''} onClick={s.ruleId ? () => onSelect(s.ruleId) : undefined}>
              <td>{s.label}</td>
              <td className={'num' + (s.factor !== null && s.factor !== 1 ? (s.factor > 1 === (side === 'buy') ? ' short' : ' long') : '')}>{s.factor === null ? '' : `×${fmt(s.factor)}`}</td>
              <td className="num">{fmt(s.value)}</td>
              <td className="ladder-bar-cell"><div className="ladder-bar" style={{ width: `${(100 * Math.max(0, s.value)) / max}%` }} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {price.formulaError && <p className="error-text">Formula “{price.formula}”: {price.formulaError}</p>}
    </div>
  )
}

/** Interactive price breakdown for one item, merchant, relationship level and difficulty, plus money-loop checks. */
export function PriceLadderView({ onSelect }: ViewProps) {
  const project = useProject()
  const items = itemList(project, 'items').filter((i) => typeof i.value === 'number')
  const [itemId, setItemId] = useState('')
  const [merchantId, setMerchantId] = useState('')
  const [levelId, setLevelId] = useState('')
  const [difficultyId, setDifficultyId] = useState('')
  const item = items.find((i) => i.id === itemId) ?? items[0]
  const levels = reputationLevels(project)
  const unit = unitOf(project)
  const loops = arbitrage(project)
  if (!item) return <p className="empty">Give items a base value in Items & Crafting to see their prices.</p>
  const ctx = { merchantId: merchantId || undefined, levelId: levelId || undefined, difficultyId: difficultyId || undefined }
  const buy = priceOf(project, item.id, { ...ctx, side: 'buy' })
  const sell = priceOf(project, item.id, { ...ctx, side: 'sell' })
  return (
    <div className="stack npc-preview">
      <div className="row">
        <Picker label="Item" value={item.id} onChange={setItemId} options={items.map((i) => ({ id: i.id, label: nameOf(i) }))} />
        <Picker label="Merchant" value={merchantId} onChange={setMerchantId} none="— any —" options={merchantsOf(project).map((m) => ({ id: m.id, label: nameOf(m) }))} />
        <Picker label="Relationship" value={levelId} onChange={setLevelId} none="— neutral —" options={levels.map((l) => ({ id: l.id, label: nameOf(l) }))} />
        <Picker label="Difficulty" value={difficultyId} onChange={setDifficultyId} none="— baseline —" options={difficultyOptions(project)} />
      </div>
      <p className="muted">Each step multiplies the one before. Prices are in {unit || 'the base unit'}; a planning estimate, not a simulation. Click a rule to open it.</p>
      <div className="price-ladders">
        <Ladder title="Player buys" price={buy} side="buy" onSelect={onSelect} testId="price-buy" />
        <Ladder title="Player sells" price={sell} side="sell" onSelect={onSelect} testId="price-sell" />
      </div>
      {levels.length > 0 && (
        <table className="grid">
          <thead>
            <tr><th>Relationship</th><th>Buy</th><th>Sell</th><th>Spread</th></tr>
          </thead>
          <tbody>
            {levels.map((l) => {
              const b = priceOf(project, item.id, { ...ctx, levelId: l.id, side: 'buy' })?.price ?? null
              const s = priceOf(project, item.id, { ...ctx, levelId: l.id, side: 'sell' })?.price ?? null
              const loop = b !== null && s !== null && s > b
              return (
                <tr key={l.id} className={l.id === levelId ? 'selected' : ''}>
                  <td>{nameOf(l)}</td>
                  <td className="num">{b === null ? '–' : fmt(b)}</td>
                  <td className="num">{s === null ? '–' : fmt(s)}</td>
                  <td className={'num' + (loop ? ' short' : '')}>{b === null || s === null ? '–' : fmt(b - s)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
      <div className="stack">
        <strong>Money loops</strong>
        {!loops.inverse && !loops.trade.length && !loops.craft.length && <p className="muted" data-testid="no-loops">No loops found at neutral relationship.</p>}
        {loops.inverse && <p className="error-text">The sell margin is at or above the buy margin: buying and selling back makes money.</p>}
        {loops.trade.length > 0 && (
          <ul className="loop-list">
            {loops.trade.slice(0, 8).map((l) => (
              <li key={l.item.id} data-testid="trade-loop">
                Buy <b>{nameOf(l.item)}</b> from {nameOf(l.from)} for {fmt(l.buy)}, sell to {nameOf(l.to)} for {fmt(l.sell)} (+{fmt(l.sell - l.buy)})
              </li>
            ))}
          </ul>
        )}
        {loops.craft.length > 0 && (
          <ul className="loop-list">
            {loops.craft.slice(0, 8).map((l) => (
              <li key={l.recipe.id} data-testid="craft-loop">
                Craft <b>{nameOf(l.item)}</b> from bought ingredients for {fmt(l.cost)}, sell for {fmt(l.income)} (+{fmt(l.income - l.cost)})
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

// ---------- Stock coverage ----------

/** Merchants × rarity (or item type) counts of what they sell; goods above the highest rarity are outlined. */
export function MerchantStockView({ items, selected, onSelect }: ViewProps) {
  const project = useProject()
  const [axis, setAxis] = useState<'rarity' | 'type'>('rarity')
  const c = stockCoverage(project)
  const shown = new Set(items.map((m) => m.id))
  const rows = c.rows.filter((r) => shown.has(r.merchant.id))
  const cols = axis === 'rarity' ? c.rarities : c.types
  const all = itemList(project, 'items')
  const max = Math.max(1, ...rows.flatMap((r) => Object.values(axis === 'rarity' ? r.byRarity : r.byType)))
  return (
    <div className="stack npc-preview">
      <div className="row">
        <Picker label="Columns" value={axis} onChange={(v) => setAxis(v as 'rarity' | 'type')} options={[{ id: 'rarity', label: 'Rarity' }, { id: 'type', label: 'Item type' }]} />
      </div>
      <p className="muted">How many goods each merchant sells. Outlined cells hold goods above the merchant’s highest rarity. Click a row to open the merchant.</p>
      <div className="table-wrap">
        <table className="grid matrix coverage">
          <thead>
            <tr>
              <th>Merchant</th>
              <th>Type</th>
              {cols.map((col) => <th key={col.id}>{col.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const counts = axis === 'rarity' ? r.byRarity : r.byType
              const over = new Set(r.overCap.map((g) => (axis === 'rarity' ? g.rarity : g.type)))
              return (
                <tr key={r.merchant.id} className={'clickable' + (r.merchant.id === selected ? ' selected' : '')} onClick={() => onSelect(r.merchant.id)}>
                  <th>{nameOf(r.merchant)}</th>
                  <td className="muted">{r.merchant.type ?? '—'}</td>
                  {cols.map((col) => {
                    const n = counts[col.id] ?? 0
                    return (
                      <td
                        key={col.id}
                        className={'num cov-cell' + (over.has(col.id) ? ' hole' : '')}
                        data-testid={over.has(col.id) ? 'over-cap' : undefined}
                        style={n ? { background: `rgba(91,156,255,${0.15 + (0.5 * n) / max})` } : undefined}
                        title={over.has(col.id) ? 'Above this merchant’s highest rarity' : undefined}
                      >
                        {n || ''}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {c.unsold.length > 0 && (
        <p className="muted">Items with a value no merchant sells or buys: {c.unsold.slice(0, 12).map(nameOf).join(', ')}{c.unsold.length > 12 ? ` +${c.unsold.length - 12}` : ''}</p>
      )}
      {c.leaked.length > 0 && <p className="error-text">Exclusive goods sold elsewhere: {c.leaked.map((l) => `${nameOf(l.item)} (${nameOf(l.merchant)}, also ${nameOf(l.other)})`).join('; ')}</p>}
      {all.length === 0 && <p className="empty">Add items in Items & Crafting to fill the merchants’ stock.</p>}
    </div>
  )
}

// ---------- Wandering calendar ----------

const DAYS = 60

function VisitStrip({ odds, seed }: { odds: WanderOdds; seed: number }) {
  const visits = rollVisits(odds, DAYS, seed)
  const w = 600
  const x = (d: number) => (d / DAYS) * w
  return (
    <svg viewBox={`0 0 ${w} 30`} className="visit-strip" role="img" aria-label="Visits over 60 days">
      <rect x="0" y="8" width={w} height="14" className="visit-track" />
      {Array.from({ length: Math.floor(DAYS / odds.interval) }, (_, i) => (i + 1) * odds.interval).map((d) => (
        <line key={d} x1={x(d)} x2={x(d)} y1="4" y2="26" className="visit-roll" />
      ))}
      {visits.map((d) => (
        <rect key={d} x={x(d)} y="8" width={Math.max(3, x(Math.max(odds.stayDays, 0.5)))} height="14" className="visit-on" data-testid="visit">
          <title>{`Day ${d}: visit for ${odds.stayDays} day(s)`}</title>
        </rect>
      ))}
    </svg>
  )
}

/** Visit odds per Wandering merchant and an example 60-day season. */
export function WanderingCalendarView({ items, selected, onSelect }: ViewProps) {
  const project = useProject()
  const [seed, setSeed] = useState(11)
  const wanderers = items.filter((m) => m.type === 'Wandering')
  const rules = wanderingOdds(project)
  const rows: { id?: string; label: string; odds: WanderOdds | null }[] = wanderers.length
    ? wanderers.map((m) => ({ id: m.id, label: nameOf(m), odds: wanderingOdds(project, m) }))
    : [{ label: 'Wandering rules', odds: rules }]
  return (
    <div className="stack npc-preview">
      <p className="muted">Each roll day the merchant comes with the given chance. Ticks are roll days, blocks are example visits (a planning estimate).</p>
      <table className="grid">
        <thead>
          <tr><th>Merchant</th><th>Roll every</th><th>Chance</th><th>Visits / {DAYS} days</th><th>≥1 in 7 days</th><th>≥1 in 30 days</th><th>Average gap</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id ?? 'rules'} className={(r.id ? 'clickable' : '') + (r.id && r.id === selected ? ' selected' : '')} onClick={r.id ? () => onSelect(r.id) : undefined}>
              <td>{r.label}</td>
              {r.odds ? (
                <>
                  <td className="num">{fmt(r.odds.interval)} d</td>
                  <td className="num">{pct(r.odds.chance)}</td>
                  <td className="num" data-testid="visits-60">{fmt(r.odds.expected(DAYS))}</td>
                  <td className="num">{pct(r.odds.atLeastOne(7))}</td>
                  <td className="num" data-testid="odds-30">{pct(r.odds.atLeastOne(30))}</td>
                  <td className="num">{Number.isFinite(r.odds.avgGap) ? `${fmt(r.odds.avgGap)} d` : 'never'}</td>
                </>
              ) : (
                <td colSpan={6} className="muted">Set a roll interval and a chance (here or in Wandering merchant).</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.some((r) => r.odds) && (
        <div className="stack">
          {rows.map((r) => r.odds && (
            <div key={r.id ?? 'rules'}>
              <span className="muted">{r.label}</span>
              <VisitStrip odds={r.odds} seed={seed} />
            </div>
          ))}
          <div className="row">
            <button className="small" onClick={() => setSeed(seed + 1)}>Roll another season</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------- Money flow ----------

/** Money in and out per act (or day), the wallet over time, and how long an item takes to afford. */
export function MoneyFlowView() {
  const project = useProject()
  const [difficultyId, setDifficultyId] = useState('')
  const [itemId, setItemId] = useState('')
  const flow = moneyFlow(project, difficultyId || undefined)
  const items = itemList(project, 'items').filter((i) => typeof i.value === 'number')
  const item = items.find((i) => i.id === itemId)
  const data = flow.periods.map((p) => ({ label: p.label, sources: p.sources, sinks: -p.sinks, net: p.net, wallet: p.wallet }))
  const tolerance = (typeof tradeForm(project, 'balance').keepTolerance === 'number' ? tradeForm(project, 'balance').keepTolerance : 50) / 100
  return (
    <div className="stack npc-preview">
      <div className="row">
        <Picker label="Difficulty" value={difficultyId} onChange={setDifficultyId} none="— baseline —" options={difficultyOptions(project)} />
        <Picker label="Afford item" value={itemId} onChange={setItemId} none="—" options={items.map((i) => ({ id: i.id, label: nameOf(i) }))} />
      </div>
      <p className="muted">
        {flow.byAct ? 'Per Story act' : 'Per day (add Story acts for a per-act view)'}, starting with {fmt(flow.start)}. Averages, not a simulation; difficulty scales buying, repairs and loot sales.
      </p>
      <div style={{ height: 240 }}>
        <ResponsiveContainer>
          <ComposedChart data={data} stackOffset="sign">
            <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
            <XAxis dataKey="label" />
            <YAxis />
            <Tooltip formatter={(v) => fmt(Number(v))} />
            <Legend />
            <ReferenceLine y={0} stroke="var(--muted)" />
            <Bar dataKey="sources" name="Money in" stackId="f" fill="#53c28b" />
            <Bar dataKey="sinks" name="Money out" stackId="f" fill="#e5707e" />
            <Line dataKey="net" name="Net" stroke="#f2c94c" dot={false} />
            <Line dataKey="wallet" name="Wallet" stroke="#4f9cf9" dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <table className="grid">
        <thead>
          <tr>
            <th>{flow.byAct ? 'Act' : 'Day'}</th><th>Days</th><th>In</th><th>Out</th><th>Net / day</th><th>Wallet</th><th>Kept</th>
            {item && <th>Days to buy {nameOf(item)}</th>}
          </tr>
        </thead>
        <tbody>
          {flow.periods.map((p, i) => {
            const a = item ? affordability(project, item.id, p, difficultyId || undefined) : null
            return (
              <tr key={p.id}>
                <td>{p.label}</td>
                <td className="num">{fmt(p.days)}</td>
                <td className="num">{fmt(p.sources)}</td>
                <td className="num">{fmt(p.sinks)}</td>
                <td className={'num' + (p.perDay < 0 ? ' short' : '')} data-testid={i === flow.periods.length - 1 ? 'flow-net-last' : undefined}>{fmt(p.perDay)}</td>
                <td className="num">{fmt(p.wallet)}</td>
                <td className={'num' + (p.kept > tolerance ? ' short' : '')}>{p.sources > 0 ? pct(p.kept) : '–'}</td>
                {item && <td className="num">{a ? (a.days === null ? 'never' : fmt(a.days)) : '–'}</td>}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
