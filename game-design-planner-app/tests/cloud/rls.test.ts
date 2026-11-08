/**
 * Server-side authorization against the local Supabase stack (npm run test:cloud).
 * Every role is checked through the real API with real JWTs; the client UI is not involved.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createProject } from '../../src/core/model/project'

const URL = import.meta.env.SUPABASE_URL as string
const PUBLISHABLE = import.meta.env.SUPABASE_PUBLISHABLE_KEY as string
const SECRET = import.meta.env.SUPABASE_SECRET_KEY as string
const run = Date.now().toString(36)
const opts = { auth: { persistSession: false, autoRefreshToken: false } }

const admin = () => createClient(URL, SECRET, opts)
const anon = () => createClient(URL, PUBLISHABLE, opts)

async function userClient(name: string): Promise<{ c: SupabaseClient; id: string; email: string }> {
  const email = `${name}-${run}@example.test`
  const password = `pw-${run}-${name}-Aa1!`
  const { data, error } = await admin().auth.admin.createUser({ email, password, email_confirm: true })
  if (error) throw error
  const c = createClient(URL, PUBLISHABLE, opts)
  const { error: e2 } = await c.auth.signInWithPassword({ email, password })
  if (e2) throw e2
  return { c, id: data.user!.id, email }
}

const payload = (name = 'P') => createProject(name, false)

let owner: Awaited<ReturnType<typeof userClient>>
let editor: Awaited<ReturnType<typeof userClient>>
let viewer: Awaited<ReturnType<typeof userClient>>
let stranger: Awaited<ReturnType<typeof userClient>>
let projectId: string

async function save(c: SupabaseClient, base: number, saveId = crypto.randomUUID(), name = 'P') {
  return c.rpc('save_project', {
    p_id: projectId, p_base_revision: base, p_payload: payload(name), p_name: name, p_genres: [], p_save_id: saveId, p_snapshot: false,
  })
}

beforeAll(async () => {
  ;[owner, editor, viewer, stranger] = await Promise.all(['owner', 'editor', 'viewer', 'stranger'].map(userClient))
  const { data, error } = await owner.c.rpc('create_project', { p_name: 'Shared', p_genres: ['rpg'], p_payload: payload('Shared') })
  if (error) throw error
  projectId = data as string
})

describe('project creation and isolation', () => {
  it('owner sees the project with role owner; strangers and anonymous visitors see nothing', async () => {
    const mine = await owner.c.rpc('list_my_projects')
    expect(mine.data!.find((p: any) => p.id === projectId)).toMatchObject({ role: 'owner', name: 'Shared', genres: ['rpg'] })
    expect((await stranger.c.from('projects').select('id').eq('id', projectId)).data).toEqual([])
    expect((await stranger.c.rpc('list_my_projects')).data!.some((p: any) => p.id === projectId)).toBe(false)
    expect((await stranger.c.from('project_revisions').select('revision').eq('project_id', projectId)).data).toEqual([])
    const a = anon()
    expect((await a.from('projects').select('id')).error).toBeTruthy()
    expect((await a.rpc('list_my_projects')).error).toBeTruthy()
  })

  it('denies writes by strangers and direct table writes by members', async () => {
    expect((await save(stranger.c, 1)).error?.code).toBe('42501')
    expect((await stranger.c.rpc('list_project_members', { p_id: projectId })).error?.code).toBe('42501')
    expect((await stranger.c.rpc('delete_project', { p_id: projectId })).error?.code).toBe('42501')
    const direct = await owner.c.from('projects').update({ name: 'hack' }).eq('id', projectId).select()
    expect(direct.error ?? direct.data?.length === 0).toBeTruthy()
    const insert = await stranger.c.from('project_members').insert({ project_id: projectId, user_id: stranger.id, role: 'owner' })
    expect(insert.error).toBeTruthy()
  })

  it('rejects payloads over 2 MB', async () => {
    const big = payload() as any
    big.documents.blob = { moduleVersion: 1, data: { x: 'a'.repeat(2_200_000) } }
    const res = await owner.c.rpc('create_project', { p_name: 'Big', p_genres: [], p_payload: big })
    expect(res.error?.code).toBe('23514')
  })
})

describe('invitations', () => {
  it('only the owner can invite; invites are claimed only by the matching verified e-mail', async () => {
    expect((await editor.c.rpc('invite_member', { p_id: projectId, p_email: editor.email, p_role: 'editor' })).error?.code).toBe('42501')
    expect((await owner.c.rpc('invite_member', { p_id: projectId, p_email: editor.email.toUpperCase(), p_role: 'editor' })).error).toBeNull()
    expect((await owner.c.rpc('invite_member', { p_id: projectId, p_email: viewer.email, p_role: 'viewer' })).error).toBeNull()
    expect((await owner.c.rpc('invite_member', { p_id: projectId, p_email: 'x@example.test', p_role: 'owner' })).error).toBeTruthy()
    // Strangers cannot read invites or claim someone else's.
    expect((await stranger.c.from('project_invites').select('id').eq('project_id', projectId)).data).toEqual([])
    expect((await stranger.c.rpc('claim_invites')).data).toBe(0)
    expect((await editor.c.rpc('claim_invites')).data).toBe(1)
    expect((await viewer.c.rpc('claim_invites')).data).toBe(1)
    expect((await editor.c.rpc('claim_invites')).data).toBe(0) // single use
    const members = (await owner.c.rpc('list_project_members', { p_id: projectId })).data as any[]
    expect(members.map((m) => [m.email, m.role]).sort()).toEqual(
      [[editor.email, 'editor'], [owner.email, 'owner'], [viewer.email, 'viewer']].sort(),
    )
  })
})

describe('saves and roles', () => {
  it('compare-and-swap: stale saves conflict, retries with the same save ID are idempotent', async () => {
    const first = await save(editor.c, 1, 'aaaaaaaa-0000-4000-8000-000000000001', 'Edited')
    expect(first.data).toEqual({ status: 'saved', revision: 2 })
    // Retry of the committed save (lost response) is not a conflict.
    expect((await save(editor.c, 1, 'aaaaaaaa-0000-4000-8000-000000000001', 'Edited')).data).toEqual({ status: 'saved', revision: 2 })
    // Another stale save is rejected and changes nothing.
    expect((await save(owner.c, 1, undefined, 'Stale')).data).toEqual({ status: 'conflict', revision: 2 })
    const row = await viewer.c.from('projects').select('name, revision').eq('id', projectId).single()
    expect(row.data).toEqual({ name: 'Edited', revision: 2 })
  })

  it('viewers can read but not save, invite or change roles', async () => {
    expect((await viewer.c.from('projects').select('id').eq('id', projectId)).data).toHaveLength(1)
    expect((await save(viewer.c, 2)).error?.code).toBe('42501')
    expect((await viewer.c.rpc('invite_member', { p_id: projectId, p_email: 'y@example.test', p_role: 'editor' })).error?.code).toBe('42501')
    const promote = await viewer.c.from('project_members').update({ role: 'editor' }).eq('project_id', projectId).eq('user_id', viewer.id).select()
    expect(promote.data ?? []).toEqual([])
  })

  it('editors cannot manage members; the owner cannot be removed or demoted through the table', async () => {
    const del = await editor.c.from('project_members').delete().eq('project_id', projectId).eq('user_id', viewer.id).select()
    expect(del.data ?? []).toEqual([])
    const demote = await owner.c.from('project_members').update({ role: 'viewer' }).eq('project_id', projectId).eq('user_id', owner.id).select()
    expect(demote.data ?? []).toEqual([])
    const removeOwner = await owner.c.from('project_members').delete().eq('project_id', projectId).eq('user_id', owner.id).select()
    expect(removeOwner.data ?? []).toEqual([])
    // Only the role column is writable (no moving memberships).
    const move = await owner.c.from('project_members').update({ user_id: stranger.id }).eq('project_id', projectId).eq('user_id', viewer.id)
    expect(move.error).toBeTruthy()
  })

  it('owner changes a role and the change applies immediately', async () => {
    const res = await owner.c.from('project_members').update({ role: 'editor' }).eq('project_id', projectId).eq('user_id', viewer.id).select()
    expect(res.data).toHaveLength(1)
    expect((await save(viewer.c, 2, undefined, 'By former viewer')).data).toEqual({ status: 'saved', revision: 3 })
    await owner.c.from('project_members').update({ role: 'viewer' }).eq('project_id', projectId).eq('user_id', viewer.id)
    expect((await save(viewer.c, 3)).error?.code).toBe('42501')
  })
})

describe('revocation, leaving and ownership', () => {
  it('a removed member loses read and write access immediately', async () => {
    const { data: tmpId } = await owner.c.rpc('create_project', { p_name: 'Temp', p_genres: [], p_payload: payload('Temp') })
    await owner.c.rpc('invite_member', { p_id: tmpId, p_email: stranger.email, p_role: 'editor' })
    await stranger.c.rpc('claim_invites')
    expect((await stranger.c.from('projects').select('id').eq('id', tmpId)).data).toHaveLength(1)
    const rm = await owner.c.from('project_members').delete().eq('project_id', tmpId).eq('user_id', stranger.id).select()
    expect(rm.data).toHaveLength(1)
    expect((await stranger.c.from('projects').select('id').eq('id', tmpId)).data).toEqual([])
    const s = await stranger.c.rpc('save_project', { p_id: tmpId, p_base_revision: 1, p_payload: payload(), p_name: 'x', p_genres: [], p_save_id: crypto.randomUUID(), p_snapshot: false })
    expect(s.error?.code).toBe('42501')
  })

  it('a non-owner can leave; transfer keeps exactly one owner', async () => {
    const leave = await viewer.c.from('project_members').delete().eq('project_id', projectId).eq('user_id', viewer.id).select()
    expect(leave.data).toHaveLength(1)
    expect((await editor.c.rpc('transfer_ownership', { p_id: projectId, p_new_owner: editor.id })).error?.code).toBe('42501')
    expect((await owner.c.rpc('transfer_ownership', { p_id: projectId, p_new_owner: stranger.id })).error).toBeTruthy()
    expect((await owner.c.rpc('transfer_ownership', { p_id: projectId, p_new_owner: editor.id })).error).toBeNull()
    const members = (await editor.c.rpc('list_project_members', { p_id: projectId })).data as any[]
    expect(members.filter((m) => m.role === 'owner').map((m) => m.email)).toEqual([editor.email])
    expect(members.find((m) => m.email === owner.email).role).toBe('editor')
  })

  it('only the owner can delete; deleted projects disappear for everyone', async () => {
    expect((await owner.c.rpc('delete_project', { p_id: projectId })).error?.code).toBe('42501')
    expect((await editor.c.rpc('delete_project', { p_id: projectId })).error).toBeNull()
    expect((await owner.c.from('projects').select('id').eq('id', projectId)).data).toEqual([])
    expect((await editor.c.rpc('list_my_projects')).data!.some((p: any) => p.id === projectId)).toBe(false)
  })
})

describe('quotas', () => {
  it('limits owned projects to 20', async () => {
    const u = await userClient('quota')
    for (let i = 0; i < 20; i++) expect((await u.c.rpc('create_project', { p_name: `Q${i}`, p_genres: [], p_payload: payload() })).error).toBeNull()
    const over = await u.c.rpc('create_project', { p_name: 'Q20', p_genres: [], p_payload: payload() })
    expect(over.error?.hint).toBe('quota')
  })
})
