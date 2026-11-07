import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '../src/core/i18n'
import { App } from '../src/App'
import { useStore } from '../src/core/store/store'
import { createProject } from '../src/core/model/project'

afterEach(cleanup)

function load() {
  const p = createProject('UI')
  p.documents['design.npc'].data.archetypes = [{ id: 'a1', name: 'Smith', stats: { strength: 7 } }]
  p.documents['design.npc'].data.statRules = [{ id: 'r1', name: 'Carry', stat: 'strength', formula: 'strength * 3' }]
  useStore.getState().loadProject(p, 'x')
}

describe('npc editor', () => {
  it('groups archetype fields in the inspector', async () => {
    load()
    window.location.hash = '#/doc/design.npc?s=archetypes'
    render(<App />)
    fireEvent.click(await screen.findByText('Smith'))
    for (const g of ['Identity', 'Stats & needs', 'Town']) expect(screen.getByText(g, { selector: 'summary', exact: false })).toBeTruthy()
  })

  it('opens the population view first and selects an archetype from its card or share bar', async () => {
    load()
    useStore.getState().mutate((p) => void (p.documents['design.npc'].data.archetypes[0].share = 60))
    window.location.hash = '#/doc/design.npc?s=archetypes'
    render(<App />)
    expect(await screen.findByRole('img', { name: /Population shares: Smith 60%/ })).toBeTruthy()
    expect(screen.getByText(/40% left/)).toBeTruthy()
    fireEvent.click(screen.getByTitle('Smith: 60%'))
    expect(screen.getByText('Identity', { selector: 'summary', exact: false })).toBeTruthy()
  })

  it('adds a missing need rule straight from the need chain', async () => {
    load()
    window.location.hash = '#/doc/design.npc?s=needRules'
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Food: no rule' }))
    const rules = useStore.getState().project.documents['design.npc'].data.needRules
    expect(rules.map((r: { need: string }) => r.need)).toContain('food')
    expect(await screen.findByRole('button', { name: 'Food: no supply' })).toBeTruthy()
  })

  it('draws life stages and opens one on click', async () => {
    load()
    useStore.getState().mutate((p) => void (p.documents['design.npc'].data.lifeStages = [{ id: 's1', name: 'Adult', ageFrom: 0, canWork: true }]))
    window.location.hash = '#/doc/design.npc?s=lifeStages'
    render(<App />)
    expect(await screen.findByText(/Working age covers/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Adult: 0–/ }))
    expect(await screen.findByDisplayValue('Adult')).toBeTruthy()
  })

  it('edits the daily routine from the day plan and flags missing work slots', async () => {
    load()
    useStore.getState().mutate((p) => void (p.documents['design.npc'].data.jobs = [{ id: 'j1', name: 'Smithing', profession: 'blacksmith' }]))
    window.location.hash = '#/doc/design.npc?s=jobs'
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Day plan' }))
    expect(screen.getByText(/No work slot yet: Blacksmith/)).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Blacksmith at Day'), { target: { value: 'Work' } })
    expect(useStore.getState().project.documents['design.npc'].data.routine.cells['blacksmith|day']).toBe('Work')
    expect(screen.queryByText(/No work slot yet/)).toBeNull()
  })

  it('shows yearly event odds and bonds on the ladder', async () => {
    load()
    useStore.getState().mutate((p) => {
      const d = p.documents['design.npc'].data
      d.events = [{ id: 'e1', name: 'Festival', chance: 100, period: 'year' }, { id: 'e2', name: 'Founding', period: 'once', chance: 100 }]
      d.relationLevels = [{ id: 'l1', name: 'Friend', min: 0 }]
      d.bonds = [{ id: 'b1', name: 'Pals', requiresLevel: 'l1' }]
    })
    window.location.hash = '#/doc/design.npc?s=events'
    render(<App />)
    expect(await screen.findByText('≈ 1 / year')).toBeTruthy()
    expect(screen.getByText('one-off')).toBeTruthy()
    cleanup()
    window.location.hash = '#/doc/design.npc?s=bonds'
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Pals (Friend)' }))
    expect(await screen.findByDisplayValue('Pals')).toBeTruthy()
  })

  it('evaluates stat formulas for each archetype in the preview', async () => {
    load()
    window.location.hash = '#/doc/design.npc?s=statRules'
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Preview' }))
    expect(await screen.findByText('21')).toBeTruthy()
    expect(screen.getByText('Smith')).toBeTruthy()
  })
})
