import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { readAutosave } from '../../core/persistence/autosave'
import { useCloud } from '../../core/cloud/session'
import { useStore } from '../../core/store/store'
import { restoreAutosave } from '../actions'
import { GenreSummary, useGenreNames } from '../genres/GenreProfilePanel'
import { EditorRail } from '../workspace/EditorRail'
import { GuideCenter } from '../workspace/GuideCenter'
import { ProgressPanel, ProgressStrip } from '../workspace/ProgressPanel'
import { useWalkthrough } from '../workspace/useWalkthrough'
import { Icon } from '../Icon'
import { Greeting } from '../flavor/easter'

const formatEdited = (iso: string, lang: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(lang, { dateStyle: 'medium', timeStyle: 'short' })
}

/** Moves focus after a drawer opens or closes (next frame, once the drawer is rendered or hidden). */
const focusLater = (get: () => HTMLElement | null | undefined) => requestAnimationFrame(() => get()?.focus())

/**
 * Workspace home, in three panes: planners on the left, the walkthrough (with hints and AI) in the
 * center as the focus, and planning progress on the right. Below 1200px the progress pane becomes a
 * one-line strip in the center with a drawer for details. See plans/WORKSPACE_LANDING_REDESIGN_PLAN.md.
 */
export function Home() {
  const { t, i18n } = useTranslation()
  // The local autosave banner belongs to local mode; cloud projects recover from their own drafts.
  const cloudActive = useCloud((s) => !!s.active)
  const name = useStore((s) => s.project.meta.name)
  const updatedAt = useStore((s) => s.project.meta.updatedAt)
  const createdAt = useStore((s) => s.project.meta.createdAt)
  const genresSet = !!useGenreNames()
  const [auto, setAuto] = useState<string | null>(null)
  const [railOpen, setRailState] = useState(false)
  const [progressOpen, setProgressState] = useState(false)
  const drawerBtn = useRef<HTMLButtonElement>(null)
  const detailsBtn = useRef<HTMLButtonElement>(null)
  const setRailOpen = (open: boolean) => {
    setRailState(open)
    // Opening focuses the filter; closing returns focus to the button that opened it.
    focusLater(() =>
      open
        ? document.querySelector<HTMLInputElement>('#workspace-rail .rail-filter')
        : getComputedStyle(drawerBtn.current ?? document.body).display !== 'none' ? drawerBtn.current : null,
    )
  }
  const setProgressOpen = (open: boolean) => {
    setProgressState(open)
    focusLater(() => (open ? document.querySelector<HTMLElement>('#workspace-progress .drawer-close') : detailsBtn.current))
  }
  const view = useWalkthrough()
  useEffect(() => {
    void readAutosave().then((a) => setAuto(a ? new Date(a.savedAt).toLocaleString() : null))
  }, [])
  // A freshly created project has never been edited, so it shows no date (its timestamps are equal).
  const edited = updatedAt !== createdAt ? formatEdited(updatedAt, i18n.language) : ''

  return (
    <div className={'workspace' + (railOpen ? ' rail-open' : '') + (progressOpen ? ' progress-open' : '')}>
      <div className="workspace-rail" id="workspace-rail" onKeyDown={(e) => e.key === 'Escape' && setRailOpen(false)}>
        <EditorRail onNavigate={() => setRailOpen(false)} />
      </div>
      {railOpen && <div className="rail-backdrop" aria-hidden="true" onClick={() => setRailOpen(false)} />}
      <main className="workspace-center">
        <header className="workspace-intro">
          {/* Narrow screens: the planner list is a drawer. */}
          <button ref={drawerBtn} className="rail-drawer-btn" aria-expanded={railOpen} aria-controls="workspace-rail" onClick={() => setRailOpen(!railOpen)}>
            <Icon name="file" /> {t('workspace.planners')}
          </button>
          <p className="eyebrow">{t('workspace.eyebrow')}</p>
          <h1>{name || t('app.projectName')}</h1>
          <Greeting />
          <div className="intro-meta">
            {genresSet && <GenreSummary />}
            {edited && <span className="muted">{t('workspace.edited', { when: edited })}</span>}
          </div>
          <p className="muted intro-goal">{t('workspace.subtitle')}</p>
        </header>
        <ProgressStrip view={view} open={progressOpen} detailsRef={detailsBtn} onOpen={() => setProgressOpen(true)} />
        {auto && !cloudActive && (
          <div className="banner" role="status">
            <span>{t('home.restoreBanner', { date: auto })}</span>
            <button onClick={() => void restoreAutosave()}>{t('actions.restore')}</button>
            <span className="spacer" />
            <button className="banner-close" aria-label={t('home.closeBanner')} title={t('home.closeBanner')} onClick={() => setAuto(null)}>×</button>
          </div>
        )}
        <GuideCenter view={view} setup={genresSet ? undefined : <GenreSummary />} />
      </main>
      {progressOpen && <div className="progress-backdrop" aria-hidden="true" onClick={() => setProgressOpen(false)} />}
      <div id="workspace-progress" className="workspace-progress" onKeyDown={(e) => e.key === 'Escape' && progressOpen && setProgressOpen(false)}>
        <ProgressPanel view={view} onClose={progressOpen ? () => setProgressOpen(false) : undefined} />
      </div>
    </div>
  )
}
