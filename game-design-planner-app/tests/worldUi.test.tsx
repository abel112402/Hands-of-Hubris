import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import '../src/core/i18n'
import { App } from '../src/App'
import { useStore } from '../src/core/store/store'
import { createProject } from '../src/core/model/project'

afterEach(cleanup)

const world = () => useStore.getState().project.documents['design.world'].data

function load() {
  const p = createProject('UI', false)
  p.documents['design.world'] = {
    moduleVersion: 3,
    data: {
      exploration: {},
      biomes: [
        { id: 'm', name: 'Meadow', role: 'Starter', color: '#53c28b', levelMin: 1, levelMax: 4 },
        { id: 'f', name: 'Forest', role: 'Early', levelMin: 4, entryType: 'Boss', entryBosses: ['boar'] },
      ],
      progression: { nodes: [], edges: [] },
      map: { items: [] },
      outposts: [],
    },
  }
  p.documents['design.combat'] = { moduleVersion: 2, data: { enemies: [{ id: 'w', name: 'Wolf', biome: 'm', hp: 20, damage: 2 }], bosses: [{ id: 'boar', name: 'Old Boar', biome: 'm', hp: 300, damage: 10 }] } }
  useStore.getState().loadProject(p, 'x')
}

describe('world & biomes views', () => {
  it('opens on the dossier and switches biomes from its list', () => {
    load()
    window.location.hash = '#/doc/design.world?s=biomes'
    render(<App />)
    const sheet = screen.getByRole('article', { name: 'Dossier: Meadow' })
    expect(within(sheet).getByText('Open from the start')).toBeTruthy()
    expect(within(sheet).getByText('Wolf')).toBeTruthy()
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Biomes' })).getByText('Forest'))
    const forest = screen.getByRole('article', { name: 'Dossier: Forest' })
    expect(within(forest).getByText('Opens in wave 1')).toBeTruthy()
    expect(within(forest).getByText(/met in Meadow/)).toBeTruthy()
  })

  it('places unplaced biomes from the atlas as one undo step', () => {
    load()
    window.location.hash = '#/doc/design.world?s=biomes'
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Atlas' }))
    fireEvent.click(screen.getByRole('button', { name: 'Place 2 unplaced' }))
    expect(world().map.items.map((i: any) => i.refId)).toEqual(['m', 'f'])
    expect(screen.getByRole('img', { name: 'World atlas' })).toBeTruthy()
    useStore.getState().undo()
    expect(world().map.items).toEqual([])
  })

  it('draws the unlock path, selects a biome on click and shows coverage gaps', () => {
    load()
    window.location.hash = '#/doc/design.world?s=biomes'
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Unlock path' }))
    expect(screen.getByText('Every biome can be reached in this order.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Unlock order' }))
    expect(screen.getByText('Wave 1')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Biome Forest' }))
    expect(screen.getByDisplayValue('Forest')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Coverage' }))
    expect(screen.getByText('Biomes covered')).toBeTruthy()
  })
})
