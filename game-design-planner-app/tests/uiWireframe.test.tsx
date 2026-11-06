import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import '../src/core/i18n'
import { App } from '../src/App'
import { useStore } from '../src/core/store/store'
import { createProject } from '../src/core/model/project'
import { UI_DOC, type WireElement } from '../src/core/ui'

// jsdom has no PointerEvent; a MouseEvent carries clientX / clientY / button / shiftKey / altKey.
beforeAll(() => {
  if (typeof window.PointerEvent === 'undefined') (window as any).PointerEvent = class extends MouseEvent {}
})
afterEach(cleanup)

const el = (id: string, kind: string, x: number, y: number, w: number, h: number, extra: Partial<WireElement> = {}): WireElement => ({ id, kind, x, y, w, h, ...extra })

function load(hud: WireElement[] = [], inv: WireElement[] = []) {
  const p = createProject('UI')
  const d = p.documents[UI_DOC].data
  d.screens = [
    { id: 'hud', name: 'HUD', kind: 'HUD', entry: true, states: ['default', 'empty'], layout: { elements: hud } },
    { id: 'bag', name: 'Inventory', kind: 'Window', layout: { elements: inv } },
  ]
  useStore.getState().loadProject(p, 'x')
}
const els = (id = 'hud'): WireElement[] => useStore.getState().project.documents[UI_DOC].data.screens.find((s: any) => s.id === id).layout.elements
const past = () => useStore.getState().past.length

async function open() {
  window.location.hash = '#/doc/design.ui?s=screens'
  render(<App />)
  await screen.findByTestId('wf-board')
  // 100 % zoom: in jsdom the board sits at (0, 0), so client px = artboard px.
  fireEvent.click(screen.getByRole('button', { name: '100%' }))
}
const down = (target: Element, x: number, y: number, o: Record<string, unknown> = {}) => fireEvent.pointerDown(target, { clientX: x, clientY: y, button: 0, ...o })
const move = (x: number, y: number, o: Record<string, unknown> = {}) => fireEvent.pointerMove(window, { clientX: x, clientY: y, ...o })
const up = () => fireEvent.pointerUp(window)

describe('wireframe editor', () => {
  it('adds an element from the palette, selected and on the grid', async () => {
    load()
    await open()
    fireEvent.click(screen.getByRole('button', { name: 'Add Button' }))
    const [b] = els()
    expect(b).toMatchObject({ kind: 'button', x: 872, y: 520, w: 180, h: 48, text: 'Button' })
    expect(screen.getAllByTestId(/wf-handle-/)).toHaveLength(8)
  })

  it('sizes the scroll area to the scaled screen only, so Fit never adds scrollbars (no resize loop)', async () => {
    load()
    await open()
    // At 100 % the scroll content is exactly the 1920×1080 backdrop; its 24 px CSS padding is the only margin.
    const scroll = document.querySelector('.wf-scroll') as HTMLElement
    expect([scroll.style.width, scroll.style.height]).toEqual(['1920px', '1080px'])
  })

  it('drags with smart guides and grid snapping as one undo step', async () => {
    load([el('a', 'button', 872, 520, 180, 48, { text: 'Go' })])
    await open()
    const before = past()
    const node = screen.getByTestId('wf-el-a')
    down(node, 900, 530)
    move(950, 530)
    move(1003, 530)
    // The element's vertical centre (544) is within 6 px of the screen centre (540): a guide shows.
    expect(document.querySelectorAll('.wf-guide').length).toBeGreaterThan(0)
    up()
    expect(els()[0]).toMatchObject({ x: 976, y: 516 })
    expect(past()).toBe(before + 1)
    act(() => useStore.getState().undo())
    expect(els()[0]).toMatchObject({ x: 872, y: 520 })
  })

  it('nudges, duplicates and deletes from the keyboard', async () => {
    load([el('a', 'label', 200, 200, 160, 28, { text: 'Hi' })])
    await open()
    down(screen.getByTestId('wf-el-a'), 210, 210)
    up()
    const root = screen.getByTestId('wf-root')
    fireEvent.keyDown(root, { key: 'ArrowRight' })
    fireEvent.keyDown(root, { key: 'ArrowDown', shiftKey: true })
    expect(els()[0]).toMatchObject({ x: 201, y: 208 })
    fireEvent.keyDown(root, { key: 'd', ctrlKey: true })
    expect(els()).toHaveLength(2)
    expect(els()[1]).toMatchObject({ x: 209, y: 216, text: 'Hi' })
    fireEvent.keyDown(root, { key: 'Delete' })
    expect(els()).toHaveLength(1)
  })

  it('multi-selects with Shift and aligns left', async () => {
    load([el('a', 'button', 100, 100, 180, 48, { text: 'A' }), el('b', 'button', 400, 300, 180, 48, { text: 'B' })])
    await open()
    down(screen.getByTestId('wf-el-a'), 110, 110)
    up()
    down(screen.getByTestId('wf-el-b'), 410, 310, { shiftKey: true })
    up()
    fireEvent.click(screen.getByRole('button', { name: 'Align left' }))
    expect(els().map((e) => e.x)).toEqual([100, 100])
  })

  it('selects with a marquee and shows only the chosen state', async () => {
    load([el('a', 'label', 100, 100, 100, 28, { text: 'Always' }), el('b', 'label', 300, 100, 100, 28, { text: 'Empty only', states: ['empty'] })])
    await open()
    down(screen.getByTestId('wf-board'), 50, 50)
    move(250, 200)
    up()
    expect(screen.getAllByTestId(/wf-handle-/)).toHaveLength(8)
    fireEvent.change(screen.getByLabelText('State'), { target: { value: 'default' } })
    expect(screen.queryByTestId('wf-el-b')).toBeNull()
    fireEvent.change(screen.getByLabelText('State'), { target: { value: 'empty' } })
    expect(screen.getByTestId('wf-el-b')).toBeTruthy()
  })

  it('clicks through screens in Preview and comes back', async () => {
    load([el('go', 'button', 100, 100, 180, 48, { text: 'Bag', action: { kind: 'opens', screen: 'bag' } })], [el('x', 'button', 20, 20, 160, 48, { text: 'Close', action: { kind: 'back' } })])
    await open()
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }))
    fireEvent.click(screen.getByTestId('wf-el-go'))
    expect(document.querySelector('.wf-title')!.textContent).toBe('Inventory')
    fireEvent.click(screen.getByTestId('wf-el-x'))
    expect(document.querySelector('.wf-title')!.textContent).toBe('HUD')
  })

  it('binds a stat bar to a survival stat and flags it until then', async () => {
    load([el('bar', 'statBar', 200, 900, 260, 28)])
    await open()
    expect(document.querySelector('[data-testid="wf-el-bar"]')!.className).toContain('issue-warn')
    down(screen.getByTestId('wf-el-bar'), 210, 910)
    up()
    fireEvent.change(screen.getByLabelText('Data source'), { target: { value: 'survivalStat' } })
    fireEvent.change(screen.getByLabelText('Data entry'), { target: { value: 'health' } })
    expect(els()[0].bind).toEqual({ source: 'survivalStat', id: 'health' })
    expect(screen.getByTestId('wf-el-bar').textContent).toContain('Health')
    expect(screen.getByTestId('wf-el-bar').className).not.toContain('issue')
  })

  it('starts an empty screen from a template', async () => {
    load()
    await open()
    fireEvent.click(within(screen.getByRole('region', { name: 'Start this wireframe' })).getByRole('button', { name: 'HUD' }))
    expect(els().length).toBeGreaterThan(5)
  })
})
