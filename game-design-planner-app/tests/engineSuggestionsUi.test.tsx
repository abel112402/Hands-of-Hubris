import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import '../src/core/i18n'
import { App } from '../src/App'
import { useStore } from '../src/core/store/store'
import { deserializeProject } from '../src/core/persistence/serialize'
import { buildIR } from '../src/core/engine/ir'
import { applyReport, currentIrHash, parseReport } from '../src/core/engine/report'
import { ARCH_DOC } from '../src/core/architecture'
import { DATA_DOC } from '../src/core/dataDriven'

const fs: { readFileSync: (path: string, enc: string) => string } = await import('node:fs' as string)

afterEach(cleanup)

const classStatus = (name: string) => useStore.getState().project.documents[ARCH_DOC].data.classes.find((c: { name: string }) => c.name === name).status

function load() {
  const p = deserializeProject(fs.readFileSync('examples/cinderholm.hohplan.json', 'utf8')).project
  const { ir } = buildIR(p)
  const report = {
    format: 'hoh-engine-report',
    v: 1,
    engine: 'unity',
    engineVersion: '6000.0.40f1',
    generatedAt: '2026-11-21T10:00:00Z',
    irHash: currentIrHash(p),
    records: ir.records.map((r) => ({ plannerId: r.plannerId, schema: r.schema, key: r.key, status: r.key === 'bld.house' ? 'incomplete' : 'implemented' })),
    classes: ir.classes.map((c) => ({ plannerId: c.id, name: c.name, methods: c.methods.length, status: 'implemented', todo: 0 })),
  }
  applyReport(p, parseReport(JSON.stringify(report), p).report)
  useStore.getState().loadProject(p, 'x')
  window.location.hash = `#/doc/${DATA_DOC}?s=schemas`
  render(<App />)
}

describe('status suggestions panel', () => {
  it('accepts one suggestion as an undo step, and dismisses the rest', async () => {
    load()
    fireEvent.click(await screen.findByRole('button', { name: 'Engine export' }))
    const panel = screen.getByRole('region', { name: 'Status suggestions' })
    expect(within(panel).getByText(/Status suggestions from Unity 6000\.0\.40f1/)).toBeTruthy()
    expect(classStatus('NeedState')).toBe('Planned')
    fireEvent.click(within(panel).getByRole('button', { name: 'Accept NeedState: Done' }))
    expect(classStatus('NeedState')).toBe('Done')
    expect(within(screen.getByRole('region', { name: 'Status suggestions' })).queryByRole('button', { name: 'Accept NeedState: Done' })).toBeNull()
    act(() => useStore.getState().undo())
    expect(classStatus('NeedState')).toBe('Planned')

    fireEvent.click(within(screen.getByRole('region', { name: 'Status suggestions' })).getByRole('button', { name: 'Dismiss all' }))
    expect(classStatus('NeedState')).toBe('Planned')
    // Only the warning is left: the house is “Ready for testing” in the plan but incomplete in the engine.
    const left = screen.getByRole('region', { name: 'Status suggestions' })
    expect(within(left).queryByRole('button', { name: /^Accept/ })).toBeNull()
    expect(within(left).getByText(/1 entry marked further in the plan than in the engine/)).toBeTruthy()
    expect(within(left).getByText(/bld\.house is incomplete in the engine/)).toBeTruthy()
  })
})
