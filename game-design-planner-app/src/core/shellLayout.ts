/**
 * The v3 layout budget (plans/UI_V3_PLAN.md, "App layout"): side columns shrink or fold so the work surface
 * always keeps most of the width. Pure, so the budget is tested without a browser layout engine.
 */

export type ShellLayout = {
  /** Phase compass rail on the left; 0 when it moves to a bottom bar. */
  rail: number
  /** Companion: the icon tray, or the docked panel when pinned and there is room for it. */
  companion: number
  /** Whether the companion is a docked panel (else a tray that opens an overlay). */
  companionDocked: boolean
  /** What is left for the page: the work surface. */
  surface: number
  /** Narrow screens: rail becomes a bottom bar, companion a bottom sheet. */
  compact: boolean
}

export const RAIL_WIDTH = 72
export const TRAY_WIDTH = 56
export const DOCK_WIDTH = 360
/** Below this the rail becomes a bottom bar. */
export const COMPACT_BELOW = 768
/** A pinned companion docks only from this width; below it stays a tray. */
export const DOCK_FROM = 1440

export function shellLayout(viewport: number, opts: { companionPinned?: boolean } = {}): ShellLayout {
  const width = Math.max(0, Math.floor(viewport))
  if (width < COMPACT_BELOW) return { rail: 0, companion: 0, companionDocked: false, surface: width, compact: true }
  const companionDocked = !!opts.companionPinned && width >= DOCK_FROM
  const companion = companionDocked ? DOCK_WIDTH : TRAY_WIDTH
  return { rail: RAIL_WIDTH, companion, companionDocked, surface: width - RAIL_WIDTH - companion, compact: false }
}

/** `grid-template-columns` for the shell body. */
export const shellColumns = (l: ShellLayout): string =>
  l.compact ? 'minmax(0, 1fr)' : `${l.rail}px minmax(0, 1fr) ${l.companion}px`
