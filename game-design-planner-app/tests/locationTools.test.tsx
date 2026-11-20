import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '../src/core/i18n'
import { App } from '../src/App'
import { generateMap, staleLayers, withParams } from '../src/core/location/generate'
import { KINDS } from '../src/core/location/objects'
import { LOCATION_TYPES } from '../src/core/location/registry'
import { toSvgString } from '../src/core/location/render/node'
import { renderMap } from '../src/core/location/render/svg'
import { THEMES } from '../src/core/location/render/theme'
import { MAX_SNAPSHOTS, parseMap } from '../src/core/location/schema'
import { removeSnapshot, restoreSnapshot, saveSnapshot } from '../src/core/location/snapshots'
import type { LocationMap } from '../src/core/location/types'
import { createProject } from '../src/core/model/project'
import type { Entity } from '../src/core/model/types'
import { useStore } from '../src/core/store/store'
import { WORLD_DOC } from '../src/core/world'

afterEach(cleanup)

const project = createProject('Tools')
const all = (map: LocationMap, layer: string) => map.layers[layer]?.objects ?? []

describe('generator sliders', () => {
  it('change only the layers they feed, keep each roll, and leave nothing out of date', () => {
    const loc: Entity = { id: 'v', name: 'V', type: 'Village', size: 'Large' }
    const map = generateMap(project, loc, 4)!
    const dense = withParams(project, loc, map, { density: 1.8 })
    const sparse = withParams(project, loc, map, { density: 0.5 })
    expect(all(dense, 'buildings').length).toBeGreaterThan(all(sparse, 'buildings').length)
    expect(dense.layers.roads).toBe(map.layers.roads)
    expect(dense.layers.buildings.nonce).toBe(map.layers.buildings.nonce)
    expect(staleLayers(dense)).toEqual([])
    expect(dense.params).toEqual({ density: 1.8 })
    expect(withParams(project, loc, map, { density: 1.8 })).toEqual(dense)
  })

  it('exist for every type, each changing its map, quickly enough to follow a slider', { timeout: 60_000 }, () => {
    for (const type of LOCATION_TYPES) {
      const loc: Entity = { id: 'l', name: 'L', type: type.id, enemies: [] }
      const map = generateMap(project, loc, 3)!
      expect(type.params?.length, type.id).toBeGreaterThan(0)
      for (const p of type.params!) {
        const value = p.default === p.max ? p.min : p.max
        const start = performance.now()
        const next = withParams(project, loc, map, { [p.id]: value })
        const ms = performance.now() - start
        expect(p.layers.some((l) => JSON.stringify(next.layers[l]?.objects) !== JSON.stringify(map.layers[l]?.objects)), `${type.id}.${p.id}`).toBe(true)
        // A loose bound: a step takes milliseconds, but a busy machine running the whole suite is slow.
        expect(ms, `${type.id}.${p.id}`).toBeLessThan(4000)
        expect(parseMap(JSON.parse(JSON.stringify(next)))).toEqual(next)
      }
    }
  })
})

describe('versions', () => {
  it('save, restore and delete named versions, keeping at most ten', () => {
    const loc: Entity = { id: 'd', name: 'D', type: 'Dungeon' }
    const a = generateMap(project, loc, 1)!
    const saved = saveSnapshot(a, 's1', 'First try', '2026-11-19T10:00:00.000Z')
    const b = { ...generateMap(project, loc, 2)!, snapshots: saved.snapshots }
    const back = restoreSnapshot(b, 's1')
    expect({ ...back, snapshots: undefined }).toEqual({ ...a, snapshots: undefined })
    expect(back.snapshots).toEqual(saved.snapshots)
    expect(back.snapshots![0].map).not.toHaveProperty('snapshots')
    expect(removeSnapshot(back, 's1').snapshots).toBeUndefined()
    let many = a
    for (let i = 0; i < MAX_SNAPSHOTS + 3; i++) many = saveSnapshot(many, `s${i}`, '', 'now')
    expect(many.snapshots).toHaveLength(MAX_SNAPSHOTS)
    expect(many.snapshots![0].id).toBe('s3')
    expect(many.snapshots!.at(-1)!.label).toBe(`Version ${MAX_SNAPSHOTS + 1}`)
    expect(parseMap(JSON.parse(JSON.stringify(many)))).toEqual(many)
  })
})

describe('styles', () => {
  it('every style draws every kind of map, in its own colours', () => {
    const maps = LOCATION_TYPES.map((t) => ({ loc: { id: t.id, name: t.id, type: t.id } as Entity, map: generateMap(project, { id: t.id, name: t.id, type: t.id }, 2)! }))
    const kinds = new Set(maps.flatMap(({ map }) => Object.values(map.layers).flatMap((l) => l.objects.map((o) => o.kind))))
    expect([...kinds].every((k) => KINDS[k])).toBe(true)
    for (const theme of Object.values(THEMES)) {
      for (const { loc, map } of maps) {
        const svg = toSvgString(renderMap(project, loc, { ...map, theme: theme.id }).node)
        expect(svg, `${theme.id} ${loc.type}`).toContain(theme.ink)
        expect(svg).toContain(theme.paper)
      }
    }
  })

  it('draws houses as flat outlines in the plan styles', () => {
    const loc: Entity = { id: 'v', name: 'V', type: 'Village' }
    const map = generateMap(project, loc, 2)!
    const house = all(map, 'buildings').find((h) => !h.props?.use)!
    const look = (theme: string) => toSvgString(renderMap(project, loc, { ...map, theme }).node).split(`data-obj="${house.id}"`)[1].split('</g></g>')[0]
    expect(look('parchment')).toContain(THEMES.parchment.roofShade)
    expect(look('modern')).toContain('stroke-linejoin="miter"')
  })
})

describe('labelled history', () => {
  it('keeps what each step did, also when quick steps join into one', () => {
    useStore.getState().loadProject(createProject('History'), 'x')
    const { mutate } = useStore.getState()
    mutate((p) => void (p.meta.name = 'A'), 'k', 'Rename')
    mutate((p) => void (p.meta.name = 'AB'), 'k', 'Rename again')
    mutate((p) => void (p.meta.name = 'ABC'))
    const past = useStore.getState().past
    expect(past.map((h) => h.label)).toEqual(['Rename', undefined])
  })
})

describe('Map view tools', () => {
  it('moves a slider into one labelled step, changes the style, saves a version and goes back in the history', async () => {
    const p = createProject('UI')
    const loc = { id: 'v', name: 'Oakham', type: 'Village' }
    p.documents[WORLD_DOC].data.locations = [{ ...loc, map: generateMap(p, loc, 5) }]
    useStore.getState().loadProject(p, 'x')
    window.location.hash = '#/doc/design.world?s=locations'
    render(<App />)
    fireEvent.click((await screen.findAllByRole('button', { name: 'Map' })).find((b) => b.closest('.tabs'))!)
    const stored = () => useStore.getState().project.documents[WORLD_DOC].data.locations[0].map as LocationMap
    const houses = all(stored(), 'buildings').length
    const slider = screen.getByLabelText('Density')
    fireEvent.change(slider, { target: { value: '1.8' } })
    // While the slider moves nothing is stored yet.
    expect(stored().params).toBeUndefined()
    fireEvent.pointerUp(slider)
    expect(stored().params).toEqual({ density: 1.8 })
    expect(all(stored(), 'buildings').length).toBeGreaterThan(houses)
    fireEvent.change(screen.getByLabelText('Map style'), { target: { value: 'swamp' } })
    expect(stored().theme).toBe('swamp')
    fireEvent.change(screen.getByLabelText('Version name'), { target: { value: 'Dense swamp' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save version' }))
    expect(stored().snapshots!.map((s) => s.label)).toEqual(['Dense swamp'])
    const history = screen.getByRole('region', { name: 'History' })
    expect(history.textContent).toContain('Save version (now)')
    expect(history.textContent).toContain('Change style')
    expect(history.textContent).toContain('Set density')
    fireEvent.click(screen.getByRole('button', { name: 'Set density' }))
    expect(stored().theme).toBeUndefined()
    expect(stored().params).toEqual({ density: 1.8 })
  })
})
