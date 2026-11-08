import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// In-memory IndexedDB stand-in (jsdom has none).
const idb = vi.hoisted(() => new Map<string, unknown>())
vi.mock('idb-keyval', () => ({
  get: async (k: string) => idb.get(k),
  set: async (k: string, v: unknown) => void idb.set(k, structuredClone(v)),
  del: async (k: string) => void idb.delete(k),
  keys: async () => [...idb.keys()],
}))

import { CloudError } from '../src/core/cloud/backend'
import {
  __resetCloudForTests,
  closeCloudProject,
  flushSave,
  initCloud,
  openCloudProject,
  resolveOverwrite,
  resolveSaveAsNew,
  resolveTakeServer,
  signOut,
  timing,
  useCloud,
} from '../src/core/cloud/session'
import { createProject } from '../src/core/model/project'
import { serializeProject } from '../src/core/persistence/serialize'
import { useStore } from '../src/core/store/store'
import { FakeCloud } from './helpers/fakeCloud'

let fake: FakeCloud
let ownerId: string
let projectId: string

const edit = (name: string) => useStore.getState().mutate((p) => void (p.meta.name = name))
const saved = () => vi.waitFor(() => expect(useCloud.getState().saveState).toBe('saved'))

beforeEach(async () => {
  idb.clear()
  Object.assign(timing, { saveDebounceMs: 5, draftDebounceMs: 1, snapshotEveryMs: 60_000, retryMs: [5] })
  fake = new FakeCloud()
  ownerId = fake.addUser('owner@example.test')
  await fake.signInAs(ownerId)
  projectId = await fake.createProject(createProject('Cloud', false))
  useStore.getState().loadProject(createProject('Local', false))
  await initCloud(fake)
})

afterEach(() => {
  __resetCloudForTests()
  useStore.getState().loadProject(createProject('Local', false))
})

describe('opening', () => {
  it('loads the server version through validation and records identity and role', async () => {
    await openCloudProject(projectId)
    expect(useStore.getState().project.meta.name).toBe('Cloud')
    expect(useStore.getState().readOnly).toBe(false)
    expect(useCloud.getState()).toMatchObject({ mode: 'cloud', active: { id: projectId, role: 'owner', revision: 1 }, saveState: 'saved' })
  })

  it('rejects an invalid server payload instead of loading it', async () => {
    fake.rows.get(projectId)!.payload = { format: 'nope' }
    await expect(openCloudProject(projectId)).rejects.toThrow(/Invalid project file/)
  })
})

describe('save loop', () => {
  it('saves edits with the base revision and clears the dirty flag', async () => {
    await openCloudProject(projectId)
    edit('Renamed')
    await saved()
    expect(fake.saveCalls).toHaveLength(1)
    expect(fake.saveCalls[0].baseRevision).toBe(1)
    expect(fake.rows.get(projectId)!.payload.meta.name).toBe('Renamed')
    expect(useCloud.getState().active!.revision).toBe(2)
    expect(useStore.getState().dirty).toBe(false)
  })

  it('keeps newer edits dirty while an older save is in flight, then saves them', async () => {
    await openCloudProject(projectId)
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const orig = fake.saveProject.bind(fake)
    let first = true
    fake.saveProject = async (a) => {
      if (first) {
        first = false
        await gate
      }
      return orig(a)
    }
    edit('One')
    await vi.waitFor(() => expect(useCloud.getState().saveState).toBe('saving'))
    edit('Two')
    release()
    await saved()
    expect(fake.rows.get(projectId)!.payload.meta.name).toBe('Two')
    expect(fake.rows.get(projectId)!.revision).toBe(3)
    expect(useStore.getState().dirty).toBe(false)
  })

  it('a stale save becomes a conflict, keeps local edits and stops saving', async () => {
    await openCloudProject(projectId)
    fake.externalSave(projectId, createProject('Theirs', false))
    edit('Mine')
    await vi.waitFor(() => expect(useCloud.getState().saveState).toBe('conflict'))
    expect(useCloud.getState().conflictRevision).toBe(2)
    expect(useStore.getState().project.meta.name).toBe('Mine')
    expect(useStore.getState().dirty).toBe(true)
    edit('Mine again')
    await flushSave()
    expect(fake.saveCalls).toHaveLength(1)
    expect(fake.rows.get(projectId)!.payload.meta.name).toBe('Theirs')
  })

  it('retries an uncertain save with the same save ID, so a committed save is not a conflict', async () => {
    await openCloudProject(projectId)
    fake.failNextSave = { commit: true, error: new CloudError('network', 'lost response') }
    edit('Committed')
    await saved()
    expect(fake.saveCalls.length).toBe(2)
    expect(fake.saveCalls[0].saveId).toBe(fake.saveCalls[1].saveId)
    expect(fake.rows.get(projectId)!.revision).toBe(2)
  })

  it('shows offline and recovers when a save did not reach the server', async () => {
    await openCloudProject(projectId)
    timing.retryMs = [60_000]
    fake.failNextSave = { commit: false, error: new CloudError('network', 'offline') }
    edit('Later')
    await vi.waitFor(() => expect(useCloud.getState().saveState).toBe('offline'))
    expect(useStore.getState().dirty).toBe(true)
    await flushSave()
    expect(useCloud.getState().saveState).toBe('saved')
    expect(fake.rows.get(projectId)!.payload.meta.name).toBe('Later')
  })

  it('refuses payloads over the cloud size limit without calling the server', async () => {
    await openCloudProject(projectId)
    useStore.getState().mutate((p) => void (p.meta.name = 'x'.repeat(2_200_000)))
    await vi.waitFor(() => expect(useCloud.getState()).toMatchObject({ saveState: 'error', error: 'tooLarge' }))
    expect(fake.saveCalls).toHaveLength(0)
  })
})

describe('conflict resolution', () => {
  beforeEach(async () => {
    await openCloudProject(projectId)
    fake.externalSave(projectId, createProject('Theirs', false))
    edit('Mine')
    await vi.waitFor(() => expect(useCloud.getState().saveState).toBe('conflict'))
  })

  it('overwrite re-checks the revision and saves on top of the newer version', async () => {
    await resolveOverwrite()
    expect(useCloud.getState().saveState).toBe('saved')
    expect(fake.rows.get(projectId)!).toMatchObject({ revision: 3, payload: { meta: { name: 'Mine' } } })
  })

  it('save-as-new keeps both versions', async () => {
    const id = await resolveSaveAsNew('(copy)')
    expect(fake.rows.get(projectId)!.payload.meta.name).toBe('Theirs')
    expect(fake.rows.get(id)!.payload.meta.name).toBe('Mine (copy)')
    expect(useCloud.getState().active!.id).toBe(id)
  })

  it('take-server snapshots the local version and loads theirs', async () => {
    await resolveTakeServer()
    expect(useStore.getState().project.meta.name).toBe('Theirs')
    expect(useStore.getState().dirty).toBe(false)
    const snaps = idb.get(`hohplan:cloud:${ownerId}:snapshots`) as { json: string }[]
    expect(JSON.parse(snaps[0].json).meta.name).toBe('Mine')
  })
})

describe('roles and access', () => {
  it('viewers are read-only: edits are no-ops and nothing is saved', async () => {
    const viewerId = fake.addUser('viewer@example.test')
    fake.rows.get(projectId)!.members.set(viewerId, 'viewer')
    await fake.signInAs(viewerId)
    await vi.waitFor(() => expect(useCloud.getState().user?.id).toBe(viewerId))
    await openCloudProject(projectId)
    expect(useStore.getState().readOnly).toBe(true)
    edit('Hacked')
    useStore.getState().undo()
    expect(useStore.getState().project.meta.name).toBe('Cloud')
    await flushSave()
    expect(fake.saveCalls).toHaveLength(0)
  })

  it('losing access mid-session stops saving and keeps the local edits', async () => {
    const editorId = fake.addUser('editor@example.test')
    fake.rows.get(projectId)!.members.set(editorId, 'editor')
    await fake.signInAs(editorId)
    await vi.waitFor(() => expect(useCloud.getState().user?.id).toBe(editorId))
    await openCloudProject(projectId)
    fake.rows.get(projectId)!.members.delete(editorId)
    edit('Unsaved')
    await vi.waitFor(() => expect(useCloud.getState().saveState).toBe('forbidden'))
    expect(useStore.getState().project.meta.name).toBe('Unsaved')
  })
})

describe('isolation and recovery', () => {
  it('a late response for the previous project never touches the next one', async () => {
    const otherId = await fake.createProject(createProject('Other', false))
    await openCloudProject(projectId)
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const orig = fake.saveProject.bind(fake)
    fake.saveProject = async (a) => {
      await gate
      return orig(a)
    }
    edit('A edit')
    await vi.waitFor(() => expect(useCloud.getState().saveState).toBe('saving'))
    fake.saveProject = orig
    await openCloudProject(otherId)
    release()
    await new Promise((r) => setTimeout(r, 20))
    expect(useCloud.getState().active).toMatchObject({ id: otherId, revision: 1 })
    expect(useStore.getState().project.meta.name).toBe('Other')
    expect(useCloud.getState().saveState).toBe('saved')
  })

  it('a pending debounce is dropped on project switch (it cannot save into the wrong project)', async () => {
    const otherId = await fake.createProject(createProject('Other', false))
    timing.saveDebounceMs = 30
    await openCloudProject(projectId)
    edit('Never sent')
    await openCloudProject(otherId)
    await new Promise((r) => setTimeout(r, 60))
    expect(fake.saveCalls).toHaveLength(0)
    expect(fake.rows.get(otherId)!.payload.meta.name).toBe('Other')
  })

  it('restores an unsaved draft after a reload and saves it', async () => {
    const draft = createProject('Draft edits', false)
    idb.set(`hohplan:cloud:${ownerId}:draft:${projectId}`, { baseRevision: 1, savedAt: 'x', json: serializeProject(draft), dirty: true })
    const res = await openCloudProject(projectId)
    expect(res.restoredDraft).toBe(true)
    await saved()
    expect(fake.rows.get(projectId)!.payload.meta.name).toBe('Draft edits')
  })

  it('a draft based on an older revision opens as a conflict instead of overwriting', async () => {
    fake.externalSave(projectId, createProject('Theirs', false))
    idb.set(`hohplan:cloud:${ownerId}:draft:${projectId}`, { baseRevision: 1, savedAt: 'x', json: serializeProject(createProject('Old draft', false)), dirty: true })
    await openCloudProject(projectId)
    expect(useCloud.getState()).toMatchObject({ saveState: 'conflict', conflictRevision: 2 })
    expect(useStore.getState().project.meta.name).toBe('Old draft')
    expect(fake.saveCalls).toHaveLength(0)
  })

  it('sign-out closes the project and clears that account’s cached drafts and snapshots', async () => {
    idb.set(`hohplan:cloud:${ownerId}:draft:${projectId}`, { dirty: false })
    idb.set(`hohplan:cloud:${ownerId}:snapshots`, [])
    idb.set('hohplan:cloud:someoneElse:snapshots', [])
    idb.set('hohplan:autosave', { local: true })
    await openCloudProject(projectId)
    await signOut()
    expect(useCloud.getState()).toMatchObject({ user: null, active: null })
    expect([...idb.keys()].sort()).toEqual(['hohplan:autosave', 'hohplan:cloud:someoneElse:snapshots'])
  })

  it('closing leaves the local store editable again', async () => {
    const viewerId = fake.addUser('v2@example.test')
    fake.rows.get(projectId)!.members.set(viewerId, 'viewer')
    await fake.signInAs(viewerId)
    await vi.waitFor(() => expect(useCloud.getState().user?.id).toBe(viewerId))
    await openCloudProject(projectId)
    closeCloudProject()
    expect(useStore.getState().readOnly).toBe(false)
  })
})

describe('local-only builds', () => {
  it('without a backend the app stays in local mode', async () => {
    await initCloud(null)
    expect(useCloud.getState()).toMatchObject({ enabled: false, mode: 'local', active: null })
  })
})
