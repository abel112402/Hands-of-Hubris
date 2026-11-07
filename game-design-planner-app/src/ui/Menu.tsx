import { useEffect, useRef, type ReactNode } from 'react'

/**
 * Dropdown built on <details>, so it works without JS focus management and stays
 * keyboard-operable. It closes after an item is chosen, on Escape (focus returns to
 * the toggle), and on a click outside.
 */
export function Menu({ label, summary, className, children }: { label: string; summary: ReactNode; className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const outside = (e: PointerEvent) => {
      if (el.open && !el.contains(e.target as Node)) el.open = false
    }
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && el.open) {
        el.open = false
        el.querySelector('summary')?.focus()
      }
    }
    document.addEventListener('pointerdown', outside)
    el.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('pointerdown', outside)
      el.removeEventListener('keydown', key)
    }
  }, [])
  return (
    <details ref={ref} className={'menu' + (className ? ` ${className}` : '')}>
      <summary aria-label={label} title={label}>{summary}</summary>
      <div
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('button,a')) ref.current!.open = false
        }}
      >
        {children}
      </div>
    </details>
  )
}
