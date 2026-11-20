import type { EngineIR, EngineIssue, IrFormat, NeutralType } from './ir'

/** Engines with an adapter now or planned. Only those in ENGINE_ADAPTERS can be exported to. */
export type EngineId = 'unity' | 'godot' | 'unreal'

export type EmittedFile = { path: string; content: string }
export type IdentKind = 'type' | 'field' | 'constant' | 'method' | 'param' | 'member'

/**
 * Writes the engine-neutral IR in one engine's language. An adapter never reads the project:
 * everything it needs is in the IR, so a new engine is a new adapter and nothing else changes.
 */
export interface EngineAdapter {
  id: EngineId
  label: string
  language: string
  /** Bumped when the generated output changes shape; written to the manifest. */
  version: number
  /** Folder in the bundle that holds this adapter's files. */
  root: string
  reservedWords: ReadonlySet<string>
  /** The engine type for a neutral type, inside a schema stored in `format`. */
  typeName(t: NeutralType, ir: EngineIR, format: IrFormat): string
  /** A valid, non-reserved identifier from words. */
  identifier(words: string[], kind: IdentKind): string
  /** Generated files, paths relative to `root`, in a stable order. */
  emit(ir: EngineIR): EmittedFile[]
  /** Engine-specific findings (renamed members, clashes with engine types). */
  checks(ir: EngineIR): EngineIssue[]
}

const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1)
export const pascal = (ws: string[]) => ws.map(cap).join('')
export const camel = (ws: string[]) => ws.map((w, i) => (i ? cap(w) : w)).join('')

/** Gives each name a unique spelling by adding 2, 3… to repeats, in order. */
export function uniqueNames(names: string[], taken: Iterable<string> = []): string[] {
  const used = new Set(taken)
  return names.map((n) => {
    let out = n
    for (let i = 2; used.has(out); i++) out = `${n}${i}`
    used.add(out)
    return out
  })
}
