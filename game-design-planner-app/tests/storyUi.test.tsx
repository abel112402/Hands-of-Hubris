import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '../src/core/i18n'
import { App } from '../src/App'
import { useStore } from '../src/core/store/store'
import { createProject } from '../src/core/model/project'
import { STORY_DOC } from '../src/core/story'

afterEach(cleanup)

function load(loop = false) {
  const p = createProject('UI')
  p.documents['design.player'].data.leveling = { xpFormula: '100', levelCap: 20 }
  p.documents['design.player'].data.xpSources = []
  const d = p.documents[STORY_DOC].data
  d.structure = { hoursPerDay: 1 }
  d.acts = [{ id: 'a1', name: 'Act 1', start: 0, duration: 10, levelMin: 1, levelMax: 4 }]
  d.quests = [
    { id: 'q1', name: 'Start', type: 'Main', act: 'a1', rewardXp: 300, estMinutes: 120, ...(loop ? { requires: ['q2'] } : {}) },
    { id: 'q2', name: 'Next', type: 'Main', act: 'a1', requires: ['q1'] },
    { id: 'qa', name: 'Keep the light', type: 'Event', act: 'a1' },
    { id: 'qb', name: 'Dark tide', type: 'Event', act: 'a1' },
  ]
  d.choices = [
    { id: 'oa', name: 'Relight it', decision: 'Fate', leadsTo: ['qa'], blocks: ['qb'] },
    { id: 'ob', name: 'Let it fall', decision: 'Fate', leadsTo: ['qb'], blocks: ['qa'] },
  ]
  d.endings = [
    { id: 'e1', name: 'Beacon', requiresChoices: ['oa'] },
    { id: 'e2', name: 'Dark', requiresChoices: ['ob'] },
  ]
  useStore.getState().loadProject(p, 'x')
}

describe('story editor', () => {
  it('marks a requirement loop in Quest flow', async () => {
    load(true)
    window.location.hash = '#/doc/design.story?s=quests'
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Quest flow' }))
    expect(screen.getAllByTestId('qf-cycle')).toHaveLength(2)
  })

  it('closes the other ending when an option is picked', async () => {
    load()
    window.location.hash = '#/doc/design.story?s=endings'
    render(<App />)
    expect(await screen.findAllByTestId('ending-open')).toHaveLength(2)
    fireEvent.change(screen.getByLabelText('Fate'), { target: { value: 'oa' } })
    expect(screen.getAllByTestId('ending-open')).toHaveLength(1)
    expect(screen.getByTestId('ending-blocked').textContent).toBe('closed: needs “Let it fall”')
  })

  it('shows the level reached by the end of an act', async () => {
    load()
    window.location.hash = '#/doc/design.story?s=acts'
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Act pacing' }))
    expect(screen.getByTestId('pace-level-0').textContent).toBe('4')
  })
})
