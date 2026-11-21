import type { Project } from '../model/types'
import { buildIR } from './ir'

/**
 * Client of the engine live link (Unity bridge: PlannerLiveLink). Talks only to 127.0.0.1 on the given port, with the
 * token the engine shows. Available in the dev server and in builds made with VITE_ENGINE_BRIDGE=1; a normal
 * production build's CSP blocks it.
 */
export const liveLinkAvailable = () => import.meta.env.DEV || import.meta.env.VITE_ENGINE_BRIDGE === '1'

export type LiveLink = { port: number; token: string }
export type LiveStatus = { engine: string; engineVersion: string; project: string; playing: boolean; records: number }
export type LiveResult<T> = { ok: true; data: T } | { ok: false; error: string }

const TIMEOUT_MS = 8000

async function call<T>(link: LiveLink, method: 'GET' | 'POST', path: string, body?: unknown): Promise<LiveResult<T>> {
  if (!Number.isInteger(link.port) || link.port < 1 || link.port > 65535) return { ok: false, error: 'The port is not a number from 1 to 65535.' }
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(`http://127.0.0.1:${link.port}${path}`, {
      method,
      headers: { 'X-HoH-Token': link.token, ...(body !== undefined && { 'Content-Type': 'application/json' }) },
      ...(body !== undefined && { body: JSON.stringify(body) }),
      signal: ctrl.signal,
    })
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (!res.ok) return { ok: false, error: typeof json.error === 'string' ? json.error : `The engine answered ${res.status}.` }
    return { ok: true, data: json as T }
  } catch (e) {
    return { ok: false, error: (e as Error).name === 'AbortError' ? 'The engine did not answer in time.' : 'Could not reach the engine. Is it open, with the live link on and this port?' }
  } finally {
    clearTimeout(timer)
  }
}

export const liveStatus = (link: LiveLink) => call<LiveStatus>(link, 'GET', '/status')
export const livePing = (link: LiveLink, plannerId: string) => call<{ key: string; assetPath: string }>(link, 'POST', '/ping', { plannerId })

/** The planner's current values of every record, as the export would write them, for the running game. */
export function liveValues(p: Project): { records: { plannerId: string; values: Record<string, unknown> }[] } {
  return { records: buildIR(p).ir.records.map((r) => ({ plannerId: r.plannerId, values: r.values })) }
}

export const livePushValues = (link: LiveLink, p: Project) => call<{ applied: number; problems: string[] }>(link, 'POST', '/values', liveValues(p))
