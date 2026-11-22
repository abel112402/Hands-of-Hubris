import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import '../src/core/i18n'
import { App } from '../src/App'
import { useStore } from '../src/core/store/store'
import { deserializeProject } from '../src/core/persistence/serialize'
import { buildIR } from '../src/core/engine/ir'
import { currentIrHash, storedReport } from '../src/core/engine/report'
import { DATA_DOC } from '../src/core/dataDriven'
import { MemoryFolder } from './memoryFolder'

// IndexedDB is not in jsdom: keep links in a Map.
const db = vi.hoisted(() => new Map<string, unknown>())
vi.mock('idb-keyval', () => ({
  get: async (k: string) => db.get(k),
  set: async (k: string, v: unknown) => void db.set(k, v),
  del: async (k: string) => void db.delete(k),
  keys: async () => [...db.keys()],
}))

const fs: { readFileSync: (path: string, enc: string) => string } = await import('node:fs' as string)
// idb-keyval is mocked above; the planner only checks that IndexedDB exists.
;(globalThis as { indexedDB?: unknown }).indexedDB ??= {}

afterEach(() => {
  cleanup()
  db.clear()
  delete (window as { showDirectoryPicker?: unknown }).showDirectoryPicker
})

function setup() {
  const p = deserializeProject(fs.readFileSync('examples/cinderholm.hohplan.json', 'utf8')).project
  useStore.getState().loadProject(p, 'x')
  const game = new MemoryFolder('MyGame')
  game.put('Assets/Scenes/Main.unity', 'x')
  game.put('ProjectSettings/ProjectVersion.txt', 'x')
  ;(window as { showDirectoryPicker?: unknown }).showDirectoryPicker = async () => game
  window.location.hash = `#/doc/${DATA_DOC}?s=schemas`
  render(<App />)
  return game
}

async function openView() {
  fireEvent.click(await screen.findByRole('button', { name: 'Engine export' }))
  return screen.findByRole('region', { name: 'Engine folder' })
}

describe('linked engine folder', () => {
  it('links a Unity project, writes the export into Assets/HoHPlanner, and again after a save', async () => {
    const game = setup()
    const panel = await openView()
    fireEvent.click(screen.getByRole('button', { name: 'Link engine folder…' }))
    expect(await screen.findByText('MyGame/Assets/HoHPlanner')).toBeTruthy()
    expect((screen.getByLabelText('Write the export on every save (Ctrl+S)') as HTMLInputElement).checked).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Write now' }))
    await waitFor(() => expect(panel.textContent).toMatch(/Last write .*: \d+ written, 0 unchanged, 0 removed, 0 of your class files kept; the engine recompiles/))
    expect(game.read('Assets/HoHPlanner/Data/Item/item.plank.json')).toContain('"value": 2')

    useStore.getState().mutate((p) => void (p.documents['design.items'].data.items[0].value = 3))
    const { exportOnSave } = await import('../src/ui/engineLink')
    await exportOnSave()
    expect(game.read('Assets/HoHPlanner/Data/Item/item.plank.json')).toContain('"value": 3')
    await waitFor(() => expect(panel.textContent).toMatch(/3 written, \d+ unchanged, 0 removed/))

    fireEvent.click(screen.getByLabelText('Write the export on every save (Ctrl+S)'))
    await waitFor(() => expect((screen.getByLabelText('Write the export on every save (Ctrl+S)') as HTMLInputElement).checked).toBe(false))
    useStore.getState().mutate((p) => void (p.documents['design.items'].data.items[0].value = 4))
    await exportOnSave()
    expect(game.read('Assets/HoHPlanner/Data/Item/item.plank.json')).toContain('"value": 3')
  })

  it('reads the report the engine wrote into the folder', async () => {
    const game = setup()
    await openView()
    fireEvent.click(screen.getByRole('button', { name: 'Link engine folder…' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Read report' }))
    expect(await screen.findByText(/No hoh-engine-report\.json in the folder yet/)).toBeTruthy()
    const p = useStore.getState().project
    const { ir } = buildIR(p)
    game.put(
      'Assets/HoHPlanner/hoh-engine-report.json',
      JSON.stringify({ format: 'hoh-engine-report', v: 1, engine: 'unity', engineVersion: '6000.0.40f1', generatedAt: '2026-11-20T18:00:00Z', project: { name: p.meta.name }, irHash: currentIrHash(p), records: ir.records.map((r) => ({ plannerId: r.plannerId, schema: r.schema, key: r.key, status: 'implemented' })), classes: [] }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Read report' }))
    expect(await screen.findByText(/^Unity 6000\.0\.40f1: 75 records: 75 done/)).toBeTruthy()
    expect(storedReport(useStore.getState().project)?.generatedAt).toBe('2026-11-20T18:00:00Z')
    // Coming back to the planner with no newer report changes nothing.
    const before = useStore.getState().past.length
    window.dispatchEvent(new Event('focus'))
    await new Promise((r) => setTimeout(r, 20))
    expect(useStore.getState().past.length).toBe(before)
  })

  it('points to the zip in a browser that cannot write folders', async () => {
    setup()
    delete (window as { showDirectoryPicker?: unknown }).showDirectoryPicker
    const panel = await openView()
    expect(panel.textContent).toMatch(/cannot write into folders, so use Download \.zip/)
  })

  it('stops on a file changed by hand, previews it, overwrites only when asked, and restores', async () => {
    const game = setup()
    const panel = await openView()
    fireEvent.click(screen.getByRole('button', { name: 'Link engine folder…' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Write now' }))
    await waitFor(() => expect(panel.textContent).toMatch(/\d+ written/))
    const plank = 'Assets/HoHPlanner/Data/Item/item.plank.json'
    game.put(plank, '{ "mine": true }')
    useStore.getState().mutate((p) => void (p.documents['design.items'].data.items[0].value = 3))

    fireEvent.click(screen.getByRole('button', { name: 'Preview changes' }))
    expect(await screen.findByText(/The next write: .*1 conflict: Data\/Item\/item\.plank\.json \(changed since the last export\)/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Write now' }))
    await waitFor(() => expect(panel.textContent).toMatch(/Stopped before writing: 1 file changed/))
    expect(game.read(plank)).toBe('{ "mine": true }')

    fireEvent.click(screen.getByRole('button', { name: 'Overwrite them (keep a backup)' }))
    await waitFor(() => expect(panel.textContent).toMatch(/1 conflict overwritten \(backup in \.hoh-backup\//))
    expect(game.read(plank)).toContain('"value": 3')
    expect(screen.queryByRole('button', { name: 'Overwrite them (keep a backup)' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Restore last write' }))
    await waitFor(() => expect(panel.textContent).toMatch(/Restored the folder as it was before the write of/))
    expect(game.read(plank)).toBe('{ "mine": true }')
  })
})
