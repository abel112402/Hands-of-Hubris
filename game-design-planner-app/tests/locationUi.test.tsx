import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '../src/core/i18n'
import { App } from '../src/App'
import { createProject } from '../src/core/model/project'
import { useStore } from '../src/core/store/store'
import { WORLD_DOC } from '../src/core/world'

afterEach(cleanup)

function load(locations: Record<string, unknown>[]) {
  const project = createProject('Locations UI')
  project.documents[WORLD_DOC].data.locations = locations
  useStore.getState().loadProject(project, 'x')
}
const stored = () => useStore.getState().project.documents[WORLD_DOC].data.locations as Record<string, any>[]
const openMap = async () => fireEvent.click((await screen.findAllByRole('button', { name: 'Map' })).find((b) => b.closest('.tabs'))!)

describe('Locations map view', () => {
  it('generates a map, rerolls one layer and undoes it', async () => {
    load([{ id: 'oak', name: 'Oakham', type: 'Village' }])
    window.location.hash = '#/doc/design.world?s=locations'
    const { container } = render(<App />)
    await openMap()

    expect(container.querySelector('.loc-svg')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Generate map' }))
    expect(container.querySelector('.loc-svg [data-layer="buildings"] [data-obj]')).toBeTruthy()
    expect(container.querySelector('.loc-svg')!.textContent).toContain('Oakham')

    const before = stored()[0].map
    fireEvent.click(screen.getByRole('button', { name: 'Regenerate Roads' }))
    const after = stored()[0].map
    expect(after.layers.roads.nonce).toBe(1)
    expect(after.layers.water).toEqual(before.layers.water)
    expect(screen.getAllByText('out of date').length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: /^Update \d+ out of date$/ }))
    expect(screen.queryByText('out of date')).toBeNull()

    fireEvent.click(screen.getByLabelText('Show Trees'))
    expect(container.querySelector('.loc-svg [data-layer="vegetation"]')).toBeNull()

    useStore.getState().undo()
    useStore.getState().undo()
    useStore.getState().undo()
    useStore.getState().undo()
    expect(stored()[0].map).toBeUndefined()
  })

  it('selects an object on the map, edits it in the panel, and adds and deletes objects', async () => {
    load([{ id: 'oak', name: 'Oakham', type: 'Village' }])
    window.location.hash = '#/doc/design.world?s=locations'
    const { container } = render(<App />)
    await openMap()
    fireEvent.click(screen.getByRole('button', { name: 'Generate map' }))
    const house = () => stored()[0].map.layers.buildings.objects[0]
    const id = house().id
    const before = house().x

    fireEvent.pointerDown(container.querySelector(`.loc-svg [data-obj="${id}"]`)!, { button: 0 })
    fireEvent.pointerUp(window)
    expect(screen.getByTestId('loc-selection').querySelector('[data-handle="resize"]')).toBeTruthy()
    expect(screen.getByLabelText('Selected object').textContent).toContain('House')

    fireEvent.change(screen.getByLabelText('X'), { target: { value: String(before + 25) } })
    expect([house().x, house().pinned]).toEqual([before + 25, true])
    fireEvent.change(screen.getByLabelText('Roof'), { target: { value: 'Thatch' } })
    expect(house().props.roof).toBe(3)
    fireEvent.keyDown(screen.getByLabelText('Map'), { key: 'ArrowRight', shiftKey: true })
    expect(house().x).toBe(before + 35)

    fireEvent.click(screen.getByRole('button', { name: 'Regenerate Houses' }))
    expect(stored()[0].map.layers.buildings.objects.find((o: any) => o.id === id).x).toBe(before + 35)

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(stored()[0].map.layers.buildings.objects.some((o: any) => o.id === id)).toBe(false)
    expect(screen.queryByTestId('loc-selection')).toBeNull()

    const trees = stored()[0].map.layers.vegetation.objects.length
    fireEvent.change(screen.getByLabelText('Object to add'), { target: { value: 'vegetation/tree' } })
    fireEvent.click(screen.getByRole('button', { name: '+ Add' }))
    expect(stored()[0].map.layers.vegetation.objects.length).toBe(trees + 1)
    expect(screen.getByLabelText('Selected object').textContent).toContain('Tree')

    fireEvent.pointerDown(container.querySelector('.loc-svg [data-layer="ground"] [data-obj]')!, { button: 0 })
    expect(screen.queryByTestId('loc-selection')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Lock Houses' }))
    expect((screen.getByRole('button', { name: 'Regenerate Houses' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.pointerDown(container.querySelector('.loc-svg [data-layer="buildings"] [data-obj]')!, { button: 0 })
    expect(screen.queryByTestId('loc-selection')).toBeNull()
  })

  it('explains a type without a generator and shows maps in the gallery', async () => {
    load([{ id: 'base', name: 'Moon base', type: 'Space station' }, { id: 'crypt', name: 'Old crypt', type: 'Dungeon' }])
    window.location.hash = '#/doc/design.world?s=locations'
    const { container } = render(<App />)
    expect((await screen.findAllByText('No map yet')).length).toBe(2)
    await openMap()
    expect(screen.getByText(/no map generator for Space station locations yet/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Generate map' })).toBeNull()

    fireEvent.change(screen.getByLabelText('Location'), { target: { value: 'crypt' } })
    fireEvent.click(screen.getByRole('button', { name: 'Generate map' }))
    expect(container.querySelector('.loc-svg [data-layer="rooms"] [data-obj]')).toBeTruthy()
    expect(screen.getByLabelText('Show Corridors')).toBeTruthy()
  })
})
