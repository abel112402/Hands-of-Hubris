import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '../src/core/i18n'
import { MarkdownView } from '../src/ui/markdown/MarkdownView'
import { MarkdownPreview } from '../src/ui/editors/simple'
import { App } from '../src/App'
import { useStore } from '../src/core/store/store'
import { createProject } from '../src/core/model/project'
import { exportAssets, moduleToMarkdown } from '../src/core/export/markdown'
import { getModule } from '../src/core/modules/registry'
import { UI_DOC } from '../src/core/ui'

// jsdom cannot lay out Mermaid diagrams: a stub renders an <svg> and fails on sources containing "BROKEN".
vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(async (id: string, src: string) => {
      if (src.includes('BROKEN')) throw new Error('Parse error on line 2')
      return { svg: `<svg data-stub="${id}"><text>${src.split('\n').length} lines</text></svg>` }
    }),
  },
}))

afterEach(cleanup)

const view = (text: string, props: Partial<Parameters<typeof MarkdownView>[0]> = {}) => render(<MarkdownView text={text} {...props} />).container

describe('Markdown preview renderer', () => {
  it('renders GFM tables with escaped pipes', () => {
    const c = view('| Name | Rule |\n|---|---|\n| A | x \\| y |\n| B | z |\n')
    const table = c.querySelector('table')!
    expect(table.querySelectorAll('th')).toHaveLength(2)
    expect(table.querySelectorAll('tbody tr')).toHaveLength(2)
    expect(table.querySelector('tbody td:nth-child(2)')!.textContent).toBe('x | y')
    expect(table.parentElement!.className).toBe('table-wrap')
  })

  it('renders emphasis, quotes, numbered and task lists', () => {
    const c = view('> Summary\n\n_No data._\n\n1. one\n2. two\n\n- [x] done\n- [ ] open\n\n**bold** and `code`\n')
    expect(c.querySelector('blockquote')!.textContent).toContain('Summary')
    expect(c.querySelector('em')!.textContent).toBe('No data.')
    expect(c.querySelectorAll('ol li')).toHaveLength(2)
    const boxes = [...c.querySelectorAll<HTMLInputElement>('input[type=checkbox]')]
    expect(boxes.map((b) => [b.checked, b.disabled])).toEqual([[true, true], [false, true]])
    expect(c.querySelector('strong')!.textContent).toBe('bold')
    expect(c.querySelector('code')!.textContent).toBe('code')
  })

  it('renders Mermaid blocks, and shows the source and error when a diagram is broken', async () => {
    const c = view('```mermaid\nflowchart LR\n  a --> b\n```\n\n```mermaid\nflowchart LR\n  BROKEN -->\n```\n')
    expect(await screen.findByTestId('md-mermaid')).toBeTruthy()
    expect(c.querySelector('[data-testid=md-mermaid] svg')).toBeTruthy()
    expect(await screen.findByText(/Unable to render this Mermaid diagram: Parse error on line 2/)).toBeTruthy()
    expect(c.querySelector('.md-mermaid.error pre')!.textContent).toContain('BROKEN -->')
  })

  it('resolves images from the export assets and marks missing ones', () => {
    const c = view('![HUD](ui_wireframes/hud.svg)\n\n![Gone](ui_wireframes/gone.svg)\n', { assets: [{ path: 'ui_wireframes/hud.svg', mime: 'image/svg+xml', content: '<svg/>' }] })
    expect(c.querySelector('img')!.getAttribute('src')).toBe('data:image/svg+xml;charset=utf-8,%3Csvg%2F%3E')
    expect(screen.getByTestId('md-broken-img').textContent).toContain('ui_wireframes/gone.svg')
  })

  it('never renders raw HTML', () => {
    const c = view('<script>alert(1)</script>\n\nText <img src=x onerror="alert(1)"> end\n')
    expect(c.querySelector('script')).toBeNull()
    expect(c.querySelector('img')).toBeNull()
  })

  it('maps relative .md links to documents and gives headings GitHub anchors', () => {
    const c = view('# UI / UX\n\n## 1. UX principles\n\n## 1. UX principles\n\nSee [vision](../00_overview/vision.md#goals), [nowhere](../x.md) and [web](https://example.com).\n', { fromPath: '01_design/ui_ux.md' })
    expect([...c.querySelectorAll('h1, h2')].map((h) => h.id)).toEqual(['ui--ux', '1-ux-principles', '1-ux-principles-1'])
    const links = [...c.querySelectorAll('a')]
    expect(links[0].getAttribute('href')).toBe('#/doc/overview.vision')
    expect(links[1].getAttribute('title')).toContain('No document')
    expect(links[2]).toMatchObject({ target: '_blank', rel: 'noreferrer' })
  })

  it('switches between the rendered view and the exact source text', async () => {
    const text = '# T\n\n| a |\n|---|\n| 1 |\n'
    render(<MarkdownPreview text={text} />)
    expect(await screen.findByRole('table')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Source' }))
    expect(screen.getByTestId('md-source').textContent).toBe(text)
  })

  it('renders a real document export: UI tables, flow diagram and wireframe images', async () => {
    const p = createProject('M')
    const d = p.documents[UI_DOC].data
    d.screens = [{ id: 'hud', name: 'HUD', kind: 'HUD', entry: true, layout: { elements: [{ id: 'b', kind: 'button', x: 100, y: 100, w: 180, h: 48, text: 'Bag' }] } }]
    const mod = getModule(UI_DOC)!
    const text = moduleToMarkdown(p, mod)
    const c = view(text, { assets: exportAssets(p, mod), fromPath: '01_design/ui_ux.md' })
    expect(c.querySelectorAll('table').length).toBe(text.split('\n').filter((l) => /^\|[-|]+\|$/.test(l)).length)
    expect(await screen.findAllByTestId('md-mermaid')).toHaveLength((text.match(/```mermaid/g) ?? []).length)
    expect(c.querySelector('img[alt="HUD"]')!.getAttribute('src')).toMatch(/^data:image\/svg\+xml/)
    expect(screen.queryByTestId('md-broken-img')).toBeNull()
  })

  it('is the preview the document page shows', async () => {
    const p = createProject('M')
    useStore.getState().loadProject(p, 'x')
    window.location.hash = '#/doc/design.ui?s=screens&v=md'
    render(<App />)
    expect(await screen.findByRole('button', { name: 'Rendered' })).toBeTruthy()
    expect((await screen.findAllByRole('table')).length).toBeGreaterThan(0)
  })
})
