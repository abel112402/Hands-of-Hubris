import { isValidElement, useEffect, useState, type ReactNode } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ExportAsset } from '../../core/export/markdown'
import { MODULES } from '../../core/modules/registry'
import { renderMermaid, type MermaidResult } from './mermaid'

/**
 * GitHub-flavoured rendering of an exported document: tables, task lists, strikethrough, autolinks, Mermaid diagrams,
 * images from the export's own assets, and links between documents. Raw HTML in the text is never rendered.
 */
export type MarkdownViewProps = {
  text: string
  /** Files the export writes next to the document (see exportAssets); images resolve against these. */
  assets?: ExportAsset[]
  /** The document's own export path (e.g. 01_design/ui_ux.md), to resolve relative links. */
  fromPath?: string
}

/** Plain text of rendered children, for heading anchors. */
function textOf(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (isValidElement(node)) return textOf((node.props as { children?: ReactNode }).children)
  return ''
}

/** GitHub's heading slugs: lower case, punctuation dropped, spaces to dashes, repeats numbered. */
function slugger() {
  const seen = new Map<string, number>()
  return (text: string) => {
    const base = text
      .toLowerCase()
      .trim()
      .replace(/[^\p{L}\p{N}\s_-]/gu, '')
      .replace(/\s/g, '-')
    const n = seen.get(base) ?? 0
    seen.set(base, n + 1)
    return n ? `${base}-${n}` : base
  }
}

/** A relative .md link to an in-app route (#/doc/<id>), or null when no document has that export path. */
function docRoute(href: string, fromPath?: string): string | null {
  const [path] = href.split('#')
  if (!path.endsWith('.md')) return null
  const parts = (fromPath ? fromPath.split('/').slice(0, -1) : []).concat(path.split('/'))
  const out: string[] = []
  for (const p of parts) {
    if (p === '..') out.pop()
    else if (p && p !== '.') out.push(p)
  }
  const target = out.join('/')
  const mod = MODULES.find((m) => m.docsPath.replace(/^docs\//, '') === target)
  return mod ? `#/doc/${mod.id}` : null
}

function Mermaid({ source }: { source: string }) {
  const [result, setResult] = useState<{ source: string; r: MermaidResult } | null>(null)
  useEffect(() => {
    let alive = true
    void renderMermaid(source).then((r) => alive && setResult({ source, r }))
    return () => {
      alive = false
    }
  }, [source])
  const r = result?.source === source ? result.r : null
  if (r && 'error' in r)
    return (
      <div className="md-mermaid error" role="group" aria-label="Diagram that could not be rendered">
        <p>Unable to render this Mermaid diagram: {r.error}</p>
        <pre>{source}</pre>
      </div>
    )
  if (r) return <div className="md-mermaid" role="img" aria-label="Mermaid diagram" data-testid="md-mermaid" dangerouslySetInnerHTML={{ __html: r.svg }} />
  return (
    <div className="md-mermaid loading" aria-busy="true">
      <pre>{source}</pre>
    </div>
  )
}

export function MarkdownView({ text, assets = [], fromPath }: MarkdownViewProps) {
  const slug = slugger()
  const byPath = new Map(assets.map((a) => [a.path.replace(/^\.\//, ''), a]))
  const heading =
    (Tag: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6') =>
    ({ children }: { children?: ReactNode }) => <Tag id={slug(textOf(children))}>{children}</Tag>
  const components: Components = {
    h1: heading('h1'),
    h2: heading('h2'),
    h3: heading('h3'),
    h4: heading('h4'),
    h5: heading('h5'),
    h6: heading('h6'),
    table: ({ children }) => (
      <div className="table-wrap">
        <table>{children}</table>
      </div>
    ),
    pre: ({ node, children }) => {
      const code = node?.children[0]
      const cls = code && code.type === 'element' ? code.properties?.className : undefined
      const isMermaid = Array.isArray(cls) && cls.includes('language-mermaid')
      if (isMermaid && code?.type === 'element') {
        const src = code.children.map((c) => (c.type === 'text' ? c.value : '')).join('').replace(/\n$/, '')
        return <Mermaid source={src} />
      }
      return <pre>{children}</pre>
    },
    img: ({ src, alt }) => {
      const s = typeof src === 'string' ? src : ''
      if (/^https?:\/\//.test(s)) return <img src={s} alt={alt ?? ''} loading="lazy" />
      const asset = byPath.get(s.replace(/^\.\//, ''))
      if (asset) return <img src={`data:${asset.mime};charset=utf-8,${encodeURIComponent(asset.content)}`} alt={alt ?? ''} />
      return (
        <span className="md-broken-img" role="img" aria-label={`Missing image ${s}`} data-testid="md-broken-img">
          🖼 {alt || 'image'} · <code>{s}</code> is not in the export
        </span>
      )
    },
    a: ({ href = '', children }) => {
      if (href.startsWith('#'))
        return (
          <a
            href={href}
            onClick={(e) => {
              // The app uses hash routing, so an in-page anchor would change the route; scroll instead.
              e.preventDefault()
              document.getElementById(decodeURIComponent(href.slice(1)))?.scrollIntoView?.({ behavior: 'smooth' })
            }}
          >
            {children}
          </a>
        )
      if (/^(https?:|mailto:)/.test(href))
        return (
          <a href={href} target="_blank" rel="noreferrer">
            {children}
          </a>
        )
      const route = docRoute(href, fromPath)
      return route ? <a href={route}>{children}</a> : <a href={href} title="⚠ No document has this path">{children}</a>
    },
    input: ({ type, checked }) => (type === 'checkbox' ? <input type="checkbox" checked={!!checked} disabled readOnly /> : null),
  }
  return (
    <div className="md md-gfm">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components} skipHtml>
        {text}
      </ReactMarkdown>
    </div>
  )
}

export default MarkdownView
