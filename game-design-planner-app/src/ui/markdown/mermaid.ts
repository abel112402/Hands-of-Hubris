/**
 * Mermaid, loaded only when a preview contains a diagram (the package is large). Results are cached by theme and source text,
 * so re-renders and repeated diagrams cost nothing.
 */
import type { Theme } from '../../core/theme'

export type MermaidResult = { svg: string } | { error: string }

let api: Promise<(typeof import('mermaid'))['default']> | null = null
const cache = new Map<string, Promise<MermaidResult>>()
let counter = 0

function load() {
  api ??= import('mermaid').then((m) => m.default)
  return api
}

/** Renders with Mermaid's built-in theme for the app theme; the cache is keyed by both. */
export function renderMermaid(source: string, theme: Theme = 'dark'): Promise<MermaidResult> {
  const key = `${theme}:${source}`
  const hit = cache.get(key)
  if (hit) return hit
  const id = `md-mermaid-${++counter}`
  const job = load()
    .then((m) => {
      // 'strict' sanitises labels and disables click handlers and HTML labels. Set per render: the theme can change.
      m.initialize({ startOnLoad: false, securityLevel: 'strict', theme: theme === 'light' ? 'default' : 'dark', fontFamily: 'inherit' })
      return m.render(id, source)
    })
    .then((r) => ({ svg: r.svg }))
    .catch((e: unknown) => {
      // A failed render can leave Mermaid's error graphic in the document body.
      document.getElementById(`d${id}`)?.remove()
      document.getElementById(id)?.remove()
      return { error: e instanceof Error ? e.message : String(e) }
    })
  cache.set(key, job)
  return job
}
