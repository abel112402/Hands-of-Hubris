import { nanoid } from 'nanoid'
import type { CatalogItem, Entity, Project } from './model/types'

// Not makeId from model/project: that module imports the module registry, which imports this file.
const makeId = () => nanoid(8)

/**
 * UI / UX analysis: wireframe geometry and snapping, layout checks, screen-flow reachability, HUD coverage against the
 * game data, and control conflicts. Pure functions; text widths are estimates (no DOM measuring).
 */
export const UI_DOC = 'design.ui'

// ---------- Vocabulary ----------

export const SCREEN_KINDS = ['HUD', 'Fullscreen menu', 'Window', 'Popup', 'Overlay']
export const UI_SYSTEMS = ['Items', 'Player', 'World', 'Town', 'NPC', 'Trade', 'Factions', 'Story', 'Combat', 'Settings', 'Other']
export const RESOLUTIONS: Record<string, [number, number]> = {
  '1920×1080': [1920, 1080],
  '2560×1440': [2560, 1440],
  '1280×800 (Steam Deck)': [1280, 800],
  '1280×720': [1280, 720],
}
export const DEFAULT_RESOLUTION = '1920×1080'
export const TEXT_SIZES: Record<string, number> = { S: 14, M: 18, L: 24, XL: 32 }

export type BindSource = 'survivalStat' | 'currency' | 'resource' | 'item' | 'quest' | 'clock' | 'hotbar' | 'inventory'
export type WireGroup = 'Layout' | 'Text' | 'Controls' | 'Content' | 'HUD'
export type WireKindDef = {
  kind: string
  group: WireGroup
  label: string
  icon: string
  w: number
  h: number
  text?: string
  textSize?: keyof typeof TEXT_SIZES
  /** Clickable: checked against the minimum target size and may carry an action. */
  interactive?: boolean
  /** Text on one line: checked for fit at the text expansion. */
  singleLine?: boolean
  /** Data it can show; a HUD widget with sources must be bound. */
  bind?: BindSource[]
  hud?: boolean
  /** Exempt from the safe-area check (backgrounds). */
  bleed?: boolean
  props?: Record<string, string | number | boolean>
}

export const WIRE_KINDS: WireKindDef[] = [
  { kind: 'panel', group: 'Layout', label: 'Panel', icon: '▭', w: 480, h: 320, text: '', bleed: true },
  { kind: 'divider', group: 'Layout', label: 'Divider', icon: '─', w: 320, h: 2, bleed: true },
  { kind: 'spacer', group: 'Layout', label: 'Spacer', icon: '⬚', w: 80, h: 80, bleed: true },
  { kind: 'heading', group: 'Text', label: 'Heading', icon: 'H', w: 360, h: 48, text: 'Heading', textSize: 'L', singleLine: true },
  { kind: 'text', group: 'Text', label: 'Text', icon: 'T', w: 360, h: 72, text: '', textSize: 'M' },
  { kind: 'label', group: 'Text', label: 'Label', icon: 'a', w: 160, h: 28, text: 'Label', textSize: 'M', singleLine: true },
  { kind: 'button', group: 'Controls', label: 'Button', icon: '▢', w: 180, h: 48, text: 'Button', textSize: 'M', interactive: true, singleLine: true, props: { variant: 'Primary' } },
  { kind: 'iconButton', group: 'Controls', label: 'Icon button', icon: '◻', w: 48, h: 48, interactive: true },
  { kind: 'toggle', group: 'Controls', label: 'Toggle', icon: '⊙', w: 64, h: 32, interactive: true },
  { kind: 'checkbox', group: 'Controls', label: 'Checkbox', icon: '☑', w: 220, h: 36, text: 'Option', textSize: 'M', interactive: true, singleLine: true },
  { kind: 'slider', group: 'Controls', label: 'Slider', icon: '═', w: 260, h: 36, interactive: true },
  { kind: 'dropdown', group: 'Controls', label: 'Dropdown', icon: '▾', w: 260, h: 44, text: 'Select…', textSize: 'M', interactive: true, singleLine: true },
  { kind: 'input', group: 'Controls', label: 'Text input', icon: '⌨', w: 300, h: 44, text: 'Enter text', textSize: 'M', interactive: true, singleLine: true },
  { kind: 'tabs', group: 'Controls', label: 'Tabs', icon: '⊟', w: 480, h: 44, interactive: true, props: { tabs: 3 } },
  { kind: 'list', group: 'Content', label: 'List', icon: '☰', w: 340, h: 260, props: { rows: 5 } },
  { kind: 'grid', group: 'Content', label: 'Grid', icon: '▦', w: 384, h: 256, bind: ['inventory'], props: { rows: 4, cols: 6 } },
  { kind: 'image', group: 'Content', label: 'Image', icon: '🖼', w: 240, h: 160, bleed: true },
  { kind: 'icon', group: 'Content', label: 'Icon', icon: '●', w: 40, h: 40 },
  { kind: 'portrait', group: 'Content', label: 'Portrait', icon: '☺', w: 128, h: 128 },
  { kind: 'tooltip', group: 'Content', label: 'Tooltip', icon: '💬', w: 240, h: 88, text: 'Tooltip text', textSize: 'M' },
  { kind: 'statBar', group: 'HUD', label: 'Stat bar', icon: '▮', w: 260, h: 28, bind: ['survivalStat', 'resource'], hud: true },
  { kind: 'counter', group: 'HUD', label: 'Counter', icon: '#', w: 150, h: 40, bind: ['currency', 'resource', 'item'], hud: true },
  { kind: 'clock', group: 'HUD', label: 'Clock', icon: '◷', w: 96, h: 96, bind: ['clock'], hud: true },
  { kind: 'minimap', group: 'HUD', label: 'Minimap', icon: '◍', w: 220, h: 220 },
  { kind: 'hotbar', group: 'HUD', label: 'Hotbar', icon: '▤', w: 560, h: 64, bind: ['hotbar'], hud: true, props: { slots: 8 } },
  { kind: 'questTracker', group: 'HUD', label: 'Quest tracker', icon: '✎', w: 320, h: 110, bind: ['quest'] },
  { kind: 'toast', group: 'HUD', label: 'Toast', icon: '🔔', w: 340, h: 72, text: 'Notification', textSize: 'M' },
  { kind: 'crosshair', group: 'HUD', label: 'Crosshair', icon: '+', w: 32, h: 32 },
  { kind: 'dialog', group: 'HUD', label: 'Dialog box', icon: '🗨', w: 960, h: 220, text: 'Speaker', textSize: 'M' },
]
export const kindDef = (kind: string): WireKindDef => WIRE_KINDS.find((k) => k.kind === kind) ?? WIRE_KINDS[0]

export type WireAction = { kind: 'opens' | 'closes' | 'back'; screen?: string }
export type WireElement = {
  id: string
  kind: string
  x: number
  y: number
  w: number
  h: number
  text?: string
  props?: Record<string, string | number | boolean>
  bind?: { source: BindSource; id?: string }
  action?: WireAction
  states?: string[]
  locked?: boolean
  hidden?: boolean
  note?: string
}
export type WireLayout = { elements: WireElement[] }

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const listOf = (project: Project, docId: string, section: string): Entity[] => {
  const d = project.documents[docId]?.data[section]
  return Array.isArray(d) ? d : []
}
const formOf = (project: Project, docId: string, section: string): Record<string, any> => {
  const d = project.documents[docId]?.data[section]
  return d && typeof d === 'object' && !Array.isArray(d) ? d : {}
}
const nameOf = (e?: Entity) => (e ? String(e.name ?? '') || '(unnamed)' : '⚠ missing')

export const screensOf = (project: Project) => listOf(project, UI_DOC, 'screens')
export const uiList = (project: Project, section: string) => listOf(project, UI_DOC, section)
export const uiForm = (project: Project, section: string) => formOf(project, UI_DOC, section)
export const layoutOf = (screen?: Entity): WireElement[] => (Array.isArray(screen?.layout?.elements) ? screen!.layout.elements : [])

/** A new element of a kind, with its default size, text and props. */
export function newElement(kind: string, x: number, y: number, extra: Partial<WireElement> = {}): WireElement {
  const d = kindDef(kind)
  return {
    id: makeId(),
    kind: d.kind,
    x: Math.round(x),
    y: Math.round(y),
    w: d.w,
    h: d.h,
    ...(d.text ? { text: d.text } : {}),
    ...(d.props || d.textSize ? { props: { ...(d.textSize ? { textSize: d.textSize } : {}), ...(d.props ?? {}) } } : {}),
    ...(d.kind === 'clock' ? { bind: { source: 'clock' as const } } : {}),
    ...extra,
  }
}

// ---------- Layout rules ----------

export type LayoutRules = { resolution: string; width: number; height: number; safeArea: number; grid: number; minTextPx: number; minTargetPx: number; textExpansion: number }

export function layoutRules(project: Project): LayoutRules {
  const r = uiForm(project, 'layoutRules')
  const resolution = typeof r.resolution === 'string' && RESOLUTIONS[r.resolution] ? r.resolution : DEFAULT_RESOLUTION
  const [width, height] = RESOLUTIONS[resolution]
  const a11y = uiForm(project, 'accessibility')
  return {
    resolution,
    width,
    height,
    safeArea: isNum(r.safeArea) ? r.safeArea : 5,
    grid: isNum(r.grid) && r.grid >= 0 ? r.grid : 8,
    minTextPx: isNum(r.minTextPx) ? r.minTextPx : 18,
    minTargetPx: isNum(r.minTargetPx) ? r.minTargetPx : 32,
    textExpansion: isNum(a11y.textExpansion) ? a11y.textExpansion : 30,
  }
}

/** Artboard size: the screen's own size (windows, popups), else the target resolution. */
export function artboardOf(project: Project, screen?: Entity): { w: number; h: number } {
  const r = layoutRules(project)
  return { w: isNum(screen?.width) && screen!.width > 0 ? screen!.width : r.width, h: isNum(screen?.height) && screen!.height > 0 ? screen!.height : r.height }
}

export type Rect = { x: number; y: number; w: number; h: number }

/** The safe area: inset by the safe-area % of the full resolution (only full-size artboards are inset). */
export function safeRect(project: Project, screen?: Entity): Rect {
  const r = layoutRules(project)
  const b = artboardOf(project, screen)
  if (b.w !== r.width || b.h !== r.height) return { x: 0, y: 0, ...b }
  const dx = Math.round((b.w * r.safeArea) / 100)
  const dy = Math.round((b.h * r.safeArea) / 100)
  return { x: dx, y: dy, w: b.w - 2 * dx, h: b.h - 2 * dy }
}

// ---------- Geometry ----------

export const contains = (outer: Rect, inner: Rect) => inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h
export const intersects = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
export function bounds(rects: Rect[]): Rect {
  const x = Math.min(...rects.map((r) => r.x))
  const y = Math.min(...rects.map((r) => r.y))
  return { x, y, w: Math.max(...rects.map((r) => r.x + r.w)) - x, h: Math.max(...rects.map((r) => r.y + r.h)) - y }
}
/** Elements lying fully inside a container (excluding itself), e.g. what moves with a panel. */
export const elementsInside = (container: WireElement, all: WireElement[]) => all.filter((e) => e.id !== container.id && contains(container, e))

export type Guide = { axis: 'x' | 'y'; pos: number; from: number; to: number }
type Line = { pos: number; from: number; to: number }

const linesOf = (r: Rect, axis: 'x' | 'y'): Line[] =>
  axis === 'x'
    ? [r.x, r.x + r.w / 2, r.x + r.w].map((pos) => ({ pos, from: r.y, to: r.y + r.h }))
    : [r.y, r.y + r.h / 2, r.y + r.h].map((pos) => ({ pos, from: r.x, to: r.x + r.w }))

/** Best snap of a set of edges to target lines on one axis; null when nothing is within the threshold. */
function bestSnap(edges: number[], targets: Line[], threshold: number) {
  let best: { delta: number; line: Line } | null = null
  for (const e of edges)
    for (const t of targets) {
      const d = t.pos - e
      if (Math.abs(d) <= threshold && (!best || Math.abs(d) < Math.abs(best.delta))) best = { delta: d, line: t }
    }
  return best
}

export type SnapOpts = { others: Rect[]; board: Rect; safe?: Rect; grid: number; threshold: number; enabled?: boolean }

const targetsOf = (o: SnapOpts, axis: 'x' | 'y') => [o.board, ...(o.safe ? [o.safe] : []), ...o.others].flatMap((r) => linesOf(r, axis))

/** Snaps a moved rect: to the edges and centres of other elements, the artboard and the safe area, else to the grid. */
export function snapMove(rect: Rect, o: SnapOpts): { rect: Rect; guides: Guide[] } {
  if (o.enabled === false) return { rect: { ...rect, x: Math.round(rect.x), y: Math.round(rect.y) }, guides: [] }
  const out = { ...rect }
  const guides: Guide[] = []
  for (const axis of ['x', 'y'] as const) {
    const size = axis === 'x' ? rect.w : rect.h
    const start = axis === 'x' ? rect.x : rect.y
    const hit = bestSnap([start, start + size / 2, start + size], targetsOf(o, axis), o.threshold)
    let next = start
    if (hit) {
      next = start + hit.delta
      const span = axis === 'x' ? [out.y, out.y + out.h] : [out.x, out.x + out.w]
      guides.push({ axis, pos: hit.line.pos, from: Math.min(span[0], hit.line.from), to: Math.max(span[1], hit.line.to) })
    } else if (o.grid > 0) next = Math.round(start / o.grid) * o.grid
    if (axis === 'x') out.x = Math.round(next)
    else out.y = Math.round(next)
  }
  return { rect: out, guides }
}

export type Handle = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw'

/** Resizes by a handle and a pointer delta; only the moving edges snap. Shift keeps the start aspect ratio. */
export function resizeRect(start: Rect, handle: Handle, dx: number, dy: number, o: SnapOpts & { keepAspect?: boolean; min?: number }): { rect: Rect; guides: Guide[] } {
  const min = o.min ?? 8
  let left = start.x
  let top = start.y
  let right = start.x + start.w
  let bottom = start.y + start.h
  if (handle.includes('w')) left += dx
  if (handle.includes('e')) right += dx
  if (handle.includes('n')) top += dy
  if (handle.includes('s')) bottom += dy
  const guides: Guide[] = []
  if (o.enabled !== false) {
    const snapEdge = (value: number, axis: 'x' | 'y') => {
      const hit = bestSnap([value], targetsOf(o, axis), o.threshold)
      if (hit) {
        guides.push({ axis, pos: hit.line.pos, from: hit.line.from, to: hit.line.to })
        return value + hit.delta
      }
      return o.grid > 0 ? Math.round(value / o.grid) * o.grid : value
    }
    if (handle.includes('w')) left = snapEdge(left, 'x')
    if (handle.includes('e')) right = snapEdge(right, 'x')
    if (handle.includes('n')) top = snapEdge(top, 'y')
    if (handle.includes('s')) bottom = snapEdge(bottom, 'y')
  }
  if (right - left < min) {
    if (handle.includes('w')) left = right - min
    else right = left + min
  }
  if (bottom - top < min) {
    if (handle.includes('n')) top = bottom - min
    else bottom = top + min
  }
  let rect = { x: Math.round(left), y: Math.round(top), w: Math.round(right - left), h: Math.round(bottom - top) }
  if (o.keepAspect && start.w > 0 && start.h > 0) {
    const ratio = start.w / start.h
    if (handle === 'n' || handle === 's') rect = { ...rect, w: Math.round(rect.h * ratio) }
    else rect = { ...rect, h: Math.round(rect.w / ratio) }
    if (handle.includes('n')) rect.y = start.y + start.h - rect.h
    if (handle.includes('w')) rect.x = start.x + start.w - rect.w
  }
  return { rect, guides }
}

/** Gaps to the nearest neighbour on each side that overlaps in the other axis (shown as px badges while dragging). */
export function nearestGaps(r: Rect, others: Rect[]): { axis: 'x' | 'y'; from: number; to: number; at: number }[] {
  const out: { axis: 'x' | 'y'; from: number; to: number; at: number }[] = []
  const ov = (a0: number, a1: number, b0: number, b1: number) => Math.min(a1, b1) - Math.max(a0, b0) > 0
  const pick = (cands: { d: number; from: number; to: number; at: number; axis: 'x' | 'y' }[]) => {
    const c = cands.filter((x) => x.d >= 0).sort((a, b) => a.d - b.d)[0]
    if (c) out.push({ axis: c.axis, from: c.from, to: c.to, at: c.at })
  }
  const vy = (o: Rect) => (Math.max(r.y, o.y) + Math.min(r.y + r.h, o.y + o.h)) / 2
  const vx = (o: Rect) => (Math.max(r.x, o.x) + Math.min(r.x + r.w, o.x + o.w)) / 2
  const xs = others.filter((o) => ov(r.y, r.y + r.h, o.y, o.y + o.h))
  const ys = others.filter((o) => ov(r.x, r.x + r.w, o.x, o.x + o.w))
  pick(xs.map((o) => ({ d: r.x - (o.x + o.w), from: o.x + o.w, to: r.x, at: vy(o), axis: 'x' })))
  pick(xs.map((o) => ({ d: o.x - (r.x + r.w), from: r.x + r.w, to: o.x, at: vy(o), axis: 'x' })))
  pick(ys.map((o) => ({ d: r.y - (o.y + o.h), from: o.y + o.h, to: r.y, at: vx(o), axis: 'y' })))
  pick(ys.map((o) => ({ d: o.y - (r.y + r.h), from: r.y + r.h, to: o.y, at: vx(o), axis: 'y' })))
  return out
}

export type AlignMode = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom' | 'width' | 'height'

/** New positions (by id) aligning rects to the selection bounds, or matching the first rect's size. */
export function align<T extends Rect & { id: string }>(rects: T[], mode: AlignMode): Record<string, Rect> {
  const b = bounds(rects)
  const out: Record<string, Rect> = {}
  for (const r of rects) {
    const n = { x: r.x, y: r.y, w: r.w, h: r.h }
    if (mode === 'left') n.x = b.x
    if (mode === 'center') n.x = Math.round(b.x + (b.w - r.w) / 2)
    if (mode === 'right') n.x = b.x + b.w - r.w
    if (mode === 'top') n.y = b.y
    if (mode === 'middle') n.y = Math.round(b.y + (b.h - r.h) / 2)
    if (mode === 'bottom') n.y = b.y + b.h - r.h
    if (mode === 'width') n.w = rects[0].w
    if (mode === 'height') n.h = rects[0].h
    out[r.id] = n
  }
  return out
}

/** Even gaps between rects along an axis, keeping the first and last in place. */
export function distribute<T extends Rect & { id: string }>(rects: T[], axis: 'x' | 'y'): Record<string, Rect> {
  const pos = (r: Rect) => (axis === 'x' ? r.x : r.y)
  const size = (r: Rect) => (axis === 'x' ? r.w : r.h)
  const sorted = [...rects].sort((a, b) => pos(a) - pos(b))
  const out: Record<string, Rect> = Object.fromEntries(rects.map((r) => [r.id, { x: r.x, y: r.y, w: r.w, h: r.h }]))
  if (sorted.length < 3) return out
  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  const total = pos(last) + size(last) - pos(first)
  const gap = (total - sorted.reduce((s, r) => s + size(r), 0)) / (sorted.length - 1)
  let at = pos(first)
  for (const r of sorted) {
    out[r.id] = axis === 'x' ? { ...out[r.id], x: Math.round(at) } : { ...out[r.id], y: Math.round(at) }
    at += size(r) + gap
  }
  return out
}

// ---------- Text ----------

export const textPx = (e: WireElement) => TEXT_SIZES[String(e.props?.textSize ?? kindDef(e.kind).textSize ?? 'M')] ?? 18
/** Estimated width of a line of text: 0.55 em per character. */
export const textWidth = (text: string, px: number) => text.length * px * 0.55
const PADDING: Record<string, number> = { button: 32, dropdown: 48, input: 24, checkbox: 44 }
/** Width a single-line label needs at the text expansion, and whether it fits. */
export function textFit(e: WireElement, expansionPct: number): { need: number; fits: boolean } | null {
  if (!kindDef(e.kind).singleLine || !e.text) return null
  const need = Math.round(textWidth(e.text, textPx(e)) * (1 + expansionPct / 100) + (PADDING[e.kind] ?? 0))
  return { need, fits: need <= e.w }
}

// ---------- Layout checks ----------

export type IssueKind = 'outside' | 'unsafe' | 'smallText' | 'smallTarget' | 'overlap' | 'textFit' | 'unbound' | 'noAction' | 'deadLink'
export type Issue = { elementId: string; kind: IssueKind; level: 'danger' | 'warn' | 'info'; message: string }

const visibleTogether = (a: WireElement, b: WireElement) => !a.states?.length || !b.states?.length || a.states.some((s) => b.states!.includes(s))
const labelOf = (e: WireElement) => (e.text ? `‘${e.text}’` : kindDef(e.kind).label)

/** Problems of one screen's wireframe, each tied to an element. */
export function layoutIssues(project: Project, screen: Entity): Issue[] {
  const rules = layoutRules(project)
  const board = { x: 0, y: 0, ...artboardOf(project, screen) }
  const safe = safeRect(project, screen)
  const screenIds = new Set(screensOf(project).map((s) => s.id))
  const els = layoutOf(screen).filter((e) => !e.hidden)
  const out: Issue[] = []
  for (const e of els) {
    const d = kindDef(e.kind)
    if (!contains(board, e)) out.push({ elementId: e.id, kind: 'outside', level: 'danger', message: `${labelOf(e)} sticks out of the screen` })
    else if (!d.bleed && !contains(safe, e)) out.push({ elementId: e.id, kind: 'unsafe', level: 'warn', message: `${labelOf(e)} is outside the safe area` })
    if ((d.text !== undefined || e.text) && textPx(e) < rules.minTextPx) out.push({ elementId: e.id, kind: 'smallText', level: 'warn', message: `${labelOf(e)} uses ${textPx(e)} px text; the minimum is ${rules.minTextPx} px` })
    if (d.interactive && Math.min(e.w, e.h) < rules.minTargetPx) out.push({ elementId: e.id, kind: 'smallTarget', level: 'warn', message: `${labelOf(e)} is ${Math.min(e.w, e.h)} px; targets need ${rules.minTargetPx} px` })
    const fit = textFit(e, rules.textExpansion)
    if (fit && !fit.fits) out.push({ elementId: e.id, kind: 'textFit', level: 'info', message: `${labelOf(e)} needs ~${fit.need} px at +${rules.textExpansion} %, has ${e.w}` })
    if (d.hud && d.bind && !e.bind) out.push({ elementId: e.id, kind: 'unbound', level: 'warn', message: `${d.label} shows no data yet: bind it` })
    if (e.action?.kind === 'opens' && (!e.action.screen || !screenIds.has(e.action.screen))) out.push({ elementId: e.id, kind: 'deadLink', level: 'danger', message: `${labelOf(e)} opens a screen that does not exist` })
    if ((e.kind === 'button' || e.kind === 'iconButton') && !e.action) out.push({ elementId: e.id, kind: 'noAction', level: 'info', message: `${labelOf(e)} does nothing yet` })
  }
  const inter = els.filter((e) => kindDef(e.kind).interactive)
  for (let i = 0; i < inter.length; i++)
    for (let j = 0; j < i; j++)
      if (intersects(inter[i], inter[j]) && visibleTogether(inter[i], inter[j]))
        out.push({ elementId: inter[i].id, kind: 'overlap', level: 'warn', message: `${labelOf(inter[i])} overlaps ${labelOf(inter[j])}` })
  return out
}

// ---------- Flow ----------

export type NavEdge = { from: string; to: string; kind: 'opens' | 'navigates' | 'closes' | 'back'; source: 'graph' | 'wireframe' }

/** The entry screen: marked as entry, else the first HUD, else the first screen. */
export const entryScreen = (project: Project) => {
  const s = screensOf(project)
  return s.find((x) => x.entry) ?? s.find((x) => x.kind === 'HUD') ?? s[0]
}

/** Navigation from the Screen flow graph (nodes linked to screens) and from wireframe button actions. */
export function navEdges(project: Project): NavEdge[] {
  const g = uiForm(project, 'flow')
  const nodes = new Map<string, any>((Array.isArray(g.nodes) ? g.nodes : []).map((n: any) => [n.id, n]))
  const out: NavEdge[] = []
  for (const e of Array.isArray(g.edges) ? g.edges : []) {
    const a = nodes.get(e.source)?.refId
    const b = nodes.get(e.target)?.refId
    if (a && b) out.push({ from: a, to: b, kind: e.kind === 'closes' ? 'closes' : e.kind === 'navigates' ? 'navigates' : 'opens', source: 'graph' })
  }
  for (const s of screensOf(project))
    for (const el of layoutOf(s))
      if (el.action?.kind === 'opens' && el.action.screen) out.push({ from: s.id, to: el.action.screen, kind: 'opens', source: 'wireframe' })
      else if (el.action && el.action.kind !== 'opens') out.push({ from: s.id, to: '', kind: el.action.kind, source: 'wireframe' })
  return out
}

export type FlowAnalysis = { entry?: Entity; depth: Map<string, number>; unreachable: Entity[]; deadEnds: Entity[]; missingInGraph: NavEdge[]; noButton: NavEdge[] }

/** Clicks from the entry screen, unreachable screens, screens without a way back, and graph vs. wireframe mismatches. */
export function flowAnalysis(project: Project): FlowAnalysis {
  const screens = screensOf(project)
  const ids = new Set(screens.map((s) => s.id))
  const edges = navEdges(project).filter((e) => ids.has(e.from) && (!e.to || ids.has(e.to)))
  const entry = entryScreen(project)
  const depth = new Map<string, number>()
  if (entry) {
    depth.set(entry.id, 0)
    const queue = [entry.id]
    while (queue.length) {
      const id = queue.shift()!
      for (const e of edges) if (e.from === id && e.to && (e.kind === 'opens' || e.kind === 'navigates') && !depth.has(e.to)) {
        depth.set(e.to, depth.get(id)! + 1)
        queue.push(e.to)
      }
    }
  }
  const unreachable = screens.filter((s) => !depth.has(s.id))
  const deadEnds = screens.filter((s) => s !== entry && depth.has(s.id) && !edges.some((e) => e.from === s.id))
  const graph = new Set(edges.filter((e) => e.source === 'graph').map((e) => `${e.from}>${e.to}`))
  const buttons = new Set(edges.filter((e) => e.source === 'wireframe').map((e) => `${e.from}>${e.to}`))
  const missingInGraph = edges.filter((e) => e.source === 'wireframe' && e.kind === 'opens' && !graph.has(`${e.from}>${e.to}`))
  const wired = new Set(screens.filter((s) => layoutOf(s).length > 0).map((s) => s.id))
  const noButton = edges.filter((e) => e.source === 'graph' && e.kind !== 'closes' && wired.has(e.from) && !buttons.has(`${e.from}>${e.to}`))
  return { entry, depth, unreachable, deadEnds, missingInGraph: dedupe(missingInGraph), noButton: dedupe(noButton) }
}
const dedupe = (l: NavEdge[]) => l.filter((e, i) => l.findIndex((x) => x.from === e.from && x.to === e.to) === i)

/** Adds graph nodes for screens that have none and arrows for wireframe buttons the graph lacks. */
export function addMissingArrows(project: Project) {
  const d = project.documents[UI_DOC]?.data
  if (!d) return
  if (!d.flow || typeof d.flow !== 'object') d.flow = { nodes: [], edges: [] }
  const g = d.flow
  g.nodes ??= []
  g.edges ??= []
  const nodeFor = (screenId: string) => {
    let n = g.nodes.find((x: any) => x.refId === screenId)
    if (!n) {
      const s = screensOf(project).find((x) => x.id === screenId)
      const i = g.nodes.length
      n = { id: makeId(), label: nameOf(s), kind: s?.kind === 'Popup' ? 'Popup' : s?.kind === 'Overlay' ? 'Overlay' : 'Screen', x: 40 + (i % 4) * 220, y: 40 + Math.floor(i / 4) * 120, refId: screenId }
      g.nodes.push(n)
    }
    return n
  }
  for (const e of flowAnalysis(project).missingInGraph) g.edges.push({ id: makeId(), source: nodeFor(e.from).id, target: nodeFor(e.to).id, kind: 'opens' })
}

// ---------- HUD coverage ----------

export const hudScreen = (project: Project) => {
  const id = uiForm(project, 'hud').hudScreen
  const s = screensOf(project)
  return s.find((x) => x.id === id) ?? s.find((x) => x.kind === 'HUD')
}

/** Survival stats the game uses: those with a Player survival entry, else the whole catalog. */
export function survivalStats(project: Project): CatalogItem[] {
  const cat = project.registry.catalogs.survivalStats?.items ?? []
  const used = new Set(listOf(project, 'design.player', 'survival').map((s) => s.stat).filter(Boolean))
  return used.size ? cat.filter((c) => used.has(c.id)) : cat
}

export type HudCoverage = {
  hud?: Entity
  missingStats: CatalogItem[]
  hotbar: { want: number; have: number | null } | null
  inventory: { screen: Entity; want: number; have: number }[]
  missingCurrencies: Entity[]
  missingClock: boolean
}

/** What the HUD and inventory screens show against Player survival stats, Items inventory, Trade currencies and the day clock. */
export function hudCoverage(project: Project): HudCoverage {
  const hud = hudScreen(project)
  const els = layoutOf(hud)
  const all = screensOf(project).flatMap((s) => layoutOf(s))
  const inv = formOf(project, 'design.items', 'inventory')
  const missingStats = hud ? survivalStats(project).filter((c) => !els.some((e) => e.kind === 'statBar' && e.bind?.source === 'survivalStat' && e.bind.id === c.id)) : []
  const bar = els.find((e) => e.kind === 'hotbar')
  const hotbar = isNum(inv.hotbar) && hud ? { want: inv.hotbar, have: bar ? Number(bar.props?.slots ?? 0) : null } : null
  const inventory: HudCoverage['inventory'] = []
  if (isNum(inv.slots))
    for (const s of screensOf(project))
      for (const e of layoutOf(s))
        if (e.kind === 'grid' && e.bind?.source === 'inventory') inventory.push({ screen: s, want: inv.slots, have: Number(e.props?.rows ?? 0) * Number(e.props?.cols ?? 0) })
  const missingCurrencies = listOf(project, 'design.trade', 'currencyTypes').filter((c) => !all.some((e) => e.kind === 'counter' && e.bind?.source === 'currency' && e.bind.id === c.id))
  const missingClock = !!hud && listOf(project, 'design.timeWeather', 'dayPhases').length > 0 && !els.some((e) => e.kind === 'clock')
  return { hud, missingStats, hotbar: hotbar && hotbar.have !== hotbar.want ? hotbar : null, inventory: inventory.filter((i) => i.have !== i.want), missingCurrencies, missingClock }
}

/** Display name of a binding, from the live project. */
export function bindLabel(project: Project, bind?: WireElement['bind']): string {
  if (!bind) return ''
  const cat = (id: string) => project.registry.catalogs[id]?.items ?? []
  const find = (l: { id: string; label?: string; name?: string }[]) => {
    const x = l.find((i) => i.id === bind.id)
    return x ? String(x.label ?? x.name ?? '') : '⚠ missing'
  }
  switch (bind.source) {
    case 'survivalStat':
      return find(cat('survivalStats'))
    case 'resource':
      return find(cat('resources'))
    case 'currency':
      return find(listOf(project, 'design.trade', 'currencyTypes'))
    case 'item':
      return find(listOf(project, 'design.items', 'items'))
    case 'quest':
      return bind.id ? find(listOf(project, 'design.story', 'quests')) : 'Active quest'
    case 'clock':
      return 'Day clock'
    case 'hotbar':
      return 'Hotbar'
    case 'inventory':
      return 'Inventory'
  }
}

/** Entries a binding source offers (empty for sources without entries). */
export function bindOptions(project: Project, source: BindSource): { id: string; label: string }[] {
  const cat = (id: string) => project.registry.catalogs[id]?.items ?? []
  const ents = (l: Entity[]) => l.map((e) => ({ id: e.id, label: nameOf(e) }))
  switch (source) {
    case 'survivalStat':
      return cat('survivalStats')
    case 'resource':
      return cat('resources')
    case 'currency':
      return ents(listOf(project, 'design.trade', 'currencyTypes'))
    case 'item':
      return ents(listOf(project, 'design.items', 'items'))
    case 'quest':
      return ents(listOf(project, 'design.story', 'quests'))
    default:
      return []
  }
}

// ---------- Controls ----------

export type Conflict = { a: Entity; b: Entity; field: 'key' | 'mouse' | 'gamepad'; value: string }
const norm = (v: unknown) => String(v ?? '').trim().toLowerCase()
const contextsOf = (c: Entity) => (Array.isArray(c.contexts) && c.contexts.length ? c.contexts : ['gameplay'])

/** Pairs of actions sharing a key, mouse or gamepad binding in an overlapping context (no context = gameplay). */
export function controlConflicts(project: Project): Conflict[] {
  const list = uiList(project, 'controls')
  const out: Conflict[] = []
  for (let i = 0; i < list.length; i++)
    for (let j = 0; j < i; j++) {
      const a = list[j]
      const b = list[i]
      if (!contextsOf(a).some((x: string) => contextsOf(b).includes(x))) continue
      for (const field of ['key', 'mouse', 'gamepad'] as const) if (norm(a[field]) && norm(a[field]) === norm(b[field])) out.push({ a, b, field, value: String(b[field]).trim() })
    }
  return out
}

// ---------- Readiness ----------

export type Readiness = { screen: Entity; purpose: boolean; wireframe: boolean; states: boolean; inFlow: boolean; issues: number; ready: boolean }

/** Per screen: purpose, a wireframe of 3+ elements, states, a place in the flow, and its warning count. */
export function screenReadiness(project: Project): Readiness[] {
  const flow = flowAnalysis(project)
  const edges = navEdges(project)
  return screensOf(project).map((screen) => {
    const purpose = typeof screen.purpose === 'string' && screen.purpose.trim() !== ''
    const wireframe = layoutOf(screen).length >= 3
    const states = Array.isArray(screen.states) && screen.states.length > 0
    const inFlow = flow.depth.has(screen.id) && edges.some((e) => e.from === screen.id || e.to === screen.id)
    const issues = layoutIssues(project, screen).filter((i) => i.level !== 'info').length
    return { screen, purpose, wireframe, states, inFlow, issues, ready: purpose && wireframe && states && inFlow && issues === 0 }
  })
}

// ---------- Static SVG ----------

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** A low-fi SVG of a screen's wireframe (thumbnails, example previews, the export). Greyscale, fixed colours. */
export function layoutSvg(project: Project, screen: Entity, state?: string): string {
  const { w, h } = artboardOf(project, screen)
  const stroke = '#8b93a5'
  const text = '#5b6170'
  const parts: string[] = [`<rect x="0" y="0" width="${w}" height="${h}" fill="#f4f5f7" stroke="${stroke}" stroke-width="2"/>`]
  for (const e of layoutOf(screen)) {
    if (e.hidden || (state && e.states?.length && !e.states.includes(state))) continue
    const label = esc(e.text || (e.bind ? bindLabel(project, e.bind) : '') || '')
    const px = textPx(e)
    const r = (extra = '', rx = 4) => `<rect x="${e.x}" y="${e.y}" width="${e.w}" height="${e.h}" rx="${rx}" fill="none" stroke="${stroke}" stroke-width="2" ${extra}/>`
    const t = (s: string, size = px, anchor = 'middle', x = e.x + e.w / 2) => (s ? `<text x="${x}" y="${e.y + e.h / 2 + size * 0.35}" font-family="sans-serif" font-size="${size}" fill="${text}" text-anchor="${anchor}">${s}</text>` : '')
    switch (e.kind) {
      case 'divider':
        parts.push(`<line x1="${e.x}" y1="${e.y + e.h / 2}" x2="${e.x + e.w}" y2="${e.y + e.h / 2}" stroke="${stroke}" stroke-width="2"/>`)
        break
      case 'spacer':
        break
      case 'image':
      case 'portrait':
        parts.push(r(), `<line x1="${e.x}" y1="${e.y}" x2="${e.x + e.w}" y2="${e.y + e.h}" stroke="${stroke}"/><line x1="${e.x + e.w}" y1="${e.y}" x2="${e.x}" y2="${e.y + e.h}" stroke="${stroke}"/>`)
        break
      case 'icon':
      case 'clock':
      case 'minimap':
      case 'crosshair':
        parts.push(`<circle cx="${e.x + e.w / 2}" cy="${e.y + e.h / 2}" r="${Math.min(e.w, e.h) / 2 - 1}" fill="none" stroke="${stroke}" stroke-width="2"/>`)
        break
      case 'statBar':
        parts.push(r('', e.h / 2), `<rect x="${e.x}" y="${e.y}" width="${e.w * 0.7}" height="${e.h}" rx="${e.h / 2}" fill="${stroke}" opacity="0.35"/>`, t(label, Math.min(px, e.h * 0.7), 'start', e.x + 10))
        break
      case 'hotbar': {
        const n = Math.max(1, Number(e.props?.slots ?? 8))
        const s = e.w / n
        for (let i = 0; i < n; i++) parts.push(`<rect x="${e.x + i * s + 2}" y="${e.y + 2}" width="${s - 4}" height="${e.h - 4}" rx="4" fill="none" stroke="${stroke}" stroke-width="2"/>`)
        break
      }
      case 'grid': {
        const rows = Math.max(1, Number(e.props?.rows ?? 4))
        const cols = Math.max(1, Number(e.props?.cols ?? 6))
        for (let i = 0; i < rows; i++)
          for (let j = 0; j < cols; j++) parts.push(`<rect x="${e.x + (j * e.w) / cols + 2}" y="${e.y + (i * e.h) / rows + 2}" width="${e.w / cols - 4}" height="${e.h / rows - 4}" rx="3" fill="none" stroke="${stroke}"/>`)
        break
      }
      case 'list': {
        const rows = Math.max(1, Number(e.props?.rows ?? 5))
        parts.push(r())
        for (let i = 1; i < rows; i++) parts.push(`<line x1="${e.x}" y1="${e.y + (i * e.h) / rows}" x2="${e.x + e.w}" y2="${e.y + (i * e.h) / rows}" stroke="${stroke}"/>`)
        break
      }
      case 'button':
        parts.push(r(e.props?.variant === 'Primary' ? `fill="${stroke}" fill-opacity="0.25"` : '', 8), t(label))
        break
      default:
        parts.push(r(), t(label))
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${parts.join('')}</svg>`
}

// ---------- Element operations (used by the editor; pure, return new arrays) ----------

/** The given ids plus, unless `alone`, everything lying inside a selected panel (panels carry their contents). */
export function withContents(els: WireElement[], ids: string[], alone = false): string[] {
  const out = new Set(ids)
  if (!alone) for (const e of els) if (ids.includes(e.id) && e.kind === 'panel') elementsInside(e, els).forEach((x) => !x.locked && out.add(x.id))
  return [...out]
}

/** Moves the selected elements one step or all the way forward / backward in the z-order (the array order). */
export function reorder(els: WireElement[], ids: string[], dir: 'forward' | 'backward' | 'front' | 'back'): WireElement[] {
  const picked = els.filter((e) => ids.includes(e.id))
  const rest = els.filter((e) => !ids.includes(e.id))
  if (dir === 'front') return [...rest, ...picked]
  if (dir === 'back') return [...picked, ...rest]
  const out = [...els]
  const order = dir === 'forward' ? [...out.keys()].reverse() : [...out.keys()]
  for (const i of order) {
    if (!ids.includes(out[i].id)) continue
    const j = dir === 'forward' ? i + 1 : i - 1
    if (j < 0 || j >= out.length || ids.includes(out[j].id)) continue
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** Copies of elements with new ids, offset by (dx, dy). */
export const cloneElements = (els: WireElement[], dx: number, dy: number): WireElement[] =>
  els.map((e) => ({ ...JSON.parse(JSON.stringify(e)), id: makeId(), x: e.x + dx, y: e.y + dy, locked: false }))

/** Elements shown in a screen state ('' = all). */
export const visibleIn = (e: WireElement, state: string) => !state || !e.states?.length || e.states.includes(state)
