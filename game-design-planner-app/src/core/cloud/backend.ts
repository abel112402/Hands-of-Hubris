/**
 * Backend contract for accounts and cloud projects. The UI and the project session only talk to
 * this interface, so the Supabase implementation can be swapped (tests use an in-memory fake).
 * Every method is authorized again on the server; nothing here is a security boundary.
 */
import type { Project } from '../model/types'

export type Role = 'viewer' | 'editor' | 'owner'
export const ROLE_RANK: Record<Role, number> = { viewer: 0, editor: 1, owner: 2 }
export const canEdit = (r: Role | null | undefined) => !!r && ROLE_RANK[r] >= ROLE_RANK.editor

export type CloudUser = { id: string; email: string }
export type OAuthProvider = 'github' | 'google'

export type CloudProjectSummary = {
  id: string
  name: string
  genres: string[]
  revision: number
  updatedAt: string
  role: Role
  ownerEmail: string
  memberCount: number
}

export type LoadedCloudProject = { id: string; revision: number; role: Role; payload: unknown }

export type SaveArgs = {
  id: string
  baseRevision: number
  project: Project
  saveId: string
  snapshot: boolean
}
export type SaveResult = { status: 'saved' | 'conflict'; revision: number }

export type Member = { userId: string; email: string; displayName: string | null; role: Role }
export type Invite = { id: string; email: string; role: Role; expiresAt: string }
export type Revision = { revision: number; authorId: string | null; createdAt: string }

/** Typed error codes the UI can explain; anything else is shown as a generic failure. */
export type CloudErrorCode = 'forbidden' | 'quota' | 'rate' | 'pending' | 'notFound' | 'tooLarge' | 'network' | 'auth' | 'unknown'
export class CloudError extends Error {
  constructor(public code: CloudErrorCode, message: string) {
    super(message)
  }
}

export interface CloudBackend {
  // Auth
  getUser(): Promise<CloudUser | null>
  /** Calls back on sign-in/out and token changes; returns an unsubscribe function. */
  onAuthChange(cb: (user: CloudUser | null) => void): () => void
  signInWithEmail(email: string, redirectTo: string, captchaToken?: string): Promise<void>
  signInWithProvider(provider: OAuthProvider, redirectTo: string): Promise<void>
  signOut(): Promise<void>
  /** OAuth providers enabled on the server, so the UI shows only working buttons. */
  enabledProviders(): Promise<OAuthProvider[]>

  // Projects
  listProjects(): Promise<CloudProjectSummary[]>
  createProject(project: Project): Promise<string>
  loadProject(id: string): Promise<LoadedCloudProject>
  saveProject(args: SaveArgs): Promise<SaveResult>
  deleteProject(id: string): Promise<void>
  listRevisions(id: string): Promise<Revision[]>
  loadRevision(id: string, revision: number): Promise<unknown>

  // Sharing
  claimInvites(): Promise<number>
  listMembers(id: string): Promise<Member[]>
  listInvites(id: string): Promise<Invite[]>
  inviteMember(id: string, email: string, role: Exclude<Role, 'owner'>): Promise<void>
  revokeInvite(inviteId: string): Promise<void>
  setMemberRole(id: string, userId: string, role: Exclude<Role, 'owner'>): Promise<void>
  removeMember(id: string, userId: string): Promise<void>
  transferOwnership(id: string, userId: string): Promise<void>
}

let backend: CloudBackend | null = null

/** The configured backend, or null when the app runs local-only (no cloud configuration). */
export const getBackend = () => backend
export const setBackend = (b: CloudBackend | null) => {
  backend = b
}
