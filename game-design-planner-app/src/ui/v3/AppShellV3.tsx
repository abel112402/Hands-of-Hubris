import { useMemo, useState, useSyncExternalStore } from 'react'
import { Link, matchPath, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { HintPanel } from '../hints/HintPanel'
import { Sheet } from './Sheet'
import { useTranslation } from 'react-i18next'
import { useStore } from '../../core/store/store'
import { validateProject } from '../../core/references/refs'
import { setThemePref, useTheme } from '../../core/theme'
import { setUiVersion } from '../../core/uiVersion'
import { shellColumns, shellLayout } from '../../core/shellLayout'
import { useCloud } from '../../core/cloud/session'
import { useHints } from '../hints/useHints'
import { SETTINGS_TABS } from '../settings/SettingsPage'
import { SaveMenu, SaveStatus, useShellEffects } from '../AppShell'
import { newProject, saveProject } from '../actions'
import { CloudBanners, CloudSaveStatus } from '../cloud/CloudBanners'
import { BrandMark } from '../BrandMark'
import { Icon, type IconName } from '../Icon'
import { CountBadge } from '../motion'
import { FlavorToast } from '../flavor/moments'
import { CommandPalette, type PaletteExtra } from './CommandPalette'
import { PhaseCompass } from './PhaseCompass'
import { Breadcrumb } from './Breadcrumb'
import { NextStepPill, StepButton, useNextStep } from './NextStep'
import { useShortcuts } from './shortcuts'

const subscribeResize = (l: () => void) => {
  window.addEventListener('resize', l)
  return () => window.removeEventListener('resize', l)
}
/** The window's width; layout decisions read it so the budget is the same function the tests check. */
const useViewportWidth = () => useSyncExternalStore(subscribeResize, () => window.innerWidth, () => 1440)

/** A labelled rail item: line icon with a short label under it (prototype review: no unlabeled glyphs). */
function RailLink({ to, icon, label, end, badge }: { to: string; icon: IconName; label: string; end?: boolean; badge?: number }) {
  return (
    <NavLink to={to} end={end} className="rail3-item" title={label}>
      <span className="rail3-icon"><Icon name={icon} />{!!badge && <CountBadge count={badge} />}</span>
      <span className="rail3-label">{label}</span>
    </NavLink>
  )
}

/**
 * The v3 workspace frame (plans/UI_V3_PLAN.md, Phase 0): a one-line command bar, a labelled rail on the left,
 * the page in the middle and the companion tray on the right, sized by `shellLayout` so the page keeps the
 * width. Pages render unchanged inside it until Phase 1 gives them the new editor frame.
 */
export function AppShellV3() {
  const { t, i18n } = useTranslation()
  const nav = useNavigate()
  const project = useStore((s) => s.project)
  const dirty = useStore((s) => s.dirty)
  const fileName = useStore((s) => s.fileName)
  const readOnly = useStore((s) => s.readOnly)
  const canUndo = useStore((s) => s.past.length > 0)
  const canRedo = useStore((s) => s.future.length > 0)
  const cloudActive = useCloud((s) => !!s.active)
  const theme = useTheme()
  const [palette, setPalette] = useState(false)
  const [hintsOpen, setHintsOpen] = useState(false)
  useShellEffects(() => setPalette(true))
  // On a planner page the tray's Hints open that planner's hints; elsewhere they lead to the Hints settings.
  const loc = useLocation()
  const docId = matchPath('/doc/:docId', loc.pathname)?.params.docId
  const search = new URLSearchParams(loc.search)
  const sectionId = search.get('s') ?? undefined
  const entityId = search.get('r') ?? search.get('e') ?? undefined
  const nextStep = useNextStep(docId, sectionId)
  useShortcuts({ docId, sectionId, nextLink: nextStep?.link, openPalette: () => setPalette(true), openHints: () => (docId ? setHintsOpen(true) : nav('/settings/hints')) })
  const layout = shellLayout(useViewportWidth())
  const issues = validateProject(project).length
  const hintCount = useHints().total
  const nextTheme = theme === 'dark' ? 'light' : 'dark'
  const themeLabel = t(nextTheme === 'light' ? 'v3.theme.toLight' : 'v3.theme.toDark')

  // Pages and actions the palette offers beside the project's planners, sections and entries.
  const extras = useMemo<PaletteExtra[]>(() => [
    { id: 'page:home', kind: 'page', label: t('nav.home'), to: '/', icon: 'compass' },
    { id: 'page:issues', kind: 'page', label: t('nav.issues'), to: '/issues', icon: 'warning' },
    ...SETTINGS_TABS.map((id): PaletteExtra => ({ id: `page:settings/${id}`, kind: 'page', label: `${t('settingsPage.title')}: ${t(`settingsPage.tabs.${id}`)}`, to: `/settings/${id}`, icon: 'settings' })),
    { id: 'act:theme', kind: 'action', label: themeLabel, run: () => setThemePref(nextTheme), icon: nextTheme === 'light' ? 'sun' : 'moon' },
    { id: 'act:classic', kind: 'action', label: t('v3.useClassic'), run: () => setUiVersion('v2'), icon: 'monitor' },
    { id: 'act:undo', kind: 'action', label: t('actions.undo'), run: () => useStore.getState().undo(), icon: 'undo' },
    { id: 'act:redo', kind: 'action', label: t('actions.redo'), run: () => useStore.getState().redo(), icon: 'redo' },
    { id: 'act:save', kind: 'action', label: t('actions.save'), run: () => void saveProject(), icon: 'save' },
    { id: 'act:new', kind: 'action', label: t('actions.new'), run: newProject, icon: 'file' },
    // The labels follow the language; rebuild when it changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [t, i18n.language, themeLabel, nextTheme])

  const rail = (
    <>
      <RailLink to="/" end icon="compass" label={t('v3.rail.atlas')} />
      <span className="rail3-sep" aria-hidden="true" />
      <PhaseCompass docId={docId} />
      <span className="rail3-spacer" />
      <RailLink to="/issues" icon="warning" label={t('nav.issues')} badge={issues} />
      <RailLink to="/settings" icon="settings" label={t('nav.settings')} />
    </>
  )

  return (
    <div className={'shell3' + (layout.compact ? ' compact' : '')}>
      <header className="bar3">
        <Link to="/" className="brand" title={t('nav.home')} aria-label={t('nav.home')}><BrandMark /></Link>
        <input className="bar3-name" aria-label={t('app.projectName')} value={project.meta.name} readOnly={readOnly}
          onChange={(e) => useStore.getState().mutate((p) => void (p.meta.name = e.target.value), 'name')} />
        {cloudActive ? <CloudSaveStatus /> : <SaveStatus dirty={dirty} fileName={fileName} />}
        <span className="bar3-divider" aria-hidden="true" />
        <Breadcrumb docId={docId} sectionId={sectionId} entityId={entityId} />
        <span className="bar3-spacer" />
        <StepButton docId={docId} sectionId={sectionId} />
        <button type="button" className="bar3-search" onClick={() => setPalette(true)} aria-label={t('v3.palette.open')}>
          <Icon name="search" /><span>{t('v3.palette.button')}</span><kbd>Ctrl K</kbd>
        </button>
        <button type="button" className="icon-btn" disabled={!canUndo} aria-label={t('actions.undo')} title={`${t('actions.undo')} (Ctrl+Z)`} onClick={() => useStore.getState().undo()}><Icon name="undo" /></button>
        <button type="button" className="icon-btn" disabled={!canRedo} aria-label={t('actions.redo')} title={`${t('actions.redo')} (Ctrl+Y)`} onClick={() => useStore.getState().redo()}><Icon name="redo" /></button>
        <button type="button" className="icon-btn bar3-theme" aria-label={themeLabel} title={themeLabel} onClick={() => setThemePref(nextTheme)}>
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
        </button>
        <SaveMenu extra={<><hr /><button onClick={() => setUiVersion('v2')}>{t('v3.useClassic')}</button></>} />
      </header>
      <CloudBanners />
      <div className="body3" style={{ gridTemplateColumns: shellColumns(layout) }}>
        {!layout.compact && <nav className="rail3" aria-label={t('nav.main')}>{rail}</nav>}
        <main className="surface3 shell-body"><Outlet /><NextStepPill docId={docId} sectionId={sectionId} /></main>
        {!layout.compact && (
          <aside className="tray3" aria-label={t('v3.companion')}>
            <button type="button" className="tray3-item" title={t('nav.hints')} aria-label={`${t('nav.hints')}: ${t('hints.projectWide', { count: hintCount })}`} onClick={() => (docId ? setHintsOpen(true) : nav('/settings/hints'))}>
              <Icon name="bulb" />{!!hintCount && <CountBadge count={hintCount} />}
            </button>
          </aside>
        )}
      </div>
      {layout.compact && <nav className="rail3 bottom" aria-label={t('nav.main')}>{rail}</nav>}
      {palette && <CommandPalette extras={extras} onClose={() => setPalette(false)} />}
      {hintsOpen && docId && (
        <Sheet label={t('nav.hints')} title={t('nav.hints')} width={400} onClose={() => setHintsOpen(false)}>
          <HintPanel docId={docId} sectionId={sectionId} />
        </Sheet>
      )}
      <FlavorToast />
    </div>
  )
}
