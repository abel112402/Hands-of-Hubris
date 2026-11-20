import { create } from 'zustand'
import { useTranslation } from 'react-i18next'
import { setCompanionPinned, useCompanionPinned } from '../../core/uiMode'
import { guideOf } from '../../modules/guides'
import { AiPanel } from '../ai/AiPanel'
import { useAiUi } from '../ai/aiStore'
import { GuidePanel } from '../guides/GuidePanel'
import { HintList } from '../hints/HintPanel'
import { Icon, type IconName } from '../Icon'
import { CountBadge } from '../motion'
import { Sheet } from './Sheet'

type Tab = 'hints' | 'guide' | 'ai'

/** Whether the companion is open; which tool shows is the AI store's tab (so "Explain with AI" switches it too). */
export const useCompanion = create<{ open: boolean; show: (tab: Tab) => void; toggle: (tab: Tab) => void; close: () => void }>((set, get) => ({
  open: false,
  show: (tab) => {
    useAiUi.getState().setTab(tab)
    set({ open: true })
  },
  // The tray's buttons: the open tool's own button closes it, any other switches to that tool.
  toggle: (tab) => {
    if (get().open && useAiUi.getState().tab === tab) set({ open: false })
    else get().show(tab)
  },
  close: () => set({ open: false }),
}))

const TOOL_ICON: Record<Tab, IconName> = { hints: 'bulb', guide: 'compass', ai: 'sparkle' }

/** The tool to show: the chosen one, or the hints when the page has no guide to show. */
function useTool(docId?: string): Tab {
  const tab = useAiUi((s) => s.tab)
  return tab === 'guide' && !(docId && guideOf(docId)) ? 'hints' : tab
}

function useToolLabel() {
  const { t } = useTranslation()
  return (tab: Tab) => (tab === 'hints' ? t('nav.hints') : tab === 'guide' ? t('guide.tab') : 'AI')
}

/**
 * The companion tray (v3, plans/UI_V3_PLAN.md "Screen 4"): Hints with their count, Guide and AI, each opening
 * the companion with that one tool. Hints and AI work everywhere; the Guide only on a planner that has one.
 */
export function CompanionTray({ docId, hintCount }: { docId?: string; hintCount: number }) {
  const { t } = useTranslation()
  const open = useCompanion((s) => s.open)
  const toggle = useCompanion((s) => s.toggle)
  const tool = useTool(docId)
  const label = useToolLabel()
  const item = (id: Tab, badge?: number) => (
    <button
      key={id}
      type="button"
      className={'tray3-item' + (open && tool === id ? ' on' : '')}
      title={label(id)}
      aria-label={badge !== undefined ? `${label(id)}: ${t('hints.projectWide', { count: badge })}` : label(id)}
      aria-pressed={open && tool === id}
      onClick={() => toggle(id)}
    >
      <Icon name={TOOL_ICON[id]} />
      {!!badge && <CountBadge count={badge} />}
    </button>
  )
  return (
    <aside className="tray3" aria-label={t('v3.companion')}>
      {item('hints', hintCount)}
      {docId && guideOf(docId) && item('guide')}
      {item('ai')}
    </aside>
  )
}

/** The one tool the companion shows. */
function CompanionTool({ tool, docId, sectionId }: { tool: Tab; docId?: string; sectionId?: string }) {
  const guide = docId ? guideOf(docId) : undefined
  return (
    // .hint-panel keeps the hint cards' and the guide's own layout rules.
    <div className={'hint-panel embedded companion3-tool ' + tool}>
      {tool === 'ai' ? <AiPanel docId={docId} sectionId={sectionId} />
        : tool === 'guide' && docId && guide ? <GuidePanel docId={docId} guide={guide} />
        : <HintList docId={docId} sectionId={sectionId} />}
    </div>
  )
}

/**
 * The companion itself: one tool (the page's hints, its planner guide, or AI), titled after it. An overlay sheet
 * by default; pinned on a wide screen it docks as a column beside the page, with the tray still beside it.
 */
export function CompanionPanel({ docId, sectionId, docked, canPin }: { docId?: string; sectionId?: string; docked: boolean; canPin: boolean }) {
  const { t } = useTranslation()
  const close = useCompanion((s) => s.close)
  const pinned = useCompanionPinned()
  const tool = useTool(docId)
  const name = useToolLabel()(tool)
  const title = <span className="companion3-title"><Icon name={TOOL_ICON[tool]} />{name}</span>
  const pin = canPin && (
    <button type="button" className="icon-btn" aria-pressed={pinned} aria-label={t(pinned ? 'v3.companionPanel.unpin' : 'v3.companionPanel.pin')} title={t(pinned ? 'v3.companionPanel.unpin' : 'v3.companionPanel.pin')} onClick={() => setCompanionPinned(!pinned)}>
      <Icon name="panel" />
    </button>
  )
  if (!docked)
    return (
      // Beside the tray, under the command bar, so another tool (or the same one, to close) is one click away.
      <Sheet label={name} title={title} width={400} onClose={close} actions={pin} layerClassName="companion3-layer">
        <CompanionTool tool={tool} docId={docId} sectionId={sectionId} />
      </Sheet>
    )
  return (
    <section className="companion3" aria-label={name}>
      <header className="sheet-head">
        <div className="sheet-titles"><h2 className="sheet-title">{title}</h2></div>
        {pin}
        <button type="button" className="icon-btn" aria-label={t('v3.sheet.close')} title={t('v3.sheet.close')} onClick={close}><Icon name="close" /></button>
      </header>
      <div className="companion3-body">
        <CompanionTool tool={tool} docId={docId} sectionId={sectionId} />
      </div>
    </section>
  )
}
