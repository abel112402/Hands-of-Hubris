import { createElement, type ReactElement, type ReactNode } from 'react'
import type { SvgNode } from '../../../core/location/render/node'

/** React wants camelCase SVG attributes (`strokeWidth`); the tree uses the names an SVG file does. */
const propName = (k: string) => (k === 'class' ? 'className' : k.startsWith('data-') || k.startsWith('aria-') ? k : k.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase()))

/** Draws an SVG tree from core/location as React elements. `extra` is appended inside the root (editor overlays). */
export function SvgNodeView({ node, className, extra }: { node: SvgNode; className?: string; extra?: ReactNode }): ReactElement {
  const props: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(node.attrs ?? {})) if (v !== undefined) props[propName(k)] = v
  if (className) props.className = className
  const children: ReactNode[] = node.text !== undefined ? [node.text] : (node.children ?? []).map((c, i) => <SvgNodeView key={i} node={c} />)
  if (extra) children.push(extra)
  return createElement(node.tag, props, ...children)
}
