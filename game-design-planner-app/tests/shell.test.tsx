import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import '../src/core/i18n'
import { App } from '../src/App'

beforeEach(() => {
  for (const k of Object.keys(localStorage)) if (k.startsWith('hohplan:systemMap')) localStorage.removeItem(k)
})
afterEach(cleanup)

describe('top bar', () => {
  it('has labelled icon buttons, one filled Save and the file actions in its menu', () => {
    window.location.hash = '#/'
    const { container } = render(<App />)
    const bar = container.querySelector('header.topbar') as HTMLElement
    expect(within(bar).getByRole('button', { name: 'Undo' })).toBeTruthy()
    expect(within(bar).getByRole('button', { name: 'Redo' })).toBeTruthy()
    expect(bar.querySelectorAll('button.primary')).toHaveLength(1)
    const menu = within(bar).getByLabelText('File and project actions').closest('details')!
    for (const name of ['New', 'Open…', 'Save as…', 'Export Markdown (.zip)', 'Create snapshot']) {
      expect(within(menu).getByRole('button', { name, hidden: true })).toBeTruthy()
    }
    const nav = within(bar).getByRole('navigation', { name: 'Main' })
    expect(within(nav).getByText('Definitions')).toBeTruthy()
    expect(bar.textContent).not.toMatch(/[↶↷🔍🤖]/u)
  })

  it('menu closes after choosing an item and on Escape', () => {
    window.location.hash = '#/'
    const { container } = render(<App />)
    const menu = container.querySelector('header .split-menu') as HTMLDetailsElement
    menu.open = true
    fireEvent.click(within(menu).getByRole('button', { name: 'Create snapshot', hidden: true }))
    expect(menu.open).toBe(false)
    menu.open = true
    fireEvent.keyDown(menu, { key: 'Escape' })
    expect(menu.open).toBe(false)
  })
})

describe('editor toolbar', () => {
  it('groups document import and export in one menu next to Help', () => {
    window.location.hash = '#/doc/design.coreLoop'
    const { container } = render(<App />)
    const bar = container.querySelector('.toolbar') as HTMLElement
    const doc = within(bar).getByLabelText(/^Document actions/).closest('details')!
    for (const name of ['Download Markdown (.md)', 'Export as JSON', 'Import from JSON…']) {
      expect(within(doc).getByRole('button', { name, hidden: true })).toBeTruthy()
    }
    expect(within(bar).getByRole('button', { name: 'Help' })).toBeTruthy()
    expect(within(bar).queryByText('.md')).toBeNull()
  })

  it('opens the system map on the first visit to a planner, then remembers it closed', () => {
    window.location.hash = '#/doc/design.coreLoop'
    const first = render(<App />)
    expect((first.container.querySelector('details.system-map') as HTMLDetailsElement).open).toBe(true)
    cleanup()
    const second = render(<App />)
    const map = second.container.querySelector('details.system-map') as HTMLDetailsElement
    expect(map.open).toBe(false)
    expect(map.querySelector('summary')!.textContent).toMatch(/\d+ empty · \d+ with open tips/)
  })
})

describe('icons', () => {
  it('icon-only close buttons have an accessible name', () => {
    window.location.hash = '#/doc/design.coreLoop'
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Help' }))
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy()
  })
})
