import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import i18n from '../src/core/i18n'
import { App } from '../src/App'
import { createProject } from '../src/core/model/project'
import { useStore } from '../src/core/store/store'

afterEach(cleanup)
beforeEach(() => {
  useStore.getState().loadProject(createProject('Test', false))
  void i18n.changeLanguage('en')
})

const open = (hash: string) => {
  cleanup()
  location.hash = hash
  render(<App />)
}
const tabs = () => screen.getByRole('navigation', { name: 'Settings sections' })

describe('settings page', () => {
  it('lists every local section and opens each one', () => {
    open('#/settings')
    expect(location.hash).toBe('#/settings/general')
    const names = within(tabs()).getAllByRole('link').map((l) => l.textContent)
    expect(names).toEqual(['General', 'Genre & editors', 'Walkthrough', 'Hints', 'AI', 'Definitions', 'Data & backups'])
    // Members & history needs an open cloud project.
    expect(within(tabs()).queryByText('Members & history')).toBeNull()
    for (const name of names) {
      fireEvent.click(within(tabs()).getByRole('link', { name: name! }))
      expect(screen.getByRole('region', { name: name! })).toBeTruthy()
    }
  })

  it('redirects the old addresses to their tabs', () => {
    for (const [from, to] of [['#/ai', '#/settings/ai'], ['#/hints', '#/settings/hints'], ['#/definitions', '#/settings/definitions'], ['#/settings/nope', '#/settings/general']]) {
      open(from)
      expect(location.hash).toBe(to)
    }
    // Without a cloud project there is no sharing tab to land on.
    open('#/project')
    expect(location.hash).toBe('#/settings/general')
  })

  it('edits the project name in one undo step and switches the language', () => {
    open('#/settings/general')
    const panel = screen.getByRole('region', { name: 'General' })
    const before = useStore.getState().past.length
    fireEvent.change(within(panel).getByRole('textbox', { name: 'Project name' }), { target: { value: 'Renamed' } })
    expect(useStore.getState().project.meta.name).toBe('Renamed')
    expect(useStore.getState().past.length).toBe(before + 1)
    fireEvent.change(within(panel).getByRole('combobox', { name: 'Language' }), { target: { value: 'hu' } })
    expect(i18n.language).toBe('hu')
    void i18n.changeLanguage('en')
  })

  it('opens genre settings from the planner menu', () => {
    open('#/')
    fireEvent.click(screen.getByRole('link', { name: 'Choose genres' }))
    expect(location.hash).toBe('#/settings/genre')
    expect(screen.getByRole('button', { name: 'Choose genres' })).toBeTruthy()
  })
})
