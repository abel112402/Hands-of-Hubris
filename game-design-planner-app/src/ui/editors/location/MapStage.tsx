import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import type { Entity, Project } from '../../../core/model/types'
import { paintField, redrawn, type BrushField } from '../../../core/location/brush'
import { ctrlMoved, findObject, moved, putObject, rectPoly, removeObject, resizedTo, rotatedTo } from '../../../core/location/edit'
import { polyPath } from '../../../core/location/geometry'
import { linkedObjects } from '../../../core/location/links'
import { kindInfo, selectable } from '../../../core/location/objects'
import { CARD, cardSize } from '../../../core/location/render/frame'
import type { SvgNode } from '../../../core/location/render/node'
import { renderMap } from '../../../core/location/render/svg'
import { snapMove, type Guide } from '../../../core/location/snap'
import type { LocationMap, MapObject, MapPoint as Pt } from '../../../core/location/types'
import { SvgNodeView } from './SvgNodeView'

/**
 * What a drag on the map does. `select` picks and moves objects; the rest are tools: draw a mask rectangle, paint a
 * raster field, redraw the selected road or river, split the selected room.
 */
export type Tool = 'select' | 'mask' | 'carve' | 'fill' | 'walk' | 'block' | 'clear' | 'redraw' | 'split'
/** The field and value each painting tool writes (brush.ts). */
export const PAINT: Partial<Record<Tool, [BrushField, number]>> = {
  carve: ['rock', 0],
  fill: ['rock', 1],
  walk: ['navOverride', 1],
  block: ['navOverride', 2],
  clear: ['navOverride', 0],
}

type Gesture = { key: string; mode: 'move' | 'resize' | 'rotate' | 'ctrl' | 'mask' | 'paint' | 'redraw'; index: number; start: Pt; orig: MapObject | null; layerId?: string }
let gestureCounter = 0
/** How a gesture reads in the history list. */
const GESTURE_LABEL: Partial<Record<Gesture['mode'], string>> = { move: 'Move', resize: 'Resize', rotate: 'Turn', ctrl: 'Bend' }
const ROTATE_ARM = 18

/** Handles and outline of the selected object, in map units. */
function Selection({ object }: { object: MapObject }) {
  const info = kindInfo(object.kind)
  if (!info) return null
  if (info.shape === 'box') {
    const [w, h] = [object.w ?? 20, object.h ?? 20]
    return (
      <g transform={`translate(${object.x} ${object.y}) rotate(${object.rot ?? 0})`}>
        <rect className="loc-sel" x={-w / 2 - 3} y={-h / 2 - 3} width={w + 6} height={h + 6} />
        {!info.fixedAngle && (
          <>
            <line className="loc-sel" x1={0} y1={-h / 2 - 3} x2={0} y2={-h / 2 - ROTATE_ARM} />
            <circle className="loc-handle" data-handle="rotate" cx={0} cy={-h / 2 - ROTATE_ARM} r={5} />
          </>
        )}
        <rect className="loc-handle" data-handle="resize" x={w / 2 - 1} y={h / 2 - 1} width={9} height={9} />
      </g>
    )
  }
  if (info.shape === 'curve' || info.shape === 'outline') {
    return (
      <g>
        <path className="loc-sel" d={polyPath(object.points ?? [], info.shape === 'outline')} />
        {(object.ctrl ?? []).map((p, i) => <circle key={i} className="loc-handle" data-handle={`ctrl:${i}`} cx={p[0]} cy={p[1]} r={6} />)}
      </g>
    )
  }
  const half = object.kind === 'label' ? Math.max(24, (object.label?.length ?? 4) * 3.6) : 13
  return <rect className="loc-sel" x={object.x - half} y={object.y - (object.kind === 'label' ? 15 : 13)} width={half * 2} height={object.kind === 'label' ? 22 : 26} rx={4} />
}

/**
 * The map with direct manipulation: click to select, drag to move (snapping to neighbours and the grid; hold Alt
 * to move freely), drag a handle to resize, rotate or bend; or use a tool. Every change goes out through `commit`;
 * one gesture is one undo step.
 */
export function MapStage({ project, location, map, selected, onSelect, commit, onDuplicate, overlay, player, tool = 'select', brush = 24, onMask, onSplit, onOpen }: {
  project: Project
  location: Entity
  map: LocationMap
  selected: string | null
  onSelect: (id: string | null) => void
  commit: (next: LocationMap, key?: string, label?: string) => void
  onDuplicate: (id: string) => void
  /** Drawn over the map in map units (walkability, light). */
  overlay?: SvgNode | null
  /** Show the players' version of the map. */
  player?: boolean
  tool?: Tool
  /** Brush radius in map units. */
  brush?: number
  /** A mask rectangle was drawn. */
  onMask?: (poly: Pt[]) => void
  /** The selected room should be split at a point. */
  onSplit?: (id: string, at: Pt) => void
  /** Double-click on an object that leads to another location. */
  onOpen?: (locationId: string) => void
}) {
  const box = useRef<HTMLDivElement>(null)
  const [gesture, setGesture] = useState<Gesture | null>(null)
  /** What a gesture in progress shows: a mask rectangle, a stroke, snapping guides. */
  const [draft, setDraft] = useState<{ rect?: Pt[]; stroke?: Pt[]; guides?: Guide[] }>({})
  const live = useRef({ map, gesture, commit, draft, brush, onMask, tool })
  useEffect(() => {
    live.current = { map, gesture, commit, draft, brush, onMask, tool }
  })
  const picked = findObject(map, selected)

  /** Pointer position in map units; the SVG is letterboxed inside its element. */
  const toMap = (e: { clientX: number; clientY: number }): Pt => {
    const svg = box.current?.querySelector('svg')
    const r = svg?.getBoundingClientRect()
    const card = cardSize(map.w, map.h)
    if (!r || !r.width || !r.height) return [0, 0]
    const scale = Math.max(card.w / r.width, card.h / r.height)
    const [ox, oy] = [(r.width - card.w / scale) / 2, (r.height - card.h / scale) / 2]
    return [(e.clientX - r.left - ox) * scale - CARD.side, (e.clientY - r.top - oy) * scale - CARD.top]
  }

  useEffect(() => {
    if (!gesture) return
    const move = (e: PointerEvent) => {
      const { map: now, gesture: g, commit: send, brush: radius, tool: t } = live.current
      if (!g) return
      const p = toMap(e)
      if (g.mode === 'mask') return setDraft({ rect: rectPoly(g.start, p) })
      if (g.mode === 'redraw') return setDraft((d) => ({ stroke: [...(d.stroke ?? [g.start]), p] }))
      if (g.mode === 'paint') {
        const paint = PAINT[t]
        if (paint) send(paintField(now, paint[0], p, radius, paint[1]), g.key, 'Paint')
        return
      }
      const o = g.orig!
      let next = g.mode === 'move' ? moved(o, p[0] - g.start[0], p[1] - g.start[1]) : g.mode === 'resize' ? resizedTo(o, p) : g.mode === 'rotate' ? rotatedTo(o, p) : ctrlMoved(o, g.index, p)
      if (g.mode === 'move' && g.layerId && !e.altKey) {
        const snapped = snapMove(now, next, g.layerId)
        next = snapped.object
        setDraft({ guides: snapped.guides })
      }
      const what = kindInfo(o.kind)?.label ?? o.kind
      send(putObject(now, next), g.key, `${GESTURE_LABEL[g.mode] ?? 'Edit'} ${what.toLowerCase()}`)
    }
    const up = () => {
      const { map: now, gesture: g, commit: send, draft: d, onMask: mask } = live.current
      if (g?.mode === 'mask' && d.rect && mask) {
        const [a, c] = [d.rect[0], d.rect[2]]
        if (Math.abs(c[0] - a[0]) > 8 && Math.abs(c[1] - a[1]) > 8) mask(d.rect)
      }
      if (g?.mode === 'redraw' && g.orig && d.stroke) {
        const next = redrawn(g.orig, d.stroke)
        if (next) send(putObject(now, next), g.key, 'Redraw ' + (kindInfo(g.orig.kind)?.label ?? g.orig.kind).toLowerCase())
      }
      setDraft({})
      setGesture(null)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    // toMap reads only refs and the map size, which a gesture does not change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gesture])

  const begin = (e: ReactPointerEvent, mode: Gesture['mode'], orig: MapObject | null, index = 0, layerId?: string) =>
    setGesture({ key: `loc-gesture-${++gestureCounter}`, mode, index, start: toMap(e), orig, layerId })

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    const target = e.target as Element
    const at = toMap(e)
    if (tool !== 'select') {
      e.preventDefault()
      box.current?.focus()
      if (tool === 'mask') begin(e, 'mask', null)
      else if (PAINT[tool]) {
        const [field, value] = PAINT[tool]!
        const key = `loc-gesture-${++gestureCounter}`
        commit(paintField(map, field, at, brush, value), key, 'Paint')
        setGesture({ key, mode: 'paint', index: 0, start: at, orig: null })
      } else if (tool === 'redraw' && picked && ['curve', 'outline'].includes(kindInfo(picked.object.kind)?.shape ?? '')) {
        begin(e, 'redraw', picked.object)
        setDraft({ stroke: [at] })
      } else if (tool === 'split' && picked && onSplit) onSplit(picked.object.id, at)
      return
    }
    const handle = target.closest('[data-handle]')?.getAttribute('data-handle')
    if (handle && picked) {
      e.preventDefault()
      if (handle === 'resize' || handle === 'rotate') begin(e, handle, picked.object)
      else begin(e, 'ctrl', picked.object, Number(handle.split(':')[1]))
      return
    }
    const hit = findObject(map, target.closest('[data-obj]')?.getAttribute('data-obj'))
    if (!hit || !selectable(hit.object.kind) || map.layers[hit.layerId]?.locked) return onSelect(null)
    e.preventDefault()
    box.current?.focus()
    onSelect(hit.object.id)
    if (!kindInfo(hit.object.kind)?.fixed) begin(e, 'move', hit.object, 0, hit.layerId)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!picked) return
    const step = e.shiftKey ? 10 : 1
    const nudge: Record<string, Pt> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }
    if (nudge[e.key] && !kindInfo(picked.object.kind)?.fixed) commit(putObject(map, moved(picked.object, nudge[e.key][0], nudge[e.key][1])), `loc-nudge-${picked.object.id}`, 'Nudge')
    else if (e.key === 'Delete' || e.key === 'Backspace') {
      commit(removeObject(map, picked.object.id), undefined, 'Delete ' + (kindInfo(picked.object.kind)?.label ?? '').toLowerCase())
      onSelect(null)
    } else if (e.key === 'Escape') onSelect(null)
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') onDuplicate(picked.object.id)
    else return
    e.preventDefault()
  }

  const inMap = (children: React.ReactNode, key: string, testId?: string) => (
    <g key={key} transform={`translate(${CARD.side} ${CARD.top})`} data-testid={testId}>
      {children}
    </g>
  )
  return (
    <div ref={box} className={'loc-stage' + (gesture ? ' dragging' : '') + (tool !== 'select' ? ' tool-' + tool : '')} tabIndex={0} aria-label="Map" onPointerDown={onPointerDown} onKeyDown={onKeyDown} onDoubleClick={(e) => {
      const hit = findObject(map, (e.target as Element).closest('[data-obj]')?.getAttribute('data-obj'))
      if (hit?.object.link && onOpen) onOpen(hit.object.link.locationId)
    }}>
      <SvgNodeView
        node={renderMap(project, location, map, { player }).node}
        className="loc-svg"
        extra={
          <>
            {overlay && inMap(<SvgNodeView node={overlay} />, 'overlay', 'loc-overlay')}
            {!!map.masks?.length &&
              inMap(
                map.masks.map((m) => <path key={m.id} className="loc-mask" d={polyPath(m.poly, true)} />),
                'masks',
                'loc-masks',
              )}
            {draft.rect && inMap(<path className="loc-mask draft" d={polyPath(draft.rect, true)} />, 'draft-rect')}
            {draft.stroke && inMap(<path className="loc-stroke" d={polyPath(draft.stroke)} />, 'draft-stroke')}
            {!!draft.guides?.length && inMap(draft.guides.map((g, i) => <line key={i} className="loc-guide" x1={g[0]} y1={g[1]} x2={g[2]} y2={g[3]} />), 'guides', 'loc-guides')}
            {inMap(
              linkedObjects(map).map((o) => (
                <g key={o.id} className="loc-link" transform={`translate(${o.x + (o.w ?? 12) / 2} ${o.y - (o.h ?? 12) / 2})`}>
                  <circle r={7} />
                  <text y={3.5} textAnchor="middle">↗</text>
                </g>
              )),
              'links',
              'loc-links',
            )}
            {picked && inMap(<Selection object={picked.object} />, 'selection', 'loc-selection')}
          </>
        }
      />
    </div>
  )
}
