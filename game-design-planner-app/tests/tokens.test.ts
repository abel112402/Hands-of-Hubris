import { describe, expect, it } from 'vitest'

// Read from disk (Vitest runs from the app root): it does not process CSS, so a `?raw` import comes back
// empty. Dynamic import with a string specifier because the project has no Node type definitions.
const fs: { readFileSync: (path: string, enc: string) => string } = await import('node:fs' as string)
const css = fs.readFileSync('src/styles.css', 'utf8')
/** Design-token contrast check: reads the first `:root{…}` block of styles.css and resolves `var()` references. */
const root = css.match(/:root\{([^}]*)\}/)![1]
const tokens: Record<string, string> = Object.fromEntries(
  root
    .split(';')
    .map((d: string) => d.split(':'))
    .filter(([k]: string[]) => k?.startsWith('--'))
    .map(([k, ...v]: string[]) => [k.trim(), v.join(':').trim()]),
)

const color = (v: string): string => {
  const m = v.match(/^var\((--[\w-]+)\)$/)
  if (m) return color(tokens[m[1]])
  return v === '#fff' ? '#ffffff' : v
}
const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(color(a)), lum(color(b))].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

const SURFACES = ['var(--bg)', 'var(--panel)', 'var(--panel2)']

describe('design tokens', () => {
  it.each(SURFACES)('text and muted text reach 4.5:1 on %s', (bg) => {
    expect(ratio('var(--text)', bg)).toBeGreaterThanOrEqual(4.5)
    expect(ratio('var(--muted)', bg)).toBeGreaterThanOrEqual(4.5)
  })

  it.each([
    ['#fff', 'var(--accent-strong)'],
    ['#fff', 'var(--danger-strong)'],
    ['#fff', 'var(--secondary-strong)'],
    ['var(--on-brand)', 'var(--brand)'],
    ['var(--on-brand)', 'var(--brand-strong)'],
  ])('filled control text %s on %s reaches 4.5:1', (fg, bg) => {
    expect(ratio(fg, bg)).toBeGreaterThanOrEqual(4.5)
  })

  const marks = ['--brand', '--accent', '--phase-concept', '--phase-systems', '--phase-content', '--phase-production', '--phase-polish']
  it.each(marks)('%s reaches 3:1 as a UI colour on every surface', (m) => {
    for (const bg of SURFACES) expect(ratio(`var(${m})`, bg)).toBeGreaterThanOrEqual(3)
  })
})
