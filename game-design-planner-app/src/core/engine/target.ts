import { archList } from '../architecture'
import type { Project } from '../model/types'
import type { EngineId } from './adapter'
import { getAdapter } from './adapters'

/** Every engine the planner knows. Whether one can generate code depends on ENGINE_ADAPTERS; without an adapter the export holds the engine-neutral part only. */
export const ENGINE_TARGETS: { id: EngineId; label: string; match: RegExp }[] = [
  { id: 'unity', label: 'Unity', match: /\bunity\b/i },
  { id: 'godot', label: 'Godot', match: /\bgodot\b/i },
  { id: 'unreal', label: 'Unreal Engine', match: /\bunreal\b|\bue ?[45]\b/i },
]
export const DEFAULT_ENGINE: EngineId = 'unity'

export type EngineTarget = { id: EngineId; label: string; from: 'setting' | 'stack' | 'default'; hasAdapter: boolean }

const target = (id: EngineId, from: EngineTarget['from']): EngineTarget => ({ id, label: ENGINE_TARGETS.find((t) => t.id === id)!.label, from, hasAdapter: !!getAdapter(id) })

/** The engine from the Architecture stack: the first “Engine” entry whose name names a known engine. */
export function engineFromStack(p: Project): EngineId | undefined {
  for (const e of archList(p, 'stack')) {
    if (e.category !== 'Engine') continue
    const t = ENGINE_TARGETS.find((x) => x.match.test(String(e.name ?? '')))
    if (t) return t.id
  }
  return undefined
}

/** The project's target engine: the setting when it names a known engine, else the Architecture stack, else Unity. */
export function engineTarget(p: Project): EngineTarget {
  const set = p.meta.engine?.target
  if (set && ENGINE_TARGETS.some((t) => t.id === set)) return target(set as EngineId, 'setting')
  const stack = engineFromStack(p)
  return stack ? target(stack, 'stack') : target(DEFAULT_ENGINE, 'default')
}
