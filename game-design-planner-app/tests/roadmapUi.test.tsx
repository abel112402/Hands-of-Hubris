import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '../src/core/i18n'
import { App } from '../src/App'
import { useStore } from '../src/core/store/store'
import { createProject } from '../src/core/model/project'

afterEach(cleanup)

function load() {
  const p = createProject('UI', false)
  p.documents['overview.roadmap'] = {
    moduleVersion: 2,
    data: {
      assumptions: {},
      phases: [{ id: 'a', name: 'Prep', start: 0, duration: 4, capacity: 2 }],
      tasks: [{ id: 't1', name: 'Schema', phase: 'a', effort: 3, status: 'Done' }, { id: 't2', name: 'CI', phase: 'a', effort: 1 }],
      cuts: [{ id: 'c1', name: 'Fewer factions', order: 1, affectsTasks: ['t2'] }],
    },
  }
  useStore.getState().loadProject(p, 'x')
}

describe('roadmap editor', () => {
  it('shows phase progress and opens the phase on click', async () => {
    load()
    window.location.hash = '#/doc/overview.roadmap?s=phases'
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Progress' }))
    expect(await screen.findByRole('img', { name: '1 of 2 tasks done' })).toBeTruthy()
    expect(screen.getByText('3 / 4 / 2 · over capacity')).toBeTruthy()
    fireEvent.click(screen.getByText('Prep', { selector: 'td' }))
    expect(await screen.findByText('Risks & capacity', { selector: 'summary', exact: false })).toBeTruthy()
  })

  it('shows cut savings against the overload', async () => {
    load()
    window.location.hash = '#/doc/overview.roadmap?s=cuts'
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Savings' }))
    // Effort 4 against capacity 2: overload 2; the cut saves the open task's 1.
    expect(await screen.findByText(/exceed phase capacity by 2 person-weeks; all cuts together save 1/)).toBeTruthy()
  })
})
