import { useMemo, useState, type KeyboardEvent } from 'react'
import type { CollectionView, Entity, Project } from '../../core/model/types'
import { makeId } from '../../core/model/project'
import {
  bondLadder,
  eventOdds,
  evaluateFor,
  EXTRA_VARS,
  lifecycleIssues,
  lifespan,
  needChains,
  needsBalance,
  NPC_DOC,
  populationMix,
  routineStrips,
  statScale,
  statVar,
  workforceFlow,
} from '../../core/npc'
import { seasonYear, yearLength } from '../../core/timeWeather'
import { resolveSource } from '../../core/references/refs'
import { useStore } from '../../core/store/store'
import { useProject } from '../hooks'
import type { ViewProps } from './CollectionEditor'

const fmt = (n: number) => (Math.round(n * 100) / 100).toString()
/** Series palette (the only hard-coded colours, as in the other planners). */
export const NPC_COLORS = ['#4f9cf9', '#53c28b', '#f2c94c', '#f97b4f', '#d86be0', '#5ad1d1', '#e5707e', '#a3a8ff']
const catalogOf = (p: Project, id: string) => p.registry.catalogs[id]?.items ?? []
const labelOf = (p: Project, catalog: string, id: unknown) => catalogOf(p, catalog).find((i) => i.id === id)?.label ?? (id ? String(id) : '')
const keyActivate = (fn: () => void) => (e: KeyboardEvent) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    fn()
  }
}

/** Plain SVG radar: one polygon per series over the same axes, scaled to [lo, hi]. */
export function RadarSvg({ axes, series, lo, hi, size = 120, labels = false }: { axes: string[]; series: { values: number[]; color: string }[]; lo: number; hi: number; size?: number; labels?: boolean }) {
  const pad = labels ? 46 : 6
  const r = size / 2
  const c = r + pad
  const pt = (i: number, f: number) => {
    const a = (Math.PI * 2 * i) / axes.length - Math.PI / 2
    return [c + Math.cos(a) * r * f, c + Math.sin(a) * r * f]
  }
  const frac = (v: number) => Math.max(0, Math.min(1, (v - lo) / (hi - lo || 1)))
  if (axes.length < 3) return null
  return (
    <svg viewBox={`0 0 ${c * 2} ${c * 2}`} className="npc-radar" width={c * 2} height={c * 2} aria-hidden={!labels}>
      {[0.33, 0.66, 1].map((f) => (
        <polygon key={f} points={axes.map((_, i) => pt(i, f).join(',')).join(' ')} className="npc-radar-ring" />
      ))}
      {axes.map((a, i) => {
        const [x, y] = pt(i, 1)
        const [lx, ly] = pt(i, 1.18)
        return (
          <g key={a}>
            <line x1={c} y1={c} x2={x} y2={y} className="npc-radar-ring" />
            {labels && (
              <text x={lx} y={ly} textAnchor={Math.abs(lx - c) < 4 ? 'middle' : lx > c ? 'start' : 'end'} dominantBaseline="middle" className="npc-radar-label">
                {a}
              </text>
            )}
          </g>
        )
      })}
      {series.map((s, k) => (
        <polygon key={k} points={s.values.map((v, i) => pt(i, frac(v)).join(',')).join(' ')} fill={s.color} fillOpacity={0.25} stroke={s.color} strokeWidth={1.5} />
      ))}
    </svg>
  )
}

/** Archetypes: population share bar plus a roster of cards with a small stat radar each. */
export function PopulationView({ items, selected, onSelect }: ViewProps) {
  const project = useProject()
  const mix = populationMix(project)
  const stats = catalogOf(project, 'npcStats')
  const [lo, hi] = statScale(project)
  const color = new Map<string, string>(((project.documents[NPC_DOC]?.data.archetypes ?? []) as Entity[]).map((a, i) => [a.id, NPC_COLORS[i % NPC_COLORS.length]]))
  const width = Math.max(100, mix.total)
  return (
    <div className="stack npc-population">
      <div>
        <div className="row">
          <strong>Population mix</strong>
          <span className={'muted' + (Math.abs(mix.remainder) > 0.5 && mix.rows.length ? ' warn' : '')}>
            {mix.rows.length ? `${fmt(mix.total)}% assigned${mix.remainder > 0.5 ? ` · ${fmt(mix.remainder)}% left` : mix.remainder < -0.5 ? ` · ${fmt(-mix.remainder)}% over 100` : ''}` : 'Give archetypes a share of population to see the mix.'}
          </span>
        </div>
        <div className="npc-sharebar" role="img" aria-label={`Population shares: ${mix.rows.map((r) => `${r.archetype.name} ${fmt(r.share)}%`).join(', ') || 'none'}`}>
          {mix.rows.map((r) => (
            <button
              key={r.archetype.id}
              className={'npc-share' + (r.archetype.id === selected ? ' selected' : '')}
              style={{ width: `${(r.share / width) * 100}%`, background: color.get(r.archetype.id) }}
              title={`${r.archetype.name}: ${fmt(r.share)}%`}
              onClick={() => onSelect(r.archetype.id)}
            >
              {r.share / width > 0.08 ? `${r.archetype.name} ${fmt(r.share)}%` : ''}
            </button>
          ))}
          {mix.remainder > 0.5 && <span className="npc-share rest" style={{ width: `${(mix.remainder / width) * 100}%` }}>{mix.rows.length ? 'unassigned' : ''}</span>}
          {mix.total > 100.5 && <span className="npc-share-limit" style={{ left: `${(100 / width) * 100}%` }} title="100%" />}
        </div>
        {mix.unset.length > 0 && mix.rows.length > 0 && <p className="muted">No share yet: {mix.unset.map((a) => a.name || '(unnamed)').join(', ')}</p>}
      </div>
      <div className="npc-roster">
        {items.map((a) => {
          const values = stats.map((s) => {
            const v = (a.stats ?? {})[s.id]
            return typeof v === 'number' ? v : lo
          })
          const top = stats.map((s, i) => ({ s, v: values[i] })).sort((x, y) => y.v - x.v).slice(0, 2)
          return (
            <button key={a.id} className={'npc-roster-card' + (a.id === selected ? ' selected' : '')} onClick={() => onSelect(a.id)} style={{ borderTopColor: color.get(a.id) }}>
              <RadarSvg axes={stats.map((s) => s.label)} series={[{ values, color: color.get(a.id) ?? NPC_COLORS[0] }]} lo={lo} hi={hi} size={84} />
              <span className="npc-roster-text">
                <strong>{a.name || '(unnamed)'}</strong>
                <span className="muted">{labelOf(project, 'professions', a.profession) || 'no profession'}{typeof a.share === 'number' ? ` · ${fmt(a.share)}%` : ''}</span>
                {stats.length > 0 && <small className="muted">Best: {top.map((t) => `${t.s.label} ${fmt(t.v)}`).join(', ')}</small>}
                {Object.keys(a.needs ?? {}).length > 0 && <small className="muted">Needs/day: {Object.entries(a.needs as Record<string, number>).map(([k, v]) => `${labelOf(project, 'needs', k)} ${fmt(v)}`).join(', ')}</small>}
              </span>
            </button>
          )
        })}
      </div>
      {stats.length < 3 && <p className="muted">Add at least 3 NPC stats in Definitions to draw the mini radars.</p>}
      <p className="muted">Click a card to edit it. The Radar tab overlays several archetypes on one chart.</p>
    </div>
  )
}

const heat = (v: number) => (v === 0 ? 'transparent' : `color-mix(in srgb, var(${v > 0 ? '--ok' : '--danger'}) ${Math.min(80, 15 + Math.abs(v) * 0.65)}%, transparent)`)

/** Life stages on an age axis: bands, working age, and a heat strip of need and stat modifiers. */
export function LifespanView({ selected, onSelect }: ViewProps) {
  const project = useProject()
  const l = lifespan(project)
  const cycle = lifecycleIssues(project)
  const stats = catalogOf(project, 'npcStats').filter((s) => l.rows.some((r) => r.statModifiers[s.id]))
  const ageUnit = project.documents[NPC_DOC]?.data.overview?.ageUnit
  const unit = ageUnit ? ` (${String(ageUnit)})` : ''
  const [lo, hi] = l.scale
  const W = 720
  const L = 120
  const x = (age: number) => L + ((age - lo) / (hi - lo || 1)) * (W - L - 10)
  const xEnd = (age: number) => x(Math.min(hi, age + 1))
  const rows = [{ key: 'needs', label: 'Needs %', value: (r: (typeof l.rows)[number]) => r.needModifier }, ...stats.map((s) => ({ key: s.id, label: s.label, value: (r: (typeof l.rows)[number]) => r.statModifiers[s.id] ?? 0 }))]
  const H = 92 + rows.length * 22
  const ticks = Array.from({ length: 6 }, (_, i) => Math.round(lo + ((hi - lo) * i) / 5))
  if (!l.rows.length) return <p className="empty">Give life stages an “Age from” to draw them on the lifespan.</p>
  return (
    <div className="stack npc-lifespan">
      <p className="muted">
        Ages {lo}–{hi}{unit}. Working age covers <strong>{Math.round(l.workShare * 100)}%</strong> of a full lifetime. Modifier cells: green raises, red lowers. Click a stage to edit it.
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} className="npc-lifespan-svg" role="img" aria-label="Life stages along the age axis">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={x(t)} y1={18} x2={x(t)} y2={H - 4} className="npc-grid" />
            <text x={x(t)} y={12} textAnchor="middle" className="npc-tick">{t}</text>
          </g>
        ))}
        <text x={4} y={42} className="npc-tick">Stages</text>
        <text x={4} y={72} className="npc-tick">Can work</text>
        {l.rows.map((r, i) => (
          <g
            key={r.stage.id}
            className={'npc-stage' + (r.stage.id === selected ? ' selected' : '') + (r.overlaps ? ' overlaps' : '')}
            role="button"
            tabIndex={0}
            aria-label={`${r.stage.name}: ${r.from}–${r.to}`}
            onClick={() => onSelect(r.stage.id)}
            onKeyDown={keyActivate(() => onSelect(r.stage.id))}
          >
            <rect x={x(r.from)} y={r.overlaps ? 36 : 26} width={Math.max(2, xEnd(r.to) - x(r.from))} height={r.overlaps ? 18 : 26} rx={4} fill={NPC_COLORS[i % NPC_COLORS.length]} />
            <text x={(x(r.from) + xEnd(r.to)) / 2} y={r.overlaps ? 49 : 43} textAnchor="middle" className="npc-stage-label">{String(r.stage.name ?? '')}</text>
            {r.canWork && <rect x={x(r.from)} y={62} width={Math.max(2, xEnd(r.to) - x(r.from))} height={14} className="npc-work" />}
            {r.gapBefore && <line x1={x(r.from) - 1} y1={22} x2={x(r.from) - 1} y2={56} className="npc-gap" />}
          </g>
        ))}
        {rows.map((row, k) => (
          <g key={row.key}>
            <text x={4} y={100 + k * 22} className="npc-tick">{row.label}</text>
            {l.rows.map((r) => {
              const v = row.value(r)
              return (
                <g key={r.stage.id}>
                  <rect x={x(r.from)} y={88 + k * 22} width={Math.max(2, xEnd(r.to) - x(r.from))} height={18} fill={heat(v)} className="npc-heat" />
                  {v !== 0 && <text x={(x(r.from) + xEnd(r.to)) / 2} y={101 + k * 22} textAnchor="middle" className="npc-tick">{v > 0 ? '+' : ''}{fmt(v)}%</text>}
                </g>
              )
            })}
          </g>
        ))}
      </svg>
      {l.problems.length > 0 && <p className="warn">Ranges: {l.problems.join('; ')}</p>}
      {cycle && (cycle.noStart || cycle.noEnd || cycle.stagesMissing.length > 0) && (
        <p className="muted">
          Life cycle diagram: {[cycle.noStart && 'no Start node', cycle.noEnd && 'no End node', cycle.stagesMissing.length > 0 && `stages without a state: ${cycle.stagesMissing.map((s) => s.name).join(', ')}`].filter(Boolean).join('; ')}.
        </p>
      )}
    </div>
  )
}

const STATUS_TEXT = { ok: 'complete', noRule: 'no rule', noSupply: 'no supply', noConsequence: 'no consequence' } as const

/** Need rules as chains: demand → what satisfies it → grace period → consequence. */
export function NeedChainView({ docId, sec, selected, onSelect }: ViewProps) {
  const project = useProject()
  const rows = needChains(project)
  const add = (needId: string, label: string) => {
    const id = makeId()
    useStore.getState().mutate((p) => {
      const d = p.documents[docId]?.data
      if (d && Array.isArray(d[sec.id])) d[sec.id].push({ id, name: label, need: needId })
    })
    onSelect(id)
  }
  if (!rows.length) return <p className="empty">Add needs in Definitions (NPC needs) to chain them here.</p>
  return (
    <div className="stack npc-chain">
      <p className="muted">Each row follows one need from daily demand to what happens when it goes unmet. Demand is per 100 NPCs of the archetype share mix. Click a row to edit its rule.</p>
      <div className="npc-chain-head" aria-hidden="true">
        <span>Need · demand</span>
        <span>Satisfied by</span>
        <span>Grace</span>
        <span>When unmet</span>
      </div>
      {rows.map((r) => {
        const open = () => (r.rule ? onSelect(r.rule.id) : add(r.needId, r.label))
        return (
          <div
            key={r.needId}
            className={'npc-chain-row ' + r.status + (r.rule && r.rule.id === selected ? ' selected' : '')}
            role="button"
            tabIndex={0}
            aria-label={`${r.label}: ${STATUS_TEXT[r.status]}`}
            onClick={open}
            onKeyDown={keyActivate(open)}
          >
            <div className="npc-chain-cell">
              <strong>{r.label}</strong>
              <small className="muted">{r.per100 === null ? 'no shares yet' : `${fmt(r.per100)} / day per 100`}</small>
            </div>
            <div className="npc-chain-cell">
              {r.supply.length ? (
                <span className="chips">
                  {r.supply.map((s) => (
                    <span key={s} className={'chip ' + r.supplyKind}>{r.supplyKind === 'resource' ? '📦 ' : '🏠 '}{s}</span>
                  ))}
                </span>
              ) : (
                <span className="warn">{r.rule ? 'nothing set' : '—'}</span>
              )}
            </div>
            <div className="npc-chain-cell">{r.graceDays === null ? <span className="muted">–</span> : `${fmt(r.graceDays)} d`}</div>
            <div className="npc-chain-cell">
              {r.consequence ? <span className="pill">{r.consequence}</span> : <span className="muted">–</span>}
              {r.moraleImpact !== null && <small className={r.moraleImpact < 0 ? 'warn' : 'ok'}> morale {r.moraleImpact > 0 ? '+' : ''}{fmt(r.moraleImpact)}/day</small>}
              {r.status !== 'ok' && <span className="pill warning">{r.rule ? STATUS_TEXT[r.status] : '+ add rule'}</span>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

const COLS = ['Archetypes', 'Professions', 'Jobs', 'Town buildings']

/** Who works where: archetype → profession → job → Town building, with mismatches in red. */
export function WorkforceView({ selected, onSelect }: ViewProps) {
  const project = useProject()
  const f = workforceFlow(project)
  if (!f.nodes.length) return <p className="empty">Give archetypes and jobs a profession to draw the workforce map.</p>
  const colW = 190
  const nodeW = 150
  const rowH = 36
  const byCol = COLS.map((_, c) => f.nodes.filter((n) => n.column === c))
  const H = 40 + Math.max(...byCol.map((c) => c.length), 1) * rowH
  const pos = new Map<string, { x: number; y: number }>()
  byCol.forEach((nodes, c) => nodes.forEach((n, i) => pos.set(n.id, { x: 10 + c * colW, y: 30 + i * rowH })))
  return (
    <div className="stack npc-workforce">
      <p className="muted">Lines follow who can do which job and where it happens. Red dashed: the Town building does not list the job’s profession as a worker. Click a job to edit it.</p>
      <div className="npc-scroll">
        <svg viewBox={`0 0 ${10 + 4 * colW} ${H}`} width={10 + 4 * colW} className="npc-flow" role="img" aria-label="Workforce map">
          {COLS.map((c, i) => (
            <text key={c} x={10 + i * colW + nodeW / 2} y={16} textAnchor="middle" className="npc-tick">{c}</text>
          ))}
          {f.links.map((k, i) => {
            const a = pos.get(k.from)
            const b = pos.get(k.to)
            if (!a || !b) return null
            const x1 = a.x + nodeW
            const y1 = a.y + 13
            const x2 = b.x
            const y2 = b.y + 13
            return <path key={i} d={`M${x1},${y1} C${x1 + 24},${y1} ${x2 - 24},${y2} ${x2},${y2}`} className={'npc-link' + (k.mismatch ? ' mismatch' : '')} />
          })}
          {f.nodes.map((n) => {
            const p = pos.get(n.id)!
            const job = n.column === 2 && n.entityId
            return (
              <g
                key={n.id}
                transform={`translate(${p.x},${p.y})`}
                className={'npc-flow-node c' + n.column + (n.missing ? ' missing' : '') + (job ? ' clickable' : '') + (n.entityId && n.entityId === selected ? ' selected' : '')}
                role={job ? 'button' : undefined}
                tabIndex={job ? 0 : undefined}
                aria-label={n.label}
                onClick={() => job && onSelect(n.entityId)}
                onKeyDown={job ? keyActivate(() => onSelect(n.entityId)) : undefined}
              >
                <rect width={nodeW} height={26} rx={6} />
                <text x={nodeW / 2} y={17} textAnchor="middle">{n.label.length > 20 ? n.label.slice(0, 19) + '…' : n.label}</text>
              </g>
            )
          })}
        </svg>
      </div>
      {f.jobless.length > 0 && <p className="warn">Professions archetypes have but no job describes: {f.jobless.map((p) => p.label).join(', ')}</p>}
      {f.unplaced.length > 0 && <p className="muted">Jobs without a Town building: {f.unplaced.map((j) => j.name || '(unnamed)').join(', ')}</p>}
    </div>
  )
}

const ACTIVITIES = ['Sleep', 'Work', 'Eat', 'Leisure', 'Socialize', 'Patrol', 'Travel', 'Train']
const ACTIVITY_COLOR: Record<string, string> = { Sleep: '#5a6380', Work: '#4f9cf9', Eat: '#f2c94c', Leisure: '#53c28b', Socialize: '#d86be0', Patrol: '#e5707e', Travel: '#5ad1d1', Train: '#f97b4f' }

/** The daily routine as one coloured strip per profession; each slot can be changed in place. */
export function RoutineView({ items }: ViewProps) {
  const project = useProject()
  const r = routineStrips(project)
  const used = new Set(items.map((j) => j.profession).filter(Boolean))
  const rows = r.rows.filter((row) => used.has(row.profession.id) || row.slots.some(Boolean))
  const set = (prof: string, time: string, value: string) =>
    useStore.getState().mutate((p) => {
      const d = p.documents[NPC_DOC]?.data
      if (!d) return
      if (!d.routine || typeof d.routine !== 'object') d.routine = { cells: {} }
      d.routine.cells ??= {}
      if (value) d.routine.cells[`${prof}|${time}`] = value
      else delete d.routine.cells[`${prof}|${time}`]
    }, `routine.${prof}.${time}`)
  if (!r.times.length) return <p className="empty">Add times of day in Definitions to plan routines.</p>
  if (!rows.length) return <p className="empty">Give jobs a profession, or fill the Daily routine matrix, to see each profession’s day.</p>
  const workless = rows.filter((row) => used.has(row.profession.id) && row.slots.every((s) => s !== 'Work'))
  return (
    <div className="stack npc-routine">
      <p className="muted">One strip per profession across the day (same data as the Daily routine matrix). Change a slot directly here.</p>
      <div className="npc-routine-grid" style={{ gridTemplateColumns: `140px repeat(${r.times.length}, minmax(80px, 1fr))` }}>
        <span />
        {r.times.map((t) => (
          <span key={t.id} className="muted npc-routine-time">{t.label}</span>
        ))}
        {rows.map((row) => (
          <div key={row.profession.id} className="npc-routine-row" style={{ display: 'contents' }}>
            <strong>{row.profession.label}</strong>
            {row.slots.map((slot, i) => (
              <select
                key={r.times[i].id}
                aria-label={`${row.profession.label} at ${r.times[i].label}`}
                className="npc-routine-slot"
                style={{ background: slot ? ACTIVITY_COLOR[slot] ?? 'var(--panel2)' : undefined, color: slot ? '#111' : undefined }}
                value={slot}
                onChange={(e) => set(row.profession.id, r.times[i].id, e.target.value)}
              >
                <option value="">–</option>
                {ACTIVITIES.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            ))}
          </div>
        ))}
      </div>
      <div className="chips">
        {ACTIVITIES.map((a) => (
          <span key={a} className="chip"><i className="npc-swatch" style={{ background: ACTIVITY_COLOR[a] }} /> {a}</span>
        ))}
      </div>
      {workless.length > 0 && <p className="warn">No work slot yet: {workless.map((w) => w.profession.label).join(', ')}</p>}
    </div>
  )
}

/** Relationship levels on the affinity scale with the bonds pinned at the level they require. */
export function BondLadderView({ selected, onSelect }: ViewProps) {
  const project = useProject()
  const b = bondLadder(project)
  const [lo, hi] = b.scale
  const W = 720
  const x = (v: number) => 10 + ((v - lo) / (hi - lo || 1)) * (W - 20)
  const maxBonds = Math.max(1, ...b.levels.map((l) => l.bonds.length))
  const H = 70 + maxBonds * 26
  const tone = (from: number, to: number) => {
    const mid = (from + to) / 2
    const f = mid / Math.max(Math.abs(lo), Math.abs(hi), 1)
    return `color-mix(in srgb, var(${f >= 0 ? '--ok' : '--danger'}) ${Math.round(20 + Math.abs(f) * 55)}%, var(--panel2))`
  }
  return (
    <div className="stack npc-bonds">
      <p className="muted">Affinity runs from {lo} to {hi}. Bands are the relationship levels; each bond sits on the level it requires. Click a bond to edit it.</p>
      {b.levels.length === 0 ? (
        <p className="empty">Add relationship levels with a minimum affinity to build the ladder.</p>
      ) : (
        <div className="npc-scroll">
          <svg viewBox={`0 0 ${W} ${H}`} className="npc-ladder-svg" role="img" aria-label="Relationship levels and bonds">
            {b.levels.map((l) => (
              <g key={l.id}>
                <rect x={x(l.from)} y={20} width={Math.max(2, x(Math.min(hi, l.to)) - x(l.from))} height={28} fill={tone(l.from, l.to)} className={'npc-level' + (l.overlaps ? ' overlaps' : '')} />
                <text x={(x(l.from) + x(Math.min(hi, l.to))) / 2} y={38} textAnchor="middle" className="npc-stage-label">{l.name}</text>
                <text x={x(l.from)} y={14} className="npc-tick">{l.from}</text>
                {l.bonds.map((bond, i) => (
                  <g
                    key={bond.id}
                    className={'npc-bond' + (bond.id === selected ? ' selected' : '')}
                    role="button"
                    tabIndex={0}
                    aria-label={`${bond.name} (${l.name})`}
                    onClick={() => onSelect(bond.id)}
                    onKeyDown={keyActivate(() => onSelect(bond.id))}
                  >
                    <line x1={x(l.from) + 8} y1={48} x2={x(l.from) + 8} y2={60 + i * 26} className="npc-grid" />
                    <rect x={x(l.from) + 2} y={56 + i * 26} width={130} height={20} rx={10} />
                    <text x={x(l.from) + 12} y={70 + i * 26}>{bond.exclusive ? '♥ ' : ''}{String(bond.name ?? '')}{bond.kind ? ` · ${bond.kind}` : ''}</text>
                  </g>
                ))}
              </g>
            ))}
            <text x={W - 10} y={14} textAnchor="end" className="npc-tick">{hi}</text>
            {b.start !== null && (
              <g>
                <path d={`M${x(b.start)},50 l-6,10 h12 z`} className="npc-start" />
                <text x={x(b.start) + 9} y={60} className="npc-tick">start {b.start}</text>
              </g>
            )}
          </svg>
        </div>
      )}
      {b.loose.length > 0 && (
        <p className="muted">
          No level required:{' '}
          {b.loose.map((bond) => (
            <button key={bond.id} className={'chip' + (bond.id === selected ? ' on' : '')} onClick={() => onSelect(bond.id)}>{bond.name || '(unnamed)'}</button>
          ))}
        </p>
      )}
      {b.problems.length > 0 && <p className="warn">Levels: {b.problems.join('; ')}</p>}
    </div>
  )
}

/** Random events by how often they fire per in-game year, coloured by category. */
export function EventOddsView({ selected, onSelect }: ViewProps) {
  const project = useProject()
  const days = yearLength(project)
  const seasons = seasonYear(project).ranges.length || 4
  const rows = eventOdds(project, days, seasons)
  const cats = [...new Set(rows.map((r) => r.category))]
  const max = Math.max(1, ...rows.map((r) => r.perYear ?? 0))
  const byCat = cats.map((c) => ({ c, n: rows.filter((r) => r.category === c).reduce((s, r) => s + (r.perYear ?? 0), 0) }))
  const total = byCat.reduce((s, x) => s + x.n, 0)
  if (!rows.length) return null
  return (
    <div className="stack npc-odds">
      <p className="muted">
        Expected times per in-game year ({days} days, {seasons} seasons from Time &amp; Weather) for one eligible roll: chance × rolls per year, capped by the cooldown. A planning estimate, not a simulation. Click a row to edit it.
      </p>
      {total > 0 && (
        <div className="npc-sharebar" role="img" aria-label="Events per year by category">
          {byCat.filter((x) => x.n > 0).map((x) => (
            <span key={x.c} className="npc-share" style={{ width: `${(x.n / total) * 100}%`, background: NPC_COLORS[cats.indexOf(x.c) % NPC_COLORS.length] }} title={`${x.c}: ${fmt(x.n)} / year`}>
              {x.n / total > 0.1 ? `${x.c} ${fmt(x.n)}` : ''}
            </span>
          ))}
        </div>
      )}
      <div className="npc-odds-list">
        {rows.map((r) => (
          <button key={r.event.id} className={'npc-odds-row' + (r.event.id === selected ? ' selected' : '')} onClick={() => onSelect(r.event.id)}>
            <span className="npc-odds-name">
              <i className="npc-swatch" style={{ background: NPC_COLORS[cats.indexOf(r.category) % NPC_COLORS.length] }} /> {r.event.name || '(unnamed)'}
            </span>
            <span className="npc-odds-track">
              {r.perYear !== null && <span className="npc-odds-bar" style={{ width: `${(r.perYear / max) * 100}%`, background: NPC_COLORS[cats.indexOf(r.category) % NPC_COLORS.length] }} />}
            </span>
            <span className="npc-odds-value">
              {r.event.period === 'once' ? 'one-off' : r.perYear === null ? <span className="warn">no chance set</span> : `≈ ${fmt(r.perYear)} / year`}
              {r.capped && <span className="pill warning">cooldown cap</span>}
              {typeof r.event.moraleEffect === 'number' && <small className={r.event.moraleEffect < 0 ? 'warn' : 'ok'}> morale {r.event.moraleEffect > 0 ? '+' : ''}{r.event.moraleEffect}</small>}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

/** Every rule's formula evaluated for every archetype, so stat formulas can be compared side by side. */
export function StatPreviewView({ docId, sec, items, selected, onSelect, view }: ViewProps & { view: Extract<CollectionView, { kind: 'statPreview' }> }) {
  const project = useProject()
  const [extra, setExtra] = useState<Record<string, number>>({ level: 1, age: 30 })
  const against: Entity[] = project.documents[docId]?.data[view.against.section] ?? []
  const statField = sec.fields.find((f) => f.key === view.statField)
  const stats = useMemo(() => (statField && statField.type === 'ref' ? resolveSource(project, docId, statField.source) : []), [project, docId, statField])
  const rules = items.filter((r) => String(r[view.formulaField] ?? '').trim())

  return (
    <div className="stack npc-preview">
      <p className="muted">
        Variables: {stats.map((s) => statVar(s.id)).join(', ') || 'none yet'}, {EXTRA_VARS.join(', ')}. Stats an archetype leaves empty count as the bottom of the stat scale.
      </p>
      <div className="row">
        {EXTRA_VARS.map((k) => (
          <label key={k} className="row">
            <span className="muted">{k}</span>
            <input type="number" step="any" style={{ width: 80 }} value={extra[k]} onChange={(e) => setExtra({ ...extra, [k]: Number(e.target.value) })} />
          </label>
        ))}
      </div>
      {rules.length === 0 ? (
        <p className="empty">Give a rule a formula to preview it.</p>
      ) : against.length === 0 ? (
        <p className="empty">Add archetypes to preview the formulas against their stats.</p>
      ) : (
        <div className="table-wrap">
          <table className="grid">
            <thead>
              <tr>
                <th>Rule</th>
                <th>Formula</th>
                {against.map((a) => (
                  <th key={a.id}>{a.name || '(unnamed)'}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id} className={r.id === selected ? 'selected' : ''} onClick={() => onSelect(r.id)}>
                  <td>{r.name || stats.find((s) => s.id === r[view.statField])?.label || '(unnamed)'}</td>
                  <td>
                    <code>{r[view.formulaField]}</code>
                  </td>
                  {against.map((a) => {
                    const res = evaluateFor(project, String(r[view.formulaField]), a, extra)
                    return res.ok ? (
                      <td key={a.id} className="num">{fmt(res.value)}</td>
                    ) : (
                      <td key={a.id} className="err" title={res.error}>⚠ {res.error}</td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/** Daily needs of each population scenario against what the Town module supplies. */
export function NeedsBalanceView({ items, selected, onSelect, view }: ViewProps & { view: Extract<CollectionView, { kind: 'needsBalance' }> }) {
  const project = useProject()
  const current = items.find((s) => s.id === selected) ?? items[0]
  const balance = useMemo(() => (current ? needsBalance(project, current, view.populationField) : null), [project, current, view.populationField])
  if (!current || !balance) return null
  return (
    <div className="stack npc-preview">
      <div className="row">
        <span className="muted">Scenario</span>
        <select aria-label="Scenario" value={current.id} onChange={(e) => onSelect(e.target.value)}>
          {items.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name || '(unnamed)'}
            </option>
          ))}
        </select>
        <span className="muted">Population {fmt(balance.population)}</span>
      </div>
      <p className="muted">
        Planning estimate. Resource needs use the Town estimate’s net rate (output minus building inputs) × {fmt(balance.unitsPerDay)} {balance.timeUnit}(s) per day; place needs use planned building counts × places. Set the
        population per archetype in the inspector.
      </p>
      {balance.rows.length === 0 ? (
        <p className="empty">Give archetypes needs per day and add a population to see the balance.</p>
      ) : (
        <table className="grid">
          <thead>
            <tr>
              <th>Need</th>
              <th>Needed</th>
              <th>Supplied</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            {balance.rows.map((r) => (
              <tr key={r.needId}>
                <td>{r.label}</td>
                <td className="num">{fmt(r.demand)}</td>
                <td className={'num' + (r.short ? ' short' : '')}>
                  {r.supply === null ? '–' : fmt(r.supply)} {r.short && <span className="pill warning">short by {fmt(r.demand - r.supply!)}</span>}
                </td>
                <td className="muted">{r.basis === 'resource' ? 'per day, from Town resources' : r.basis === 'capacity' ? 'places in buildings' : 'no supply set in Needs'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
