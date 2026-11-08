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

describe('genre profile on the planner menu', () => {
  it('neutral projects show every planner and no view toggle or guide', () => {
    render(<App />)
    expect(within(panel()).getByText(/Not set/)).toBeTruthy()
    expect(screen.queryByRole('group', { name: 'Planner view' })).toBeNull()
    expect(document.querySelector('.project-guide')).toBeNull()
    for (const m of MODULES) expect(screen.getAllByText(m.title).length).toBeGreaterThan(0)
  })

  it('picks Survival + RPG in one undo step and shows recommendations, guide and All view', () => {
    render(<App />)
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

    const rec = screen.getByRole('heading', { name: 'Recommended for Survival · RPG' }).closest('section')!
    expect(within(rec).getByText('Player Character')).toBeTruthy()
    expect(within(rec).queryByText('Bug Reports')).toBeNull()
    expect(within(rec).queryByText('Trade & Economy')).toBeTruthy()
    expect(within(rec).queryByText('UI / UX')).toBeNull()
    expect(within(rec).getAllByText(/Survival: /).length).toBeGreaterThan(0)
    // Core groups are listed in full whatever the genre.
    const qa = screen.getByRole('heading', { name: 'QA' }).closest('section')!
    expect(within(qa).getByText('Bug Reports')).toBeTruthy()
    for (const group of ['Overview', 'Technical', 'Art & Audio', 'Production', 'Templates']) expect(screen.getByRole('heading', { name: group })).toBeTruthy()

    expect(screen.getByText(/Project guide: Survival · RPG/)).toBeTruthy()
    // Compact by default: only the next open steps; the rest on request.
    expect(document.querySelectorAll('.guide-steps li')).toHaveLength(3)
    fireEvent.click(screen.getByRole('button', { name: /Show all \d+ steps/ }))
    expect(document.querySelectorAll('.guide-steps li').length).toBeGreaterThan(3)
    const guideLink = screen.getAllByRole('link', { name: /Open Player Character › / })[0]
    expect(guideLink.getAttribute('href')).toMatch(/#\/doc\/design\.player\?s=/)

    fireEvent.click(screen.getByRole('button', { name: 'All planners' }))
    expect(screen.getByText('Bug Reports')).toBeTruthy()
    expect(document.querySelectorAll('.recommended-badge').length).toBeGreaterThan(0)

    useStore.getState().undo()
    expect(useStore.getState().project.meta.profile?.genres ?? []).toEqual([])
  })

  it('customizes recommended planners and restores defaults', () => {
    useStore.getState().loadProject(createProject('Test', false, { version: 1, genres: ['action'] }))
    render(<App />)
    fireEvent.click(screen.getByText('Customize recommended planners'))
    // Always-shown groups are not customizable.
    expect(screen.queryByRole('checkbox', { name: /Bug Reports/ })).toBeNull()
    const box = screen.getByRole('checkbox', { name: /Story & Quests/ }) as HTMLInputElement
    expect(box.checked).toBe(false)
    fireEvent.click(box)
    expect(useStore.getState().project.meta.profile?.editors).toEqual({ add: ['design.story'], remove: [] })
    const rec = screen.getByRole('heading', { name: 'Recommended for Action' }).closest('section')!
    expect(within(rec).getByText('Story & Quests')).toBeTruthy()
    expect(within(rec).getByText('Added by you')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Restore defaults' }))
    expect(useStore.getState().project.meta.profile?.editors).toBeUndefined()
  })

  it('shows unknown saved genres and lets the user drop them', () => {
    useStore.getState().loadProject(createProject('Test', false, { version: 1, genres: ['rpg', 'mmo-future'] }))
    render(<App />)
    expect(within(panel()).getByText('RPG · mmo-future')).toBeTruthy()
    fireEvent.click(within(panel()).getByRole('button', { name: 'Edit genres' }))
    fireEvent.click(screen.getByRole('checkbox', { name: /mmo-future \(unknown genre\)/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    expect(useStore.getState().project.meta.profile?.genres).toEqual(['rpg'])
  })
})
