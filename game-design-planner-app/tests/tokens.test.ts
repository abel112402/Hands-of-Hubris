import { beforeEach, describe, expect, it } from 'vitest'

// Read from disk (Vitest runs from the app root): it does not process CSS, so a `?raw` import comes back
// empty. Dynamic import with a string specifier because the project has no Node type definitions.
const fs: { readFileSync: (path: string, enc: string) => string } = await import('node:fs' as string)
const css = fs.readFileSync('src/styles.css', 'utf8')
/**
 * Design-token contrast check for both themes. Dark is the first `:root{…}` block of styles.css; light is
 * `:root[data-theme=light]{…}` layered over it. `var()` references are resolved within the theme being checked.
 */
const parse = (block: string): Record<string, string> =>
  Object.fromEntries(
    block
      .split(';')
      .map((d: string) => d.split(':'))
      .filter(([k]: string[]) => k?.startsWith('--'))
      .map(([k, ...v]: string[]) => [k.trim(), v.join(':').trim()]),
  )
const dark = parse(css.match(/:root\{([^}]*)\}/)![1])
const lightBlock = css.match(/:root\[data-theme=light\]\{([^}]*)\}/)
/** Light overrides dark: any token it does not set keeps its dark value. */
const light = { ...dark, ...parse(lightBlock ? lightBlock[1] : '') }
let tokens: Record<string, string> = dark

const color = (v: string): string => {
  const m = v.match(/^var\((--[\w-]+)\)$/)
  if (m) return color(tokens[m[1]])
  return v === '#fff' ? '#ffffff' : v === '#111' ? '#111111' : v
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
const SERIES = ['--c-blue', '--c-orange', '--c-green', '--c-pink', '--c-yellow', '--c-cyan', '--c-red', '--c-grey', '--c-lavender']

it('styles.css has a light theme block', () => {
  expect(lightBlock).toBeTruthy()
})

describe.each([
  ['dark', dark],
  ['light', light],
] as const)('design tokens (%s)', (theme, set) => {
  beforeEach(() => {
    tokens = set
  })

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

  // In light, --brand is only a fill under --on-brand text (checked above); amber text and lines use --brand-text.
  const marks = ['--brand', '--accent', '--phase-concept', '--phase-systems', '--phase-content', '--phase-production', '--phase-polish']
  it.each(marks)('%s reaches 3:1 as a UI colour on every surface', (m) => {
    const mark = theme === 'light' && m === '--brand' ? '--brand-text' : m
    for (const bg of SURFACES) expect(ratio(`var(${mark})`, bg)).toBeGreaterThanOrEqual(3)
  })

  it.each(SERIES)('chart colour %s reaches 3:1 on every surface', (c) => {
    for (const bg of SURFACES) expect(ratio(`var(${c})`, bg)).toBeGreaterThanOrEqual(3)
  })

  it.each(SERIES)('label text on a %s fill reaches 4.5:1', (c) => {
    expect(ratio('var(--on-series)', `var(${c})`)).toBeGreaterThanOrEqual(4.5)
  })
})

describe('light theme only', () => {
  beforeEach(() => {
    tokens = light
  })

  it.each(['--accent', '--danger', '--ok', '--warn', '--secondary', '--brand-text'])('%s reads as text (4.5:1) on bg and panel', (m) => {
    for (const bg of ['var(--bg)', 'var(--panel)']) expect(ratio(`var(${m})`, bg)).toBeGreaterThanOrEqual(4.5)
  })

  it('input and button borders reach 3:1 on every surface', () => {
    for (const bg of SURFACES) expect(ratio('var(--control-border)', bg)).toBeGreaterThanOrEqual(3)
  })
})
