/**
 * A tiny SVG tree. Glyphs build these instead of markup, so the editor (React elements) and the export (a string)
 * draw from the same data and no HTML is ever injected.
 */
export type SvgAttrs = Record<string, string | number | undefined>
export type SvgNode = { tag: string; attrs?: SvgAttrs; children?: SvgNode[]; text?: string }

export const el = (tag: string, attrs: SvgAttrs = {}, children?: SvgNode[] | string): SvgNode =>
  typeof children === 'string' ? { tag, attrs, text: children } : { tag, attrs, children }

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function toSvgString(node: SvgNode): string {
  const attrs = Object.entries(node.attrs ?? {})
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => ` ${k}="${esc(String(v))}"`)
    .join('')
  const inner = node.text !== undefined ? esc(node.text) : (node.children ?? []).map(toSvgString).join('')
  return inner ? `<${node.tag}${attrs}>${inner}</${node.tag}>` : `<${node.tag}${attrs}/>`
}
