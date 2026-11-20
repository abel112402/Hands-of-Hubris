import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import '../src/core/i18n'
import { App } from '../src/App'
import { useStore } from '../src/core/store/store'
import { createProject } from '../src/core/model/project'
import { DATA_DOC } from '../src/core/dataDriven'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const schema = () => useStore.getState().project.documents[DATA_DOC].data.schemas[0]

function load() {
  const p = createProject('UI', false)
  p.documents['design.items'] = { ...p.documents['design.items'], data: { ...p.documents['design.items']?.data, items: [{ id: 'i1', name: 'Iron sword', value: 12, weight: 3 }] } }
  p.documents[DATA_DOC] = {
    moduleVersion: 3,
    data: {
      formats: [{ id: 'so', name: 'ScriptableObject' }],
      schemas: [{ id: 'it', name: 'Item', idPrefix: 'item.', format: 'so', source: 'Items — Items & Crafting', required: ['name: string', 'value: int', 'mass: float', 'owner: Faction'] }],
    },
  }
  useStore.getState().loadProject(p, 'x')
}

async function open() {
  load()
  window.location.hash = `#/doc/${DATA_DOC}?s=schemas`
  render(<App />)
  fireEvent.click(await screen.findByRole('button', { name: 'Engine export' }))
}

describe('engine export view', () => {
  it('shows checks, previews generated files and downloads the zip', async () => {
    await open()
    expect(screen.getByLabelText('Target engine')).toHaveProperty('value', '')
    expect(screen.getByText(/Item\.owner: type “Faction” is not known; exported as text\./)).toBeTruthy()
    const preview = screen.getByLabelText('Preview of Unity/Scripts/Generated/ItemDefinition.cs')
    expect(preview.textContent).toContain('public partial class ItemDefinition : ScriptableObject')
    fireEvent.click(screen.getByRole('button', { name: 'Data/Item/item.iron_sword.json' }))
    expect(screen.getByLabelText('Preview of Data/Item/item.iron_sword.json').textContent).toContain('"value": 12')

    const url = vi.fn(() => 'blob:x')
    Object.assign(URL, { createObjectURL: url, revokeObjectURL: vi.fn() })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    fireEvent.click(screen.getByRole('button', { name: 'Download .zip' }))
    await waitFor(() => expect(click).toHaveBeenCalled())
    expect((click.mock.contexts[0] as HTMLAnchorElement).download).toBe('ui-unity-export.zip')
  })

  it('maps a schema field to a planner field, as one undo step', async () => {
    await open()
    const select = screen.getByLabelText('Item.mass filled from')
    expect(screen.getAllByText(/mass.*1 of 1 records have no matching value/).length).toBeGreaterThan(0)
    fireEvent.change(select, { target: { value: 'weight' } })
    expect(schema().fieldMap).toEqual(['mass ← weight'])
    fireEvent.click(screen.getByRole('button', { name: 'Data/Item/item.iron_sword.json' }))
    expect(screen.getByLabelText('Preview of Data/Item/item.iron_sword.json').textContent).toContain('"mass": 3')
    useStore.getState().undo()
    expect(schema().fieldMap).toBeUndefined()
    useStore.getState().redo()
    expect(schema().fieldMap).toEqual(['mass ← weight'])
    fireEvent.change(screen.getByLabelText('Item.mass filled from'), { target: { value: '' } })
    expect(schema().fieldMap).toEqual([])
  })

  it('switches the target engine and explains a data-only export', async () => {
    await open()
    fireEvent.change(screen.getByLabelText('Target engine'), { target: { value: 'godot' } })
    expect(useStore.getState().project.meta.engine).toEqual({ target: 'godot' })
    expect(screen.getByRole('note').textContent).toMatch(/no Godot code generator yet/)
    expect(screen.queryByRole('button', { name: /^Unity\// })).toBeNull()
    fireEvent.change(screen.getByLabelText('Target engine'), { target: { value: '' } })
    expect(useStore.getState().project.meta.engine).toEqual({})
  })
})
