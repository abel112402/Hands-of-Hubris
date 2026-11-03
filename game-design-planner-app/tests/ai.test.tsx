import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach as after, expect as ex, it as test } from 'vitest'
import '../src/core/i18n'
import { AiSettings } from '../src/ui/ai/AiSettings'

after(cleanup)
test('AI settings page renders without render loops', () => {
  render(<MemoryRouter><AiSettings /></MemoryRouter>)
  ex(screen.getAllByRole('heading').length).toBeGreaterThan(0)
})
