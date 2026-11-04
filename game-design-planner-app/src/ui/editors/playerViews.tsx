import { useMemo, useState } from 'react'
import { Bar, CartesianGrid, ComposedChart, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { Entity } from '../../core/model/types'
import { buildState, comparedLevels, depletion, depletionSeries, levelCap, levelTable, playerList, treeAnalysis, unlearn, type SkillStatus } from '../../core/player'
import { useProject } from '../hooks'
import type { ViewProps } from './CollectionEditor'

const PALETTE = ['#4f9cf9', '#f97b4f', '#53c28b', '#d86be0', '#f2c94c', '#5ad1d1', '#e5707e']
const fmt = (n: number) => (Math.round(n * 10) / 10).toString()
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** All stats on one time grid (up to the slowest one emptying), as % of max. */
function depletionGrid(project: ReturnType<typeof useProject>, stats: Entity[], levelId: string, steps = 30) {
  const ends = stats.map((s) => depletionSeries(project, s, levelId).at(-1)?.t ?? 0)
  const end = Math.max(1, ...ends)
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = Math.round(((end * i) / steps) * 100) / 100
    const row: Record<string, number> = { t }
    stats.forEach((s, k) => {
      const share = ends[k] > 0 ? Math.max(0, 1 - t / ends[k]) : 0
      row[s.id] = Math.round(share * 1000) / 10
    })
    return row
  })
}

/** Each survival stat draining from full, as a share of its max, per difficulty level. */
export function DepletionView({ items, selected, onSelect }: ViewProps) {
  const project = useProject()
  const levels = comparedLevels(project)
  const [levelId, setLevelId] = useState(levels[Math.min(1, levels.length - 1)]?.id ?? '')
  const rows = depletion(project)
  const plotted = items.filter((s) => isNum(s.max) && isNum(s.decay) && s.decay > 0)
  const units = new Set(plotted.map((s) => (s.decayUnit === 'in-game hour' ? 'in-game hours' : 'real minutes')))
  return (
    <div className="stack npc-preview">
      <div className="row">
        <span className="muted">Difficulty</span>
        <select aria-label="Difficulty" value={levelId} onChange={(e) => setLevelId(e.target.value)}>
          {levels.map((l) => (
            <option key={l.id} value={l.id}>{l.label}</option>
          ))}
        </select>
        <span className="muted">Link a stat to a Difficulty parameter to scale its decay per level.</span>
      </div>
      {plotted.length === 0 ? (
        <p className="empty">Give survival stats a max and a decay to see how fast they drain.</p>
      ) : (
        <div style={{ height: 280 }}>
          <ResponsiveContainer>
            <LineChart data={depletionGrid(project, plotted, levelId)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334" />
              <XAxis type="number" dataKey="t" name="time" domain={[0, 'dataMax']} unit={units.size === 1 ? ` ${[...units][0].split(' ')[1]}` : ''} />
              <YAxis domain={[0, 100]} unit="%" />
              <Tooltip />
              <Legend />
              {plotted.map((s, i) => (
                <Line
                  key={s.id}
                  type="linear"
                  dataKey={s.id}
                  name={s.name || 'stat'}
                  stroke={PALETTE[i % PALETTE.length]}
                  strokeWidth={s.id === selected ? 3 : 1.5}
                  dot={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      <table className="grid">
        <thead>
          <tr>
            <th>Time to critical</th>
            {levels.map((l) => (
              <th key={l.id}>{l.label}</th>
            ))}
            <th>Unit</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.stat.id} className={r.stat.id === selected ? 'selected' : ''} onClick={() => onSelect(r.stat.id)}>
              <td>{r.stat.name || '(unnamed)'}</td>
              {levels.map((l) => (
                <td key={l.id} className="num">{r.times[l.id] === null ? '–' : fmt(r.times[l.id]!)}</td>
              ))}
              <td className="muted">{r.unit}s</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** XP per level and cumulative XP, with the level at which each cast's tree becomes affordable. */
export function LevelCurveView() {
  const project = useProject()
  const table = useMemo(() => levelTable(project), [project])
  const trees = useMemo(() => treeAnalysis(project).casts.filter((c) => c.skills.length), [project])
  const data = table.rows.map((r) => ({ level: r.level, next: r.next ?? undefined, total: r.total }))
  const every = table.cap > 20 ? 5 : table.cap > 10 ? 2 : 1
  return (
    <div className="stack npc-preview">
      <p className="muted">
        From Levelling: cap {table.cap}
        {table.capSet ? '' : ' (not set; showing 20)'}, XP rate {table.xpPerHour > 0 ? `${fmt(table.xpPerHour)} per hour from the sources below` : 'unknown: give sources an XP value and actions per hour'}.
        {table.error && <span className="error-text"> XP formula: {table.error}.</span>}
        {table.flat.length > 0 && <span className="error-text"> Not increasing at level {table.flat.slice(0, 5).join(', ')}.</span>}
      </p>
      <div style={{ height: 260 }}>
        <ResponsiveContainer>
          <ComposedChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334" />
            <XAxis dataKey="level" />
            <YAxis yAxisId="next" />
            <YAxis yAxisId="total" orientation="right" />
            <Tooltip />
            <Legend />
            <Bar yAxisId="next" dataKey="next" name="XP to this level" fill="#4f9cf9" />
            <Line yAxisId="total" dataKey="total" name="Total XP" stroke="#f2c94c" dot={false} />
            {trees.map((t, i) =>
              t.affordableAt ? <ReferenceLine key={t.cast.id} yAxisId="next" x={t.affordableAt} stroke={PALETTE[(i + 2) % PALETTE.length]} strokeDasharray="4 3" label={{ value: t.cast.label, fill: '#aaa', fontSize: 11, position: 'top' }} /> : null,
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <table className="grid">
        <thead>
          <tr>
            <th>Level</th>
            <th>XP to reach</th>
            <th>Total XP</th>
            <th>Hours</th>
            <th>Skill points</th>
          </tr>
        </thead>
        <tbody>
          {table.rows
            .filter((r) => r.level === 1 || r.level % every === 0 || r.level === table.cap)
            .map((r) => (
              <tr key={r.level}>
                <td>{r.level}</td>
                <td className="num">{r.next === null ? '–' : fmt(r.next)}</td>
                <td className="num">{fmt(r.total)}</td>
                <td className="num">{r.hours === null ? '–' : fmt(r.hours)}</td>
                <td className="num">{fmt(r.points)}</td>
              </tr>
            ))}
        </tbody>
      </table>
      {trees.length > 0 && (
        <p className="muted">
          {trees.map((t) => `${t.cast.label}: tree costs ${fmt(t.totalCost)}, ${t.affordableAt ? `affordable at level ${t.affordableAt}` : `not affordable by the cap (${fmt(t.budget)} points)`}`).join(' · ')}
        </p>
      )}
    </div>
  )
}

// ---------- Tree layout shared by the tree and the planner ----------

const NODE_W = 150
const NODE_H = 48
const GAP_X = 16
const ROW_H = 84
const LANE_GAP = 36
const HEAD = 40

type Placed = { skill: Entity; x: number; y: number }
type Lane = { id: string; label: string; x: number; width: number; color?: string; cost: number; budget: number | null }

function layoutTree(skills: Entity[], lanes: { id: string; label: string; color?: string; budget: number | null }[]) {
  const placed: Placed[] = []
  const out: Lane[] = []
  let x = 0
  let maxTier = 1
  for (const lane of lanes) {
    const own = skills.filter((s) => (lane.id === '' ? !lanes.some((l) => l.id && l.id === s.cast) : s.cast === lane.id))
    if (!own.length) continue
    const tiers = new Map<number, Entity[]>()
    for (const s of own) {
      const t = isNum(s.tier) && s.tier >= 1 ? Math.floor(s.tier) : 1
      maxTier = Math.max(maxTier, t)
      tiers.set(t, [...(tiers.get(t) ?? []), s])
    }
    const cols = Math.max(...[...tiers.values()].map((l) => l.length))
    const width = cols * NODE_W + (cols - 1) * GAP_X
    for (const [t, list] of tiers) {
      const offset = (width - (list.length * NODE_W + (list.length - 1) * GAP_X)) / 2
      list.forEach((s, i) => placed.push({ skill: s, x: x + offset + i * (NODE_W + GAP_X), y: HEAD + (t - 1) * ROW_H }))
    }
    out.push({ ...lane, x, width, cost: own.reduce((sum, s) => sum + (isNum(s.cost) ? s.cost : 0), 0) })
    x += width + LANE_GAP
  }
  return { placed, lanes: out, width: Math.max(x - LANE_GAP, NODE_W), height: HEAD + maxTier * ROW_H }
}

export function TreeCanvas({
  skills,
  lanes,
  selected,
  onClick,
  status,
}: {
  skills: Entity[]
  lanes: { id: string; label: string; color?: string; budget: number | null }[]
  selected?: string
  onClick: (id: string) => void
  status?: Map<string, SkillStatus>
}) {
  const { placed, lanes: laid, width, height } = layoutTree(skills, lanes)
  const pos = new Map(placed.map((p) => [p.skill.id, p]))
  return (
    <div className="tl-scroll">
      <svg className="skill-tree" width={width + 2} height={height} role="img" aria-label="Skill tree">
        {laid.map((l) => (
          <g key={l.id || 'none'}>
            <rect x={l.x - 6} y={0} width={l.width + 12} height={height} rx={8} className="st-lane" style={l.color ? { stroke: l.color } : undefined} />
            <text x={l.x + l.width / 2} y={18} textAnchor="middle" className="st-lane-title">{l.label}</text>
            <text x={l.x + l.width / 2} y={32} textAnchor="middle" className="st-lane-sub">
              cost {fmt(l.cost)}{l.budget !== null ? ` / ${fmt(l.budget)} at cap` : ''}
            </text>
          </g>
        ))}
        {placed.flatMap((p) =>
          ((p.skill.requires ?? []) as string[])
            .filter((r) => pos.has(r))
            .map((r) => {
              const from = pos.get(r)!
              const x1 = from.x + NODE_W / 2
              const y1 = from.y + NODE_H
              const x2 = p.x + NODE_W / 2
              const y2 = p.y
              const bad = from.y >= p.y
              return <path key={`${r}-${p.skill.id}`} d={`M${x1},${y1} C${x1},${y1 + 24} ${x2},${y2 - 24} ${x2},${y2}`} className={'st-edge' + (bad ? ' bad' : '')} markerEnd="url(#st-arrow)" />
            }),
        )}
        <defs>
          <marker id="st-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" className="st-arrow" />
          </marker>
        </defs>
        {placed.map((p) => {
          const st = status?.get(p.skill.id)
          const cls = 'st-node' + (p.skill.id === selected ? ' selected' : '') + (st ? ` ${st.state}` : '') + (p.skill.kind ? ` k-${String(p.skill.kind).toLowerCase()}` : '')
          return (
            <g key={p.skill.id} className={cls} transform={`translate(${p.x},${p.y})`} onClick={() => onClick(p.skill.id)} role="button" tabIndex={0} aria-label={p.skill.name} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onClick(p.skill.id)}>
              <title>{st?.reasons.length ? `Locked: ${st.reasons.join('; ')}` : String(p.skill.effect ?? p.skill.name ?? '')}</title>
              <rect width={NODE_W} height={NODE_H} rx={6} />
              <text x={8} y={18} className="st-name">{String(p.skill.name || '(unnamed)').slice(0, 20)}</text>
              <text x={8} y={36} className="st-meta">
                {[p.skill.kind, isNum(p.skill.cost) ? `${p.skill.cost} pt` : null, isNum(p.skill.requiredLevel) ? `lv ${p.skill.requiredLevel}` : null].filter(Boolean).join(' · ')}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

type LaneDef = { id: string; label: string; color?: string; budget: number | null }

function useLanes(): LaneDef[] {
  const project = useProject()
  const casts = playerList(project, 'casts')
  const lanes: LaneDef[] = treeAnalysis(project).casts.map((t) => ({ id: t.cast.id, label: t.cast.label, color: casts.find((c) => c.cast === t.cast.id)?.color, budget: t.budget }))
  return [...lanes, { id: '', label: 'No cast', budget: null }]
}

/** Casts as lanes, tiers as rows, “requires” as arrows. */
export function SkillTreeView({ items, selected, onSelect }: ViewProps) {
  const project = useProject()
  const lanes = useLanes()
  const a = treeAnalysis(project)
  const problems = [
    ...(a.cycles.length ? [`circular requirements: ${a.cycles.map((s) => s.name).join(', ')}`] : []),
    ...(a.tierInversions.length ? [`requires a skill on the same or a later tier: ${a.tierInversions.map((s) => s.name).join(', ')}`] : []),
    ...(a.crossCast.length ? [`requires a skill of another cast: ${a.crossCast.map((s) => s.name).join(', ')}`] : []),
    ...(a.aboveCap.length ? [`required level above the cap (${levelCap(project)}): ${a.aboveCap.map((s) => s.name).join(', ')}`] : []),
  ]
  if (!items.length) return null
  return (
    <div className="stack">
      <p className="muted">Lanes are casts, rows are tiers, arrows point from a prerequisite to the skill that needs it. Click a skill to edit it. Red arrows run upward or sideways.</p>
      {problems.length > 0 && <p className="error-text">{problems.join(' · ')}</p>}
      <TreeCanvas skills={items} lanes={lanes} selected={selected} onClick={onSelect} />
      <SkillLegend />
    </div>
  )
}

function SkillLegend({ planner }: { planner?: boolean }) {
  return (
    <div className="legend">
      <span className="cv-legend st-key k-passive">Passive</span>
      <span className="cv-legend st-key k-active">Active</span>
      <span className="cv-legend st-key k-spell">Spell</span>
      {planner && (
        <>
          <span className="cv-legend st-key learned">Learned</span>
          <span className="cv-legend st-key available">Can learn</span>
          <span className="cv-legend st-key locked">Locked</span>
        </>
      )}
    </div>
  )
}

/** Interactive: learn skills at a chosen level to test whether the tree and the point budget work together. */
export function BuildPlannerView({ items, onSelect }: ViewProps) {
  const project = useProject()
  const casts = treeAnalysis(project).casts.filter((c) => c.skills.length)
  const cap = levelCap(project) ?? 20
  const [castId, setCastId] = useState(casts[0]?.cast.id ?? '')
  const [level, setLevel] = useState(Math.max(1, Math.ceil(cap / 2)))
  const [picked, setPicked] = useState<string[]>([])
  const cast = casts.find((c) => c.cast.id === castId) ?? casts[0]
  if (!cast) return <p className="empty">Give skills a cast to plan a build.</p>
  const state = buildState(project, cast.cast.id, level, picked)
  const status = new Map(state.skills.map((s) => [s.skill.id, s]))
  const click = (id: string) => {
    onSelect(id)
    const st = status.get(id)
    if (!st) return
    if (st.state === 'learned') setPicked(unlearn(project, picked, id))
    else if (st.state === 'available') setPicked([...picked, id])
  }
  const own = items.filter((s) => s.cast === cast.cast.id)
  const pct = state.points > 0 ? Math.min(100, (state.spent / state.points) * 100) : 0
  return (
    <div className="stack">
      <div className="row">
        <span className="muted">Cast</span>
        <select aria-label="Cast" value={cast.cast.id} onChange={(e) => { setCastId(e.target.value); setPicked([]) }}>
          {casts.map((c) => <option key={c.cast.id} value={c.cast.id}>{c.cast.label}</option>)}
        </select>
        <span className="muted">Level</span>
        <input aria-label="Level" type="range" min={1} max={cap} value={Math.min(level, cap)} onChange={(e) => setLevel(Number(e.target.value))} />
        <strong>{Math.min(level, cap)}</strong>
        <button className="small" onClick={() => setPicked([])}>Reset build</button>
      </div>
      <div className="progress" title={`${state.spent}/${state.points} points`}>
        <div style={{ width: `${pct}%` }} />
        <span>{fmt(state.spent)} / {fmt(state.points)} points{state.left < 0 ? ' (over budget)' : ''}</span>
      </div>
      {state.invalid.length > 0 && <p className="error-text">At this level some learned skills are no longer allowed: {state.invalid.map((id) => own.find((s) => s.id === id)?.name).join(', ')}.</p>}
      <p className="muted">Click a skill to learn it; click a learned skill to unlearn it (and everything that depends on it). Hover a locked skill to see why.</p>
      <TreeCanvas skills={own} lanes={[{ id: cast.cast.id, label: cast.cast.label, budget: cast.budget }]} onClick={click} status={status} />
      <SkillLegend planner />
    </div>
  )
}
