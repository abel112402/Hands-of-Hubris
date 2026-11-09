/**
 * Flavor text: short, optional asides that give the app a voice (see plans/PERSONALITY_PLAN.md).
 * Pure helpers only; the React side lives in src/ui/flavor. Flavor is UI state: it never touches
 * project data, undo/redo, autosave or exports.
 */

export type FlavorLevel = 'off' | 'subtle' | 'full'
export const FLAVOR_LEVELS: FlavorLevel[] = ['off', 'subtle', 'full']
export const DEFAULT_FLAVOR_LEVEL: FlavorLevel = 'subtle'

const RANK: Record<FlavorLevel, number> = { off: 0, subtle: 1, full: 2 }

/** Whether a line that needs `min` is shown at the user's `level`. `off` never shows anything. */
export const flavorAllowed = (level: FlavorLevel, min: Exclude<FlavorLevel, 'off'> = 'subtle') => RANK[level] >= RANK[min]

export const isFlavorLevel = (v: unknown): v is FlavorLevel => typeof v === 'string' && (FLAVOR_LEVELS as string[]).includes(v)

/** FNV-1a: small, stable string hash (not for security). */
export function hashString(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** Local calendar day, so the chosen line changes daily but not on every render. */
export const daySeed = (d: Date = new Date()) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`

/** Only non-empty string arrays count as flavor lists; anything else (missing key, bad JSON) is ignored. */
export function asLines(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0) : []
}

/** `hints.roadmapOverload.title` → `roadmapOverload`: the hint's own key, reused under `flavor.hint`. */
export const hintFlavorKey = (titleKey: string) => titleKey.replace(/^hints\./, '').replace(/\.title$/, '')

/** Deterministic pick: the same key + seed always gives the same line. */
export function pickLine(lines: readonly string[], key: string, seed: string): string | null {
  if (!lines.length) return null
  return lines[hashString(`${key}|${seed}`) % lines.length]
}
