import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import i18n from '../src/core/i18n'
import en from '../src/core/i18n/en.json'
import { App } from '../src/App'
import { countOf, pluralize } from '../src/core/text'
import { useStore } from '../src/core/store/store'
import { createProject } from '../src/core/model/project'

afterEach(cleanup)

type Tree = { [k: string]: string | Tree }
const flat = (o: Tree, p = ''): [string, string][] =>
  Object.entries(o).flatMap(([k, v]) => (typeof v === 'string' ? [[p + k, v] as [string, string]] : flat(v, `${p}${k}.`)))

const PLURAL_MARKER = /\w\((s|es|ies)\)/

// Every source file as text, via Vite (no Node fs types needed in the browser-typed test project).
const SOURCES = import.meta.glob('../src/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

describe('count wording', () => {
  it('no English text uses "(s)" style plurals', () => {
    expect(flat(en as Tree).filter(([, v]) => PLURAL_MARKER.test(v))).toEqual([])
  })

  it('no source string uses "(s)" style plurals', () => {
    // Prose like "3 phase(s) have": a word, the marker, then a space and another word.
    // Calls such as label(s) or push(s) are followed by punctuation, so they are not matched.
    const prose = /[a-z]\((s|es|ies)\)( [a-z“]|:|<)/i
    expect(Object.keys(SOURCES).length).toBeGreaterThan(50)
    const hits = Object.entries(SOURCES).flatMap(([f, text]) =>
      text
        .split('\n')
        .map((line, i) => [f, i + 1, line] as const)
        .filter(([, , line]) => prose.test(line.replace(/\b\w+\(s\)\s*(=>|&&|\|\||\?|:\s*\w+\s*=>)/g, ''))),
    )
    expect(hits.map(([f, n]) => `${f}:${n}`)).toEqual([])
  })

  it('every singular key has a plural partner', () => {
    const keys = new Set(flat(en as Tree).map(([k]) => k))
    for (const k of keys) {
      if (k.endsWith('_one')) expect(keys.has(k.replace(/_one$/, '_other')), k).toBe(true)
    }
  })

  it('picks the singular for one and the plural otherwise', () => {
    void i18n.changeLanguage('en')
    expect(i18n.t('hints.roadmapExit.body', { count: 1, names: 'Alpha' })).toBe('1 phase has no measurable exit criteria: Alpha.')
    expect(i18n.t('hints.roadmapExit.body', { count: 3, names: 'A, B, C' })).toBe('3 phases have no measurable exit criteria: A, B, C.')
    expect(i18n.t('hints.sparse.body', { count: 1, names: 'X' })).toBe('1 entry has most fields empty: X.')
    expect(i18n.t('hints.combatEnemyBasics.body', { count: 2, names: 'X' })).toMatch(/^2 enemies lack /)
  })

  it('Hungarian keeps one form and still interpolates the count', () => {
    void i18n.changeLanguage('hu')
    expect(i18n.t('ai.modelsLoaded', { count: 1 })).toBe('1 modell betöltve.')
    void i18n.changeLanguage('en')
  })

  it('countOf handles regular and irregular English plurals', () => {
    expect(countOf(1, 'phase')).toBe('1 phase')
    expect(countOf(7, 'phase')).toBe('7 phases')
    expect(countOf(0, 'dependency conflict')).toBe('0 dependency conflicts')
    expect(countOf(2, 'boss')).toBe('2 bosses')
    expect(countOf(2.5, 'in-game day')).toBe('2.5 in-game days')
    expect(countOf(3, 'person', 'people')).toBe('3 people')
    expect(pluralize('enemy')).toBe('enemies')
    expect(pluralize('day')).toBe('days')
  })
})

describe('empty sections', () => {
  it('show one Add button and one example button', () => {
    useStore.getState().loadProject(createProject('T', false))
    window.location.hash = '#/doc/design.coreLoop?s=loops'
    const { container } = render(<App />)
    const content = container.querySelector('.content') as HTMLElement
    const adds = [...content.querySelectorAll('button')].filter((b) => /^\+ Add /.test(b.textContent ?? ''))
    expect(adds).toHaveLength(1)
    expect(adds[0].getAttribute('data-guide')).toBe('add')
    const examples = [...content.querySelectorAll('button')].filter((b) => /Insert example/.test(b.textContent ?? ''))
    expect(examples).toHaveLength(1)
    expect(content.textContent).toMatch(/0 loops/)
  })
})

describe('translations', () => {
  it('English and Hungarian define the same keys (plural suffixes aside)', async () => {
    const hu = (await import('../src/core/i18n/hu.json')).default as Tree
    const base = (t: Tree) => new Set(flat(t).map(([k]) => k.replace(/_(zero|one|two|few|many|other)$/, '')))
    const e = base(en as Tree)
    const h = base(hu)
    expect([...e].filter((k) => !h.has(k))).toEqual([])
    expect([...h].filter((k) => !e.has(k))).toEqual([])
  })

  it('every placeholder in English also appears in Hungarian', async () => {
    const hu = (await import('../src/core/i18n/hu.json')).default as Tree
    const huMap = new Map(flat(hu))
    const vars = (s: string) => [...s.matchAll(/{{(\w+)}}/g)].map((m) => m[1]).sort()
    for (const [k, v] of flat(en as Tree)) {
      // Singular texts may leave out the count ("The only life stage…"); the plural form is the reference.
      if (k.endsWith('_one')) continue
      const h = huMap.get(k) ?? huMap.get(k.replace(/_(one|other)$/, ''))
      if (h === undefined) continue
      // Hungarian may drop a count it does not need to show, but must not invent or rename one.
      for (const name of vars(h)) expect(vars(v), `${k}: {{${name}}}`).toContain(name)
    }
  })
})
