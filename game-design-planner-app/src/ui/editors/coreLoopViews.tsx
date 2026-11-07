import { dayLength, formatMinutes, loopPacing } from '../../core/coreLoop'
import { useProject } from '../hooks'
import type { ViewProps } from './CollectionEditor'

const r1 = (n: number) => (n >= 10 ? Math.round(n) : Math.round(n * 10) / 10).toString()

/**
 * Loops by time scale with the real time one cycle takes (on a log scale), the same in in-game days,
 * and how many cycles fit into each longer loop they build toward.
 */
export function LoopPacingView({ items, selected, onSelect }: ViewProps) {
  const project = useProject()
  const shown = new Set(items.map((e) => e.id))
  const rows = loopPacing(project).filter((r) => shown.has(r.loop.id))
  const timed = rows.filter((r) => r.minutes !== undefined).map((r) => Math.log10(r.minutes!))
  const lo = Math.min(...timed, 0)
  const hi = Math.max(...timed, lo + 1)
  const day = dayLength(project)
  if (!rows.length) return <p className="empty">Add loops to compare their pacing.</p>
  return (
    <div className="stack">
      <p className="muted">
        Set “One cycle takes” on each loop to compare them. Bars use a log scale, so each step is ten times longer.{' '}
        {day ? `In-game days use the ${r1(day)}-minute day from Time & Weather.` : 'Set a day length in Time & Weather to see cycles in in-game days.'} A rough planning aid, not a play-time
        measurement.
      </p>
      <div className="table-wrap">
        <table className="grid loop-pacing">
          <thead>
            <tr>
              <th>Loop</th>
              <th>Time scale</th>
              <th>One cycle</th>
              <th>Builds toward</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.loop.id} className={'clickable' + (r.loop.id === selected ? ' selected' : '')} onClick={() => onSelect(r.loop.id)}>
                <td>{r.loop.name || '(unnamed)'}</td>
                <td className="muted">{r.loop.scale ?? '—'}</td>
                <td>
                  {r.minutes === undefined ? (
                    <span className="muted">not set</span>
                  ) : (
                    <>
                      <div className="bar-track" role="img" aria-label={`One cycle takes ${formatMinutes(r.minutes)}`}>
                        <div className="bar-fill" style={{ width: `${Math.max(3, (100 * (Math.log10(r.minutes) - lo)) / (hi - lo))}%` }} />
                      </div>
                      {formatMinutes(r.minutes)}
                      {r.days !== undefined && <span className="muted"> · {r1(r.days)} in-game day(s)</span>}
                    </>
                  )}
                </td>
                <td>
                  {r.links.length ? (
                    r.links.map((l) => (
                      <div key={l.to.id} className={l.inverted ? 'warn-text' : ''}>
                        {l.to.name}: {l.inverted ? 'not longer' : `×${r1(l.ratio)} cycles`}
                      </div>
                    ))
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
