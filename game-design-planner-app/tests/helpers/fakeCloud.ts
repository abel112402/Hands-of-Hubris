/** In-memory CloudBackend with the same CAS/role semantics as the SQL functions, for unit/UI tests. */
import { CloudError, canEdit, type CloudBackend, type CloudUser, type Invite, type Member, type Role, type SaveArgs } from '../../src/core/cloud/backend'
import { projectGenres } from '../../src/core/genre'
import type { Project } from '../../src/core/model/types'

type Row = { id: string; payload: any; revision: number; lastSaveId?: string; deleted?: boolean; members: Map<string, Role> }

export class FakeCloud implements CloudBackend {
  users = new Map<string, string>() // id -> email
  current: CloudUser | null = null
  rows = new Map<string, Row>()
  invites: (Invite & { projectId: string })[] = []
  listeners = new Set<(u: CloudUser | null) => void>()
  /** Next saveProject call throws this (simulates network loss) after optionally committing. */
  failNextSave: { commit: boolean; error: CloudError } | null = null
  saveCalls: SaveArgs[] = []
  emailsSent: string[] = []
  private n = 0

  addUser(email: string) {
    const id = `u${++this.n}`
    this.users.set(id, email)
    return id
  }
  async signInAs(id: string) {
    this.current = { id, email: this.users.get(id)! }
    for (const l of this.listeners) l(this.current)
  }
  private me() {
    if (!this.current) throw new CloudError('auth', 'signed out')
    return this.current
  }
  private role(id: string) {
    const r = this.rows.get(id)
    if (!r || r.deleted) return null
    return r.members.get(this.me().id) ?? null
  }
  /** Simulates another member's save (bumps revision). */
  externalSave(id: string, project: Project) {
    const r = this.rows.get(id)!
    r.payload = JSON.parse(JSON.stringify(project))
    r.revision++
    r.lastSaveId = 'external'
  }

  async getUser() {
    return this.current
  }
  onAuthChange(cb: (u: CloudUser | null) => void) {
    this.listeners.add(cb)
    return () => void this.listeners.delete(cb)
  }
  async signInWithEmail(email: string) {
    this.emailsSent.push(email)
  }
  async signInWithProvider() {}
  async signOut() {
    this.current = null
    for (const l of this.listeners) l(null)
  }
  async enabledProviders() {
    return ['github' as const]
  }

  async listProjects() {
    const me = this.me()
    return [...this.rows.values()]
      .filter((r) => !r.deleted && r.members.has(me.id))
      .map((r) => {
        const ownerId = [...r.members].find(([, role]) => role === 'owner')![0]
        return {
          id: r.id,
          name: r.payload.meta.name,
          genres: projectGenres(r.payload),
          revision: r.revision,
          updatedAt: '2026-11-08T10:00:00Z',
          role: r.members.get(me.id)!,
          ownerEmail: this.users.get(ownerId)!,
          memberCount: r.members.size,
        }
      })
  }
  async createProject(project: Project) {
    const id = `p${++this.n}`
    this.rows.set(id, { id, payload: JSON.parse(JSON.stringify(project)), revision: 1, members: new Map([[this.me().id, 'owner']]) })
    return id
  }
  async loadProject(id: string) {
    const role = this.role(id)
    if (!role) throw new CloudError('forbidden', 'no access')
    const r = this.rows.get(id)!
    return { id, revision: r.revision, role, payload: JSON.parse(JSON.stringify(r.payload)) }
  }
  async saveProject(args: SaveArgs) {
    this.saveCalls.push(args)
    if (!canEdit(this.role(args.id))) throw new CloudError('forbidden', 'forbidden')
    const r = this.rows.get(args.id)!
    const fail = this.failNextSave
    this.failNextSave = null
    let result: { status: 'saved' | 'conflict'; revision: number }
    if (fail && !fail.commit) throw fail.error
    if (r.revision === args.baseRevision) {
      r.payload = JSON.parse(JSON.stringify(args.project))
      r.revision++
      r.lastSaveId = args.saveId
      result = { status: 'saved', revision: r.revision }
    } else result = { status: r.lastSaveId === args.saveId ? 'saved' : 'conflict', revision: r.revision }
    if (fail) throw fail.error
    return result
  }
  async deleteProject(id: string) {
    if (this.role(id) !== 'owner') throw new CloudError('forbidden', 'x')
    this.rows.get(id)!.deleted = true
  }
  async listRevisions() {
    return []
  }
  async loadRevision() {
    return {}
  }
  async claimInvites() {
    const me = this.me()
    const mine = this.invites.filter((i) => i.email === me.email)
    for (const i of mine) this.rows.get(i.projectId)?.members.set(me.id, i.role)
    this.invites = this.invites.filter((i) => i.email !== me.email)
    return mine.length
  }
  async listMembers(id: string) {
    if (!this.role(id)) throw new CloudError('forbidden', 'x')
    return [...this.rows.get(id)!.members].map(([userId, role]): Member => ({ userId, email: this.users.get(userId)!, displayName: null, role }))
  }
  async listInvites(id: string) {
    return this.invites.filter((i) => i.projectId === id)
  }
  async inviteMember(id: string, email: string, role: Exclude<Role, 'owner'>) {
    if (this.role(id) !== 'owner') throw new CloudError('forbidden', 'x')
    this.invites.push({ id: `i${++this.n}`, projectId: id, email: email.toLowerCase(), role, expiresAt: '2026-11-22T00:00:00Z' })
  }
  async revokeInvite(inviteId: string) {
    this.invites = this.invites.filter((i) => i.id !== inviteId)
  }
  async setMemberRole(id: string, userId: string, role: Exclude<Role, 'owner'>) {
    if (this.role(id) !== 'owner') throw new CloudError('forbidden', 'x')
    this.rows.get(id)!.members.set(userId, role)
  }
  async removeMember(id: string, userId: string) {
    const r = this.rows.get(id)!
    const isSelf = userId === this.me().id
    if (r.members.get(userId) === 'owner' || (!isSelf && this.role(id) !== 'owner')) throw new CloudError('forbidden', 'x')
    r.members.delete(userId)
  }
  async transferOwnership(id: string, userId: string) {
    if (this.role(id) !== 'owner') throw new CloudError('forbidden', 'x')
    const r = this.rows.get(id)!
    r.members.set(this.me().id, 'editor')
    r.members.set(userId, 'owner')
  }
}
