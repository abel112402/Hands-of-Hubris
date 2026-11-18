import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import i18n from '../src/core/i18n'
import en from '../src/core/i18n/en.json'
import hu from '../src/core/i18n/hu.json'
import { COSTUMES, costumeFor, costumeForMoment, costumeForSeed, costumeForTime, isCostume, wrongCostume } from '../src/core/mascots/cast'
import { CostumeParade, HubiLineup } from '../src/ui/mascots/Lineup'
import { LoadingLine } from '../src/ui/flavor/easter'
// No Node types in this project: same untyped import as tests/tokens.test.ts.
const { readFileSync }: { readFileSync: (path: string, enc: string) => string } = await import('node:fs' as string)
import { HintCard } from '../src/ui/hints/HintPanel'
import { Issues } from '../src/ui/pages/Issues'
import { MODULES } from '../src/core/modules/registry'
import { MILESTONES } from '../src/core/flavor/milestones'
import { availableCostumes, hasPose, HubiSays, Mascot, mascotSrc } from '../src/ui/mascots/Mascot'
import { Flavor, useFlavorLevel } from '../src/ui/flavor/Flavor'
import { FlavorToast, useMoments } from '../src/ui/flavor/moments'
import { fireEvent, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { REFLECT_PARAMS, rankReflections, reflections, type ReflectKey } from '../src/core/mascots/reflect'
import { autoAllowed, AUTO_GAP_MS, AUTO_MAX_PER_SESSION, fillParams, kindAt, nthLine } from '../src/core/mascots/lines'
import { createProject } from '../src/core/model/project'
import { useStore } from '../src/core/store/store'
import { companionLine, MascotCompanion } from '../src/ui/mascots/MascotCompanion'
import { Wardrobe } from '../src/ui/mascots/Wardrobe'
import { useWardrobe } from '../src/ui/mascots/wardrobeStore'
import { StatusCard } from '../src/ui/mascots/StatusCard'

const langs = { en, hu } as const
type Bag = Record<string, unknown>
const at = (obj: unknown, path: string): unknown => path.split('.').reduce<unknown>((o, k) => (o as Bag | undefined)?.[k], obj)
const placeholders = (s: string) => [...s.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1])

describe('Hubi texts', () => {
  for (const [lng, res] of Object.entries(langs)) {
    it(`${lng}: every costume has tips and jokes, short enough for a bubble`, () => {
      for (const c of COSTUMES) {
        for (const kind of ['tip', 'joke']) {
          const lines = at(res, `mascot.${c}.${kind}`) as string[]
          expect(Array.isArray(lines) && lines.length >= 4, `${c}.${kind}`).toBe(true)
          for (const l of lines) expect(l.length, l).toBeLessThanOrEqual(120)
        }
      }
    })

    it(`${lng}: every reflection has lines that use only its own params`, () => {
      for (const [key, params] of Object.entries(REFLECT_PARAMS)) {
        const lines = at(res, `mascot.reflect.${key}`) as string[]
        expect(Array.isArray(lines) && lines.length > 0, key).toBe(true)
        for (const l of lines) {
          expect(l.length, l).toBeLessThanOrEqual(120)
          for (const p of placeholders(l)) expect(params as readonly string[], `${key}: ${l}`).toContain(p)
        }
      }
      // No stray reflection texts without a rule.
      expect(Object.keys(at(res, 'mascot.reflect') as Bag).sort()).toEqual(Object.keys(REFLECT_PARAMS).sort())
    })
  }
})

describe('reflections', () => {
  const keys = (list: { key: ReflectKey }[]) => list.map((r) => r.key)

  it('speaks about an empty planner and the whole project', () => {
    const p = createProject('Test', false)
    const r = reflections(p, { docId: 'design.items', now: 0 })
    expect(keys(r)).toContain('docEmpty')
    expect(keys(r)).toContain('overallLow')
    expect(r.find((x) => x.key === 'docEmpty')?.costume).toBe('smith')
    expect(r.find((x) => x.key === 'overallLow')?.costume).toBe('suit')
  })

  it('counts hints, items without recipes and open questions', () => {
    const p = createProject('Test', false)
    p.documents['design.items'] = { moduleVersion: 1, data: {} }
    p.documents['design.openQuestions'] = { moduleVersion: 1, data: {} }
    p.documents['design.items'].data.items = Array.from({ length: 12 }, (_, i) => ({ id: `i${i}`, name: `Item ${i}` }))
    p.documents['design.openQuestions'].data.questions = Array.from({ length: 6 }, (_, i) => ({ id: `q${i}`, question: `Q${i}`, status: 'Open' }))
    const r = reflections(p, { docId: 'design.items', hintsHere: 4, hintsTotal: 12, now: 0 })
    expect(r.find((x) => x.key === 'hintsHere')?.params).toEqual({ count: 4 })
    expect(r.find((x) => x.key === 'hintsTotal')?.costume).toBe('zombie')
    expect(r.find((x) => x.key === 'itemsNoRecipes')?.params).toEqual({ items: 12, recipes: 0 })
    expect(r.find((x) => x.key === 'questionsOpen')?.costume).toBe('wizard')
    // Heavier (more relevant) first.
    const ranked = rankReflections(r)
    for (let i = 1; i < ranked.length; i++) expect(ranked[i - 1].weight).toBeGreaterThanOrEqual(ranked[i].weight)
  })

  it('is deterministic and never throws on a seeded project', () => {
    const p = createProject('Test', true)
    expect(reflections(p, { docId: 'overview.roadmap', now: 0 })).toEqual(reflections(p, { docId: 'overview.roadmap', now: 0 }))
    for (const m of MODULES) expect(() => reflections(p, { docId: m.id, now: 0 })).not.toThrow()
  })
})

describe('companion lines', () => {
  it('cycles reflection, tip and (at Full) joke', () => {
    expect([0, 1, 2, 3].map((s) => kindAt(s, true))).toEqual(['reflect', 'tip', 'joke', 'reflect'])
    expect([0, 1, 2].map((s) => kindAt(s, false))).toEqual(['reflect', 'tip', 'reflect'])
  })

  it('walks a list without repeats and fills params', () => {
    const list = ['a', 'b', 'c']
    expect(new Set([0, 1, 2].map((n) => nthLine(list, 'seed', n))).size).toBe(3)
    expect(nthLine([], 's', 0)).toBeUndefined()
    expect(fillParams('{{a}} of {{b}}{{c}}', { a: 3, b: 'x' })).toBe('3 of x')
  })

  it('limits speaking up by itself', () => {
    expect(autoAllowed(0, null, 0)).toBe(true)
    expect(autoAllowed(AUTO_GAP_MS - 1, 0, 1)).toBe(false)
    expect(autoAllowed(AUTO_GAP_MS, 0, 1)).toBe(true)
    expect(autoAllowed(AUTO_GAP_MS * 10, 0, AUTO_MAX_PER_SESSION)).toBe(false)
  })

  it('skips to a tip when there is nothing to reflect on', async () => {
    await i18n.changeLanguage('en')
    const line = companionLine(i18n, 'pirate', [], 0, false, 's')
    expect(line?.kind).toBe('tip')
    expect(en.mascot.pirate.tip).toContain(line?.text)
  })
})

describe('MascotCompanion', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    useFlavorLevel.setState({ level: 'subtle' })
    useStore.setState({ project: createProject('Test', false), readOnly: false })
  })

  const show = () => render(<MemoryRouter><MascotCompanion docId="design.trade" /></MemoryRouter>)

  it('peeks in the planner costume and talks when clicked', () => {
    const { container } = show()
    const btn = screen.getByRole('button', { name: /pirate costume/ })
    expect(container.querySelector('img.mascot-pirate')).not.toBeNull()
    fireEvent.click(btn)
    expect(container.querySelector('.hubi-companion-bubble p')?.textContent).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Another one' }))
    expect(container.querySelector('.hubi-kind')?.textContent).toBe('Tip')
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(container.querySelector('.hubi-companion-bubble')).toBeNull()
  })

  it('is hidden when personality is off or the project is read-only', () => {
    act(() => useFlavorLevel.setState({ level: 'off' }))
    expect(show().container.innerHTML).toBe('')
    cleanup()
    act(() => {
      useFlavorLevel.setState({ level: 'subtle' })
      useStore.setState({ readOnly: true })
    })
    expect(show().container.innerHTML).toBe('')
  })
})

// Hubi is switched off in the app (src/core/mascots/config.ts); these tests keep him working for when he returns.
vi.mock('../src/core/mascots/config', () => ({ MASCOTS_ENABLED: true }))

afterEach(cleanup)

describe('Hubi costumes', () => {
  it('has an idle picture for every costume', () => {
    expect(availableCostumes()).toEqual([...COSTUMES])
    // A missing pose falls back to idle.
    expect(mascotSrc('knight', 'cheer')).toBe(mascotSrc('knight', 'idle'))
    // hasPose tells a drawn pose from the idle fallback (none drawn yet, so only idle counts).
    expect(hasPose('knight', 'idle')).toBe(true)
    for (const c of COSTUMES) expect(hasPose(c, 'peek')).toBe(!!mascotSrc(c, 'peek') && mascotSrc(c, 'peek') !== mascotSrc(c, 'idle'))
  })

  it('dresses every planner in a known costume', () => {
    for (const m of MODULES) expect(isCostume(costumeFor(m.id)), m.id).toBe(true)
    expect(costumeFor('design.items')).toBe('smith')
    expect(costumeFor('production.milestones')).toBe('suit')
    expect(costumeFor('nope.unknown')).toBe('suit')
    expect(costumeFor(undefined)).toBe('suit')
  })

  it('picks a costume for moments', () => {
    expect(costumeForMoment('flavor.welcomeBack')).toBe('zombie')
    expect(costumeForMoment('flavor.phaseDone')).toBe('suit')
    for (const m of MILESTONES) expect(isCostume(costumeForMoment(`flavor.milestone.${m.id}`, m.docId))).toBe(true)
    expect(costumeForMoment('flavor.milestone.npc1', 'design.npc')).toBe('farmer')
  })

  it('names every costume in both languages', () => {
    for (const c of COSTUMES) {
      expect(en.mascot.costume[c]).toBeTruthy()
      expect(hu.mascot.costume[c]).toBeTruthy()
    }
  })
})

describe('Hubi components', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    useFlavorLevel.setState({ level: 'subtle' })
  })

  it('is decorative unless labelled', () => {
    const { container, rerender } = render(<Mascot costume="pirate" />)
    expect(container.querySelector('img')?.getAttribute('alt')).toBe('')
    rerender(<Mascot costume="pirate" labelled />)
    expect(container.querySelector('img')?.getAttribute('alt')).toBe('Hubi in a pirate costume')
  })

  it('says nothing without a line', () => {
    const { container } = render(<HubiSays costume="wizard">{null}</HubiSays>)
    expect(container.innerHTML).toBe('')
  })

  it('puts a flavor line in a speech bubble when given a costume, and none when flavor is off', () => {
    const { container, rerender } = render(<Flavor keys="flavor.noHints" costume="suit" />)
    expect(container.querySelector('.hubi-bubble')?.textContent).toBeTruthy()
    expect(container.querySelector('img.mascot-suit')).not.toBeNull()
    act(() => useFlavorLevel.setState({ level: 'off' }))
    rerender(<Flavor keys="flavor.noHints" costume="suit" />)
    expect(container.innerHTML).toBe('')
  })

  it('shows the costume of the moment in the corner bubble', () => {
    useMoments.setState({ moment: null, lastAt: null })
    const { container } = render(<FlavorToast />)
    act(() => {
      useMoments.getState().announce({ keys: 'flavor.phaseDone' }, true)
    })
    expect(container.querySelector('.flavor-toast img.mascot-suit')).not.toBeNull()
  })
})

describe('wardrobe', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    localStorage.removeItem('hohplan:mascot:muted')
    useWardrobe.setState({ muted: [] })
    useFlavorLevel.setState({ level: 'subtle' })
    useStore.setState({ project: createProject('Test', false), readOnly: false })
  })

  it('switches a costume off and on, and remembers it in the browser', () => {
    render(<Wardrobe />)
    const pirate = screen.getByRole('button', { name: /pirate costume: on/ })
    expect(pirate.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(pirate)
    expect(useWardrobe.getState().muted).toEqual(['pirate'])
    expect(JSON.parse(localStorage.getItem('hohplan:mascot:muted') ?? '[]')).toEqual(['pirate'])
    expect(screen.getByRole('button', { name: /pirate costume: off/ }).getAttribute('aria-pressed')).toBe('false')
    // The wardrobe still shows the muted costume, greyed out.
    expect(document.querySelector('.muted-costume img.mascot-pirate')).not.toBeNull()
  })

  it('a muted costume disappears but its line stays as plain text', () => {
    useWardrobe.setState({ muted: ['suit'] })
    const { container } = render(<Flavor keys="flavor.noHints" costume="suit" />)
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('p.flavor')?.textContent).toBeTruthy()
  })

  it('hides the companion in a muted planner costume', () => {
    useWardrobe.setState({ muted: ['pirate'] })
    const { container } = render(<MemoryRouter><MascotCompanion docId="design.trade" /></MemoryRouter>)
    expect(container.innerHTML).toBe('')
  })
})

describe('StatusCard', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    useWardrobe.setState({ muted: [] })
    useFlavorLevel.setState({ level: 'subtle' })
    useStore.setState({ project: createProject('Test', false), readOnly: false })
  })

  it('reports on the project and walks to another remark', () => {
    const { container } = render(<MemoryRouter><StatusCard /></MemoryRouter>)
    const first = container.querySelector('.hubi-bubble')?.textContent
    expect(first).toBeTruthy()
    expect(first).not.toMatch(/\{\{/)
    const more = screen.queryByRole('button', { name: 'Another one' })
    if (more) {
      fireEvent.click(more)
      expect(container.querySelector('.hubi-bubble')?.textContent).toBeTruthy()
    }
  })

  it('is hidden when personality is off', () => {
    useFlavorLevel.setState({ level: 'off' })
    expect(render(<MemoryRouter><StatusCard /></MemoryRouter>).container.innerHTML).toBe('')
  })
})

describe('Hubi around the app', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    useWardrobe.setState({ muted: [] })
    useFlavorLevel.setState({ level: 'subtle' })
  })

  it('dresses for the time of day, the loading screen and April Fools', () => {
    for (const b of ['night', 'morning', 'afternoon', 'fridayAfternoon', 'evening', 'weekend'] as const) expect(isCostume(costumeForTime(b))).toBe(true)
    expect(costumeForTime('night')).toBe('zombie')
    expect(costumeForTime('fridayAfternoon')).toBe('suit')
    expect(costumeForSeed('2026-11-9')).toBe(costumeForSeed('2026-11-9'))
    expect(new Set(Array.from({ length: 30 }, (_, i) => costumeForSeed(`d${i}`))).size).toBeGreaterThan(1)
    // Always wrong, and every costume maps to a different wrong one.
    for (const c of COSTUMES) expect(wrongCostume(c)).not.toBe(c)
    expect(new Set(COSTUMES.map(wrongCostume)).size).toBe(COSTUMES.length)
  })

  it('has costume-change and April Fools lines in both languages', () => {
    for (const res of [en, hu]) {
      expect(res.mascot.aprilFools.length).toBeGreaterThan(0)
      for (const c of COSTUMES) {
        const lines = at(res, `mascot.${c}.dressUp`) as string[]
        expect(lines.length, c).toBeGreaterThanOrEqual(2)
        for (const l of lines) expect(l.length).toBeLessThanOrEqual(120)
      }
    }
  })

  it('lines up every costume that is switched on when the walkthrough is done', () => {
    useWardrobe.setState({ muted: ['zombie'] })
    const { container } = render(<HubiLineup />)
    expect(container.querySelectorAll('.hubi-lineup img')).toHaveLength(COSTUMES.length - 1)
    expect(container.querySelector('img.mascot-zombie')).toBeNull()
    expect(container.querySelector('figcaption')?.textContent).toBeTruthy()
  })

  it('runs through every costume in the Konami parade and ends as the wizard', () => {
    vi.useFakeTimers()
    try {
      const { container } = render(<CostumeParade />)
      const seen = new Set<string>()
      for (let i = 0; i <= COSTUMES.length; i++) {
        seen.add(container.querySelector('img')!.className)
        act(() => vi.advanceTimersByTime(300))
      }
      expect(seen.size).toBe(COSTUMES.length)
      expect(container.querySelector('img.mascot-wizard')).not.toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('says the loading line with Hubi, or the plain fallback when flavor is off', () => {
    const { container, rerender } = render(<LoadingLine fallback="Loading…" />)
    expect(container.querySelector('.hubi-loading img')).not.toBeNull()
    act(() => useFlavorLevel.setState({ level: 'off' }))
    rerender(<LoadingLine fallback="Loading…" />)
    expect(container.textContent).toBe('Loading…')
  })
})

describe('where Hubi never appears', () => {
  // Security, sign-in, error banners, imports/exports and saving stay dry (plans/PERSONALITY_PLAN.md §2).
  const FORBIDDEN = [
    'src/ui/ai/AiSettings.tsx',
    'src/ui/cloud/CloudBanners.tsx',
    'src/ui/cloud/Landing.tsx',
    'src/ui/cloud/ProjectSettings.tsx',
    'src/ui/actions.ts',
    'src/core/export/markdown.ts',
    'src/core/persistence/autosave.ts',
    'src/core/persistence/file.ts',
    'src/core/persistence/serialize.ts',
  ]
  it.each(FORBIDDEN)('%s has no mascot or flavor text', (file) => {
    const src = readFileSync(file, 'utf8')
    expect(src).not.toMatch(/\b(Mascot|HubiSays|HubiLineup|MascotCompanion|Flavor|useFlavor|LoadingLine)\b/)
  })
})

describe('Hubi on hint cards and quiet pages', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    useWardrobe.setState({ muted: [] })
    useFlavorLevel.setState({ level: 'subtle' })
  })

  it('puts a small figure in the planner costume next to a hint aside', () => {
    const hint = { id: 'h1', ruleId: 'r', severity: 'suggest', scope: 'page', target: { docId: 'design.trade' }, titleKey: 'hints.roadmapOverload.title', bodyKey: 'hints.roadmapOverload.body', params: { weeks: 3 } } as unknown as Parameters<typeof HintCard>[0]['hint']
    const { container } = render(<MemoryRouter><HintCard hint={hint} /></MemoryRouter>)
    expect(container.querySelector('.hint-aside img.mascot-pirate')).not.toBeNull()
    expect(container.querySelector('.hint-aside span')?.textContent).toBeTruthy()
  })

  it('has the zombie on a clean Issues page only', () => {
    useStore.setState({ project: createProject('Test', false), readOnly: false })
    const { container } = render(<MemoryRouter><Issues /></MemoryRouter>)
    expect(container.querySelector('img.mascot-zombie')).not.toBeNull()
  })
})
