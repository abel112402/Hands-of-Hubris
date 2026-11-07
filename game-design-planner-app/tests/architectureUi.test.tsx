import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '../src/core/i18n'
import { App } from '../src/App'
import { useStore } from '../src/core/store/store'
import { createProject } from '../src/core/model/project'
import { ARCH_DOC } from '../src/core/architecture'

afterEach(cleanup)

const doc = () => useStore.getState().project.documents[ARCH_DOC].data

function load() {
  const p = createProject('UI', false)
  p.documents[ARCH_DOC] = {
    moduleVersion: 2,
    data: {
      layers: [
        { id: 'core', name: 'Core', order: 0 },
        { id: 'ui', name: 'UI', order: 1 },
      ],
      modules: [
        { id: 'ev', name: 'Events', layer: 'core', dependsOn: [] },
        { id: 'hud', name: 'Hud', layer: 'ui', dependsOn: ['ev'] },
      ],
      channels: [{ id: 'c1', name: 'NeedChanged', kind: 'Event bus', publishers: ['ev'] }],
      systems: [{ id: 's1', name: 'Needs', costMs: 2, every: 1 }],
      scenes: [{ id: 'b', name: 'Boot', kind: 'Bootstrap', loadOrder: 0, loads: ['ev'], loadSeconds: 1 }],
    },
  }
  useStore.getState().loadProject(p, 'x')
}

describe('architecture editor', () => {
  it('draws the layer diagram and opens a module on click', async () => {
    load()
    window.location.hash = `#/doc/${ARCH_DOC}?s=modules`
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Hud' }))
    expect(await screen.findByDisplayValue('Hud')).toBeTruthy()
  })

  it('toggles a dependency in the matrix and flags it as upward', async () => {
    load()
    window.location.hash = `#/doc/${ARCH_DOC}?s=modules`
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Dependency matrix' }))
    fireEvent.click(screen.getByRole('button', { name: 'Events depends on Hud' }))
    expect(doc().modules[0].dependsOn).toEqual(['hud'])
    expect(screen.getByRole('button', { name: 'Events depends on Hud' }).closest('td')?.className).toContain('up')
    fireEvent.click(screen.getByRole('button', { name: 'Layer diagram' }))
    expect(screen.getByText(/Upward: Events → Hud/)).toBeTruthy()
  })

  it('shows incomplete channels in the message flow', async () => {
    load()
    window.location.hash = `#/doc/${ARCH_DOC}?s=channels`
    render(<App />)
    expect(await screen.findByRole('button', { name: 'NeedChanged (incomplete)' })).toBeTruthy()
    expect(screen.getByText(/NeedChanged \(no subscriber\)/)).toBeTruthy()
  })

  it('compares tick cost with the budget and saves a what-if rate', async () => {
    load()
    window.location.hash = `#/doc/${ARCH_DOC}?s=systems`
    render(<App />)
    // 2 ms × 10 ticks/s ÷ 60 fps = 0.33 ms of a 4.17 ms budget.
    expect(await screen.findByText('0.33 / 4.17 ms')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('What-if ticks per second'), { target: { value: '30' } })
    expect(screen.getByText('1 / 4.17 ms')).toBeTruthy()
    expect(doc().simulation?.tickRate).toBeUndefined()
    fireEvent.click(screen.getByRole('button', { name: 'Save to settings' }))
    expect(doc().simulation.tickRate).toBe(30)
  })

  it('lists boot steps with their modules', async () => {
    load()
    window.location.hash = `#/doc/${ARCH_DOC}?s=scenes`
    render(<App />)
    expect(await screen.findByText('Step 1')).toBeTruthy()
    expect(screen.getByText(/Modules no scene initialises: Hud/)).toBeTruthy()
  })
})
