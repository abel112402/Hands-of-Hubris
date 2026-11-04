import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '../src/core/i18n'
import { App } from '../src/App'
import { useStore } from '../src/core/store/store'
import { createProject } from '../src/core/model/project'
import { ITEMS_DOC } from '../src/core/items'

afterEach(cleanup)

function load() {
  const p = createProject('UI')
  const d = p.documents[ITEMS_DOC].data
  d.items = [
    { id: 'vase', name: 'Vase', type: 'decoration', rarity: 'common', value: 4 },
    { id: 'plank', name: 'Plank', type: 'resource-item', rarity: 'common', value: 2, stack: 50 },
    { id: 'chair', name: 'Chair', type: 'decoration', rarity: 'uncommon', value: 15 },
  ]
  d.recipes = [
    { id: 'r1', name: 'Plank', result: 'plank', outputQty: 2, resources: { wood: 2 } },
    { id: 'r2', name: 'Chair', result: 'chair', ingredients: { plank: 4 } },
  ]
  d.loot = [{ id: 'l', name: 'Crate', rolls: 1, weights: { plank: 9, vase: 1 } }]
  useStore.getState().loadProject(p, 'x')
}

describe('items editor', () => {
  it('moves field groups a type does not use to the bottom, collapsed', async () => {
    load()
    window.location.hash = '#/doc/design.items?s=items'
    render(<App />)
    fireEvent.click(await screen.findByDisplayValue('Vase'))
    const combat = await screen.findByTestId('group-Combat')
    expect(combat.className).toContain('off')
    expect(combat.hasAttribute('open')).toBe(false)
    expect(screen.getByTestId('group-Build').className).not.toContain('off')
    expect(screen.getByText('Obtained from')).toBeTruthy()
  })

  it('totals a crafting chain', async () => {
    load()
    window.location.hash = '#/doc/design.items?s=recipes'
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Crafting tree' }))
    fireEvent.change(await screen.findByLabelText('Item'), { target: { value: 'chair' } })
    // 4 planks at 2 per craft = 2 crafts × 2 wood.
    expect(await screen.findByText(/4 Wood/)).toBeTruthy()
    expect(screen.getByText(/×1\.88/)).toBeTruthy()
  })

  it('updates loot odds when rolls change', async () => {
    load()
    window.location.hash = '#/doc/design.items?s=loot'
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Loot odds' }))
    expect(await screen.findAllByText('10%')).not.toHaveLength(0)
    fireEvent.change(screen.getByLabelText('Rolls'), { target: { value: '2' } })
    expect(await screen.findAllByText('19%')).not.toHaveLength(0)
  })
})
