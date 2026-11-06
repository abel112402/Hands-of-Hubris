import { describe, expect, it } from 'vitest'
import { createProject } from '../src/core/model/project'
import { useStore } from '../src/core/store/store'
import { getModule, getSection } from '../src/core/modules/registry'
import { controlConflicts, flowAnalysis, hudCoverage, hudScreen, layoutIssues, layoutOf, screensOf, UI_DOC } from '../src/core/ui'
import { UI_GUIDE } from '../src/modules/guides/ui'
import { applyExample, previewProject } from '../src/ui/guides/ExamplePicker'

const step = (id: string) => UI_GUIDE.steps.find((s) => s.id === id)!
const example = (id: string) => UI_GUIDE.examples.find((e) => e.id === id)!
const run = (id: string, p: ReturnType<typeof createProject>) => {
  const a = step(id).action!
  if ('run' in a) a.run(p)
}

function withData() {
  const p = createProject('T')
  p.documents['design.player'].data.survival = [{ id: 's1', stat: 'hunger' }, { id: 's2', stat: 'thirst' }, { id: 's3', stat: 'health' }]
  p.documents['design.items'].data.inventory = { slots: 30, hotbar: 10 }
  p.documents['design.trade'].data.currencyTypes = [{ id: 'silver', name: 'Silver' }]
  return p
}

describe('ui guide', () => {
  it('points every step, map node, example, concept and empty text at a real section', () => {
    const mod = getModule(UI_DOC)!
    const reg = createProject('t').registry
    const ids = [
      ...UI_GUIDE.steps.map((s) => s.section),
      ...UI_GUIDE.map.nodes.flatMap((n) => (n.section ? [n.section] : [])),
      ...UI_GUIDE.examples.map((e) => e.section),
      ...Object.keys(UI_GUIDE.concepts),
      ...Object.keys(UI_GUIDE.empty),
    ]
    for (const id of ids) expect(getSection(mod, reg, id), id).toBeTruthy()
    for (const n of UI_GUIDE.map.nodes) if (n.doc) expect(getModule(n.doc), n.doc).toBeTruthy()
  })

  it('sets kinds from screen names and marks the HUD as entry', () => {
    const p = createProject('T')
    p.documents[UI_DOC].data.screens = [{ id: 'h', name: 'HUD' }, { id: 'm', name: 'Main menu' }, { id: 'i', name: 'Inventory' }]
    expect(step('kinds').done!(p)).toBe(false)
    run('kinds', p)
    expect(screensOf(p).map((s) => s.kind)).toEqual(['HUD', 'Fullscreen menu', 'Window'])
    expect(screensOf(p)[0].entry).toBe(true)
    expect(step('kinds').done!(p)).toBe(true)
  })

  it('the HUD template binds every survival stat, sizes the hotbar from Items and passes the checks', () => {
    const p = withData()
    example('hud-template').apply(p)
    const hud = hudScreen(p)!
    const c = hudCoverage(p)
    expect(c.missingStats).toEqual([])
    expect(c.hotbar).toBeNull()
    expect(c.missingCurrencies).toEqual([])
    expect(layoutOf(hud).find((e) => e.kind === 'hotbar')!.props!.slots).toBe(10)
    expect(layoutIssues(p, hud).filter((i) => i.level !== 'info')).toEqual([])
    expect(step('hud').done!(p)).toBe(true)
    expect(step('bind').done!(p)).toBe(true)
  })

  it('the inventory window holds the Items slot count and fits the window', () => {
    const p = withData()
    example('inventory-template').apply(p)
    const inv = screensOf(p).find((s) => s.name === 'Inventory')!
    const grid = layoutOf(inv).find((e) => e.kind === 'grid')!
    // 30 slots: 5 rows of 6, exactly the Items slot count.
    expect([grid.props!.rows, grid.props!.cols]).toEqual([5, 6])
    expect(layoutIssues(p, inv).filter((i) => i.kind === 'outside')).toEqual([])
    expect(hudCoverage(p).inventory).toEqual([])
  })

  it('the menu set links its screens and needs no extra arrows', () => {
    const p = withData()
    example('hud-template').apply(p)
    example('menu-set').apply(p)
    const f = flowAnalysis(p)
    const byName = (n: string) => screensOf(p).find((s) => s.name === n)!.id
    expect(f.depth.get(byName('Pause'))).toBe(1)
    expect(f.depth.get(byName('Settings'))).toBe(2)
    expect(f.missingInGraph).toEqual([])
    expect(f.deadEnds.map((s) => s.name)).not.toContain('Settings')
  })

  it('control presets have no conflicts and add gamepad buttons to the same actions', () => {
    const p = createProject('T')
    example('controls-kbm').apply(p)
    example('controls-pad').apply(p)
    const list = p.documents[UI_DOC].data.controls
    expect(list.find((c: any) => c.name === 'Jump')).toMatchObject({ key: 'Space', gamepad: 'A' })
    expect(controlConflicts(p)).toEqual([])
    expect(step('controls').done!(p)).toBe(true)
  })

  it('previews the HUD on a copy and inserts it as one undo step', () => {
    useStore.getState().loadProject(withData(), 'x')
    const before = useStore.getState().project
    const preview = previewProject(before, example('hud-template'))
    expect(layoutOf(hudScreen(before))).toHaveLength(0)
    const n = layoutOf(hudScreen(preview)).length
    expect(n).toBeGreaterThan(5)
    applyExample(example('hud-template'))
    expect(layoutOf(hudScreen(useStore.getState().project))).toHaveLength(n)
    useStore.getState().undo()
    expect(layoutOf(hudScreen(useStore.getState().project))).toHaveLength(0)
  })
})
