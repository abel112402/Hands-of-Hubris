import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

const idb = vi.hoisted(() => new Map<string, unknown>())
vi.mock('idb-keyval', () => ({
  get: async (k: string) => idb.get(k),
  set: async (k: string, v: unknown) => void idb.set(k, structuredClone(v)),
  del: async (k: string) => void idb.delete(k),
  keys: async () => [...idb.keys()],
}))

import '../src/core/i18n'
import { App } from '../src/App'
import { __resetCloudForTests, timing, useCloud } from '../src/core/cloud/session'
import { createProject } from '../src/core/model/project'
import { useStore } from '../src/core/store/store'
import { FakeCloud } from './helpers/fakeCloud'

let fake: FakeCloud
let ownerId: string

beforeEach(() => {
  idb.clear()
  localStorage.clear()
  sessionStorage.clear()
  Object.assign(timing, { saveDebounceMs: 5, draftDebounceMs: 1, retryMs: [5] })
  fake = new FakeCloud()
  ownerId = fake.addUser('owner@example.test')
  useStore.getState().loadProject(createProject('Local', false))
  location.hash = '#/'
})

afterEach(() => {
  cleanup()
  __resetCloudForTests()
})

describe('signed out', () => {
  it('shows the landing page with magic-link sign-in and enabled OAuth providers', async () => {
    render(<App cloudBackend={fake} />)
    expect(await screen.findByRole('heading', { name: 'Plan your game, together' })).toBeTruthy()
    expect(await screen.findByRole('button', { name: 'Continue with GitHub' })).toBeTruthy()
    fireEvent.change(screen.getByLabelText('E-mail address'), { target: { value: 'new@example.test' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send sign-in link' }))
    expect(await screen.findByText('Check your e-mail')).toBeTruthy()
    expect(fake.emailsSent).toEqual(['new@example.test'])
  })

  it('old #/doc links keep their destination through the landing page, and local mode opens them', async () => {
    location.hash = '#/doc/design.player'
    render(<App cloudBackend={fake} />)
    await screen.findByRole('heading', { name: 'Plan your game, together' })
    expect(location.hash).toContain('next=%2Fdoc%2Fdesign.player')
    fireEvent.click(screen.getByRole('button', { name: 'Use without an account' }))
    await waitFor(() => expect(location.hash).toBe('#/doc/design.player'))
    expect(useCloud.getState().mode).toBe('local')
    expect(localStorage.getItem('hoh.mode')).toBe('local')
  })

  it('project pages require sign-in', async () => {
    location.hash = '#/projects'
    render(<App cloudBackend={fake} />)
    await screen.findByRole('heading', { name: 'Plan your game, together' })
  })
})

describe('signed in', () => {
  beforeEach(async () => {
    await fake.signInAs(ownerId)
  })

  it('lists projects, creates one with genres and opens it in the workspace', async () => {
    location.hash = '#/projects'
    render(<App cloudBackend={fake} />)
    expect(await screen.findByText(/You have no projects yet/)).toBeTruthy()
    fireEvent.click(screen.getAllByRole('button', { name: 'New project' })[0])
    fireEvent.change(screen.getByLabelText('Project name'), { target: { value: 'My RPG' } })
    fireEvent.click(screen.getByRole('checkbox', { name: /^RPG/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Create project' }))
    await waitFor(() => expect(location.hash).toBe('#/'))
    expect(await screen.findByText('Saved to cloud')).toBeTruthy()
    expect(useStore.getState().project.meta.profile?.genres).toEqual(['rpg'])
    const row = [...fake.rows.values()][0]
    expect(row.payload.meta.name).toBe('My RPG')
  })

  it('claims invitations when the project list loads and shows shared projects with their role', async () => {
    const otherId = fake.addUser('alice@example.test')
    await fake.signInAs(otherId)
    const pid = await fake.createProject(createProject('Alice game', false))
    await fake.inviteMember(pid, 'owner@example.test', 'viewer')
    await fake.signInAs(ownerId)
    location.hash = '#/projects'
    render(<App cloudBackend={fake} />)
    const row = (await screen.findByText('Alice game')).closest('li')!
    expect(within(row).getAllByText(/Viewer/).length).toBeGreaterThan(0)
    expect(within(row).getByText(/shared by alice@example.test/)).toBeTruthy()
    expect(within(row).getByRole('button', { name: 'Leave' })).toBeTruthy()
  })

  it('opens a shared project read-only for viewers', async () => {
    const otherId = fake.addUser('alice@example.test')
    await fake.signInAs(otherId)
    const pid = await fake.createProject(createProject('Alice game', false))
    fake.rows.get(pid)!.members.set(ownerId, 'viewer')
    await fake.signInAs(ownerId)
    location.hash = `#/projects/${pid}`
    render(<App cloudBackend={fake} />)
    expect(await screen.findByText(/You are a viewer of this shared project/)).toBeTruthy()
    expect(screen.getByText('Read-only')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('shows conflict choices when someone saved first', async () => {
    const pid = await fake.createProject(createProject('Team game', false))
    location.hash = `#/projects/${pid}`
    render(<App cloudBackend={fake} />)
    await screen.findByText('Saved to cloud')
    fake.externalSave(pid, createProject('Theirs', false))
    fireEvent.change(screen.getByLabelText('Project name'), { target: { value: 'Mine' } })
    const banner = await screen.findByRole('alert')
    expect(within(banner).getByText(/Someone saved a newer version \(revision 2\)/)).toBeTruthy()
    for (const name of ['Download my version', 'Load their version', 'Save mine as a new project', 'Overwrite with mine']) expect(within(banner).getByRole('button', { name })).toBeTruthy()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    fireEvent.click(within(banner).getByRole('button', { name: 'Overwrite with mine' }))
    await screen.findByText('Saved to cloud')
    expect(fake.rows.get(pid)!.payload.meta.name).toBe('Mine')
  })

  it('owner invites a member from the members page', async () => {
    const pid = await fake.createProject(createProject('Team game', false))
    location.hash = `#/projects/${pid}/settings`
    render(<App cloudBackend={fake} />)
    expect(await screen.findByRole('heading', { name: 'Members & history' })).toBeTruthy()
    fireEvent.change(screen.getByRole('textbox', { name: 'E-mail address' }), { target: { value: 'Bob@Example.test' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'Role' }), { target: { value: 'viewer' } })
    fireEvent.click(screen.getByRole('button', { name: 'Invite' }))
    expect(await screen.findByText(/Invitation saved for bob@example.test/)).toBeTruthy()
    expect(fake.invites).toMatchObject([{ projectId: pid, email: 'bob@example.test', role: 'viewer' }])
    expect(await screen.findByRole('button', { name: 'Revoke' })).toBeTruthy()
  })

  it('local mode stays available from the project list', async () => {
    location.hash = '#/projects'
    render(<App cloudBackend={fake} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Work offline (local)' }))
    await waitFor(() => expect(location.hash).toBe('#/'))
    expect(await screen.findByText('What do you want to plan?')).toBeTruthy()
    expect(useCloud.getState().mode).toBe('local')
  })
})
