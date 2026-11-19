import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import '../src/core/i18n'
import { App } from '../src/App'
import { createProject } from '../src/core/model/project'
import { useStore } from '../src/core/store/store'
import { UI_VERSION_KEY } from '../src/core/uiVersion'
import { useCompanion } from '../src/ui/v3/Companion'

// Installed with Testing Library; its types are not reachable through the package's exports, hence the cast.
const { computeAccessibleName } = (await import('dom-accessibility-api' as string)) as { computeAccessibleName: (el: Element) => string }

/**
 * Accessibility audit of the v3 screens (plans/UI_V3_PLAN.md, Phase 5), with the tools already installed:
 * every control has an accessible name (computed as browsers do), ids are unique, ARIA references resolve, and
 * images are named. Not a replacement for a screen-reader pass, but it catches the regressions that matter most.
 */
function audit(root: ParentNode = document.body): string[] {
  const problems: string[] = []
  const hidden = (el: Element) => !!el.closest('[aria-hidden="true"], [hidden]')
  const label = (el: Element) => `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : ''} "${(el.textContent ?? '').trim().slice(0, 30)}"`
  for (const el of root.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, [role=tab], [role=option], summary, [role=img]')) {
    if (hidden(el)) continue
    if (!computeAccessibleName(el).trim()) problems.push(`no accessible name: ${label(el)}`)
  }
  const ids = new Map<string, number>()
  for (const el of document.querySelectorAll('[id]')) ids.set(el.id, (ids.get(el.id) ?? 0) + 1)
  for (const [id, n] of ids) if (n > 1) problems.push(`duplicate id: ${id} (${n}×)`)
  for (const el of root.querySelectorAll('[aria-controls], [aria-labelledby], [aria-describedby], [aria-activedescendant]')) {
    for (const attr of ['aria-controls', 'aria-labelledby', 'aria-describedby', 'aria-activedescendant']) {
      for (const id of (el.getAttribute(attr) ?? '').split(/\s+/).filter(Boolean)) if (!document.getElementById(id)) problems.push(`${attr} points at missing #${id}: ${label(el)}`)
    }
  }
  return problems
}

afterEach(() => {
  cleanup()
  act(() => useCompanion.getState().close())
})

function open(hash: string) {
  const p = createProject('Audit')
  p.documents['design.combat'].data.enemies = [{ id: 'gh', name: 'Ghoul' }, { id: 'wr', name: 'Bog Wraith' }]
  useStore.getState().loadProject(p, 'x')
  localStorage.setItem(UI_VERSION_KEY, 'v3')
  window.location.hash = hash
  return render(<App />)
}

describe('v3 accessibility audit', () => {
  it('Atlas: map, list and the compass flyout', async () => {
    open('#/')
    await screen.findByRole('heading', { level: 1 })
    expect(audit()).toEqual([])
    fireEvent.click(screen.getByRole('button', { name: 'List' }))
    expect(audit()).toEqual([])
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: /^Core systems/ }))
    expect(audit()).toEqual([])
  })

  it('planner page, record sheet, record page and section map', async () => {
    open('#/doc/design.combat?s=enemies&e=gh')
    await screen.findByRole('dialog', { name: 'enemy: Ghoul' })
    expect(audit()).toEqual([])
    fireEvent.click(screen.getByRole('button', { name: 'Open as a page' }))
    await screen.findByRole('region', { name: 'enemy: Ghoul' })
    expect(audit()).toEqual([])
    act(() => void (window.location.hash = '#/doc/design.combat?s=enemies'))
    fireEvent.keyDown(document.body, { key: 'm' })
    await screen.findByRole('dialog', { name: 'System map' })
    expect(audit()).toEqual([])
  })

  it('companion tabs, command palette and a form section', async () => {
    open('#/doc/overview.vision')
    await screen.findByRole('heading', { level: 1 })
    expect(audit()).toEqual([])
    const tray = screen.getByRole('complementary', { name: 'Companion' })
    for (const tab of [/^Hints/, /^Guide$/, /^AI$/]) {
      fireEvent.click(within(tray).getByRole('button', { name: tab }))
      expect(audit(), String(tab)).toEqual([])
    }
    act(() => useCompanion.getState().close())
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    fireEvent.change(screen.getByRole('combobox', { name: 'Jump to' }), { target: { value: 'ghoul' } })
    expect(audit()).toEqual([])
  })
})

describe('v3 colour contrast', () => {
  // WCAG relative luminance and contrast (AA: 4.5:1 for small text, 3:1 for large/bold UI labels).
  const lum = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  const ratio = (a: string, b: string) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
    return (x + 0.05) / (y + 0.05)
  }
  it('phase-coloured region labels stay readable on the light parchment and the dark canvas', async () => {
    const fs: { readFileSync: (path: string, enc: string) => string } = await import('node:fs' as string)
    const css = fs.readFileSync('src/styles.css', 'utf8')
    const block = (re: RegExp) => Object.fromEntries((css.match(re)![1].split(';').map((d) => d.split(':')).filter(([k]) => k?.startsWith('--')).map(([k, ...v]) => [k.trim(), v.join(':').trim()])))
    const dark = block(/:root\{([^}]*)\}/)
    const light = { ...dark, ...block(/:root\[data-theme=light\]\{([^}]*)\}/) }
    const paper = css.match(/--atlas-paper:(#[0-9a-f]{6})/i)![1]
    for (const p of ['--phase-concept', '--phase-systems', '--phase-content', '--phase-production', '--phase-polish']) {
      // Region labels are 11 px bold uppercase: held to the small-text bar.
      expect(ratio(light[p], paper), `${p} on parchment`).toBeGreaterThanOrEqual(4.5)
      expect(ratio(dark[p], dark['--surface-0']), `${p} on the dark canvas`).toBeGreaterThanOrEqual(4.5)
    }
  })
})
