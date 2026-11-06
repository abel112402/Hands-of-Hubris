import type { Entity, Project } from './model/types'
import { artboardOf, newElement, safeRect, screensOf, survivalStats, type WireElement } from './ui'

/**
 * Wireframe starting points built from the project's own data (survival stats, Items hotbar and inventory slots, Trade
 * currencies). Used by the editor's empty state and the guide examples; each returns fresh elements.
 */
export type Template = { id: string; label: string; forKinds: string[]; size?: { width: number; height: number }; build: (p: Project, screen: Entity) => WireElement[] }

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const items = (p: Project) => p.documents['design.items']?.data.inventory ?? {}
const byName = (p: Project, name: string) => screensOf(p).find((s) => String(s.name ?? '').toLowerCase() === name.toLowerCase())

/** Survival bars bottom-left, hotbar bottom-centre, clock, minimap and quest tracker top-right, currency top-left. */
export function hudLayout(p: Project, screen: Entity): WireElement[] {
  const { w, h } = artboardOf(p, screen)
  const safe = safeRect(p, screen)
  const right = safe.x + safe.w
  const bottom = safe.y + safe.h
  const out: WireElement[] = []
  survivalStats(p).forEach((s, i) => out.push(newElement('statBar', safe.x, bottom - 28 - i * 40, { w: 300, bind: { source: 'survivalStat', id: s.id } })))
  const slots = isNum(items(p).hotbar) && items(p).hotbar > 0 ? items(p).hotbar : 8
  const barW = slots * 68
  out.push(newElement('hotbar', Math.round((w - barW) / 2), bottom - 64, { w: barW, props: { slots }, bind: { source: 'hotbar' } }))
  out.push(newElement('clock', right - 96, safe.y))
  out.push(newElement('minimap', right - 220, safe.y + 112))
  out.push(newElement('questTracker', right - 320, safe.y + 348, { bind: { source: 'quest' } }))
  const currency = (p.documents['design.trade']?.data.currencyTypes ?? [])[0]
  if (currency) out.push(newElement('counter', safe.x, safe.y, { bind: { source: 'currency', id: currency.id } }))
  out.push(newElement('crosshair', Math.round(w / 2 - 16), Math.round(h / 2 - 16)))
  return out
}

/** A window with a title, a close button, an inventory grid sized from Items slots, and an item detail column. */
export function inventoryLayout(p: Project, screen: Entity): WireElement[] {
  const { w, h } = artboardOf(p, screen)
  const slots = isNum(items(p).slots) && items(p).slots > 0 ? items(p).slots : 24
  // A wide-ish grid; prefer a column count that divides the slot count, so the grid holds exactly the Items slots.
  const ideal = Math.min(10, Math.max(4, Math.ceil(Math.sqrt(slots * 1.5))))
  const divisors = [4, 5, 6, 7, 8, 9, 10].filter((c) => slots % c === 0)
  const cols = divisors.length ? divisors.reduce((a, b) => (Math.abs(b - ideal) < Math.abs(a - ideal) ? b : a)) : ideal
  const rows = Math.ceil(slots / cols)
  const cell = Math.min(72, Math.floor((w * 0.6) / cols), Math.floor((h - 180) / rows))
  const detailX = 48 + cols * cell + 48
  return [
    newElement('panel', 0, 0, { w, h, text: String(screen.name ?? 'Window') }),
    newElement('heading', 48, 32, { text: String(screen.name ?? 'Inventory'), w: 400 }),
    newElement('button', w - 48 - 160, 32, { text: 'Close', w: 160, props: { variant: 'Secondary', textSize: 'M' }, action: { kind: 'back' } }),
    newElement('grid', 48, 120, { w: cols * cell, h: rows * cell, props: { rows, cols }, bind: { source: 'inventory' } }),
    newElement('image', detailX, 120, { w: Math.max(160, w - detailX - 48), h: 200 }),
    newElement('heading', detailX, 340, { text: 'Item name', w: Math.max(160, w - detailX - 48), props: { textSize: 'M' } }),
    newElement('text', detailX, 400, { w: Math.max(160, w - detailX - 48), h: 120 }),
    newElement('label', 48, 120 + rows * cell + 24, { text: 'Weight 12 / 40', w: 260 }),
  ]
}

/** A title and a column of buttons; Settings opens the Settings screen when there is one. */
export function menuLayout(p: Project, screen: Entity, buttons = ['Continue', 'New game', 'Settings', 'Quit']): WireElement[] {
  const { w, h } = artboardOf(p, screen)
  const settings = byName(p, 'Settings')
  const bw = 360
  const x = Math.round((w - bw) / 2)
  const top = Math.round(h * 0.4)
  return [
    newElement('heading', Math.round((w - 800) / 2), Math.round(h * 0.2), { text: String(screen.name ?? 'Menu'), w: 800, h: 72, props: { textSize: 'XL' } }),
    ...buttons.map((b, i) =>
      newElement('button', x, top + i * 72, {
        text: b,
        w: bw,
        h: 56,
        props: { variant: i === 0 ? 'Primary' : 'Secondary', textSize: 'M' },
        ...(b === 'Settings' && settings && settings.id !== screen.id ? { action: { kind: 'opens' as const, screen: settings.id } } : b === 'Continue' || b === 'Back' ? { action: { kind: 'back' as const } } : {}),
      }),
    ),
  ]
}

/** A confirm dialog: title, text, Cancel (back) and Confirm (closes). */
export function popupLayout(p: Project, screen: Entity): WireElement[] {
  const { w, h } = artboardOf(p, screen)
  return [
    newElement('panel', 0, 0, { w, h }),
    newElement('heading', 40, 32, { text: 'Are you sure?', w: w - 80 }),
    newElement('text', 40, 100, { w: w - 80, h: Math.max(48, h - 220) }),
    newElement('button', w - 40 - 2 * 160 - 16, h - 40 - 48, { text: 'Cancel', w: 160, props: { variant: 'Secondary', textSize: 'M' }, action: { kind: 'back' } }),
    newElement('button', w - 40 - 160, h - 40 - 48, { text: 'Confirm', w: 160, props: { variant: 'Primary', textSize: 'M' }, action: { kind: 'closes' } }),
  ]
}

export const TEMPLATES: Template[] = [
  { id: 'hud', label: 'HUD', forKinds: ['HUD', 'Overlay'], build: hudLayout },
  { id: 'inventory', label: 'Inventory window', forKinds: ['Window', 'Fullscreen menu'], size: { width: 1440, height: 864 }, build: inventoryLayout },
  { id: 'menu', label: 'Menu', forKinds: ['Fullscreen menu', 'Window'], build: menuLayout },
  { id: 'popup', label: 'Confirm popup', forKinds: ['Popup'], size: { width: 640, height: 320 }, build: popupLayout },
]

/** Puts a template on a screen (sets the window size first when the template has one and the screen has none). */
export function applyTemplate(p: Project, screenId: string, templateId: string) {
  const t = TEMPLATES.find((x) => x.id === templateId)
  const screen = screensOf(p).find((s) => s.id === screenId)
  if (!t || !screen) return
  if (t.size && !isNum(screen.width) && (screen.kind === 'Window' || screen.kind === 'Popup')) Object.assign(screen, t.size)
  screen.layout = { elements: [...(screen.layout?.elements ?? []), ...t.build(p, screen)] }
}
