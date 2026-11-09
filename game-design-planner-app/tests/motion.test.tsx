import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react'
import '../src/core/i18n'
import { App } from '../src/App'
import { createProject } from '../src/core/model/project'
import { useStore } from '../src/core/store/store'
import { BASE_PACK } from '../src/modules/walkthroughs'
import { useRef } from 'react'
import { useCountUp, useJustChanged, useNewlyAdded, useRevealOnce, useStuck } from '../src/ui/hooks'
import { AutoHeight, CountBadge, dragCue, Segmented } from '../src/ui/motion'
import { setStepManual } from '../src/core/walkthrough/evaluate'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('useJustChanged', () => {
  beforeEach(() => vi.useFakeTimers())

  it('is false on mount, true after a change, and false again after the delay', () => {
    const { result, rerender } = renderHook(({ v }) => useJustChanged(v, 500), { initialProps: { v: 'open' } })
    expect(result.current).toBe(false)
    rerender({ v: 'done' })
    expect(result.current).toBe(true)
    act(() => { vi.advanceTimersByTime(499) })
    expect(result.current).toBe(true)
    act(() => { vi.advanceTimersByTime(1) })
    expect(result.current).toBe(false)
  })

  it('ignores changes the predicate rejects', () => {
    const { result, rerender } = renderHook(({ v }) => useJustChanged(v, 500, (_p, n) => n === 'done'), { initialProps: { v: 'done' } })
    rerender({ v: 'open' })
    expect(result.current).toBe(false)
    rerender({ v: 'done' })
    expect(result.current).toBe(true)
  })

  it('restarts the timer when the value changes again', () => {
    const { result, rerender } = renderHook(({ v }) => useJustChanged(v, 500), { initialProps: { v: 1 } })
    rerender({ v: 2 })
    act(() => { vi.advanceTimersByTime(400) })
    rerender({ v: 3 })
    act(() => { vi.advanceTimersByTime(400) })
    expect(result.current).toBe(true)
    act(() => { vi.advanceTimersByTime(100) })
    expect(result.current).toBe(false)
  })
})

describe('useNewlyAdded', () => {
  it('holds only keys that joined after mount, then clears', () => {
    vi.useFakeTimers()
    const { result, rerender } = renderHook(({ k }) => useNewlyAdded(k, 500), { initialProps: { k: ['a'] } })
    expect(result.current.size).toBe(0)
    rerender({ k: ['a', 'b'] })
    expect([...result.current]).toEqual(['b'])
    act(() => { vi.advanceTimersByTime(500) })
    expect(result.current.size).toBe(0)
    rerender({ k: ['b'] })
    expect(result.current.size).toBe(0)
  })
})

describe('CountBadge', () => {
  it('bumps when the count goes up, not on mount or when it goes down', () => {
    const { container, rerender } = render(<CountBadge count={2} />)
    expect(container.querySelector('.badge')!.className).toBe('badge')
    rerender(<CountBadge count={3} />)
    expect(container.querySelector('.badge')!.className).toBe('badge bump')
    rerender(<CountBadge count={1} />)
    expect(container.querySelector('.badge')!.textContent).toBe('1')
    rerender(<CountBadge count={0} />)
    expect(container.querySelector('.badge')).toBeNull()
  })
})

class FakeResizeObserver {
  observe() {}
  disconnect() {}
}

describe('Segmented', () => {
  const group = (on: 'a' | 'b') => (
    <Segmented aria-label="Pick">
      <button aria-pressed={on === 'a'}>A</button>
      <button aria-pressed={on === 'b'}>B</button>
    </Segmented>
  )

  it('stays the plain control without layout support', () => {
    render(group('a'))
    const el = screen.getByLabelText('Pick')
    expect(el.className).toBe('segmented')
    expect(el.hasAttribute('data-thumb')).toBe(false)
  })

  it('places the thumb on the pressed option and follows it', async () => {
    vi.stubGlobal('ResizeObserver', FakeResizeObserver)
    const { rerender } = render(group('a'))
    const el = screen.getByLabelText('Pick')
    const [a, b] = el.querySelectorAll('button')
    Object.defineProperty(a, 'offsetWidth', { value: 30 })
    Object.defineProperty(b, 'offsetLeft', { value: 32 })
    Object.defineProperty(b, 'offsetWidth', { value: 40 })
    rerender(group('b'))
    await waitFor(() => expect(el.style.getPropertyValue('--thumb-x')).toBe('32px'))
    expect(el.style.getPropertyValue('--thumb-w')).toBe('40px')
    expect(el.hasAttribute('data-thumb')).toBe(true)
  })
})

describe('AutoHeight', () => {
  it('sizes its box to the content when it can measure, and leaves layout alone otherwise', () => {
    const plain = render(<AutoHeight><p>x</p></AutoHeight>)
    expect((plain.container.firstChild as HTMLElement).style.height).toBe('')
    cleanup()
    vi.stubGlobal('ResizeObserver', FakeResizeObserver)
    const measured = render(<AutoHeight><p>x</p></AutoHeight>)
    expect((measured.container.firstChild as HTMLElement).style.height).toBe('0px')
  })
})

describe('useStuck', () => {
  it('marks the element only while it is pinned to the top of its scroller', () => {
    let report: (e: Partial<IntersectionObserverEntry>[]) => void = () => {}
    vi.stubGlobal('IntersectionObserver', class {
      constructor(cb: (e: Partial<IntersectionObserverEntry>[]) => void) { report = cb }
      observe() {}
      disconnect() {}
    })
    function Strip() {
      const ref = useRef<HTMLElement>(null)
      useStuck(ref)
      return <section ref={ref} aria-label="strip" />
    }
    render(<div style={{ overflowY: 'auto' }}><Strip /></div>)
    const el = screen.getByLabelText('strip')
    const root = { top: 100 } as DOMRectReadOnly
    act(() => report([{ intersectionRatio: 0.9, rootBounds: root, boundingClientRect: { top: 99 } as DOMRectReadOnly }]))
    expect(el.hasAttribute('data-stuck')).toBe(true)
    act(() => report([{ intersectionRatio: 1, rootBounds: root, boundingClientRect: { top: 160 } as DOMRectReadOnly }]))
    expect(el.hasAttribute('data-stuck')).toBe(false)
    // Cut off at the bottom of the scroller is not "stuck".
    act(() => report([{ intersectionRatio: 0.5, rootBounds: root, boundingClientRect: { top: 500 } as DOMRectReadOnly }]))
    expect(el.hasAttribute('data-stuck')).toBe(false)
  })
})

describe('dragCue', () => {
  it('fades the picked-up element only after the drag image is taken, and restores it on drop', () => {
    vi.useFakeTimers()
    render(<div data-testid="card" draggable onDragStart={dragCue.start} onDragEnd={dragCue.end}>Card</div>)
    const card = screen.getByTestId('card')
    fireEvent.dragStart(card)
    expect(card.hasAttribute('data-dragging')).toBe(false)
    act(() => { vi.advanceTimersByTime(0) })
    expect(card.hasAttribute('data-dragging')).toBe(true)
    fireEvent.dragEnd(card)
    expect(card.hasAttribute('data-dragging')).toBe(false)
  })
})

describe('useRevealOnce', () => {
  function Shot() {
    const ref = useRef<SVGSVGElement>(null)
    useRevealOnce(ref)
    return <svg ref={ref} data-testid="shot" />
  }

  it('shows the final state when it cannot tell what is on screen', () => {
    render(<Shot />)
    expect(screen.getByTestId('shot').hasAttribute('data-anim')).toBe(false)
  })

  it('arms before paint and plays once on first sight', () => {
    let report: (e: Partial<IntersectionObserverEntry>[]) => void = () => {}
    const disconnect = vi.fn()
    vi.stubGlobal('IntersectionObserver', class {
      constructor(cb: (e: Partial<IntersectionObserverEntry>[]) => void) { report = cb }
      observe() {}
      disconnect = disconnect
    })
    render(<Shot />)
    const el = screen.getByTestId('shot')
    expect(el.getAttribute('data-anim')).toBe('armed')
    act(() => report([{ isIntersecting: false }]))
    expect(el.getAttribute('data-anim')).toBe('armed')
    act(() => report([{ isIntersecting: true }]))
    expect(el.getAttribute('data-anim')).toBe('play')
    expect(disconnect).toHaveBeenCalled()
  })
})

describe('useCountUp', () => {
  it('returns the target at once when motion is unavailable', () => {
    const { result, rerender } = renderHook(({ n }) => useCountUp(n), { initialProps: { n: 10 } })
    rerender({ n: 40 })
    expect(result.current).toBe(40)
  })

  it('tweens toward the target when motion is allowed', async () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }))
    const { result, rerender } = renderHook(({ n }) => useCountUp(n, 80), { initialProps: { n: 0 } })
    rerender({ n: 50 })
    expect(result.current).toBe(0)
    await waitFor(() => expect(result.current).toBe(50))
  })
})

describe('walkthrough moments', () => {
  beforeEach(() => {
    useStore.getState().loadProject(createProject('Test', false))
    localStorage.removeItem('hohplan:walkView')
  })
  const open = () => {
    location.hash = '#/'
    render(<App />)
  }
  const first = BASE_PACK.steps[0]
  const second = BASE_PACK.steps[1]

  it('pops the check only for the step that was just finished, never on mount', () => {
    open()
    const row = screen.getByTestId(`walk-step-${first.id}`)
    expect(row.className).not.toContain('just-done')
    fireEvent.click(within(screen.getByRole('region', { name: first.title as string })).getByRole('button', { name: 'Mark done' }))
    expect(screen.getByTestId(`walk-step-${first.id}`).className).toContain('just-done')
    expect(screen.getByTestId(`walk-step-${second.id}`).className).not.toContain('just-done')
    cleanup()
    open()
    expect(screen.getByTestId(`walk-step-${first.id}`).className).not.toContain('just-done')
  })

  it('sweeps the grown phase segment and bursts a phase only when it is finished', () => {
    const concept = BASE_PACK.steps.filter((s) => s.phase === 'concept' && !s.optional)
    const last = concept[concept.length - 1]
    useStore.getState().mutate((p) => { for (const s of BASE_PACK.steps.filter((x) => x.phase === 'concept' && x.id !== last.id)) setStepManual(p, s.id, true) })
    open()
    expect(document.querySelector('.phase-track li.sweep')).toBeNull()
    expect(document.querySelector('.walk-phase.just-complete')).toBeNull()
    fireEvent.click(within(screen.getByRole('region', { name: last.title as string })).getByRole('button', { name: 'Mark done' }))
    expect(document.querySelector('.phase-track li.sweep')?.getAttribute('data-phase')).toBe('concept')
    expect(document.querySelector('.walk-phase.just-complete')?.getAttribute('data-phase')).toBe('concept')
  })

  it('draws the save tick only when the project goes from unsaved to saved', () => {
    open()
    const status = () => document.querySelector('.topbar .status')!
    expect(status().className).not.toContain('just-saved')
    act(() => useStore.getState().mutate((p) => void (p.meta.name = 'Renamed')))
    expect(status().className).toContain('dirty')
    act(() => useStore.getState().markSaved())
    expect(status().className).toContain('just-saved')
    expect(status().querySelector('.tick')).toBeTruthy()
  })

  it('lets the finished card lift away before the next one, without delaying the store', async () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }))
    open()
    fireEvent.click(within(screen.getByRole('region', { name: first.title as string })).getByRole('button', { name: 'Mark done' }))
    expect(useStore.getState().project.meta.guide?.manual).toEqual([first.id])
    const leaving = document.querySelector('.step-hero.leaving')
    expect(leaving?.getAttribute('aria-hidden')).toBe('true')
    expect(leaving?.hasAttribute('inert')).toBe(true)
    expect(await screen.findByRole('region', { name: second.title as string })).toBeTruthy()
    expect(document.querySelector('.step-hero.leaving')).toBeNull()
  })
})
