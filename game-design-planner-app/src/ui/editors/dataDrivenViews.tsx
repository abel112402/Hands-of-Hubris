import { useState, type KeyboardEvent } from 'react'
import {
  dataList,
  dataModel,
  DATA_DOC,
  idCasing,
  loadPlan,
  makeRecordId,
  nameOf,
  pipelineReadiness,
  READINESS_STEPS,
  recordCount,
  sampleRecord,
  sourceOf,
  validateRecord,
  validatorsByStage,
  type FieldSpec,
} from '../../core/dataDriven'
import { countOf } from '../../core/text'
import { useProject } from '../hooks'
import type { ViewProps } from './CollectionEditor'

/** Series palette (the only hard-coded colours, as in the other planners). */
const COLORS = ['#4f9cf9', '#53c28b', '#f2c94c', '#f97b4f', '#d86be0', '#5ad1d1', '#e5707e', '#a3a8ff']
const ids = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const fmt = (n: number) => (n >= 10 ? Math.round(n).toString() : (Math.round(n * 100) / 100).toString())
const short = (s: string, n = 26) => (s.length > n ? s.slice(0, n - 1) + '…' : s)
const keyActivate = (fn: () => void) => (e: KeyboardEvent) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    fn()
  }
}
const typeLabel = (f: FieldSpec) => (f.type ? f.type : '?')

// ---- Data model ----

/** Every schema as a box of typed fields, with an arrow from each reference field to the schema it points at. */
export function DataModelView({ items, selected, onSelect }: ViewProps) {
  const project = useProject()
  const [focus, setFocus] = useState<string | null>(null)
  const model = dataModel(project)
  const formats = new Map(dataList(project, 'formats').map((f) => [f.id, f]))
  const shown = new Set(items.map((i) => i.id))
  const nodes = model.nodes.filter((n) => shown.has(n.schema.id))
  if (!nodes.length) return null
  const BW = 220
  const HEAD = 30
  const ROW = 18
  const GX = 70
  const GY = 40
  const cols = Math.min(3, nodes.length)
  const color = new Map(model.nodes.map((n, i) => [n.schema.id, COLORS[i % COLORS.length]]))
  const heights = nodes.map((n) => HEAD + Math.max(1, n.fields.length) * ROW + 10)
  const rowH: number[] = []
  nodes.forEach((_, i) => (rowH[Math.floor(i / cols)] = Math.max(rowH[Math.floor(i / cols)] ?? 0, heights[i])))
  const pos = new Map<string, { x: number; y: number; h: number }>()
  nodes.forEach((n, i) => {
    const r = Math.floor(i / cols)
    pos.set(n.schema.id, { x: 20 + (i % cols) * (BW + GX), y: 16 + rowH.slice(0, r).reduce((a, b) => a + b + GY, 0), h: heights[i] })
  })
  const W = 40 + cols * BW + (cols - 1) * GX
  const H = 32 + rowH.reduce((a, b) => a + b + GY, 0) - GY
  const active = focus ?? selected ?? null
  const related = (id: string) => !active || id === active || model.edges.some((e) => (e.from.id === active && e.to.id === id) || (e.to.id === active && e.from.id === id))
  const fieldIndex = (schemaId: string, f: FieldSpec) => model.nodes.find((n) => n.schema.id === schemaId)!.fields.indexOf(f)
  return (
    <div className="stack dd-view">
      <p className="muted">
        Each box is a schema; <strong>bold</strong> fields are required, <em>italic</em> optional. A field whose type names another schema is a reference and draws an arrow (double line = a list). Hover a box to see only its links; click a reference to jump to its schema.
      </p>
      <div className="npc-scroll">
        <svg viewBox={`0 0 ${W} ${H}`} width={W} className="arch-svg" role="img" aria-label="Data model">
          {model.edges.map((e, i) => {
            const a = pos.get(e.from.id)
            const b = pos.get(e.to.id)
            if (!a || !b) return null
            const y1 = a.y + HEAD + fieldIndex(e.from.id, e.field) * ROW + ROW / 2 + 2
            const self = e.from.id === e.to.id
            const right = b.x >= a.x
            const x1 = right ? a.x + BW : a.x
            const x2 = self ? a.x + BW : right && b.x > a.x ? b.x : b.x + BW
            const y2 = b.y + HEAD / 2
            const bend = self ? 40 : right && b.x > a.x ? 30 : -30
            const d = self ? `M${x1},${y1} C${x1 + bend},${y1} ${x2 + bend},${y2} ${x2},${y2}` : b.x === a.x ? `M${x1},${y1} C${x1 + 50},${y1} ${x2 + 50},${y2} ${x2},${y2}` : `M${x1},${y1} C${x1 + bend},${y1} ${x2 - bend},${y2} ${x2},${y2}`
            const dim = active && e.from.id !== active && e.to.id !== active
            return (
              <g key={i} className={'dd-edge' + (dim ? ' dim' : '')}>
                <path d={d} stroke={color.get(e.to.id)} strokeWidth={e.field.array ? 4 : 2} />
                {e.field.array && <path d={d} stroke="var(--panel)" strokeWidth={1.2} />}
                <circle cx={x2} cy={y2} r={4} fill={color.get(e.to.id)} />
              </g>
            )
          })}
          {nodes.map((n) => {
            const p = pos.get(n.schema.id)!
            const fm = formats.get(n.schema.format)
            const rc = recordCount(project, n.schema)
            return (
              <g
                key={n.schema.id}
                transform={`translate(${p.x},${p.y})`}
                className={'dd-box' + (n.schema.id === selected ? ' selected' : '') + (related(n.schema.id) ? '' : ' dim')}
                role="button"
                tabIndex={0}
                aria-label={`Schema ${nameOf(n.schema)}`}
                onClick={() => onSelect(n.schema.id)}
                onKeyDown={keyActivate(() => onSelect(n.schema.id))}
                onMouseEnter={() => setFocus(n.schema.id)}
                onMouseLeave={() => setFocus(null)}
              >
                <rect width={BW} height={p.h} rx={8} className="dd-box-bg" />
                <rect width={BW} height={HEAD} rx={8} fill={color.get(n.schema.id)} className="dd-box-head" />
                <text x={10} y={19} className="dd-box-title">{short(nameOf(n.schema), 18)}</text>
                <text x={BW - 10} y={19} textAnchor="end" className="dd-box-meta">{[fm ? nameOf(fm) : '', rc.count ? `×${rc.count}` : ''].filter(Boolean).join(' · ')}</text>
                {!n.fields.length && <text x={10} y={HEAD + 14} className="dd-field opt">no fields yet</text>}
                {n.fields.map((f, i) => (
                  <g
                    key={i}
                    transform={`translate(0,${HEAD + i * ROW + 4})`}
                    onClick={
                      f.target
                        ? (ev) => {
                            ev.stopPropagation()
                            onSelect(f.target!.id)
                          }
                        : undefined
                    }
                    className={f.target ? 'dd-ref' : undefined}
                  >
                    <text x={10} y={12} className={'dd-field' + (f.optional ? ' opt' : '')}>{short(f.name, 14)}</text>
                    <text x={BW - 10} y={12} textAnchor="end" className={'dd-type ' + f.kind} style={f.target ? { fill: color.get(f.target.id) } : undefined}>
                      {(f.kind === 'unknown' || f.kind === 'missing' ? '⚠ ' : '') + short(typeLabel(f), 16)}
                    </text>
                  </g>
                ))}
              </g>
            )
          })}
        </svg>
      </div>
      {model.problems.length > 0 && (
        <p className="warn">
          Unknown or missing types: {model.problems.map((x) => `${nameOf(x.schema)}.${x.field.name}${x.field.type ? ` (${x.field.type})` : ''}`).join(', ')}. Use a primitive (string, int, float, bool…), a Unity asset (Sprite, Prefab…) or another schema’s name.
        </p>
      )}
    </div>
  )
}

// ---- Record tester ----

/** A generated sample record for a schema, and a live checker for any record pasted in. */
export function RecordTesterView({ items, selected, onSelect }: ViewProps) {
  const project = useProject()
  const [pick, setPick] = useState<string | undefined>()
  const [text, setText] = useState('')
  const schema = items.find((s) => s.id === (pick ?? selected)) ?? items[0]
  if (!schema) return null
  const sample = JSON.stringify(sampleRecord(project, schema), null, 2)
  const issues = text.trim() ? validateRecord(project, schema, text) : []
  const errors = issues.filter((i) => i.level === 'error')
  const rc = recordCount(project, schema)
  const src = sourceOf(schema)
  const choose = (id: string) => {
    setPick(id)
    setText('')
    onSelect(id)
  }
  return (
    <div className="stack dd-view">
      <p className="muted">The sample is built from the schema’s fields, the ID prefix and the ID casing ({idCasing(project)}). Paste or edit a record on the right to check it the way an import validator would.</p>
      <div className="row">
        <label className="row" style={{ margin: 0, alignItems: 'center' }}>
          <span>Schema</span>
          <select aria-label="Schema to test" value={schema.id} onChange={(e) => choose(e.target.value)}>
            {items.map((s) => <option key={s.id} value={s.id}>{nameOf(s)}</option>)}
          </select>
        </label>
        <span className="pill">{rc.from === 'none' ? 'no record count' : `${rc.count} records${src && rc.from === 'planner' ? ` from ${src.label.split(' — ')[1]}` : ''}`}</span>
        {str(schema.idPrefix) && <span className="pill">IDs like <code>{makeRecordId(project, schema, 'Iron Sword')}</code></span>}
      </div>
      <div className="dd-tester">
        <div className="stack">
          <div className="row" style={{ margin: 0 }}>
            <strong>Sample record</strong>
            <span className="spacer" />
            <button className="small" onClick={() => setText(sample)}>Edit a copy →</button>
          </div>
          <pre className="code-sample dd-json" aria-label="Sample record">{sample}</pre>
        </div>
        <div className="stack">
          <strong>Your record</strong>
          <textarea aria-label="Record to check" className="dd-json" rows={12} spellCheck={false} placeholder='{ "id": "…" }' value={text} onChange={(e) => setText(e.target.value)} />
          {text.trim() && (
            <div className={'dd-result ' + (errors.length ? 'bad' : 'good')} role="status">
              {errors.length ? <strong>✗ {countOf(errors.length, 'error')}</strong> : <strong>✓ Valid {nameOf(schema)} record</strong>}
              <ul>
                {issues.map((i, n) => (
                  <li key={n} className={i.level === 'error' ? 'warn' : 'muted'}>
                    {i.field ? <code>{i.field}</code> : null} {i.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ---- Pipeline readiness ----

/** Schemas × the steps that make content safe to add without code. Click a schema to fix it in the inspector. */
export function PipelineReadinessView({ items, selected, onSelect }: ViewProps) {
  const project = useProject()
  const shown = new Set(items.map((i) => i.id))
  const { rows, total } = pipelineReadiness(project)
  const visible = rows.filter((r) => shown.has(r.schema.id))
  const stages = validatorsByStage(project)
  if (!visible.length) return null
  const gaps = READINESS_STEPS.map((s) => ({ ...s, missing: visible.filter((r) => !r.cells[s.id].ok).length })).sort((a, b) => b.missing - a.missing)
  return (
    <div className="stack dd-view">
      <p className="muted">
        A schema is ready when content designers can add records without a programmer: typed fields, a format, a unique ID prefix, validation, a load group, an editor tool, an Architecture extension point and real content in a design planner. Hover a cell for details.
      </p>
      <div className="table-wrap">
        <table className="grid dd-ready">
          <thead>
            <tr>
              <th>Schema</th>
              {READINESS_STEPS.map((s) => <th key={s.id}>{s.label}</th>)}
              <th>Ready</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.schema.id} className={r.schema.id === selected ? 'selected' : ''}>
                <th>
                  <button className="linklike" onClick={() => onSelect(r.schema.id)}>{nameOf(r.schema)}</button>
                </th>
                {READINESS_STEPS.map((s) => {
                  const c = r.cells[s.id]
                  return (
                    <td key={s.id} className={'dd-cell ' + (c.ok ? 'ok' : 'gap')} title={c.note} aria-label={`${nameOf(r.schema)} ${s.label}: ${c.note}`}>
                      {c.ok ? '✓' : '·'}
                    </td>
                  )
                })}
                <td>
                  <div className="dd-score" aria-hidden="true"><div style={{ width: `${(r.score / total) * 100}%` }} /></div>
                  <small className="muted">{r.score}/{total}</small>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th className="muted">Missing</th>
              {READINESS_STEPS.map((s) => <td key={s.id} className="num muted">{visible.filter((r) => !r.cells[s.id].ok).length}</td>)}
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      {gaps[0].missing > 0 && (
        <p className="muted">
          Biggest gap: <strong>{gaps[0].label}</strong> ({gaps[0].missing} of {visible.length} schemas).
        </p>
      )}
      <div className="dd-stages" aria-label="Validators by stage">
        {stages.map((s, i) => (
          <div key={s.stage} className="dd-stage">
            <strong>{s.stage}</strong>
            <small className="muted">{countOf(s.validators.length, 'validator')}</small>
            {i < stages.length - 1 && <span className="dd-stage-arrow" aria-hidden="true">→</span>}
          </div>
        ))}
      </div>
    </div>
  )
}

// ---- Load plan ----

/** Load groups on a timeline from boot to streaming, sized from record counts. The scale slider asks “what if we ship more content?”. */
export function LoadPlanView({ docId, items, selected, onSelect, patch }: ViewProps) {
  const project = useProject()
  const [scale, setScale] = useState(1)
  const plan = loadPlan(project, scale)
  const shown = new Set(items.map((i) => i.id))
  const groups = dataList(project, 'loadGroups')
  const color = new Map(dataList(project, 'schemas').map((s, i) => [s.id, COLORS[i % COLORS.length]]))
  const maxMb = Math.max(0.001, ...plan.phases.flatMap((ph) => ph.groups.map((g) => Math.max(g.mb, typeof g.group.budgetMb === 'number' ? g.group.budgetMb : 0))))
  if (!items.length || docId !== DATA_DOC) return null
  return (
    <div className="stack dd-view">
      <p className="muted">Groups load left to right: at boot, with each Technical Architecture scene (by load order), on demand, then streamed. Size = records × average record size; the line marks a group’s memory budget. Planning estimates only.</p>
      <div className="row dd-scale">
        <label htmlFor="dd-scale">Content scale</label>
        <input id="dd-scale" type="range" min={0.5} max={5} step={0.5} value={scale} onChange={(e) => setScale(Number(e.target.value))} aria-label="Content scale" />
        <strong>×{scale}</strong>
        <span className="muted">· {fmt(plan.totalMb)} MB in all · boot {fmt(plan.phases[0].mb)} MB</span>
      </div>
      <div className="dd-timeline">
        {plan.phases.map((ph, i) => (
          <div key={ph.id} className={'dd-phase' + (ph.id === 'scene?' ? ' warn-phase' : '')}>
            <div className="dd-phase-head">
              <strong>{ph.label}</strong>
              <small className="muted">{ph.id === 'boot' || ph.id === 'demand' || ph.id === 'stream' || ph.id === 'scene?' ? '' : 'scene · '}{fmt(ph.mb)} MB</small>
            </div>
            {!ph.groups.length && <small className="muted">Nothing preloaded.</small>}
            {ph.groups
              .filter((g) => shown.has(g.group.id))
              .map((g) => (
                <div
                  key={g.group.id}
                  className={'dd-group' + (g.group.id === selected ? ' selected' : '') + (g.over ? ' over' : '')}
                  role="button"
                  tabIndex={0}
                  aria-label={`Load group ${nameOf(g.group)}`}
                  onClick={() => onSelect(g.group.id)}
                  onKeyDown={keyActivate(() => onSelect(g.group.id))}
                >
                  <div className="row" style={{ margin: 0 }}>
                    <strong>{nameOf(g.group)}</strong>
                    <span className="spacer" />
                    <span className={g.over ? 'warn' : 'muted'}>{fmt(g.mb)}{typeof g.group.budgetMb === 'number' ? ` / ${fmt(g.group.budgetMb)}` : ''} MB</span>
                  </div>
                  <div className="dd-bar" aria-hidden="true">
                    {g.schemas.map((s) => <span key={s.schema.id} style={{ width: `${(s.kb / 1024 / maxMb) * 100}%`, background: color.get(s.schema.id) }} title={`${nameOf(s.schema)}: ${s.records} records, ${fmt(s.kb / 1024)} MB`} />)}
                    {typeof g.group.budgetMb === 'number' && <i style={{ left: `${(g.group.budgetMb / maxMb) * 100}%` }} />}
                  </div>
                  <div className="chips">
                    {g.schemas.map((s) => (
                      <span key={s.schema.id} className="chip">
                        <i className="npc-swatch" style={{ background: color.get(s.schema.id) }} /> {nameOf(s.schema)} ×{s.records}
                      </span>
                    ))}
                    {!g.schemas.length && <span className="muted">no schemas</span>}
                  </div>
                </div>
              ))}
            {i < plan.phases.length - 1 && <span className="dd-phase-arrow" aria-hidden="true">→</span>}
          </div>
        ))}
      </div>
      {plan.unassigned.length > 0 && (
        <div className="panel stack">
          <strong className="warn">{countOf(plan.unassigned.length, 'schema')} never loaded</strong>
          <div className="row" style={{ margin: 0 }}>
            {plan.unassigned.map((s) => (
              <label key={s.id} className="chip dd-assign">
                <i className="npc-swatch" style={{ background: color.get(s.id) }} /> {nameOf(s)}
                <select
                  aria-label={`Add ${nameOf(s)} to a load group`}
                  value=""
                  onChange={(e) => {
                    const g = groups.find((x) => x.id === e.target.value)
                    if (g) patch(g.id, 'schemas', [...ids(g.schemas), s.id])
                  }}
                >
                  <option value="">add to…</option>
                  {groups.map((g) => <option key={g.id} value={g.id}>{nameOf(g)}</option>)}
                </select>
              </label>
            ))}
          </div>
        </div>
      )}
      {plan.duplicated.length > 0 && <p className="warn">In more than one group (loaded twice): {plan.duplicated.map(nameOf).join(', ')}.</p>}
    </div>
  )
}

