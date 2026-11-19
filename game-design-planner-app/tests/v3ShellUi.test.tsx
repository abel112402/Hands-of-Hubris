import { afterEach, describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import '../src/core/i18n'
import { App } from '../src/App'
import { createProject } from '../src/core/model/project'
import { useStore } from '../src/core/store/store'
import { resetUiVersionOverride, setUiVersion, UI_VERSION_KEY } from '../src/core/uiVersion'
import { Sheet } from '../src/ui/v3/Sheet'

afterEach(() => {
  cleanup()
  localStorage.removeItem(UI_VERSION_KEY)
  resetUiVersionOverride()
})

function load() {
  const p = createProject('Shell v3')
  p.documents['design.combat'].data.enemies = [{ id: 'gh', name: 'Ghoul' }]
  useStore.getState().loadProject(p, 'x')
}
const isV3 = () => !!document.querySelector('.shell3')

describe('v3 shell', () => {
  it('is the default when this browser has no stored choice', async () => {
    load()
    localStorage.removeItem(UI_VERSION_KEY)
    resetUiVersionOverride()
    window.location.hash = '#/'
    render(<App />)
    await screen.findByRole('navigation', { name: 'Main' })
    expect(isV3()).toBe(true)
  })

  it('switches between Classic and Design Atlas in Settings without touching the project', async () => {
    load()
    window.location.hash = '#/settings/general'
    render(<App />)
    await screen.findByRole('heading', { name: 'Settings' })
    expect(isV3()).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Design Atlas' }))
    expect(isV3()).toBe(true)
    // The default is stored as no choice; Classic is stored explicitly.
    expect(localStorage.getItem(UI_VERSION_KEY)).toBeNull()
    expect(useStore.getState().dirty).toBe(false)
    // The rail labels every item; the classic interface is one click away.
    expect(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', { name: 'Atlas' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Classic' }))
    expect(isV3()).toBe(false)
    expect(localStorage.getItem(UI_VERSION_KEY)).toBe('v2')
  })

  it('jumps to a named entry from the command palette and selects it', async () => {
    load()
    localStorage.setItem(UI_VERSION_KEY, 'v3')
    window.location.hash = '#/'
    render(<App />)
    await screen.findByRole('navigation', { name: 'Main' })
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    const box = screen.getByRole('combobox', { name: 'Jump to' })
    fireEvent.change(box, { target: { value: 'ghoul' } })
    expect(screen.getAllByRole('option')[0].textContent).toContain('Ghoul')
    fireEvent.keyDown(box, { key: 'Enter' })
    expect(screen.queryByRole('dialog', { name: 'Jump to' })).toBeNull()
    expect(window.location.hash).toBe('#/doc/design.combat?s=enemies&e=gh')
    // The entry opens in the inspector.
    expect(((await screen.findByLabelText(/^Name/)) as HTMLInputElement).value).toBe('Ghoul')
  })

  it('switches the theme and back to the classic interface from the palette', async () => {
    load()
    setUiVersion('v3')
    window.location.hash = '#/'
    render(<App />)
    await screen.findByRole('navigation', { name: 'Main' })
    const theme = document.documentElement.dataset.theme
    fireEvent.click(screen.getByRole('button', { name: /^Switch to (light|dark) mode$/ }))
    expect(document.documentElement.dataset.theme).not.toBe(theme)
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    fireEvent.change(screen.getByRole('combobox', { name: 'Jump to' }), { target: { value: 'classic' } })
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Jump to' }), { key: 'Enter' })
    expect(isV3()).toBe(false)
  })
})

describe('Sheet', () => {
  function Harness({ onClose }: { onClose: () => void }) {
    const [open, setOpen] = useState(false)
    return (
      <>
        <button onClick={() => setOpen(true)}>Open ghoul</button>
        {open && (
          <Sheet label="Enemy Ghoul" title="Ghoul" onClose={() => { onClose(); setOpen(false) }} onNext={() => {}}>
            <input aria-label="HP" />
            <button>Inside</button>
          </Sheet>
        )}
      </>
    )
  }

  it('moves focus in, traps Tab, closes on Escape and gives focus back', () => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    const opener = screen.getByRole('button', { name: 'Open ghoul' })
    opener.focus()
    fireEvent.click(opener)
    const dialog = screen.getByRole('dialog', { name: 'Enemy Ghoul' })
    expect(document.activeElement).toBe(screen.getByLabelText('HP'))
    // Tab from the last control wraps to the first (the header's Next button).
    screen.getByRole('button', { name: 'Inside' }).focus()
    fireEvent.keyDown(dialog, { key: 'Tab' })
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Next' }))
    act(() => void fireEvent.keyDown(dialog, { key: 'Escape' }))
    expect(onClose).toHaveBeenCalledOnce()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(opener)
  })
})
