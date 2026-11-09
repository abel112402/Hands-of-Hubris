import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { BrandMark } from '../BrandMark'
import { Flavor } from '../flavor/Flavor'
import { useLoadingLine } from '../flavor/easter'
import { CloudError, getBackend, type CloudProjectSummary } from '../../core/cloud/backend'
import { enterLocalMode, hasUnsyncedChanges, openCloudProject, signOut, uploadAsNewProject, useCloud } from '../../core/cloud/session'
import { createProject } from '../../core/model/project'
import { deserializeProject } from '../../core/persistence/serialize'
import { pickWithInput } from '../../core/persistence/file'
import { readAutosave } from '../../core/persistence/autosave'
import { PROFILE_VERSION, setGenres } from '../../core/genre'
import { GenrePicker, customList, type GenreDraft } from '../genres/GenrePicker'
import { genreNames } from '../genres/GenreProfilePanel'
import type { Project } from '../../core/model/types'

/** Human message for a cloud error code. */
export function useCloudErrorText() {
  const { t } = useTranslation()
  // Stable identity, so callers can use it in effect dependencies.
  return useCallback(
    (e: unknown) => {
      const code = e instanceof CloudError ? e.code : 'unknown'
      return t(`cloud.errors.${code}`, { defaultValue: t('cloud.errors.unknown') })
    },
    [t],
  )
}

async function fetchProjects(): Promise<CloudProjectSummary[]> {
  const backend = getBackend()
  if (!backend) return []
  await backend.claimInvites().catch(() => 0)
  return backend.listProjects()
}

function NewProjectForm({ onCreate }: { onCreate: (p: Project) => Promise<void> }) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [examples, setExamples] = useState(false)
  const [draft, setDraft] = useState<GenreDraft>({ genres: [], custom: '' })
  const [busy, setBusy] = useState(false)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const p = createProject(name.trim() || t('cloud.projects.untitled'), examples)
    if (draft.genres.length || draft.custom.trim()) {
      p.meta.profile = { version: PROFILE_VERSION, genres: [] }
      setGenres(p, draft.genres, customList(draft.custom))
    }
    setBusy(true)
    try {
      await onCreate(p)
    } finally {
      setBusy(false)
    }
  }
  return (
    <form className="card new-project" onSubmit={(e) => void submit(e)}>
      <h2>{t('cloud.projects.newTitle')}</h2>
      <label htmlFor="np-name">{t('cloud.projects.name')}</label>
      <input id="np-name" maxLength={120} value={name} placeholder={t('cloud.projects.untitled')} onChange={(e) => setName(e.target.value)} />
      <GenrePicker value={draft} onChange={setDraft} />
      <label className="inline-check">
        <input type="checkbox" checked={examples} onChange={(e) => setExamples(e.target.checked)} /> {t('cloud.projects.examples')}
      </label>
      <div className="row">
        <button className="primary" type="submit" disabled={busy}>{t('cloud.projects.create')}</button>
      </div>
    </form>
  )
}

/** Signed-in home: own and shared cloud projects, create/import, and local migration. */
export function ProjectsPage() {
  const { t } = useTranslation()
  const loadingLine = useLoadingLine()
  const nav = useNavigate()
  const user = useCloud((s) => s.user)
  const errorText = useCloudErrorText()
  const [projects, setProjects] = useState<CloudProjectSummary[] | null>(null)
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const [localSaved, setLocalSaved] = useState<{ savedAt: string; project: Project } | null>(null)

  // Claims pending invitations first, so newly shared projects appear in the list.
  const load = useCallback(
    () =>
      fetchProjects().then(
        (list) => {
          setProjects(list)
          setError('')
        },
        (e) => {
          setError(errorText(e))
          setProjects((p) => p ?? [])
        },
      ),
    [errorText],
  )

  useEffect(() => {
    void load()
    void readAutosave().then(setLocalSaved)
  }, [load])

  const open = async (id: string) => {
    if (hasUnsyncedChanges() && !confirm(t('cloud.projects.leaveUnsaved'))) return
    try {
      const { warnings } = await openCloudProject(id)
      if (warnings.length) alert(warnings.join('\n'))
      nav('/')
    } catch (e) {
      setError(errorText(e))
    }
  }

  const createFrom = async (project: Project) => {
    try {
      const id = await uploadAsNewProject(project)
      await open(id)
    } catch (e) {
      setError(errorText(e))
    }
  }

  const importFile = async () => {
    try {
      const file = await pickWithInput('.json')
      if (!file) return
      const { project, warnings } = deserializeProject(file.text)
      const msg = [t('cloud.projects.importConfirm', { name: project.meta.name }), ...warnings].join('\n')
      if (confirm(msg)) await createFrom(project)
    } catch (e) {
      setError(e instanceof CloudError ? errorText(e) : (e as Error).message)
    }
  }

  const remove = async (p: CloudProjectSummary) => {
    if (!confirm(t('cloud.projects.deleteConfirm', { name: p.name }))) return
    try {
      await getBackend()!.deleteProject(p.id)
      await load()
    } catch (e) {
      setError(errorText(e))
    }
  }

  const leave = async (p: CloudProjectSummary) => {
    if (!user || !confirm(t('cloud.projects.leaveConfirm', { name: p.name }))) return
    try {
      await getBackend()!.removeMember(p.id, user.id)
      await load()
    } catch (e) {
      setError(errorText(e))
    }
  }

  const doSignOut = async () => {
    if (hasUnsyncedChanges() && !confirm(t('cloud.account.signOutUnsaved'))) return
    await signOut()
    nav('/welcome')
  }

  return (
    <div className="projects-page">
      <header className="landing-top">
        <strong className="brand"><BrandMark size={24} /><span className="brand-name">{t('app.title')}</span></strong>
        <span className="spacer" />
        <span className="muted">{user?.email}</span>
        <button onClick={() => { enterLocalMode(); nav('/') }}>{t('cloud.account.useLocal')}</button>
        <button onClick={() => void doSignOut()}>{t('cloud.account.signOut')}</button>
      </header>
      <main className="page">
        <div className="projects-head">
          <h1>{t('cloud.projects.title')}</h1>
          <span className="spacer" />
          <button className="primary" aria-expanded={creating} onClick={() => setCreating(!creating)}>{t('cloud.projects.new')}</button>
          <button onClick={() => void importFile()}>{t('cloud.projects.import')}</button>
        </div>
        {error && <p className="error-text" role="alert">{error}</p>}
        {creating && <NewProjectForm onCreate={createFrom} />}
        {localSaved && (
          <div className="banner" role="status">
            <span>{t('cloud.projects.localFound', { date: new Date(localSaved.savedAt).toLocaleString(), name: localSaved.project.meta.name })}</span>
            <button onClick={() => void createFrom(localSaved.project)}>{t('cloud.projects.uploadLocal')}</button>
            <span className="spacer" />
            <button className="banner-close" aria-label={t('home.closeBanner')} onClick={() => setLocalSaved(null)}>×</button>
          </div>
        )}
        {projects === null ? (
          <p role="status">{loadingLine ?? t('cloud.loading')}</p>
        ) : projects.length === 0 ? (
          <div className="empty-state">
            <p>{t('cloud.projects.empty')}</p>
            <Flavor keys="flavor.empty.projects" />
            {!creating && <button className="primary" onClick={() => setCreating(true)}>{t('cloud.projects.new')}</button>}
          </div>
        ) : (
          <ul className="project-list">
            {projects.map((p) => (
              <li key={p.id} className="card project-row">
                <div className="project-main">
                  <Link to={`/projects/${p.id}`} onClick={(e) => { e.preventDefault(); void open(p.id) }}>
                    <strong>{p.name}</strong>
                  </Link>
                  <span className="muted">
                    {p.genres.length ? genreNames(p.genres) : t('cloud.projects.noGenres')} · {t(`cloud.roles.${p.role}`)}
                    {p.role !== 'owner' && ` · ${t('cloud.projects.sharedBy', { email: p.ownerEmail })}`}
                    {' · '}{t('cloud.projects.members', { count: p.memberCount })}
                    {' · '}{t('cloud.projects.updated', { date: new Date(p.updatedAt).toLocaleString() })}
                  </span>
                </div>
                <span className={`pill role-${p.role}`}>{t(`cloud.roles.${p.role}`)}</span>
                <button onClick={() => void open(p.id)}>{t('cloud.projects.open')}</button>
                {p.role === 'owner' ? (
                  <button className="danger" onClick={() => void remove(p)}>{t('cloud.projects.delete')}</button>
                ) : (
                  <button onClick={() => void leave(p)}>{t('cloud.projects.leave')}</button>
                )}
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}
