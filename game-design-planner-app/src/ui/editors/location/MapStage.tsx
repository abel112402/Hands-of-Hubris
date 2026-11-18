import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import type { Entity, Project } from '../../../core/model/types'
import { ctrlMoved, findObject, moved, putObject, removeObject, resizedTo, rotatedTo } from '../../../core/location/edit'
import { polyPath } from '../../../core/location/geometry'
import { kindInfo, selectable } from '../../../core/location/objects'
import { CARD, cardSize } from '../../../core/location/render/frame'
import type { SvgNode } from '../../../core/location/render/node'
import { renderMap } from '../../../core/location/render/svg'
import type { LocationMap, MapObject, MapPoint as Pt } from '../../../core/location/types'
import { SvgNodeView } from './SvgNodeView'

type Gesture = { key: string; mode: 'move' | 'resize' | 'rotate' | 'ctrl'; index: number; start: Pt; orig: MapObject }
let gestureCounter = 0
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
 * The map with direct manipulation: click to select, drag to move, drag a handle to resize, rotate or bend.
 * Every change goes out through `commit`; one gesture is one undo step.
 */
export function MapStage({ project, location, map, selected, onSelect, commit, onDuplicate, overlay, player }: {
  project: Project
  location: Entity
  map: LocationMap
  selected: string | null
  onSelect: (id: string | null) => void
  commit: (next: LocationMap, key?: string) => void
  onDuplicate: (id: string) => void
  /** Drawn over the map in map units (walkability, light). */
  overlay?: SvgNode | null
  /** Show the players' version of the map. */
  player?: boolean
}) {
  const box = useRef<HTMLDivElement>(null)
  const [gesture, setGesture] = useState<Gesture | null>(null)
  const live = useRef({ map, gesture, commit })
  useEffect(() => {
    live.current = { map, gesture, commit }
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
      const { map: now, gesture: g, commit: send } = live.current
      if (!g) return
      const p = toMap(e)
      const o = g.orig
      const next = g.mode === 'move' ? moved(o, p[0] - g.start[0], p[1] - g.start[1]) : g.mode === 'resize' ? resizedTo(o, p) : g.mode === 'rotate' ? rotatedTo(o, p) : ctrlMoved(o, g.index, p)
      send(putObject(now, next), g.key)
    }
    const up = () => setGesture(null)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    // toMap reads only refs and the map size, which a gesture does not change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gesture])

  const begin = (e: ReactPointerEvent, mode: Gesture['mode'], orig: MapObject, index = 0) =>
    setGesture({ key: `loc-gesture-${++gestureCounter}`, mode, index, start: toMap(e), orig })

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    const target = e.target as Element
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
    begin(e, 'move', hit.object)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!picked) return
    const step = e.shiftKey ? 10 : 1
    const nudge: Record<string, Pt> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }
    if (nudge[e.key]) commit(putObject(map, moved(picked.object, nudge[e.key][0], nudge[e.key][1])), `loc-nudge-${picked.object.id}`)
    else if (e.key === 'Delete' || e.key === 'Backspace') {
      commit(removeObject(map, picked.object.id))
      onSelect(null)
    } else if (e.key === 'Escape') onSelect(null)
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') onDuplicate(picked.object.id)
    else return
    e.preventDefault()
  }

  return (
    <div ref={box} className={'loc-stage' + (gesture ? ' dragging' : '')} tabIndex={0} aria-label="Map" onPointerDown={onPointerDown} onKeyDown={onKeyDown}>
      <SvgNodeView
        node={renderMap(project, location, map, { player }).node}
        className="loc-svg"
        extra={
          <>
            {overlay && (
              <g key="overlay" transform={`translate(${CARD.side} ${CARD.top})`} data-testid="loc-overlay">
                <SvgNodeView node={overlay} />
              </g>
            )}
            {picked && <g key="selection" transform={`translate(${CARD.side} ${CARD.top})`} data-testid="loc-selection"><Selection object={picked.object} /></g>}
          </>
        }
      />
    </div>
  )
}
