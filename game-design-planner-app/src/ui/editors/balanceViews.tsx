import { useMemo } from 'react'
import { buildIR } from '../../core/engine/ir'
import { runChecks } from '../../core/engine/irExtras'
import { balanceRows, BALANCE_DOC, nameFromKey, unmatchedMeasurements, type BalanceRow } from '../../core/engine/metrics'
import { reportLabel, storedReport } from '../../core/engine/report'
import { makeId } from '../../core/model/project'
import { useStore } from '../../core/store/store'
import { countOf } from '../../core/text'
import { importEngineReport } from '../actions'
import { useProject } from '../hooks'
import type { ViewProps } from './CollectionEditor'

const fmt = (n: number | undefined, unit = '') => (n === undefined ? '—' : `${Math.round(n * 100) / 100}${unit ? ` ${unit}` : ''}`)
const STATE: Record<BalanceRow['state'], { icon: string; text: string; tone: string }> = {
  in: { icon: '✓', text: 'in range', tone: 'ok' },
  low: { icon: '▼', text: 'below range', tone: 'bad' },
  high: { icon: '▲', text: 'above range', tone: 'bad' },
  noRange: { icon: '·', text: 'no range set', tone: 'muted' },
  notMeasured: { icon: '–', text: 'not measured yet', tone: 'muted' },
  noKey: { icon: '–', text: 'no engine key', tone: 'muted' },
}

/**
 * Balance plan metrics with what the engine measured in playtests (PlannerMetrics in Unity, through the engine report):
 * target, acceptable range, the mean of the samples with their spread, and whether it is in range.
 */
export function BalanceMeasuredView({ selected, onSelect, patch }: ViewProps) {
  const project = useProject()
  const report = storedReport(project)
  const rows = balanceRows(project)
  const unmatched = unmatchedMeasurements(project)
  const add = (key: string) =>
    useStore.getState().mutate(
      (p) => {
        const doc = (p.documents[BALANCE_DOC] ??= { moduleVersion: 1, data: {} })
        if (!Array.isArray(doc.data.metrics)) doc.data.metrics = []
        doc.data.metrics.push({ id: makeId(), name: nameFromKey(key), key })
      },
      undefined,
      `Add metric ${key}`,
    )
  return (
    <div className="stack dd-view">
      <p className="muted">
        Each metric can name the key the game records it under (PlannerMetrics.Record in Unity). The engine report brings back the mean of the playtest samples; it is checked against “Acceptable from / to”. “Current” only changes when you take the measured value over.
      </p>
      {!report ? (
        <div className="engine-note" role="note">
          No engine report yet. Record values in the game, then in Unity: Tools ▸ Game Design Planner ▸ Write report for the planner, and here:{' '}
          <button className="link" onClick={() => void importEngineReport()}>Import engine report…</button>
        </div>
      ) : (
        <p className="muted">
          {reportLabel(report)} report of {new Date(report.generatedAt).toLocaleString()}: {countOf(report.metrics.length, 'measured key')}.
        </p>
      )}
      <div className="npc-scroll">
        <table className="balance-measured">
          <thead>
            <tr>
              <th scope="col">Metric</th>
              <th scope="col" className="num">Target</th>
              <th scope="col" className="num">Acceptable</th>
              <th scope="col" className="num">Current</th>
              <th scope="col" className="num">Measured</th>
              <th scope="col">State</th>
              <th scope="col">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const unit = String(r.metric.unit ?? '')
              const st = STATE[r.state]
              return (
                <tr key={r.metric.id} className={r.metric.id === selected ? 'selected' : undefined}>
                  <th scope="row">
                    <button className="link" onClick={() => onSelect(r.metric.id)}>{String(r.metric.name ?? '(unnamed)')}</button>
                    {r.key && <div className="muted"><code>{r.key}</code></div>}
                  </th>
                  <td className="num">{fmt(r.target, unit)}</td>
                  <td className="num">{r.min === undefined && r.max === undefined ? '—' : `${fmt(r.min)} – ${fmt(r.max)}`}</td>
                  <td className="num">{fmt(r.current, unit)}</td>
                  <td className="num">
                    {r.measured ? (
                      <>
                        <strong>{fmt(r.measured.value, unit)}</strong>
                        <div className="muted">
                          n = {r.measured.samples ?? '?'}
                          {r.measured.min !== undefined && r.measured.max !== undefined && ` · ${fmt(r.measured.min)}–${fmt(r.measured.max)}`}
                          {r.measured.build && ` · build ${r.measured.build}`}
                        </div>
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className={'balance-state ' + st.tone}>
                    <span aria-hidden="true">{st.icon} </span>
                    {st.text}
                    {r.offTarget !== undefined && <div className="muted">{`${r.offTarget >= 0 ? '+' : ''}${Math.round(r.offTarget * 100)} % vs target`}</div>}
                  </td>
                  <td>
                    {r.measured && Math.round(r.measured.value * 100) / 100 !== r.current && (
                      <button className="small" aria-label={`Use measured ${fmt(r.measured.value)} as current for ${String(r.metric.name)}`} onClick={() => patch(r.metric.id, 'current', Math.round(r.measured!.value * 100) / 100)}>
                        Use as current
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {unmatched.length > 0 && (
        <section aria-label="Measured but not planned" className="engine-map">
          <strong>{countOf(unmatched.length, 'measured key')} no metric names</strong>
          <ul className="engine-problems">
            {unmatched.map((m) => (
              <li key={m.key}>
                <code>{m.key}</code>: {fmt(m.value)} (n = {m.samples ?? '?'}){' '}
                <button className="small" onClick={() => add(m.key)}>Add as metric</button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

/**
 * Balance plan data checks run on the plan's own records (the engine tests run the same checks on the engine's assets):
 * per check, how many records it could check and which fall outside the range.
 */
export function BalanceChecksView({ items, selected, onSelect }: ViewProps) {
  const project = useProject()
  const { ir } = useMemo(() => buildIR(project), [project])
  const results = useMemo(() => new Map(runChecks(ir.checks, ir.records).map((r) => [r.check.id, r])), [ir])
  const broken = new Map(ir.checks.filter((c) => c.error).map((c) => [c.id, c.error!]))
  const range = (min: unknown, max: unknown) => (typeof min === 'number' || typeof max === 'number' ? `${fmt(typeof min === 'number' ? min : undefined)} – ${fmt(typeof max === 'number' ? max : undefined)}` : '—')
  return (
    <div className="stack dd-view">
      <p className="muted">
        Each check is run on the records the planner exports. The engine export turns the checks into tests (Unity: Test Runner › EditMode, “PlannerDataChecks”), which check the assets in the engine, also after someone tunes a value there.
      </p>
      {items.length === 0 ? (
        <p className="muted">No data checks yet. Add one, e.g. Enemy: “health / damage” acceptable from 3 to 20 (hits a player can take).</p>
      ) : (
        <div className="npc-scroll">
          <table className="balance-measured" aria-label="Data check results">
            <thead>
              <tr>
                <th scope="col">Check</th>
                <th scope="col">Expression</th>
                <th scope="col" className="num">Acceptable</th>
                <th scope="col">Result</th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => {
                const r = results.get(String(c.id))
                const error = broken.get(String(c.id))
                const schema = ir.schemas.find((s) => s.id === c.schema)
                const tone = error ? 'muted' : !r || r.checked === 0 ? 'muted' : r.outside.length ? (c.severity === 'Warning' ? 'warn' : 'bad') : 'ok'
                return (
                  <tr key={c.id} className={c.id === selected ? 'selected' : undefined}>
                    <th scope="row">
                      <button className="link" onClick={() => onSelect(c.id)}>{String(c.name || '(unnamed)')}</button>
                      {schema && <div className="muted">{schema.name}</div>}
                    </th>
                    <td><code>{String(c.expr ?? '')}</code></td>
                    <td className="num">{range(c.min, c.max)}</td>
                    <td className={'balance-state ' + tone}>
                      {error ? (
                        <>Not checked: {error}.</>
                      ) : !r || r.checked === 0 ? (
                        <>No record has all the values{r && r.skipped ? ` (${countOf(r.skipped, 'record')} skipped)` : ''}.</>
                      ) : r.outside.length === 0 ? (
                        <><span aria-hidden="true">✓ </span>{countOf(r.checked, 'record')} in range{r.skipped ? `, ${r.skipped} without values` : ''}.</>
                      ) : (
                        <>
                          <span aria-hidden="true">{c.severity === 'Warning' ? '▲ ' : '✗ '}</span>
                          {r.outside.length} of {countOf(r.checked, 'record')} outside:
                          <ul className="engine-problems">
                            {r.outside.slice(0, 5).map((o) => (
                              <li key={o.key}><code>{o.key}</code> = {fmt(o.value)}</li>
                            ))}
                            {r.outside.length > 5 && <li>… and {r.outside.length - 5} more</li>}
                          </ul>
                        </>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
