import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '../src/core/i18n'
import { App } from '../src/App'
import { useStore } from '../src/core/store/store'
import { createProject } from '../src/core/model/project'
import { TRADE_DOC } from '../src/core/trade'

afterEach(cleanup)

function load() {
  const p = createProject('UI')
  p.documents['design.items'].data.items = [{ id: 'sword', name: 'Iron sword', value: 100, rarity: 'rare', type: 'weapon' }]
  p.documents['design.factions'].data.thresholds = [
    { id: 'hostile', name: 'Hostile', min: -100, max: 0 },
    { id: 'allied', name: 'Allied', min: 0, max: 100 },
  ]
  const d = p.documents[TRADE_DOC].data
  d.margins = { buyMultiplier: 1, sellMultiplier: 0.5, byReputation: { hostile: 1.5, allied: 0.8 } }
  d.merchants = [{ id: 'peddler', name: 'Peddler', type: 'Wandering', goods: ['sword'], chance: 50, interval: 10 }]
  d.flows = [
    { id: 'in', name: 'Loot', direction: 'Source', kind: 'Selling loot', amount: 10, per: 'Day' },
    { id: 'out', name: 'Repairs', direction: 'Sink', kind: 'Repair', amount: 25, per: 'Day' },
  ]
  useStore.getState().loadProject(p, 'x')
}

describe('trade editor', () => {
  it('shows only the wandering group for a wandering merchant', async () => {
    load()
    window.location.hash = '#/doc/design.trade?s=merchants'
    render(<App />)
    fireEvent.click((await screen.findAllByText('Peddler'))[0])
    expect(screen.getByTestId('group-Wandering').hasAttribute('open')).toBe(true)
    expect(screen.getByTestId('group-Capital').hasAttribute('open')).toBe(false)
    expect(screen.getByTestId('group-Capital').textContent).toContain('not used by this type')
  })

  it('updates the price ladder when the relationship changes', async () => {
    load()
    window.location.hash = '#/doc/design.trade?s=priceRules'
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Price ladder' }))
    expect(screen.getByTestId('price-buy').textContent).toBe('100')
    fireEvent.change(screen.getByLabelText('Relationship'), { target: { value: 'hostile' } })
    expect(screen.getByTestId('price-buy').textContent).toBe('150')
    expect(screen.getByTestId('price-sell').textContent).toBe('33.33')
  })

  it('shows wandering odds and a negative net when sinks are larger', async () => {
    load()
    window.location.hash = '#/doc/design.trade?s=merchants'
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Wandering calendar' }))
    expect(screen.getByTestId('visits-60').textContent).toBe('3')
    expect(screen.getByTestId('odds-30').textContent).toBe('87.5%')
    cleanup()
    window.location.hash = '#/doc/design.trade?s=flows'
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Money flow' }))
    expect(screen.getByTestId('flow-net-last').textContent).toBe('-15')
  })
})
