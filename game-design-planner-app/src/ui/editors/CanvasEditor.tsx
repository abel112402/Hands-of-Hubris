import { useEffect, useMemo, useRef, useState } from 'react'
import type { CanvasItem, SectionDef } from '../../core/model/types'
import { makeId } from '../../core/model/project'
import { resolveSource } from '../../core/references/refs'
import { useProject, useSection } from '../hooks'

type CSec = Extract<SectionDef, { kind: 'canvas' }>
const W = 1000
const H = 640
const SNAP = 10
const snap = (n: number) => Math.round(n / SNAP) * SNAP
const GRID = 100

export function CanvasEditor({ docId, sec }: { docId: string; sec: CSec }) {
  const { data, update } = useSection<{ items: CanvasItem[] }>(docId, sec.id)
  const project = useProject()
  const items = data?.items ?? []
  const [grid, setGrid] = useState(true)
  const entries = useMemo(() => (sec.zones ? resolveSource(project, docId, sec.zones.source) : []), [project, docId, sec.zones])
  const entryLabel = (it: CanvasItem) => entries.find((e) => e.id === it.refId)?.label
  const isZone = (it: CanvasItem) => !!sec.zones?.kinds.includes(it.kind)
  const settings = sec.scale ? project.documents[docId]?.data[sec.scale.section] : undefined
  const width = Number(settings?.[sec.scale?.widthField ?? '']) || 0
  const height = Number(settings?.[sec.scale?.heightField ?? '']) || 0
  const unit = String(settings?.[sec.scale?.unitField ?? ''] ?? '')
  const perPx = width > 0 ? width / W : 0
  const real = (px: number) => (perPx ? `${Math.round(px * perPx * 10) / 10}${unit ? ' ' + unit : ''}` : '')
  const [sel, setSel] = useState<string | null>(null)
  const [kind, setKind] = useState(sec.itemKinds[0])
  const [drag, setDrag] = useState<{ id: string; mode: 'move' | 'resize'; x0: number; y0: number; o: CanvasItem } | null>(null)
  const ref = useRef(drag)
  useEffect(() => {
    ref.current = drag
  }, [drag])

  useEffect(() => {
    if (!drag) return
    const move = (e: PointerEvent) => {
      const d = ref.current
      if (!d) return
      const dx = e.clientX - d.x0
      const dy = e.clientY - d.y0
      update((s) => {
        const it = s.items.find((x) => x.id === d.id)
        if (!it) return
        if (d.mode === 'move') {
          it.x = Math.max(0, Math.min(W - 20, snap(d.o.x + dx)))
          it.y = Math.max(0, Math.min(H - 20, snap(d.o.y + dy)))
        } else {
          it.w = Math.max(20, snap(d.o.w + dx))
          it.h = Math.max(20, snap(d.o.h + dy))
        }
      }, `cv-${d.id}`)
    }
    const up = () => setDrag(null)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [drag, update])

  const add = () => {
    const id = makeId()
    update((s) => void s.items.push({ id, kind, label: kind, x: 40, y: 40, w: kind === 'Frame' ? 400 : 120, h: kind === 'Frame' ? 300 : 40 }))
    setSel(id)
  }
  const item = items.find((i) => i.id === sel)
  const linked = new Set(items.filter(isZone).map((i) => i.refId))
  const unplaced = sec.zones ? entries.filter((e) => !linked.has(e.id)) : []
  const placeMissing = () =>
    update((s) => {
      const kind = sec.zones!.kinds[0]
      unplaced.forEach((e, i) => s.items.push({ id: makeId(), kind, label: e.label, refId: e.id, x: 40 + (i % 4) * 230, y: 40 + Math.floor(i / 4) * 150, w: 200, h: 120 }))
    })

  return (
    <div className="graph-editor">
      <div className="toolbar">
        <select value={kind} onChange={(e) => setKind(e.target.value)}>
          {sec.itemKinds.map((k) => <option key={k}>{k}</option>)}
        </select>
        <button className="primary" onClick={add}>+ Add element</button>
        <label className="muted"><input type="checkbox" checked={grid} onChange={(e) => setGrid(e.target.checked)} /> Grid</label>
        {unplaced.length > 0 && <button onClick={placeMissing} title="Add a zone for each entry that has none">Add zones for {unplaced.length} unplaced</button>}
        <span className="muted">Drag to move, drag the corner to resize (snaps to {SNAP}px).</span>
      </div>
      <div className="graph-body">
        <div className="canvas-scroll">
          {sec.scale && (
            <p className="muted">
              {perPx
                ? `Map ${width} × ${height || Math.round(H * perPx)}${unit ? ' ' + unit : ''}; one grid square is ${real(GRID)}.`
                : 'Set the map dimensions under Exploration to show real distances.'}
            </p>
          )}
          <div
            className="canvas"
            style={{
              width: W,
              height: H,
              backgroundImage: grid ? 'linear-gradient(var(--line) 1px, transparent 1px), linear-gradient(90deg, var(--line) 1px, transparent 1px)' : 'none',
              backgroundSize: `${GRID}px ${GRID}px`,
            }}
            onPointerDown={() => setSel(null)}
          >
            {items.map((it) => (
              <div
                key={it.id}
                className={`cv-item k-${it.kind.toLowerCase()}` + (it.id === sel ? ' selected' : '')}
                style={{ left: it.x, top: it.y, width: it.w, height: it.h, zIndex: it.kind === 'Frame' || it.kind === 'Biome zone' ? 0 : 1 }}
                onPointerDown={(e) => {
                  e.stopPropagation()
                  setSel(it.id)
                  setDrag({ id: it.id, mode: 'move', x0: e.clientX, y0: e.clientY, o: it })
                }}
              >
                <span title={perPx ? `${real(it.w)} × ${real(it.h)}` : undefined}>{entryLabel(it) ?? it.label}</span>
                <i
                  className="cv-handle"
                  onPointerDown={(e) => {
                    e.stopPropagation()
                    setSel(it.id)
                    setDrag({ id: it.id, mode: 'resize', x0: e.clientX, y0: e.clientY, o: it })
                  }}
                />
              </div>
            ))}
          </div>
        </div>
        {item && (
          <aside className="inspector">
            <div className="form">
              <div className="inspector-head">
                <strong>Element</strong><span className="spacer" />
                <button className="small danger" onClick={() => { update((s) => void (s.items = s.items.filter((x) => x.id !== item.id))); setSel(null) }}>Delete</button>
              </div>
              {isZone(item) && (
                <div className="field"><label>Linked entry</label>
                  <select
                    value={item.refId ?? ''}
                    onChange={(e) => update((s) => {
                      const it = s.items.find((x) => x.id === item.id)!
                      it.refId = e.target.value || undefined
                      const hit = entries.find((x) => x.id === e.target.value)
                      if (hit) it.label = hit.label
                    })}
                  >
                    <option value="">— not linked —</option>
                    {entries.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
                    {item.refId && !entries.some((e) => e.id === item.refId) && <option value={item.refId}>⚠ missing</option>}
                  </select>
                </div>
              )}
              <div className="field"><label>Label</label><input value={item.label} onChange={(e) => update((s) => void (s.items.find((x) => x.id === item.id)!.label = e.target.value), `cl-${item.id}`)} /></div>
              <div className="field"><label>Kind</label>
                <select value={item.kind} onChange={(e) => update((s) => void (s.items.find((x) => x.id === item.id)!.kind = e.target.value))}>
                  {sec.itemKinds.map((k) => <option key={k}>{k}</option>)}
                </select>
              </div>
              {(['x', 'y', 'w', 'h'] as const).map((k) => (
                <div className="field inline" key={k}><label>{k}</label>
                  <input type="number" value={item[k]} onChange={(e) => update((s) => void (s.items.find((x) => x.id === item.id)![k] = Number(e.target.value)), `cn-${item.id}${k}`)} />
                </div>
              ))}
            </div>
          </aside>
        )}
      </div>
      <div className="legend muted">
        {sec.itemKinds.map((k) => <span key={k} className={`cv-legend k-${k.toLowerCase()}`}>{k}</span>)}
      </div>
    </div>
  )
}
