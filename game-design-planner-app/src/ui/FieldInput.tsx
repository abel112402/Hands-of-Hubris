import { useMemo } from 'react'
import type { ChecklistData, Entity, FieldDef } from '../core/model/types'
import { makeId } from '../core/model/project'
import { resolveSource } from '../core/references/refs'
import { tryEvaluate, variablesOf } from '../core/formula'
import { useProject } from './hooks'

export type FieldProps = {
  field: FieldDef
  value: any
  onChange: (v: any) => void
  docId: string
  compact?: boolean
  id?: string
  describedBy?: string
}

export function ChecklistItems({ items, onChange }: { items: ChecklistData['groups'][number]['items']; onChange: (v: typeof items) => void }) {
  const list = items ?? []
  return (
    <div className="stack-sm">
      {list.map((it, i) => (
        <div className="row" key={it.id}>
          <input type="checkbox" checked={it.done} onChange={(e) => onChange(list.map((x, j) => (j === i ? { ...x, done: e.target.checked } : x)))} />
          <input className="grow" value={it.text} onChange={(e) => onChange(list.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} />
          <button className="icon" title="Remove" onClick={() => onChange(list.filter((_, j) => j !== i))}>✕</button>
        </div>
      ))}
      <button className="small" onClick={() => onChange([...list, { id: makeId(), text: '', done: false }])}>+ Add item</button>
    </div>
  )
}

export function FieldInput({ field, value, onChange, docId, compact, id, describedBy }: FieldProps) {
  const project = useProject()
  const options = useMemo(
    () => (field.type === 'ref' || field.type === 'multiref' || field.type === 'map' ? resolveSource(project, docId, field.source) : []),
    [project, docId, field],
  )

  switch (field.type) {
    case 'text':
      return <input id={id} aria-describedby={describedBy} placeholder={field.placeholder} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
    case 'longtext':
      return <textarea id={id} aria-describedby={describedBy} placeholder={field.placeholder} rows={compact ? 2 : 4} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
    case 'number':
      return (
        <input
          id={id}
          aria-describedby={describedBy}
          type="number"
          value={value ?? ''}
          min={field.min}
          max={field.max}
          step={field.step ?? 1}
          onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
        />
      )
    case 'boolean':
      return <input id={id} aria-describedby={describedBy} type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />
    case 'enum':
      return (
        <select id={id} aria-describedby={describedBy} value={value ?? ''} onChange={(e) => onChange(e.target.value || undefined)}>
          <option value="">—</option>
          {field.options.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      )
    case 'ref':
      return (
        <select id={id} aria-describedby={describedBy} value={value ?? ''} onChange={(e) => onChange(e.target.value || undefined)}>
          <option value="">—</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
          {value && !options.some((o) => o.id === value) && <option value={value}>⚠ missing ({value})</option>}
        </select>
      )
    case 'multiref': {
      const sel: string[] = value ?? []
      const toggle = (id: string) => onChange(sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id])
      return (
        <div className="chips">
          {options.length === 0 && <span className="muted">No options available</span>}
          {options.map((o) => (
            <label key={o.id} className={'chip' + (sel.includes(o.id) ? ' on' : '')}>
              <input type="checkbox" checked={sel.includes(o.id)} onChange={() => toggle(o.id)} />
              {o.label}
            </label>
          ))}
          {sel.filter((id) => !options.some((o) => o.id === id)).map((id) => (
            <label key={id} className="chip bad">
              <input type="checkbox" checked onChange={() => toggle(id)} />⚠ {id}
            </label>
          ))}
        </div>
      )
    }
    case 'map': {
      const map: Record<string, number> = value ?? {}
      const set = (id: string, raw: string) => {
        const next = { ...map }
        if (raw === '') delete next[id]
        else next[id] = Number(raw)
        onChange(next)
      }
      return (
        <div className="map-grid">
          {options.length === 0 && <span className="muted">No options available</span>}
          {options.map((o) => (
            <label key={o.id}>
              <span>{o.label}</span>
              <input type="number" min={0} max={field.max} value={map[o.id] ?? ''} onChange={(e) => set(o.id, e.target.value)} />
            </label>
          ))}
        </div>
      )
    }
    case 'color':
      return (
        <div className="row">
          <input id={id} aria-describedby={describedBy} type="color" value={value || '#888888'} onChange={(e) => onChange(e.target.value)} />
          {value && <button className="small" onClick={() => onChange(undefined)}>clear</button>}
        </div>
      )
    case 'list':
      return (
        <textarea
          id={id}
          aria-describedby={describedBy}
          rows={compact ? 2 : 4}
          placeholder={field.placeholder ?? 'One entry per line'}
          value={(value ?? []).join('\n')}
          onChange={(e) => onChange(e.target.value === '' ? [] : e.target.value.split('\n'))}
        />
      )
    case 'formula': {
      const expr: string = value ?? ''
      const vars = Object.fromEntries(variablesOf(expr).map((n) => [n, 1]))
      const r = expr ? tryEvaluate(expr, vars) : null
      return (
        <div>
          <input id={id} aria-describedby={describedBy} value={expr} placeholder="e.g. base * (1 + level / 10)" onChange={(e) => onChange(e.target.value)} />
          {r && !r.ok && <div className="error-text">{r.error}</div>}
        </div>
      )
    }
    case 'checklist':
      return <ChecklistItems items={value ?? []} onChange={onChange} />
  }
}

export const isLongField = (f: FieldDef) => ['longtext', 'map', 'multiref', 'checklist', 'list'].includes(f.type)

export function displayValue(
  project: ReturnType<typeof useProject>,
  docId: string,
  f: FieldDef,
  e: Entity,
): string {
  const val = e[f.key]
  if (val === undefined || val === null || val === '') return ''
  switch (f.type) {
    case 'boolean':
      return val ? '✓' : ''
    case 'ref':
      return resolveSource(project, docId, f.source).find((i) => i.id === val)?.label ?? '⚠ ' + val
    case 'multiref': {
      const items = resolveSource(project, docId, f.source)
      return (val as string[]).map((id) => items.find((i) => i.id === id)?.label ?? '⚠').join(', ')
    }
    case 'map': {
      const items = resolveSource(project, docId, f.source)
      return Object.entries(val as Record<string, number>).map(([id, n]) => `${items.find((i) => i.id === id)?.label ?? '⚠'} ${n}`).join(', ')
    }
    case 'list':
      return (val as string[]).filter(Boolean).join(', ')
    case 'checklist': {
      const items = val as { done: boolean }[]
      return `${items.filter((i) => i.done).length}/${items.length}`
    }
    default:
      return String(val)
  }
}
