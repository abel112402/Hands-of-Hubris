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
