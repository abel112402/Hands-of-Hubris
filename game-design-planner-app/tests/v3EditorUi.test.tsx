import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import '../src/core/i18n'
import { App } from '../src/App'
import { createProject } from '../src/core/model/project'
import { useStore } from '../src/core/store/store'
import { resetUiVersionOverride, UI_VERSION_KEY } from '../src/core/uiVersion'

afterEach(() => {
  cleanup()
  localStorage.removeItem(UI_VERSION_KEY)
  resetUiVersionOverride()
})

function open(hash: string) {
  const p = createProject('Editor v3')
  p.documents['design.combat'].data.enemies = [
    { id: 'gh', name: 'Ghoul', biome: '', hp: 40 },
    { id: 'wr', name: 'Bog Wraith', armor: 2 },
  ]
  useStore.getState().loadProject(p, 'x')
  localStorage.setItem(UI_VERSION_KEY, 'v3')
  window.location.hash = hash
  return render(<App />)
}
const enemies = () => useStore.getState().project.documents['design.combat'].data.enemies as Record<string, any>[]

describe('v3 planner page', () => {
  it('shows one compact header, the section strip and no side panels', async () => {
    const { container } = open('#/doc/design.combat?s=enemies')
    expect(await screen.findByRole('heading', { level: 1, name: 'Enemies' })).toBeTruthy()
    const strip = screen.getByRole('navigation', { name: 'Sections' })
    expect(within(strip).getByRole('button', { name: /^Enemies/ }).getAttribute('aria-current')).toBe('step')
    // The classic page's section sidebar, system-map strip and hint column are gone from the page flow.
    expect(container.querySelector('#editor-sections')).toBeNull()
    expect(container.querySelector('.system-map')).toBeNull()
    expect(container.querySelector('.hint-panel, aside.hints')).toBeNull()
    fireEvent.click(within(strip).getByRole('button', { name: /^Bosses/ }))
    expect(screen.getByRole('heading', { level: 1, name: 'Bosses' })).toBeTruthy()
    expect(window.location.hash).toBe('#/doc/design.combat?s=bosses')
  })

  it('opens the section map in a sheet and closes it when a section is chosen', async () => {
    open('#/doc/design.combat?s=enemies')
    fireEvent.click(await screen.findByRole('button', { name: /Section map/ }))
    expect(screen.getByRole('dialog', { name: 'System map' })).toBeTruthy()
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    // Atlas-style landmarks: the current section is marked, other planners say so, and a landmark opens its section.
    fireEvent.click(screen.getByRole('button', { name: /Section map/ }))
    const map = within(screen.getByRole('dialog', { name: 'System map' })).getByRole('group', { name: 'System map' })
    const here = within(map).getByRole('link', { name: /^Enemies,.*You are here/ })
    expect(here.getAttribute('aria-current')).toBe('location')
    expect(within(map).getByRole('link', { name: /^Items, Other planner/ }).getAttribute('href')).toBe('#/doc/design.items')
    fireEvent.click(within(map).getByRole('link', { name: /^Bosses,/ }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Bosses' })).toBeTruthy()
    expect(screen.queryByRole('dialog', { name: 'System map' })).toBeNull()
  })

  it('edits an entry in the record sheet: tabs, detail chips and stepping, while the table keeps its width', async () => {
    const { container } = open('#/doc/design.combat?s=enemies&e=gh')
    const sheet = await screen.findByRole('dialog', { name: 'enemy: Ghoul' })
    expect(container.querySelector('.with-inspector')).toBeNull()
    const tabs = within(sheet).getByRole('tablist')
    expect(within(tabs).getAllByRole('tab').map((t) => t.textContent)).toEqual(['Identity0/3', 'Stats1/8', 'Behavior0/4', 'Reward0/2', 'Links'])
    // Identity: biome and role are core; tier waits behind a chip.
    expect(within(sheet).getByLabelText('Biome')).toBeTruthy()
    expect(within(sheet).queryByLabelText('Tier')).toBeNull()
    fireEvent.click(within(sheet).getByRole('button', { name: '+ Tier' }))
    fireEvent.change(within(sheet).getByLabelText('Tier'), { target: { value: '2' } })
    expect(enemies()[0].tier).toBe(2)
    // Stats: the marked combat stats show, the rest are chips until filled.
    fireEvent.click(within(tabs).getByRole('tab', { name: /^Stats/ }))
    expect((within(sheet).getByLabelText('HP') as HTMLInputElement).value).toBe('40')
    expect(within(sheet).queryByLabelText('Armor')).toBeNull()
    // The next entry has armor filled, so it shows without opening.
    fireEvent.click(within(sheet).getByRole('button', { name: 'Next enemy' }))
    const next = screen.getByRole('dialog', { name: 'enemy: Bog Wraith' })
    expect((within(next).getByLabelText('Armor') as HTMLInputElement).value).toBe('2')
    fireEvent.click(within(next).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('shows a form as a centred column with detail fields behind chips', async () => {
    const { container } = open('#/doc/overview.vision')
    await screen.findByRole('heading', { level: 1 })
    const form = container.querySelector('.form3')!
    expect(form).toBeTruthy()
    const chips = within(form as HTMLElement).queryAllByRole('button', { name: /^\+ / })
    const inputs = form.querySelectorAll('input, textarea, select')
    expect(inputs.length).toBeLessThanOrEqual(3)
    if (chips.length) {
      fireEvent.click(chips[0])
      expect(form.querySelectorAll('input, textarea, select').length).toBe(inputs.length + 1)
    }
  })
})

describe('v3 part 1b', () => {
  it('puts the collection tools in the section header instead of a toolbar row', async () => {
    const { container } = open('#/doc/design.combat?s=enemies')
    const head = (await screen.findByRole('heading', { level: 1, name: 'Enemies' })).closest('header')!
    const views = within(head).getByRole('group', { name: 'View' })
    expect(within(views).getAllByRole('button').map((b) => b.textContent)).toEqual(['Table', 'Threat curve', 'Weaknesses', 'Cards'])
    // The filter folds to a button until used; the entry count sits in the header line.
    expect(within(head).queryByRole('textbox', { name: 'Filter' })).toBeNull()
    fireEvent.click(within(head).getByRole('button', { name: 'Filter' }))
    fireEvent.change(within(head).getByRole('textbox', { name: 'Filter' }), { target: { value: 'wra' } })
    expect(screen.queryByText('Ghoul')).toBeNull()
    expect(head.textContent).toContain('2 enemies')
    expect(within(head).getByRole('button', { name: '+ Add enemy' })).toBeTruthy()
    expect(container.querySelector('.collection > .toolbar')).toBeNull()
    fireEvent.click(within(views).getByRole('button', { name: 'Cards' }))
    expect(within(views).getByRole('button', { name: 'Cards' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('expands a record to its own page and back to the sheet', async () => {
    open('#/doc/design.combat?s=enemies&e=gh')
    const sheet = await screen.findByRole('dialog', { name: 'enemy: Ghoul' })
    fireEvent.click(within(sheet).getByRole('button', { name: 'Open as a page' }))
    expect(window.location.hash).toBe('#/doc/design.combat?s=enemies&r=gh')
    const page = screen.getByRole('region', { name: 'enemy: Ghoul' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByRole('group', { name: 'View' })).toBeNull()
    // Stepping moves the page along.
    fireEvent.click(within(page).getByRole('button', { name: 'Next enemy' }))
    expect(window.location.hash).toBe('#/doc/design.combat?s=enemies&r=wr')
    fireEvent.click(within(screen.getByRole('region', { name: 'enemy: Bog Wraith' })).getByRole('button', { name: /Back to the list/ }))
    expect(window.location.hash).toBe('#/doc/design.combat?s=enemies')
    expect(screen.getByRole('dialog', { name: 'enemy: Bog Wraith' })).toBeTruthy()
  })

  it('gives a hidden form field\'s chip the field\'s walkthrough target', async () => {
    const { container } = open('#/doc/overview.vision')
    await screen.findByRole('heading', { level: 1 })
    const chip = container.querySelector('.form3 .chip-add')
    if (chip) expect(chip.getAttribute('data-guide')).toMatch(/^field-/)
  })
})
