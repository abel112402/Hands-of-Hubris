import { afterEach, describe, expect, it } from 'vitest'
import { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '../src/core/i18n'
import { CanvasEditorFrame } from '../src/ui/v3/CanvasEditorFrame'

afterEach(cleanup)

function Harness() {
  const [panelOpen, setPanelOpen] = useState(true)
  const [full, setFull] = useState(false)
  const [tab, setTab] = useState('a')
  return (
    <CanvasEditorFrame
      toolbar={<span>Tools here</span>}
      rail={<button>Pick</button>}
      railLabel="Tools"
      canvas={<p>Canvas</p>}
      panel={{ label: 'Side panel', tabs: [{ id: 'a', label: 'First' }, { id: 'b', label: 'Second', disabled: true }], active: tab, onTab: setTab, content: <p>Panel {tab}</p> }}
      panelOpen={panelOpen}
      onPanelOpen={setPanelOpen}
      full={full}
      onFull={setFull}
    />
  )
}

describe('CanvasEditorFrame', () => {
  it('lays out bar, rail, canvas and a tabbed panel the editor controls', () => {
    const { container } = render(<Harness />)
    expect(screen.getByRole('toolbar', { name: 'Tools' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'First' }).getAttribute('aria-selected')).toBe('true')
    expect((screen.getByRole('tab', { name: 'Second' }) as HTMLButtonElement).disabled).toBe(true)
    expect((container.querySelector('.cframe-body') as HTMLElement).style.gridTemplateColumns).toBe('var(--cframe-rail) minmax(0,1fr) var(--cframe-panel)')
    fireEvent.click(screen.getByRole('button', { name: 'Hide side panel' }))
    expect(screen.queryByRole('tablist')).toBeNull()
    expect((container.querySelector('.cframe-body') as HTMLElement).style.gridTemplateColumns).toBe('var(--cframe-rail) minmax(0,1fr)')
    fireEvent.click(screen.getByRole('button', { name: 'Full screen' }))
    expect(container.querySelector('.cframe.full')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Exit full screen' })).toBeTruthy()
  })
})
