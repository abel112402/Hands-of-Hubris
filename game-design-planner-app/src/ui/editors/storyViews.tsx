import { useState } from 'react'
import { Bar, CartesianGrid, ComposedChart, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { Entity, Project } from '../../core/model/types'
import {
  actPacing,
  actsInOrder,
  castCoverage,
  decisionsOf,
  endingReachability,
  LOAD_MAX,
  LOAD_MIN,
  questDeps,
  rewardsByAct,
  simulatePath,
  storyList,
} from '../../core/story'
import { useProject } from '../hooks'
import type { ViewProps } from './CollectionEditor'

const TYPE_COLOR: Record<string, string> = { Main: '#f2c94c', Faction: '#4f9cf9', 'Tavern random': '#53c28b', Event: '#d86be0' }
const fmt = (n: number) => (Math.abs(n) >= 100 ? Math.round(n).toString() : (Math.round(n * 100) / 100).toString())
const nameOf = (e?: Entity) => (e ? String(e.name ?? '') || '(unnamed)' : '—')

// ---------- Quest flow ----------

const COL_W = 190
const NODE_W = 150
const NODE_H = 40
const ROW_H = 58

/** The quest dependency graph for any project (the example picker draws it on a preview copy). */
export function QuestFlowCanvas({ project, typeFilter = '', selected, onSelect }: { project: Project; typeFilter?: string; selected?: string; onSelect?: (id: string) => void }) {
  const acts = actsInOrder(project)
  const quests = storyList(project, 'quests').filter((q) => !typeFilter || q.type === typeFilter)
  const deps = questDeps(project)
  const cycle = new Set(deps.cycles.map((q) => q.id))
  const bad = new Set(deps.unreachable.map((u) => u.quest.id))
  const main = new Set(deps.mainPath.map((q) => q.id))
  const cols = [...acts.map((a) => ({ id: a.id, label: nameOf(a) })), { id: '', label: 'No act' }]
  const colOf = (q: Entity) => {
    const i = acts.findIndex((a) => a.id === q.act)
    return i >= 0 ? i : acts.length
  }
  const used = cols.filter((_, i) => quests.some((q) => colOf(q) === i))
  const pos = new Map<string, { x: number; y: number }>()
  used.forEach((c, ci) => {
    const idx = cols.indexOf(c)
    quests
      .filter((q) => colOf(q) === idx)
      .sort((a, b) => (deps.depth.get(a.id) ?? 0) - (deps.depth.get(b.id) ?? 0))
      .forEach((q, ri) => pos.set(q.id, { x: 34 + ci * COL_W, y: 34 + ri * ROW_H }))
  })
  const width = Math.max(1, used.length) * COL_W + 34
  const height = 34 + Math.max(1, ...used.map((c) => quests.filter((q) => colOf(q) === cols.indexOf(c)).length)) * ROW_H
  return (
    <div className="table-wrap">
      <svg width={width} height={height} className="quest-flow" role="img" aria-label="Quest flow">
        <defs>
          <marker id="qf-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" className="qf-arrowhead" />
          </marker>
        </defs>
        {used.map((c, i) => (
          <text key={c.id || 'none'} x={34 + i * COL_W} y={18} className="qf-col">{c.label}</text>
        ))}
        {deps.edges.map((e, i) => {
          const a = pos.get(e.from)
          const b = pos.get(e.to)
          if (!a || !b) return null
          const onMain = main.has(e.from) && main.has(e.to) && e.kind === 'requires'
          const x1 = a.x + NODE_W
          const y1 = a.y + NODE_H / 2
          const x2 = b.x
          const y2 = b.y + NODE_H / 2
          // Same act: loop out along the left side. An earlier act (a requirement pointing back in time) is drawn red.
          const same = b.x === a.x
          const back = b.x < a.x
          const d = same
            ? `M${a.x},${y1} C${a.x - 28},${y1} ${b.x - 28},${y2} ${b.x},${y2}`
            : back
              ? `M${a.x + NODE_W / 2},${a.y + NODE_H} C${a.x + NODE_W / 2},${a.y + NODE_H + 30} ${b.x + NODE_W / 2},${b.y + NODE_H + 30} ${b.x + NODE_W / 2},${b.y + NODE_H}`
              : `M${x1},${y1} C${x1 + 30},${y1} ${x2 - 30},${y2} ${x2},${y2}`
          return <path key={i} d={d} className={'qf-edge' + (e.kind === 'leadsTo' ? ' choice' : '') + (onMain ? ' main' : '') + (back ? ' back' : '')} markerEnd="url(#qf-arrow)" />
        })}
        {quests.map((q) => {
          const p = pos.get(q.id)
          if (!p) return null
          const cls = cycle.has(q.id) ? ' cycle' : bad.has(q.id) ? ' unreachable' : ''
          return (
            <g key={q.id} transform={`translate(${p.x},${p.y})`} className={'qf-node' + cls + (q.id === selected ? ' selected' : '') + (main.has(q.id) ? ' main' : '')} onClick={() => onSelect?.(q.id)} data-testid={cycle.has(q.id) ? 'qf-cycle' : bad.has(q.id) ? 'qf-unreachable' : undefined}>
              <rect width={NODE_W} height={NODE_H} rx="6" />
              <rect width="5" height={NODE_H} rx="2" fill={TYPE_COLOR[q.type] ?? '#8b93a5'} />
              <text x="12" y="17" className="qf-name">{nameOf(q).slice(0, 20)}</text>
              <text x="12" y="32" className="qf-meta">{[q.type, typeof q.rewardXp === 'number' ? `${q.rewardXp} XP` : ''].filter(Boolean).join(' · ')}</text>
              <title>{`${nameOf(q)}${cycle.has(q.id) ? ' — in a requirement loop' : bad.has(q.id) ? ' — can never start' : ''}`}</title>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

/** Quests in act columns with requirement arrows; loops, unreachable quests and the main path are marked. */
export function QuestFlowView({ selected, onSelect }: ViewProps) {
  const project = useProject()
  const [type, setType] = useState('')
  const deps = questDeps(project)
  if (!storyList(project, 'quests').length) return null
  return (
    <div className="stack npc-preview">
      <div className="row">
        <label className="row">
          <span className="muted">Type</span>
          <select aria-label="Quest type" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">All</option>
            {Object.keys(TYPE_COLOR).map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
      </div>
      <p className="muted">Built from each quest’s “Requires” and the options’ “Opens quests”. Columns are acts; the highlighted chain is the longest main questline. Click a quest to open it.</p>
      <QuestFlowCanvas project={project} typeFilter={type} selected={selected} onSelect={onSelect} />
      {deps.mainPath.length > 0 && <p className="muted">Main path: {deps.mainPath.map(nameOf).join(' → ')} ({deps.mainPath.length} quests)</p>}
      {deps.cycles.length > 0 && <p className="error-text">Requirement loop: {deps.cycles.map(nameOf).join(', ')}</p>}
      {deps.unreachable.filter((u) => !deps.cycles.includes(u.quest)).length > 0 && (
        <p className="error-text">Can never start: {deps.unreachable.filter((u) => !deps.cycles.includes(u.quest)).map((u) => `${nameOf(u.quest)} (${u.reason})`).join('; ')}</p>
      )}
      {deps.actInversions.length > 0 && <p className="error-text">Needs a later act: {deps.actInversions.map((x) => `${nameOf(x.quest)} ← ${nameOf(x.required)}`).join('; ')}</p>}
    </div>
  )
}

// ---------- Act pacing ----------

/** Quest play time against each act's length, and the player level at each act's end against its range. */
export function ActPacingView({ selected, onSelect }: ViewProps) {
  const project = useProject()
  const rows = actPacing(project)
  if (!rows.length) return null
  const data = rows.map((r) => ({ label: nameOf(r.act), questHours: r.questHours, actHours: r.actHours ?? undefined, level: r.level ?? undefined, levelMin: r.act.levelMin, levelMax: r.act.levelMax }))
  const noHours = rows.every((r) => r.actHours === null)
  const noCurve = rows.every((r) => r.level === null)
  return (
    <div className="stack npc-preview">
      <p className="muted">
        A planning estimate: quest play time from each quest’s estimate, levels from quest XP plus Player XP sources over the act’s play hours.
        {noHours && ' Set “Play hours per in-game day” in Structure to compare with act length.'}
        {noCurve && ' Set an XP formula in Player Character to see levels.'}
      </p>
      <div style={{ height: 230 }}>
        <ResponsiveContainer>
          <ComposedChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
            <XAxis dataKey="label" />
            <YAxis yAxisId="h" />
            <YAxis yAxisId="l" orientation="right" allowDecimals={false} />
            <Tooltip formatter={(v) => fmt(Number(v))} />
            <Legend />
            <Bar yAxisId="h" dataKey="questHours" name="Quest hours" fill="#4f9cf9" />
            <Bar yAxisId="h" dataKey="actHours" name="Act hours" fill="#8b93a5" />
            <Line yAxisId="l" dataKey="level" name="Level at end" stroke="#f2c94c" />
            <Line yAxisId="l" dataKey="levelMin" name="Level from" stroke="#53c28b" strokeDasharray="4 3" dot={false} />
            <Line yAxisId="l" dataKey="levelMax" name="Level to" stroke="#e5707e" strokeDasharray="4 3" dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <table className="grid">
        <thead>
          <tr><th>Act</th><th>Quests</th><th>Quest h</th><th>Act h</th><th>Filled</th><th>Quest XP</th><th>Total XP</th><th>Level at end</th><th>Intended</th></tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.act.id} className={'clickable' + (r.act.id === selected ? ' selected' : '')} onClick={() => onSelect(r.act.id)}>
              <td>{nameOf(r.act)}</td>
              <td className="num">{r.quests}</td>
              <td className="num">{fmt(r.questHours)}</td>
              <td className="num">{r.actHours === null ? '–' : fmt(r.actHours)}</td>
              <td className={'num' + (r.load !== null && r.quests > 0 && (r.load < LOAD_MIN || r.load > LOAD_MAX) ? ' short' : '')}>{r.load === null ? '–' : `${Math.round(r.load * 100)}%`}</td>
              <td className="num">{fmt(r.xp)}</td>
              <td className="num">{fmt(r.cumXp)}</td>
              <td className={'num' + (r.problem ? ' short' : '')} data-testid={`pace-level-${i}`}>{r.level ?? '–'}</td>
              <td className="num">{[r.act.levelMin, r.act.levelMax].some((x) => typeof x === 'number') ? `${r.act.levelMin ?? '…'}–${r.act.levelMax ?? '…'}` : '–'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ---------- Reward budget ----------

/** XP, money and item value per act, and one faction's reputation over the acts against the relationship levels. */
export function RewardBudgetView() {
  const project = useProject()
  const { rows, factions } = rewardsByAct(project)
  const [factionId, setFactionId] = useState('')
  const faction = factions.find((f) => f.id === factionId) ?? factions.find((f) => rows.some((r) => r.rep[f.id])) ?? factions[0]
  const levels = (project.documents['design.factions']?.data.thresholds ?? []) as Entity[]
  if (!rows.length) return <p className="empty">Add acts and quests with rewards to see the budget.</p>
  const data = rows.map((r) => ({ label: r.label, xp: r.xp, money: r.money, itemValue: r.itemValue, rep: faction ? r.cumRep[faction.id] : undefined }))
  return (
    <div className="stack npc-preview">
      <p className="muted">What quests hand out per act (choice effects are not counted: they depend on the player). A planning estimate.</p>
      <div style={{ height: 200 }}>
        <ResponsiveContainer>
          <ComposedChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
            <XAxis dataKey="label" />
            <YAxis />
            <Tooltip formatter={(v) => fmt(Number(v))} />
            <Legend />
            <Bar dataKey="xp" name="XP" fill="#f2c94c" />
            <Bar dataKey="money" name="Money" fill="#53c28b" />
            <Bar dataKey="itemValue" name="Item value" fill="#4f9cf9" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {faction && (
        <>
          <label className="row">
            <span className="muted">Reputation with</span>
            <select aria-label="Faction" value={faction.id} onChange={(e) => setFactionId(e.target.value)}>
              {factions.map((f) => <option key={f.id} value={f.id}>{nameOf(f)}</option>)}
            </select>
          </label>
          <div style={{ height: 170 }}>
            <ResponsiveContainer>
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
                <XAxis dataKey="label" />
                <YAxis />
                <Tooltip formatter={(v) => fmt(Number(v))} />
                {levels.filter((l) => typeof l.min === 'number').map((l) => (
                  <ReferenceLine key={l.id} y={l.min} stroke="var(--muted)" strokeDasharray="3 3" label={{ value: nameOf(l), position: 'insideTopLeft', fill: 'var(--muted)', fontSize: 11 }} />
                ))}
                <Line dataKey="rep" name="Reputation" stroke="#d86be0" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
      <table className="grid">
        <thead>
          <tr><th>Act</th><th>XP</th><th>Money</th><th>Item value</th>{faction && <th>{nameOf(faction)} after</th>}</tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id || 'none'}>
              <td>{r.label}</td><td className="num">{fmt(r.xp)}</td><td className="num">{fmt(r.money)}</td><td className="num">{fmt(r.itemValue)}</td>
              {faction && <td className="num" data-testid={`rep-${r.id}`}>{fmt(r.cumRep[faction.id] ?? 0)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ---------- Ending paths ----------

/** Planner: pick an option per decision and see which endings stay open and which quests close. */
export function EndingPathsView({ selected, onSelect }: ViewProps) {
  const project = useProject()
  const decisions = decisionsOf(project)
  const [picked, setPicked] = useState<Record<string, string>>({})
  const state = simulatePath(project, Object.values(picked).filter(Boolean))
  const reach = endingReachability(project)
  const quests = storyList(project, 'quests')
  return (
    <div className="stack npc-preview">
      {decisions.length > 0 ? (
        <div className="row">
          {decisions.map((d) => (
            <label key={d.name} className="row">
              <span className="muted">{d.name}</span>
              <select aria-label={d.name} value={picked[d.name] ?? ''} onChange={(e) => setPicked({ ...picked, [d.name]: e.target.value })}>
                <option value="">— undecided —</option>
                {d.options.map((o) => <option key={o.id} value={o.id}>{nameOf(o)}</option>)}
              </select>
            </label>
          ))}
        </div>
      ) : (
        <p className="muted">Add options in Choices to plan a path; options with the same decision name exclude each other.</p>
      )}
      <table className="grid">
        <thead>
          <tr><th>Ending</th><th>Kind</th><th>Needs</th><th>With these choices</th></tr>
        </thead>
        <tbody>
          {reach.map((r) => {
            const blocked = state.blockedEndings.find((b) => b.ending.id === r.ending.id)
            return (
              <tr key={r.ending.id} className={'clickable' + (r.ending.id === selected ? ' selected' : '')} onClick={() => onSelect(r.ending.id)}>
                <td>{nameOf(r.ending)}</td>
                <td className="muted">{r.ending.kind ?? '—'}</td>
                <td className="muted">{r.empty ? 'nothing yet' : [...r.options.map((o) => `“${nameOf(o)}”`), ...r.quests.map(nameOf)].join(', ')}</td>
                <td className={blocked ? 'short' : 'long'} data-testid={blocked ? 'ending-blocked' : 'ending-open'}>{blocked ? `closed: ${blocked.why}` : 'open'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {state.blockedQuests.size > 0 && <p className="muted">Quests closed by these choices: {quests.filter((q) => state.blockedQuests.has(q.id)).map(nameOf).join(', ')}</p>}
    </div>
  )
}

// ---------- Cast coverage ----------

/** Quests each character gives per act; Main characters without quests are outlined. */
export function CastCoverageView({ items, selected, onSelect }: ViewProps) {
  const project = useProject()
  const c = castCoverage(project)
  const shown = new Set(items.map((i) => i.id))
  const cols = [...c.acts.map((a) => ({ id: a.id, label: nameOf(a) })), { id: '', label: 'No act' }]
  const max = Math.max(1, ...c.rows.flatMap((r) => Object.values(r.byAct)))
  return (
    <div className="stack npc-preview">
      <p className="muted">How many quests each character gives in each act. Outlined rows are Main characters who give none. Click a row to open the character.</p>
      <div className="table-wrap">
        <table className="grid matrix coverage">
          <thead>
            <tr><th>Character</th><th>Importance</th>{cols.map((col) => <th key={col.id || 'none'}>{col.label}</th>)}<th>Total</th></tr>
          </thead>
          <tbody>
            {c.rows.filter((r) => shown.has(r.character.id)).map((r) => {
              const idle = r.total === 0 && r.character.importance === 'Main'
              return (
                <tr key={r.character.id} className={'clickable' + (idle ? ' idle' : '') + (r.character.id === selected ? ' selected' : '')} onClick={() => onSelect(r.character.id)} data-testid={idle ? 'cast-idle' : undefined}>
                  <th>{nameOf(r.character)}</th>
                  <td className="muted">{r.character.importance ?? '—'}</td>
                  {cols.map((col) => {
                    const n = r.byAct[col.id] ?? 0
                    return <td key={col.id || 'none'} className="num cov-cell" style={n ? { background: `rgba(91,156,255,${0.15 + (0.5 * n) / max})` } : undefined}>{n || ''}</td>
                  })}
                  <td className="num">{r.total}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {c.factionsWithoutQuests.length > 0 && <p className="muted">Factions without a Faction quest: {c.factionsWithoutQuests.map(nameOf).join(', ')}</p>}
    </div>
  )
}
