import { create } from 'zustand'
import { useTranslation } from 'react-i18next'
import type { i18n as I18n } from 'i18next'
import { asLines, daySeed, DEFAULT_FLAVOR_LEVEL, flavorAllowed, isFlavorLevel, pickLine, type FlavorLevel } from '../../core/flavor/pick'

const STORAGE_KEY = 'hohplan:flavor'

function readLevel(): FlavorLevel {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return isFlavorLevel(v) ? v : DEFAULT_FLAVOR_LEVEL
  } catch {
    return DEFAULT_FLAVOR_LEVEL
  }
}

/** Browser-local preference (like the language), not part of the project. */
export const useFlavorLevel = create<{ level: FlavorLevel; setLevel: (l: FlavorLevel) => void }>((set) => ({
  level: readLevel(),
  setLevel: (level) => {
    try {
      localStorage.setItem(STORAGE_KEY, level)
    } catch {
      /* storage unavailable: keep it for this session only */
    }
    set({ level })
  },
}))

export type FlavorOpts = {
  /** Keys tried in order; the first with lines in the current language wins (e.g. module-specific, then generic). */
  keys: string | string[]
  /** Extra seed so neighbouring spots (two empty sections) don't show the same line. */
  ctx?: string
  min?: 'subtle' | 'full'
}

/**
 * The flavor line for these keys, or null when flavor is off or the current language has none.
 * Reads the language's own resources directly, so a missing Hungarian line never falls back to English.
 */
export function useFlavor(opts: FlavorOpts): string | null {
  const { i18n } = useTranslation()
  const level = useFlavorLevel((s) => s.level)
  return resolveFlavor(i18n, level, opts)
}

/** Non-hook form, for lines picked in event handlers and store subscriptions. */
export function resolveFlavor(i18n: I18n, level: FlavorLevel, { keys, ctx = '', min = 'subtle' }: FlavorOpts): string | null {
  if (!flavorAllowed(level, min)) return null
  const lng = i18n.resolvedLanguage ?? i18n.language
  for (const key of Array.isArray(keys) ? keys : [keys]) {
    const line = pickLine(asLines(i18n.getResource(lng, 'translation', key)), key, `${daySeed()}|${ctx}`)
    if (line) return line
  }
  return null
}

/** A quiet aside under the factual text. Decorative: the factual text next to it stays the primary message. */
export function Flavor({ as: Tag = 'p', ...opts }: FlavorOpts & { as?: 'p' | 'span' }) {
  const line = useFlavor(opts)
  return line ? <Tag className="flavor">{line}</Tag> : null
}
