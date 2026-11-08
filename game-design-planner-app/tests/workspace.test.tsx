import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import '../src/core/i18n'
import { App } from '../src/App'
import { createProject, makeId } from '../src/core/model/project'
import { useStore } from '../src/core/store/store'
import { BASE_PACK } from '../src/modules/walkthroughs'
import { nextMilestone, docProgress } from '../src/core/progress'
import { useAiSession, useAiSettings } from '../src/core/ai/session'

afterEach(cleanup)
beforeEach(() => {
  useStore.getState().loadProject(createProject('Test', false))
  for (const k of Object.keys(localStorage)) if (k.startsWith('hohplan:rail') || k === 'hohplan:walkView') localStorage.removeItem(k)
})

const open = (hash: string) => {
  cleanup()
  location.hash = hash
  render(<App />)
}
const stepById = (id: string) => BASE_PACK.steps.find((s) => s.id === id)!
const hero = () => screen.getByRole('region', { name: BASE_PACK.steps[0].title as string })
const progress = () => screen.getByRole('complementary', { name: 'Planning progress' })

describe('workspace home', () => {
  it('has the three panes: planners, the current step and planning progress', () => {
    open('#/')
    expect(screen.getByRole('navigation', { name: 'Planners' })).toBeTruthy()
    expect(within(hero()).getByRole('link', { name: 'Open planner' }).getAttribute('href')).toBe('#/doc/overview.vision?s=pitch')
    expect(within(progress()).getByRole('img', { name: 'Walkthrough 0% complete' })).toBeTruthy()
    const phases = within(progress()).getByRole('list', { name: 'Phases' })
    expect(within(phases).getAllByRole('listitem').map((li) => li.querySelector('.walk-phase-name')!.textContent)).toEqual(['Concept', 'Core systems', 'Content', 'Production', 'Polish & ship'])
  })

  it('marks the current step done in one undo step and moves on', () => {
    open('#/')
    const before = useStore.getState().past.length
    fireEvent.click(within(hero()).getByRole('button', { name: 'Mark done' }))
    expect(useStore.getState().project.meta.guide?.manual).toEqual(['concept.pitch'])
    expect(useStore.getState().past.length).toBe(before + 1)
    const second = BASE_PACK.steps[1]
    expect(screen.getByRole('region', { name: second.title as string })).toBeTruthy()
    const percent = Math.round((1 / BASE_PACK.steps.length) * 100)
    expect(within(progress()).getByRole('img', { name: `Walkthrough ${percent}% complete` })).toBeTruthy()
    fireEvent.click(within(screen.getByRole('region', { name: second.title as string })).getByRole('button', { name: 'Skip' }))
    expect(useStore.getState().project.meta.guide?.skipped).toEqual([second.id])
    useStore.getState().undo()
    useStore.getState().undo()
    expect(useStore.getState().project.meta.guide?.manual ?? []).toEqual([])
  })

  it('opens the AI tab with the step question filled in', () => {
    const provider = useAiSettings.getState().settings.provider
    useAiSession.getState().setKey(provider, 'sk-test-0123456789abcdef0123456789')
    open('#/')
    fireEvent.click(within(hero()).getByRole('button', { name: /Ask AI/ }))
    expect(screen.getByRole('tab', { name: 'AI' }).getAttribute('aria-selected')).toBe('true')
    const box = screen.getByRole('tabpanel').querySelector('textarea') as HTMLTextAreaElement
    expect(box.value).toBe(BASE_PACK.steps[0].aiPrompt)
    useAiSession.getState().clearAll()
  })

  it('switches between the guided walkthrough and a flat checklist, and remembers it', () => {
    open('#/')
    const step = screen.getByTestId('walk-step-concept.pillars')
    fireEvent.click(within(step).getByRole('button', { name: /design pillars/ }))
    expect(within(step).getByText(stepById('concept.pillars').body as string)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Checklist' }))
    const flat = screen.getByTestId('walk-step-concept.pillars')
    expect(within(flat).getByRole('link').getAttribute('href')).toBe('#/doc/overview.vision?s=pillars')
    expect(within(flat).queryByText(stepById('concept.pillars').body as string)).toBeNull()
    open('#/')
    expect(screen.getByRole('button', { name: 'Checklist' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('filters the planner rail and remembers collapsed groups', () => {
    open('#/')
    const rail = screen.getByRole('navigation', { name: 'Planners' })
    fireEvent.change(within(rail).getByRole('searchbox'), { target: { value: 'bug' } })
    expect(within(rail).getAllByRole('link').map((a) => a.textContent)).toEqual([expect.stringContaining('Bug Reports')])
    fireEvent.change(within(rail).getByRole('searchbox'), { target: { value: '' } })
    fireEvent.click(within(rail).getByRole('button', { name: 'QA' }))
    expect(within(rail).queryByText('Bug Reports')).toBeNull()
    open('#/')
    expect(within(screen.getByRole('navigation', { name: 'Planners' })).queryByText('Bug Reports')).toBeNull()
  })

  it('shows the next open milestone', () => {
    useStore.getState().mutate((p) => {
      p.documents['production.milestones'] = {
        moduleVersion: 1,
        data: { milestones: [{ id: makeId(), name: 'Alpha', status: 'Done', start: 0 }, { id: makeId(), name: 'Beta', status: 'In progress', start: 4, due: '2027-01' }] },
      }
    })
    expect(nextMilestone(useStore.getState().project)?.name).toBe('Beta')
    open('#/')
    expect(within(progress()).getByRole('link', { name: /Beta/ }).getAttribute('href')).toBe('#/doc/production.milestones')
  })
})

describe('planner pages', () => {
  it('have a collapsible planner rail that is remembered', () => {
    open('#/doc/design.coreLoop')
    expect(screen.queryByRole('navigation', { name: 'Planners' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Show planners' }))
    expect(screen.getByRole('navigation', { name: 'Planners' })).toBeTruthy()
    open('#/doc/design.coreLoop')
    expect(screen.getByRole('navigation', { name: 'Planners' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Hide planners' }))
    expect(screen.queryByRole('navigation', { name: 'Planners' })).toBeNull()
  })
})

describe('progress helpers', () => {
  it('counts filled sections of a planner', () => {
    const p = createProject('T', false)
    expect(docProgress(p, 'overview.vision')).toBe(0)
    expect(docProgress(p, 'ghost')).toBe(0)
  })
})

describe('walkthrough across the app', () => {
  it('shows the current step’s own hints under the step card', () => {
    open('#/')
    const tips = within(hero()).getByRole('region', { name: 'Tips for this step' })
    expect(tips.querySelectorAll('[data-testid="hint"]').length).toBeGreaterThan(0)
  })

  it('sends the step to the AI as a removable chip', () => {
    const provider = useAiSettings.getState().settings.provider
    useAiSession.getState().setKey(provider, 'sk-test-0123456789abcdef0123456789')
    open('#/')
    fireEvent.click(within(hero()).getByRole('button', { name: /Ask AI/ }))
    const panel = screen.getByRole('tabpanel')
    expect(within(panel).getByText('About step: Write the pitch')).toBeTruthy()
    fireEvent.click(within(panel).getByRole('button', { name: 'Do not send this step' }))
    expect(within(panel).queryByText(/About step:/)).toBeNull()
    useAiSession.getState().clearAll()
  })

  it('follows the user into the planner and points on to the next step', () => {
    open('#/doc/overview.vision?s=pitch')
    const chip = () => screen.getByText(/Walkthrough step/).closest('.walk-chip') as HTMLElement
    expect(within(chip()).getByText('Write the pitch')).toBeTruthy()
    expect(within(chip()).getByRole('link', { name: 'Back to walkthrough' }).getAttribute('href')).toBe('#/')
    fireEvent.click(within(chip()).getByRole('button', { name: 'Mark done' }))
    expect(useStore.getState().project.meta.guide?.manual).toEqual(['concept.pitch'])
    const next = within(chip()).getByRole('link', { name: `Next: ${BASE_PACK.steps[1].title}` })
    expect(next.getAttribute('href')).toBe('#/doc/overview.vision?s=audience')
  })

  it('shows no chip on planner pages the walkthrough does not use', () => {
    open('#/doc/qa.bugs')
    expect(screen.queryByText(/Walkthrough step/)).toBeNull()
  })
})
