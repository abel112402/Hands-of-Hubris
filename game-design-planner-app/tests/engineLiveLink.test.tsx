import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import '../src/core/i18n'
import { App } from '../src/App'
import { buildCsp } from '../vite.config'
import { useStore } from '../src/core/store/store'
import { deserializeProject } from '../src/core/persistence/serialize'
import { livePushValues, liveStatus, liveValues } from '../src/core/engine/liveLink'
import { DATA_DOC } from '../src/core/dataDriven'

const fs: { readFileSync: (path: string, enc: string) => string } = await import('node:fs' as string)
const cinderholm = () => deserializeProject(fs.readFileSync('examples/cinderholm.hohplan.json', 'utf8')).project

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  sessionStorage.clear()
})

/** A fake engine: answers like PlannerLiveLink and records what it was sent. */
function fakeEngine(token = 'secret') {
  const calls: { url: string; init: RequestInit }[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init })
      const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
      if ((init.headers as Record<string, string>)['X-HoH-Token'] !== token) return json(401, { error: 'Wrong or missing token.' })
      if (url.endsWith('/status')) return json(200, { engine: 'unity', engineVersion: '6000.0.40f1', project: 'Cinderholm (example)', playing: true, records: 51 })
      if (url.endsWith('/ping')) return json(200, { ok: true, key: 'item.plank', assetPath: 'Assets/HoHPlanner/Records/ItemDefinition/item.plank.asset' })
      if (url.endsWith('/values')) return json(200, { applied: JSON.parse(String(init.body)).records.length, problems: [] })
      return json(404, { error: 'No such endpoint.' })
    }),
  )
  return calls
}

describe('production CSP and the live link', () => {
  it('keeps the normal production CSP free of local hosts', () => {
    const csp = buildCsp({})
    expect(csp).not.toMatch(/127\.0\.0\.1|localhost/)
    expect(csp).toContain("connect-src 'self' https://api.openai.com https://api.anthropic.com https://generativelanguage.googleapis.com;")
  })

  it('allows 127.0.0.1 and localhost only in a build made for the live link, and changes nothing else', () => {
    const normal = buildCsp({}).split('; ')
    const bridge = buildCsp({ VITE_ENGINE_BRIDGE: '1' }).split('; ')
    expect(bridge.find((d) => d.startsWith('connect-src'))).toBe("connect-src 'self' https://api.openai.com https://api.anthropic.com https://generativelanguage.googleapis.com http://127.0.0.1:* http://localhost:*")
    expect(bridge.filter((d) => !d.startsWith('connect-src'))).toEqual(normal.filter((d) => !d.startsWith('connect-src')))
    expect(buildCsp({ VITE_ENGINE_BRIDGE: 'true' })).not.toContain('127.0.0.1')
  })
})

describe('live link client', () => {
  it('talks to 127.0.0.1 with the token and reports readable errors', async () => {
    const calls = fakeEngine()
    const ok = await liveStatus({ port: 51701, token: 'secret' })
    expect(ok).toMatchObject({ ok: true, data: { engine: 'unity', playing: true } })
    expect(calls[0].url).toBe('http://127.0.0.1:51701/status')
    expect(await liveStatus({ port: 51701, token: 'nope' })).toEqual({ ok: false, error: 'Wrong or missing token.' })
    expect(await liveStatus({ port: 99999, token: 'secret' })).toMatchObject({ ok: false, error: expect.stringContaining('port') })
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))))
    expect(await liveStatus({ port: 51701, token: 'secret' })).toMatchObject({ ok: false, error: expect.stringContaining('Could not reach the engine') })
  })

  it('pushes every record with the values the export would write', async () => {
    const calls = fakeEngine()
    const p = cinderholm()
    const r = await livePushValues({ port: 51701, token: 'secret' }, p)
    expect(r).toMatchObject({ ok: true, data: { applied: 75 } })
    const sent = JSON.parse(String(calls[0].init.body))
    expect(sent).toEqual(liveValues(p))
    expect(sent.records.find((x: { values: { id: string } }) => x.values.id === 'item.plank').values).toMatchObject({ name: 'Plank', value: 2 })
  })
})

describe('live link panel', () => {
  it('connects, shows a record in the engine and pushes values', async () => {
    const calls = fakeEngine()
    useStore.getState().loadProject(cinderholm(), 'x')
    window.location.hash = `#/doc/${DATA_DOC}?s=schemas`
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Engine export' }))
    const panel = screen.getByRole('region', { name: 'Live link' })
    fireEvent.change(within(panel).getByLabelText('Live link token'), { target: { value: 'secret' } })
    fireEvent.click(within(panel).getByRole('button', { name: 'Connect' }))
    expect(await within(panel).findByText(/Connected to Unity 6000\.0\.40f1, “Cinderholm \(example\)”: 51 records, in Play mode\./)).toBeTruthy()
    const plank = useStore.getState().project.documents['design.items'].data.items[0].id
    fireEvent.change(within(panel).getByLabelText('Record to show in the engine'), { target: { value: plank } })
    fireEvent.click(within(panel).getByRole('button', { name: 'Show in the engine' }))
    expect(await within(panel).findByText(/Selected item\.plank in the engine/)).toBeTruthy()
    expect(JSON.parse(String(calls.at(-1)!.init.body))).toEqual({ plannerId: plank })
    fireEvent.click(within(panel).getByRole('button', { name: 'Push values to Play mode' }))
    expect(await within(panel).findByText(/75 records updated in the running game\. Stopping Play mode restores them\./)).toBeTruthy()
    expect(sessionStorage.getItem('hohplan:liveLink:token')).toBe('secret')
  })
})
