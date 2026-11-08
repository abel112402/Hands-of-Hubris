import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { readAutosave } from '../../core/persistence/autosave'
import { useCloud } from '../../core/cloud/session'
import { restoreAutosave } from '../actions'
import { GenreSummary } from '../genres/GenreProfilePanel'
import { EditorRail } from '../workspace/EditorRail'
import { GuideCenter } from '../workspace/GuideCenter'
import { ProgressPanel } from '../workspace/ProgressPanel'
import { useWalkthrough } from '../workspace/useWalkthrough'
import { Icon } from '../Icon'

/**
 * Workspace home, in three panes: planners on the left, the walkthrough (with hints and AI) in the
 * center as the focus, and planning progress on the right. See plans/GUIDED_WORKSPACE_PLAN.md §7.
 */
export function Home() {
  const { t } = useTranslation()
  // The local autosave banner belongs to local mode; cloud projects recover from their own drafts.
  const cloudActive = useCloud((s) => !!s.active)
  const [auto, setAuto] = useState<string | null>(null)
  const [railOpen, setRailState] = useState(false)
  const drawerBtn = useRef<HTMLButtonElement>(null)
  const setRailOpen = (open: boolean) => {
    setRailState(open)
    // Opening focuses the filter; closing returns focus to the button that opened it.
    requestAnimationFrame(() => {
      if (open) document.querySelector<HTMLInputElement>('#workspace-rail .rail-filter')?.focus()
      else if (getComputedStyle(drawerBtn.current ?? document.body).display !== 'none') drawerBtn.current?.focus()
    })
  }
  const view = useWalkthrough()
  useEffect(() => {
    void readAutosave().then((a) => setAuto(a ? new Date(a.savedAt).toLocaleString() : null))
  }, [])

  return (
    <div className={'workspace' + (railOpen ? ' rail-open' : '')}>
      <div className="workspace-rail" id="workspace-rail" onKeyDown={(e) => e.key === 'Escape' && setRailOpen(false)}>
        <EditorRail onNavigate={() => setRailOpen(false)} />
      </div>
      {railOpen && <div className="rail-backdrop" aria-hidden="true" onClick={() => setRailOpen(false)} />}
      <main className="workspace-center">
        <div className="workspace-intro">
          {/* Narrow screens: the planner list is a drawer. */}
          <button ref={drawerBtn} className="rail-drawer-btn" aria-expanded={railOpen} aria-controls="workspace-rail" onClick={() => setRailOpen(!railOpen)}>
            <Icon name="file" /> {t('workspace.planners')}
          </button>
          <h1>{t('home.title')}</h1>
          <p className="muted">{t('workspace.subtitle')}</p>
        </div>
        {auto && !cloudActive && (
          <div className="banner" role="status">
            <span>{t('home.restoreBanner', { date: auto })}</span>
            <button onClick={() => void restoreAutosave()}>{t('actions.restore')}</button>
            <span className="spacer" />
            <button className="banner-close" aria-label={t('home.closeBanner')} title={t('home.closeBanner')} onClick={() => setAuto(null)}>×</button>
          </div>
        )}
        <GenreSummary />
        <GuideCenter view={view} />
      </main>
      <ProgressPanel view={view} />
    </div>
  )
}
