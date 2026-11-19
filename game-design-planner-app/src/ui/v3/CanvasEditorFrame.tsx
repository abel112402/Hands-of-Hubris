import type { ReactNode, Ref } from 'react'
import { useTranslation } from 'react-i18next'
import { Icon } from '../Icon'

export type FrameTab = { id: string; label: string; disabled?: boolean }

/**
 * The shared layout of canvas-style editors (plans/UI_V3_PLAN.md, "Shared canvas pattern"), first used by the
 * Locations map editor: a one-row command bar, an optional tool rail, the canvas, and a tabbed side panel,
 * with buttons to hide the panel and to go full screen. Purely presentational: the editor owns the state
 * (which tab, panel open, full screen) and the content of every part.
 */
export function CanvasEditorFrame({
  toolbar,
  rail,
  railLabel,
  canvas,
  panel,
  panelScrollRef,
  panelOpen,
  onPanelOpen,
  full,
  onFull,
}: {
  /** The command bar's own content; the frame adds the panel and full-screen buttons at its end. */
  toolbar: ReactNode
  /** Tool buttons for the vertical rail; none = no rail column. */
  rail?: ReactNode
  railLabel?: string
  canvas: ReactNode
  /** The side panel: tabs, the active one, and its content (in a scroll box the editor can hold a ref to). */
  panel?: { label: string; tabs: FrameTab[]; active: string; onTab: (id: string) => void; content: ReactNode }
  /** The panel's scroll box, for editors that scroll it (e.g. to the selection). */
  panelScrollRef?: Ref<HTMLDivElement>
  panelOpen: boolean
  onPanelOpen: (open: boolean) => void
  full: boolean
  onFull: (full: boolean) => void
}) {
  const { t } = useTranslation()
  const showPanel = !!panel && panelOpen
  const columns = [rail && 'var(--cframe-rail)', 'minmax(0,1fr)', showPanel && 'var(--cframe-panel)'].filter(Boolean).join(' ')
  const panelLabel = t(panelOpen ? 'v3.frame.hidePanel' : 'v3.frame.showPanel')
  return (
    <div className={'cframe' + (full ? ' full' : '')}>
      <div className="cframe-bar">
        {toolbar}
        <span className="cframe-sep" />
        {panel && (
          <button type="button" className="cframe-icon-btn" aria-pressed={panelOpen} aria-label={panelLabel} title={panelLabel} onClick={() => onPanelOpen(!panelOpen)}>
            <Icon name="panel" />
          </button>
        )}
        <button type="button" className="cframe-icon-btn" aria-pressed={full} aria-label={t(full ? 'v3.frame.exitFull' : 'v3.frame.full')} title={t(full ? 'v3.frame.exitFullKey' : 'v3.frame.full')} onClick={() => onFull(!full)}>
          <Icon name={full ? 'shrink' : 'expand'} />
        </button>
      </div>
      <div className="cframe-body" style={{ gridTemplateColumns: columns }}>
        {rail && (
          <div className="cframe-rail" role="toolbar" aria-label={railLabel} aria-orientation="vertical">
            {rail}
          </div>
        )}
        <div className="cframe-canvas">{canvas}</div>
        {showPanel && (
          <div className="cframe-side">
            <div className="cframe-tabs" role="tablist" aria-label={panel.label}>
              {panel.tabs.map((x) => (
                <button key={x.id} type="button" role="tab" aria-selected={panel.active === x.id} disabled={x.disabled} onClick={() => panel.onTab(x.id)}>
                  {x.label}
                </button>
              ))}
            </div>
            <div ref={panelScrollRef} className="cframe-side-scroll">
              {panel.content}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
