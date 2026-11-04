import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import '../src/core/i18n'
import { App } from '../src/App'
import { useStore } from '../src/core/store/store'
import { createProject } from '../src/core/model/project'
import { useAiUi } from '../src/ui/ai/aiStore'
import { useGuideUi } from '../src/ui/guides/guideStore'

afterEach(() => {
  cleanup()
  useAiUi.getState().setTab('hints')
  useGuideUi.setState({ spotlight: null, picker: null })
})

const PLAYER = 'design.player'
const skills = () => useStore.getState().project.documents[PLAYER].data.skills as any[]

describe('player guides', () => {
  it('ticks a guide step after its quick action and shows the coach mark', async () => {
    useStore.getState().loadProject(createProject('UI'), 'x')
    window.location.hash = '#/doc/design.player?s=hero'
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: /Guide/ }))
    const survival = await screen.findByTestId('guide-step-survival')
    expect(within(survival).getByLabelText('not done')).toBeTruthy()
    // Step 1 is current; open step 2 directly, which spotlights its control.
    fireEvent.click(within(survival).getByRole('button', { name: 'Add the survival stats' }))
    expect(await screen.findByRole('dialog', { name: 'Add the survival stats' })).toBeTruthy()
    useStore.getState().mutate((p) => void (p.documents[PLAYER].data.hero = { fantasy: 'Stranded soldier' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Create one per stat' }))
    expect(within(await screen.findByTestId('guide-step-survival')).getByLabelText('done')).toBeTruthy()
  })

  it('previews an example before inserting it', async () => {
    useStore.getState().loadProject(createProject('UI'), 'x')
    window.location.hash = '#/doc/design.player?s=skills'
    render(<App />)
    fireEvent.click((await screen.findAllByRole('button', { name: /Insert example/ }))[0])
    const dialog = await screen.findByRole('dialog', { name: 'Insert example' })
    expect(within(dialog).getByText(/Tree cost 18/)).toBeTruthy()
    expect(skills()).toHaveLength(0)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Insert' }))
    expect(skills()).toHaveLength(9)
  })

  it('locks skills in the build planner until their prerequisites are learned', async () => {
    const p = createProject('UI')
    p.documents[PLAYER].data.leveling = { levelCap: 10, skillPointsPerLevel: 1, startSkillPoints: 1 }
    p.documents[PLAYER].data.skills = [
      { id: 'a', name: 'Slash', cast: 'warrior', tier: 1, cost: 1 },
      { id: 'b', name: 'Cleave', cast: 'warrior', tier: 2, cost: 1, requires: ['a'] },
    ]
    useStore.getState().loadProject(p, 'x')
    window.location.hash = '#/doc/design.player?s=skills'
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Build planner' }))
    const cleave = await screen.findByRole('button', { name: 'Cleave' })
    expect(cleave.getAttribute('class')).toContain('locked')
    fireEvent.click(screen.getByRole('button', { name: 'Slash' }))
    expect(screen.getByRole('button', { name: 'Cleave' }).getAttribute('class')).toContain('available')
    expect(screen.getByText(/1 \/ 5 points/)).toBeTruthy()
  })
})
