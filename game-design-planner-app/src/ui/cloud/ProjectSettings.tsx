import { useCallback, useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { canEdit, getBackend, type Invite, type Member, type Revision, type Role } from '../../core/cloud/backend'
import { closeCloudProject, flushSave, useCloud } from '../../core/cloud/session'
import { deserializeProject } from '../../core/persistence/serialize'
import { useStore } from '../../core/store/store'
import { useCloudErrorText } from './ProjectsPage'

type Assignable = Exclude<Role, 'owner'>

/** Members, invitations and revision history of the open cloud project. */
export function ProjectSettings() {
  const { t } = useTranslation()
  const nav = useNavigate()
  const errorText = useCloudErrorText()
  const active = useCloud((s) => s.active)
  const user = useCloud((s) => s.user)
  const [members, setMembers] = useState<Member[]>([])
  const [invites, setInvites] = useState<Invite[]>([])
  const [revisions, setRevisions] = useState<Revision[]>([])
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Assignable>('editor')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const isOwner = active?.role === 'owner'
  const shareUrl = `${location.origin}${location.pathname}#/projects`

  const load = useCallback(() => {
    const b = getBackend()
    if (!b || !active) return Promise.resolve()
    return Promise.all([
      b.listMembers(active.id),
      b.listRevisions(active.id),
      active.role === 'owner' ? b.listInvites(active.id) : Promise.resolve([] as Invite[]),
    ]).then(
      ([m, r, i]) => {
        setMembers(m)
        setRevisions(r)
        setInvites(i)
      },
      (e) => setError(errorText(e)),
    )
  }, [active, errorText])

  useEffect(() => {
    void load()
  }, [load])

  if (!active) return <Navigate to="/" replace />

  /** Runs one member action; resolves true on success. */
  const act = async (fn: () => Promise<unknown>, ok?: string): Promise<boolean> => {
    setError('')
    setNotice('')
    try {
      await fn()
      if (ok) setNotice(ok)
      await load()
      return true
    } catch (e) {
      setError(errorText(e))
      return false
    }
  }

  const b = getBackend()!
  const invite = (e: React.FormEvent) => {
    e.preventDefault()
    const addr = email.trim().toLowerCase()
    if (!addr) return
    void act(() => b.inviteMember(active.id, addr, role), t('cloud.members.invited', { email: addr })).then((done) => done && setEmail(''))
  }

  const leave = async () => {
    if (!user || !confirm(t('cloud.members.leaveConfirm'))) return
    try {
      await b.removeMember(active.id, user.id)
      closeCloudProject()
      nav('/projects')
    } catch (e) {
      setError(errorText(e))
    }
  }

  const restore = async (rev: number) => {
    if (!confirm(t('cloud.history.restoreConfirm', { rev }))) return
    try {
      const payload = await b.loadRevision(active.id, rev)
      const { project } = deserializeProject(JSON.stringify(payload))
      // One undoable edit, saved as a new revision through the normal compare-and-swap path.
      useStore.getState().mutate((d) => {
        d.meta = { ...project.meta, updatedAt: d.meta.updatedAt }
        d.registry = project.registry
        d.documents = project.documents
        d.links = project.links
      })
      await flushSave()
      setNotice(t('cloud.history.restored', { rev }))
      await load()
    } catch (e) {
      setError(errorText(e))
    }
  }

  const who = (id: string | null) => members.find((m) => m.userId === id)?.email ?? t('cloud.history.formerMember')

  return (
    <div className="page project-settings">
      <h1>{t('cloud.settings.title')}</h1>
      {error && <p className="error-text" role="alert">{error}</p>}
      {notice && <p className="ok-text" role="status">{notice}</p>}

      <section aria-labelledby="members-title">
        <h2 id="members-title">{t('cloud.members.title')}</h2>
        <ul className="list member-list">
          {members.map((m) => (
            <li key={m.userId}>
              <span>
                {m.email}
                {m.userId === user?.id && <span className="muted"> ({t('cloud.members.you')})</span>}
              </span>
              <span className="spacer" />
              {isOwner && m.role !== 'owner' ? (
                <>
                  <select aria-label={t('cloud.members.roleFor', { email: m.email })} value={m.role}
                    onChange={(e) => void act(() => b.setMemberRole(active.id, m.userId, e.target.value as Assignable))}>
                    <option value="editor">{t('cloud.roles.editor')}</option>
                    <option value="viewer">{t('cloud.roles.viewer')}</option>
                  </select>
                  <button onClick={() => confirm(t('cloud.members.transferConfirm', { email: m.email })) && void act(() => b.transferOwnership(active.id, m.userId), t('cloud.members.transferred'))
                    .then((done) => done && useCloud.setState((s) => ({ active: s.active && { ...s.active, role: 'editor' } })))}>
                    {t('cloud.members.makeOwner')}
                  </button>
                  <button className="danger" onClick={() => confirm(t('cloud.members.removeConfirm', { email: m.email })) && void act(() => b.removeMember(active.id, m.userId))}>
                    {t('cloud.members.remove')}
                  </button>
                </>
              ) : (
                <span className="pill">{t(`cloud.roles.${m.role}`)}</span>
              )}
            </li>
          ))}
        </ul>
        {!isOwner && <button onClick={() => void leave()}>{t('cloud.members.leave')}</button>}
      </section>

      {isOwner && (
        <section aria-labelledby="invite-title">
          <h2 id="invite-title">{t('cloud.members.inviteTitle')}</h2>
          <p className="muted">{t('cloud.members.inviteHint')}</p>
          <form className="row" onSubmit={invite}>
            <input type="email" required maxLength={254} aria-label={t('cloud.signIn.email')} placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            <select aria-label={t('cloud.members.role')} value={role} onChange={(e) => setRole(e.target.value as Assignable)}>
              <option value="editor">{t('cloud.roles.editor')}</option>
              <option value="viewer">{t('cloud.roles.viewer')}</option>
            </select>
            <button className="primary" type="submit">{t('cloud.members.invite')}</button>
          </form>
          <p className="muted">
            {t('cloud.members.shareLink')} <code>{shareUrl}</code>{' '}
            <button className="small" onClick={() => void navigator.clipboard?.writeText(shareUrl)}>{t('cloud.members.copy')}</button>
          </p>
          {invites.length > 0 && (
            <>
              <h3>{t('cloud.members.pending')}</h3>
              <ul className="list">
                {invites.map((i) => (
                  <li key={i.id}>
                    <span>{i.email} <span className="muted">· {t(`cloud.roles.${i.role}`)} · {t('cloud.members.expires', { date: new Date(i.expiresAt).toLocaleDateString() })}</span></span>
                    <span className="spacer" />
                    <button onClick={() => void act(() => b.revokeInvite(i.id))}>{t('cloud.members.revoke')}</button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      <section aria-labelledby="history-title">
        <h2 id="history-title">{t('cloud.history.title')}</h2>
        <p className="muted">{t('cloud.history.hint')}</p>
        <ul className="list">
          {revisions.map((r) => (
            <li key={r.revision}>
              <span>{t('cloud.history.revision', { rev: r.revision })} <span className="muted">· {who(r.authorId)} · {new Date(r.createdAt).toLocaleString()}</span></span>
              <span className="spacer" />
              {canEdit(active.role) && <button onClick={() => void restore(r.revision)}>{t('cloud.history.restore')}</button>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
