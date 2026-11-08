import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import '../src/core/i18n'
import { App } from '../src/App'
import { MODULES } from '../src/core/modules/registry'
import { createProject } from '../src/core/model/project'
import { useStore } from '../src/core/store/store'

afterEach(cleanup)
beforeEach(() => {
  useStore.getState().loadProject(createProject('Test', false))
  location.hash = '#/'
})

const panel = () => screen.getByRole('region', { name: 'Genres' })
/** A group of the planner rail on the home page. */
const railGroup = (name: string) =>
  within(screen.getByRole('navigation', { name: 'Planners' })).getByRole('heading', { name }).closest('section')!
/** Re-renders the app at a route, as navigating there would. */
const open = (hash: string) => {
  cleanup()
  location.hash = hash
  render(<App />)
}

describe('genre profile on the planner menu', () => {
  it('neutral projects show every planner and no view toggle or guide', () => {
    render(<App />)
    expect(within(panel()).getByText(/Not set/)).toBeTruthy()
    // Choosing genres happens in Settings; the menu only links there.
    expect(within(panel()).getByRole('link', { name: 'Choose genres' }).getAttribute('href')).toBe('#/settings/genre')
    expect(screen.queryByRole('group', { name: 'Planner view' })).toBeNull()
    expect(document.querySelector('.project-guide')).toBeNull()
    for (const m of MODULES) expect(screen.getAllByText(m.title).length).toBeGreaterThan(0)
  })

  it('picks Survival + RPG in one undo step and shows recommendations, guide and All view', () => {
    open('#/settings/genre')
    fireEvent.click(within(panel()).getByRole('button', { name: 'Choose genres' }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Survival/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: /^RPG/ }))
    // Live preview before applying.
    expect(within(document.querySelector('.genre-preview') as HTMLElement).getByText(/Player Character/)).toBeTruthy()
    const historyBefore = useStore.getState().past.length
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))

    expect(useStore.getState().project.meta.profile?.genres).toEqual(['survival', 'rpg'])
    expect(useStore.getState().past.length).toBe(historyBefore + 1)
    expect(within(panel()).getByText('Survival · RPG')).toBeTruthy()

    open('#/')
    expect(within(panel()).getByText('Survival · RPG')).toBeTruthy()
    const rec = railGroup('Game Design')
    expect(within(rec).getByText('Recommended for Survival · RPG')).toBeTruthy()
    expect(within(rec).getByText('Player Character')).toBeTruthy()
    expect(within(rec).queryByText('Bug Reports')).toBeNull()
    expect(within(rec).queryByText('Trade & Economy')).toBeTruthy()
    expect(within(rec).queryByText('UI / UX')).toBeNull()
    // Each planner explains why it is recommended.
    expect(within(rec).getByText('Player Character').closest('a')!.getAttribute('title')).toMatch(/Survival: /)
    // Core groups are listed in full whatever the genre.
    expect(within(railGroup('QA')).getByText('Bug Reports')).toBeTruthy()
    for (const group of ['Overview', 'Technical', 'Art & Audio', 'Production', 'Templates']) expect(railGroup(group)).toBeTruthy()

    // The walkthrough now includes both genres' steps, tagged with the genre that added them.
    const needs = screen.getByTestId('walk-step-survival.needs')
    expect(within(needs).getByText('Survival')).toBeTruthy()
    expect(within(screen.getByTestId('walk-step-combat.enemies')).getByText('Survival · RPG')).toBeTruthy()
    fireEvent.click(within(needs).getByRole('button', { name: 'Define the survival needs' }))
    expect(within(needs).getByRole('link', { name: 'Open planner' }).getAttribute('href')).toBe('#/doc/design.player?s=survival')

    fireEvent.click(within(rec).getByRole('button', { name: /Show all planners \(\d+ more\)/ }))
    expect(within(railGroup('Game Design')).getByText('UI / UX')).toBeTruthy()
    expect(railGroup('Game Design').querySelectorAll('.rail-star').length).toBeGreaterThan(0)

    useStore.getState().undo()
    expect(useStore.getState().project.meta.profile?.genres ?? []).toEqual([])
  })

  it('customizes recommended planners and restores defaults', () => {
    useStore.getState().loadProject(createProject('Test', false, { version: 1, genres: ['action'] }))
    open('#/settings/genre')
    fireEvent.click(screen.getByText('Customize recommended planners'))
    // Always-shown groups are not customizable.
    expect(screen.queryByRole('checkbox', { name: /Bug Reports/ })).toBeNull()
    const box = screen.getByRole('checkbox', { name: /Story & Quests/ }) as HTMLInputElement
    expect(box.checked).toBe(false)
    fireEvent.click(box)
    expect(useStore.getState().project.meta.profile?.editors).toEqual({ add: ['design.story'], remove: [] })
    open('#/')
    const rec = railGroup('Game Design')
    expect(within(rec).getByText('Recommended for Action')).toBeTruthy()
    expect(within(rec).getByText('Story & Quests').closest('a')!.getAttribute('title')).toBe('Added by you')
    open('#/settings/genre')
    fireEvent.click(screen.getByText('Customize recommended planners'))
    fireEvent.click(screen.getByRole('button', { name: 'Restore defaults' }))
    expect(useStore.getState().project.meta.profile?.editors).toBeUndefined()
  })

  it('shows unknown saved genres and lets the user drop them', () => {
    useStore.getState().loadProject(createProject('Test', false, { version: 1, genres: ['rpg', 'mmo-future'] }))
    render(<App />)
    expect(within(panel()).getByText('RPG · mmo-future')).toBeTruthy()
    open('#/settings/genre')
    fireEvent.click(within(panel()).getByRole('button', { name: 'Edit genres' }))
    fireEvent.click(screen.getByRole('checkbox', { name: /mmo-future \(unknown genre\)/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    expect(useStore.getState().project.meta.profile?.genres).toEqual(['rpg'])
  })
})
