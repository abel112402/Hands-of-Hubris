import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '../src/core/i18n'
import { App } from '../src/App'
import { useStore } from '../src/core/store/store'
import { createProject } from '../src/core/model/project'

afterEach(cleanup)

const cells = () => useStore.getState().project.documents['design.difficulty'].data.values.cells

function load() {
  const p = createProject('UI', false)
  p.documents['design.difficulty'] = {
    moduleVersion: 2,
    data: {
      presets: [{ id: 'pe', name: 'Easy', level: 'easy' }, { id: 'pm', name: 'Medium', level: 'medium' }, { id: 'ph', name: 'Hard', level: 'hard' }],
      params: [
        { id: 'hp', name: 'Enemy HP', category: 'Combat', unit: '×', direction: 'Higher = harder', baseline: 1, min: 0, max: 2 },
        { id: 'mo', name: 'Morale', category: 'NPC', unit: '%', direction: 'Higher = easier', baseline: 50, min: 0, max: 100 },
      ],
      values: { cells: { 'hp|easy': 0.5, 'hp|medium': 1, 'hp|hard': 1.5, 'mo|easy': 80, 'mo|medium': 50 } },
      custom: [{ id: 's', name: 'Enemy strength', params: ['hp'], min: 0.5, max: 2 }],
    },
  }
  useStore.getState().loadProject(p, 'x')
}

describe('difficulty editor', () => {
  it('tunes values with the keyboard on the tuning board, right is always harder', async () => {
    load()
    window.location.hash = '#/doc/design.difficulty?s=params'
    render(<App />)
    const hard = await screen.findByRole('slider', { name: 'Enemy HP, Hard' })
    fireEvent.keyDown(hard, { key: 'ArrowRight' })
    expect(cells()['hp|hard']).toBe(1.55)
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Enemy HP, Hard' }), { key: 'End' })
    expect(cells()['hp|hard']).toBe(2)
    // "Higher = easier": moving right (harder) lowers the value.
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Morale, Medium' }), { key: 'ArrowRight' })
    expect(cells()['mo|medium']).toBe(49)
    // A missing level can be placed with one click, at the baseline.
    fireEvent.click(screen.getByRole('button', { name: '+ Hard' }))
    expect(cells()['mo|hard']).toBe(50)
  })

  it('shows pressure per level and opens the matching preset', async () => {
    load()
    window.location.hash = '#/doc/design.difficulty?s=presets'
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Pressure' }))
    // Easy: HP 0.25, morale 0.2 → 22.5, shown as 22 (0.225 × 100 is 22.4999… in floating point); Medium: 50.
    expect(await screen.findByRole('img', { name: 'Easy: pressure 22 of 100' })).toBeTruthy()
    expect(screen.getByRole('img', { name: 'Medium: pressure 50 of 100' })).toBeTruthy()
    fireEvent.click(screen.getByRole('img', { name: 'Medium: pressure 50 of 100' }))
    expect(((await screen.findByRole('textbox', { name: /Name/ })) as HTMLInputElement).value).toBe('Medium')
  })

  it('places a custom mix between the presets in the simulator', async () => {
    load()
    window.location.hash = '#/doc/design.difficulty?s=custom'
    render(<App />)
    const slider = await screen.findByRole('slider', { name: 'Enemy strength multiplier' })
    fireEvent.change(slider, { target: { value: '1.5' } })
    // Medium with HP ×1.5: HP pressure 0.75, morale 0.5 → 63, between Medium (50) and Hard.
    expect(await screen.findByRole('img', { name: 'Custom: pressure 63 of 100' })).toBeTruthy()
    expect(screen.getByText(/between Medium and Hard/)).toBeTruthy()
    // Nothing is saved.
    expect(cells()['hp|medium']).toBe(1)
  })
})
