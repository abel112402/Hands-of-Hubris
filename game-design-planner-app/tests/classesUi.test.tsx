import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '../src/core/i18n'
import { App } from '../src/App'
import { useStore } from '../src/core/store/store'
import { createProject } from '../src/core/model/project'
import { ARCH_DOC } from '../src/core/architecture'

afterEach(cleanup)

const classes = () => useStore.getState().project.documents[ARCH_DOC].data.classes

function load() {
  const p = createProject('UI', false)
  p.documents[ARCH_DOC] = {
    moduleVersion: 2,
    data: {
      classes: [
        { id: 'dmg', name: 'IDamageable', kind: 'Interface', methods: ['TakeDamage(amount: float): float'] },
        { id: 'hp', name: 'Health', kind: 'Component', implements: ['dmg'], fields: ['-max: float'], methods: ['+TakeDamage(amount: float): float'] },
        { id: 's', name: 'Point', kind: 'Struct', base: 'hp' },
      ],
    },
  }
  useStore.getState().loadProject(p, 'x')
}

async function open() {
  load()
  window.location.hash = `#/doc/${ARCH_DOC}?s=classes`
  render(<App />)
  return screen.findByRole('img', { name: 'Class diagram' })
}

describe('class diagram view', () => {
  it('draws the classes, flags rule breaks and selects a class from a finding', async () => {
    await open()
    expect(screen.getByRole('button', { name: 'Class Health' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Class IDamageable' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Point: a struct cannot inherit from another class.' }))
    expect(await screen.findByDisplayValue('Point')).toBeTruthy()
  })

  it('exports Mermaid and imports a pasted diagram as one undo step', async () => {
    await open()
    fireEvent.click(screen.getByText('Mermaid class diagram (export / import)'))
    expect((screen.getByLabelText('Mermaid export') as HTMLTextAreaElement).value).toContain('IDamageable <|.. Health')
    fireEvent.change(screen.getByLabelText('Mermaid to import'), { target: { value: 'classDiagram\n  Health <|-- Boss\n  class Boss {\n    <<Actor / prefab root>>\n    -phase: int\n  }\n  Health : +regen: float' } })
    fireEvent.click(screen.getByRole('button', { name: 'Import classes' }))
    expect(screen.getByText('1 class added, 0 updated.')).toBeTruthy()
    const boss = classes().find((c: { name: string }) => c.name === 'Boss')
    expect(boss).toMatchObject({ kind: 'Actor / prefab root', base: 'hp', fields: ['-phase: int'] })
    expect(classes().find((c: { name: string }) => c.name === 'Health').fields).toEqual(['-max: float'])
    expect(await screen.findByRole('button', { name: 'Class Boss' })).toBeTruthy()
    useStore.getState().undo()
    expect(classes().some((c: { name: string }) => c.name === 'Boss')).toBe(false)
  })
})
