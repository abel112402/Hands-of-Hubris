import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '../src/core/i18n'
import { App } from '../src/App'
import { useStore } from '../src/core/store/store'
import { createProject } from '../src/core/model/project'

afterEach(cleanup)

const doc = () => useStore.getState().project.documents['design.factions'].data

function load() {
  const p = createProject('UI', false)
  p.documents['design.factions'] = {
    moduleVersion: 2,
    data: {
      overview: { startValue: 0 },
      factions: [
        { id: 'cr', name: 'Crown' },
        { id: 'gu', name: 'Guild' },
      ],
      relations: { cells: { 'cr|gu': 60, 'gu|cr': 20 } },
      relationGraph: { nodes: [], edges: [] },
      thresholds: [
        { id: 'h', name: 'Hostile', min: -100 },
        { id: 'n', name: 'Neutral', min: -30 },
        { id: 'f', name: 'Friendly', min: 30, consequences: 'Discounts at the market' },
      ],
      actions: [{ id: 'a', name: 'Escort caravan', faction: 'gu', effectOnFaction: 20, spilloverDefault: -5 }],
      endings: [],
    },
  }
  useStore.getState().loadProject(p, 'x')
}

describe('factions editor', () => {
  it('edits both directions of a pair from the relations web', async () => {
    load()
    window.location.hash = '#/doc/design.factions?s=factions'
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Crown and Guild: 60 / 20' }))
    const back = screen.getByRole('slider', { name: 'Guild regards Crown' })
    fireEvent.change(back, { target: { value: '55' } })
    expect(doc().relations.cells['gu|cr']).toBe(55)
    fireEvent.click(screen.getAllByRole('button', { name: 'Mirror' })[0])
    expect(doc().relations.cells['cr|gu']).toBe(55)
  })

  it('moves level boundaries and markers on the scale with the keyboard', async () => {
    load()
    window.location.hash = '#/doc/design.factions?s=thresholds'
    render(<App />)
    const boundary = await screen.findByRole('slider', { name: 'Boundary Neutral / Friendly' })
    fireEvent.keyDown(boundary, { key: 'ArrowRight', shiftKey: true })
    expect(doc().thresholds[2].min).toBe(40)
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Start value' }), { key: 'ArrowLeft' })
    expect(doc().overview.startValue).toBe(-1)
  })

  it('plays actions in the simulator without saving', async () => {
    load()
    window.location.hash = '#/doc/design.factions?s=actions'
    render(<App />)
    const add = await screen.findByRole('button', { name: 'Add Escort caravan' })
    fireEvent.click(add)
    fireEvent.click(add)
    expect(screen.getByRole('row', { name: 'Guild: 40 · Friendly' })).toBeTruthy()
    expect(screen.getByRole('row', { name: 'Crown: -10 · Neutral' })).toBeTruthy()
    expect(screen.getByText('step 2: Neutral → Friendly')).toBeTruthy()
    expect(screen.getByText('Discounts at the market')).toBeTruthy()
    expect(doc().actions).toHaveLength(1)
  })

  it('shows where each faction appears', async () => {
    load()
    window.location.hash = '#/doc/design.factions?s=factions'
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Footprint' }))
    expect(await screen.findByRole('img', { name: 'Guild: 1 link' })).toBeTruthy()
    expect(screen.getAllByText('none yet')).toHaveLength(2)
  })
})
