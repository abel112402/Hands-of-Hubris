import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '../src/core/i18n'
import { App } from '../src/App'
import { useStore } from '../src/core/store/store'
import { createProject } from '../src/core/model/project'
import { TIME_DOC } from '../src/core/timeWeather'

afterEach(cleanup)

function load() {
  const p = createProject('UI')
  const d = p.documents[TIME_DOC].data
  d.time = { dayLength: 48, daysPerYear: 360, moonCycle: 28 }
  d.dayPhases = [
    { id: 'day', name: 'Day', start: 6, duration: 15, timeOfDay: 'day', visibility: 100, monsterStrength: 1 },
    { id: 'night', name: 'Night', start: 21, duration: 8, timeOfDay: 'night', visibility: 30, monsterStrength: 1.3 },
  ]
  d.weather = [{ id: 'storm', name: 'Storm', frequency: 10, visibility: 25, monsterStrength: 1.2 }]
  d.events = [
    { id: 'blood', name: 'Blood moon', schedule: 'Moon cycle', interval: 3, duration: 1, monsterStrength: 1.5 },
    { id: 'holiday', name: 'Holiday', schedule: 'Every N days', interval: 360, offset: 168, duration: 2 },
  ]
  useStore.getState().loadProject(p, 'x')
}

describe('time & weather editor', () => {
  it('marks a gap on the day clock', async () => {
    load()
    window.location.hash = '#/doc/design.timeWeather?s=dayPhases'
    render(<App />)
    expect(await screen.findAllByTestId('clock-gap')).toHaveLength(1)
    // Shown under the clock and in the hint panel.
    expect(screen.getAllByText(/no phase 05:00–06:00/).length).toBeGreaterThan(0)
  })

  it('combines conditions as the selections change', async () => {
    load()
    window.location.hash = '#/doc/design.timeWeather?s=events'
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Conditions simulator' }))
    fireEvent.change(screen.getByLabelText('Time of day'), { target: { value: 'night' } })
    fireEvent.change(screen.getByLabelText('Event'), { target: { value: 'blood' } })
    expect(screen.getByTestId('cond-monsterStrength').textContent).toBe('×1.95')
    fireEvent.change(screen.getByLabelText('Weather'), { target: { value: 'storm' } })
    expect(screen.getByTestId('cond-monsterStrength').textContent).toBe('×2.34')
    expect(screen.getByTestId('cond-visibility').textContent).toBe('25%')
  })

  it('outlines coinciding events on the year strip', async () => {
    load()
    window.location.hash = '#/doc/design.timeWeather?s=events'
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Year strip' }))
    expect(await screen.findAllByTestId('coincide')).toHaveLength(2)
  })
})
