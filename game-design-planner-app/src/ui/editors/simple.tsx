import { Fragment, useMemo, useState } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { ChecklistData, FormulaData, MatrixData, SectionDef } from '../../core/model/types'
import { makeId } from '../../core/model/project'
import { resolveSource } from '../../core/references/refs'
import { tryEvaluate, variablesOf } from '../../core/formula'
import { useSection, useProject } from '../hooks'
import { FieldInput } from '../FieldInput'

export function FormEditor({ docId, sec }: { docId: string; sec: Extract<SectionDef, { kind: 'form' }> }) {
  const { data, update } = useSection<Record<string, any>>(docId, sec.id)
  const values = data ?? {}
  return (
    <div className="form wide">
      {sec.fields.map((f) => (
        <div key={f.key} className={'field' + (f.type === 'boolean' ? ' inline' : '')}>
          <label>{f.label}</label>
          <FieldInput
            field={f}
            value={values[f.key]}
            docId={docId}
            onChange={(v) =>
              update((d) => {
                if (v === undefined) delete d[f.key]
                else d[f.key] = v
              }, f.key)
            }
          />
        </div>
      ))}
    </div>
  )
}

export function MatrixEditor({ docId, sec }: { docId: string; sec: Extract<SectionDef, { kind: 'matrix' }> }) {
  const { data, update } = useSection<MatrixData>(docId, sec.id)
  const project = useProject()
  const rows = resolveSource(project, docId, sec.rows)
  const cols = resolveSource(project, docId, sec.cols)
  const cells = data?.cells ?? {}
  if (!rows.length || !cols.length)
    return <p className="empty">The matrix needs rows and columns. Add entries to the source list first (rows: {'catalog' in sec.rows ? sec.rows.catalog : sec.rows.section}, columns: {'catalog' in sec.cols ? sec.cols.catalog : sec.cols.section}).</p>

  const setCell = (r: string, c: string, v: string | number | undefined) =>
    update((d) => {
      if (v === undefined || v === '') delete d.cells[`${r}|${c}`]
      else d.cells[`${r}|${c}`] = v
    }, `${r}|${c}`)

  const heat = (v: unknown) => {
    if (sec.cell.type !== 'number' || typeof v !== 'number') return undefined
    const { min, max } = sec.cell
    if (min < 0) {
      const t = Math.max(-1, Math.min(1, v / Math.max(Math.abs(min), Math.abs(max))))
      return t >= 0 ? `rgba(83,194,139,${t * 0.6})` : `rgba(229,112,126,${-t * 0.6})`
    }
    const t = (v - min) / (max - min || 1)
    return `rgba(79,156,249,${Math.max(0, Math.min(1, t)) * 0.55})`
  }

  return (
    <div className="table-wrap">
      <table className="grid matrix">
        <thead>
          <tr>
            <th />
            {cols.map((c) => (
              <th key={c.id}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <th>{r.label}</th>
              {cols.map((c) => {
                const key = `${r.id}|${c.id}`
                const disabled = sec.diagonal === false && r.id === c.id
                return (
                  <td key={c.id} style={{ background: disabled ? 'transparent' : heat(cells[key]) }}>
                    {disabled ? (
                      <span className="muted">–</span>
                    ) : sec.cell.type === 'number' ? (
                      <input
                        type="number"
                        min={sec.cell.min}
                        max={sec.cell.max}
                        step="any"
                        value={cells[key] ?? ''}
                        onChange={(e) => setCell(r.id, c.id, e.target.value === '' ? undefined : Number(e.target.value))}
                      />
                    ) : (
                      <select value={String(cells[key] ?? '')} onChange={(e) => setCell(r.id, c.id, e.target.value)}>
                        <option value="">—</option>
                        {sec.cell.options.map((o) => (
                          <option key={o}>{o}</option>
                        ))}
                      </select>
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function ChecklistEditor({ docId, sec }: { docId: string; sec: Extract<SectionDef, { kind: 'checklist' }> }) {
  const { data, update } = useSection<ChecklistData>(docId, sec.id)
  const groups = data?.groups ?? []
  const all = groups.flatMap((g) => g.items)
  const done = all.filter((i) => i.done).length
  return (
    <div className="stack">
      <div className="progress" title={`${done}/${all.length}`}>
        <div style={{ width: all.length ? `${(done / all.length) * 100}%` : 0 }} />
        <span>{done}/{all.length}</span>
      </div>
      {groups.map((g, gi) => (
        <div className="panel" key={g.id}>
          <div className="row">
            <input className="grow title-input" value={g.title} onChange={(e) => update((d) => void (d.groups[gi].title = e.target.value), `g${g.id}`)} />
            <button className="small danger" onClick={() => update((d) => void d.groups.splice(gi, 1))}>Delete group</button>
          </div>
          {g.items.map((it, ii) => (
            <div className="row" key={it.id}>
              <input type="checkbox" checked={it.done} onChange={(e) => update((d) => void (d.groups[gi].items[ii].done = e.target.checked))} />
              <input className="grow" value={it.text} onChange={(e) => update((d) => void (d.groups[gi].items[ii].text = e.target.value), `i${it.id}`)} />
              <button className="icon" onClick={() => update((d) => void d.groups[gi].items.splice(ii, 1))}>✕</button>
            </div>
          ))}
          <button className="small" onClick={() => update((d) => void d.groups[gi].items.push({ id: makeId(), text: '', done: false }))}>+ Add item</button>
        </div>
      ))}
      <button className="primary" onClick={() => update((d) => void d.groups.push({ id: makeId(), title: 'New group', items: [] }))}>+ Add group</button>
    </div>
  )
}

/** Tiny safe Markdown renderer (headings, lists, bold, code); no raw HTML is ever injected. */
function inline(text: string) {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') && part.length > 4 ? <strong key={i}>{part.slice(2, -2)}</strong> : part.startsWith('`') && part.endsWith('`') && part.length > 2 ? <code key={i}>{part.slice(1, -1)}</code> : <Fragment key={i}>{part}</Fragment>,
  )
}
export function MarkdownPreview({ text }: { text: string }) {
  const lines = text.split('\n')
  return (
    <div className="md">
      {lines.map((l, i) => {
        const h = /^(#{1,4})\s+(.*)$/.exec(l)
        if (h) return h[1].length === 1 ? <h2 key={i}>{inline(h[2])}</h2> : h[1].length === 2 ? <h3 key={i}>{inline(h[2])}</h3> : <h4 key={i}>{inline(h[2])}</h4>
        if (/^\s*[-*]\s+/.test(l)) return <li key={i}>{inline(l.replace(/^\s*[-*]\s+/, ''))}</li>
        if (!l.trim()) return <br key={i} />
        return <p key={i}>{inline(l)}</p>
      })}
    </div>
  )
}

export function RichTextEditor({ docId, sec }: { docId: string; sec: Extract<SectionDef, { kind: 'richtext' }> }) {
  const { data, set } = useSection<string>(docId, sec.id)
  const [preview, setPreview] = useState(false)
  return (
    <div className="stack">
      <div className="tabs">
        <button className={!preview ? 'active' : ''} onClick={() => setPreview(false)}>Edit</button>
        <button className={preview ? 'active' : ''} onClick={() => setPreview(true)}>Preview</button>
      </div>
      {preview ? <MarkdownPreview text={data ?? ''} /> : <textarea rows={18} value={data ?? ''} onChange={(e) => set(e.target.value, 'richtext')} />}
    </div>
  )
}

export function FormulaEditor({ docId, sec }: { docId: string; sec: Extract<SectionDef, { kind: 'formulas' }> }) {
  const { data, update } = useSection<FormulaData>(docId, sec.id)
  const items = data?.items ?? []
  return (
    <div className="stack">
      {items.map((it, i) => (
        <FormulaCard key={it.id} item={it} onChange={(fn) => update((d) => fn(d.items[i]), it.id)} onDelete={() => update((d) => void d.items.splice(i, 1))} />
      ))}
      <button className="primary" onClick={() => update((d) => void d.items.push({ id: makeId(), name: 'New formula', expr: '', vars: {} }))}>+ Add formula</button>
    </div>
  )
}

function FormulaCard({ item, onChange, onDelete }: { item: FormulaData['items'][number]; onChange: (fn: (d: FormulaData['items'][number]) => void) => void; onDelete: () => void }) {
  const vars = useMemo(() => variablesOf(item.expr), [item.expr])
  const values = Object.fromEntries(vars.map((v) => [v, item.vars[v] ?? 1]))
  const result = item.expr ? tryEvaluate(item.expr, values) : null
  const [xVar, setXVar] = useState<string>('')
  const x = vars.includes(xVar) ? xVar : vars[0]
  const valuesKey = JSON.stringify(values)
  const series = useMemo(() => {
    if (!x || !item.expr) return []
    const base = Number(values[x]) || 1
    const out: { x: number; y: number | null }[] = []
    for (let i = 0; i <= 20; i++) {
      const xv = Math.round(((base * 2 * i) / 10) * 100) / 100
      const r = tryEvaluate(item.expr, { ...values, [x]: xv })
      out.push({ x: xv, y: r.ok ? r.value : null })
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.expr, valuesKey, x])

  return (
    <div className="panel">
      <div className="row">
        <input className="grow title-input" value={item.name} onChange={(e) => onChange((d) => void (d.name = e.target.value))} />
        <button className="small danger" onClick={onDelete}>Delete</button>
      </div>
      <input value={item.expr} placeholder="e.g. attack * (1 - resist)" onChange={(e) => onChange((d) => void (d.expr = e.target.value))} />
      <small className="muted">Operators + - * / ^ ( ), functions min max sqrt abs floor ceil round pow log.</small>
      <div className="map-grid">
        {vars.map((vn) => (
          <label key={vn}>
            <span>{vn}</span>
            <input type="number" step="any" value={item.vars[vn] ?? 1} onChange={(e) => onChange((d) => void (d.vars[vn] = Number(e.target.value)))} />
          </label>
        ))}
      </div>
      {result && (result.ok ? <div className="result">= {Math.round(result.value * 10000) / 10000}</div> : <div className="error-text">{result.error}</div>)}
      {series.length > 0 && (
        <>
          <div className="row">
            <span className="muted">Plot over</span>
            <select value={x} onChange={(e) => setXVar(e.target.value)}>
              {vars.map((vn) => <option key={vn}>{vn}</option>)}
            </select>
          </div>
          <div style={{ height: 180 }}>
            <ResponsiveContainer>
              <LineChart data={series}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334" />
                <XAxis dataKey="x" />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="y" stroke="#4f9cf9" dot={false} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  )
}
