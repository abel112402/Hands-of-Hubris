import { create } from 'zustand'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { setCompanionPinned, useCompanionPinned } from '../../core/uiMode'
import { guideOf } from '../../modules/guides'
import { useAiUi } from '../ai/aiStore'
import { HintPanel } from '../hints/HintPanel'
import { Icon, type IconName } from '../Icon'
import { CountBadge } from '../motion'
import { Sheet } from './Sheet'

type Tab = 'hints' | 'guide' | 'ai'

/** Whether the companion is open; which tab shows is the AI store's (so "Explain with AI" switches it too). */
export const useCompanion = create<{ open: boolean; show: (tab: Tab) => void; close: () => void }>((set) => ({
  open: false,
  show: (tab) => {
    useAiUi.getState().setTab(tab)
    set({ open: true })
  },
  close: () => set({ open: false }),
}))

/**
 * The companion tray (v3, plans/UI_V3_PLAN.md "Screen 4"): Hints with their count, Guide and AI, each opening
 * the companion on its tab. Away from a planner, Hints lead to the Hints settings and the others hide.
 */
export function CompanionTray({ docId, hintCount }: { docId?: string; hintCount: number }) {
  const { t } = useTranslation()
  const nav = useNavigate()
  const open = useCompanion((s) => s.open)
  const tab = useAiUi((s) => s.tab)
  const show = useCompanion((s) => s.show)
  const item = (id: Tab, icon: IconName, label: string, badge?: number) => (
    <button
      key={id}
      type="button"
      className={'tray3-item' + (open && tab === id ? ' on' : '')}
      title={label}
      aria-label={badge !== undefined ? `${label}: ${t('hints.projectWide', { count: badge })}` : label}
      aria-pressed={open && tab === id}
      onClick={() => (docId ? show(id) : nav('/settings/hints'))}
    >
      <Icon name={icon} />
      {!!badge && <CountBadge count={badge} />}
    </button>
  )
  return (
    <aside className="tray3" aria-label={t('v3.companion')}>
      {item('hints', 'bulb', t('nav.hints'), hintCount)}
      {docId && guideOf(docId) && item('guide', 'compass', t('guide.tab'))}
      {docId && item('ai', 'sparkle', 'AI')}
    </aside>
  )
}

/**
 * The companion itself: the page's hints, its planner guide and AI in one panel. An overlay sheet by default;
 * pinned on a wide screen it docks as a column beside the page instead.
 */
export function CompanionPanel({ docId, sectionId, docked, canPin }: { docId: string; sectionId?: string; docked: boolean; canPin: boolean }) {
  const { t } = useTranslation()
  const close = useCompanion((s) => s.close)
  const pinned = useCompanionPinned()
  const pin = canPin && (
    <button type="button" className="icon-btn" aria-pressed={pinned} aria-label={t(pinned ? 'v3.companionPanel.unpin' : 'v3.companionPanel.pin')} title={t(pinned ? 'v3.companionPanel.unpin' : 'v3.companionPanel.pin')} onClick={() => setCompanionPinned(!pinned)}>
      <Icon name="panel" />
    </button>
  )
  if (!docked)
    return (
      <Sheet label={t('v3.companion')} title={t('v3.companion')} width={400} onClose={close} actions={pin}>
        <HintPanel docId={docId} sectionId={sectionId} embedded />
      </Sheet>
    )
  return (
    <aside className="companion3" aria-label={t('v3.companion')}>
      <header className="sheet-head">
        <div className="sheet-titles"><h2 className="sheet-title">{t('v3.companion')}</h2></div>
        {pin}
        <button type="button" className="icon-btn" aria-label={t('v3.sheet.close')} title={t('v3.sheet.close')} onClick={close}><Icon name="close" /></button>
      </header>
      <div className="companion3-body">
        <HintPanel docId={docId} sectionId={sectionId} embedded />
      </div>
    </aside>
  )
}
