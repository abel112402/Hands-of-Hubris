import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import '../src/core/i18n'
import { App } from '../src/App'
import { createProject } from '../src/core/model/project'
import { useStore } from '../src/core/store/store'
import { resetUiVersionOverride, UI_VERSION_KEY } from '../src/core/uiVersion'

afterEach(() => {
  cleanup()
  localStorage.removeItem(UI_VERSION_KEY)
  resetUiVersionOverride()
})

function open(hash: string) {
  const p = createProject('Nav v3')
  p.documents['design.combat'].data.enemies = [{ id: 'gh', name: 'Ghoul' }]
  useStore.getState().loadProject(p, 'x')
  localStorage.setItem(UI_VERSION_KEY, 'v3')
  window.location.hash = hash
  return render(<App />)
}

describe('v3 navigation', () => {
  it('opens a phase from the compass and a planner from its flyout', async () => {
    open('#/')
    const rail = await screen.findByRole('navigation', { name: 'Main' })
    const phases = within(rail).getAllByRole('button').map((b) => b.querySelector('.rail3-label')?.textContent)
    expect(phases).toEqual(['Concept', 'Core systems', 'Content', 'Production', 'Polish & ship'])
    fireEvent.click(within(rail).getByRole('button', { name: /^Core systems/ }))
    const flyout = screen.getByRole('dialog', { name: 'Core systems' })
    fireEvent.click(within(flyout).getByRole('link', { name: /Combat, Enemies & Bosses/ }))
    expect(window.location.hash).toBe('#/doc/design.combat')
    expect(screen.queryByRole('dialog', { name: 'Core systems' })).toBeNull()
    // The rail marks the phase of the planner on screen.
    expect(within(rail).getByRole('button', { name: /^Core systems/ }).getAttribute('aria-current')).toBe('location')
  })

  it('shows where you are in the breadcrumb, with sideways menus', async () => {
    open('#/doc/design.combat?s=enemies&e=gh')
    const crumbs = await screen.findByRole('navigation', { name: 'You are here' })
    expect(crumbs.textContent).toContain('Atlas')
    expect(crumbs.textContent).toContain('Combat, Enemies & Bosses')
    expect(crumbs.textContent).toContain('Ghoul')
    const [planners, sections] = Array.from(crumbs.querySelectorAll('details'))
    expect(planners.querySelector('summary')!.getAttribute('aria-label')).toBe('Combat, Enemies & Bosses: other planners in Core systems')
    expect(sections.querySelector('summary')!.getAttribute('aria-label')).toBe('Enemies: other sections of Combat, Enemies & Bosses')
    fireEvent.click(within(sections).getByRole('button', { name: 'Bosses' }))
    expect(window.location.hash).toBe('#/doc/design.combat?s=bosses')
  })

  it('moves with the keyboard: J/K sections, M map, A atlas; not while typing', async () => {
    open('#/doc/design.combat?s=enemies')
    await screen.findByRole('heading', { level: 1, name: 'Enemies' })
    fireEvent.keyDown(document.body, { key: 'j' })
    expect(window.location.hash).toBe('#/doc/design.combat?s=bosses')
    fireEvent.keyDown(document.body, { key: 'k' })
    expect(window.location.hash).toBe('#/doc/design.combat?s=enemies')
    fireEvent.keyDown(document.body, { key: 'm' })
    expect(screen.getByRole('dialog', { name: 'System map' })).toBeTruthy()
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    // Typing in a field never triggers a shortcut.
    fireEvent.click(await screen.findByRole('button', { name: 'Filter' }))
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Filter' }), { key: 'a' })
    expect(window.location.hash).toBe('#/doc/design.combat?s=enemies')
    fireEvent.keyDown(document.body, { key: 'a' })
    expect(window.location.hash).toBe('#/')
  })

  it('keeps the next walkthrough step one click away', async () => {
    open('#/doc/design.combat?s=enemies')
    const step = await screen.findByRole('button', { name: /^Current walkthrough step: / })
    const pill = screen.getByRole('region', { name: 'Next walkthrough step' })
    fireEvent.click(within(pill).getByRole('button', { name: 'Hide until the next step' }))
    expect(screen.queryByRole('region', { name: 'Next walkthrough step' })).toBeNull()
    fireEvent.click(step)
    expect(window.location.hash).toMatch(/^#\/doc\//)
  })
})
