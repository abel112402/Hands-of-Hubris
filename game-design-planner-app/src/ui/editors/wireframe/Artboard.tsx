import { useCallback, useRef, useState } from 'react'
import {
  align,
  bounds,
  distribute,
  intersects,
  kindDef,
  nearestGaps,
  resizeRect,
  snapMove,
  textPx,
  withContents,
  type AlignMode,
  type Guide,
  type Handle,
  type Rect,
  type WireAction,
  type WireElement,
} from '../../../core/ui'
import { ElementBody } from './ElementBody'
import type { Editor } from './WireframeView'

const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
const SNAP_PX = 6

type Gesture =
  | { type: 'move'; ids: string[]; primary: string[]; start: Record<string, Rect>; x0: number; y0: number; moved: boolean }
  | { type: 'resize'; id: string; handle: Handle; start: Rect; x0: number; y0: number; moved: boolean }
  | { type: 'marquee'; p0: { x: number; y: number }; additive: boolean; base: string[]; moved: boolean }
  | { type: 'pan'; x0: number; y0: number; sl: number; st: number }

export type MenuAction = 'duplicate' | 'copy' | 'paste' | 'forward' | 'backward' | 'front' | 'back' | 'lock' | 'hide' | 'delete'

/** The scaled artboard: elements, selection, handles, smart guides, marquee, inline text editing, context menu and align bar. */
export function Artboard({ ed, onNavigate, onMenu, panning }: { ed: Editor; onNavigate: (a: WireAction) => void; onMenu: (a: MenuAction) => void; panning: boolean }) {
  const stageRef = useRef<HTMLDivElement | null>(null)
  const boardRef = useRef<HTMLDivElement>(null)
  // A stable ref callback: an inline one would be called with null and the element on every render, and the shell's
  // size observer would be torn down and rebuilt each time.
  const { onStage } = ed
  const stageCallback = useCallback(
    (el: HTMLDivElement | null) => {
      stageRef.current = el
      onStage(el)
    },
    [onStage],
  )
  const gesture = useRef<Gesture | null>(null)
  const draftRef = useRef<Record<string, Rect> | null>(null)
  const [draft, setDraftState] = useState<Record<string, Rect> | null>(null)
  const [guides, setGuides] = useState<Guide[]>([])
  const [gaps, setGaps] = useState<ReturnType<typeof nearestGaps>>([])
  const [marquee, setMarquee] = useState<Rect | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const { zoom, board, full, preview } = ed
  const offset = { x: Math.round((full.w - board.w) / 2), y: Math.round((full.h - board.h) / 2) }

  const setDraft = (d: Record<string, Rect> | null) => {
    draftRef.current = d
    setDraftState(d)
  }

  const toBoard = (cx: number, cy: number) => {
    const r = boardRef.current?.getBoundingClientRect()
    return { x: (cx - (r?.left ?? 0)) / zoom, y: (cy - (r?.top ?? 0)) / zoom }
  }
  const rectOf = (e: WireElement): Rect => draft?.[e.id] ?? e
  const others = (exclude: string[]) => ed.visible.filter((e) => !exclude.includes(e.id)).map(rectOf)
  const snapOpts = (exclude: string[], alt: boolean) => ({
    others: others(exclude),
    board: { x: 0, y: 0, w: board.w, h: board.h },
    safe: ed.showSafe ? ed.safe : undefined,
    grid: ed.showGrid ? ed.grid : 0,
    threshold: SNAP_PX / zoom,
    enabled: !alt,
  })

  const begin = (g: Gesture) => {
    gesture.current = g
    const move = (ev: PointerEvent) => onMove(ev)
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      onUp()
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const onMove = (ev: PointerEvent) => {
    const g = gesture.current
    if (!g) return
    if (g.type === 'pan') {
      const st = stageRef.current
      if (st) {
        st.scrollLeft = g.sl - (ev.clientX - g.x0)
        st.scrollTop = g.st - (ev.clientY - g.y0)
      }
      return
    }
    if (g.type === 'marquee') {
      const p = toBoard(ev.clientX, ev.clientY)
      const r = { x: Math.min(p.x, g.p0.x), y: Math.min(p.y, g.p0.y), w: Math.abs(p.x - g.p0.x), h: Math.abs(p.y - g.p0.y) }
      if (r.w + r.h < 4 / zoom && !g.moved) return
      g.moved = true
      setMarquee(r)
      const hit = ed.visible.filter((e) => !e.locked && intersects(r, e)).map((e) => e.id)
      ed.setSel(g.additive ? [...new Set([...g.base, ...hit])] : hit)
      return
    }
    const dx = (ev.clientX - g.x0) / zoom
    const dy = (ev.clientY - g.y0) / zoom
    if (!g.moved && Math.abs(dx) < 2 / zoom && Math.abs(dy) < 2 / zoom) return
    g.moved = true
    if (g.type === 'move') {
      const b0 = bounds(g.primary.map((id) => g.start[id]))
      const snapped = snapMove({ ...b0, x: b0.x + dx, y: b0.y + dy }, snapOpts(g.ids, ev.altKey))
      const ddx = snapped.rect.x - b0.x
      const ddy = snapped.rect.y - b0.y
      setDraft(Object.fromEntries(g.ids.map((id) => [id, { ...g.start[id], x: g.start[id].x + ddx, y: g.start[id].y + ddy }])))
      setGuides(snapped.guides)
      setGaps(nearestGaps(snapped.rect, others(g.ids)))
    } else {
      const r = resizeRect(g.start, g.handle, dx, dy, { ...snapOpts([g.id], ev.altKey), keepAspect: ev.shiftKey })
      setDraft({ [g.id]: r.rect })
      setGuides(r.guides)
      setGaps([])
    }
  }

  const onUp = () => {
    const g = gesture.current
    gesture.current = null
    const d = draftRef.current
    if (g && (g.type === 'move' || g.type === 'resize') && g.moved && d) {
      ed.write((els) => {
        for (const e of els) if (d[e.id]) Object.assign(e, d[e.id])
      }, ed.gestureKey())
    }
    if (g?.type === 'marquee' && !g.moved && !g.additive) ed.setSel([])
    setDraft(null)
    setGuides([])
    setGaps([])
    setMarquee(null)
  }

  const startPan = (e: React.PointerEvent) => {
    const st = stageRef.current
    if (!st) return
    e.preventDefault()
    begin({ type: 'pan', x0: e.clientX, y0: e.clientY, sl: st.scrollLeft, st: st.scrollTop })
  }

  const onElementDown = (e: React.PointerEvent, el: WireElement) => {
    if (preview) return
    if (panning || e.button === 1) return startPan(e)
    ed.focus()
    setMenu(null)
    if (el.locked) return onBoardDown(e)
    e.stopPropagation()
    if (e.button === 2) {
      if (!ed.sel.includes(el.id)) ed.setSel([el.id])
      return
    }
    let sel = ed.sel
    if (e.shiftKey) {
      sel = sel.includes(el.id) ? sel.filter((x) => x !== el.id) : [...sel, el.id]
      ed.setSel(sel)
      if (!sel.includes(el.id)) return
    } else if (!sel.includes(el.id)) {
      sel = [el.id]
      ed.setSel(sel)
    }
    const primary = sel.filter((id) => ed.elements.some((x) => x.id === id && !x.locked))
    const ids = withContents(ed.elements, primary, e.altKey)
    const start = Object.fromEntries(ed.elements.filter((x) => ids.includes(x.id)).map((x) => [x.id, { x: x.x, y: x.y, w: x.w, h: x.h }]))
    begin({ type: 'move', ids, primary, start, x0: e.clientX, y0: e.clientY, moved: false })
  }

  const onBoardDown = (e: React.PointerEvent) => {
    if (preview) return
    if (panning || e.button === 1) return startPan(e)
    if (e.button !== 0) return
    ed.focus()
    setMenu(null)
    setEditing(null)
    begin({ type: 'marquee', p0: toBoard(e.clientX, e.clientY), additive: e.shiftKey, base: ed.sel, moved: false })
  }

  const onHandleDown = (e: React.PointerEvent, el: WireElement, handle: Handle) => {
    e.stopPropagation()
    begin({ type: 'resize', id: el.id, handle, start: { x: el.x, y: el.y, w: el.w, h: el.h }, x0: e.clientX, y0: e.clientY, moved: false })
  }

  const onDrop = (e: React.DragEvent) => {
    const kind = e.dataTransfer.getData('application/x-wire-kind')
    if (!kind) return
    e.preventDefault()
    const p = toBoard(e.clientX, e.clientY)
    const d = kindDef(kind)
    ed.addElement(kind, p.x - d.w / 2, p.y - d.h / 2)
  }

  const editable = (el: WireElement) => kindDef(el.kind).text !== undefined || el.kind === 'panel'
  const selected = ed.elements.filter((e) => ed.sel.includes(e.id))
  const single = selected.length === 1 && !selected[0].locked ? selected[0] : null
  const selBounds = selected.length > 1 ? bounds(selected.map(rectOf)) : null
  const pins = ed.elements.filter((e) => e.note?.trim())
  const inv = 1 / zoom

  const doAlign = (mode: AlignMode | 'dx' | 'dy') => {
    const rects = selected.map((e) => ({ id: e.id, x: e.x, y: e.y, w: e.w, h: e.h }))
    const next = mode === 'dx' ? distribute(rects, 'x') : mode === 'dy' ? distribute(rects, 'y') : align(rects, mode)
    ed.write((els) => {
      for (const e of els) if (next[e.id]) Object.assign(e, next[e.id])
    }, ed.gestureKey())
  }

  return (
    <div
      ref={stageCallback}
      className={'wf-stage' + (panning ? ' panning' : '')}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      onContextMenu={(e) => {
        if (preview) return
        e.preventDefault()
        setMenu({ x: e.clientX, y: e.clientY })
      }}
    >
      {/* The 24 px padding adds the margin; the width is the scaled backdrop only, so “Fit” never overflows. */}
      <div className="wf-scroll" style={{ width: full.w * zoom, height: full.h * zoom }}>
        <div className="wf-backdrop" style={{ width: full.w * zoom, height: full.h * zoom }}>
          {ed.backdropSvg && <img className="wf-backdrop-img" alt="" src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(ed.backdropSvg)}`} />}
          <div
            ref={boardRef}
            className={'wf-board' + (ed.showGrid && !preview ? ' grid' : '') + (preview ? ' preview' : '')}
            role="application"
            aria-label={`Wireframe of ${ed.screenName}`}
            data-testid="wf-board"
            style={{
              width: board.w,
              height: board.h,
              left: offset.x * zoom,
              top: offset.y * zoom,
              transform: `scale(${zoom})`,
              backgroundSize: `${ed.grid}px ${ed.grid}px`,
              ['--z' as string]: zoom,
            }}
            onPointerDown={onBoardDown}
          >
            {ed.showSafe && !preview && <div className="wf-safe" style={{ left: ed.safe.x, top: ed.safe.y, width: ed.safe.w, height: ed.safe.h }} />}
            {ed.visible.map((el) => {
              const r = rectOf(el)
              const issues = ed.showChecks && !preview ? ed.issues.get(el.id) : undefined
              const level = issues?.some((i) => i.level === 'danger') ? 'danger' : issues?.some((i) => i.level === 'warn') ? 'warn' : undefined
              const nav = preview && el.action
              return (
                <div
                  key={el.id}
                  className={`wf-el k-${el.kind}` + (ed.sel.includes(el.id) && !preview ? ' selected' : '') + (el.locked ? ' locked' : '') + (level ? ` issue-${level}` : '') + (nav ? ' nav' : '')}
                  style={{ left: r.x, top: r.y, width: r.w, height: r.h }}
                  data-testid={`wf-el-${el.id}`}
                  aria-label={`${kindDef(el.kind).label}${el.text ? ` ${el.text}` : ''}`}
                  onPointerDown={(e) => onElementDown(e, el)}
                  onClick={nav ? () => onNavigate(el.action!) : undefined}
                  onDoubleClick={() => !preview && !el.locked && editable(el) && setEditing(el.id)}
                >
                  <ElementBody el={el} project={ed.project} preview={preview} />
                  {editing === el.id && (
                    <input
                      className="wf-inline"
                      aria-label="Element text"
                      autoFocus
                      defaultValue={el.text ?? ''}
                      style={{ fontSize: textPx(el) }}
                      onPointerDown={(e) => e.stopPropagation()}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                        if (e.key === 'Escape') setEditing(null)
                        e.stopPropagation()
                      }}
                      onBlur={(e) => {
                        const v = e.target.value
                        if (editing) ed.write((els) => void (els.find((x) => x.id === el.id)!.text = v), ed.gestureKey())
                        setEditing(null)
                      }}
                    />
                  )}
                  {level && <span className={`wf-badge ${level}`} style={{ transform: `scale(${inv})` }} title={issues!.map((i) => i.message).join('\n')}>⚑</span>}
                  {ed.showPins && el.note?.trim() && !preview && (
                    <span className="wf-pin" style={{ transform: `scale(${inv})` }} title={el.note}>{pins.indexOf(el) + 1}</span>
                  )}
                </div>
              )
            })}
            {single && !preview &&
              HANDLES.map((h) => {
                const r = rectOf(single)
                const x = h.includes('w') ? r.x : h.includes('e') ? r.x + r.w : r.x + r.w / 2
                const y = h.includes('n') ? r.y : h.includes('s') ? r.y + r.h : r.y + r.h / 2
                return (
                  <i
                    key={h}
                    className={`wf-handle h-${h}`}
                    data-testid={`wf-handle-${h}`}
                    style={{ left: x, top: y, width: 10 * inv, height: 10 * inv, marginLeft: -5 * inv, marginTop: -5 * inv }}
                    onPointerDown={(e) => onHandleDown(e, single, h)}
                  />
                )
              })}
            {guides.map((g, i) =>
              g.axis === 'x' ? (
                <i key={i} className="wf-guide" style={{ left: g.pos, top: g.from, width: inv, height: g.to - g.from }} />
              ) : (
                <i key={i} className="wf-guide" style={{ top: g.pos, left: g.from, height: inv, width: g.to - g.from }} />
              ),
            )}
            {gaps.map((g, i) => (
              <span
                key={i}
                className="wf-gap"
                style={g.axis === 'x' ? { left: (g.from + g.to) / 2, top: g.at, transform: `translate(-50%,-50%) scale(${inv})` } : { top: (g.from + g.to) / 2, left: g.at, transform: `translate(-50%,-50%) scale(${inv})` }}
              >
                {Math.round(g.to - g.from)}
              </span>
            ))}
            {marquee && <div className="wf-marquee" style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h }} />}
            {selBounds && !preview && !draft && (
              <div className="wf-alignbar" role="toolbar" aria-label="Align" style={{ left: selBounds.x, top: selBounds.y, transform: `scale(${inv}) translateY(-100%)` }} onPointerDown={(e) => e.stopPropagation()}>
                {(
                  [
                    ['left', '⇤', 'Align left'],
                    ['center', '↔', 'Align centre'],
                    ['right', '⇥', 'Align right'],
                    ['top', '⤒', 'Align top'],
                    ['middle', '↕', 'Align middle'],
                    ['bottom', '⤓', 'Align bottom'],
                    ['dx', '⋯', 'Distribute horizontally'],
                    ['dy', '⋮', 'Distribute vertically'],
                    ['width', '↹', 'Match width'],
                    ['height', '⇳', 'Match height'],
                  ] as const
                ).map(([m, icon, label]) => (
                  <button key={m} className="icon" title={label} aria-label={label} disabled={(m === 'dx' || m === 'dy') && selected.length < 3} onClick={() => doAlign(m)}>
                    {icon}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      {menu && (
        <div className="wf-menu" role="menu" style={{ left: menu.x, top: menu.y }} onPointerDown={(e) => e.stopPropagation()} onMouseLeave={() => setMenu(null)}>
          {(
            [
              ['duplicate', 'Duplicate', 'Ctrl+D', true],
              ['copy', 'Copy', 'Ctrl+C', true],
              ['paste', 'Paste', 'Ctrl+V', false],
              ['forward', 'Bring forward', 'Ctrl+]', true],
              ['backward', 'Send backward', 'Ctrl+[', true],
              ['front', 'Bring to front', 'Ctrl+Shift+]', true],
              ['back', 'Send to back', 'Ctrl+Shift+[', true],
              ['lock', selected.every((s) => s.locked) && selected.length ? 'Unlock' : 'Lock', 'Ctrl+L', true],
              ['hide', 'Hide', '', true],
              ['delete', 'Delete', 'Del', true],
            ] as const
          ).map(([a, label, key, needsSel]) => (
            <button
              key={a}
              role="menuitem"
              disabled={needsSel && !selected.length}
              onClick={() => {
                onMenu(a)
                setMenu(null)
              }}
            >
              <span>{label}</span>
              <span className="muted">{key}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
