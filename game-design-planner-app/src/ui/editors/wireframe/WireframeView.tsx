import { useCallback, useEffect, useRef, useState } from 'react'
import { makeId } from '../../../core/model/project'
import type { Entity, Project } from '../../../core/model/types'
import {
  artboardOf,
  cloneElements,
  entryScreen,
  kindDef,
  layoutIssues,
  layoutOf,
  layoutRules,
  layoutSvg,
  newElement,
  reorder,
  safeRect,
  visibleIn,
  WIRE_KINDS,
  type Issue,
  type Rect,
  type WireAction,
  type WireElement,
  type WireGroup,
} from '../../../core/ui'
import { applyTemplate, TEMPLATES } from '../../../core/uiTemplates'
import { useStore } from '../../../core/store/store'
import { useProject, useSection } from '../../hooks'
import type { ViewProps } from '../CollectionEditor'
import { Artboard, type MenuAction } from './Artboard'
import { ChecksPanel, LayersPanel, PropertiesPanel, ScreenRail, screensWithLayouts } from './Panels'

/** What the artboard and panels need from the editor shell. */
export type Editor = {
  project: Project
  screenId: string
  screenName: string
  elements: WireElement[]
  visible: WireElement[]
  sel: string[]
  setSel: (ids: string[]) => void
  write: (fn: (els: WireElement[]) => WireElement[] | void, key?: string) => void
  gestureKey: () => string
  addElement: (kind: string, x?: number, y?: number) => void
  focus: () => void
  onStage: (el: HTMLDivElement | null) => void
  zoom: number
  board: { w: number; h: number }
  full: { w: number; h: number }
  safe: Rect
  grid: number
  preview: boolean
  showGrid: boolean
  showSafe: boolean
  showChecks: boolean
  showPins: boolean
  issues: Map<string, Issue[]>
  backdropSvg?: string
}

const GROUPS: WireGroup[] = ['Layout', 'Text', 'Controls', 'Content', 'HUD']
let gestureCounter = 0

/** The per-screen wireframe editor (Screens › Wireframe). Edits `screens[i].layout`; one undo step per gesture. */
export function WireframeView({ items, selected, onSelect }: ViewProps) {
  const project = useProject()
  const { update } = useSection<Entity[]>('design.ui', 'screens')
  const screens = items
  const screen = screens.find((s) => s.id === selected) ?? screens[0]
  const rootRef = useRef<HTMLDivElement>(null)
  const clipboard = useRef<WireElement[]>([])
  const [sel, setSel] = useState<string[]>([])
  const [selFor, setSelFor] = useState<string | undefined>(screen?.id)
  const [mode, setMode] = useState<'edit' | 'preview'>('edit')
  const [state, setState] = useState('')
  const [zoomSetting, setZoom] = useState<'fit' | number>('fit')
  const [toggles, setToggles] = useState({ grid: true, safe: true, checks: true, pins: true })
  const [history, setHistory] = useState<string[]>([])
  const [stageEl, setStageEl] = useState<HTMLDivElement | null>(null)
  const [stage, setStage] = useState({ w: 1000, h: 600 })
  const [panning, setPanning] = useState(false)
  const [focusMode, setFocusMode] = useState(false)

  // Selection belongs to a screen: switching screens starts with nothing selected.
  if (screen && selFor !== screen.id) {
    setSelFor(screen.id)
    setSel([])
  }

  // Stable (built only from state setters), so the stage ref callback in Artboard is stable too. It measures once on
  // mount; the observer below follows later size changes.
  const onStage = useCallback((el: HTMLDivElement | null) => {
    setStageEl(el)
    const box = el?.parentElement
    if (box && box.clientWidth > 0 && box.clientHeight > 0) {
      const w = Math.floor(box.clientWidth)
      const h = Math.floor(box.clientHeight)
      setStage((s) => (s.w === w && s.h === h ? s : { w, h }))
    }
  }, [])

  useEffect(() => {
    // Measure the stage's non-scrolling parent: the stage's own content box shrinks when scrollbars appear, which
    // would change the fit zoom, which would toggle the scrollbars again (a resize loop).
    const box = stageEl?.parentElement
    if (!box || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([e]) => {
      const w = Math.floor(e.contentRect.width)
      const h = Math.floor(e.contentRect.height)
      setStage((s) => (s.w === w && s.h === h ? s : { w, h }))
    })
    ro.observe(box)
    return () => ro.disconnect()
  }, [stageEl])

  const rules = layoutRules(project)
  const board = artboardOf(project, screen)
  const full = { w: Math.max(board.w, rules.width), h: Math.max(board.h, rules.height) }
  // 48 px padding plus 2 px stage border plus a pixel of slack, floored to 0.1 %: the fitted artboard always fits.
  const fit = Math.max(0.05, Math.min(4, Math.floor(Math.min((stage.w - 51) / full.w, (stage.h - 51) / full.h) * 1000) / 1000))
  const zoom = zoomSetting === 'fit' ? fit : zoomSetting
  const zoomTo = (z: number) => setZoom(Math.max(0.1, Math.min(4, Math.round(z * 100) / 100)))

  useEffect(() => {
    if (!stageEl) return
    const h = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      setZoom((z) => {
        const cur = z === 'fit' ? fit : z
        return Math.max(0.1, Math.min(4, Math.round(cur * (e.deltaY < 0 ? 1.15 : 1 / 1.15) * 100) / 100))
      })
    }
    stageEl.addEventListener('wheel', h, { passive: false })
    return () => stageEl.removeEventListener('wheel', h)
  }, [stageEl, fit])

  if (!screen) return <p className="empty">Add a screen to start its wireframe.</p>

  const elements = layoutOf(screen)
  const preview = mode === 'preview'
  const visible = elements.filter((e) => visibleIn(e, state) && !e.hidden)
  const issues = new Map<string, Issue[]>()
  for (const i of layoutIssues(project, screen)) issues.set(i.elementId, [...(issues.get(i.elementId) ?? []), i])
  const states: string[] = Array.isArray(screen.states) ? screen.states.filter(Boolean) : []

  const write = (fn: (els: WireElement[]) => WireElement[] | void, key?: string) =>
    update((d) => {
      const s = d.find((x) => x.id === screen.id)
      if (!s) return
      if (!s.layout || typeof s.layout !== 'object') s.layout = { elements: [] }
      if (!Array.isArray(s.layout.elements)) s.layout.elements = []
      const out = fn(s.layout.elements)
      if (out) s.layout.elements = out
    }, key)
  const gestureKey = () => `wf-g-${++gestureCounter}`

  const addElement = (kind: string, x?: number, y?: number) => {
    const d = kindDef(kind)
    const panel = elements.find((e) => sel.length === 1 && e.id === sel[0] && e.kind === 'panel')
    let px = x ?? (panel ? panel.x + 24 : Math.round((board.w - d.w) / 2))
    let py = y ?? (panel ? panel.y + 24 : Math.round((board.h - d.h) / 2))
    if (x === undefined) while (elements.some((e) => e.x === px && e.y === py)) {
      px += 16
      py += 16
    }
    const g = rules.grid > 0 && toggles.grid ? rules.grid : 1
    const el = newElement(kind, Math.round(px / g) * g, Math.round(py / g) * g, state ? { states: [state] } : {})
    write((els) => void els.push(el), gestureKey())
    setSel([el.id])
    rootRef.current?.focus({ preventScroll: true })
  }

  const run = (a: MenuAction) => {
    const picked = elements.filter((e) => sel.includes(e.id))
    const step = rules.grid || 8
    switch (a) {
      case 'duplicate': {
        const copies = cloneElements(picked, step, step)
        write((els) => [...els, ...copies], gestureKey())
        setSel(copies.map((c) => c.id))
        break
      }
      case 'copy':
        clipboard.current = JSON.parse(JSON.stringify(picked))
        break
      case 'paste': {
        if (!clipboard.current.length) break
        const copies = cloneElements(clipboard.current, step, step)
        clipboard.current = copies.map((c) => ({ ...c }))
        write((els) => [...els, ...copies], gestureKey())
        setSel(copies.map((c) => c.id))
        break
      }
      case 'forward':
      case 'backward':
      case 'front':
      case 'back':
        write((els) => reorder(els, sel, a), gestureKey())
        break
      case 'lock': {
        const lock = !picked.every((e) => e.locked)
        write((els) => els.forEach((e) => sel.includes(e.id) && (lock ? (e.locked = true) : delete e.locked)), gestureKey())
        if (lock) setSel([])
        break
      }
      case 'hide':
        write((els) => els.forEach((e) => sel.includes(e.id) && (e.hidden = true)), gestureKey())
        setSel([])
        break
      case 'delete':
        write((els) => els.filter((e) => !sel.includes(e.id) || e.locked), gestureKey())
        setSel([])
        break
    }
  }

  const nudge = (dx: number, dy: number) =>
    write((els) => {
      for (const e of els)
        if (sel.includes(e.id) && !e.locked) {
          e.x += dx
          e.y += dy
        }
    }, `wf-nudge-${screen.id}-${sel.join(',')}`)

  const onKeyDown = (e: React.KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
    const mod = e.ctrlKey || e.metaKey
    const k = e.key
    if (k === ' ' && !preview) {
      setPanning(true)
      e.preventDefault()
      return
    }
    if (preview) {
      if (k === 'Escape' || k === 'Backspace') navigate({ kind: 'back' })
      return
    }
    if (k === 'Escape') return setSel([])
    if (mod && k.toLowerCase() === 'a') {
      e.preventDefault()
      return setSel(visible.filter((x) => !x.locked).map((x) => x.id))
    }
    if (mod && k.toLowerCase() === 'v') {
      e.preventDefault()
      return run('paste')
    }
    if (!sel.length) return
    const step = e.shiftKey ? rules.grid || 10 : 1
    const arrows: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }
    if (arrows[k]) {
      e.preventDefault()
      return nudge(...arrows[k])
    }
    if (k === 'Delete' || k === 'Backspace') {
      e.preventDefault()
      return run('delete')
    }
    if (!mod) return
    const map: Record<string, MenuAction> = { d: 'duplicate', c: 'copy', l: 'lock' }
    if (map[k.toLowerCase()]) {
      e.preventDefault()
      return run(map[k.toLowerCase()])
    }
    if (k === ']' || k === '}') {
      e.preventDefault()
      return run(e.shiftKey ? 'front' : 'forward')
    }
    if (k === '[' || k === '{') {
      e.preventDefault()
      return run(e.shiftKey ? 'back' : 'backward')
    }
  }

  const pick = (id: string) => {
    onSelect(id)
    setHistory([])
  }
  const navigate = (a: WireAction) => {
    if (a.kind === 'opens' && a.screen && screens.some((s) => s.id === a.screen)) {
      setHistory([...history, screen.id])
      onSelect(a.screen)
    } else if (a.kind !== 'opens') {
      const prev = history.at(-1) ?? (screen.id !== entryScreen(project)?.id ? entryScreen(project)?.id : undefined)
      if (prev) {
        setHistory(history.slice(0, -1))
        onSelect(prev)
      }
    }
  }
  const prevScreen = preview && history.length && (screen.kind === 'Window' || screen.kind === 'Popup' || screen.kind === 'Overlay') ? screens.find((s) => s.id === history.at(-1)) : undefined

  const ed: Editor = {
    project,
    screenId: screen.id,
    screenName: String(screen.name ?? ''),
    elements,
    visible,
    sel,
    setSel,
    write,
    gestureKey,
    addElement,
    focus: () => rootRef.current?.focus({ preventScroll: true }),
    onStage,
    zoom,
    board,
    full,
    safe: safeRect(project, screen),
    grid: rules.grid || 8,
    preview,
    showGrid: toggles.grid,
    showSafe: toggles.safe,
    showChecks: toggles.checks,
    showPins: toggles.pins,
    issues,
    backdropSvg: prevScreen ? layoutSvg(project, prevScreen) : undefined,
  }
  const toggle = (k: keyof typeof toggles, label: string) => (
    <button className={'wf-toggle-btn' + (toggles[k] ? ' on' : '')} aria-pressed={toggles[k]} onClick={() => setToggles({ ...toggles, [k]: !toggles[k] })}>
      {label}
    </button>
  )
  const templates = [...TEMPLATES].sort((a, b) => Number(b.forKinds.includes(screen.kind)) - Number(a.forKinds.includes(screen.kind)))
  const copyable = screensWithLayouts(screens).filter((s) => s.id !== screen.id)
  const issueCount = [...issues.values()].flat().filter((i) => i.level !== 'info').length

  return (
    <div className={'wf-root' + (focusMode ? ' focus' : '')} ref={rootRef} data-stage={`${stage.w}x${stage.h}${stageEl ? '' : ' (unmeasured)'}`} tabIndex={-1} onKeyDown={onKeyDown} onKeyUp={(e) => e.key === ' ' && setPanning(false)} data-testid="wf-root">
      <div className="wf-topbar">
        <strong className="wf-title">{screen.name}</strong>
        <span className="muted small">{screen.kind ?? 'Screen'} · {board.w}×{board.h}</span>
        <div className="wf-seg" role="group" aria-label="Mode">
          <button className={!preview ? 'on' : ''} aria-pressed={!preview} onClick={() => setMode('edit')}>Edit</button>
          <button className={preview ? 'on' : ''} aria-pressed={preview} onClick={() => { setMode('preview'); setSel([]); setHistory([]) }}>Preview</button>
        </div>
        {states.length > 0 && (
          <label className="row">
            <span className="muted small">State</span>
            <select aria-label="State" value={state} onChange={(e) => setState(e.target.value)}>
              <option value="">All</option>
              {states.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
        )}
        {!preview && (
          <>
            {toggle('grid', 'Grid')}
            {toggle('safe', 'Safe area')}
            {toggle('checks', `Checks${issueCount ? ` (${issueCount})` : ''}`)}
            {toggle('pins', 'Notes')}
          </>
        )}
        {preview && (
          <span className="wf-crumbs muted small" aria-label="Path">
            {[...history, screen.id].map((id) => screens.find((s) => s.id === id)?.name).join(' › ')}
            {history.length > 0 && <button className="small" onClick={() => navigate({ kind: 'back' })}>← Back</button>}
          </span>
        )}
        <span className="spacer" />
        <div className="wf-zoom" role="group" aria-label="Zoom">
          <button className="icon" aria-label="Zoom out" onClick={() => zoomTo(zoom / 1.25)}>−</button>
          <span className="small" data-testid="wf-zoom">{Math.round(zoom * 100)}%</span>
          <button className="icon" aria-label="Zoom in" onClick={() => zoomTo(zoom * 1.25)}>+</button>
          <button className="small" onClick={() => setZoom('fit')}>Fit</button>
          <button className="small" onClick={() => setZoom(1)}>100%</button>
        </div>
        <button className={'small' + (focusMode ? ' active' : '')} aria-pressed={focusMode} title="Use the whole window for the editor" onClick={() => { setFocusMode(!focusMode); setZoom('fit') }}>{focusMode ? 'Exit focus' : '⤢ Focus'}</button>
        <button className="icon" title="Undo (Ctrl+Z)" aria-label="Undo" onClick={() => useStore.getState().undo()}>⟲</button>
        <button className="icon" title="Redo (Ctrl+Y)" aria-label="Redo" onClick={() => useStore.getState().redo()}>⟳</button>
      </div>
      {!preview && (
        <div className="wf-palette" role="toolbar" aria-label="Elements">
          {GROUPS.map((g) => (
            <div key={g} className="wf-palette-group">
              <span className="wf-palette-label">{g}</span>
              {WIRE_KINDS.filter((k) => k.group === g).map((k) => (
                <button
                  key={k.kind}
                  className="wf-palette-item"
                  title={`Add ${k.label} (or drag it onto the screen)`}
                  aria-label={`Add ${k.label}`}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData('application/x-wire-kind', k.kind)}
                  onClick={() => addElement(k.kind)}
                >
                  <span className="wf-palette-icon">{k.icon}</span>
                  <span>{k.label}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
      <div className={'wf-body' + (preview ? ' preview' : '')}>
        <aside className="wf-left">
          <ScreenRail
            ed={ed}
            screens={screens}
            onPick={pick}
            onAdd={() => {
              const id = makeId()
              update((d) => void d.push({ id, name: 'New screen', kind: 'Window' }), gestureKey())
              pick(id)
            }}
            onRename={(id, name) => update((d) => void (d.find((x) => x.id === id)!.name = name), gestureKey())}
          />
          {!preview && <LayersPanel ed={ed} />}
        </aside>
        <div className="wf-center">
          <Artboard ed={ed} onNavigate={navigate} onMenu={run} panning={panning} />
          {!preview && elements.length === 0 && (
            <div className="wf-empty" role="region" aria-label="Start this wireframe">
              <strong>Start {screen.name}</strong>
              <p className="muted small">Pick a template built from your project’s data, or add elements from the palette above.</p>
              <div className="row">
                {templates.map((t) => (
                  <button key={t.id} className={t.forKinds.includes(screen.kind) ? 'primary' : ''} onClick={() => useStore.getState().mutate((p) => applyTemplate(p, screen.id, t.id))}>
                    {t.label}
                  </button>
                ))}
              </div>
              {copyable.length > 0 && (
                <label className="row">
                  <span className="muted small">Copy from</span>
                  <select
                    aria-label="Copy layout from screen"
                    value=""
                    onChange={(e) => {
                      const src = screens.find((s) => s.id === e.target.value)
                      if (src) write(() => cloneElements(layoutOf(src), 0, 0), gestureKey())
                    }}
                  >
                    <option value="">— screen —</option>
                    {copyable.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </label>
              )}
            </div>
          )}
        </div>
        {!preview && (
          <aside className="wf-right">
            <PropertiesPanel ed={ed} screens={screens} screen={screen} />
            {toggles.checks && <ChecksPanel ed={ed} />}
          </aside>
        )}
      </div>
    </div>
  )
}
