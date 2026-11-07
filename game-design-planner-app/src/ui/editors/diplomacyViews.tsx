import { useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  actionEffect,
  actionsOf,
  analyzeRanges,
  DIPLOMACY_DOC,
  factionStandings,
  factionsOf,
  graphDisagreements,
  levelsOf,
  markProblems,
  relationPairs,
  scaleOf,
  simulateActions,
  standingMarks,
  standingOf,
  startValue,
  type RangeRow,
  type RelationPair,
} from '../../core/diplomacy'
import { factionFootprints } from '../../core/diplomacyFootprint'
import type { Entity } from '../../core/model/types'
import { useStore } from '../../core/store/store'
import { useProject } from '../hooks'
import type { ViewProps } from './CollectionEditor'

/** Fallback faction colours (when a faction has none) and the hostile → neutral → allied ramp; the only fixed colours. */
const FACTION_COLORS = ['#4f9cf9', '#f97b4f', '#53c28b', '#d86be0', '#f2c94c', '#5ad1d1', '#e5707e', '#a3a8ff']
const HOSTILE = [229, 112, 126]
const NEUTRAL = [139, 147, 165]
const ALLIED = [83, 194, 139]

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const colorOf = (f: Entity, i: number) => (typeof f.color === 'string' && f.color ? f.color : FACTION_COLORS[i % FACTION_COLORS.length])
const signed = (n: number) => (n > 0 ? `+${Math.round(n)}` : String(Math.round(n)))

/** Colour for a relation value: hostile red at the bottom of the scale, grey at 0, green at the top. */
export function relationColor(v: number, [lo, hi]: [number, number]): string {
  const mid = lo <= 0 && hi >= 0 ? 0 : (lo + hi) / 2
  const t = v >= mid ? (hi === mid ? 0 : (v - mid) / (hi - mid)) : lo === mid ? 0 : -(mid - v) / (mid - lo)
  const to = t >= 0 ? ALLIED : HOSTILE
  const k = Math.min(1, Math.abs(t))
  const c = NEUTRAL.map((n, i) => Math.round(n + (to[i] - n) * k))
  return `rgb(${c.join(',')})`
}

function mutateDoc(fn: (d: Record<string, any>) => void, key: string) {
  useStore.getState().mutate((p) => {
    const d = p.documents[DIPLOMACY_DOC]?.data
    if (d) fn(d)
  }, key)
}

/** Writes one directional matrix cell (`from|to`). Repeated writes within a second are one undo step. */
function setRelation(fromId: string, toId: string, value: number | undefined) {
  mutateDoc((d) => {
    const rel = (d.relations ??= { cells: {} })
    rel.cells ??= {}
    if (value === undefined) delete rel.cells[`${fromId}|${toId}`]
    else rel.cells[`${fromId}|${toId}`] = value
  }, `diplomacy.cell.${fromId}|${toId}`)
}

function setOverview(key: string, value: number) {
  mutateDoc((d) => void ((d.overview ??= {})[key] = value), `diplomacy.overview.${key}`)
}

// ---------- Relations web ----------

const W = 560
const H = 400
const R = 150

/**
 * Factions on a circle, one line per pair coloured by the matrix value (hostile → allied) and thicker the stronger the
 * feeling. Pairs whose two directions differ are drawn as two arrows. Clicking a line opens both directions for editing.
 */
export function RelationsWebView({ items, selected, onSelect }: ViewProps) {
  const project = useProject()
  const scale = scaleOf(project)
  const marks = standingMarks(project)
  const [pairKey, setPairKey] = useState<string | undefined>()
  const shown = new Set(items.map((f) => f.id))
  const all = factionsOf(project)
  const pairs = relationPairs(project).filter((p) => shown.has(p.a.id) && shown.has(p.b.id))
  const bad = new Set(graphDisagreements(project).map((d) => [d.from.id, d.to.id].sort().join('|')))

  if (items.length < 2) return <p className="empty">Add at least two factions to see how they regard each other.</p>

  const pos = new Map(
    items.map((f, i) => {
      const a = -Math.PI / 2 + (i / items.length) * Math.PI * 2
      return [f.id, { x: W / 2 + R * Math.cos(a), y: H / 2 + R * Math.sin(a) }]
    }),
  )
  const keyOf = (p: RelationPair) => `${p.a.id}|${p.b.id}`
  const pair = pairs.find((p) => keyOf(p) === pairKey)
  const focus = pair ? undefined : selected
  const range = scale[1] - scale[0]
  const width = (v: number) => 1.5 + (Math.abs(v) / (range / 2)) * 4
  const counts = { ally: 0, enemy: 0, neutral: 0, unset: 0, asym: 0 }
  for (const p of pairs) {
    counts[p.standing ?? 'unset']++
    if (p.asymmetric) counts.asym++
  }

  const line = (p: RelationPair) => {
    const a = pos.get(p.a.id)!
    const b = pos.get(p.b.id)!
    const k = keyOf(p)
    const dim = (focus && p.a.id !== focus && p.b.id !== focus) || (pair && k !== pairKey)
    const label = `${p.a.name} and ${p.b.name}: ${p.ab ?? '–'} / ${p.ba ?? '–'}`
    const open = () => setPairKey(k === pairKey ? undefined : k)
    const common = {
      role: 'button',
      tabIndex: 0,
      'aria-label': label,
      className: 'dw-line' + (k === pairKey ? ' active' : '') + (dim ? ' dim' : ''),
      onClick: open,
      onKeyDown: (e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          open()
        }
      },
    }
    const mx = (a.x + b.x) / 2
    const my = (a.y + b.y) / 2
    if (p.mean === undefined)
      return (
        <g key={k} {...common}>
          <title>{`${label} (not set)`}</title>
          <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="dw-hit" />
          <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="dw-unset" />
        </g>
      )
    const flag = bad.has([p.a.id, p.b.id].sort().join('|')) ? (
      <text x={mx} y={my - 6} className="dw-flag" textAnchor="middle">
        !
      </text>
    ) : null
    if (!p.asymmetric)
      return (
        <g key={k} {...common}>
          <title>{label}</title>
          <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="dw-hit" />
          <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={relationColor(p.mean, scale)} strokeWidth={width(p.mean)} />
          {flag}
        </g>
      )
    // Two directions: curved arrows bowing to either side of the straight line.
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len = Math.hypot(dx, dy) || 1
    const nx = (-dy / len) * 30
    const ny = (dx / len) * 30
    const shrink = (from: { x: number; y: number }, to: { x: number; y: number }) => ({ x: to.x - ((to.x - from.x) / len) * 26, y: to.y - ((to.y - from.y) / len) * 26 })
    const arrow = (from: { x: number; y: number }, to: { x: number; y: number }, v: number | undefined, side: 1 | -1, id: string) => {
      if (v === undefined) return null
      const end = shrink(from, to)
      return <path key={id} d={`M${from.x},${from.y} Q${mx + nx * side},${my + ny * side} ${end.x},${end.y}`} fill="none" stroke={relationColor(v, scale)} strokeWidth={width(v)} markerEnd="url(#dw-arrow)" />
    }
    return (
      <g key={k} {...common}>
        <title>{`${label} (directions differ)`}</title>
        <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="dw-hit" />
        {arrow(a, b, p.ab, 1, 'ab')}
        {arrow(b, a, p.ba, -1, 'ba')}
        {flag}
      </g>
    )
  }

  return (
    <div className="stack relations-web">
      <div className="tb-legend">
        <span className="dw-ramp" aria-hidden /> <span className="muted">hostile ({scale[0]}) → neutral → allied ({scale[1]})</span>
        <span className="tb-chip">{counts.ally} allied</span>
        <span className="tb-chip">{counts.enemy} hostile</span>
        <span className="tb-chip">{counts.neutral} neutral</span>
        {counts.unset > 0 && <span className="tb-chip warn-text">{counts.unset} not set</span>}
        {counts.asym > 0 && <span className="tb-chip">{counts.asym} one-sided (arrows)</span>}
      </div>
      <svg className="dw-svg" viewBox={`0 0 ${W} ${H}`} role="group" aria-label="Relations between factions">
        <defs>
          <marker id="dw-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="var(--muted)" />
          </marker>
        </defs>
        {pairs.map(line)}
        {items.map((f, i) => {
          const p = pos.get(f.id)!
          const on = f.id === selected
          return (
            <g
              key={f.id}
              className={'dw-node' + (on ? ' active' : '')}
              role="button"
              tabIndex={0}
              aria-label={`Faction ${f.name}`}
              onClick={() => {
                setPairKey(undefined)
                onSelect(on ? undefined : f.id)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setPairKey(undefined)
                  onSelect(on ? undefined : f.id)
                }
              }}
            >
              <circle cx={p.x} cy={p.y} r={22} fill={colorOf(f, all.indexOf(f) >= 0 ? all.indexOf(f) : i)} />
              <text x={p.x} y={p.y + (p.y > H / 2 ? 38 : -30)} textAnchor="middle">
                {String(f.name ?? '').slice(0, 22) || '(unnamed)'}
              </text>
            </g>
          )
        })}
      </svg>
      {pair ? (
        <PairEditor pair={pair} scale={scale} marks={marks} onClose={() => setPairKey(undefined)} />
      ) : focus ? (
        <FactionRelations factionId={focus} onOpen={setPairKey} />
      ) : (
        <p className="muted">Click a line to set how two factions regard each other, or a faction to list its relations. “!” marks a named relationship in the graph that the numbers contradict.</p>
      )}
    </div>
  )
}

function PairEditor({ pair, scale, marks, onClose }: { pair: RelationPair; scale: [number, number]; marks: { allyAt: number; enemyAt: number }; onClose: () => void }) {
  const dirs: [Entity, Entity, number | undefined][] = [
    [pair.a, pair.b, pair.ab],
    [pair.b, pair.a, pair.ba],
  ]
  return (
    <div className="dw-pair">
      <div className="tb-head">
        <strong>
          {pair.a.name} ↔ {pair.b.name}
        </strong>
        {pair.kinds.length > 0 && <span className="muted">graph: {pair.kinds.join(', ')}</span>}
        {pair.asymmetric && <span className="warn-text">directions differ by more than 10</span>}
        <span className="spacer" />
        <button className="icon" onClick={onClose} aria-label="Close pair">
          ✕
        </button>
      </div>
      {dirs.map(([from, to, v], i) => {
        const other = dirs[1 - i][2]
        return (
          <div key={from.id} className="dw-dir">
            <span>
              {from.name} → {to.name}
            </span>
            <input
              type="range"
              min={scale[0]}
              max={scale[1]}
              step={1}
              value={v ?? 0}
              aria-label={`${from.name} regards ${to.name}`}
              className={v === undefined ? 'unset' : ''}
              style={{ accentColor: v === undefined ? undefined : relationColor(v, scale) }}
              onChange={(e) => setRelation(from.id, to.id, Number(e.target.value))}
            />
            <span className="num">{v ?? '–'}</span>
            <span className="muted">{v === undefined ? 'not set' : standingOf(v, marks) === 'ally' ? 'allied' : standingOf(v, marks) === 'enemy' ? 'hostile' : 'neutral'}</span>
            <span>
              {other !== undefined && other !== v && (
                <button className="small" onClick={() => setRelation(from.id, to.id, other)} title="Copy the other direction">
                  Mirror
                </button>
              )}
              {v !== undefined && (
                <button className="small" onClick={() => setRelation(from.id, to.id, undefined)}>
                  Clear
                </button>
              )}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function FactionRelations({ factionId, onOpen }: { factionId: string; onOpen: (key: string) => void }) {
  const project = useProject()
  const s = factionStandings(project).find((x) => x.faction.id === factionId)
  if (!s) return null
  const order = factionsOf(project).map((f) => f.id)
  const keyOf = (o: Entity) => (order.indexOf(o.id) > order.indexOf(factionId) ? `${factionId}|${o.id}` : `${o.id}|${factionId}`)
  const list = (title: string, xs: Entity[], cls = '') =>
    xs.length > 0 && (
      <span className={cls}>
        <span className="muted">{title}: </span>
        {xs.map((o, i) => (
          <span key={o.id}>
            {i > 0 && ', '}
            <button className="link" onClick={() => onOpen(keyOf(o))}>
              {o.name}
            </button>
          </span>
        ))}
      </span>
    )
  return (
    <div className="dw-pair">
      <div className="tb-head">
        <strong>{s.faction.name}</strong>
        {s.regard !== undefined && <span className="muted">regarded on average at {Math.round(s.regard)}</span>}
      </div>
      <div className="tb-values">
        {list('Allies', s.allies)}
        {list('Hostile', s.enemies)}
        {list('Neutral', s.neutral)}
        {list('Not set', s.unset, 'warn-text')}
      </div>
    </div>
  )
}

// ---------- Faction footprint ----------

/** Where each faction appears: relations, characters, unlocks, actions, endings, and references from other modules. */
export function FactionFootprintView({ items, selected, onSelect }: ViewProps) {
  const project = useProject()
  const shown = new Set(items.map((f) => f.id))
  const rows = factionFootprints(project).filter((r) => shown.has(r.faction.id))
  const standing = new Map(factionStandings(project).map((s) => [s.faction.id, s]))
  if (!rows.length) return <p className="empty">Add factions to see where they appear.</p>
  const docs = [...new Map(rows.flatMap((r) => r.elsewhere.map((g) => [g.docId, g.docTitle] as const))).entries()]
  const max = Math.max(1, ...rows.flatMap((r) => [r.characters, r.unlocks, r.actions, r.endings, ...r.elsewhere.map((g) => g.usages.length)]))
  const heat = (n: number) => (n > 0 ? { background: `color-mix(in srgb, var(--accent) ${Math.round(12 + (n / max) * 50)}%, transparent)` } : undefined)
  const cell = (n: number, title?: string, key?: string) => (
    <td key={key} className="num" style={heat(n)} title={title}>
      {n || '–'}
    </td>
  )
  return (
    <div className="stack faction-footprint">
      <p className="muted">How much of the game each faction touches. A faction nobody else references exists only on paper: give it quests, characters, merchants or biomes.</p>
      <div className="table-wrap">
        <table className="grid">
          <thead>
            <tr>
              <th>Faction</th>
              <th>Allies</th>
              <th>Hostile</th>
              <th>Characters</th>
              <th>Unlocks</th>
              <th>Actions</th>
              <th>Endings</th>
              {docs.map(([id, title]) => (
                <th key={id}>
                  <Link to={`/doc/${id}`}>{title}</Link>
                </th>
              ))}
              <th>Other modules</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const s = standing.get(r.faction.id)
              return (
                <tr key={r.faction.id} className={'clickable' + (r.faction.id === selected ? ' selected' : '')} onClick={() => onSelect(r.faction.id)}>
                  <th>
                    <span className="tb-dot" style={{ background: colorOf(r.faction, i) }} />
                    {r.faction.name}
                  </th>
                  <td className="num" title={s?.allies.map((x) => x.name).join(', ')}>
                    {s?.allies.length || '–'}
                  </td>
                  <td className="num" title={s?.enemies.map((x) => x.name).join(', ')}>
                    {s?.enemies.length || '–'}
                  </td>
                  {cell(r.characters)}
                  {cell(r.unlocks)}
                  {cell(r.actions)}
                  {cell(r.endings)}
                  {docs.map(([id]) => {
                    const g = r.elsewhere.find((x) => x.docId === id)
                    return cell(g?.usages.length ?? 0, g?.usages.map((u) => `${u.sectionTitle} › ${u.entityLabel} (${u.field})`).join('\n'), id)
                  })}
                  <td className={'num' + (r.outside === 0 ? ' warn-text' : '')}>{r.outside === 0 ? 'none yet' : r.outside}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <FootprintBars rows={rows.map((r, i) => ({ name: String(r.faction.name ?? ''), color: colorOf(r.faction, i), parts: [r.characters, r.unlocks, r.actions, r.endings, r.outside] }))} />
    </div>
  )
}

const PART_LABELS = ['Characters', 'Unlocks', 'Actions', 'Endings', 'Other modules']
const PART_ALPHA = [90, 70, 55, 40, 100]

function FootprintBars({ rows }: { rows: { name: string; color: string; parts: number[] }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.parts.reduce((a, b) => a + b, 0)))
  return (
    <div className="pr-rows">
      <h4>Footprint size</h4>
      {rows.map((r) => {
        const total = r.parts.reduce((a, b) => a + b, 0)
        return (
          <div key={r.name} className="dw-bar-row">
            <span>{r.name}</span>
            <div className="dw-bar" role="img" aria-label={`${r.name}: ${total} link(s)`}>
              {r.parts.map((n, i) =>
                n > 0 ? <span key={i} style={{ width: `${(n / max) * 100}%`, background: `color-mix(in srgb, ${r.color} ${PART_ALPHA[i]}%, transparent)` }} title={`${PART_LABELS[i]}: ${n}`} /> : null,
              )}
            </div>
            <span className="num">{total}</span>
          </div>
        )
      })}
    </div>
  )
}

// ---------- Reputation scale ----------

/**
 * The reputation scale as one bar: relationship levels as segments (gaps and overlaps marked), draggable boundaries
 * between neighbouring levels, and handles for the starting value and the allied / hostile cut-offs.
 */
export function ReputationScaleView({ selected, onSelect }: ViewProps) {
  const project = useProject()
  const scale = scaleOf(project)
  const levels = levelsOf(project)
  const a = analyzeRanges(levels, scale)
  const marks = standingMarks(project)
  const start = startValue(project)
  const problems = markProblems(project)
  const [lo, hi] = scale
  const at = (v: number) => `${((Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo)) * 100}%`
  const span = (from: number, to: number) => `${((Math.min(hi, to + 1) - Math.max(lo, from)) / (hi - lo)) * 100}%`
  const byId = new Map(levels.map((l) => [l.id, l]))

  const [active, setActive] = useState<number | undefined>()
  const boundaryHandlers = (i: number) => {
    const row = a.rows[i]
    const prev = a.rows[i - 1]
    const next = a.rows[i + 1]
    const min = prev.from + 1
    const max = next ? next.from - 1 : hi
    const write = (v: number) =>
      mutateDoc((d) => {
        const ls: Entity[] = d.thresholds ?? []
        const cur = ls.find((l) => l.id === row.id)
        const before = ls.find((l) => l.id === prev.id)
        if (cur) cur.min = v
        if (before && isNum(before.max)) before.max = v - 1
      }, `diplomacy.boundary.${row.id}`)
    return { ...handleProps(write, row.from, min, max, scale), onFocus: () => setActive(i), onBlur: () => setActive(undefined) }
  }

  if (!levels.length) return <p className="empty">Add relationship levels (for example Hostile, Neutral, Friendly, Allied) to lay them out on the scale.</p>

  const markHandle = (key: 'startValue' | 'allyAt' | 'enemyAt', label: string, value: number, cls: string) => (
    <span
      key={key}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={lo}
      aria-valuemax={hi}
      aria-valuenow={value}
      className={'rs-mark ' + cls}
      style={{ left: at(value) }}
      title={`${label}: ${value}`}
      {...handleProps((v) => setOverview(key, v), value, lo, hi, scale)}
    >
      <span>{label.split(' ')[0]}</span>
    </span>
  )

  return (
    <div className="stack reputation-scale">
      <p className="muted">
        The player’s reputation with a faction moves along this scale. Drag the boundaries between levels, or the markers below, or focus one and use the arrow keys (Shift for steps of 10).
      </p>
      <div className="rs-ticks">
        <span>{lo}</span>
        {lo < 0 && hi > 0 && (
          <span className="rs-zero" style={{ left: at(0) }}>
            0
          </span>
        )}
        <span>{hi}</span>
      </div>
      <div className="rs-bar">
        {a.rows.map((r, i) => {
          const prev = a.rows[i - 1]
          return (
            <span key={r.id}>
              {r.gapBefore && prev && <span className="rs-gap" style={{ left: at(prev.to + 1), width: span(prev.to + 1, r.from - 1) }} title={`Gap: ${prev.to + 1} to ${r.from - 1} belong to no level`} />}
              <span
                className={'rs-seg' + (r.overlaps ? ' overlap' : '') + (r.id === selected ? ' selected' : '')}
                style={{ left: at(r.from), width: span(r.from, r.to), background: relationColor((r.from + r.to) / 2, scale) }}
                onClick={() => onSelect(r.id)}
                title={`${r.name}: ${r.from} to ${r.to}${r.open ? ' (runs to the next level)' : ''}${r.overlaps ? ', overlaps the level before' : ''}`}
              >
                {r.name}
              </span>
            </span>
          )
        })}
        {a.gapAtBottom && <span className="rs-gap" style={{ left: 0, width: span(lo, a.rows[0].from - 1) }} title="Values below the first level" />}
        {a.gapAtTop && <span className="rs-gap" style={{ left: at(a.rows[a.rows.length - 1].to + 1), width: span(a.rows[a.rows.length - 1].to + 1, hi) }} title="Values above the last level" />}
        {a.rows.slice(1).map((r, j) => {
          const i = j + 1
          return (
            <span
              key={r.id}
              role="slider"
              tabIndex={0}
              aria-label={`Boundary ${a.rows[i - 1].name} / ${r.name}`}
              aria-valuemin={lo}
              aria-valuemax={hi}
              aria-valuenow={r.from}
              className={'rs-boundary' + (active === i ? ' active' : '')}
              style={{ left: at(r.from) }}
              title={`${r.name} starts at ${r.from}`}
              {...boundaryHandlers(i)}
            />
          )
        })}
      </div>
      <div className="rs-marks">
        {markHandle('enemyAt', 'Hostile up to', marks.enemyAt, 'enemy')}
        {markHandle('startValue', 'Start value', start, 'start')}
        {markHandle('allyAt', 'Allied from', marks.allyAt, 'ally')}
      </div>
      {problems.length > 0 && <p className="warn-text">Check: {problems.join('; ')}.</p>}
      <div className="table-wrap">
        <table className="grid">
          <thead>
            <tr>
              <th>Level</th>
              <th>Range</th>
              <th>Consequences</th>
            </tr>
          </thead>
          <tbody>
            {a.rows.map((r) => (
              <tr key={r.id} className={'clickable' + (r.id === selected ? ' selected' : '')} onClick={() => onSelect(r.id)}>
                <th>
                  <span className="tb-dot square" style={{ background: relationColor((r.from + r.to) / 2, scale) }} />
                  {r.name}
                  {start >= r.from && start <= r.to && <span className="muted"> · start</span>}
                </th>
                <td className={r.overlaps || r.gapBefore ? 'warn-text' : ''}>
                  {r.from} to {r.to}
                  {r.overlaps ? ' (overlaps)' : r.gapBefore ? ' (gap before)' : ''}
                </td>
                <td>{truncate(String(byId.get(r.id)?.consequences ?? ''), 140) || <span className="muted">not described yet</span>}</td>
              </tr>
            ))}
            {a.unset.map((l) => (
              <tr key={l.id} className="clickable" onClick={() => onSelect(l.id)}>
                <th>{l.name}</th>
                <td className="warn-text">no minimum yet</td>
                <td />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const truncate = (s: string, n: number) => (s.length > n ? s.slice(0, n) + '…' : s)

const dragTrack: { el: HTMLElement | null } = { el: null }

function handleProps(write: (v: number) => void, value: number, min: number, max: number, scale: [number, number]) {
  return {
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      // Boundaries sit on the bar; the marks sit on their own row of the same width.
      dragTrack.el = e.currentTarget.parentElement
      try {
        e.currentTarget.setPointerCapture?.(e.pointerId)
      } catch {
        /* dragging still works while the pointer stays over the handle */
      }
    },
    onPointerMove: (e: PointerEvent<HTMLElement>) => {
      const track = dragTrack.el
      if (!track) return
      const r = track.getBoundingClientRect()
      if (r.width <= 0) return
      const v = Math.round(scale[0] + ((e.clientX - r.left) / r.width) * (scale[1] - scale[0]))
      write(Math.max(min, Math.min(max, v)))
    },
    onPointerUp: () => (dragTrack.el = null),
    onPointerCancel: () => (dragTrack.el = null),
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      const step = e.shiftKey || e.key === 'PageUp' || e.key === 'PageDown' ? 10 : 1
      let next: number | undefined
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'PageUp') next = value + step
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown' || e.key === 'PageDown') next = value - step
      else if (e.key === 'Home') next = min
      else if (e.key === 'End') next = max
      if (next === undefined) return
      e.preventDefault()
      write(Math.max(min, Math.min(max, next)))
    },
  }
}

// ---------- Action simulator ----------

const CW = 560
const CH = 220
const PAD = { l: 34, r: 90, t: 10, b: 22 }

/** Builds a sequence of player actions and plays it: reputation per faction over the steps, levels reached, consequences. Nothing is saved. */
export function ActionSimulatorView({ items, selected, onSelect }: ViewProps) {
  const project = useProject()
  const [seq, setSeq] = useState<string[]>([])
  const [startOverride, setStart] = useState<number | undefined>()
  const factions = factionsOf(project)
  const actions = actionsOf(project)
  const scale = scaleOf(project)
  const marks = standingMarks(project)
  const start = startOverride ?? startValue(project)
  const rows = simulateActions(project, seq, start)
  const levels = analyzeRanges(levelsOf(project), scale).rows
  const byLevel = new Map(levelsOf(project).map((l) => [l.id, l]))
  const name = (id: string) => String(actions.find((a) => a.id === id)?.name ?? '?')

  if (!factions.length) return <p className="empty">Add factions first: the simulator plays actions against their reputation.</p>
  if (!items.length) return <p className="empty">Add actions with a faction and a reputation change to play them here.</p>

  const effects = (a: Entity): ReactNode => {
    const parts = factions.map((f) => [f, actionEffect(a, f.id)] as const).filter(([, n]) => n !== 0)
    return parts.length ? parts.map(([f, n]) => `${f.name} ${signed(n)}`).join(', ') : 'no effect set'
  }
  const [lo, hi] = scale
  const steps = seq.length
  const x = (i: number) => PAD.l + (steps ? (i / steps) * (CW - PAD.l - PAD.r) : (CW - PAD.l - PAD.r) / 2)
  const y = (v: number) => PAD.t + (1 - (v - lo) / (hi - lo)) * (CH - PAD.t - PAD.b)

  return (
    <div className="stack action-sim">
      <p className="muted">Pick actions in the order a player might take them. Every faction starts at the starting value; each step adds the direct change or the spillover. Not saved; decay over time is not included.</p>
      <div className="as-palette">
        {items.map((a) => (
          <button key={a.id} className={'small' + (a.id === selected ? ' active' : '')} aria-label={`Add ${a.name}`} title={String(effects(a))} onClick={() => setSeq((s) => [...s, a.id])}>
            + {a.name}
          </button>
        ))}
      </div>
      <div className="as-seq">
        <label>
          Start at{' '}
          <input type="number" className="as-start" value={start} min={lo} max={hi} aria-label="Start value for the simulation" onChange={(e) => setStart(e.target.value === '' ? undefined : Math.max(lo, Math.min(hi, Number(e.target.value))))} />
        </label>
        {seq.length === 0 ? (
          <span className="muted">No actions yet.</span>
        ) : (
          seq.map((id, i) => (
            <span key={i} className="as-step">
              <span className="muted">{i + 1}.</span>{' '}
              <button className="link" onClick={() => onSelect(id)}>
                {name(id)}
              </button>
              <button className="icon" aria-label={`Remove step ${i + 1} ${name(id)}`} onClick={() => setSeq((s) => s.filter((_, j) => j !== i))}>
                ✕
              </button>
            </span>
          ))
        )}
        {seq.length > 0 && (
          <button className="small" onClick={() => setSeq([])}>
            Clear
          </button>
        )}
      </div>
      <svg className="as-chart" viewBox={`0 0 ${CW} ${CH}`} role="img" aria-label={`Reputation over ${steps} step(s)`}>
        {levels.map((l, i) => (
          <g key={l.id}>
            <rect x={PAD.l} width={CW - PAD.l - PAD.r} y={y(Math.min(hi, l.to + 1))} height={Math.max(0, y(Math.max(lo, l.from)) - y(Math.min(hi, l.to + 1)))} fill={relationColor((l.from + l.to) / 2, scale)} opacity={i % 2 ? 0.1 : 0.16} />
            <text x={CW - PAD.r + 4} y={(y(Math.max(lo, l.from)) + y(Math.min(hi, l.to + 1))) / 2 + 4} className="as-level">
              {l.name}
            </text>
          </g>
        ))}
        {[marks.allyAt, marks.enemyAt].map((m) => (m > lo && m < hi ? <line key={m} x1={PAD.l} x2={CW - PAD.r} y1={y(m)} y2={y(m)} className="as-mark" /> : null))}
        <text x={PAD.l - 4} y={y(hi) + 8} textAnchor="end" className="as-axis">
          {hi}
        </text>
        <text x={PAD.l - 4} y={y(lo)} textAnchor="end" className="as-axis">
          {lo}
        </text>
        {seq.map((_, i) => (
          <text key={i} x={x(i + 1)} y={CH - 6} textAnchor="middle" className="as-axis">
            {i + 1}
          </text>
        ))}
        {rows.map((r, i) => {
          const color = colorOf(r.faction, i)
          const pts = r.values.map((v, j) => `${x(j)},${y(v)}`).join(' ')
          return (
            <g key={r.faction.id}>
              <polyline points={pts} fill="none" stroke={color} strokeWidth={2} />
              {r.values.map((v, j) => (
                <circle key={j} cx={x(j)} cy={y(v)} r={3} fill={color} />
              ))}
            </g>
          )
        })}
      </svg>
      <div className="table-wrap">
        <table className="grid">
          <thead>
            <tr>
              <th>Faction</th>
              <th>Start</th>
              <th>End</th>
              <th>Change</th>
              <th>Level changes</th>
              <th>Consequences now</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const delta = r.end - r.start
              const cons = r.endLevel ? String(byLevel.get(r.endLevel.id)?.consequences ?? '') : ''
              return (
                <tr key={r.faction.id} aria-label={`${r.faction.name}: ${r.end}${r.endLevel ? ` · ${r.endLevel.name}` : ''}`}>
                  <th>
                    <span className="tb-dot" style={{ background: colorOf(r.faction, i) }} />
                    {r.faction.name}
                  </th>
                  <td>
                    {r.start} {r.startLevel && <span className="muted">· {r.startLevel.name}</span>}
                  </td>
                  <td>
                    <strong>{r.end}</strong> {r.endLevel ? <span>· {r.endLevel.name}</span> : <span className="warn-text">· no level</span>}
                  </td>
                  <td className={delta < 0 ? 'warn-text' : ''}>{delta === 0 ? '–' : signed(delta)}</td>
                  <td>{r.crossings.length ? r.crossings.map((c) => `step ${c.step}: ${levelName(c.from)} → ${levelName(c.to)}`).join('; ') : <span className="muted">none</span>}</td>
                  <td>{truncate(cons, 120) || <span className="muted">–</span>}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const levelName = (r?: RangeRow) => r?.name ?? 'no level'
