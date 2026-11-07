import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '../src/core/i18n'
import { App } from '../src/App'
import { useStore } from '../src/core/store/store'
import { createProject } from '../src/core/model/project'

afterEach(cleanup)

function load() {
  const p = createProject('UI', false)
  p.documents['design.coreLoop'] = {
    moduleVersion: 2,
    data: {
      loops: [
        { id: 's', name: 'Gather run', scale: 'Short (minutes)', cycleMinutes: 15, leadsTo: ['d'] },
        { id: 'd', name: 'Grow the town', scale: 'Medium (hours / days)', cycleMinutes: 240 },
      ],
      loopGraph: { nodes: [], edges: [] },
      rewardsProgression: {},
    },
  }
  p.documents['design.timeWeather'] = { moduleVersion: 2, data: { time: { dayLength: 30 } } }
  useStore.getState().loadProject(p, 'x')
}

describe('core loop editor', () => {
  it('shows cycle lengths, in-game days and nesting ratios in the pacing view', async () => {
    load()
    window.location.hash = '#/doc/design.coreLoop?s=loops'
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Pacing' }))
    expect(await screen.findByRole('img', { name: 'One cycle takes 15 min' })).toBeTruthy()
    expect(screen.getByText('Grow the town: ×16 cycles')).toBeTruthy()
    expect(screen.getByText(/· 8 in-game days/)).toBeTruthy()
  })

  it('opens a loop with grouped fields from the pacing view', async () => {
    load()
    window.location.hash = '#/doc/design.coreLoop?s=loops'
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Pacing' }))
    fireEvent.click(await screen.findByText('Gather run', { selector: 'td' }))
    expect(await screen.findByText('Links', { selector: 'summary', exact: false })).toBeTruthy()
    expect(screen.getByLabelText('One cycle takes (real minutes)')).toBeTruthy()
  })
})
