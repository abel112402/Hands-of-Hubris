import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import '../src/core/i18n'
import { App } from '../src/App'
import { createProject } from '../src/core/model/project'
import { useStore } from '../src/core/store/store'
import { TOWN_DOC } from '../src/core/town'

afterEach(cleanup)

function load() {
  const project = createProject('Town UI')
  const data = project.documents[TOWN_DOC].data
  data.buildings = [
    { id: 'lumber', name: 'Lumber camp', count: 1, cycle: 2, outputs: { wood: 6 } },
    { id: 'sawmill', name: 'Sawmill', count: 1, cycle: 2, inputs: { wood: 4 }, outputs: { stone: 2 } },
  ]
  data.bases = [{ id: 'hub', name: 'Hub' }, { id: 'outpost', name: 'Outpost' }]
  data.routes = [{ id: 'supply', name: 'Supply run', fromBase: 'hub', toBase: 'outpost', cargo: ['wood'], quantity: { wood: 5 }, capacity: 2, frequency: 1 }]
  useStore.getState().loadProject(project, 'x')
}

describe('Town editor visuals', () => {
  it('shows resource rates and opens a building from the flow lanes', async () => {
    load()
    window.location.hash = '#/doc/design.town?s=buildings'
    render(<App />)
    const flowTab = (await screen.findAllByRole('button', { name: 'Resource flow' })).find((button) => button.closest('.tabs'))
    fireEvent.click(flowTab!)

    expect(screen.getByTestId('town-resource-wood').textContent).toContain('net +1')
    fireEvent.click(within(screen.getByTestId('town-resource-wood')).getByRole('button', { name: /Sawmill/ }))
    expect(screen.getByLabelText('Planned count')).toBeTruthy()
  })

  it('draws the logistics network and opens an overloaded route', async () => {
    load()
    window.location.hash = '#/doc/design.town?s=routes'
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Logistics network' }))

    expect(screen.getByRole('img', { name: 'Town bases and logistics routes' })).toBeTruthy()
    const route = screen.getByRole('button', { name: /Supply run.*Hub.*Outpost.*5 requested/s })
    expect(route.className).toContain('overloaded')
    fireEvent.click(route)
    expect(screen.getByLabelText('Capacity per trip')).toBeTruthy()
  })
})
