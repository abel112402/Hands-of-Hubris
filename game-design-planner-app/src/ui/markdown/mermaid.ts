/**
 * Mermaid, loaded only when a preview contains a diagram (the package is large). Results are cached by source text,
 * so re-renders and repeated diagrams cost nothing.
 */
export type MermaidResult = { svg: string } | { error: string }

let api: Promise<(typeof import('mermaid'))['default']> | null = null
const cache = new Map<string, Promise<MermaidResult>>()
let counter = 0

function load() {
  api ??= import('mermaid').then((m) => {
    // 'strict' sanitises labels and disables click handlers and HTML labels; the app has a dark theme only.
    m.default.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'dark', fontFamily: 'inherit' })
    return m.default
  })
  return api
}

export function renderMermaid(source: string): Promise<MermaidResult> {
  const hit = cache.get(source)
  if (hit) return hit
  const id = `md-mermaid-${++counter}`
  const job = load()
    .then((m) => m.render(id, source))
    .then((r) => ({ svg: r.svg }))
    .catch((e: unknown) => {
      // A failed render can leave Mermaid's error graphic in the document body.
      document.getElementById(`d${id}`)?.remove()
      document.getElementById(id)?.remove()
      return { error: e instanceof Error ? e.message : String(e) }
    })
  cache.set(source, job)
  return job
}
