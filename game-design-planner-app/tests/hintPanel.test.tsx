import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '../src/core/i18n'
import { HintPanel } from '../src/ui/hints/HintPanel'
import { MemoryRouter } from 'react-router-dom'

const WIDTH_KEY = 'hohplan:hintWidth'

beforeEach(() => {
  localStorage.removeItem(WIDTH_KEY)
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200 })
})
afterEach(cleanup)

const renderPanel = () =>
  render(
    <MemoryRouter>
      <HintPanel docId="design.coreLoop" />
    </MemoryRouter>,
  )

describe('hint panel accessibility', () => {
  it('resize handle is focusable and resizes with the keyboard', () => {
    renderPanel()
    const handle = screen.getByRole('separator', { name: 'Resize hints panel' })
    expect(handle.tabIndex).toBe(0)
    expect(handle.getAttribute('aria-valuenow')).toBe('280')

    fireEvent.keyDown(handle, { key: 'ArrowLeft' })
    expect(handle.getAttribute('aria-valuenow')).toBe('296')
    expect(localStorage.getItem(WIDTH_KEY)).toBe('296')

    fireEvent.keyDown(handle, { key: 'ArrowRight' })
    fireEvent.keyDown(handle, { key: 'ArrowRight' })
    expect(handle.getAttribute('aria-valuenow')).toBe('264')

    fireEvent.keyDown(handle, { key: 'End' })
    expect(handle.getAttribute('aria-valuenow')).toBe('600')
    fireEvent.keyDown(handle, { key: 'ArrowLeft' })
    expect(handle.getAttribute('aria-valuenow')).toBe('600')

    fireEvent.keyDown(handle, { key: 'Home' })
    expect(handle.getAttribute('aria-valuenow')).toBe('220')
    fireEvent.keyDown(handle, { key: 'ArrowRight' })
    expect(handle.getAttribute('aria-valuenow')).toBe('220')
  })

  it('announces only the hint count, not the whole panel', () => {
    const { container } = renderPanel()
    const aside = container.querySelector('aside.hint-panel')!
    expect(aside.getAttribute('aria-live')).toBeNull()
    expect(screen.getByRole('status').textContent).toMatch(/^\d+ hints? on this page$/)
  })

  it('puts hints about other planners in a collapsed group', () => {
    localStorage.removeItem('hohplan:hintsElsewhereOpen')
    const { container } = renderPanel()
    const group = container.querySelector('details.hint-elsewhere') as HTMLDetailsElement
    expect(group).toBeTruthy()
    expect(group.open).toBe(false)
    expect(group.querySelector('summary')!.textContent).toMatch(/^Other planners \(\d+\)$/)
    // On an empty project the Core Loop onboarding step is about this page, so it is listed first.
    const firstHere = container.querySelector('.hint-panel > ul.list > li')
    expect(firstHere?.textContent).toContain('Core Loop')
  })

  it('header toggle has a label and reports its state', () => {
    renderPanel()
    const toggle = screen.getByRole('button', { name: 'Hide' })
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(toggle)
    expect(screen.getByRole('button', { name: 'Show hints' }).getAttribute('aria-expanded')).toBe('false')
  })

  it('secondary actions sit in a labelled menu', async () => {
    renderPanel()
    expect((await screen.findAllByLabelText('More actions for this hint')).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('button', { name: 'Never show this kind of hint', hidden: true }).length).toBeGreaterThan(0)
  })
})
