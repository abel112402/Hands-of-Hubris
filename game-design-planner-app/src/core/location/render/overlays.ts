import type { LightGrid } from '../light'
import { TAG, type NavGrid } from '../nav'
import { el, type SvgNode } from './node'

/**
 * Overlays that show what is otherwise invisible: where one can walk, and where it is dark. Cells of one kind are
 * merged into runs along each row and drawn as one path per kind, so even a large grid stays a handful of elements.
 * In map units; the caller places them over the map.
 */
function runs(cols: number, rows: number, cell: number, pick: (i: number) => boolean): string {
  let d = ''
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; ) {
      if (!pick(r * cols + c)) {
        c++
        continue
      }
      const start = c
      while (c < cols && pick(r * cols + c)) c++
      d += `M${start * cell},${r * cell}h${(c - start) * cell}v${cell}h${-(c - start) * cell}z`
    }
  }
  return d
}

const OVERLAY = { blocked: '#7a1f1f', water: '#2d6fb3', slow: '#c98a1a', door: '#2f8f4e', locked: '#b3362a', dark: '#0b0d1a' }

/** Walkability: blocked cells hatched red, water blue, slow ground amber, doors green and locked doors red. */
export function navOverlay(nav: NavGrid): SvgNode {
  const n = (pick: (i: number) => boolean, fill: string, opacity: number) => el('path', { d: runs(nav.cols, nav.rows, nav.cell, pick), fill, opacity })
  return el('g', { 'data-overlay': 'nav', 'pointer-events': 'none' }, [
    n((i) => !nav.cost[i], OVERLAY.blocked, 0.28),
    n((i) => !!(nav.tags[i] & TAG.water), OVERLAY.water, 0.3),
    n((i) => nav.cost[i] >= 3 && !(nav.tags[i] & TAG.water), OVERLAY.slow, 0.22),
    n((i) => !!(nav.tags[i] & TAG.door) && !(nav.tags[i] & TAG.locked), OVERLAY.door, 0.55),
    n((i) => !!(nav.tags[i] & TAG.locked), OVERLAY.locked, 0.7),
  ])
}

/** Darkness on walkable ground in four steps: the darker the cell, the deeper the shade. */
export function lightOverlay(light: LightGrid, nav: NavGrid): SvgNode {
  const steps: [number, number, number][] = [
    [0, 0.1, 0.7],
    [0.1, 0.25, 0.5],
    [0.25, 0.45, 0.3],
    [0.45, 0.7, 0.14],
  ]
  return el(
    'g',
    { 'data-overlay': 'light', 'pointer-events': 'none' },
    steps.map(([lo, hi, opacity]) => el('path', { d: runs(light.cols, light.rows, light.cell, (i) => !!nav.cost[i] && light.level[i] >= lo && light.level[i] < hi), fill: OVERLAY.dark, opacity })),
  )
}
