import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import '../src/core/i18n'
import { App } from '../src/App'
import { useStore } from '../src/core/store/store'
import { deserializeProject } from '../src/core/persistence/serialize'
import { applyReport, parseReport } from '../src/core/engine/report'

const fs: { readFileSync: (path: string, enc: string) => string } = await import('node:fs' as string)

afterEach(cleanup)

const metrics = () => useStore.getState().project.documents['qa.balance'].data.metrics as { name: string; key?: string; current?: number }[]

function load(withReport = true) {
  const p = deserializeProject(fs.readFileSync('examples/cinderholm.hohplan.json', 'utf8')).project
  // The example was saved with an engine report; each test sets its own (or none).
  delete p.meta.engine?.report
  if (withReport) {
    const report = {
      format: 'hoh-engine-report',
      v: 1,
      engine: 'unity',
      engineVersion: '6000.0.40f1',
      generatedAt: '2026-11-21T12:00:00Z',
      metrics: [
        { key: 'progress.act1_hours', value: 4.4, samples: 6, min: 3.9, max: 5.1, build: '0.3.1' },
        { key: 'combat.deaths_per_hour', value: 1.2, samples: 14 },
        { key: 'economy.gold_per_hour', value: 310, samples: 9 },
      ],
    }
    applyReport(p, parseReport(JSON.stringify(report), p).report)
  }
  useStore.getState().loadProject(p, 'x')
  window.location.hash = '#/doc/qa.balance?s=metrics'
  render(<App />)
}

describe('Balance plan › Measured', () => {
  it('shows measured values against targets and takes one over as current', async () => {
    load()
    const table = await screen.findByRole('table')
    const act1 = within(table).getByRole('button', { name: 'Act 1 completion time' }).closest('tr')!
    expect(act1.textContent).toMatch(/4\.4 h.*n = 6 · 3\.9–5\.1 · build 0\.3\.1.*in range.*\+10 % vs target/)
    const deaths = within(table).getByRole('button', { name: 'Deaths per hour (Medium)' }).closest('tr')!
    expect(within(deaths).getByText('above range')).toBeTruthy()
    fireEvent.click(within(act1).getByRole('button', { name: 'Use measured 4.4 as current for Act 1 completion time' }))
    expect(metrics().find((m) => m.name === 'Act 1 completion time')!.current).toBe(4.4)
    act(() => useStore.getState().undo())
    expect(metrics().find((m) => m.name === 'Act 1 completion time')!.current).toBe(5.2)
  })

  it('adds a measured key that no metric names', async () => {
    load()
    const extra = await screen.findByRole('region', { name: 'Measured but not planned' })
    fireEvent.click(within(extra).getByRole('button', { name: 'Add as metric' }))
    expect(metrics().at(-1)).toMatchObject({ name: 'Economy: gold per hour', key: 'economy.gold_per_hour' })
    expect(screen.queryByRole('region', { name: 'Measured but not planned' })).toBeNull()
  })

  it('explains how to get measurements without a report', async () => {
    load(false)
    expect((await screen.findByRole('note')).textContent).toMatch(/No engine report yet/)
  })
})
