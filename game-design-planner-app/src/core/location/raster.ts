import type { MapPoint as Pt, RasterField } from './types'

/**
 * Cell grids over a map and their compact text form. A value is 0–51 and is written as one letter (A–Z, a–z); a
 * run of the same value is the letter preceded by its length when that is more than 1: `12A3BA` is twelve 0s,
 * three 1s and one 0. Stored maps keep grids in this form (`RasterField`), code works on `Grid`.
 */
export const MAX_CELLS_PER_SIDE = 256
export const MAX_VALUE = 51

export type Grid = { cell: number; cols: number; rows: number; data: Uint8Array }

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
const VALUE = new Map([...LETTERS].map((c, i) => [c, i]))

export function encodeRle(data: ArrayLike<number>): string {
  let out = ''
  for (let i = 0; i < data.length; ) {
    const v = Math.max(0, Math.min(MAX_VALUE, data[i] | 0))
    let n = 1
    while (i + n < data.length && Math.max(0, Math.min(MAX_VALUE, data[i + n] | 0)) === v) n++
    out += (n > 1 ? n : '') + LETTERS[v]
    i += n
  }
  return out
}

/** The values of an encoded grid, or null when the text is malformed or does not hold exactly `length` values. */
export function decodeRle(rle: string, length: number): Uint8Array | null {
  const out = new Uint8Array(length)
  let at = 0
  let count = ''
  for (const ch of rle) {
    if (ch >= '0' && ch <= '9') {
      count += ch
      if (count.length > 6) return null
      continue
    }
    const v = VALUE.get(ch)
    if (v === undefined) return null
    const n = count ? Number(count) : 1
    count = ''
    if (n < 1 || at + n > length) return null
    out.fill(v, at, at + n)
    at += n
  }
  return count || at !== length ? null : out
}

export const emptyGrid = (w: number, h: number, cell: number, fill = 0): Grid => {
  const cols = Math.min(MAX_CELLS_PER_SIDE, Math.max(1, Math.ceil(w / cell)))
  const rows = Math.min(MAX_CELLS_PER_SIDE, Math.max(1, Math.ceil(h / cell)))
  return { cell, cols, rows, data: new Uint8Array(cols * rows).fill(fill) }
}

export const gridOf = (f: RasterField): Grid | null => {
  const data = decodeRle(f.rle, f.cols * f.rows)
  return data && { cell: f.cell, cols: f.cols, rows: f.rows, data }
}
export const fieldOf = (g: Grid): RasterField => ({ cell: g.cell, cols: g.cols, rows: g.rows, rle: encodeRle(g.data) })

/** The cell a map point falls in, or -1 outside the grid. */
export function cellIndex(g: { cell: number; cols: number; rows: number }, p: Pt): number {
  const c = Math.floor(p[0] / g.cell)
  const r = Math.floor(p[1] / g.cell)
  return c < 0 || r < 0 || c >= g.cols || r >= g.rows ? -1 : r * g.cols + c
}
export const cellCentre = (g: { cell: number; cols: number }, i: number): Pt => [((i % g.cols) + 0.5) * g.cell, (Math.floor(i / g.cols) + 0.5) * g.cell]

/** The value under a map point; `outside` beyond the grid. */
export function sample(g: Grid, p: Pt, outside = 0): number {
  const i = cellIndex(g, p)
  return i < 0 ? outside : g.data[i]
}
