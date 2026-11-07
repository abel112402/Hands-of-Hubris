import { useState, type KeyboardEvent } from 'react'
import {
  ARCH_DOC,
  archList,
  bootSequence,
  coupling,
  dependencies,
  dependencyCycles,
  extensionCoverage,
  layerOrder,
  messageFlow,
  nameOf,
  tickBudget,
  tickPattern,
} from '../../core/architecture'
import type { Entity, Project } from '../../core/model/types'
import { useStore } from '../../core/store/store'
import { useProject } from '../hooks'
import type { ViewProps } from './CollectionEditor'
import { countOf } from '../../core/text'

/** Series palette (the only hard-coded colours, as in the other planners). */
export const ARCH_COLORS = ['#4f9cf9', '#53c28b', '#f2c94c', '#f97b4f', '#d86be0', '#5ad1d1', '#e5707e', '#a3a8ff']
const fmt = (n: number) => (Math.round(n * 100) / 100).toString()
const ids = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
const short = (s: string, n = 18) => (s.length > n ? s.slice(0, n - 1) + '…' : s)
const keyActivate = (fn: () => void) => (e: KeyboardEvent) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    fn()
  }
}
const layerColor = (p: Project) => new Map(layerOrder(p).map((l, i) => [l.id, ARCH_COLORS[i % ARCH_COLORS.length]]))

/** Layers as a stack, highest on top, with the modules that live in each. */
export function LayerStackView({ items, selected, onSelect }: ViewProps) {
  const project = useProject()
  const layers = layerOrder(project).filter((l) => items.some((i) => i.id === l.id))
  const modules = archList(project, 'modules')
  const color = layerColor(project)
  const byId = new Map(layerOrder(project).map((l) => [l.id, l]))
  if (!layers.length) return <p className="empty">Give layers an order to stack them.</p>
  return (
    <div className="stack arch-stack">
      <p className="muted">Highest layer on top. Dependencies may only point down (or to a layer listed under “May also use”). Click a layer to edit it.</p>
      {[...layers].reverse().map((l, i, all) => {
        const mods = modules.filter((m) => m.layer === l.id)
        return (
          <div key={l.id} className="arch-band-wrap">
            <div
              className={'arch-band' + (l.id === selected ? ' selected' : '')}
              style={{ borderLeftColor: color.get(l.id) }}
              role="button"
              tabIndex={0}
              aria-label={`Layer ${nameOf(l)}`}
              onClick={() => onSelect(l.id)}
              onKeyDown={keyActivate(() => onSelect(l.id))}
            >
              <div className="arch-band-head">
                <strong>{nameOf(l)}</strong>
                <span className="muted">{countOf(mods.length, 'module')}</span>
                {ids(l.mayUse).length > 0 && <span className="pill">also uses {ids(l.mayUse).map((x) => nameOf(byId.get(x))).join(', ')}</span>}
              </div>
              {l.description && <small className="muted">{String(l.description)}</small>}
              <div className="chips">
                {mods.map((m) => (
                  <span key={m.id} className="chip">{nameOf(m)}</span>
                ))}
              </div>
            </div>
            {i < all.length - 1 && <div className="arch-band-arrow" aria-hidden="true">↓ may use</div>}
          </div>
        )
      })}
    </div>
  )
}

/** Modules placed in their layer bands with every dependency drawn; upward dependencies and cycles in colour. */
export function LayerDiagramView({ items, selected, onSelect }: ViewProps) {
  const project = useProject()
  const [focus, setFocus] = useState<string | null>(null)
  const layers = [...layerOrder(project)].reverse()
  const color = layerColor(project)
  const deps = dependencies(project)
  const cycles = dependencyCycles(project)
  const inCycle = new Map<string, number>()
  cycles.forEach((c, i) => c.forEach((m) => inCycle.set(m.id, i)))
  const shown = new Set(items.map((m) => m.id))
  const bands: { id: string; label: string; mods: Entity[] }[] = [
    ...layers.map((l) => ({ id: l.id, label: nameOf(l), mods: items.filter((m) => m.layer === l.id) })),
    { id: '', label: 'No layer', mods: items.filter((m) => !layers.some((l) => l.id === m.layer)) },
  ].filter((b) => b.id || b.mods.length)
  if (!items.length) return null
  const BW = 130
  const BH = 30
  const GAP = 24
  const LABEL = 110
  const BAND = 70
  const cols = Math.max(1, ...bands.map((b) => b.mods.length))
  const W = LABEL + cols * (BW + GAP) + GAP
  const H = bands.length * BAND + 10
  const pos = new Map<string, { x: number; y: number }>()
  bands.forEach((b, r) => b.mods.forEach((m, c) => pos.set(m.id, { x: LABEL + GAP + c * (BW + GAP), y: 10 + r * BAND + (BAND - BH) / 2 })))
  const active = focus ?? selected ?? null
  const related = (d: (typeof deps)[number]) => !active || d.from.id === active || d.toId === active
  const issues = deps.filter((d) => d.issue === 'upward')
  return (
    <div className="stack arch-diagram">
      <p className="muted">
        Arrows run from a module to what it depends on. <span className="arch-key up">red</span> = points up a layer, <span className="arch-key cyc">amber</span> = part of a cycle. Hover or select a module to see only its links.
      </p>
      <div className="npc-scroll">
        <svg viewBox={`0 0 ${W} ${H}`} width={W} className="arch-svg" role="img" aria-label="Layer diagram">
          <defs>
            <marker id="arch-arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto" markerUnits="strokeWidth">
              <path d="M0,0 L0,6 L7,3 z" className="arch-arrowhead" />
            </marker>
          </defs>
          {bands.map((b, r) => (
            <g key={b.id || 'none'}>
              <rect x={0} y={10 + r * BAND} width={W} height={BAND - 4} rx={8} className="arch-band-bg" />
              <rect x={0} y={10 + r * BAND} width={6} height={BAND - 4} fill={color.get(b.id) ?? 'var(--line)'} />
              <text x={14} y={10 + r * BAND + BAND / 2} className="arch-band-label">{b.label}</text>
            </g>
          ))}
          {deps.map((d, i) => {
            const a = pos.get(d.from.id)
            const b = pos.get(d.toId)
            if (!a || !b || !shown.has(d.toId)) return null
            const cyc = inCycle.has(d.from.id) && inCycle.get(d.from.id) === inCycle.get(d.toId)
            const x1 = a.x + BW / 2
            const y1 = b.y > a.y ? a.y + BH : b.y < a.y ? a.y : a.y + BH / 2
            const x2 = b.x + BW / 2
            const y2 = b.y > a.y ? b.y : b.y < a.y ? b.y + BH : b.y + BH / 2
            const bend = a.y === b.y ? 34 : 0
            const path = a.y === b.y ? `M${x1},${a.y + BH} C${x1},${a.y + BH + bend} ${x2},${b.y + BH + bend} ${x2},${b.y + BH}` : `M${x1},${y1} C${x1},${(y1 + y2) / 2} ${x2},${(y1 + y2) / 2} ${x2},${y2}`
            return <path key={i} d={path} markerEnd="url(#arch-arrow)" className={'arch-edge' + (d.issue === 'upward' ? ' up' : '') + (cyc ? ' cyc' : '') + (related(d) ? '' : ' dim')} />
          })}
          {items.map((m) => {
            const p = pos.get(m.id)
            if (!p) return null
            return (
              <g
                key={m.id}
                transform={`translate(${p.x},${p.y})`}
                className={'arch-node' + (m.id === selected ? ' selected' : '') + (inCycle.has(m.id) ? ' cyc' : '') + (active && active !== m.id && !deps.some((d) => (d.from.id === active && d.toId === m.id) || (d.toId === active && d.from.id === m.id)) ? ' dim' : '')}
                role="button"
                tabIndex={0}
                aria-label={nameOf(m)}
                onClick={() => onSelect(m.id)}
                onKeyDown={keyActivate(() => onSelect(m.id))}
                onMouseEnter={() => setFocus(m.id)}
                onMouseLeave={() => setFocus(null)}
              >
                <rect width={BW} height={BH} rx={6} style={{ stroke: color.get(m.layer) }} />
                <text x={BW / 2} y={19} textAnchor="middle">{short(nameOf(m))}</text>
              </g>
            )
          })}
        </svg>
      </div>
      {issues.length > 0 && <p className="warn">Upward: {issues.map((d) => `${nameOf(d.from)} → ${nameOf(d.to)}`).join(', ')}</p>}
      {cycles.length > 0 && <p className="warn">Cycles: {cycles.map((c) => c.map(nameOf).join(' → ') + ' → ' + nameOf(c[0])).join('; ')}</p>}
      {deps.some((d) => d.issue === 'missing') && <p className="muted">Some modules depend on a deleted module; open them to clean up “Depends on”.</p>}
    </div>
  )
}

/** Dependency structure matrix: row depends on column. Click a cell to add or remove the dependency. */
export function DependencyMatrixView({ items, selected, onSelect, patch }: ViewProps) {
  const project = useProject()
  const order = new Map(layerOrder(project).map((l, i) => [l.id, i]))
  const color = layerColor(project)
  const mods = [...items].sort((a, b) => (order.get(b.layer) ?? -1) - (order.get(a.layer) ?? -1))
  const deps = dependencies(project)
  const cycles = dependencyCycles(project)
  const cycleOf = new Map<string, number>()
  cycles.forEach((c, i) => c.forEach((m) => cycleOf.set(m.id, i)))
  const issue = new Map(deps.map((d) => [`${d.from.id}|${d.toId}`, d.issue]))
  const toggle = (row: Entity, col: Entity) => {
    const cur = ids(row.dependsOn)
    patch(row.id, 'dependsOn', cur.includes(col.id) ? cur.filter((x) => x !== col.id) : [...cur, col.id])
  }
  if (!mods.length) return null
  return (
    <div className="stack arch-matrix">
      <p className="muted">Each row depends on the ticked columns. Modules are sorted from the highest layer down, so healthy ticks sit right of the diagonal block of their layer. Click a cell to toggle a dependency; click a name to edit the module.</p>
      <div className="table-wrap">
        <table className="grid arch-dsm">
          <thead>
            <tr>
              <th>depends on →</th>
              {mods.map((m) => (
                <th key={m.id} className="arch-dsm-col" title={nameOf(m)}>
                  <span style={{ borderBottomColor: color.get(m.layer) }}>{short(nameOf(m), 12)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {mods.map((r) => (
              <tr key={r.id} className={r.id === selected ? 'selected' : ''}>
                <th className="arch-dsm-row" style={{ borderLeftColor: color.get(r.layer) }}>
                  <button className="linklike" onClick={() => onSelect(r.id)}>{nameOf(r)}</button>
                </th>
                {mods.map((c) => {
                  if (c.id === r.id) return <td key={c.id} className="arch-dsm-diag" />
                  const on = ids(r.dependsOn).includes(c.id)
                  const kind = on ? (issue.get(`${r.id}|${c.id}`) === 'upward' ? ' up' : cycleOf.has(r.id) && cycleOf.get(r.id) === cycleOf.get(c.id) ? ' cyc' : ' on') : ''
                  return (
                    <td key={c.id} className={'arch-dsm-cell' + kind}>
                      <button aria-label={`${nameOf(r)} depends on ${nameOf(c)}`} aria-pressed={on} onClick={() => toggle(r, c)}>
                        {on ? '●' : ''}
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/** Fan-in / fan-out butterfly chart with instability, next to the layer each module sits in. */
export function CouplingView({ items, selected, onSelect }: ViewProps) {
  const project = useProject()
  const layers = layerOrder(project)
  const rank = new Map(layers.map((l, i) => [l.id, i]))
  const color = layerColor(project)
  const shown = new Set(items.map((m) => m.id))
  const rows = coupling(project)
    .filter((r) => shown.has(r.module.id))
    .sort((a, b) => (rank.get(a.module.layer) ?? 99) - (rank.get(b.module.layer) ?? 99))
  const max = Math.max(1, ...rows.map((r) => Math.max(r.fanIn, r.fanOut)))
  if (!rows.length) return null
  return (
    <div className="stack arch-coupling">
      <p className="muted">
        Fan-in: how many modules depend on this one. Fan-out: how many it depends on. Instability = fan-out ÷ (fan-in + fan-out): low layers should be stable (near 0) because many depend on them; UI and tools can be unstable (near 1).
      </p>
      <div className="arch-coupling-head" aria-hidden="true">
        <span>Module</span>
        <span className="right">← fan-in</span>
        <span>fan-out →</span>
        <span>Instability</span>
      </div>
      {rows.map((r) => {
        const lowLayer = layers.length > 1 && (rank.get(r.module.layer) ?? 99) < layers.length / 2
        const risky = lowLayer && r.instability !== null && r.instability > 0.6 && r.fanIn > 0
        return (
          <button key={r.module.id} className={'arch-coupling-row' + (r.module.id === selected ? ' selected' : '')} onClick={() => onSelect(r.module.id)}>
            <span>
              <i className="npc-swatch" style={{ background: color.get(r.module.layer) ?? 'var(--line)' }} /> {nameOf(r.module)}
            </span>
            <span className="arch-bar-track left">
              <span className="arch-bar in" style={{ width: `${(r.fanIn / max) * 100}%` }} />
              <small>{r.fanIn}</small>
            </span>
            <span className="arch-bar-track">
              <span className="arch-bar out" style={{ width: `${(r.fanOut / max) * 100}%` }} />
              <small>{r.fanOut}</small>
            </span>
            <span className="arch-gauge" title={r.instability === null ? 'isolated' : fmt(r.instability)}>
              {r.instability === null ? (
                <span className="muted">isolated</span>
              ) : (
                <>
                  <span className="arch-gauge-track">
                    <span className="arch-gauge-dot" style={{ left: `${r.instability * 100}%` }} />
                  </span>
                  <small className={risky ? 'warn' : ''}>{fmt(r.instability)}{risky ? ' ⚠' : ''}</small>
                </>
              )}
            </span>
          </button>
        )
      })}
      <p className="muted">⚠ marks a low-layer module that others rely on but which itself depends on a lot: a change there ripples upward.</p>
    </div>
  )
}

const KIND_COLOR: Record<string, string> = { 'Event bus': '#4f9cf9', 'ScriptableObject channel': '#d86be0', 'Direct call': '#f97b4f', 'DI service': '#53c28b', 'Message queue': '#f2c94c' }

/** Publisher → channel → subscriber lanes. */
export function MessageFlowView({ items, selected, onSelect }: ViewProps) {
  const project = useProject()
  const shown = new Set(items.map((c) => c.id))
  const rows = messageFlow(project).filter((r) => shown.has(r.channel.id))
  if (!rows.length) return null
  const pubs = [...new Map(rows.flatMap((r) => r.publishers).map((m) => [m.id, m])).values()]
  const subs = [...new Map(rows.flatMap((r) => r.subscribers).map((m) => [m.id, m])).values()]
  const RH = 38
  const H = 30 + Math.max(pubs.length, subs.length, rows.length) * RH
  const W = 700
  const yPub = new Map(pubs.map((m, i) => [m.id, 30 + i * RH]))
  const ySub = new Map(subs.map((m, i) => [m.id, 30 + i * RH]))
  const yCh = new Map(rows.map((r, i) => [r.channel.id, 30 + i * RH]))
  const NW = 150
  const CW = 200
  const xC = (W - CW) / 2
  return (
    <div className="stack arch-messages">
      <p className="muted">Modules on the left publish, modules on the right listen. Dashed channels have nobody on one side. Click a channel to edit it.</p>
      <div className="npc-scroll">
        <svg viewBox={`0 0 ${W} ${H}`} width={W} className="arch-svg" role="img" aria-label="Message flow">
          <text x={NW / 2} y={16} textAnchor="middle" className="npc-tick">Publishers</text>
          <text x={W / 2} y={16} textAnchor="middle" className="npc-tick">Channels</text>
          <text x={W - NW / 2} y={16} textAnchor="middle" className="npc-tick">Subscribers</text>
          {rows.flatMap((r) => [
            ...r.publishers.map((m) => {
              const y1 = yPub.get(m.id)! + 13
              const y2 = yCh.get(r.channel.id)! + 13
              return <path key={`p${r.channel.id}${m.id}`} d={`M${NW},${y1} C${NW + 40},${y1} ${xC - 40},${y2} ${xC},${y2}`} className={'arch-flow' + (selected && selected !== r.channel.id ? ' dim' : '')} style={{ stroke: KIND_COLOR[r.channel.kind] }} />
            }),
            ...r.subscribers.map((m) => {
              const y1 = yCh.get(r.channel.id)! + 13
              const y2 = ySub.get(m.id)! + 13
              return <path key={`s${r.channel.id}${m.id}`} d={`M${xC + CW},${y1} C${xC + CW + 40},${y1} ${W - NW - 40},${y2} ${W - NW},${y2}`} className={'arch-flow' + (selected && selected !== r.channel.id ? ' dim' : '')} style={{ stroke: KIND_COLOR[r.channel.kind] }} />
            }),
          ])}
          {pubs.map((m) => (
            <g key={m.id} transform={`translate(0,${yPub.get(m.id)})`} className="arch-node static">
              <rect width={NW} height={26} rx={6} />
              <text x={NW / 2} y={17} textAnchor="middle">{short(nameOf(m))}</text>
            </g>
          ))}
          {subs.map((m) => (
            <g key={m.id} transform={`translate(${W - NW},${ySub.get(m.id)})`} className="arch-node static">
              <rect width={NW} height={26} rx={6} />
              <text x={NW / 2} y={17} textAnchor="middle">{short(nameOf(m))}</text>
            </g>
          ))}
          {rows.map((r) => (
            <g
              key={r.channel.id}
              transform={`translate(${xC},${yCh.get(r.channel.id)})`}
              className={'arch-channel' + (r.channel.id === selected ? ' selected' : '') + (r.orphan ? ' orphan' : '')}
              role="button"
              tabIndex={0}
              aria-label={`${nameOf(r.channel)}${r.orphan ? ' (incomplete)' : ''}`}
              onClick={() => onSelect(r.channel.id)}
              onKeyDown={keyActivate(() => onSelect(r.channel.id))}
            >
              <rect width={CW} height={26} rx={13} style={{ stroke: KIND_COLOR[r.channel.kind] ?? 'var(--line)' }} />
              <text x={CW / 2} y={17} textAnchor="middle">{short(nameOf(r.channel), 22)}{r.channel.frequency === 'Per frame' ? ' ⚡' : ''}</text>
            </g>
          ))}
        </svg>
      </div>
      <div className="chips">
        {Object.entries(KIND_COLOR).map(([k, c]) => (
          <span key={k} className="chip"><i className="npc-swatch" style={{ background: c }} /> {k}</span>
        ))}
        <span className="chip">⚡ per frame</span>
      </div>
      {rows.some((r) => r.orphan) && (
        <p className="warn">
          Incomplete: {rows.filter((r) => r.orphan).map((r) => `${nameOf(r.channel)} (${r.orphan === 'noPublisher' ? 'no publisher' : 'no subscriber'})`).join(', ')}
        </p>
      )}
    </div>
  )
}

/** Data-driven schemas × extension points: which content kinds designers can add without code. Click a cell to toggle. */
export function ExtensionCoverageView({ items, selected, onSelect, patch }: ViewProps) {
  const project = useProject()
  const cov = extensionCoverage(project)
  const modules = new Map(archList(project, 'modules').map((m) => [m.id, m]))
  if (!cov.rows.length) return <p className="empty">Add data schemas in Data-driven Design (Item, Building, NPC need…) to check which ones can be extended.</p>
  const toggle = (point: Entity, schemaId: string) => {
    const cur = ids(point.schemas)
    patch(point.id, 'schemas', cur.includes(schemaId) ? cur.filter((x) => x !== schemaId) : [...cur, schemaId])
  }
  return (
    <div className="stack arch-coverage">
      <p className="muted">
        Rows are the content schemas from Data-driven Design; columns are extension points. A ✓ means new entries of that kind can be added through that point. {cov.uncovered.length ? `${cov.uncovered.length} of ${cov.rows.length} schemas have no way in yet.` : 'Every schema has a way in.'}
      </p>
      <div className="table-wrap">
        <table className="grid arch-dsm">
          <thead>
            <tr>
              <th>Schema</th>
              {items.map((x) => (
                <th key={x.id} className={x.id === selected ? 'selected' : ''}>
                  <button className="linklike" onClick={() => onSelect(x.id)} title={x.host ? `in ${nameOf(modules.get(x.host))}` : 'no host module'}>
                    {short(nameOf(x), 16)}
                  </button>
                  <div className="muted arch-sub">{x.host ? nameOf(modules.get(x.host)) : 'no host'}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cov.rows.map((r) => (
              <tr key={r.schema.id} className={r.points.length ? '' : 'arch-uncovered'}>
                <th className="arch-dsm-row">
                  {nameOf(r.schema)} {!r.points.length && <span className="pill warning">no way in</span>}
                </th>
                {items.map((x) => {
                  const on = ids(x.schemas).includes(r.schema.id)
                  return (
                    <td key={x.id} className={'arch-dsm-cell' + (on ? ' ok' : '')}>
                      <button aria-label={`${nameOf(x)} extends ${nameOf(r.schema)}`} aria-pressed={on} onClick={() => toggle(x, r.schema.id)}>
                        {on ? '✓' : ''}
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {cov.hostless.length > 0 && <p className="muted">No host module: {cov.hostless.map(nameOf).join(', ')}</p>}
    </div>
  )
}

/** What-if tick budget: cost per frame against the simulation share, a one-second tick strip and per-system cost. */
export function TickScheduleView({ items, selected, onSelect }: ViewProps) {
  const real = useProject()
  const saved = real.documents[ARCH_DOC]?.data.simulation ?? {}
  const [what, setWhat] = useState<{ tickRate?: number; farInstances?: number }>({})
  const project: Project = {
    ...real,
    documents: { ...real.documents, [ARCH_DOC]: { ...real.documents[ARCH_DOC], data: { ...real.documents[ARCH_DOC]?.data, simulation: { ...saved, ...what } } } },
  }
  const b = tickBudget(project)
  const pattern = tickPattern(project)
  const colors = new Map(archList(project, 'systems').map((s, i) => [s.id, ARCH_COLORS[i % ARCH_COLORS.length]]))
  const shown = new Set(items.map((s) => s.id))
  const maxTick = Math.max(b.budgetMs, b.frameMs * 0.5, ...pattern.map((t) => t.costMs), 0.001)
  const changed = Object.keys(what).length > 0
  const save = () =>
    useStore.getState().mutate((p) => {
      const d = p.documents[ARCH_DOC]?.data
      if (!d) return
      d.simulation = { ...(d.simulation ?? {}), ...what }
    })
  const pct = (v: number, of: number) => `${Math.min(100, (v / (of || 1)) * 100)}%`
  return (
    <div className="stack arch-ticks">
      <p className="muted">
        {fmt(b.tickRate)} ticks/s at {fmt(b.fps)} fps: one frame is {fmt(b.frameMs)} ms and the simulation may use {fmt(b.share)}% of it ({fmt(b.budgetMs)} ms). Planning estimate from the costs you enter, not a profile.
      </p>
      <div className="row arch-whatif">
        <label className="row">
          <span className="muted">What if ticks/s</span>
          <input type="range" min={1} max={60} value={b.tickRate} aria-label="What-if ticks per second" onChange={(e) => setWhat({ ...what, tickRate: Number(e.target.value) })} />
          <strong>{fmt(b.tickRate)}</strong>
        </label>
        <label className="row">
          <span className="muted">far instances</span>
          <input type="range" min={0} max={50} value={b.farInstances} aria-label="What-if far instances" onChange={(e) => setWhat({ ...what, farInstances: Number(e.target.value) })} />
          <strong>{b.farInstances}</strong>
        </label>
        {changed && (
          <>
            <button className="small" onClick={save}>Save to settings</button>
            <button className="small" onClick={() => setWhat({})}>Reset</button>
          </>
        )}
      </div>
      <div className="arch-gauges">
        <div>
          <div className="row">
            <span>Average per frame (main thread)</span>
            <strong className={b.overAverage ? 'warn' : 'ok'}>{fmt(b.avgFrameMs)} / {fmt(b.budgetMs)} ms</strong>
          </div>
          <div className="arch-meter" role="meter" aria-label="Average simulation cost per frame" aria-valuenow={b.avgFrameMs} aria-valuemax={b.budgetMs}>
            <span className={b.overAverage ? 'over' : ''} style={{ width: pct(b.avgFrameMs, b.budgetMs) }} />
          </div>
        </div>
        <div>
          <div className="row">
            <span>Worst tick (everything at once)</span>
            <strong className={b.overWorst ? 'warn' : b.worstTickMs > b.budgetMs ? 'muted' : 'ok'}>{fmt(b.worstTickMs)} / {fmt(b.frameMs)} ms frame</strong>
          </div>
          <div className="arch-meter">
            <span className={b.overWorst ? 'over' : ''} style={{ width: pct(b.worstTickMs, b.frameMs) }} />
          </div>
        </div>
      </div>
      {b.rows.length > 0 && (
        <>
          <strong>One second of ticks</strong>
          <div className="arch-strip" style={{ gridTemplateColumns: `repeat(${pattern.length}, minmax(10px, 1fr))` }} role="img" aria-label="Systems running on each tick">
            {pattern.map((t) => (
              <div key={t.tick} className="arch-tick" title={`Tick ${t.tick}: ${fmt(t.costMs)} ms — ${t.running.map((r) => nameOf(r.system)).join(', ') || 'nothing'}`}>
                <span className="arch-tick-budget" style={{ bottom: pct(b.budgetMs, maxTick) }} />
                {t.running.map((r) => (
                  <span key={r.system.id} className="arch-tick-seg" style={{ height: pct(Number(r.system.costMs) || 0, maxTick), background: colors.get(r.system.id) }} />
                ))}
              </div>
            ))}
          </div>
          <small className="muted">Bars: near cost of each tick; dashed line: simulation budget per frame. Systems running every N ticks show up on every Nth bar.</small>
        </>
      )}
      <div className="npc-odds-list">
        {b.rows
          .filter((r) => shown.has(r.system.id))
          .map((r) => (
            <button key={r.system.id} className={'npc-odds-row' + (r.system.id === selected ? ' selected' : '')} onClick={() => onSelect(r.system.id)}>
              <span className="npc-odds-name">
                <i className="npc-swatch" style={{ background: colors.get(r.system.id) }} /> {nameOf(r.system)}
                {!r.mainThread && <span className="pill">{String(r.system.thread)}</span>}
              </span>
              <span className="npc-odds-track">
                <span className="npc-odds-bar" style={{ width: pct(r.nearPerSecond, b.perSecond), background: colors.get(r.system.id) }} />
                <span className="npc-odds-bar arch-far" style={{ width: pct(r.farPerSecond, b.perSecond) }} />
              </span>
              <span className="npc-odds-value">
                {fmt(r.perSecond)} ms/s{r.farPerSecond > 0 && <small className="muted"> ({fmt(r.farPerSecond)} far)</small>} · every {r.every} tick{r.every > 1 ? 's' : ''}
              </span>
            </button>
          ))}
      </div>
    </div>
  )
}

const SCENE_ICON: Record<string, string> = { Bootstrap: '⏻', Persistent: '♾', Loading: '⏳', Level: '🗺', 'Additive UI': '🪟' }

/** Load order as columns: what each step loads, how long it takes, and where each scene can go next. */
export function BootSequenceView({ items, selected, onSelect }: ViewProps) {
  const project = useProject()
  const boot = bootSequence(project)
  const byId = new Map(items.map((s) => [s.id, s]))
  const shown = new Set(items.map((s) => s.id))
  const maxSec = Math.max(0.1, ...boot.steps.map((s) => s.seconds))
  const transitions = items.flatMap((s) => ids(s.next).map((n) => ({ from: s, to: byId.get(n) })))
  const starts = boot.steps.map((_, i) => boot.steps.slice(0, i).reduce((sum, x) => sum + x.seconds, 0))
  const sceneButton = (s: Entity) => (
    <button key={s.id} className={'arch-scene' + (s.id === selected ? ' selected' : '')} onClick={() => onSelect(s.id)}>
      <span>{SCENE_ICON[s.kind] ?? '▫'} {nameOf(s)}</span>
      <small className="muted">{String(s.kind ?? 'scene')}</small>
    </button>
  )
  return (
    <div className="stack arch-boot">
      <p className="muted">
        Scenes in load order, left to right. Each step lists the modules it initialises and its estimated load time{boot.totalSeconds ? ` (≈ ${fmt(boot.totalSeconds)} s to the last step)` : ''}. Click a scene to edit it.
      </p>
      <div className="arch-boot-steps">
        {boot.steps.map((st, i) => {
          const start = starts[i]
          return (
            <div key={st.order} className="arch-boot-step">
              <div className="arch-boot-head">
                <strong>Step {i + 1}</strong>
                <small className="muted">order {st.order} · t = {fmt(start)} s</small>
              </div>
              <div className="arch-meter thin">
                <span style={{ width: `${(st.seconds / maxSec) * 100}%` }} />
              </div>
              <small className="muted">{fmt(st.seconds)} s</small>
              {st.scenes.filter((s) => shown.has(s.id)).map(sceneButton)}
              <div className="chips">
                {st.modules.map((m) => (
                  <span key={m.id} className="chip">{nameOf(m)}</span>
                ))}
              </div>
              {i < boot.steps.length - 1 && <span className="arch-boot-arrow" aria-hidden="true">→</span>}
            </div>
          )
        })}
      </div>
      {boot.unordered.filter((s) => shown.has(s.id)).length > 0 && (
        <div className="row">
          <span className="muted">No load order:</span>
          {boot.unordered.filter((s) => shown.has(s.id)).map(sceneButton)}
        </div>
      )}
      {transitions.length > 0 && (
        <p className="muted">
          Transitions: {transitions.map((t) => `${nameOf(t.from)} → ${t.to ? nameOf(t.to) : '?'}`).join(' · ')}
        </p>
      )}
      {boot.noBootstrap && <p className="warn">No Bootstrap scene: mark the first scene that runs as Bootstrap.</p>}
      {boot.unreachable.length > 0 && <p className="warn">Not reachable from Bootstrap: {boot.unreachable.map(nameOf).join(', ')}</p>}
      {boot.neverLoaded.length > 0 && <p className="muted">Modules no scene initialises: {boot.neverLoaded.map(nameOf).join(', ')}</p>}
    </div>
  )
}
