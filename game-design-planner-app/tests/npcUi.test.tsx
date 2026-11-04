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

  it('evaluates stat formulas for each archetype in the preview', async () => {
    load()
    window.location.hash = '#/doc/design.npc?s=statRules'
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Preview' }))
    expect(await screen.findByText('21')).toBeTruthy()
    expect(screen.getByText('Smith')).toBeTruthy()
  })
})
