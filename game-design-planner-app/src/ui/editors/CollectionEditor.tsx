import { useMemo, useState } from 'react'
import type { CollectionSection, CollectionView, Entity, FieldDef } from '../../core/model/types'
import { makeId } from '../../core/model/project'
import { AiBadge } from '../ai/AiBadge'
import { findUsages, resolveSource } from '../../core/references/refs'
import { downloadText } from '../../core/persistence/file'
import { sectionCsv } from '../../core/export/markdown'
import { getModule } from '../../core/modules/registry'
import { useSection, useProject } from '../hooks'
import { FieldInput, displayValue, isLongField } from '../FieldInput'
import { Link } from 'react-router-dom'
import { RadarView, Grid2dView, TimelineView, LadderView, ProgressionView, CompareView, RangesView, EconomyView } from './views'
import { NeedsBalanceView, StatPreviewView } from './npcViews'
import { GateReadiness } from './GateReadiness'

const VIEW_LABEL: Record<CollectionView['kind'], string> = {
  cards: 'Cards',
  table: 'Table',
  kanban: 'Board',
  radar: 'Radar',
  grid2d: 'Matrix',
  timeline: 'Timeline',
  ladder: 'Cut order',
  progression: 'Progression',
  compare: 'Compare',
  ranges: 'Ranges',
  economy: 'Estimate',
  statPreview: 'Preview',
  needsBalance: 'Needs balance',
}

export type ViewProps = {
  docId: string
  sec: CollectionSection
  items: Entity[]
  selected?: string
  onSelect: (id?: string) => void
  patch: (id: string, key: string, value: any) => void
}

export function CollectionEditor({ docId, sec }: { docId: string; sec: CollectionSection }) {
  const { data, update } = useSection<Entity[]>(docId, sec.id)
  const project = useProject()
  const [viewIdx, setViewIdx] = useState(0)
  const [selected, setSelected] = useState<string | undefined>()
  const [filter, setFilter] = useState('')
  const items = useMemo(() => data ?? [], [data])
  const view = sec.views[Math.min(viewIdx, sec.views.length - 1)] ?? { kind: 'cards' as const }

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return items
    return items.filter((e) => JSON.stringify(e).toLowerCase().includes(q))
  }, [items, filter])

  const add = (init: Record<string, any> = {}) => {
    const id = makeId()
    update((d) => {
      d.push({ id, name: `New ${sec.singular}`, ...init })
    })
    setSelected(id)
  }
  const patch = (id: string, key: string, value: any) =>
    update((d) => {
      const e = d.find((x) => x.id === id)
      if (e) {
        if (value === undefined) delete e[key]
        else e[key] = value
      }
    }, `${id}.${key}`)

  const props: ViewProps = { docId, sec, items: shown, selected, onSelect: setSelected, patch }
  const sel = items.find((e) => e.id === selected)

  return (
    <div className="collection">
      <div className="toolbar">
        <div className="tabs">
          {sec.views.map((vw, i) => (
            <button key={i} className={i === viewIdx ? 'active' : ''} onClick={() => setViewIdx(i)}>
              {VIEW_LABEL[vw.kind]}
            </button>
          ))}
        </div>
        <input className="search" placeholder="Filter…" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <span className="muted">{items.length} {sec.singular}(s)</span>
        <span className="spacer" />
        <button
          className="small"
          onClick={() => {
            const mod = getModule(docId)!
            const csv = sectionCsv(project, mod, sec)
            if (csv) downloadText(`${docId}.${sec.id}.csv`, csv, 'text/csv')
          }}
        >
          CSV
        </button>
        <button className="primary" onClick={() => add()}>+ Add {sec.singular}</button>
      </div>
      <div className={'collection-body' + (sel ? ' with-inspector' : '')}>
        <div className="view-area">
          {view.kind === 'cards' && <CardsView {...props} />}
          {view.kind === 'table' && <TableView {...props} columns={view.columns} />}
          {view.kind === 'kanban' && <KanbanView {...props} groupBy={view.groupBy} onAdd={add} />}
          {view.kind === 'radar' && <RadarView {...props} mapField={view.mapField} scale={view.scale} />}
          {view.kind === 'statPreview' && <StatPreviewView {...props} view={view} />}
          {view.kind === 'needsBalance' && <NeedsBalanceView {...props} view={view} />}
          {view.kind === 'grid2d' && <Grid2dView {...props} xField={view.xField} yField={view.yField} max={view.max} />}
          {view.kind === 'timeline' && <TimelineView {...props} view={view} />}
          {view.kind === 'ladder' && <LadderView {...props} orderField={view.orderField} linkFields={view.linkFields} />}
          {view.kind === 'progression' && <ProgressionView {...props} scaleField={view.scaleField} leadsField={view.leadsField} />}
          {view.kind === 'compare' && <CompareView {...props} valuesSection={view.valuesSection} columns={view.columns} />}
          {view.kind === 'ranges' && <RangesView {...props} view={view} />}
          {view.kind === 'economy' && <EconomyView />}
          {items.length === 0 && <p className="empty">Nothing here yet. Use “Add {sec.singular}”.</p>}
        </div>
        {sel && <Inspector docId={docId} sec={sec} entity={sel} patch={patch} onClose={() => setSelected(undefined)} setSelected={setSelected} />}
      </div>
    </div>
  )
}

function Inspector({
  docId,
  sec,
  entity,
  patch,
  onClose,
  setSelected,
}: {
  docId: string
  sec: CollectionSection
  entity: Entity
  patch: ViewProps['patch']
  onClose: () => void
  setSelected: (id?: string) => void
}) {
  const { update } = useSection<Entity[]>(docId, sec.id)
  const project = useProject()
  const usages = useMemo(() => findUsages(project, entity.id), [project, entity.id])

  const remove = () => {
    const msg = usages.length
      ? `“${entity.name}” is referenced ${usages.length} time(s). Delete anyway? (references will show as missing)`
      : `Delete “${entity.name}”?`
    if (!confirm(msg)) return
    update((d) => {
      const i = d.findIndex((x) => x.id === entity.id)
      if (i >= 0) d.splice(i, 1)
    })
    onClose()
  }
  const duplicate = () => {
    const id = makeId()
    update((d) => {
      const i = d.findIndex((x) => x.id === entity.id)
      d.splice(i + 1, 0, { ...JSON.parse(JSON.stringify(entity)), id, name: `${entity.name} (copy)` })
    })
    setSelected(id)
  }
  const move = (dir: -1 | 1) =>
    update((d) => {
      const i = d.findIndex((x) => x.id === entity.id)
      const j = i + dir
      if (j < 0 || j >= d.length) return
      ;[d[i], d[j]] = [d[j], d[i]]
    })

  return (
    <aside className="inspector">
      <div className="inspector-head">
        <strong>{sec.singular}</strong>
        <AiBadge entity={entity} />
        <span className="spacer" />
        <button className="icon" title="Move up" onClick={() => move(-1)}>↑</button>
        <button className="icon" title="Move down" onClick={() => move(1)}>↓</button>
        <button className="small" onClick={duplicate}>Duplicate</button>
        <button className="small danger" onClick={remove}>Delete</button>
        <button className="icon" onClick={onClose}>✕</button>
      </div>
      <div className="form">
        {fieldGroups(sec.fields).map(({ group, fields }) => {
          const body = fields.map((f) => (
            <div key={f.key} className={'field' + (f.type === 'boolean' ? ' inline' : '')}>
              <label htmlFor={`${docId}-${entity.id}-${f.key}`}>
                {f.label}
                {f.required && <span className="req"> *</span>}
              </label>
              <FieldInput
                id={`${docId}-${entity.id}-${f.key}`}
                describedBy={f.help ? `${docId}-${entity.id}-${f.key}-help` : undefined}
                field={f}
                value={entity[f.key]}
                docId={docId}
                onChange={(v) => patch(entity.id, f.key, v)}
              />
              {f.help && <small className="muted" id={`${docId}-${entity.id}-${f.key}-help`}>{f.help}</small>}
            </div>
          ))
          if (!group) return body
          const filled = fields.filter((f) => !isBlankValue(entity[f.key])).length
          return (
            <details key={group} className="field-group" open>
              <summary>
                {group} <span className="muted">{filled}/{fields.length}</span>
              </summary>
              {body}
            </details>
          )
        })}
        {docId === 'overview.roadmap' && sec.id === 'gates' && <GateReadiness entity={entity} />}
        <div className="field">
          <label>Used by</label>
          {usages.length === 0 ? (
            <span className="muted">Not referenced anywhere.</span>
          ) : (
            <ul className="usages">
              {usages.map((u, i) => (
                <li key={i}>
                  <Link to={`/doc/${u.docId}?s=${u.sectionId}`}>{u.docTitle} › {u.sectionTitle} › {u.entityLabel}</Link> <span className="muted">({u.field})</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </aside>
  )
}

const isBlankValue = (v: unknown) =>
  v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0) || (typeof v === 'object' && !Array.isArray(v) && Object.keys(v as object).length === 0)

/** Consecutive runs of fields that share a `group`; ungrouped fields form runs with `group` undefined. */
export function fieldGroups(fields: FieldDef[]): { group?: string; fields: FieldDef[] }[] {
  const out: { group?: string; fields: FieldDef[] }[] = []
  for (const f of fields) {
    const last = out[out.length - 1]
    if (last && last.group === f.group) last.fields.push(f)
    else out.push({ group: f.group, fields: [f] })
  }
  return out
}

function summary(project: ReturnType<typeof useProject>, docId: string, sec: CollectionSection, e: Entity) {
  return sec.fields
    .filter((f) => f.key !== 'name' && f.type !== 'color')
    .map((f) => ({ f, t: displayValue(project, docId, f, e) }))
    .filter((x) => x.t)
    .slice(0, 3)
}

function CardsView({ docId, sec, items, selected, onSelect }: ViewProps) {
  const project = useProject()
  const colorField = sec.fields.find((f) => f.type === 'color')
  return (
    <div className="cards">
      {items.map((e) => (
        <div key={e.id} className={'card' + (e.id === selected ? ' selected' : '')} onClick={() => onSelect(e.id)} style={colorField && e[colorField.key] ? { borderTopColor: e[colorField.key] } : undefined}>
          <div className="card-title">{e.name || <em>unnamed</em>}<AiBadge entity={e} /></div>
          {summary(project, docId, sec, e).map(({ f, t }) => (
            <div key={f.key} className="card-line">
              <span className="muted">{f.label}: </span>
              {t.length > 90 ? t.slice(0, 90) + '…' : t}
            </div>
          ))}
          {sec.fields.filter((f) => f.type === 'color').length > 1 && (
            <div className="swatches">
              {sec.fields.filter((f) => f.type === 'color' && e[f.key]).map((f) => <span key={f.key} style={{ background: e[f.key] }} />)}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function TableView({ docId, sec, items, selected, onSelect, patch, columns }: ViewProps & { columns?: string[] }) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null)
  const project = useProject()
  const cols: FieldDef[] = (columns ? columns.map((k) => sec.fields.find((f) => f.key === k)).filter(Boolean) : sec.fields.filter((f) => !isLongField(f) || f.type === 'multiref')) as FieldDef[]
  const rows = useMemo(() => {
    if (!sort) return items
    return [...items].sort((a, b) => {
      const f = sec.fields.find((x) => x.key === sort.key)!
      const av = displayValue(project, docId, f, a)
      const bv = displayValue(project, docId, f, b)
      const an = Number(av), bn = Number(bv)
      return (Number.isNaN(an) || Number.isNaN(bn) ? av.localeCompare(bv) : an - bn) * sort.dir
    })
  }, [items, sort, sec.fields, project, docId])

  return (
    <div className="table-wrap">
      <table className="grid">
        <thead>
          <tr>
            {cols.map((c) => (
              <th key={c.key} onClick={() => setSort((s) => (s?.key === c.key ? { key: c.key, dir: (s.dir * -1) as 1 | -1 } : { key: c.key, dir: 1 }))}>
                {c.label} {sort?.key === c.key ? (sort.dir === 1 ? '▲' : '▼') : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => (
            <tr key={e.id} className={e.id === selected ? 'selected' : ''} onClick={() => onSelect(e.id)}>
              {cols.map((c) => (
                <td key={c.key} onClick={(ev) => c.type !== 'text' && c.type !== 'number' && ev.stopPropagation()}>
                  {['text', 'number', 'enum', 'ref', 'boolean'].includes(c.type) ? (
                    <FieldInput field={c} value={e[c.key]} docId={docId} compact onChange={(v) => patch(e.id, c.key, v)} />
                  ) : (
                    <span className="cell-text">{displayValue(project, docId, c, e)}</span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function KanbanView({ docId, sec, items, selected, onSelect, patch, groupBy, onAdd }: ViewProps & { groupBy: string; onAdd: (init: Record<string, any>) => void }) {
  const project = useProject()
  const field = sec.fields.find((f) => f.key === groupBy)
  const [over, setOver] = useState<string | null>(null)
  if (!field) return <p className="empty">Group field “{groupBy}” not found.</p>
  const columns: { id: string; label: string }[] =
    field.type === 'enum' ? field.options.map((o) => ({ id: o, label: o })) : field.type === 'ref' ? resolveSource(project, docId, field.source) : []
  const all = [{ id: '', label: '— none —' }, ...columns]
  const known = new Set(columns.map((c) => c.id))

  return (
    <div className="kanban">
      {all.map((col) => {
        const list = items.filter((e) => (col.id === '' ? !e[groupBy] || !known.has(e[groupBy]) : e[groupBy] === col.id))
        if (col.id === '' && list.length === 0) return null
        return (
          <div
            key={col.id}
            className={'kanban-col' + (over === col.id ? ' over' : '')}
            onDragOver={(ev) => { ev.preventDefault(); setOver(col.id) }}
            onDragLeave={() => setOver(null)}
            onDrop={(ev) => {
              ev.preventDefault()
              setOver(null)
              const id = ev.dataTransfer.getData('text/plain')
              if (id) patch(id, groupBy, col.id || undefined)
            }}
          >
            <div className="kanban-head">
              <strong>{col.label}</strong> <span className="muted">{list.length}</span>
              {col.id !== '' && <button className="icon" title="Add here" onClick={() => onAdd({ [groupBy]: col.id })}>＋</button>}
            </div>
            {list.map((e) => (
              <div
                key={e.id}
                draggable
                onDragStart={(ev) => ev.dataTransfer.setData('text/plain', e.id)}
                className={'card small-card' + (e.id === selected ? ' selected' : '')}
                onClick={() => onSelect(e.id)}
              >
                <div className="card-title">{e.name}<AiBadge entity={e} /></div>
                {summary(project, docId, sec, e).filter((x) => x.f.key !== groupBy).slice(0, 2).map(({ f, t }) => (
                  <div key={f.key} className="card-line"><span className="muted">{f.label}: </span>{t.length > 50 ? t.slice(0, 50) + '…' : t}</div>
                ))}
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}
