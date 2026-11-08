import { useEffect, useState, type ReactNode } from 'react'
import { NavLink, Navigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { setLanguage } from '../../core/i18n'
import { useStore } from '../../core/store/store'
import { useCloud } from '../../core/cloud/session'
import { deleteSnapshot, listSnapshots, type Snapshot } from '../../core/persistence/autosave'
import { deserializeProject } from '../../core/persistence/serialize'
import { createSnapshot, downloadJson, exportMarkdownZip } from '../actions'
import { GenreProfilePanel } from '../genres/GenreProfilePanel'
import { HintsPage } from '../hints/HintsPage'
import { AiSettings } from '../ai/AiSettings'
import { Definitions } from '../pages/Definitions'
import { ProjectSettings } from '../cloud/ProjectSettings'
import { WalkthroughSettings } from './WalkthroughSettings'

/**
 * Every project setting in one place. Each tab reuses the existing page or panel, so behaviour and
 * tests stay with those components; this page only adds navigation. Add a tab = one entry in TABS.
 */
type Tab = { id: string; render: () => ReactNode; when?: (ctx: { cloudActive: boolean }) => boolean }

const TABS: Tab[] = [
  { id: 'general', render: () => <GeneralSettings /> },
  { id: 'genre', render: () => <GenreProfilePanel /> },
  { id: 'walkthrough', render: () => <WalkthroughSettings /> },
  { id: 'hints', render: () => <HintsPage /> },
  { id: 'ai', render: () => <AiSettings /> },
  { id: 'definitions', render: () => <Definitions /> },
  { id: 'sharing', render: () => <ProjectSettings />, when: (c) => c.cloudActive },
  { id: 'data', render: () => <DataSettings /> },
]

export const SETTINGS_TABS = TABS.map((t) => t.id)

export function SettingsPage() {
  const { t } = useTranslation()
  const { tab } = useParams()
  const cloudActive = useCloud((s) => !!s.active)
  const tabs = TABS.filter((x) => !x.when || x.when({ cloudActive }))
  const current = tabs.find((x) => x.id === tab)
  // Bare /settings, unknown tabs and tabs that are unavailable here (sharing without a cloud project).
  if (!current) return <Navigate to="/settings/general" replace />

  return (
    <div className="page settings-page">
      <h1>{t('settingsPage.title')}</h1>
      <div className="settings-layout">
        <nav className="settings-tabs" aria-label={t('settingsPage.tabsLabel')}>
          {tabs.map((x) => (
            <NavLink key={x.id} to={`/settings/${x.id}`} className="settings-tab">
              {t(`settingsPage.tabs.${x.id}`)}
            </NavLink>
          ))}
        </nav>
        <section className="settings-panel" aria-label={t(`settingsPage.tabs.${current.id}`)}>
          {current.render()}
        </section>
      </div>
    </div>
  )
}

function GeneralSettings() {
  const { t, i18n } = useTranslation()
  const meta = useStore((s) => s.project.meta)
  const readOnly = useStore((s) => s.readOnly)
  return (
    <div className="settings-form">
      <h2>{t('settingsPage.tabs.general')}</h2>
      <label className="settings-field">
        <span>{t('app.projectName')}</span>
        <input value={meta.name} readOnly={readOnly} onChange={(e) => useStore.getState().mutate((p) => void (p.meta.name = e.target.value), 'name')} />
      </label>
      <label className="settings-field">
        <span>{t('settingsPage.language')}</span>
        <select value={i18n.language === 'hu' ? 'hu' : 'en'} onChange={(e) => setLanguage(e.target.value as 'en' | 'hu')}>
          <option value="en">English</option>
          <option value="hu">Magyar</option>
        </select>
      </label>
      <p className="muted">{t('settingsPage.languageHint')}</p>
      <dl className="settings-meta">
        <dt>{t('settingsPage.created')}</dt>
        <dd>{new Date(meta.createdAt).toLocaleString()}</dd>
        <dt>{t('settingsPage.updated')}</dt>
        <dd>{new Date(meta.updatedAt).toLocaleString()}</dd>
        <dt>{t('settingsPage.appVersion')}</dt>
        <dd>{meta.appVersion}</dd>
      </dl>
    </div>
  )
}

function DataSettings() {
  const { t } = useTranslation()
  const [snaps, setSnaps] = useState<Snapshot[]>([])
  const refresh = () => void listSnapshots().then(setSnaps)
  useEffect(refresh, [])
  return (
    <div className="settings-form">
      <h2>{t('settingsPage.tabs.data')}</h2>
      <h3>{t('settingsPage.export')}</h3>
      <div className="row">
        <button onClick={() => void exportMarkdownZip()}>{t('actions.exportMd')}</button>
        <button onClick={downloadJson}>{t('actions.exportJson')}</button>
      </div>
      <h3>{t('settingsPage.snapshots')}</h3>
      <p className="muted">{t('settingsPage.snapshotsHint')}</p>
      <button onClick={() => void createSnapshot().then(refresh)}>{t('actions.snapshot')}</button>
      {snaps.length ? (
        <ul className="list">
          {snaps.map((s) => (
            <li key={s.savedAt}>
              <span>{s.name} <span className="muted">{new Date(s.savedAt).toLocaleString()}</span></span>
              <span className="spacer" />
              <button onClick={() => { if (confirm(t('settingsPage.loadSnapshotConfirm'))) useStore.getState().loadProject(deserializeProject(s.json).project) }}>{t('settingsPage.load')}</button>
              <button className="danger" onClick={() => void deleteSnapshot(s.savedAt).then(refresh)}>{t('settingsPage.delete')}</button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">{t('settingsPage.noSnapshots')}</p>
      )}
    </div>
  )
}
