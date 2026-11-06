import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { collectHints, makeContext } from '../src/core/hints/engine'
import { exportZip, moduleToMarkdown } from '../src/core/export/markdown'
import { createProject, makeId } from '../src/core/model/project'
import { ensureDocument, getModule } from '../src/core/modules/registry'
import {
  addMissingArrows,
  align,
  controlConflicts,
  distribute,
  flowAnalysis,
  hudCoverage,
  layoutIssues,
  layoutSvg,
  reorder,
  resizeRect,
  screenReadiness,
  snapMove,
  textFit,
  UI_DOC,
  withContents,
  type WireElement,
} from '../src/core/ui'

const ui = getModule(UI_DOC)!
const el = (id: string, kind: string, x: number, y: number, w: number, h: number, extra: Partial<WireElement> = {}): WireElement => ({ id, kind, x, y, w, h, ...extra })

/** HUD (entry) with a bar and a button to Inventory; Inventory with a back button; Map only in the graph; Pause unreachable. */
function uiProject() {
  const p = createProject('U')
  p.documents['design.player'].data.survival = [{ id: 's1', stat: 'hunger' }, { id: 's2', stat: 'health' }]
  p.documents['design.items'].data.inventory = { slots: 30, hotbar: 8 }
  p.documents['design.trade'].data.currencyTypes = [{ id: 'silver', name: 'Silver' }]
  p.documents['design.timeWeather'].data.dayPhases = [{ id: 'day', name: 'Day' }]
  const d = p.documents[UI_DOC].data
  d.screens = [
    {
      id: 'hud',
      name: 'HUD',
      kind: 'HUD',
      entry: true,
      purpose: 'Glanceable state',
      states: ['default'],
      layout: {
        elements: [
          el('bar', 'statBar', 100, 990, 260, 28, { bind: { source: 'survivalStat', id: 'health' } }),
          el('hot', 'hotbar', 700, 960, 400, 64, { props: { slots: 6 }, bind: { source: 'hotbar' } }),
          el('inv', 'button', 1600, 100, 180, 48, { text: 'Bag', action: { kind: 'opens', screen: 'bag' } }),
        ],
      },
    },
    {
      id: 'bag',
      name: 'Inventory',
      kind: 'Window',
      width: 1200,
      height: 800,
      layout: { elements: [el('grid', 'grid', 40, 120, 480, 320, { props: { rows: 4, cols: 6 }, bind: { source: 'inventory' } }), el('back', 'button', 1000, 40, 160, 48, { text: 'Close', action: { kind: 'back' } })] },
    },
    { id: 'map', name: 'Map', kind: 'Fullscreen menu' },
    { id: 'pause', name: 'Pause', kind: 'Overlay' },
  ]
  d.flow = { nodes: [{ id: 'n1', label: 'HUD', kind: 'Screen', x: 0, y: 0, refId: 'hud' }, { id: 'n2', label: 'Map', kind: 'Screen', x: 1, y: 0, refId: 'map' }], edges: [{ id: 'e1', source: 'n1', target: 'n2', kind: 'opens' }] }
  d.controls = [
    { id: 'c1', name: 'Interact', key: 'E' },
    { id: 'c2', name: 'Pause', key: 'Esc' },
    { id: 'c3', name: 'Close window', key: 'esc', contexts: ['bag'] },
  ]
  return p
}
type P = ReturnType<typeof uiProject>
const data = (p: P) => p.documents[UI_DOC].data
const screen = (p: P, id: string) => data(p).screens.find((s: any) => s.id === id)
const ruleIds = (p: P, docId = UI_DOC) => collectHints(makeContext(p, { docId })).filter((h) => h.ruleId.startsWith('ui.')).map((h) => h.ruleId)

describe('ui module v2', () => {
  it('migrates v1: notes move, known screens get kinds, a matching canvas frame becomes that screen’s wireframe with ids kept', () => {
    const p = createProject('t')
    p.documents[UI_DOC] = {
      moduleVersion: 1,
      data: {
        principles: { principles: 'Readable', input: 'WASD', a11y: 'Big text' },
        screens: [{ id: 's1', name: 'HUD' }, { id: 's2', name: 'Inventory' }, { id: 's3', name: 'Odd screen' }],
        flow: { nodes: [], edges: [] },
        wireframe: {
          items: [
            { id: 'f1', kind: 'Frame', label: 'Inventory', x: 100, y: 100, w: 480, h: 270 },
            { id: 'b1', kind: 'Button', label: 'Close', x: 120, y: 120, w: 96, h: 27 },
            { id: 't1', kind: 'Text', label: 'Loose', x: 700, y: 50, w: 100, h: 20 },
            { id: 'f2', kind: 'Frame', label: 'Nope', x: 0, y: 400, w: 200, h: 100 },
          ],
        },
      },
    }
    const doc = ensureDocument(p, ui, makeId)
    expect(doc.moduleVersion).toBe(2)
    expect(doc.data.principles).toEqual({ principles: 'Readable' })
    expect(doc.data.input.notes).toBe('WASD')
    expect(doc.data.accessibility.notes).toBe('Big text')
    expect(doc.data.screens.map((s: any) => s.kind)).toEqual(['HUD', 'Window', undefined])
    expect(doc.data.screens[0].entry).toBe(true)
    // The frame is 480×270, so everything scales ×4 to 1920×1080.
    expect(doc.data.screens[1].layout.elements).toEqual([{ id: 'b1', kind: 'button', x: 80, y: 80, w: 384, h: 108, text: 'Close' }])
    expect(doc.data.wireframe.items.map((i: any) => i.id)).toEqual(['t1', 'f2'])
  })

  it('snaps moves to other edges and centres, else to the grid, and resizes by a handle', () => {
    const board = { x: 0, y: 0, w: 1000, h: 600 }
    const other = { x: 300, y: 300, w: 100, h: 50 }
    const opts = { others: [other], board, grid: 8, threshold: 6 }
    // Left edge 297 is 3 px from the other's left edge 300.
    const a = snapMove({ x: 297, y: 100, w: 50, h: 20 }, opts)
    expect(a.rect).toEqual({ x: 300, y: 104, w: 50, h: 20 })
    expect(a.guides).toHaveLength(1)
    expect(a.guides[0]).toMatchObject({ axis: 'x', pos: 300 })
    // Nothing within 6 px: the grid wins.
    expect(snapMove({ x: 213, y: 133, w: 50, h: 20 }, opts).rect).toMatchObject({ x: 216, y: 136 })
    expect(snapMove({ x: 213, y: 133, w: 50, h: 20 }, { ...opts, enabled: false }).rect).toMatchObject({ x: 213, y: 133 })
    const r = resizeRect({ x: 0, y: 0, w: 100, h: 50 }, 'se', 37, 0, { ...opts, others: [], keepAspect: true })
    expect(r.rect).toEqual({ x: 0, y: 0, w: 136, h: 68 })
    expect(resizeRect({ x: 100, y: 100, w: 100, h: 50 }, 'w', 200, 0, { ...opts, grid: 0, min: 8 }).rect).toMatchObject({ x: 192, w: 8 })
  })

  it('aligns, distributes, orders and carries panel contents', () => {
    const rects = [el('a', 'button', 10, 0, 50, 20), el('b', 'button', 40, 30, 20, 20), el('c', 'button', 200, 60, 20, 20)]
    expect(align(rects, 'left').b.x).toBe(10)
    expect(align(rects, 'right').a.x).toBe(170)
    // Span 10…220 holds 90 px of elements, so the two gaps are 60 px each.
    expect(distribute(rects, 'x').b.x).toBe(120)
    expect(reorder(rects, ['a'], 'front').map((e) => e.id)).toEqual(['b', 'c', 'a'])
    expect(reorder(rects, ['c'], 'backward').map((e) => e.id)).toEqual(['a', 'c', 'b'])
    const panel = el('p', 'panel', 0, 0, 100, 100)
    expect(withContents([panel, rects[0], rects[2]], ['p']).sort()).toEqual(['a', 'p'])
    expect(withContents([panel, rects[0]], ['p'], true)).toEqual(['p'])
  })

  it('estimates text fit at the expansion', () => {
    const b = el('x', 'button', 0, 0, 160, 48, { text: 'Wiederherstellen', props: { textSize: 'M' } })
    // 16 chars × 18 px × 0.55 × 1.3 + 32 padding ≈ 238 px.
    expect(textFit(b, 30)).toEqual({ need: 238, fits: false })
    expect(textFit({ ...b, w: 240 }, 30)!.fits).toBe(true)
    expect(textFit(el('y', 'text', 0, 0, 10, 10, { text: 'long paragraph' }), 30)).toBeNull()
  })

  it('finds layout issues of every kind', () => {
    const p = uiProject()
    screen(p, 'hud').layout.elements.push(
      el('off', 'label', 1900, 10, 100, 28, { text: 'Off' }),
      el('edge', 'icon', 10, 10, 40, 40),
      el('tiny', 'button', 900, 500, 100, 24, { text: 'OK', props: { textSize: 'S' } }),
      el('over', 'button', 950, 505, 120, 48, { text: 'Yes', action: { kind: 'opens', screen: 'gone' } }),
      el('free', 'counter', 200, 200, 150, 40),
    )
    const kinds = (id: string) => layoutIssues(p, screen(p, 'hud')).filter((i) => i.elementId === id).map((i) => i.kind).sort()
    expect(kinds('off')).toEqual(['outside'])
    expect(kinds('edge')).toEqual(['unsafe'])
    expect(kinds('tiny')).toEqual(['noAction', 'smallTarget', 'smallText'])
    expect(kinds('over')).toEqual(['deadLink', 'overlap'])
    expect(kinds('free')).toEqual(['unbound'])
    expect(kinds('bar')).toEqual([])
  })

  it('analyses the flow from the entry screen and adds missing arrows', () => {
    const p = uiProject()
    const f = flowAnalysis(p)
    expect(f.entry?.id).toBe('hud')
    expect(Object.fromEntries(f.depth)).toEqual({ hud: 0, map: 1, bag: 1 })
    expect(f.unreachable.map((s) => s.id)).toEqual(['pause'])
    expect(f.deadEnds.map((s) => s.id)).toEqual(['map'])
    expect(f.missingInGraph.map((e) => `${e.from}>${e.to}`)).toEqual(['hud>bag'])
    expect(f.noButton.map((e) => `${e.from}>${e.to}`)).toEqual(['hud>map'])
    addMissingArrows(p)
    expect(flowAnalysis(p).missingInGraph).toEqual([])
    expect(data(p).flow.nodes.find((n: any) => n.refId === 'bag')).toBeTruthy()
  })

  it('compares the HUD with Player, Items, Trade and Time & Weather', () => {
    const c = hudCoverage(uiProject())
    expect(c.missingStats.map((s) => s.id)).toEqual(['hunger'])
    expect(c.hotbar).toEqual({ want: 8, have: 6 })
    expect(c.inventory.map((i) => [i.screen.id, i.have, i.want])).toEqual([['bag', 24, 30]])
    expect(c.missingCurrencies.map((x) => x.id)).toEqual(['silver'])
    expect(c.missingClock).toBe(true)
  })

  it('finds control conflicts only within a shared context', () => {
    const p = uiProject()
    expect(controlConflicts(p)).toEqual([])
    data(p).controls.push({ id: 'c4', name: 'Inventory', key: 'e' })
    expect(controlConflicts(p)).toMatchObject([{ a: { id: 'c1' }, b: { id: 'c4' }, field: 'key', value: 'e' }])
  })

  it('reports readiness and draws an SVG', () => {
    const r = screenReadiness(uiProject())
    expect(r.find((x) => x.screen.id === 'hud')).toMatchObject({ purpose: true, wireframe: true, states: true, inFlow: true })
    expect(r.find((x) => x.screen.id === 'pause')).toMatchObject({ wireframe: false, inFlow: false, ready: false })
    const svg = layoutSvg(uiProject(), screen(uiProject(), 'hud'))
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg).toContain('Health')
    expect(svg).toContain('viewBox="0 0 1920 1080"')
  })

  it('exports in the order of ui_ux.md, with the flow, HUD widgets, wireframes and SVG files', async () => {
    const p = uiProject()
    const md = moduleToMarkdown(p, ui)
    const heads = md.split('\n').filter((l) => l.startsWith('## ')).map((l) => l.replace(/^## \d+\. /, ''))
    const order = ['UX principles', 'Screen flow', 'HUD', 'Screens', 'Input', 'Controls', 'Accessibility and localization']
    const pos = order.map((h) => heads.indexOf(h))
    expect(pos.every((i) => i >= 0)).toBe(true)
    expect([...pos].sort((a, b) => a - b)).toEqual(pos)
    expect(md).toContain('S_hud --> S_bag')
    expect(md).toContain('S_hud -.-> S_map')
    expect(md).toContain('* Stat bar · bottom-left · shows Health')
    expect(md).toContain('#### Inventory: wireframe')
    expect(md).toContain('![Inventory](ui_wireframes/bag.svg)')
    expect(md).toContain('* Button · “Bag” · top-right · opens Inventory')
    const zip = await JSZip.loadAsync(await (await exportZip(p)).arrayBuffer())
    expect(Object.keys(zip.files)).toEqual(expect.arrayContaining(['01_design/ui_ux.md', '01_design/ui_wireframes/hud.svg', '01_design/ui_wireframes/bag.svg']))
  })
})

describe('ui hints', () => {
  it('stay quiet on a fresh project and in other editors, and never exceed suggest', () => {
    expect(ruleIds(createProject('x') as P)).toEqual([])
    const p = uiProject()
    expect(ruleIds(p, 'design.items')).toEqual([])
    const hints = collectHints(makeContext(p, { docId: UI_DOC })).filter((h) => h.ruleId.startsWith('ui.'))
    expect(hints.length).toBeGreaterThan(0)
    expect(hints.every((h) => h.severity !== 'important')).toBe(true)
  })

  /** [rule, a project with the problem, the same project without it] */
  const cases: [string, (p: P) => void, (p: P) => void][] = [
    ['ui.unreachable', () => {}, (p) => data(p).screens.pop()],
    ['ui.deadEnd', () => {}, (p) => data(p).flow.edges.push({ id: 'b', source: 'n2', target: 'n1', kind: 'closes' })],
    ['ui.navMismatch', () => {}, (p) => {
      addMissingArrows(p)
      data(p).flow.edges = data(p).flow.edges.filter((e: any) => e.target !== 'n2')
    }],
    ['ui.layout', (p) => screen(p, 'hud').layout.elements.push(el('t', 'button', 900, 500, 100, 20, { text: 'x', action: { kind: 'back' } })), () => {}],
    ['ui.textFit', (p) => screen(p, 'hud').layout.elements.push(el('t', 'button', 900, 500, 100, 48, { text: 'A very long caption', action: { kind: 'back' } })), () => {}],
    ['ui.unbound', (p) => screen(p, 'hud').layout.elements.push(el('t', 'statBar', 300, 300, 200, 28)), () => {}],
    ['ui.controlConflicts', (p) => data(p).controls.push({ id: 'c4', name: 'Inventory', key: 'E' }), () => {}],
  ]
  for (const [id, broken, fixed] of cases)
    it(`${id} fires only when its problem exists`, () => {
      const bad = uiProject()
      broken(bad)
      expect(ruleIds(bad)).toContain(id)
      const good = uiProject()
      fixed(good)
      expect(ruleIds(good)).not.toContain(id)
    })

  it('ui.hudCoverage and ui.screenBasics (info)', () => {
    const p = uiProject()
    const h = collectHints(makeContext(p, { docId: UI_DOC })).find((x) => x.ruleId === 'ui.hudCoverage')
    expect(h?.severity).toBe('info')
    expect(h?.params?.names).toContain('no bar for Hunger')
    expect(h?.params?.names).toContain('hotbar has 6 slots, Items 8')
    expect(ruleIds(p)).toContain('ui.screenBasics')
    for (const s of data(p).screens) Object.assign(s, { priority: s.id === 'hud' ? 'MVP' : 'Later' })
    expect(ruleIds(p)).not.toContain('ui.screenBasics')
  })
})
