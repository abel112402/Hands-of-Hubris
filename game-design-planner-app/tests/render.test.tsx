import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import '../src/core/i18n'
import { App } from '../src/App'
import { MODULES } from '../src/core/modules/registry'

describe('app', () => {
  it('renders the home menu with every planner', () => {
    render(<App />)
    expect(screen.getByText('What do you want to plan?')).toBeTruthy()
    for (const m of MODULES) expect(screen.getAllByText(m.title).length).toBeGreaterThan(0)
  })
})

describe('home next steps', () => {
  it('shows one next step and reveals the rest on request', async () => {
    const { fireEvent, within } = await import('@testing-library/react')
    const { container } = render(<App />)
    const section = container.querySelector('section.next-steps') as HTMLElement
    expect(section.querySelectorAll('[data-testid="hint"]')).toHaveLength(1)
    const more = within(section).getByRole('button', { name: /^Show \d+ more$/ })
    fireEvent.click(more)
    expect(section.querySelectorAll('[data-testid="hint"]').length).toBeGreaterThan(1)
    // The planner filter comes before the next steps.
    const filter = container.querySelector('input.search')!
    expect(filter.compareDocumentPosition(section) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})
