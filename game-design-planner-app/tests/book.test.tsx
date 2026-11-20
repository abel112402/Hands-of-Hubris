import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import '../src/core/i18n'
import { App } from '../src/App'
import { createProject } from '../src/core/model/project'
import { deserializeProject } from '../src/core/persistence/serialize'
import { useStore } from '../src/core/store/store'
import { resetUiVersionOverride, UI_VERSION_KEY } from '../src/core/uiVersion'
import { bookIndex, bookStats, bookVisual, briefFigure, briefLead, briefNumbers, filledSections, tableColumns } from '../src/core/book'
import { MODULES, getSection } from '../src/core/modules/registry'
import type { CollectionSection } from '../src/core/model/types'

// Dynamic import with a string specifier because the project has no Node type definitions.
const fs: { readFileSync: (path: string, enc: string) => string } = await import('node:fs' as string)
const example = () => deserializeProject(fs.readFileSync('examples/cinderholm.hohplan.json', 'utf8')).project

afterEach(() => {
  cleanup()
  localStorage.removeItem(UI_VERSION_KEY)
  resetUiVersionOverride()
})

describe('Project Book data', () => {
  it('indexes where entries live and who references them', () => {
    const p = example()
    const { where, usedBy } = bookIndex(p)
    const crown = p.documents['design.factions'].data.factions.find((f: { name: string }) => f.name === 'Iron Crown')
    expect(where.get(crown.id)).toMatchObject({ docId: 'design.factions', sectionId: 'factions', label: 'Iron Crown' })
    // The Warden calling, the faction ending and the faction action all point at the Iron Crown.
    const users = (usedBy.get(crown.id) ?? []).map((u) => u.docId)
    expect(users).toContain('design.player')
    expect(users).toContain('design.factions')
  })

  it('picks a diagram view, never an editor or simulator', () => {
    const world = MODULES.find((m) => m.id === 'design.world')!
    const biomes = getSection(world, createProject('x', false).registry, 'biomes') as CollectionSection
    expect(bookVisual(biomes)?.kind).toBe('worldAtlas')
    const combat = MODULES.find((m) => m.id === 'design.combat')!
    const loadouts = getSection(combat, createProject('x', false).registry, 'loadouts') as CollectionSection
    expect(bookVisual(loadouts)?.kind).not.toBe('combatSandbox')
  })

  it('leaves empty sections out and counts the headline numbers', () => {
    const blank = createProject('Blank', false)
    expect(MODULES.every((m) => filledSections(blank, m.id).length === 0)).toBe(true)
    expect(bookStats(blank)).toEqual([])
    const p = example()
    expect(bookStats(p).find((s) => s.label === 'Biomes')?.value).toBe(6)
  })
})

describe('Project Book brief', () => {
  it('opens with written answers, counts and a featured figure', () => {
    const p = example()
    expect(briefLead(p, 'overview.vision')[0]).toMatchObject({ label: 'One-sentence pitch' })
    expect(briefNumbers(p, 'design.combat').find((n) => n.label === 'Enemies')?.value).toBe(24)
    expect(briefFigure(p, 'design.factions')?.id).toBe('relationGraph')
    expect(briefFigure(p, 'design.world')?.id).toBe('biomes')
    // A planner without a featured pick falls back to its first diagram or chart.
    expect(briefFigure(p, 'production.team')?.id).toBe('process')
  })

  it('puts long lists in a table that keeps every filled field', () => {
    const p = example()
    const combat = MODULES.find((m) => m.id === 'design.combat')!
    const sec = getSection(combat, p.registry, 'enemies') as CollectionSection
    const { main, rest } = tableColumns(sec, p.documents['design.combat'].data.enemies)
    expect(main.map((f) => f.key)).toEqual(['biome', 'role', 'hp', 'damage', 'attackRate', 'armor'])
    expect(rest.map((f) => f.key)).toContain('xp')
  })
})

describe('Project Book page', () => {
  const open = (hash: string) => {
    useStore.getState().loadProject(example(), 'cinderholm.hohplan.json')
    localStorage.setItem(UI_VERSION_KEY, 'v3')
    window.location.hash = hash
    return render(<App />)
  }

  it('shows the brief by default: cover, a chapter per planner and numbered figures', async () => {
    const { container } = open('#/book')
    expect(await screen.findByRole('heading', { level: 1, name: 'Cinderholm (example)' }, { timeout: 10000 })).toBeTruthy()
    expect(screen.getByText('Game design brief')).toBeTruthy()
    expect(container.querySelectorAll('.book-chapter').length).toBe(MODULES.length)
    expect(container.querySelector('figcaption')?.textContent).toMatch(/^Figure 1\. /)
    expect(container.querySelector('.book-table')).toBeNull()
    expect(screen.getByRole('button', { name: /Print/ })).toBeTruthy()
  }, 30000)

  it('shows every entry in the full-data appendix, with links to the editor', async () => {
    const { container } = open('#/book?m=data')
    expect(await screen.findByText('Game design data · appendix', undefined, { timeout: 10000 })).toBeTruthy()
    expect(container.querySelectorAll('.book-table').length).toBeGreaterThan(10)
    expect(container.querySelectorAll('svg.book-graph').length).toBeGreaterThan(5)
    const link = screen.getAllByRole('link', { name: 'Iron Crown' })[0] as HTMLAnchorElement
    expect(link.getAttribute('href')).toMatch(/^#\/doc\/design\.factions\?s=factions&e=/)
  }, 30000)

  it('says so when nothing is filled in yet', async () => {
    useStore.getState().loadProject(createProject('Empty', false), 'x')
    localStorage.setItem(UI_VERSION_KEY, 'v3')
    window.location.hash = '#/book'
    render(<App />)
    expect(await screen.findByText(/Nothing to show yet/)).toBeTruthy()
  })
})
