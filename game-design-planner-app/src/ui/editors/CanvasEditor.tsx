import { useEffect, useRef, useState } from 'react'
import type { CanvasItem, SectionDef } from '../../core/model/types'
import { makeId } from '../../core/model/project'
import { useSection } from '../hooks'

type CSec = Extract<SectionDef, { kind: 'canvas' }>
const W = 1000
const H = 640
const SNAP = 10
const snap = (n: number) => Math.round(n / SNAP) * SNAP

export function CanvasEditor({ docId, sec }: { docId: string; sec: CSec }) {
  const { data, update } = useSection<{ items: CanvasItem[] }>(docId, sec.id)
  const items = data?.items ?? []
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

  return (
    <div className="graph-editor">
      <div className="toolbar">
        <select value={kind} onChange={(e) => setKind(e.target.value)}>
          {sec.itemKinds.map((k) => <option key={k}>{k}</option>)}
        </select>
        <button className="primary" onClick={add}>+ Add element</button>
        <span className="muted">Drag to move, drag the corner to resize (snaps to {SNAP}px).</span>
      </div>
      <div className="graph-body">
        <div className="canvas-scroll">
          <div className="canvas" style={{ width: W, height: H }} onPointerDown={() => setSel(null)}>
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
                <span>{it.label}</span>
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
    </div>
  )
}
