import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { Entity, Project } from '../../core/model/types'
import { coverage, craftTree, finalValue, itemList, itemUses, lootOdds, rawCost, recipesFor, simulateLoot, valueAdded, valueGrid, type CraftNode } from '../../core/items'
import { useProject } from '../hooks'
import type { ViewProps } from './CollectionEditor'
import { countOf } from '../../core/text'

const PALETTE = ['#8b93a5', '#53c28b', '#4f9cf9', '#d86be0', '#f2c94c', '#f97b4f', '#5ad1d1']
const fmt = (n: number) => (Math.abs(n) >= 100 ? Math.round(n).toString() : (Math.round(n * 100) / 100).toString())
const pct = (p: number) => `${p >= 0.1 ? Math.round(p * 1000) / 10 : Math.round(p * 10000) / 100}%`

/** Colour of a rarity: its tier's colour, else a palette entry by catalog order. */
function rarityColor(project: Project, rarityId?: string) {
  const tier = itemList(project, 'rarityTiers').find((t) => t.rarity === rarityId)
  if (tier?.color) return tier.color as string
  const idx = (project.registry.catalogs.rarities?.items ?? []).findIndex((r) => r.id === rarityId)
  return idx >= 0 ? PALETTE[idx % PALETTE.length] : '#666'
}

/** Items per type × rarity; empty cells inside a type's used range are holes. */
export function CoverageView({ items, onSelect, selected }: ViewProps) {
  const project = useProject()
  const c = coverage(project)
  const [cell, setCell] = useState<string | null>(null)
  const holes = new Set(c.holes.map((h) => `${h.type.id}|${h.rarity.id}`))
  const max = Math.max(1, ...Object.values(c.counts))
  const listed = cell ? items.filter((i) => `${i.type}|${i.rarity}` === cell) : []
  return (
    <div className="stack npc-preview">
      <p className="muted">How many items each type has per rarity. Outlined cells are gaps between rarities a type already uses. Click a cell to list its items.</p>
      <div className="table-wrap">
        <table className="grid matrix coverage">
          <thead>
            <tr>
              <th />
              {c.rarities.map((r) => (
                <th key={r.id} style={{ color: rarityColor(project, r.id) }}>{r.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {c.types.map((t) => (
              <tr key={t.id}>
                <th>{t.label}</th>
                {c.rarities.map((r) => {
                  const key = `${t.id}|${r.id}`
                  const n = c.counts[key] ?? 0
                  return (
                    <td
                      key={r.id}
                      className={'num cov-cell' + (holes.has(key) ? ' hole' : '') + (cell === key ? ' on' : '')}
                      style={n ? { background: `rgba(91,156,255,${0.15 + (0.5 * n) / max})` } : undefined}
                      onClick={() => setCell(cell === key ? null : key)}
                      title={holes.has(key) ? 'Gap: no item at this rarity' : undefined}
                    >
                      {n || ''}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {c.untyped > 0 && <p className="muted">{countOf(c.untyped, 'item')} {c.untyped === 1 ? 'has no type or rarity yet and is' : 'have no type or rarity yet and are'} not counted.</p>}
      {cell && (
        <div className="chips">
          {listed.length === 0 && <span className="muted">No items here.</span>}
          {listed.map((i) => (
            <button key={i.id} className={'chip' + (i.id === selected ? ' on' : '')} onClick={() => onSelect(i.id)}>{i.name || '(unnamed)'}</button>
          ))}
        </div>
      )}
    </div>
  )
}

/** The selected item's value at every rarity and quality, and all items' final values side by side. */
export function ValuePreviewView({ items, selected, onSelect }: ViewProps) {
  const project = useProject()
  const item = items.find((i) => i.id === selected) ?? items.find((i) => typeof i.value === 'number')
  const data = items
    .map((i) => ({ id: i.id, name: i.name || '(unnamed)', value: finalValue(project, i), rarity: i.rarity }))
    .filter((x): x is { id: string; name: string; value: number; rarity: string } => x.value !== null)
    .sort((a, b) => a.value - b.value)
  const grid = item ? valueGrid(project, item) : null
  return (
    <div className="stack npc-preview">
      <p className="muted">Final value = base value × rarity/quality multiplier. Select an item to see where it would sit at every rarity and quality.</p>
      {item && grid && (
        <>
          <strong>{item.name || '(unnamed)'}</strong>
          {typeof item.value !== 'number' ? (
            <p className="empty">Give this item a base value.</p>
          ) : (
            <table className="grid">
              <thead>
                <tr>
                  <th />
                  {grid.qualities.map((q) => <th key={q.id}>{q.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {grid.rarities.map((r) => (
                  <tr key={r.id}>
                    <th style={{ color: rarityColor(project, r.id) }}>{r.label}</th>
                    {grid.qualities.map((q) => {
                      const v = grid.cells[`${r.id}|${q.id}`]
                      const own = r.id === item.rarity && q.id === item.quality
                      return <td key={q.id} className={'num' + (own ? ' own' : '')}>{v === null ? '–' : fmt(v)}</td>
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
      {data.length > 0 && (
        <div style={{ height: Math.max(160, Math.min(420, data.length * 22)) }}>
          <ResponsiveContainer>
            <BarChart data={data} layout="vertical" margin={{ left: 20 }} onClick={(e) => { const id = (e as { activePayload?: { payload: { id: string } }[] })?.activePayload?.[0]?.payload.id; if (id) onSelect(id) }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334" />
              <XAxis type="number" />
              <YAxis type="category" dataKey="name" width={120} />
              <Tooltip />
              <Bar dataKey="value" name="Final value">
                {data.map((d) => <Cell key={d.id} fill={rarityColor(project, d.rarity)} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

// ---------- Crafting tree ----------

const NW = 170
const NH = 40
const COL = 230
const ROWH = 52

type Laid = { node: CraftNode; x: number; y: number; parent?: Laid }

function layout(root: CraftNode) {
  const out: Laid[] = []
  let row = 0
  const place = (n: CraftNode, depth: number, parent?: Laid): Laid => {
    const me: Laid = { node: n, x: depth * COL, y: 0, parent }
    out.push(me)
    if (!n.children.length) me.y = row++ * ROWH
    else {
      const kids = n.children.map((c) => place(c, depth + 1, me))
      me.y = (kids[0].y + kids[kids.length - 1].y) / 2
    }
    return me
  }
  place(root, 0)
  const depth = Math.max(...out.map((l) => l.x)) / COL
  return { laid: out, width: (depth + 1) * COL, height: Math.max(1, row) * ROWH }
}

/** Ingredient tree of an item, drawn from the recipe data, with totals and value added. */
export function CraftTreeView({ items, selected, onSelect }: ViewProps) {
  const project = useProject()
  const allItems = itemList(project, 'items')
  const results = [...new Set(items.map((r) => r.result).filter(Boolean))] as string[]
  const selRecipe = items.find((r) => r.id === selected)
  const [picked, setPicked] = useState<string>('')
  const [qty, setQty] = useState(1)
  const itemId = (picked && results.includes(picked) ? picked : selRecipe?.result) ?? results[0]
  if (!itemId) return <p className="empty">Give a recipe a result item to draw its crafting tree.</p>
  const tree = craftTree(project, itemId, qty)
  const cost = rawCost(project, itemId, qty)
  const { laid, width, height } = layout(tree)
  const resources = new Map((project.registry.catalogs.resources?.items ?? []).map((r) => [r.id, r.label]))
  const name = (id: string) => allItems.find((i) => i.id === id)?.name ?? '⚠ missing'
  const recipe = recipesFor(project, itemId)[0]
  const va = recipe ? valueAdded(project, recipe) : null
  const usedIn = itemUses(project, itemId).filter((u) => u.kind === 'ingredient')
  return (
    <div className="stack npc-preview">
      <div className="row">
        <span className="muted">Item</span>
        <select aria-label="Item" value={itemId} onChange={(e) => setPicked(e.target.value)}>
          {results.map((id) => <option key={id} value={id}>{name(id)}</option>)}
        </select>
        <span className="muted">Quantity</span>
        <input aria-label="Quantity" type="number" min={1} style={{ width: 70 }} value={qty} onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))} />
      </div>
      {cost.cycle && <p className="error-text">This chain loops: an item is (indirectly) an ingredient of itself.</p>}
      <div className="tl-scroll">
        <svg className="craft-tree" width={width} height={height + 4} role="img" aria-label="Crafting tree">
          {laid.filter((l) => l.parent).map((l) => {
            const p = l.parent!
            const x1 = p.x + NW
            const y1 = p.y + NH / 2
            const x2 = l.x
            const y2 = l.y + NH / 2
            return (
              <g key={`e-${laid.indexOf(l)}`}>
                <path d={`M${x1},${y1} C${x1 + 30},${y1} ${x2 - 30},${y2} ${x2},${y2}`} className="st-edge" />
                <text x={x2 - 6} y={y2 - 5} textAnchor="end" className="st-meta">×{fmt(l.node.qty)}</text>
              </g>
            )
          })}
          {laid.map((l, i) => (
            <g key={i} transform={`translate(${l.x},${l.y})`} className={'ct-node ' + l.node.kind + (l.node.recipe ? ' crafted' : '') + (l.node.cycle ? ' cycle' : '')}>
              <rect width={NW} height={NH} rx={6} />
              <text x={8} y={16} className="st-name">{l.node.label.slice(0, 22)}</text>
              <text x={8} y={32} className="st-meta">
                {l.node.kind === 'resource' ? 'raw resource' : l.node.cycle ? 'loops back' : l.node.recipe ? `crafted${l.node.station ? ` at ${l.node.station}` : ''}` : 'not craftable'}
              </text>
            </g>
          ))}
        </svg>
      </div>
      <p>
        <strong>Raw cost:</strong>{' '}
        {[...Object.entries(cost.resources).map(([id, n]) => `${fmt(n)} ${resources.get(id) ?? id}`), ...Object.entries(cost.items).map(([id, n]) => `${fmt(n)} ${name(id)}`)].join(', ') || 'nothing yet'}
        {' · '}<strong>Depth:</strong> {cost.depth}
        {cost.stations.length > 0 && <> · <strong>Stations:</strong> {cost.stations.join(', ')}</>}
      </p>
      {va && (
        <p>
          <strong>Value added:</strong> output {fmt(va.output)} vs ingredients {fmt(va.input)} ({va.ratio === Infinity ? '∞' : `×${fmt(va.ratio)}`})
          {va.ratio < 1 && <span className="pill warning"> crafting loses value</span>}
        </p>
      )}
      {usedIn.length > 0 && <p className="muted">Used in: {usedIn.map((u) => u.label).join(', ')}</p>}
      {recipe && (
        <button className="small" onClick={() => onSelect(recipe.id)}>Edit this recipe</button>
      )}
    </div>
  )
}

/** Drop weight against power per rarity: rarer tiers should drop less and be stronger. */
export function RarityCurveView({ items, onSelect }: ViewProps) {
  const project = useProject()
  const order = project.registry.catalogs.rarities?.items ?? []
  const data = order
    .map((r) => ({ r, t: items.find((t) => t.rarity === r.id) }))
    .filter((x): x is { r: (typeof order)[number]; t: Entity } => !!x.t)
    .map(({ r, t }) => ({ id: t.id, name: r.label, dropWeight: t.dropWeight, statMultiplier: t.statMultiplier, color: rarityColor(project, r.id) }))
  if (!data.length) return <p className="empty">Link tiers to rarities to draw the curve.</p>
  return (
    <div className="stack npc-preview">
      <p className="muted">Bars: drop weight (should fall). Line: stat multiplier (should rise).</p>
      <div style={{ height: 260 }}>
        <ResponsiveContainer>
          <ComposedChart data={data} onClick={(e) => { const id = (e as { activePayload?: { payload: { id: string } }[] })?.activePayload?.[0]?.payload.id; if (id) onSelect(id) }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334" />
            <XAxis dataKey="name" />
            <YAxis yAxisId="w" />
            <YAxis yAxisId="m" orientation="right" />
            <Tooltip />
            <Legend />
            <Bar yAxisId="w" dataKey="dropWeight" name="Drop weight">
              {data.map((d) => <Cell key={d.id} fill={d.color} />)}
            </Bar>
            <Line yAxisId="m" dataKey="statMultiplier" name="Stat multiplier" stroke="#f2c94c" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

/** Interactive odds for one loot table: chance per item, rarity mix, kills needed, and an example run. */
export function LootOddsView({ items, selected, onSelect }: ViewProps) {
  const project = useProject()
  const table = items.find((t) => t.id === selected) ?? items[0]
  const [rolls, setRolls] = useState<number | null>(null)
  const [kills, setKills] = useState(10)
  const [sim, setSim] = useState<{ table: string; counts: Record<string, number>; n: number } | null>(null)
  if (!table) return null
  const odds = lootOdds(project, table, rolls ?? undefined)
  const name = (id: string, e?: Entity) => (e ? e.name || '(unnamed)' : `⚠ ${id}`)
  return (
    <div className="stack npc-preview">
      <div className="row">
        <span className="muted">Table</span>
        <select aria-label="Loot table" value={table.id} onChange={(e) => { onSelect(e.target.value); setRolls(null); setSim(null) }}>
          {items.map((t) => <option key={t.id} value={t.id}>{t.name || '(unnamed)'}</option>)}
        </select>
        <span className="muted">Rolls</span>
        <input aria-label="Rolls" type="number" min={0} style={{ width: 60 }} value={odds.rolls} onChange={(e) => setRolls(Math.max(0, Number(e.target.value) || 0))} />
        <span className="muted">Chance within</span>
        <input aria-label="Kills" type="number" min={1} style={{ width: 70 }} value={kills} onChange={(e) => setKills(Math.max(1, Number(e.target.value) || 1))} />
        <span className="muted">kills / openings</span>
      </div>
      {odds.rows.length === 0 ? (
        <p className="empty">Give the table item weights to see the odds.</p>
      ) : (
        <>
          <div className="rarity-mix" aria-label="Rarity mix per roll">
            {odds.rarityMix.map((m, i) => (
              <span key={i} style={{ flex: m.share, background: rarityColor(project, m.rarity?.id) }} title={`${m.rarity?.label ?? 'No rarity'}: ${pct(m.share)}`}>
                {m.share > 0.08 ? `${m.rarity?.label ?? '–'} ${pct(m.share)}` : ''}
              </span>
            ))}
          </div>
          <table className="grid">
            <thead>
              <tr>
                <th>Item</th>
                <th>Weight</th>
                <th>Per roll</th>
                <th>Per drop</th>
                <th>Within {kills}</th>
                <th>Kills for 50%</th>
                <th>Kills for 90%</th>
              </tr>
            </thead>
            <tbody>
              {odds.rows.map((r) => (
                <tr key={r.id}>
                  <td style={{ color: rarityColor(project, r.item?.rarity) }}>{name(r.id, r.item)}{r.guaranteed ? ' (always)' : ''}</td>
                  <td className="num">{fmt(r.weight)}</td>
                  <td className="num">{pct(r.perRoll)}</td>
                  <td className="num">{pct(r.perDrop)}</td>
                  <td className="num">{pct(1 - Math.pow(1 - r.perDrop, kills))}</td>
                  <td className="num">{r.killsFor50 ?? '–'}</td>
                  <td className="num">{r.killsFor90 ?? '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="row">
            <button onClick={() => setSim({ table: table.id, n: 100, counts: simulateLoot(table, 100, rolls ?? undefined) })}>Simulate 100 drops</button>
            <span className="muted">An example run with a fixed seed, so it is the same each time.</span>
          </div>
          {sim && sim.table === table.id && (
            <p>
              {Object.entries(sim.counts)
                .sort((a, b) => b[1] - a[1])
                .map(([id, n]) => `${name(id, itemList(project, 'items').find((i) => i.id === id))} ×${n}`)
                .join(' · ')}
            </p>
          )}
        </>
      )}
    </div>
  )
}
