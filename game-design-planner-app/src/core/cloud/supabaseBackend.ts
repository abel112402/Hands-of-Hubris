/** Supabase implementation of CloudBackend. SQL lives in supabase/migrations. */
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'
import type { Project } from '../model/types'
import { projectGenres } from '../genre'
import {
  CloudError,
  type CloudBackend,
  type CloudErrorCode,
  type CloudUser,
  type Invite,
  type Member,
  type OAuthProvider,
  type Role,
} from './backend'

type PgError = { code?: string; message?: string; hint?: string; details?: string } | null

function toCloudError(e: unknown): CloudError {
  if (e instanceof CloudError) return e
  if (e instanceof TypeError) return new CloudError('network', e.message)
  const err = e as PgError
  const msg = err?.message ?? String(e)
  let code: CloudErrorCode = 'unknown'
  if (err?.code === '42501') code = 'forbidden'
  else if (err?.code === 'PGRST116') code = 'notFound'
  else if (err?.code === '23514') code = 'tooLarge'
  else if (err?.code === 'P0001' && (err.hint === 'quota' || err.hint === 'rate' || err.hint === 'pending')) code = err.hint
  else if (/fetch|network/i.test(msg)) code = 'network'
  return new CloudError(code, msg)
}

/** Unwraps a Supabase `{ data, error }` result, converting errors to CloudError. */
async function run<T>(p: PromiseLike<{ data: T; error: unknown }>): Promise<T> {
  let res: { data: T; error: unknown }
  try {
    res = await p
  } catch (e) {
    throw toCloudError(e)
  }
  if (res.error) throw toCloudError(res.error)
  return res.data
}

const toUser = (u: User | null | undefined): CloudUser | null => (u ? { id: u.id, email: u.email ?? '' } : null)

export function createSupabaseBackend(url: string, key: string): CloudBackend {
  const sb: SupabaseClient = createClient(url, key, {
    auth: {
      // PKCE returns ?code=… in the query string, which does not collide with HashRouter's #/ paths.
      flowType: 'pkce',
      detectSessionInUrl: true,
      persistSession: true,
      autoRefreshToken: true,
    },
  })

  return {
    async getUser() {
      const { data } = await sb.auth.getSession()
      return toUser(data.session?.user)
    },
    onAuthChange(cb) {
      const { data } = sb.auth.onAuthStateChange((_event, session) => cb(toUser(session?.user)))
      return () => data.subscription.unsubscribe()
    },
    async signInWithEmail(email, redirectTo, captchaToken) {
      const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo, captchaToken } })
      if (error) throw new CloudError(error.status === 429 ? 'rate' : 'auth', error.message)
    },
    async signInWithProvider(provider, redirectTo) {
      const { error } = await sb.auth.signInWithOAuth({ provider, options: { redirectTo } })
      if (error) throw new CloudError('auth', error.message)
    },
    async signOut() {
      // Local scope: signs this browser out even if the server is unreachable.
      await sb.auth.signOut({ scope: 'local' })
    },
    async enabledProviders() {
      try {
        const res = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } })
        const json = (await res.json()) as { external?: Record<string, boolean> }
        return (['github', 'google'] as OAuthProvider[]).filter((p) => json.external?.[p])
      } catch {
        return []
      }
    },

    async listProjects() {
      const rows = await run(sb.rpc('list_my_projects'))
      return (rows as any[]).map((r) => ({
        id: r.id,
        name: r.name,
        genres: r.genres ?? [],
        revision: Number(r.revision),
        updatedAt: r.updated_at,
        role: r.role as Role,
        ownerEmail: r.owner_email ?? '',
        memberCount: Number(r.member_count),
      }))
    },
    async createProject(project: Project) {
      return (await run(
        sb.rpc('create_project', { p_name: project.meta.name, p_genres: projectGenres(project), p_payload: project }),
      )) as string
    },
    async loadProject(id) {
      const row = (await run(sb.from('projects').select('id, revision, payload').eq('id', id).is('deleted_at', null).single())) as any
      const role = (await run(sb.rpc('project_role_of', { p_project: id }))) as Role | null
      if (!role) throw new CloudError('forbidden', 'No access to this project')
      return { id: row.id, revision: Number(row.revision), role, payload: row.payload }
    },
    async saveProject({ id, baseRevision, project, saveId, snapshot }) {
      const r = (await run(
        sb.rpc('save_project', {
          p_id: id,
          p_base_revision: baseRevision,
          p_payload: project,
          p_name: project.meta.name,
          p_genres: projectGenres(project),
          p_save_id: saveId,
          p_snapshot: snapshot,
        }),
      )) as { status: 'saved' | 'conflict'; revision: number }
      return { status: r.status, revision: Number(r.revision) }
    },
    async deleteProject(id) {
      await run(sb.rpc('delete_project', { p_id: id }))
    },
    async listRevisions(id) {
      const rows = (await run(
        sb.from('project_revisions').select('revision, author_id, created_at').eq('project_id', id).order('revision', { ascending: false }),
      )) as any[]
      return rows.map((r) => ({ revision: Number(r.revision), authorId: r.author_id, createdAt: r.created_at }))
    },
    async loadRevision(id, revision) {
      const row = (await run(
        sb.from('project_revisions').select('payload').eq('project_id', id).eq('revision', revision).single(),
      )) as any
      return row.payload
    },

    async claimInvites() {
      return Number(await run(sb.rpc('claim_invites')))
    },
    async listMembers(id) {
      const rows = (await run(sb.rpc('list_project_members', { p_id: id }))) as any[]
      return rows.map((r): Member => ({ userId: r.user_id, email: r.email, displayName: r.display_name, role: r.role }))
    },
    async listInvites(id) {
      const rows = (await run(
        sb.from('project_invites').select('id, email, role, expires_at').eq('project_id', id).order('created_at'),
      )) as any[]
      return rows.map((r): Invite => ({ id: r.id, email: r.email, role: r.role, expiresAt: r.expires_at }))
    },
    async inviteMember(id, email, role) {
      await run(sb.rpc('invite_member', { p_id: id, p_email: email, p_role: role }))
    },
    async revokeInvite(inviteId) {
      await run(sb.from('project_invites').delete().eq('id', inviteId))
    },
    async setMemberRole(id, userId, role) {
      const rows = (await run(sb.from('project_members').update({ role }).eq('project_id', id).eq('user_id', userId).select('user_id'))) as any[]
      if (!rows.length) throw new CloudError('forbidden', 'Role not changed')
    },
    async removeMember(id, userId) {
      const rows = (await run(sb.from('project_members').delete().eq('project_id', id).eq('user_id', userId).select('user_id'))) as any[]
      if (!rows.length) throw new CloudError('forbidden', 'Member not removed')
    },
    async transferOwnership(id, userId) {
      await run(sb.rpc('transfer_ownership', { p_id: id, p_new_owner: userId }))
    },
  }
}
