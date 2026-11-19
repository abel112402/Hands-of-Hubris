import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { Entity } from '../../../core/model/types'
import type { SvgNode } from '../../../core/location/render/node'
import { makeId } from '../../../core/model/project'
import { cachedMapChecks, mapLight, mapNav, type MapCheck } from '../../../core/location/analysis'
import { lightOverlay, navOverlay } from '../../../core/location/render/overlays'
import { addStamp, splitRoom } from '../../../core/location/brush'
import { addMask, addObject, duplicateObject, findObject, maskAround, putObject, removeMask, setLayerLocked } from '../../../core/location/edit'
import { locationById, parentChain } from '../../../core/location/links'
import { generateMap, regenerateLayer, regenerateStale, setLayerHidden, staleLayers } from '../../../core/location/generate'
import { kindInfo } from '../../../core/location/objects'
import { getLocationType, LOCATION_TYPES } from '../../../core/location/registry'
import { mapOf } from '../../../core/location/schema'
import type { LocationMap } from '../../../core/location/types'
import { useProject, useSection } from '../../hooks'
import type { ViewProps } from '../CollectionEditor'
import { MapStage, PAINT, type Tool } from './MapStage'
import { HistoryPanel, ParamSliders, VersionsPanel } from './MapPanels'
import { EXPORTS, runExport, type ExportId } from './exportMap'
import { THEMES } from '../../../core/location/render/theme'
import { ObjectPanel } from './ObjectPanel'
import { ToolIcon } from './toolIcons'

const nameOf = (e: Entity) => String(e.name ?? '') || '(unnamed)'
type Overlay = 'none' | 'nav' | 'light'

/** Overlays walk the whole map; each is kept per stored map until the map changes. */
const overlayCache = new WeakMap<LocationMap, Partial<Record<Overlay, SvgNode>>>()
function cachedOverlay(map: LocationMap, kind: Exclude<Overlay, 'none'>): SvgNode {
  const kept = overlayCache.get(map) ?? {}
  kept[kind] ??= kind === 'nav' ? navOverlay(mapNav(map)) : lightOverlay(mapLight(map), mapNav(map))
  overlayCache.set(map, kept)
  return kept[kind]!
}
/** The map in another style; parchment, the default, is stored as no style at all. */
function withTheme(map: LocationMap, id: string): LocationMap {
  const next: LocationMap = { ...map, theme: id }
  if (id === 'parchment') delete next.theme
  return next
}
/** Where the sun can stand, as degrees clockwise from north. */
const SUN: [string, number][] = [['North', 0], ['North-east', 45], ['East', 90], ['South-east', 135], ['South', 180], ['South-west', 225], ['West', 270], ['North-west', 315]]
/** The map with some of its lighting settings changed; a setting set to undefined is removed. */
function withEnv(map: LocationMap, change: Partial<NonNullable<LocationMap['env']>>): LocationMap {
  const env: NonNullable<LocationMap['env']> = { ...map.env, ...change }
  for (const k of Object.keys(env) as (keyof typeof env)[]) if (env[k] === undefined) delete env[k]
  const next: LocationMap = { ...map, env }
  if (!Object.keys(env).length) delete next.env
  return next
}

/** What the map's own rules say is wrong (house rules, locks, rooms nothing leads into); a click selects the room or door. */
function MapChecks({ checks, onPick }: { checks: MapCheck[]; onPick: (id: string) => void }) {
  return (
    <section className="loc-checks" aria-label="Checks">
      {checks.length ? (
        <ul>
          {checks.map((c) => (
            <li key={c.id}>
              {c.objects.length ? <button className="link" onClick={() => onPick(c.objects[0])}>{c.text}</button> : <span>{c.text}</span>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">The layout keeps its rules: every room can be reached and every lock opened.</p>
      )}
    </section>
  )
}

/** A collapsible block of the side panel; `meta` sits at the right of its header. */
function Panel({ title, meta, open = true, id, children }: { title: string; meta?: ReactNode; open?: boolean; id?: string; children: ReactNode }) {
  return (
    <details className="loc-panel" open={open} id={id}>
      <summary>
        <span className="loc-panel-title">{title}</span>
        {meta}
      </summary>
      <div className="loc-panel-body">{children}</div>
    </details>
  )
}

/** A toolbar button that opens a small panel below it; a click elsewhere closes it. */
function Popover({ label, icon, dot, children }: { label: string; icon: 'view' | 'download'; dot?: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null)
  useEffect(() => {
    const close = (e: PointerEvent) => {
      if (ref.current?.open && !ref.current.contains(e.target as Node)) ref.current.open = false
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [])
  return (
    <details ref={ref} className="loc-pop">
      <summary className="loc-btn">
        <ToolIcon name={icon} />
        {label} ▾{dot && <span className="loc-dot" title="Changed from the default" />}
      </summary>
      <div className="loc-pop-body">{children}</div>
    </details>
  )
}

const newSeed = () => Math.floor(Math.random() * 0x7fffffff)
const newObjectId = () => `m-${makeId()}`
const supported = LOCATION_TYPES.map((t) => t.id).join(', ')
/** Single-key shortcuts for the tool rail. */
const TOOL_KEY: Record<Tool, string> = { select: 'v', mask: 'k', carve: 'c', fill: 'f', walk: 'w', block: 'b', clear: 'e', redraw: 'r', split: 's' }
const ZOOM_MIN = 1
const ZOOM_MAX = 6
const isTyping = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(t.tagName))

/**
 * The map of one location (Locations › Map), laid out as an editor: one toolbar, a tool rail, the zoomable map, and a
 * side panel with the selection, layers, checks, generator, versions and history — or the location's inputs.
 */
export function LocationMapView({ docId, sec, items, selected, onSelect, inspectorFor }: ViewProps) {
  const project = useProject()
  const { update } = useSection<Entity[]>(docId, sec.id)
  const location = items.find((e) => e.id === selected) ?? items[0]
  const [picked, setPicked] = useState<string | null>(null)
  const [pickedFor, setPickedFor] = useState(location?.id)
  const [adding, setAdding] = useState('')
  const [overlay, setOverlay] = useState<Overlay>('none')
  const [player, setPlayer] = useState(false)
  const [tool, setTool] = useState<Tool>('select')
  const [brush, setBrush] = useState(24)
  const [exportId, setExportId] = useState<ExportId>('svg')
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')
  /** Which side-panel tab the user chose; until then it follows whether there is a map yet. */
  const [tab, setTab] = useState<'map' | 'inputs' | null>(null)
  const [panelOpen, setPanelOpen] = useState(true)
  const [full, setFull] = useState(false)
  const [zoom, setZoom] = useState(1)
  const canvas = useRef<HTMLDivElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  /** Where in the canvas a zoom was aimed, so the point under the cursor stays put. */
  const zoomAnchor = useRef<{ fx: number; fy: number; mx: number; my: number } | null>(null)
  /** The map as a slider being moved would make it; shown instead of the stored map until the slider is let go. */
  const [draft, setDraft] = useState<LocationMap | null>(null)
  // A selection belongs to one location: switching locations starts with nothing selected.
  if (location && pickedFor !== location.id) {
    setPickedFor(location.id)
    setPicked(null)
  }
  const type = location ? getLocationType(location.type) : undefined
  const stored = location ? mapOf(location) : null
  const map = stored && location && stored.type === location.type ? stored : null
  const object = map ? findObject(map, picked) : null
  const pickedShape = object ? kindInfo(object.object.kind)?.shape : undefined
  /** The tools that make sense for this map and the current selection: id, label, what it does. */
  const tools: [Tool, string, string][] = [
    ['select', 'Select', 'Click to select, drag to move; hold Alt to move without snapping'],
    ['mask', 'Keep area', 'Drag a rectangle: everything in it survives every reroll'],
    ...(map?.fields?.rock ? ([['carve', 'Carve rock', 'Paint floor into the rock'], ['fill', 'Fill rock', 'Paint rock over the floor']] as [Tool, string, string][]) : []),
    ['walk', 'Paint walkable', 'Mark ground walkable whatever is drawn there'],
    ['block', 'Paint blocked', 'Mark ground blocked whatever is drawn there'],
    ['clear', 'Clear paint', 'Remove walkable or blocked paint'],
    ...(pickedShape === 'curve' || pickedShape === 'outline' ? ([['redraw', 'Redraw', 'Draw the selected road, river or wall again by hand']] as [Tool, string, string][]) : []),
    ...(object && ['room', 'chamber'].includes(object.object.kind) ? ([['split', 'Split room', 'Click where the selected room should be cut in two']] as [Tool, string, string][]) : []),
  ]
  const activeTool = tools.some(([t]) => t === tool) ? tool : 'select'
  const toolIds = tools.map(([t]) => t).join()

  // Tool shortcuts, and Escape leaves the full-screen editor; never while typing in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return
      if (e.key === 'Escape' && full && !(e.target as Element | null)?.closest?.('.loc-stage')) return setFull(false)
      const hit = Object.entries(TOOL_KEY).find(([t, k]) => k === e.key.toLowerCase() && toolIds.split(',').includes(t))
      if (hit && map) {
        setTool(hit[0] as Tool)
        e.preventDefault()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [full, toolIds, map])

  // A new selection brings the panel to it: the Map tab, scrolled to the top where the selection is shown.
  const [pickedSeen, setPickedSeen] = useState(picked)
  if (picked !== pickedSeen) {
    setPickedSeen(picked)
    if (picked) setTab('map')
  }
  useEffect(() => {
    if (picked) panel.current?.scrollTo?.({ top: 0 })
  }, [picked])

  /** Zooms by a factor around a point of the canvas (its centre when none is given). */
  const zoomBy = (factor: number, at?: { clientX: number; clientY: number }) => {
    const el = canvas.current
    const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(zoom * factor * 100) / 100))
    if (!el || next === zoom) return
    const r = el.getBoundingClientRect()
    const mx = at ? at.clientX - r.left : el.clientWidth / 2
    const my = at ? at.clientY - r.top : el.clientHeight / 2
    zoomAnchor.current = { fx: (el.scrollLeft + mx) / el.scrollWidth, fy: (el.scrollTop + my) / el.scrollHeight, mx, my }
    setZoom(next)
  }
  useLayoutEffect(() => {
    const el = canvas.current
    const a = zoomAnchor.current
    if (!el || !a) return
    el.scrollLeft = a.fx * el.scrollWidth - a.mx
    el.scrollTop = a.fy * el.scrollHeight - a.my
    zoomAnchor.current = null
  }, [zoom])
  // Ctrl+wheel (and trackpad pinch) zooms; the wheel alone scrolls. Needs a non-passive listener to stop page zoom.
  const zoomRef = useRef(zoomBy)
  useEffect(() => {
    zoomRef.current = zoomBy
  })
  const hasMap = map != null
  useEffect(() => {
    const el = canvas.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      zoomRef.current(e.deltaY < 0 ? 1.2 : 1 / 1.2, e)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [hasMap])
  // Hold Space (or use the middle button) and drag to pan the zoomed map.
  const space = useRef(false)
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isTyping(e.target) && !(e.target instanceof HTMLButtonElement)) {
        space.current = true
        canvas.current?.classList.add('panning')
        if (canvas.current?.contains(e.target as Node) || e.target === document.body) e.preventDefault()
      }
    }
    const up = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return
      space.current = false
      canvas.current?.classList.remove('panning')
    }
    document.addEventListener('keydown', down)
    document.addEventListener('keyup', up)
    return () => {
      document.removeEventListener('keydown', down)
      document.removeEventListener('keyup', up)
    }
  }, [])
  const startPan = (e: React.PointerEvent) => {
    const el = canvas.current
    if (!el || !(space.current || e.button === 1)) return
    e.preventDefault()
    e.stopPropagation()
    const [x0, y0, l0, t0] = [e.clientX, e.clientY, el.scrollLeft, el.scrollTop]
    const move = (m: PointerEvent) => {
      el.scrollLeft = l0 - (m.clientX - x0)
      el.scrollTop = t0 - (m.clientY - y0)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  if (!location) return null
  /**
   * Stores a map on the location. Calls with the same `key` close together are one undo step; `label` is how the
   * step reads in the history list.
   */
  const commit = (next: LocationMap | null, key?: string, label?: string) => {
    if (!next || next === map) return
    update((d) => {
      const e = d.find((x) => x.id === location.id)
      if (e) e.map = next
    }, key, label)
  }
  const stale = map ? staleLayers(map) : []
  // Both walk the whole map, so they are worked out again only when the map (or the project) changes.
  const checks = map ? cachedMapChecks(location, map, project) : []
  const overlayNode = !map || overlay === 'none' ? null : cachedOverlay(map, overlay)
  const addable = [
    ...(type?.layers ?? []).flatMap((l) => (map?.layers[l.id]?.locked ? [] : (l.addable ?? []).map((kind) => ({ value: `${l.id}/${kind}`, label: kindInfo(kind)?.label ?? kind })))),
    ...(type?.stamps ?? []).filter((s) => map?.layers[s.layer] && !map.layers[s.layer].locked).map((s) => ({ value: `${s.layer}/stamp:${s.id}`, label: `${s.label} (stamp)` })),
  ]
  const add = () => {
    const [layerId, kind] = (adding || addable[0]?.value || '').split('/')
    if (!map || !kind) return
    const at: [number, number] = [map.w / 2, map.h / 2]
    const stamp = kind.startsWith('stamp:') ? type?.stamps?.find((s) => s.id === kind.slice(6)) : undefined
    if (stamp) {
      const made = stamp.make(at[0], at[1])
      const ids = made.map(() => newObjectId())
      commit(addStamp(map, layerId, made, ids), undefined, `Add ${stamp.label.toLowerCase()}`)
      setPicked(ids[0])
      return
    }
    const id = newObjectId()
    commit(addObject(map, layerId, kind, at, id), undefined, `Add ${(kindInfo(kind)?.label ?? kind).toLowerCase()}`)
    setPicked(id)
  }
  const keepArea = (poly: [number, number][]) => map && commit(addMask(map, poly, `mask-${makeId()}`, `Kept area ${(map.masks?.length ?? 0) + 1}`), undefined, 'Keep area')
  /**
   * A new location inside the selected object (a house's floor plan, the dungeon under a cellar door): the object
   * links to it, it names this location as its parent, and its map is generated so its entrance matches. One step
   * to undo; the new location opens.
   */
  const createLinked = (childType: string) => {
    if (!map || !object) return
    const id = makeId()
    const child: Entity = { id, name: object.object.label || `${childType} in ${nameOf(location)}`, type: childType, parent: location.id }
    const parentMap = putObject(map, { ...object.object, link: { locationId: id } }, { heal: false })
    const doc = project.documents[docId]
    const list = (doc.data[sec.id] as Entity[]).map((l) => (l.id === location.id ? { ...l, map: parentMap } : l))
    const withChild = { ...project, documents: { ...project.documents, [docId]: { ...doc, data: { ...doc.data, [sec.id]: [...list, child] } } } }
    const childMap = generateMap(withChild, child, newSeed())
    update((d) => {
      const e = d.find((x) => x.id === location.id)
      if (e) e.map = parentMap
      d.push(childMap ? { ...child, map: childMap } : child)
    })
    onSelect(id)
  }
  const chain = parentChain(project, location)
  const nameOfId = (id: string) => { const l = locationById(project, id); return l ? nameOf(l) : undefined }
  const duplicate = (id: string) => {
    if (!map) return
    const copy = newObjectId()
    commit(duplicateObject(map, id, copy), undefined, 'Duplicate')
    setPicked(copy)
  }
  const generate = () => {
    commit(generateMap(project, location, newSeed(), map), undefined, map ? 'New map' : 'Generate map')
    setPicked(null)
    setTab(null)
  }
  const showChecks = () => {
    setPanelOpen(true)
    setTab('map')
    requestAnimationFrame(() => {
      const el = document.getElementById(`loc-checks-${location.id}`) as HTMLDetailsElement | null
      if (el) {
        el.open = true
        el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      }
    })
  }
  const shownTab = tab ?? (map ? 'map' : 'inputs')
  const viewChanged = overlay !== 'none' || player || !!map?.theme || !!map?.env
  const columns = [map && 'var(--loc-rail)', 'minmax(0,1fr)', panelOpen && 'var(--loc-panel)'].filter(Boolean).join(' ')

  return (
    <div className={'loc-root' + (full ? ' full' : '')}>
      <div className="loc-bar">
        <label className="loc-pick">
          <span className="sr-only">Location</span>
          <select aria-label="Location" className="loc-location" value={location.id} onChange={(e) => onSelect(e.target.value)}>
            {items.map((e) => <option key={e.id} value={e.id}>{nameOf(e)}{e.type ? ` (${e.type})` : ''}</option>)}
          </select>
        </label>
        {chain.length > 1 && (
          <nav className="loc-crumbs" aria-label="Inside">
            {chain.map((l, i) => (i < chain.length - 1 ? <span key={l.id}><button className="link" onClick={() => onSelect(l.id)}>{nameOf(l)}</button> › </span> : <strong key={l.id}>{nameOf(l)}</strong>))}
          </nav>
        )}
        <span className="spacer" />
        {map && (
          <button className={'loc-badge ' + (checks.length ? 'warn' : 'ok')} onClick={showChecks} title="What the map's own rules say">
            {checks.length ? `⚠ ${checks.length} ${checks.length === 1 ? 'issue' : 'issues'}` : '✓ Checks pass'}
          </button>
        )}
        {map && (
          <Popover label="View" icon="view" dot={viewChanged}>
            <label className="loc-row">
              <span>Show</span>
              <select aria-label="Overlay" value={overlay} onChange={(e) => setOverlay(e.target.value as Overlay)}>
                <option value="none">Map only</option>
                <option value="nav">Walkable ground</option>
                <option value="light">Light and shadow</option>
              </select>
            </label>
            <label className="loc-row">
              <span>Style</span>
              <select aria-label="Map style" value={map.theme ?? 'parchment'} onChange={(e) => commit(withTheme(map, e.target.value), undefined, 'Change style')}>
                {Object.values(THEMES).map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </label>
            <label className="loc-row">
              <span>Time</span>
              <select aria-label="Time of day" value={map.env?.time ?? 'day'} onChange={(e) => commit(withEnv(map, { time: e.target.value as 'day' | 'dusk' | 'night' }), undefined, 'Change time of day')}>
                <option value="day">Day</option>
                <option value="dusk">Dusk</option>
                <option value="night">Night</option>
              </select>
            </label>
            <label className="loc-row">
              <span>Sun from</span>
              <select aria-label="Sun direction" value={map.env?.sun ?? ''} onChange={(e) => commit(withEnv(map, { sun: e.target.value === '' ? undefined : Number(e.target.value) }), undefined, 'Change sun')}>
                <option value="">Default</option>
                {SUN.map(([label, deg]) => <option key={deg} value={deg}>{label}</option>)}
              </select>
            </label>
            <label className="loc-check" title="Hides what is for the game master only">
              <input type="checkbox" checked={player} onChange={(e) => setPlayer(e.target.checked)} />
              <span>Player view</span>
            </label>
          </Popover>
        )}
        {map && (
          <Popover label="Export" icon="download">
            <label className="loc-row">
              <span>Format</span>
              <select aria-label="Export format" value={exportId} onChange={(e) => setExportId(e.target.value as ExportId)}>
                {EXPORTS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
              </select>
            </label>
            <button className="primary" disabled={exporting} onClick={() => {
              setExporting(true)
              setExportError('')
              runExport(exportId, project, location, map).catch((e: unknown) => setExportError(e instanceof Error ? e.message : String(e))).finally(() => setExporting(false))
            }}>{exporting ? 'Exporting…' : 'Export'}</button>
            {exportError && <span className="loc-error" role="alert">{exportError}</span>}
          </Popover>
        )}
        {type && map && <button className="loc-btn" data-guide="generate-map" title="Roll every layer again with a new seed; pinned objects and kept areas stay" onClick={generate}><ToolIcon name="dice" />New map</button>}
        <span className="loc-sep" />
        <button className="loc-icon-btn" aria-pressed={panelOpen} aria-label={panelOpen ? 'Hide side panel' : 'Show side panel'} title={panelOpen ? 'Hide side panel' : 'Show side panel'} onClick={() => setPanelOpen(!panelOpen)}><ToolIcon name="panel" /></button>
        <button className="loc-icon-btn" aria-pressed={full} aria-label={full ? 'Exit full screen' : 'Full screen'} title={full ? 'Exit full screen (Esc)' : 'Full screen'} onClick={() => setFull(!full)}><ToolIcon name={full ? 'shrink' : 'expand'} /></button>
      </div>

      <div className="loc-body" style={{ gridTemplateColumns: columns }}>
        {map && (
          <div className="loc-rail" role="toolbar" aria-label="Tools" aria-orientation="vertical">
            {tools.map(([t, label, title]) => (
              <button key={t} aria-label={label} aria-pressed={activeTool === t} title={`${label} (${TOOL_KEY[t].toUpperCase()}) — ${title}`} onClick={() => setTool(t)}>
                <ToolIcon name={t} />
              </button>
            ))}
          </div>
        )}

        <div className="loc-canvas-wrap">
          {!type && (
            <div className="loc-empty">
              <strong>No generator for this type</strong>
              <p className="muted">
                {location.type ? `There is no map generator for ${location.type} locations yet.` : 'Choose a type for this location first.'} Available so far: {supported}.
              </p>
            </div>
          )}
          {type && !map && (
            <div className="loc-empty">
              <strong>No map yet</strong>
              <p className="muted">
                Fill in the inputs on the right, then generate. The map is drawn in layers; each layer can be rolled again on its own later.
                {stored && ` The stored map was made for a ${stored.type} and no longer fits.`}
              </p>
              <button className="primary" data-guide="generate-map" onClick={generate}>Generate map</button>
            </div>
          )}
          {type && map && (
            <>
              <div ref={canvas} className="loc-canvas" onPointerDownCapture={startPan}>
                <div className="loc-zoom" style={{ width: `${zoom * 100}%`, height: `${zoom * 100}%` }}>
                  <MapStage
                    project={project}
                    location={location}
                    map={draft ?? map}
                    selected={object ? picked : null}
                    onSelect={setPicked}
                    commit={commit}
                    onDuplicate={duplicate}
                    overlay={overlayNode}
                    player={player}
                    tool={activeTool}
                    brush={brush}
                    onMask={keepArea}
                    onOpen={onSelect}
                    onSplit={(id, at) => {
                      commit(splitRoom(map, id, at, newObjectId()), undefined, 'Split room')
                      setTool('select')
                    }}
                  />
                </div>
              </div>
              {PAINT[activeTool] && (
                <label className="loc-float loc-brush">
                  <span>Brush</span>
                  <input type="range" min={8} max={80} value={brush} aria-label="Brush size" onChange={(e) => setBrush(Number(e.target.value))} />
                  <span className="num">{brush}</span>
                </label>
              )}
              <div className="loc-float loc-zoombar" role="group" aria-label="Zoom">
                <button aria-label="Zoom out" disabled={zoom <= ZOOM_MIN} onClick={() => zoomBy(1 / 1.25)}>−</button>
                <button className="num" title="Fit the whole map" onClick={() => setZoom(1)}>{Math.round(zoom * 100)}%</button>
                <button aria-label="Zoom in" disabled={zoom >= ZOOM_MAX} onClick={() => zoomBy(1.25)}>+</button>
              </div>
              {player && <span className="loc-float loc-flag">Player view</span>}
            </>
          )}
        </div>

        {panelOpen && (
          <div className="loc-side">
            <div className="loc-tabs" role="tablist" aria-label="Side panel">
              <button role="tab" aria-selected={shownTab === 'map'} disabled={!map} onClick={() => setTab('map')}>Map</button>
              <button role="tab" aria-selected={shownTab === 'inputs'} onClick={() => setTab('inputs')}>Inputs</button>
            </div>
            <div ref={panel} className="loc-side-scroll">
              {shownTab === 'inputs' && (inspectorFor?.(location.id) ?? <p className="muted loc-pad">Open the location in the Gallery or Table view to edit its inputs.</p>)}
              {map && type && (
                <div hidden={shownTab !== 'map'}>
                  {object ? (
                    <ObjectPanel
                      map={map}
                      object={object.object}
                      layerLabel={type.layers.find((l) => l.id === object.layerId)?.label ?? object.layerId}
                      commit={commit}
                      onDuplicate={() => duplicate(object.object.id)}
                      onDeleted={() => setPicked(null)}
                      onMask={() => keepArea(maskAround(object.object))}
                      onClose={() => setPicked(null)}
                      linkName={object.object.link ? nameOfId(object.object.link.locationId) : undefined}
                      onOpen={onSelect}
                      onCreateLinked={createLinked}
                    />
                  ) : (
                    <section className="loc-object" aria-label="Add object">
                      <div className="loc-object-head">
                        <strong>Nothing selected</strong>
                      </div>
                      <p className="muted">Click something on the map to edit it. Drag to move, use the handles to resize, turn or bend; Delete removes it, arrow keys nudge.</p>
                      {addable.length > 0 && (
                        <div className="loc-row">
                          <select aria-label="Object to add" value={adding || addable[0].value} onChange={(e) => setAdding(e.target.value)}>
                            {addable.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
                          </select>
                          <button className="small" onClick={add}>+ Add</button>
                        </div>
                      )}
                    </section>
                  )}

                  <Panel title="Layers" meta={stale.length > 0 && <span className="loc-stale">{stale.length} out of date</span>}>
                    <aside className="loc-layers" aria-label="Layers">
                      {stale.length > 0 && <button className="small loc-wide" onClick={() => commit(regenerateStale(project, location, map), undefined, 'Update out of date')}>Update {stale.length} out of date</button>}
                      <ul>
                        {[...type.layers].reverse().map((l) => {
                          const layer = map.layers[l.id]
                          return (
                            <li key={l.id} className={(layer?.hidden ? 'off' : '') + (layer?.locked ? ' locked' : '')}>
                              <label>
                                <input type="checkbox" checked={!layer?.hidden} onChange={(e) => commit(setLayerHidden(map, l.id, !e.target.checked), undefined, `${e.target.checked ? 'Show' : 'Hide'} ${l.label}`)} aria-label={`Show ${l.label}`} />
                                <span>{l.label}</span>
                              </label>
                              {layer?.stale && <span className="loc-stale" title="A layer below has changed since this one was generated">out of date</span>}
                              <span className="muted num">{layer?.objects.length ?? 0}</span>
                              <button className="loc-mini loc-lock" aria-pressed={!!layer?.locked} aria-label={`Lock ${l.label}`} title={layer?.locked ? 'Locked: not edited and not regenerated. Click to unlock.' : 'Lock: a locked layer is not edited and not regenerated'} onClick={() => commit(setLayerLocked(map, l.id, !layer?.locked), undefined, `${layer?.locked ? 'Unlock' : 'Lock'} ${l.label}`)}>
                                {layer?.locked ? '🔒' : '🔓'}
                              </button>
                              <button className="loc-mini" disabled={!!layer?.locked} title="Roll this layer again; pinned objects and the other layers stay" aria-label={`Regenerate ${l.label}`} onClick={() => commit(regenerateLayer(project, location, map, l.id), undefined, `Reroll ${l.label}`)}>↻</button>
                            </li>
                          )
                        })}
                      </ul>
                      {!!map.masks?.length && (
                        <>
                          <span className="loc-sub">Kept areas</span>
                          <ul className="loc-masks-list">
                            {map.masks.map((m) => (
                              <li key={m.id}>
                                <span>{m.label ?? 'Kept area'}</span>
                                <span className="spacer" />
                                <button className="loc-mini" aria-label={`Remove ${m.label ?? 'kept area'}`} title="Remove" onClick={() => commit(removeMask(map, m.id), undefined, 'Remove kept area')}>×</button>
                              </li>
                            ))}
                          </ul>
                        </>
                      )}
                    </aside>
                  </Panel>

                  <Panel id={`loc-checks-${location.id}`} title="Checks" open={checks.length > 0} meta={<span className={'loc-count ' + (checks.length ? 'warn' : 'ok')}>{checks.length || '✓'}</span>}>
                    <MapChecks checks={checks} onPick={setPicked} />
                  </Panel>

                  <Panel title="Generator">
                    <label className="loc-row">
                      <span>Seed</span>
                      <input
                        type="number"
                        aria-label="Seed"
                        min={0}
                        value={map.seed}
                        onChange={(e) => commit(generateMap(project, location, Math.max(0, Math.floor(Number(e.target.value) || 0)), map), `loc-seed-${location.id}`, 'Change seed')}
                      />
                    </label>
                    <ParamSliders project={project} location={location} map={map} type={type} commit={commit} onDraft={setDraft} />
                  </Panel>

                  <Panel title="Versions" open={false} meta={!!map.snapshots?.length && <span className="loc-count">{map.snapshots.length}</span>}>
                    <VersionsPanel project={project} location={location} map={map} commit={commit} />
                  </Panel>

                  <Panel title="History" open={false}>
                    <HistoryPanel />
                  </Panel>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
