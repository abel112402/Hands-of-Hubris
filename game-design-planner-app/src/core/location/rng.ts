/** Seeded randomness for map generation. Generators never use Math.random, so a seed always gives the same map. */
export type Rng = {
  /** Uniform in [0, 1). */
  next: () => number
  range: (min: number, max: number) => number
  /** Integer in [min, max], both inclusive. */
  int: (min: number, max: number) => number
  pick: <T>(xs: readonly T[]) => T
  chance: (p: number) => boolean
}

/** FNV-1a over the joined parts; an unsigned 32-bit number. */
export function hash(...parts: (string | number)[]): number {
  let h = 2166136261
  const s = parts.join('|')
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** mulberry32. */
export function makeRng(seed: number): Rng {
  let a = seed >>> 0
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const range = (min: number, max: number) => min + next() * (max - min)
  return {
    next,
    range,
    int: (min, max) => Math.floor(range(min, max + 1)),
    pick: (xs) => xs[Math.floor(next() * xs.length)],
    chance: (p) => next() < p,
  }
}
