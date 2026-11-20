import { describe, expect, it } from 'vitest'
import { createProject } from '../src/core/model/project'
import { buildPaletteIndex, entityRoute, searchPalette } from '../src/core/palette'
import { COMPACT_BELOW, DOCK_WIDTH, shellColumns, shellLayout, TRAY_WIDTH } from '../src/core/shellLayout'

const withEnemies = () => {
  const p = createProject('Palette')
  p.documents['design.combat'].data.enemies = [
    { id: 'gh', name: 'Ghoul' },
    { id: 'ew', name: 'Enemy without a plan' },
    { id: 'nn', name: '   ' },
  ]
  return p
}

describe('palette index', () => {
  it('lists every planner and section, and every named entry with a route that selects it', () => {
    const items = buildPaletteIndex(withEnemies())
    expect(items.find((i) => i.id === 'p:design.combat')).toMatchObject({ kind: 'planner', to: '/doc/design.combat' })
    expect(items.find((i) => i.id === 's:design.combat/enemies')).toMatchObject({ kind: 'section', to: '/doc/design.combat?s=enemies' })
    expect(items.find((i) => i.label === 'Ghoul')).toMatchObject({ kind: 'entity', to: entityRoute('design.combat', 'enemies', 'gh'), detail: expect.stringContaining('Enemies') })
    // Unnamed entries have nothing to search for.
    expect(items.some((i) => i.id === 'e:design.combat/enemies/nn')).toBe(false)
  })

  it('ranks the best label match first and needs every word', () => {
    const items = buildPaletteIndex(withEnemies())
    const hits = searchPalette(items, 'enem')
    // The section "Enemies" starts with the word and outranks an entry that merely contains it.
    expect(hits[0]).toMatchObject({ kind: 'section', label: 'Enemies' })
    expect(hits.some((h) => h.label === 'Enemy without a plan')).toBe(true)
    expect(searchPalette(items, 'ghoul')[0]).toMatchObject({ kind: 'entity', label: 'Ghoul' })
    expect(searchPalette(items, 'ghoul combat')[0]?.label).toBe('Ghoul')
    expect(searchPalette(items, 'ghoul zzz')).toEqual([])
    // A planner's name in the detail line alone does not list all its sections.
    const bos = searchPalette(items, 'bos').map((h) => h.label)
    expect(bos).toContain('Bosses')
    expect(bos).not.toContain('Combat system')
  })

  it('shows the planners for an empty query', () => {
    const hits = searchPalette(buildPaletteIndex(createProject('P')), '   ')
    expect(hits.length).toBeGreaterThan(5)
    expect(hits.every((h) => h.kind === 'planner')).toBe(true)
  })
})

describe('v3 layout budget', () => {
  it('keeps at least 60% of the width for the work surface on laptop and desktop screens', () => {
    for (const w of [1024, 1280, 1440, 1920]) {
      for (const pinned of [false, true]) {
        const l = shellLayout(w, { companionPinned: pinned })
        expect(l.surface / w, `${w}px pinned=${pinned}`).toBeGreaterThanOrEqual(0.6)
        expect(l.rail + l.surface + l.companion).toBe(w)
      }
    }
  })

  it('docks a pinned companion only on wide screens', () => {
    expect(shellLayout(1439, { companionPinned: true }).companionDocked).toBe(false)
    expect(shellLayout(1440, { companionPinned: true })).toMatchObject({ companionDocked: true, companion: DOCK_WIDTH + TRAY_WIDTH })
    expect(shellLayout(1920).companionDocked).toBe(false)
  })

  it('gives narrow screens the whole width and a bottom bar', () => {
    const l = shellLayout(COMPACT_BELOW - 1)
    expect(l).toMatchObject({ compact: true, rail: 0, companion: 0, surface: COMPACT_BELOW - 1 })
    expect(shellColumns(l)).toBe('minmax(0, 1fr)')
    expect(shellColumns(shellLayout(1280))).toBe('72px minmax(0, 1fr) 56px')
  })
})
