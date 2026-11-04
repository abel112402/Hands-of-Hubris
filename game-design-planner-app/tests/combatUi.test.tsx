import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '../src/core/i18n'
import { App } from '../src/App'
import { useStore } from '../src/core/store/store'
import { createProject } from '../src/core/model/project'
import { COMBAT_DOC } from '../src/core/combat'

afterEach(cleanup)

function load() {
  const p = createProject('UI')
  p.documents['design.items'].data.items = [{ id: 'sword', name: 'Sword', type: 'weapon', damage: 20, attackSpeed: 1, damageType: 'physical' }]
  const hp = p.documents['design.difficulty'].data.params.find((x: any) => /enemy hp/i.test(x.name))
  p.documents['design.difficulty'].data.values = { cells: { [`${hp.id}|hard`]: 2 * (hp.baseline ?? 1) } }
  const d = p.documents[COMBAT_DOC].data
  d.damageModel = { hpParam: hp.id }
  d.enemies = [
    { id: 'e1', name: 'Crab', hp: 100, armor: 100, damage: 10, attackRate: 1 },
    { id: 'e2', name: 'Golem', hp: 300, damage: 5, attackRate: 1, resistances: { physical: 100 } },
  ]
  d.loadouts = [{ id: 'l1', name: 'Soldier', level: 1, weapon: 'sword', hp: 100 }]
  d.bosses = [{ id: 'b1', name: 'Hydra', hp: 1000 }]
  d.phases = [
    { id: 'p1', boss: 'b1', name: 'Heads', hpFrom: 100, hpTo: 60, mechanics: 'bites' },
    { id: 'p2', boss: 'b1', name: 'Rage', hpFrom: 50, hpTo: 0, mechanics: 'fire' },
  ]
  useStore.getState().loadProject(p, 'x')
}

describe('combat editor', () => {
  it('shows kill and death times and rescales them by difficulty', async () => {
    load()
    window.location.hash = '#/doc/design.combat?s=loadouts'
    render(<App />)
    const cell = await screen.findByTestId('sb-l1-e1')
    expect(cell.textContent).toBe('10 / 10')
    fireEvent.change(screen.getByLabelText('Difficulty'), { target: { value: 'hard' } })
    expect(screen.getByTestId('sb-l1-e1').textContent).toBe('20 / 10')
    fireEvent.click(screen.getByTestId('sb-l1-e1'))
    expect(await screen.findByText(/Best attack: Sword, 10 per hit/)).toBeTruthy()
  })

  it('marks a gap in boss phases', async () => {
    load()
    window.location.hash = '#/doc/design.combat?s=phases'
    render(<App />)
    expect(await screen.findAllByTestId('phase-gap')).toHaveLength(1)
  })

  it('flags an enemy the player cannot hurt in the weakness matrix', async () => {
    load()
    window.location.hash = '#/doc/design.combat?s=enemies'
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Weaknesses' }))
    expect(await screen.findByText('immune to the player', { exact: false })).toBeTruthy()
  })
})
