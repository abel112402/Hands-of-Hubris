import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '../src/core/i18n'
import { App } from '../src/App'
import { useStore } from '../src/core/store/store'
import { createProject } from '../src/core/model/project'
import { DATA_DOC } from '../src/core/dataDriven'

afterEach(cleanup)

const doc = () => useStore.getState().project.documents[DATA_DOC].data

function load() {
  const p = createProject('UI', false)
  p.documents[DATA_DOC] = {
    moduleVersion: 2,
    data: {
      formats: [{ id: 'so', name: 'ScriptableObject' }],
      schemas: [
        { id: 'it', name: 'Item', idPrefix: 'item.', format: 'so', required: ['name: string', 'value: int'], records: 100 },
        { id: 'rc', name: 'Recipe', idPrefix: 'rcp.', required: ['output: Item', 'owner: Faction'], records: 20 },
      ],
      loadGroups: [{ id: 'g', name: 'Core', schemas: ['it'], strategy: 'Preload at boot', budgetMb: 1 }],
    },
  }
  useStore.getState().loadProject(p, 'x')
}

describe('data-driven editor', () => {
  it('draws the data model, flags unknown types and jumps along a reference', async () => {
    load()
    window.location.hash = `#/doc/${DATA_DOC}?s=schemas`
    render(<App />)
    expect(await screen.findByRole('button', { name: 'Schema Recipe' })).toBeTruthy()
    expect(screen.getByText(/Unknown or missing types: Recipe\.owner \(Faction\)/)).toBeTruthy()
    fireEvent.click(screen.getByText('output'))
    expect(await screen.findByDisplayValue('Item')).toBeTruthy()
  })

  it('checks a record in the tester', async () => {
    load()
    window.location.hash = `#/doc/${DATA_DOC}?s=schemas`
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Record tester' }))
    fireEvent.click(screen.getByRole('button', { name: 'Edit a copy →' }))
    expect(screen.getByText('✓ Valid Item record')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Record to check'), { target: { value: '{"id":"Sword","name":"Sword","value":1.5}' } })
    expect(screen.getByText('✗ 2 errors')).toBeTruthy()
    expect(screen.getByText(/should be a whole number/)).toBeTruthy()
  })

  it('shows readiness gaps per schema', async () => {
    load()
    window.location.hash = `#/doc/${DATA_DOC}?s=schemas`
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Pipeline readiness' }))
    expect(screen.getByLabelText('Item Load group: Core')).toBeTruthy()
    expect(screen.getByLabelText('Recipe Load group: not loaded').className).toContain('gap')
  })

  it('puts an unloaded schema into a group from the load plan', async () => {
    load()
    window.location.hash = `#/doc/${DATA_DOC}?s=loadGroups`
    render(<App />)
    expect(await screen.findByText(/1 schema never loaded/)).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Add Recipe to a load group'), { target: { value: 'g' } })
    expect(doc().loadGroups[0].schemas).toEqual(['it', 'rc'])
    fireEvent.change(screen.getByLabelText('Content scale'), { target: { value: '5' } })
    expect(screen.getByText('×5')).toBeTruthy()
    expect(doc().schemas[0].records).toBe(100)
  })
})
