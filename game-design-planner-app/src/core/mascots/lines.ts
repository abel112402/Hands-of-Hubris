/** Pure helpers for what Hubi says next in the editor companion. */
import { hashString } from '../flavor/pick'

export type LineKind = 'reflect' | 'tip' | 'joke'

/** Reflection first (it is about this project), then a tip, then a joke; jokes only at Full personality. */
export function kindAt(step: number, jokes: boolean): LineKind {
  const cycle: LineKind[] = jokes ? ['reflect', 'tip', 'joke'] : ['reflect', 'tip']
  return cycle[((step % cycle.length) + cycle.length) % cycle.length]
}

/**
 * The `n`-th line of a list for this seed: a stable start (so it doesn't flicker) that then walks the
 * list, so "Another one" never repeats until every line was shown.
 */
export function nthLine<T>(list: readonly T[], seed: string, n: number): T | undefined {
  if (!list.length) return undefined
  return list[(hashString(seed) + n) % list.length]
}

/** `{{name}}` placeholders from reflection params. Plain text; React escapes it when rendering. */
export const fillParams = (line: string, params: Record<string, string | number>) =>
  line.replace(/\{\{(\w+)\}\}/g, (_, k: string) => (k in params ? String(params[k]) : ''))

/** Minimum gap between two lines Hubi says on his own (shared with flavor moments). */
export const AUTO_GAP_MS = 5 * 60 * 1000
/** Time on one planner, without opening the companion, before Hubi speaks up by himself. */
export const AUTO_IDLE_MS = 60 * 1000
export const AUTO_MAX_PER_SESSION = 6

export const autoAllowed = (now: number, lastAt: number | null, count: number) =>
  count < AUTO_MAX_PER_SESSION && (lastAt === null || now - lastAt >= AUTO_GAP_MS)
