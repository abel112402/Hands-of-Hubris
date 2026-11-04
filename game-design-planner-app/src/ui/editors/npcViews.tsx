import { useMemo, useState } from 'react'
import type { CollectionView, Entity } from '../../core/model/types'
import { evaluateFor, EXTRA_VARS, needsBalance, statVar } from '../../core/npc'
import { resolveSource } from '../../core/references/refs'
import { useProject } from '../hooks'
import type { ViewProps } from './CollectionEditor'

const fmt = (n: number) => (Math.round(n * 100) / 100).toString()

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
