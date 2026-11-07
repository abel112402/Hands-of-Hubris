import { useState } from 'react'
import { cutSavings, cutsToRecover, overload, phaseProgress, planEnd } from '../../core/roadmap'
import { useProject } from '../hooks'
import type { ViewProps } from './CollectionEditor'

const r1 = (n: number) => (Math.round(n * 10) / 10).toString()
const pct = (a: number, b: number) => (b > 0 ? Math.min(100, (100 * a) / b) : 0)

/** Per phase: tasks done, effort done against planned effort and capacity, and whether it is past its end. */
export function PhaseProgressView({ selected, onSelect }: ViewProps) {
  const project = useProject()
  // Read the clock once per mount; render stays pure.
  const [now] = useState(() => Date.now())
  const rows = phaseProgress(project, now)
  const { end, buffered } = planEnd(project)
  if (!rows.length) return <p className="empty">Add phases to see their progress.</p>
  return (
    <div className="stack">
      <p className="muted">
        Planned end: week {end}
        {buffered !== end ? `, with buffer week ${buffered}` : ''}. Progress counts tasks marked Done; effort is in person-weeks. A planning estimate, not a forecast.
      </p>
      <div className="table-wrap">
        <table className="grid roadmap-progress">
          <thead>
            <tr>
              <th>Phase</th>
              <th>Tasks done</th>
              <th>Effort done / planned / capacity</th>
              <th>Ends</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const scale = Math.max(r.effort, r.capacity ?? 0, 1)
              return (
                <tr key={r.phase.id} className={'clickable' + (r.phase.id === selected ? ' selected' : '')} onClick={() => onSelect(r.phase.id)}>
                  <td>{r.phase.name || '(unnamed)'}</td>
                  <td>
                    <div className="bar-track" role="img" aria-label={`${r.done} of ${r.tasks} tasks done`}>
                      <div className="bar-fill ok" style={{ width: `${pct(r.done, r.tasks)}%` }} />
                    </div>
                    <span className="muted">
                      {r.done}/{r.tasks}
                      {r.blocked ? ` · ${r.blocked} blocked` : ''}
                    </span>
                  </td>
                  <td>
                    <div className="bar-track" role="img" aria-label={`${r1(r.effortDone)} of ${r1(r.effort)} person-weeks done${r.capacity !== undefined ? `, capacity ${r1(r.capacity)}` : ''}`}>
                      <div className={'bar-fill' + (r.over ? ' danger' : '')} style={{ width: `${pct(r.effort, scale)}%` }} />
                      <div className="bar-fill ok overlay" style={{ width: `${pct(r.effortDone, scale)}%` }} />
                      {r.capacity !== undefined && <div className="bar-cap" style={{ left: `${pct(r.capacity, scale)}%` }} />}
                    </div>
                    <span className={r.over ? 'warn-text' : 'muted'}>
                      {r1(r.effortDone)} / {r1(r.effort)}
                      {r.capacity !== undefined ? ` / ${r1(r.capacity)}` : ''}
                      {r.over ? ' · over capacity' : ''}
                    </span>
                  </td>
                  <td className={r.late ? 'warn-text' : 'muted'}>{r.endDate ? `${r.endDate}${r.late ? ' · late' : ''}` : `week ${(r.phase.start ?? 0) + (r.phase.duration ?? 0)}`}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/** Cuts in order with the person-weeks each saves, against the current overload. */
export function CutSavingsView({ selected, onSelect }: ViewProps) {
  const project = useProject()
  const rows = cutSavings(project)
  const need = overload(project)
  const enough = cutsToRecover(project)
  if (!rows.length) return <p className="empty">Add cuts in the order you would make them.</p>
  const scale = Math.max(need, rows.at(-1)!.cumulative, 1)
  return (
    <div className="stack">
      <p className="muted">
        {need > 0
          ? enough
            ? `Tasks exceed phase capacity by ${r1(need)} person-weeks; the first ${enough} cut(s) recover it.`
            : `Tasks exceed phase capacity by ${r1(need)} person-weeks; all cuts together save ${r1(rows.at(-1)!.cumulative)}.`
          : 'No phase is over capacity. Savings show what each cut would free up.'}{' '}
        Savings come from the effort of affected open tasks unless a cut has its own estimate.
      </p>
      <div className="table-wrap">
        <table className="grid roadmap-cuts">
          <thead>
            <tr>
              <th>#</th>
              <th>Cut</th>
              <th>Saves</th>
              <th>Cumulative</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c, i) => (
              <tr key={c.cut.id} className={'clickable' + (c.cut.id === selected ? ' selected' : '') + (enough === i + 1 ? ' enough' : '')} onClick={() => onSelect(c.cut.id)}>
                <td className="num">{c.cut.order ?? '–'}</td>
                <td>{c.cut.name || '(unnamed)'}</td>
                <td className="num" title={c.source === 'manual' ? 'Own estimate' : c.source === 'tasks' ? 'From affected tasks' : 'No tasks or estimate'}>
                  {c.source === 'none' ? '—' : r1(c.saving)}
                  {c.source === 'manual' ? ' *' : ''}
                </td>
                <td>
                  <div className="bar-track" role="img" aria-label={`${r1(c.cumulative)} person-weeks saved so far`}>
                    <div className="bar-fill ok" style={{ width: `${pct(c.cumulative, scale)}%` }} />
                    {need > 0 && <div className="bar-cap" style={{ left: `${pct(need, scale)}%` }} />}
                  </div>
                  <span className="muted">{r1(c.cumulative)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted">* own estimate. The vertical line marks the overload to recover.</p>
    </div>
  )
}
