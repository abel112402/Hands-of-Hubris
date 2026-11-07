import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '../src/core/i18n'
import { App } from '../src/App'
import { useStore } from '../src/core/store/store'
import { createProject } from '../src/core/model/project'

afterEach(cleanup)

function load() {
  const p = createProject('UI', false)
  p.documents['overview.vision'] = {
    moduleVersion: 2,
    data: {
      pitch: { pitch: 'A cozy management game where you rebuild a town in order to restore its magic.' },
      pillars: [{ id: 'p1', name: 'Cozy' }, { id: 'p2', name: 'Industry' }],
      usps: [],
      scope: [{ id: 's1', name: 'Farming', bucket: 'In MVP', pillars: ['p1'] }, { id: 's2', name: 'Factories', bucket: 'Later' }],
    },
  }
  useStore.getState().loadProject(p, 'x')
}

describe('vision editor', () => {
  it('links a scope item to a pillar from the pillar matrix', async () => {
    load()
    window.location.hash = '#/doc/overview.vision?s=scope'
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Pillar matrix' }))
    const cell = await screen.findByRole('button', { name: 'Factories serves Industry' })
    expect(cell.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(cell)
    expect(useStore.getState().project.documents['overview.vision'].data.scope[1].pillars).toEqual(['p2'])
    fireEvent.click(screen.getByRole('button', { name: 'Factories serves Industry' }))
    expect(useStore.getState().project.documents['overview.vision'].data.scope[1].pillars).toBeUndefined()
  })

  it('shows chapter readiness and the pitch check on the pillars section', async () => {
    load()
    window.location.hash = '#/doc/overview.vision?s=pillars'
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Readiness' }))
    expect(await screen.findByText(/chapters have content/)).toBeTruthy()
    expect(screen.getByText(/Reads as one sentence/)).toBeTruthy()
  })
})
