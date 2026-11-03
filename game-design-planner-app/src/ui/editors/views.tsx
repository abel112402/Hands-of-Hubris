import { useEffect, useMemo, useRef, useState } from 'react'
import { Legend, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip } from 'recharts'
import type { CollectionView } from '../../core/model/types'
import { resolveSource } from '../../core/references/refs'
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

export function TimelineView({ items, onSelect, selected, patch, view }: ViewProps & { view: TLView }) {
  const { startField, durationField, depsField, unit } = view
  const [px, setPx] = useState(16)
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
  const endOf = (e: any) => (e[startField] ?? 0) + (e[durationField] ?? 0)
  const total = Math.max(10, ...rows.map(endOf)) + 4

  const critical = useMemo(() => {
    const set = new Set<string>()
    if (!depsField || rows.length === 0) return set
    const byId = new Map(rows.map((r) => [r.id, r]))
    const memo = new Map<string, { len: number; prev?: string }>()
    const visiting = new Set<string>()
    const longest = (id: string): { len: number; prev?: string } => {
      if (memo.has(id)) return memo.get(id)!
      if (visiting.has(id)) return { len: 0 }
      visiting.add(id)
      const e = byId.get(id)!
      let best: { len: number; prev?: string } = { len: e[durationField] ?? 0 }
      for (const d of (e[depsField] ?? []) as string[]) {
        if (!byId.has(d)) continue
        const r = longest(d)
        const len = r.len + (e[durationField] ?? 0)
        if (len > best.len) best = { len, prev: d }
      }
      visiting.delete(id)
      memo.set(id, best)
      return best
    }
    let endId = rows[0].id
    let bestLen = -1
    for (const r of rows) {
      const l = longest(r.id).len
      if (l > bestLen) {
        bestLen = l
        endId = r.id
      }
    }
    if (bestLen > 0 && rows.some((r) => ((r[depsField] ?? []) as string[]).length)) {
      for (let cur: string | undefined = endId; cur; cur = memo.get(cur)?.prev) set.add(cur)
    }
    return set
  }, [rows, depsField, durationField])

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

  return (
    <div className="timeline">
      <div className="row">
        <span className="muted">Zoom</span>
        <input type="range" min={3} max={48} value={px} onChange={(e) => setPx(Number(e.target.value))} />
        <span className="muted">Drag a bar to move it, drag its right edge to resize. Unit: {unit}.{depsField && critical.size > 0 ? ' Critical path highlighted.' : ''}</span>
      </div>
      <div className="tl-scroll">
        <div className="tl-canvas" style={{ width: LABEL_W + total * px, height: 28 + rows.length * ROW }}>
          {ticks.map((t) => (
            <div key={t} className="tl-tick" style={{ left: LABEL_W + t * px }}>
              <span>{t}</span>
            </div>
          ))}
          <svg className="tl-deps" width={LABEL_W + total * px} height={28 + rows.length * ROW}>
            {depsField &&
              rows.flatMap((r) =>
                ((r[depsField] ?? []) as string[]).filter((d) => index.has(d)).map((d) => {
                  const from = rows[index.get(d)!]
                  const x1 = LABEL_W + endOf(from) * px
                  const y1 = 28 + index.get(d)! * ROW + ROW / 2
                  const x2 = LABEL_W + (r[startField] ?? 0) * px
                  const y2 = 28 + index.get(r.id)! * ROW + ROW / 2
                  const mid = Math.max(x1 + 8, x2 - 8)
                  return (
                    <path
                      key={`${d}-${r.id}`}
                      d={`M${x1},${y1} L${mid},${y1} L${mid},${y2} L${x2},${y2}`}
                      className={critical.has(d) && critical.has(r.id) ? 'dep crit' : 'dep'}
                      fill="none"
                    />
                  )
                }),
              )}
          </svg>
          {rows.map((r, i) => (
            <div key={r.id} className="tl-row" style={{ top: 28 + i * ROW, height: ROW }}>
              <div className={'tl-label' + (r.id === selected ? ' selected' : '')} style={{ width: LABEL_W }} onClick={() => onSelect(r.id)} title={r.name}>
                {r.name}
              </div>
              <div
                className={'tl-bar' + (r.id === selected ? ' selected' : '') + (critical.has(r.id) ? ' crit' : '')}
                style={{
                  left: LABEL_W + (r[startField] ?? 0) * px,
                  width: Math.max(6, (r[durationField] ?? 0) * px),
                  background: r.color || undefined,
                }}
                onPointerDown={(e) => {
                  onSelect(r.id)
                  setDrag({ id: r.id, mode: 'move', x0: e.clientX, start: r[startField] ?? 0, dur: r[durationField] ?? 0 })
                }}
              >
                <span>{r[durationField] ?? 0}</span>
                <i
                  className="tl-handle"
                  onPointerDown={(e) => {
                    e.stopPropagation()
                    onSelect(r.id)
                    setDrag({ id: r.id, mode: 'resize', x0: e.clientX, start: r[startField] ?? 0, dur: r[durationField] ?? 0 })
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
