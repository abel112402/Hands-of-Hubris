import { useEffect, useMemo, useRef, useState } from 'react'
import { Legend, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip } from 'recharts'
import type { CollectionView, Entity, Source } from '../../core/model/types'
import { analyze, isMilestone, weekToDate, withBuffer } from '../../core/schedule'
import { resolveSource } from '../../core/references/refs'
import { pressure } from '../../core/difficulty'
import { analyzeRanges } from '../../core/diplomacy'
import { useProject } from '../hooks'
import type { ViewProps } from './CollectionEditor'

const PALETTE = ['#4f9cf9', '#f97b4f', '#53c28b', '#d86be0', '#f2c94c', '#5ad1d1', '#e5707e']

export function RadarView({ docId, sec, items, mapField }: ViewProps & { mapField: string }) {
  const project = useProject()
  const field = sec.fields.find((f) => f.key === mapField)
  const [picked, setPicked] = useState<string[] | null>(null)
  if (!field || field.type !== 'map') return <p className="empty">Map field “{mapField}” not found.</p>
  const axes = resolveSource(project, docId, field.source)
  const chosen = (picked ?? items.slice(0, 3).map((e) => e.id)).filter((id) => items.some((e) => e.id === id))
  const max = field.max ?? 10
  const data = axes.map((a) => {
    const row: Record<string, any> = { axis: a.label }
    for (const id of chosen) row[id] = items.find((e) => e.id === id)?.[mapField]?.[a.id] ?? 0
    return row
  })
  return (
    <div className="radar">
      <div className="chips">
        {items.map((e) => (
          <label key={e.id} className={'chip' + (chosen.includes(e.id) ? ' on' : '')}>
            <input
              type="checkbox"
              checked={chosen.includes(e.id)}
              onChange={() => setPicked(chosen.includes(e.id) ? chosen.filter((x) => x !== e.id) : [...chosen, e.id])}
            />
            {e.name}
          </label>
        ))}
      </div>
      {axes.length < 3 ? (
        <p className="empty">Radar needs at least 3 entries in the “{field.label}” catalog.</p>
      ) : (
        <div style={{ height: 380 }}>
          <ResponsiveContainer>
            <RadarChart data={data}>
              <PolarGrid />
              <PolarAngleAxis dataKey="axis" />
              <PolarRadiusAxis domain={[0, max]} />
              {chosen.map((id, i) => (
                <Radar key={id} name={items.find((e) => e.id === id)?.name} dataKey={id} stroke={PALETTE[i % PALETTE.length]} fill={PALETTE[i % PALETTE.length]} fillOpacity={0.25} />
              ))}
              <Legend />
              <Tooltip />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

export function Grid2dView({ items, onSelect, selected, patch, xField, yField, max }: ViewProps & { xField: string; yField: string; max: number }) {
  const xs = Array.from({ length: max }, (_, i) => i + 1)
  const ys = [...xs].reverse()
  const color = (x: number, y: number) => {
    const t = (x * y) / (max * max)
    return `hsl(${120 - 120 * t}, 55%, ${28 + 8 * t}%)`
  }
  return (
    <div className="grid2d">
      <div className="axis-y">{yField}</div>
      {ys.map((y) => (
        <div key={y} className="g2-row">
          <span className="g2-label">{y}</span>
          {xs.map((x) => (
            <div
              key={x}
              className="g2-cell"
              style={{ background: color(x, y) }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                const id = e.dataTransfer.getData('text/plain')
                if (id) {
                  patch(id, xField, x)
                  patch(id, yField, y)
                }
              }}
            >
              {items
                .filter((e) => e[xField] === x && e[yField] === y)
                .map((e) => (
                  <span
                    key={e.id}
                    draggable
                    onDragStart={(ev) => ev.dataTransfer.setData('text/plain', e.id)}
                    className={'g2-item' + (e.id === selected ? ' selected' : '')}
                    onClick={() => onSelect(e.id)}
                    title={e.name}
                  >
                    {e.name}
                  </span>
                ))}
            </div>
          ))}
        </div>
      ))}
      <div className="g2-row">
        <span className="g2-label" />
        {xs.map((x) => (
          <span key={x} className="g2-label x">{x}</span>
        ))}
      </div>
      <div className="axis-x">{xField} →</div>
      {items.some((e) => !e[xField] || !e[yField]) && (
        <p className="muted">Unplaced: {items.filter((e) => !e[xField] || !e[yField]).map((e) => e.name).join(', ')} — set both values in the inspector.</p>
      )}
    </div>
  )
}

type TLView = Extract<CollectionView, { kind: 'timeline' }>
const ROW = 32
const LABEL_W = 190

export function TimelineView({ docId, items, onSelect, selected, patch, view }: ViewProps & { view: TLView }) {
  const { startField, durationField, depsField, unit, kindField, calendar, bands } = view
  const project = useProject()
  const [px, setPx] = useState(16)
  const [showDates, setShowDates] = useState(false)
  const [drag, setDrag] = useState<{ id: string; mode: 'move' | 'resize'; x0: number; start: number; dur: number } | null>(null)
  const dragRef = useRef(drag)
  useEffect(() => {
    dragRef.current = drag
  }, [drag])

  const rows = useMemo(
    () => [...items].sort((a, b) => (a[startField] ?? 0) - (b[startField] ?? 0)),
    [items, startField],
  )
  const index = new Map(rows.map((r, i) => [r.id, i]))
  const analysis = useMemo(
    () => analyze(rows, { start: startField, duration: durationField, deps: depsField ?? '', kind: kindField }),
    [rows, startField, durationField, depsField, kindField],
  )
  const spanOf = (id: string) => analysis.span.get(id) ?? { start: 0, end: 0 }
  const conflictKeys = new Set(analysis.conflicts.map((c) => `${c.dep}-${c.id}`))
  const conflicted = new Set(analysis.conflicts.map((c) => c.id))
  const critical = depsField ? analysis.critical : new Set<string>()

  const settings = calendar ? project.documents[docId]?.data[calendar.section] : undefined
  const startDate = settings?.[calendar?.startField ?? '']
  const buffer = settings?.[calendar?.bufferField ?? '']
  const hasDates = !!weekToDate(startDate, 0)
  const dates = showDates && hasDates
  const bufferedEnd = buffer ? withBuffer(analysis.end, buffer) : analysis.end
  const bandItems: Entity[] = bands ? project.documents[docId]?.data[bands.section] ?? [] : []
  const total = Math.max(10, Math.ceil(bufferedEnd), ...bandItems.map((b) => (b[bands!.startField] ?? 0) + (b[bands!.durationField] ?? 0))) + 4
  const height = 28 + rows.length * ROW

  useEffect(() => {
    if (!drag) return
    const move = (ev: PointerEvent) => {
      const d = dragRef.current
      if (!d) return
      const delta = Math.round((ev.clientX - d.x0) / px)
      if (d.mode === 'move') patch(d.id, startField, Math.max(0, d.start + delta))
      else patch(d.id, durationField, Math.max(0, d.dur + delta))
    }
    const up = () => setDrag(null)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [drag, px, patch, startField, durationField])

  const step = px >= 24 ? 1 : px >= 12 ? 2 : px >= 6 ? 5 : 10
  const ticks = Array.from({ length: Math.ceil(total / step) + 1 }, (_, i) => i * step)
  const tickLabel = (t: number) => (dates ? weekToDate(startDate, t)!.slice(2) : String(t))
  const summary = `Planned end: week ${analysis.end}${buffer ? `, with ${buffer}% buffer: week ${Math.ceil(bufferedEnd)}` : ''}${
    hasDates ? ` (${weekToDate(startDate, analysis.end)}${buffer ? ` → ${weekToDate(startDate, Math.ceil(bufferedEnd))}` : ''})` : ''
  }.`

  return (
    <div className="timeline">
      <div className="row">
        <span className="muted">Zoom</span>
        <input type="range" min={3} max={48} value={px} onChange={(e) => setPx(Number(e.target.value))} />
        {calendar && (
          <label className="row" title={hasDates ? '' : 'Set a project start date in Assumptions'}>
            <input type="checkbox" checked={dates} disabled={!hasDates} onChange={(e) => setShowDates(e.target.checked)} /> Calendar dates
          </label>
        )}
        <span className="muted">
          Drag a bar to move it, drag its right edge to resize. Unit: {unit}.{depsField && critical.size > 0 ? ' Critical path highlighted.' : ''}
        </span>
      </div>
      <div className="muted tl-summary">
        {summary}
        {analysis.conflicts.length > 0 && <span className="error-text"> {analysis.conflicts.length} dependency conflict(s).</span>}
        {analysis.cycles.length > 0 && <span className="error-text"> Dependency cycle detected.</span>}
        {analysis.missing.length > 0 && <span> {analysis.missing.length} item(s) without start or duration.</span>}
      </div>
      <div className="tl-scroll">
        <div className="tl-canvas" style={{ width: LABEL_W + total * px, height }}>
          {bandItems.map((b) => (
            <div
              key={b.id}
              className="tl-band"
              style={{
                left: LABEL_W + (b[bands!.startField] ?? 0) * px,
                width: (b[bands!.durationField] ?? 0) * px,
                height,
                background: b.color || undefined,
              }}
              title={b.name}
            >
              <span>{b.name}</span>
            </div>
          ))}
          {ticks.map((t) => (
            <div key={t} className="tl-tick" style={{ left: LABEL_W + t * px }}>
              <span>{tickLabel(t)}</span>
            </div>
          ))}
          {buffer ? <div className="tl-buffer" style={{ left: LABEL_W + analysis.end * px, width: (bufferedEnd - analysis.end) * px, height }} title={`${buffer}% buffer`} /> : null}
          <svg className="tl-deps" width={LABEL_W + total * px} height={height}>
            {depsField &&
              rows.flatMap((r) =>
                ((r[depsField] ?? []) as string[]).filter((d) => index.has(d)).map((d) => {
                  const x1 = LABEL_W + spanOf(d).end * px
                  const y1 = 28 + index.get(d)! * ROW + ROW / 2
                  const x2 = LABEL_W + spanOf(r.id).start * px
                  const y2 = 28 + index.get(r.id)! * ROW + ROW / 2
                  const mid = Math.max(x1 + 8, x2 - 8)
                  const cls = conflictKeys.has(`${d}-${r.id}`) ? 'dep conflict' : critical.has(d) && critical.has(r.id) ? 'dep crit' : 'dep'
                  return <path key={`${d}-${r.id}`} d={`M${x1},${y1} L${mid},${y1} L${mid},${y2} L${x2},${y2}`} className={cls} fill="none" />
                }),
              )}
          </svg>
          {rows.map((r, i) => {
            const milestone = isMilestone(r, kindField)
            const span = spanOf(r.id)
            const slack = analysis.slack.get(r.id) ?? 0
            return (
              <div key={r.id} className="tl-row" style={{ top: 28 + i * ROW, height: ROW }}>
                <div className={'tl-label' + (r.id === selected ? ' selected' : '')} style={{ width: LABEL_W }} onClick={() => onSelect(r.id)} title={r.name}>
                  {r.name}
                </div>
                <div
                  className={
                    'tl-bar' + (milestone ? ' milestone' : '') + (r.id === selected ? ' selected' : '') + (critical.has(r.id) ? ' crit' : '') + (conflicted.has(r.id) ? ' conflict' : '')
                  }
                  title={`${r.name}: week ${span.start}–${span.end}${depsField ? `, slack ${slack}` : ''}`}
                  style={{
                    left: LABEL_W + span.start * px - (milestone ? 8 : 0),
                    width: milestone ? 16 : Math.max(6, (span.end - span.start) * px),
                    background: r.color || undefined,
                  }}
                  onPointerDown={(e) => {
                    onSelect(r.id)
                    setDrag({ id: r.id, mode: 'move', x0: e.clientX, start: r[startField] ?? 0, dur: r[durationField] ?? 0 })
                  }}
                >
                  {!milestone && <span>{r[durationField] ?? 0}</span>}
                  {!milestone && (
                    <i
                      className="tl-handle"
                      onPointerDown={(e) => {
                        e.stopPropagation()
                        onSelect(r.id)
                        setDrag({ id: r.id, mode: 'resize', x0: e.clientX, start: r[startField] ?? 0, dur: r[durationField] ?? 0 })
                      }}
                    />
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export function LadderView({ docId, sec, items, onSelect, selected, orderField, linkFields }: ViewProps & { orderField: string; linkFields?: string[] }) {
  const project = useProject()
  const rows = useMemo(
    () => [...items].sort((a, b) => (a[orderField] ?? Infinity) - (b[orderField] ?? Infinity)),
    [items, orderField],
  )
  const links = (e: Entity) =>
    (linkFields ?? []).flatMap((key) => {
      const f = sec.fields.find((x) => x.key === key)
      if (!f || f.type !== 'multiref') return []
      const options = resolveSource(project, docId, f.source)
      return ((e[key] ?? []) as string[]).map((id) => options.find((o) => o.id === id)?.label ?? '⚠ missing')
    })
  return (
    <ol className="ladder">
      {rows.map((e) => (
        <li key={e.id} className={e.id === selected ? 'selected' : ''} onClick={() => onSelect(e.id)}>
          <strong>{e[orderField] ?? '–'}. {e.name}</strong>
          {e.description && <div className="muted">{e.description}</div>}
          {links(e).length > 0 && <div className="chips">{links(e).map((l, i) => <span key={i} className="chip on">{l}</span>)}</div>}
        </li>
      ))}
    </ol>
  )
}

/** Columns per time scale, showing how short loops build toward longer ones. */
export function ProgressionView({ sec, items, onSelect, selected, scaleField, leadsField }: ViewProps & { scaleField: string; leadsField: string }) {
  const scale = sec.fields.find((f) => f.key === scaleField)
  const columns = scale?.type === 'enum' ? scale.options : []
  const byId = new Map(items.map((e) => [e.id, e]))
  const loose = items.filter((e) => !columns.includes(e[scaleField]))
  const cols = loose.length ? [...columns, ''] : columns
  const step = (label: string, text?: string) => (text ? <div className="prog-step"><span className="muted">{label}</span> {text}</div> : null)
  return (
    <div className="progression">
      {cols.map((c) => (
        <div key={c || 'none'} className="prog-col">
          <h4>{c || 'No time scale'}</h4>
          {items
            .filter((e) => (columns.includes(e[scaleField]) ? e[scaleField] : '') === c)
            .map((e) => (
              <div key={e.id} className={'prog-card' + (e.id === selected ? ' selected' : '')} onClick={() => onSelect(e.id)}>
                <strong>{e.name || '(unnamed)'}</strong>
                {step('Action', e.action)}
                {step('Reward', e.reward)}
                {step('Then', e.nextDecision)}
                {step('Shifts', e.choiceShift)}
                {((e[leadsField] ?? []) as string[]).length > 0 && (
                  <div className="chips">
                    {(e[leadsField] as string[]).map((id) => <span key={id} className="chip on">→ {byId.get(id)?.name ?? '⚠ missing'}</span>)}
                  </div>
                )}
              </div>
            ))}
        </div>
      ))}
    </div>
  )
}

/** Radar of how hard each preset is per parameter. Values are scaled to each parameter's own range, so units can mix. */
export function CompareView({ docId, items, valuesSection, columns }: ViewProps & { valuesSection: string; columns: Source }) {
  const project = useProject()
  const levels = resolveSource(project, docId, columns)
  const cells: Record<string, number | string> = project.documents[docId]?.data[valuesSection]?.cells ?? {}
  const scaled = items.filter((p) => typeof p.min === 'number' && typeof p.max === 'number' && p.max !== p.min)
  const skipped = items.filter((p) => !scaled.includes(p))
  const data = scaled.map((p) => {
    const row: Record<string, any> = { axis: p.name }
    for (const l of levels) {
      const t = pressure(p, cells[`${p.id}|${l.id}`])
      row[l.id] = t === null ? 0 : Math.round(Math.max(0, Math.min(1, t)) * 100)
    }
    return row
  })
  return (
    <div className="radar">
      <p className="muted">Each value is shown as a share of its parameter’s range; “higher = easier” parameters are flipped, so outward always means harder.</p>
      {scaled.length < 3 ? (
        <p className="empty">Comparison needs at least 3 parameters with a range (min and max).</p>
      ) : (
        <div style={{ height: 380 }}>
          <ResponsiveContainer>
            <RadarChart data={data}>
              <PolarGrid />
              <PolarAngleAxis dataKey="axis" />
              <PolarRadiusAxis domain={[0, 100]} />
              {levels.map((l, i) => (
                <Radar key={l.id} name={l.label} dataKey={l.id} stroke={PALETTE[i % PALETTE.length]} fill={PALETTE[i % PALETTE.length]} fillOpacity={0.2} />
              ))}
              <Legend />
              <Tooltip />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      )}
      {skipped.length > 0 && <p className="muted">Not shown (no range): {skipped.map((p) => p.name).join(', ')}</p>}
    </div>
  )
}

/** Levels laid out on the scale in order, with gaps and overlaps called out. */
export function RangesView({ docId, items, onSelect, selected, view }: ViewProps & { view: Extract<CollectionView, { kind: 'ranges' }> }) {
  const project = useProject()
  const sc = view.scale
  const settings = project.documents[docId]?.data[sc.section] ?? {}
  const lo = typeof settings[sc.minField] === 'number' ? settings[sc.minField] : sc.fallback[0]
  const hi = typeof settings[sc.maxField] === 'number' ? settings[sc.maxField] : sc.fallback[1]
  const scale: [number, number] = lo < hi ? [lo, hi] : sc.fallback
  const a = analyzeRanges(items, scale, view.minField, view.maxField)
  const span = scale[1] - scale[0] || 1
  const pos = (v: number) => `${Math.max(0, Math.min(100, ((v - scale[0]) / span) * 100))}%`
  return (
    <div className="ranges">
      <div className="muted">Scale {scale[0]} to {scale[1]}</div>
      {a.rows.map((r) => (
        <div key={r.id} className={'range-row' + (r.id === selected ? ' selected' : '')} onClick={() => onSelect(r.id)}>
          <span className="range-name">{r.name || '(unnamed)'}</span>
          <div className="range-track">
            <div className={'range-bar' + (r.overlaps ? ' overlap' : '')} style={{ left: pos(r.from), width: `calc(${pos(r.to)} - ${pos(r.from)})` }} />
          </div>
          <span className="muted">{r.from} to {r.to}{r.open ? ' (to next level)' : ''}</span>
          {r.overlaps && <span className="pill warning">overlaps previous</span>}
          {r.gapBefore && <span className="pill warning">gap before</span>}
        </div>
      ))}
      {a.rows.length > 0 && a.gapAtBottom && <p className="muted">Values below {a.rows[0].from} have no level.</p>}
      {a.rows.length > 0 && a.gapAtTop && <p className="muted">Values above {a.rows[a.rows.length - 1].to} have no level.</p>}
      {a.unset.length > 0 && <p className="muted">No minimum yet: {a.unset.map((l) => l.name || '(unnamed)').join(', ')}</p>}
    </div>
  )
}
