import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { HashRouter } from 'react-router-dom'
import '../src/core/i18n'
import { App } from '../src/App'
import { createProject } from '../src/core/model/project'
import type { Project } from '../src/core/model/types'
import { evaluateWalkthrough, setStepManual } from '../src/core/walkthrough/evaluate'
import { projectWalkthrough } from '../src/core/walkthrough/project'
import { useStore } from '../src/core/store/store'
import { COMPANION_PIN_KEY, STUDIO_OFFER_KEY, UI_MODE_KEY } from '../src/core/uiMode'
import { UI_VERSION_KEY } from '../src/core/uiVersion'
import { HintCard } from '../src/ui/hints/HintPanel'
import { useCompanion } from '../src/ui/v3/Companion'

afterEach(() => {
  cleanup()
  act(() => useCompanion.getState().close())
})

function open(hash: string, project: Project = createProject('Companion')) {
  if (!project.documents['design.combat'].data.enemies?.length) project.documents['design.combat'].data.enemies = [{ id: 'gh', name: 'Ghoul', armor: 3 }]
  useStore.getState().loadProject(project, 'x')
  localStorage.setItem(UI_VERSION_KEY, 'v3')
  window.location.hash = hash
  return render(<App />)
}
const setWidth = (w: number) => act(() => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: w })
  window.dispatchEvent(new Event('resize'))
})

describe('v3 companion', () => {
  it('shows only the tool you click and switches between them from the tray', async () => {
    setWidth(1280)
    open('#/doc/design.combat?s=enemies')
    const tray = await screen.findByRole('complementary', { name: 'Companion' })
    expect(within(tray).getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? '')).toEqual([expect.stringMatching(/^Hints/), 'Guide', 'AI'])
    fireEvent.click(within(tray).getByRole('button', { name: 'Guide' }))
    const guide = screen.getByRole('dialog', { name: 'Guide' })
    expect(within(guide).getByRole('heading', { level: 2, name: 'Guide' })).toBeTruthy()
    // One tool at a time: no tab row, and nothing from the other tools.
    expect(within(guide).queryByRole('button', { name: /^Hints/ })).toBeNull()
    expect(within(guide).queryByRole('button', { name: 'AI' })).toBeNull()
    expect(guide.querySelector('.hint-group, .ai-panel')).toBeNull()
    expect(within(tray).getByRole('button', { name: 'Guide' }).getAttribute('aria-pressed')).toBe('true')
    // Another tray button switches tools; the open tool's own button closes the panel.
    fireEvent.click(within(tray).getByRole('button', { name: /^Hints/ }))
    const hints = screen.getByRole('dialog', { name: 'Hints' })
    expect(hints.querySelector('.hint-group')?.textContent).toBe('This page')
    expect(screen.queryByRole('dialog', { name: 'Guide' })).toBeNull()
    fireEvent.click(within(tray).getByRole('button', { name: /^Hints/ }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('closes the companion when you move to another page', async () => {
    setWidth(1280)
    open('#/doc/design.combat?s=enemies')
    const tray = await screen.findByRole('complementary', { name: 'Companion' })
    fireEvent.click(within(tray).getByRole('button', { name: 'AI' }))
    expect(screen.getByRole('dialog', { name: 'AI' })).toBeTruthy()
    act(() => void (window.location.hash = '#/doc/design.combat?s=bosses'))
    expect(await screen.findByRole('heading', { level: 1, name: 'Bosses' })).toBeTruthy()
    expect(screen.queryByRole('dialog', { name: 'AI' })).toBeNull()
  })

  it('offers hints and AI on the home page too', async () => {
    setWidth(1280)
    open('#/')
    const tray = await screen.findByRole('complementary', { name: 'Companion' })
    expect(within(tray).getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? '')).toEqual([expect.stringMatching(/^Hints/), 'AI'])
    fireEvent.click(within(tray).getByRole('button', { name: 'AI' }))
    expect(screen.getByRole('dialog', { name: 'AI' }).querySelector('.ai-panel')).toBeTruthy()
    fireEvent.click(within(tray).getByRole('button', { name: /^Hints/ }))
    // Away from a planner every hint of the project is listed, instead of a trip to the settings.
    expect(screen.getByRole('dialog', { name: 'Hints' }).querySelector('.hint-group')?.textContent).toMatch(/project-wide hint/)
    expect(window.location.hash).toBe('#/')
  })

  it('docks beside the page when pinned on a wide screen, and stays docked while moving', async () => {
    setWidth(1500)
    open('#/doc/design.combat?s=enemies')
    fireEvent.click(within(await screen.findByRole('complementary', { name: 'Companion' })).getByRole('button', { name: /^Hints/ }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Hints' })).getByRole('button', { name: 'Pin beside the page' }))
    expect(localStorage.getItem(COMPANION_PIN_KEY)).toBe('1')
    expect(screen.queryByRole('dialog')).toBeNull()
    const docked = screen.getByRole('region', { name: 'Hints' })
    expect(within(docked).getByRole('heading', { name: 'Hints' })).toBeTruthy()
    // The tray stays beside the docked panel, so switching tools works there too.
    fireEvent.click(within(screen.getByRole('complementary', { name: 'Companion' })).getByRole('button', { name: 'AI' }))
    expect(within(screen.getByRole('region', { name: 'AI' })).getByRole('heading', { name: 'AI' })).toBeTruthy()
    fireEvent.keyDown(document.body, { key: 'j' })
    expect(screen.getByRole('region', { name: 'AI' })).toBeTruthy()
    setWidth(1280)
  })
})

describe('Guided and Studio', () => {
  it('Studio shows every field, hides the pill, and clears the fog; Guided brings them back', async () => {
    setWidth(1280)
    open('#/doc/design.combat?s=enemies&e=gh')
    const sheet = await screen.findByRole('dialog', { name: 'enemy: Ghoul' })
    fireEvent.click(within(sheet).getByRole('tab', { name: /^Stats/ }))
    expect(within(sheet).queryByLabelText('Speed')).toBeNull()
    fireEvent.keyDown(sheet, { key: 'Escape' })
    expect(screen.getByRole('region', { name: 'Next walkthrough step' })).toBeTruthy()
    fireEvent.click(within(screen.getByRole('group', { name: 'Mode' })).getByRole('button', { name: 'Studio' }))
    expect(localStorage.getItem(UI_MODE_KEY)).toBe('studio')
    expect(screen.queryByRole('region', { name: 'Next walkthrough step' })).toBeNull()
    act(() => void (window.location.hash = '#/doc/design.combat?s=enemies&e=gh'))
    const studio = await screen.findByRole('dialog', { name: 'enemy: Ghoul' })
    fireEvent.click(within(studio).getByRole('tab', { name: /^Stats/ }))
    expect(within(studio).getByLabelText('Speed')).toBeTruthy()
    expect(within(studio).queryByRole('group', { name: 'Add detail' })).toBeNull()
    fireEvent.keyDown(studio, { key: 'Escape' })
    fireEvent.keyDown(document.body, { key: 'a' })
    expect(screen.queryByText('Uncharted')).toBeNull()
    fireEvent.click(within(screen.getByRole('group', { name: 'Mode' })).getByRole('button', { name: 'Guided' }))
    expect(localStorage.getItem(UI_MODE_KEY)).toBeNull()
  })

  it('suggests Studio only after ten finished walkthrough steps, and remembers "No thanks"', async () => {
    // A fresh sample project is not offered Studio, however many sections its seed data fills.
    open('#/')
    await screen.findByRole('heading', { level: 1 })
    expect(screen.queryByText(/Studio mode shows every field/)).toBeNull()
    cleanup()
    const p = createProject('Busy')
    const walk = projectWalkthrough(p)
    for (const s of walk.steps.slice(0, 12)) setStepManual(p, s.id, true)
    expect(evaluateWalkthrough(walk, p).done).toBeGreaterThanOrEqual(10)
    open('#/', p)
    const offer = await screen.findByText(/walkthrough steps\. Studio mode shows every field/)
    fireEvent.click(within(offer.closest('.banner') as HTMLElement).getByRole('button', { name: 'No thanks' }))
    expect(screen.queryByText(/Studio mode shows every field/)).toBeNull()
    expect(localStorage.getItem(STUDIO_OFFER_KEY)).toBe('dismissed')
  })

  it('starts empty sections from an example in Guided mode', async () => {
    const p = createProject('Empty')
    p.documents['design.combat'].data.enemies = []
    useStore.getState().loadProject(p, 'x')
    localStorage.setItem(UI_VERSION_KEY, 'v3')
    window.location.hash = '#/doc/design.combat?s=enemies'
    render(<App />)
    const first = await screen.findByRole('button', { name: 'Start from an example' })
    expect(first.className).toContain('primary')
    expect(screen.getByRole('button', { name: 'Start blank (enemy)' })).toBeTruthy()
  })
})

describe('hint links in v3', () => {
  it('open the entry a hint is about', () => {
    localStorage.setItem(UI_VERSION_KEY, 'v3')
    window.location.hash = '#/'
    const hint = { id: 'h1', ruleId: 'r', severity: 'suggest', scope: 'page', target: { docId: 'design.combat', sectionId: 'enemies', entityId: 'gh' }, title: 'Ghoul needs a weakness', body: 'Tanks need one.', action: { kind: 'goto', docId: 'design.combat', sectionId: 'enemies' } } as const
    render(<HashRouter><ul><HintCard hint={hint as never} /></ul></HashRouter>)
    fireEvent.click(screen.getByRole('button', { name: 'Go' }))
    expect(window.location.hash).toBe('#/doc/design.combat?s=enemies&e=gh')
  })
})
