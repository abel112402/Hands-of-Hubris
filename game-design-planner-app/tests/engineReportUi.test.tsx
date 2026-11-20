import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '../src/core/i18n'
import { App } from '../src/App'
import { useStore } from '../src/core/store/store'
import { deserializeProject } from '../src/core/persistence/serialize'
import { buildIR } from '../src/core/engine/ir'
import { currentIrHash, storedReport } from '../src/core/engine/report'
import { ARCH_DOC } from '../src/core/architecture'
import { DATA_DOC } from '../src/core/dataDriven'

const picked = vi.hoisted(() => ({ text: '' }))
vi.mock('../src/core/persistence/file', async (orig) => ({ ...(await orig<typeof import('../src/core/persistence/file')>()), pickWithInput: async () => ({ text: picked.text, name: 'hoh-engine-report.json' }) }))

const fs: { readFileSync: (path: string, enc: string) => string } = await import('node:fs' as string)

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function load() {
  const p = deserializeProject(fs.readFileSync('examples/cinderholm.hohplan.json', 'utf8')).project
  const { ir } = buildIR(p)
  picked.text = JSON.stringify({
    format: 'hoh-engine-report',
    v: 1,
    engine: 'unity',
    engineVersion: '6000.0.40f1',
    generatedAt: '2026-11-20T17:00:00.000Z',
    project: { name: p.meta.name },
    irHash: currentIrHash(p),
    records: ir.records.map((r) => ({ plannerId: r.plannerId, schema: r.schema, key: r.key, status: r.key === 'item.plank' ? 'incomplete' : 'implemented', issues: r.key === 'item.plank' ? ['icon: required, but empty.'] : [] })),
    classes: ir.classes.map((c) => ({ plannerId: c.id, name: c.name, status: c.name === 'Health' ? 'stub' : 'implemented', todo: c.name === 'Health' ? 1 : 0, methods: c.methods.length })),
  })
  useStore.getState().loadProject(p, 'x')
}

async function importReport() {
  const alert = vi.spyOn(window, 'alert').mockImplementation(() => {})
  const { importEngineReport } = await import('../src/ui/actions')
  await importEngineReport()
  return alert
}

describe('engine report in the planner', () => {
  it('imports the report as one undo step and shows the status per schema', async () => {
    load()
    window.location.hash = `#/doc/${DATA_DOC}?s=schemas`
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Engine export' }))
    expect(screen.getByText(/No engine report yet/)).toBeTruthy()
    const alert = await importReport()
    expect(alert.mock.calls[0][0]).toMatch(/^Unity 6000\.0\.40f1: 75 records: 74 done, 1 incomplete/)
    expect(await screen.findByText(/75 records: 74 done, 1 incomplete/)).toBeTruthy()
    const status = screen.getByRole('region', { name: 'Engine status' })
    expect(status.querySelector('tbody tr')!.textContent).toBe('Item16151000')
    fireEvent.click(screen.getByText('1 record to finish in the engine'))
    expect(screen.getByText(/icon: required, but empty\./)).toBeTruthy()
    useStore.getState().undo()
    expect(storedReport(useStore.getState().project)).toBeUndefined()
  })

  it('marks content entries and classes with what the engine reported', async () => {
    load()
    await importReport()
    const plank = useStore.getState().project.documents['design.items'].data.items[0].id
    window.location.hash = `#/doc/design.items?s=items&e=${plank}`
    render(<App />)
    expect((await screen.findAllByLabelText('Unity: item.plank — icon: required, but empty.')).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: 'Cards' }))
    expect(screen.getAllByLabelText(/^Unity: item\.\w+ is in the project$/).length).toBeGreaterThan(5)
    cleanup()
    window.location.hash = `#/doc/${ARCH_DOC}?s=classes`
    render(<App />)
    await screen.findByRole('img', { name: 'Class diagram' })
    const health = screen.getByRole('button', { name: 'Class Health' })
    expect(health.querySelector('.cd-status')!.textContent).toBe('Unity: 1 of 2 method bodies still to write◐ Unity 1 TODO')
    expect(health.querySelector('.cd-status')!.getAttribute('class')).toContain('warn')
  })
})
