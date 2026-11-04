import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import '../src/core/i18n'
import { App } from '../src/App'
import { useStore } from '../src/core/store/store'
import { createProject } from '../src/core/model/project'

afterEach(cleanup)

describe('editing', () => {
  it('add button creates an entity and the input edits it', async () => {
    window.location.hash = '#/doc/design.npc?s=archetypes'
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

describe('vision form accessibility', () => {
  it('associates labels and help text with their inputs', async () => {
    window.location.hash = '#/doc/overview.vision'
    render(<App />)
    const pitch = await screen.findByLabelText('One-sentence pitch', { selector: 'input' })
    fireEvent.change(pitch, { target: { value: 'A town sim' } })
    expect(useStore.getState().project.documents['overview.vision'].data.pitch.pitch).toBe('A town sim')
    expect(pitch.getAttribute('aria-describedby')).toBeTruthy()
    expect(document.getElementById(pitch.getAttribute('aria-describedby')!)?.textContent).toMatch(/refine it last/)
  })
})

describe('roadmap timeline', () => {
  it('offers calendar dates only once a start date exists and shows the buffered end', async () => {
    useStore.getState().loadProject(createProject('T', true), 'x')
    window.location.hash = '#/doc/overview.roadmap?s=phases'
    render(<App />)
    const toggle = (await screen.findAllByLabelText(/Calendar dates/))[0] as HTMLInputElement
    expect(toggle.disabled).toBe(true)
    cleanup()
    useStore.getState().mutate((p) => void (p.documents['overview.roadmap'].data.assumptions = { startDate: '2026-01-05', buffer: 10 }))
    render(<App />)
    const on = (await screen.findAllByLabelText(/Calendar dates/))[0] as HTMLInputElement
    expect(on.disabled).toBe(false)
    expect((await screen.findAllByText(/with 10% buffer: week 88/))[0]).toBeTruthy()
  })
})

describe('hints UI', () => {
  it('shows the hint panel and asks for confirmation before creating an entity', async () => {
    useStore.getState().loadProject(createProject('T', false))
    useStore.getState().ensureDoc('design.items')
    useStore.getState().mutate((p) => void (p.documents['design.items'].data.items = []))
    // Items v2 opens on the Item model form; the items collection's own tips rank first on its section.
    window.location.hash = '#/doc/design.items?s=items'
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
