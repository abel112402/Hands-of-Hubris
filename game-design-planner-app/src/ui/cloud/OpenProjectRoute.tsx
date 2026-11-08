import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { hasUnsyncedChanges, openCloudProject, useCloud } from '../../core/cloud/session'
import { Loading } from './guards'
import { useCloudErrorText } from './ProjectsPage'

/**
 * Deep links: #/projects/:id, #/projects/:id/doc/:docId, #/projects/:id/settings.
 * Opens the project (if not already open) and continues to the matching workspace route.
 */
export function OpenProjectRoute() {
  const { t } = useTranslation()
  const { projectId = '', '*': rest = '' } = useParams()
  const nav = useNavigate()
  const errorText = useCloudErrorText()
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    const target = rest.startsWith('doc/') ? `/${rest}` : rest === 'settings' || rest === 'members' ? '/project' : '/'
    void (async () => {
      try {
        if (useCloud.getState().active?.id !== projectId) {
          if (hasUnsyncedChanges() && !confirm(t('cloud.projects.leaveUnsaved'))) return nav(-1)
          await openCloudProject(projectId)
        }
        if (alive) nav(target, { replace: true })
      } catch (e) {
        if (alive) setError(errorText(e))
      }
    })()
    return () => {
      alive = false
    }
  }, [projectId, rest, nav, errorText, t])

  if (!error) return <Loading />
  return (
    <div className="page" role="alert">
      <h1>{t('cloud.open.failed')}</h1>
      <p>{error}</p>
      <Link to="/projects">{t('cloud.open.back')}</Link>
    </div>
  )
}
