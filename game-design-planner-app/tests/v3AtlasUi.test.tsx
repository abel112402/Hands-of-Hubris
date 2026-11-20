import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import '../src/core/i18n'
import { App } from '../src/App'
import { createProject } from '../src/core/model/project'
import { useStore } from '../src/core/store/store'
import { resetUiVersionOverride, UI_VERSION_KEY } from '../src/core/uiVersion'

afterEach(() => {
  cleanup()
  localStorage.removeItem(UI_VERSION_KEY)
  localStorage.removeItem('hohplan:atlasView')
  resetUiVersionOverride()
})

function open() {
  useStore.getState().loadProject(createProject('Atlas home'), 'x')
  localStorage.setItem(UI_VERSION_KEY, 'v3')
  window.location.hash = '#/'
  return render(<App />)
}

describe('v3 Atlas home', () => {
  it('shows the project, the emblem, the next step and every planner on the map', async () => {
    const { container } = open()
    expect(await screen.findByRole('heading', { level: 1, name: 'Atlas home' })).toBeTruthy()
    // The sample project has some content, so its rank depends on the seed data.
    expect(screen.getByRole('region', { name: /^Design emblem: \w+, \d+% explored$/ })).toBeTruthy()
    const step = screen.getByRole('region', { name: 'Your next step' })
    expect(within(step).getByRole('button', { name: /Open step/ })).toBeTruthy()
    expect(container.querySelectorAll('.atlas3-lm').length).toBeGreaterThan(30)
    expect(container.querySelector('.atlas3-lm.here')).toBeTruthy()
    // The classic walkthrough (with its hints and AI tabs) stays one click away.
    expect(screen.getByText('The whole walkthrough, hints and AI')).toBeTruthy()
  })

  it('opens the next step and planners from the map', async () => {
    open()
    const step = await screen.findByRole('region', { name: 'Your next step' })
    fireEvent.click(within(step).getByRole('button', { name: /Open step/ }))
    expect(window.location.hash).toMatch(/^#\/doc\//)
    fireEvent.keyDown(document.body, { key: 'a' })
    fireEvent.click(await screen.findByRole('link', { name: /^Combat, Enemies & Bosses, \d+% filled/ }))
    expect(window.location.hash).toBe('#/doc/design.combat')
  })

  it('offers the same planners as a list, and remembers the choice', async () => {
    const { container } = open()
    await screen.findByRole('heading', { level: 1 })
    fireEvent.click(screen.getByRole('button', { name: 'List' }))
    expect(container.querySelector('.atlas3-map')).toBeNull()
    expect(screen.getByRole('heading', { level: 2, name: /^Core systems/ })).toBeTruthy()
    expect(localStorage.getItem('hohplan:atlasView')).toBe('list')
  })

  it('marks a step done from the card as one undoable step', async () => {
    open()
    const step = await screen.findByRole('region', { name: 'Your next step' })
    const title = within(step).getByRole('heading', { level: 2 }).textContent
    fireEvent.click(within(step).getByRole('button', { name: 'Mark done' }))
    expect(within(screen.getByRole('region', { name: 'Your next step' })).getByRole('heading', { level: 2 }).textContent).not.toBe(title)
    act(() => useStore.getState().undo())
    expect(within(screen.getByRole('region', { name: 'Your next step' })).getByRole('heading', { level: 2 }).textContent).toBe(title)
  })
})
