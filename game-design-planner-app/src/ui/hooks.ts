import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { useStore } from '../core/store/store'

/** Read/write access to one section of a document. */
export function useSection<T = any>(docId: string, sectionId: string) {
  const data = useStore((s) => s.project.documents[docId]?.data[sectionId]) as T | undefined
  const mutate = useStore((s) => s.mutate)
  const update = useCallback(
    (fn: (draft: T) => void, key?: string) =>
      mutate((p) => {
        const d = p.documents[docId]?.data
        if (d && d[sectionId] !== undefined) fn(d[sectionId])
      }, key),
    [mutate, docId, sectionId],
  )
  const set = useCallback(
    (value: T, key?: string) =>
      mutate((p) => {
        const d = p.documents[docId]?.data
        if (d) d[sectionId] = value
      }, key),
    [mutate, docId, sectionId],
  )
  return { data, update, set }
}

export const useProject = () => useStore((s) => s.project)

/** False where motion is unwanted: the user asked for less, or there is no media query support (tests). */
export function prefersMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * True for `ms` after `value` changes (and `when(prev, next)` holds), false on the first render,
 * so a page that mounts in a finished state never plays its "just finished" animation.
 */
export function useJustChanged<T>(value: T, ms = 600, when: (prev: T, next: T) => boolean = () => true): boolean {
  const [prev, setPrev] = useState(value)
  const [tick, setTick] = useState(0)
  const [active, setActive] = useState(false)
  if (!Object.is(prev, value)) {
    setPrev(value)
    if (when(prev, value)) {
      setActive(true)
      setTick(tick + 1)
    }
  }
  useEffect(() => {
    if (!tick) return
    const id = setTimeout(() => setActive(false), ms)
    return () => clearTimeout(id)
  }, [tick, ms])
  return active
}

/**
 * Sets `data-stuck` on a `position: sticky` element while it is pinned to the top of its scroll
 * container, so CSS can give it an edge. A DOM attribute, not state: it changes on scroll.
 */
export function useStuck(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    let root: HTMLElement | null = el.parentElement
    while (root && !/(auto|scroll)/.test(getComputedStyle(root).overflowY)) root = root.parentElement
    // Pinned means the element sits right at (or 1px past) the top of the scrollport.
    const io = new IntersectionObserver(([e]) => {
      const top = e.rootBounds?.top ?? 0
      el.toggleAttribute('data-stuck', e.intersectionRatio < 1 && e.boundingClientRect.top <= top + 1)
    }, { root, rootMargin: '-1px 0px 0px 0px', threshold: [1] })
    io.observe(el)
    return () => io.disconnect()
  }, [ref])
}

/**
 * One-shot reveal: `data-anim="armed"` before the first paint (CSS holds paused animations at their
 * start), then `"play"` the first time a third of the element is on screen. Without
 * IntersectionObserver nothing is set, so the element simply shows its final state.
 */
export function useRevealOnce(ref: RefObject<Element | null>) {
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    el.setAttribute('data-anim', 'armed')
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return
      el.setAttribute('data-anim', 'play')
      io.disconnect()
    }, { threshold: 0.35 })
    io.observe(el)
    return () => io.disconnect()
  }, [ref])
}

const NONE: ReadonlySet<string> = new Set()

/**
 * Keys that joined `keys` since the last render, held for `ms`. Empty on mount, so what is
 * already there never counts as new. For lists, where a hook per item is not possible.
 */
export function useNewlyAdded(keys: readonly string[], ms = 900): ReadonlySet<string> {
  const sig = keys.join('\n')
  const [prev, setPrev] = useState(sig)
  const [fresh, setFresh] = useState(NONE)
  if (prev !== sig) {
    setPrev(sig)
    const before = new Set(prev ? prev.split('\n') : [])
    const added = keys.filter((k) => !before.has(k))
    if (added.length) setFresh(new Set(added))
  }
  useEffect(() => {
    if (!fresh.size) return
    const id = setTimeout(() => setFresh(NONE), ms)
    return () => clearTimeout(id)
  }, [fresh, ms])
  return fresh
}

/** Tweens a displayed number toward `target` (ease-out cubic); jumps straight there without motion. */
export function useCountUp(target: number, ms = 420): number {
  const [shown, setShown] = useState(target)
  const current = useRef(target)
  useEffect(() => {
    const from = current.current
    if (from === target) return
    if (!canAnimate()) {
      current.current = target
      return
    }
    // Start from the first frame's own timestamp: rAF time and performance.now() can disagree.
    let t0 = -1
    let raf = 0
    const step = (now: number) => {
      if (t0 < 0) t0 = now
      const k = Math.min(1, Math.max(0, (now - t0) / ms))
      const v = Math.round(from + (target - from) * (1 - (1 - k) ** 3))
      current.current = v
      setShown(v)
      if (k < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target, ms])
  return canAnimate() ? shown : target
}

const canAnimate = () => prefersMotion() && typeof requestAnimationFrame === 'function'
