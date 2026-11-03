import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import '../src/core/i18n'
import { App } from '../src/App'
import { useStore } from '../src/core/store/store'

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
