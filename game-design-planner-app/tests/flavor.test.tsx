import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import i18n from '../src/core/i18n'
import en from '../src/core/i18n/en.json'
import hu from '../src/core/i18n/hu.json'
import { asLines, daySeed, flavorAllowed, hashString, hintFlavorKey, pickLine } from '../src/core/flavor/pick'
import { MemoryRouter } from 'react-router-dom'
import { HintCard } from '../src/ui/hints/HintPanel'
import { Flavor, useFlavorLevel } from '../src/ui/flavor/Flavor'
import { FlavorToast, useMilestones, useMoments } from '../src/ui/flavor/moments'
import { crossedMilestones, momentAllowed, MOMENT_GAP_MS } from '../src/core/flavor/milestones'
import { createProject } from '../src/core/model/project'
import { useStore } from '../src/core/store/store'

afterEach(cleanup)

describe('flavor picking', () => {
  it('is deterministic for the same key and seed', () => {
    const lines = ['a', 'b', 'c', 'd', 'e']
    expect(pickLine(lines, 'k', 's1')).toBe(pickLine(lines, 'k', 's1'))
    const seen = new Set(Array.from({ length: 40 }, (_, i) => pickLine(lines, 'k', `s${i}`)))
    expect(seen.size).toBeGreaterThan(1)
  })

  it('returns null for no lines and ignores junk entries', () => {
    expect(pickLine([], 'k', 's')).toBeNull()
    expect(asLines('nope')).toEqual([])
    expect(asLines(['ok', 3, '  ', null])).toEqual(['ok'])
  })

  it('respects levels', () => {
    expect(flavorAllowed('off')).toBe(false)
    expect(flavorAllowed('subtle')).toBe(true)
    expect(flavorAllowed('subtle', 'full')).toBe(false)
    expect(flavorAllowed('full', 'full')).toBe(true)
  })

  it('hash and day seed are stable', () => {
    expect(hashString('abc')).toBe(hashString('abc'))
    expect(daySeed(new Date(2026, 10, 9))).toBe('2026-11-9')
  })
})

type Node = string | string[] | { [k: string]: Node }
const lists = (o: Node, p = ''): [string, string[]][] =>
  Array.isArray(o) ? [[p, o]] : typeof o === 'string' ? [] : Object.entries(o).flatMap(([k, v]) => lists(v, p ? `${p}.${k}` : k))

describe('flavor texts', () => {
  for (const [lng, res] of [['en', en], ['hu', hu]] as const) {
    it(`${lng}: every list is non-empty, short, and has no placeholders`, () => {
      const all = lists(res.flavor as Node)
      expect(all.length).toBeGreaterThan(10)
      for (const [key, lines] of all) {
        expect(lines.length, key).toBeGreaterThan(0)
        for (const l of lines) {
          expect(typeof l, key).toBe('string')
          expect(l.length, `${key}: ${l}`).toBeLessThanOrEqual(120)
          expect(l, key).not.toMatch(/{{/)
        }
      }
    })
  }

  it('both languages cover the same flavor keys', () => {
    const keys = (r: Node) => lists(r).map(([k]) => k).sort()
    expect(keys(hu.flavor as Node)).toEqual(keys(en.flavor as Node))
  })
})

describe('<Flavor>', () => {
  beforeEach(() => void i18n.changeLanguage('en'))

  it('shows a line from the list when on, nothing when off', () => {
    useFlavorLevel.getState().setLevel('subtle')
    const { container, rerender } = render(<Flavor keys="flavor.allClear" />)
    expect(en.flavor.allClear).toContain(container.querySelector('.flavor')?.textContent)
    useFlavorLevel.getState().setLevel('off')
    rerender(<Flavor keys="flavor.allClear" />)
    expect(container.querySelector('.flavor')).toBeNull()
    useFlavorLevel.getState().setLevel('subtle')
  })

  it('falls through keys and never borrows another language', () => {
    render(<Flavor keys={['flavor.empty.doesNotExist', 'flavor.empty.generic']} />)
    expect(en.flavor.empty.generic).toContain(screen.getByText((_, el) => el?.className === 'flavor').textContent)
    cleanup()
    i18n.addResourceBundle('en', 'translation', { flavor: { onlyEnglish: ['english only'] } }, true, false)
    void i18n.changeLanguage('hu')
    const { container } = render(<Flavor keys="flavor.onlyEnglish" />)
    expect(container.querySelector('.flavor')).toBeNull()
  })
})

describe('milestones', () => {
  const withCount = (n: number) => {
    const p = createProject('M', false)
    p.documents['design.npc'] = { ...(p.documents['design.npc'] ?? {}), data: { ...(p.documents['design.npc']?.data ?? {}), archetypes: Array.from({ length: n }, (_, i) => ({ id: `a${i}` })) } } as never
    return p
  }

  it('only counts upward crossings, keeps the highest per section, skips seen ones', () => {
    expect(crossedMilestones(withCount(0), withCount(1), new Set()).map((m) => m.id)).toEqual(['npc1'])
    expect(crossedMilestones(withCount(0), withCount(12), new Set()).map((m) => m.id)).toEqual(['npc10'])
    expect(crossedMilestones(withCount(12), withCount(0), new Set())).toEqual([])
    expect(crossedMilestones(withCount(0), withCount(1), new Set(['npc1']))).toEqual([])
  })

  it('rate-limits moments unless forced', () => {
    expect(momentAllowed(1000, null)).toBe(true)
    expect(momentAllowed(1000 + MOMENT_GAP_MS - 1, 1000)).toBe(false)
    expect(momentAllowed(1000 + MOMENT_GAP_MS, 1000)).toBe(true)
    expect(momentAllowed(1001, 1000, true)).toBe(true)
  })

  function Harness() {
    useMilestones()
    return <FlavorToast />
  }

  it('announces a milestone once on Full, never on Subtle', () => {
    void i18n.changeLanguage('en')
    localStorage.clear()
    useMoments.setState({ moment: null, lastAt: null })
    useStore.getState().loadProject(withCount(0))
    useFlavorLevel.getState().setLevel('subtle')
    const { container } = render(<Harness />)
    act(() => useStore.getState().mutate((p) => void (p.documents['design.npc'].data.archetypes = [{ id: 'x' }])))
    expect(container.querySelector('.flavor-toast')).toBeNull()

    useStore.getState().loadProject(withCount(0))
    useFlavorLevel.getState().setLevel('full')
    act(() => useStore.getState().mutate((p) => void (p.documents['design.npc'].data.archetypes = [{ id: 'x' }])))
    expect(en.flavor.milestone.npc1).toContain(container.querySelector('.flavor-toast span')?.textContent)

    // Seen: undo and redo the same edit does not celebrate again, even after the gap.
    act(() => useMoments.setState({ moment: null, lastAt: null }))
    act(() => useStore.getState().mutate((p) => void (p.documents['design.npc'].data.archetypes = [])))
    act(() => useStore.getState().mutate((p) => void (p.documents['design.npc'].data.archetypes = [{ id: 'y' }])))
    expect(container.querySelector('.flavor-toast')).toBeNull()
    useFlavorLevel.getState().setLevel('subtle')
  })
})

describe('hint asides', () => {
  it('maps a hint title key to its flavor key', () => {
    expect(hintFlavorKey('hints.roadmapOverload.title')).toBe('roadmapOverload')
  })

  it('every hint aside belongs to a real hint', () => {
    const hints = en.hints as Record<string, unknown>
    const orphans = Object.keys(en.flavor.hint).filter((k) => !(hints[k] as { title?: string } | undefined)?.title)
    expect(orphans).toEqual([])
  })

  it('shows the aside under the hint body, and none for hints without one', () => {
    void i18n.changeLanguage('en')
    useFlavorLevel.getState().setLevel('subtle')
    const base = { severity: 'suggest', scope: 'section', target: { docId: 'overview.roadmap' } } as const
    const { container, rerender } = render(<MemoryRouter><ul><HintCard hint={{ ...base, id: 'h1', ruleId: 'roadmap.overload', titleKey: 'hints.roadmapOverload.title', bodyKey: 'hints.roadmapOverload.body', params: { names: 'Alpha' } }} /></ul></MemoryRouter>)
    expect(en.flavor.hint.roadmapOverload).toContain(container.querySelector('.hint-card .flavor')?.textContent)
    rerender(<MemoryRouter><ul><HintCard hint={{ ...base, id: 'h2', ruleId: 'user.x', title: 'Custom', body: 'Body' }} /></ul></MemoryRouter>)
    expect(container.querySelector('.hint-card .flavor')).toBeNull()
  })
})
