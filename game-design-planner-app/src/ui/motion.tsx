import { useLayoutEffect, useRef, type DragEvent, type HTMLAttributes, type ReactNode } from 'react'

/**
 * Native drag-and-drop cue: the picked-up element fades to an outline (`data-dragging`). Set a tick
 * later so the browser's drag image is taken from the element before it fades.
 */
export const dragCue = {
  start(e: DragEvent<HTMLElement>) {
    const el = e.currentTarget
    setTimeout(() => el.setAttribute('data-dragging', ''), 0)
  },
  end(e: DragEvent<HTMLElement>) {
    e.currentTarget.removeAttribute('data-dragging')
  },
}
import { useJustChanged } from './hooks'

/**
 * A `.segmented` group with one sliding thumb behind the pressed button. The thumb is measured
 * from the DOM (aria-pressed), so callers keep plain <button aria-pressed> children. Without
 * layout support (tests) it stays the plain control, where the pressed button paints itself.
 */
export function Segmented({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const place = () => {
      const on = el.querySelector<HTMLElement>(':scope>[aria-pressed="true"]')
      if (!on) return el.removeAttribute('data-thumb')
      el.style.setProperty('--thumb-x', `${on.offsetLeft}px`)
      el.style.setProperty('--thumb-w', `${on.offsetWidth}px`)
      el.setAttribute('data-thumb', '')
    }
    place()
    const mo = new MutationObserver(place)
    mo.observe(el, { subtree: true, attributes: true, attributeFilter: ['aria-pressed'] })
    const ro = new ResizeObserver(place)
    ro.observe(el)
    for (const b of el.children) ro.observe(b)
    return () => {
      mo.disconnect()
      ro.disconnect()
    }
  }, [])
  return <div ref={ref} className={'segmented' + (className ? ` ${className}` : '')} {...rest}>{children}</div>
}

/** Animates its height to fit its content, so swapping what is inside does not make the layout jump. */
export function AutoHeight({ children }: { children: ReactNode }) {
  const outer = useRef<HTMLDivElement>(null)
  const inner = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const o = outer.current
    const i = inner.current
    if (!o || !i || typeof ResizeObserver === 'undefined') return
    const fit = () => void (o.style.height = `${i.offsetHeight}px`)
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(i)
    // Only animate after the first fit, so the first paint is not a grow from zero.
    const raf = requestAnimationFrame(() => o.setAttribute('data-ready', ''))
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [])
  return <div ref={outer} className="auto-height"><div ref={inner} className="auto-height-inner">{children}</div></div>
}

/** A tick whose path has length 1, so CSS can draw it in with stroke-dashoffset (see hoh-draw). */
export function Tick({ size = 10 }: { size?: number }) {
  return (
    <svg className="tick" viewBox="0 0 12 12" width={size} height={size} aria-hidden="true">
      <path d="M2.5 6.3 4.9 8.6 9.5 3.6" pathLength={1} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

const grew = (prev: number, next: number) => next > prev

/** A count badge that bumps once when the count goes up (never on mount, never when it goes down). */
export function CountBadge({ count, hidden }: { count: number; hidden?: boolean }) {
  const bumped = useJustChanged(count, 360, grew)
  if (count <= 0) return null
  return <span className={'badge' + (bumped ? ' bump' : '')} aria-hidden={hidden || undefined}>{count}</span>
}
