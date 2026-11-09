/** Pure rules for the "Full" personality extras: greetings, returning users, undo sprees, easter eggs. */

export type TimeBucket = 'night' | 'morning' | 'afternoon' | 'fridayAfternoon' | 'evening' | 'weekend'

/** Local time of day, with Friday afternoon and weekend daytime as their own moods. */
export function timeBucket(d: Date): TimeBucket {
  const h = d.getHours()
  const day = d.getDay()
  if (h < 5) return 'night'
  if ((day === 0 || day === 6) && h < 18) return 'weekend'
  if (h < 12) return 'morning'
  if (h < 18) return day === 5 && h >= 14 ? 'fridayAfternoon' : 'afternoon'
  return 'evening'
}

export const RETURN_GAP_MS = 14 * 24 * 60 * 60 * 1000

/** Away for at least two weeks. No previous visit (first run) is not a return. */
export const isLongAbsence = (lastVisit: number | null, now: number) => lastVisit !== null && now - lastVisit >= RETURN_GAP_MS

export const isAprilFools = (d: Date) => d.getMonth() === 3 && d.getDate() === 1

export const KONAMI = ['arrowup', 'arrowup', 'arrowdown', 'arrowdown', 'arrowleft', 'arrowright', 'arrowleft', 'arrowright', 'b', 'a']

/**
 * Advances the Konami matcher by one key. Returns the new progress; `KONAMI.length` means matched.
 * A wrong key restarts, but still counts as a first key if it is one.
 */
export function konamiStep(progress: number, key: string): number {
  const k = key.toLowerCase()
  const at = progress >= KONAMI.length ? 0 : progress
  if (KONAMI[at] === k) return at + 1
  // "up up up down…": a repeated first key keeps the two-up prefix.
  if (at === 2 && k === 'arrowup') return 2
  return KONAMI[0] === k ? 1 : 0
}

export const UNDO_SPREE = { count: 5, windowMs: 20_000 }

/** Records an undo at `now`; `hit` when there were `count` undos inside the window (then it starts over). */
export function undoSpree(times: readonly number[], now: number): { times: number[]; hit: boolean } {
  const recent = [...times.filter((t) => now - t < UNDO_SPREE.windowMs), now]
  return recent.length >= UNDO_SPREE.count ? { times: [], hit: true } : { times: recent, hit: false }
}

export const BRAND_CLICKS = { count: 7, windowMs: 4_000 }

/** Same shape as undoSpree, for clicks on the logo. */
export function brandClicks(times: readonly number[], now: number): { times: number[]; hit: boolean } {
  const recent = [...times.filter((t) => now - t < BRAND_CLICKS.windowMs), now]
  return recent.length >= BRAND_CLICKS.count ? { times: [], hit: true } : { times: recent, hit: false }
}
