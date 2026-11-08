import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { flushSave, resolveOverwrite, resolveSaveAsNew, resolveTakeServer, useCloud } from '../../core/cloud/session'
import { useStore } from '../../core/store/store'
import { downloadJson } from '../actions'
import { useCloudErrorText } from './ProjectsPage'

/** Short save-state label for the top bar (replaces the local "Unsaved/All changes saved" text). */
export function CloudSaveStatus() {
  const { t } = useTranslation()
  const state = useCloud((s) => s.saveState)
  const role = useCloud((s) => s.active?.role)
  const dirty = useStore((s) => s.dirty)
  if (role === 'viewer') return <span className="status">{t('cloud.status.readOnly')}</span>
  const key = state === 'saved' && dirty ? 'pending' : state
  return (
    <span className={`status cloud-status ${key}`} role="status" aria-live="polite">
      {t(`cloud.status.${key}`)}
    </span>
  )
}

/** Banners for states that need the user: read-only access, save conflicts, lost access, failures. */
export function CloudBanners() {
  const { t } = useTranslation()
  const nav = useNavigate()
  const errorText = useCloudErrorText()
  const { active, saveState, conflictRevision, error } = useCloud()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  if (!active) return null

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    setMsg('')
    try {
      await fn()
    } catch (e) {
      setMsg(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  if (active.role === 'viewer')
    return (
      <div className="banner cloud-banner" role="status">
        <span>{t('cloud.banner.viewer')}</span>
      </div>
    )

  if (saveState === 'conflict')
    return (
      <div className="banner cloud-banner conflict" role="alert">
        <span>{t('cloud.banner.conflict', { rev: conflictRevision ?? '?' })}</span>
        <span className="spacer" />
        <button disabled={busy} onClick={downloadJson}>{t('cloud.banner.downloadMine')}</button>
        <button disabled={busy} onClick={() => confirm(t('cloud.banner.takeServerConfirm')) && void run(resolveTakeServer)}>{t('cloud.banner.takeServer')}</button>
        <button disabled={busy} onClick={() => void run(async () => { await resolveSaveAsNew(t('cloud.banner.copySuffix')); nav('/') })}>{t('cloud.banner.saveAsNew')}</button>
        <button disabled={busy} className="danger" onClick={() => confirm(t('cloud.banner.overwriteConfirm')) && void run(resolveOverwrite)}>{t('cloud.banner.overwrite')}</button>
        {msg && <span className="error-text" role="alert">{msg}</span>}
      </div>
    )

  if (saveState === 'forbidden')
    return (
      <div className="banner cloud-banner conflict" role="alert">
        <span>{t('cloud.banner.forbidden')}</span>
        <span className="spacer" />
        <button onClick={downloadJson}>{t('cloud.banner.downloadMine')}</button>
        <button onClick={() => nav('/projects')}>{t('cloud.banner.toProjects')}</button>
      </div>
    )

  if (saveState === 'offline' || saveState === 'error')
    return (
      <div className="banner cloud-banner" role="status">
        <span>{saveState === 'offline' ? t('cloud.banner.offline') : t(`cloud.errors.${error ?? 'unknown'}`, { defaultValue: t('cloud.errors.unknown') })}</span>
        <span className="spacer" />
        <button onClick={() => void flushSave()}>{t('cloud.banner.retry')}</button>
        <button onClick={downloadJson}>{t('cloud.banner.downloadMine')}</button>
      </div>
    )

  return null
}
