import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '../src/core/i18n'
import { App } from '../src/App'
import { useStore } from '../src/core/store/store'
import { createProject } from '../src/core/model/project'
import { ARCH_DOC, CODING_DOC } from '../src/core/coding'

afterEach(cleanup)

const doc = () => useStore.getState().project.documents[CODING_DOC].data

function load() {
  const p = createProject('UI', false)
  p.documents[ARCH_DOC] = { moduleVersion: 2, data: { modules: [{ id: 'm1', name: 'Core', assembly: 'HoH.Core' }, { id: 'm2', name: 'Hud', assembly: 'hoh.hud' }] } }
  p.documents[CODING_DOC] = {
    moduleVersion: 2,
    data: {
      naming: [
        { id: 'i', name: 'Interfaces', target: 'Interface', casing: 'PascalCase', prefix: 'I', example: 'IDamageable', counterExample: 'Damageable' },
        { id: 'ns', name: 'Namespaces', target: 'Namespace', casing: 'PascalCase', prefix: 'HoH.' },
      ],
      folders: [{ id: 'p', name: '_Project' }, { id: 's', name: 'Scripts', parent: 'p', module: 'm1', asmdef: true }],
      branches: [
        { id: 'main', name: 'main', pattern: 'main', lifetime: 'Permanent', protected: true },
        { id: 'feat', name: 'feature', pattern: 'feature/<ticket>-<desc>', lifetime: 'Days', from: 'main', mergesInto: ['main'] },
      ],
      git: { commitFormat: 'Conventional Commits' },
      review: [{ id: 'c', name: 'No GC in Update', category: 'Performance', severity: 'Major', enforcement: 'Manual' }],
    },
  }
  useStore.getState().loadProject(p, 'x')
}

describe('coding standards editor', () => {
  it('tests a typed name against the rules and offers the fixed name', async () => {
    load()
    window.location.hash = `#/doc/${CODING_DOC}?s=naming`
    render(<App />)
    fireEvent.change(await screen.findByLabelText('Try a name'), { target: { value: 'damageable' } })
    expect(screen.getByText(/0 of 2 rules pass/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Try “IDamageable”' }))
    expect(screen.getByText(/1 of 2 rules pass/)).toBeTruthy()
    expect(screen.getByText('hoh.hud', { selector: 'code' })).toBeTruthy()
  })

  it('adds a sub-folder and a folder for an unplaced module', async () => {
    load()
    window.location.hash = `#/doc/${CODING_DOC}?s=folders`
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Add a folder inside Scripts' }))
    expect(doc().folders.at(-1)).toMatchObject({ name: 'New folder', parent: 's' })
    fireEvent.click(screen.getByRole('button', { name: '+ Folder for Hud' }))
    expect(doc().folders.at(-1)).toMatchObject({ name: 'Hud', parent: 's', module: 'm2', asmdef: true })
    expect(screen.getByText(/all placed/)).toBeTruthy()
  })

  it('matches a branch name to its lane and checks a commit message', async () => {
    load()
    window.location.hash = `#/doc/${CODING_DOC}?s=branches`
    render(<App />)
    fireEvent.change(await screen.findByPlaceholderText('e.g. feature/HOH-12-hunger'), { target: { value: 'feature/HOH-1-x' } })
    expect(screen.getByText('✓ feature')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Branch feature' }).getAttribute('class')).toContain('hit')
    fireEvent.change(screen.getByPlaceholderText('e.g. feat(npc): add hunger decay'), { target: { value: 'added stuff' } })
    expect(screen.getByText(/expected type\(scope\): summary/)).toBeTruthy()
  })

  it('moves a review check left on the enforcement board', async () => {
    load()
    window.location.hash = `#/doc/${CODING_DOC}?s=review`
    render(<App />)
    expect(await screen.findByText('0/3 automated')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Enforcement of No GC in Update'), { target: { value: 'Roslyn analyzer' } })
    expect(doc().review[0].enforcement).toBe('Roslyn analyzer')
    expect(screen.getByText('1/3 automated')).toBeTruthy()
  })
})
