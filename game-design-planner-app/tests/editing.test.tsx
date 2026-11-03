import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import '../src/core/i18n'
import { App } from '../src/App'
import { useStore } from '../src/core/store/store'
import { createProject } from '../src/core/model/project'

afterEach(cleanup)

describe('editing', () => {
  it('add button creates an entity and the input edits it', async () => {
    window.location.hash = '#/doc/design.npc'
    render(<App />)
    const count = () => Object.values(useStore.getState().project.documents['design.npc'].data).flat().length
    const before = count()
    fireEvent.click(screen.getAllByText(/^\+/)[0])
    expect(count()).toBe(before + 1)
    const input = (await screen.findAllByDisplayValue(/^New /))[0]
    fireEvent.change(input, { target: { value: 'Bob' } })
    expect(await screen.findAllByDisplayValue('Bob')).not.toHaveLength(0)
  })
})

describe('hints UI', () => {
  it('shows the hint panel and asks for confirmation before creating an entity', async () => {
    useStore.getState().loadProject(createProject('T', false))
    useStore.getState().ensureDoc('design.items')
    useStore.getState().mutate((p) => void (p.documents['design.items'].data.items = []))
    window.location.hash = '#/doc/design.items'
    render(<App />)
    expect((await screen.findAllByTestId('hint')).length).toBeGreaterThan(0)
    const items = () => useStore.getState().project.documents['design.items'].data.items.length
    const before = items()
    fireEvent.click(within(screen.getAllByTestId('hint')[0]).getByText('Create'))
    expect(items()).toBe(before)
    fireEvent.click(await screen.findByText('Yes, create'))
    expect(items()).toBe(before + 1)
  })
})
