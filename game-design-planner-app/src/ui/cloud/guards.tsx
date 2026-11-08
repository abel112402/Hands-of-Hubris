import { useEffect, useState, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { CloudBackend } from '../../core/cloud/backend'
import { createConfiguredBackend, isCloudConfigured } from '../../core/cloud/config'
import { initCloud, lastActiveProjectId, openCloudProject, useCloud } from '../../core/cloud/session'

const RETURN_KEY = 'hoh.returnTo'

/** Remembers where to go after an auth redirect (magic link / OAuth leave the app). */
export const rememberReturnTo = (path: string) => {
  try {
    sessionStorage.setItem(RETURN_KEY, path)
  } catch {
    /* storage unavailable */
  }
}

function takeReturnTo(): string | null {
  try {
    const v = sessionStorage.getItem(RETURN_KEY)
    sessionStorage.removeItem(RETURN_KEY)
    // Only in-app hash paths are accepted (no open redirects).
    return v && /^\/[\w\-/?=&%.]*$/.test(v) ? v : null
  } catch {
    return null
  }
}

export function Loading() {
  const { t } = useTranslation()
  return <div className="page cloud-loading" role="status">{t('cloud.loading')}</div>
}

/**
 * Starts the cloud session before the routes render. `backend` overrides the configured one
 * (tests); `undefined` = use the build configuration; without configuration the app stays local-only.
 */
export function CloudBootstrap({ backend, children }: { backend?: CloudBackend | null; children: ReactNode }) {
  const configured = backend !== undefined ? backend !== null : isCloudConfigured()
  const [ready, setReady] = useState(!configured)
  useEffect(() => {
    let alive = true
    void (async () => {
      const b = backend !== undefined ? backend : await createConfiguredBackend()
      await initCloud(b)
      if (!b) return alive && setReady(true)
      // Back from a magic link / OAuth redirect: drop ?code=… and return to the remembered route.
      if (location.search.includes('code=') || location.search.includes('error=')) {
        const back = takeReturnTo() ?? '/projects'
        history.replaceState(null, '', `${location.pathname}#${back}`)
      }
      // Reopen the cloud project this tab had open before a reload.
      const { user, mode } = useCloud.getState()
      const last = lastActiveProjectId()
      if (user && mode !== 'local' && last) await openCloudProject(last).catch(() => undefined)
      if (alive) setReady(true)
    })()
    return () => {
      alive = false
    }
  }, [backend])
  return ready ? <>{children}</> : <Loading />
}

/** Planner workspace: local mode, or an open cloud project. Otherwise go to sign-in or the project list. */
export function RequireWorkspace({ children }: { children: ReactNode }) {
  const { enabled, authReady, mode, active, user } = useCloud()
  const loc = useLocation()
  if (!enabled || mode === 'local') return <>{children}</>
  if (!authReady) return <Loading />
  if (mode === 'cloud' && active) return <>{children}</>
  const next = loc.pathname + loc.search
  if (user) return <Navigate to="/projects" replace state={{ from: next }} />
  return <Navigate to={`/welcome?next=${encodeURIComponent(next)}`} replace />
}

/** Pages that need a signed-in account (project list, opening a cloud project). */
export function RequireUser({ children }: { children: ReactNode }) {
  const { enabled, authReady, user } = useCloud()
  const loc = useLocation()
  if (!enabled) return <Navigate to="/" replace />
  if (!authReady) return <Loading />
  if (!user) return <Navigate to={`/welcome?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />
  return <>{children}</>
}
