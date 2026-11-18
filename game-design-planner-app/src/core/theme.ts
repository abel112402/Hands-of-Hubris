/**
 * Colour theme: a device preference (not project data), stored like the UI language.
 * `system` follows the OS `prefers-color-scheme`; dark is the fallback when the OS has no preference.
 * The resolved theme is written to `<html data-theme>`; styles.css keeps dark in `:root` and overrides it for light.
 */
import { useSyncExternalStore } from 'react'

export type ThemePref = 'system' | 'light' | 'dark'
export type Theme = 'light' | 'dark'

export const THEME_KEY = 'hohplan:theme'
export const THEME_PREFS: readonly ThemePref[] = ['system', 'light', 'dark']
/** Browser UI colour (`<meta name="theme-color">`), matching `--bg` of each theme. */
const META_COLOR: Record<Theme, string> = { dark: '#111316', light: '#f6f7f9' }

const storage = (): Storage | null => {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null
  } catch {
    return null
  }
}

const media = (): MediaQueryList | null =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: light)') : null

/** The stored preference; anything missing or unknown means `system`. */
export function getThemePref(): ThemePref {
  const v = storage()?.getItem(THEME_KEY)
  return v === 'light' || v === 'dark' ? v : 'system'
}

export function resolveTheme(pref: ThemePref = getThemePref()): Theme {
  if (pref !== 'system') return pref
  return media()?.matches ? 'light' : 'dark'
}

const listeners = new Set<() => void>()
/** Set by the switch, so the UI does not depend on storage being writable. */
let prefOverride: ThemePref | null = null
const currentPref = () => prefOverride ?? getThemePref()
let current: Theme = 'dark'

/** Writes the resolved theme to the document and tells subscribers when it changed. */
export function applyTheme(): Theme {
  const next = resolveTheme()
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.theme = next
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', META_COLOR[next])
  }
  if (next !== current) {
    current = next
    listeners.forEach((l) => l())
  }
  return next
}

export function setThemePref(pref: ThemePref) {
  const s = storage()
  try {
    if (pref === 'system') s?.removeItem(THEME_KEY)
    else s?.setItem(THEME_KEY, pref)
  } catch {
    /* storage full or blocked: the choice still applies to this visit */
  }
  prefOverride = pref
  applyTheme()
  listeners.forEach((l) => l())
}


let watching = false
/** Applies the theme now and follows OS changes while the preference is `system`. Call once, before the first render. */
export function initTheme(): Theme {
  if (!watching) {
    watching = true
    media()?.addEventListener?.('change', () => {
      if (currentPref() === 'system') applyTheme()
    })
  }
  return applyTheme()
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

/** The resolved theme, for libraries that need a colour mode instead of CSS variables (React Flow, Mermaid). */
export const useTheme = (): Theme => useSyncExternalStore(subscribe, () => current, () => 'dark')
/** The stored preference, for the theme switch. */
export const useThemePref = (): ThemePref => useSyncExternalStore(subscribe, currentPref, () => 'system')
