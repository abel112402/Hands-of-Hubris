import { useEffect, useRef, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Icon } from '../Icon'

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * A panel that slides in from the right (v3: record sheet, companion, object inspector). `overlay` floats over
 * the page with a scrim, traps focus and is a modal dialog; `split` sits beside the page as a region. Both close
 * on Escape and give focus back to whatever had it before the sheet opened.
 */
export function Sheet({
  label,
  title,
  eyebrow,
  onClose,
  onPrev,
  onNext,
  prevLabel,
  nextLabel,
  actions,
  footer,
  mode = 'overlay',
  width = 480,
  children,
}: {
  /** Accessible name of the sheet. */
  label: string
  title: ReactNode
  /** Small line above the title (type, position "3 of 6"). */
  eyebrow?: ReactNode
  onClose: () => void
  /** Step to the previous / next item; the buttons show only when given. */
  onPrev?: () => void
  onNext?: () => void
  prevLabel?: string
  nextLabel?: string
  /** Extra header buttons, before Previous / Next / Close. */
  actions?: ReactNode
  footer?: ReactNode
  mode?: 'overlay' | 'split'
  /** Pixels, or any CSS width (a record page uses 100%). */
  width?: number | string
  children: ReactNode
}) {
  const { t } = useTranslation()
  const ref = useRef<HTMLElement>(null)
  const close = useRef(onClose)
  useEffect(() => {
    close.current = onClose
  })

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null
    const el = ref.current
    // The first field or button inside, else the sheet itself.
    ;(el?.querySelector<HTMLElement>('.sheet-body ' + FOCUSABLE.split(', ').join(', .sheet-body ')) ?? el)?.focus()
    return () => {
      if (before?.isConnected) before.focus()
    }
  }, [])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      close.current()
      return
    }
    if (e.key !== 'Tab' || mode !== 'overlay' || !ref.current) return
    const items = Array.from(ref.current.querySelectorAll<HTMLElement>(FOCUSABLE))
    if (!items.length) return
    const first = items[0]
    const last = items[items.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  const sheet = (
    <aside
      ref={ref}
      className={'sheet3 ' + mode}
      style={{ width }}
      tabIndex={-1}
      role={mode === 'overlay' ? 'dialog' : 'region'}
      aria-modal={mode === 'overlay' ? true : undefined}
      aria-label={label}
      onKeyDown={onKeyDown}
    >
      <header className="sheet-head">
        <div className="sheet-titles">
          {eyebrow && <div className="eyebrow">{eyebrow}</div>}
          <h2 className="sheet-title">{title}</h2>
        </div>
        {actions}
        {onPrev && (
          <button type="button" className="icon-btn" aria-label={prevLabel ?? t('v3.sheet.prev')} title={prevLabel ?? t('v3.sheet.prev')} onClick={onPrev}>
            <Icon name="chevronLeft" />
          </button>
        )}
        {onNext && (
          <button type="button" className="icon-btn" aria-label={nextLabel ?? t('v3.sheet.next')} title={nextLabel ?? t('v3.sheet.next')} onClick={onNext}>
            <Icon name="chevronRight" />
          </button>
        )}
        <button type="button" className="icon-btn" aria-label={t('v3.sheet.close')} title={`${t('v3.sheet.close')} (Esc)`} onClick={onClose}>
          <Icon name="close" />
        </button>
      </header>
      <div className="sheet-body">{children}</div>
      {footer && <footer className="sheet-foot">{footer}</footer>}
    </aside>
  )
  if (mode === 'split') return sheet
  return (
    <div className="sheet3-layer">
      {/* Clicking beside the sheet closes it; keyboard users have Escape and the Close button. */}
      <div className="sheet3-scrim" aria-hidden="true" onClick={onClose} />
      {sheet}
    </div>
  )
}
