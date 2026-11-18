import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '../src/core/i18n'
import { App } from '../src/App'
import { mapChecks, mapGraph, mapLight, mapNav } from '../src/core/location/analysis'
import { generateMap } from '../src/core/location/generate'
import { darkCells, lightAt, lightGrid, lightOf } from '../src/core/location/light'
import { buildNav } from '../src/core/location/nav'
import { gridOf } from '../src/core/location/raster'
import { lightOverlay, navOverlay } from '../src/core/location/render/overlays'
import { renderMap } from '../src/core/location/render/svg'
import { toSvgString } from '../src/core/location/render/node'
import { inRoom } from '../src/core/location/rooms'
import type { LocationMap, MapObject } from '../src/core/location/types'
import { playerView } from '../src/core/location/visibility'
import { createProject } from '../src/core/model/project'
import type { Entity, Project } from '../src/core/model/types'
import { useStore } from '../src/core/store/store'
import { WORLD_DOC } from '../src/core/world'

afterEach(cleanup)

const project = createProject('Metadata')
const all = (map: LocationMap, layer?: string) => (layer ? map.layers[layer]?.objects ?? [] : Object.values(map.layers).flatMap((l) => l.objects))
const withObjects = (map: LocationMap, layer: string, objects: MapObject[]): LocationMap => ({ ...map, layers: { ...map.layers, [layer]: { nonce: 0, objects } } })

function peopleProject(): Project {
  const p = createProject('People')
  p.documents['design.npc'].data.archetypes = [{ id: 'smith', name: 'Smith' }, { id: 'guard', name: 'Guard' }]
  p.documents['design.trade'].data.merchants = [{ id: 'm1', name: 'Spice seller' }, { id: 'm2', name: 'Cloth trader' }]
  return p
}

describe('light and shadow', () => {
  // Two rooms in rock with a wall between them; a torch in the left one only.
  const twoRooms = (time?: 'day' | 'dusk' | 'night'): LocationMap => ({
    v: 2,
    type: 'Dungeon',
    seed: 1,
    w: 400,
    h: 200,
    layers: {
      rooms: { nonce: 0, objects: [{ id: 'a', kind: 'chamber', x: 100, y: 100, w: 140, h: 120 }, { id: 'b', kind: 'chamber', x: 300, y: 100, w: 140, h: 120 }] },
      lights: { nonce: 0, objects: [{ id: 't', ...lightOf('torch', 100, 100) } as MapObject] },
    },
    ...(time ? { env: { time } } : {}),
  })

  it('lights what the source can see and leaves the room behind the wall dark', () => {
    const map = twoRooms()
    const light = lightGrid(map, buildNav(map, { cell: 8, open: false }, ['rooms', 'lights']))
    expect(lightAt(light, [100, 100])).toBeGreaterThan(0.8)
    expect(lightAt(light, [150, 100])).toBeGreaterThan(0.1)
    expect(lightAt(light, [250, 100])).toBe(0)
    expect(lightAt(light, [100, 100])).toBeGreaterThan(lightAt(light, [150, 100]))
  })

  it('follows the time of day outdoors and through windows', () => {
    const village = generateMap(project, { id: 'v', name: 'V', type: 'Village' }, 2)!
    const at = (time: 'day' | 'dusk' | 'night') => mapLight({ ...village, env: { time } })
    expect(Math.min(...at('day').level)).toBe(1)
    expect(darkCells(at('night'), mapNav(village)).length).toBeGreaterThan(darkCells(at('dusk'), mapNav(village)).length)
    const house = generateMap(project, { id: 'h', name: 'H', type: 'Dwelling', footprint: 'House' }, 2)!
    const window = all(house, 'lights').find((l) => l.props?.type === 'window')!
    const near: [number, number] = [window.x, window.y]
    expect(lightAt(mapLight(house), near)).toBeGreaterThan(lightAt(mapLight({ ...house, env: { time: 'night' } }), near))
  })

  it('lights every type of map: torches and braziers below, lamps in town, hearths and candles at home', () => {
    const kinds = (map: LocationMap) => new Set(all(map, 'lights').map((l) => String(l.props?.type)))
    const dungeon = generateMap(project, { id: 'd', name: 'D', type: 'Dungeon', size: 'Large' }, 4)!
    expect([...kinds(dungeon)].sort()).toEqual(['brazier', 'torch'])
    const boss = all(dungeon, 'rooms').find((r) => r.props?.role === 'boss')!
    expect(lightAt(mapLight(dungeon), [boss.x, boss.y])).toBeGreaterThan(0.4)
    const city = generateMap(project, { id: 'c', name: 'C', type: 'City', walls: 'Stone' }, 4)!
    expect([...kinds(city)].sort()).toEqual(['brazier', 'lamp'])
    const home = generateMap(project, { id: 'h', name: 'H', type: 'Dwelling', footprint: 'Manor' }, 4)!
    for (const k of ['hearth', 'candle', 'window']) expect(kinds(home).has(k), k).toBe(true)
    const cave = generateMap(project, { id: 'k', name: 'K', type: 'Cave' }, 4)!
    expect(kinds(cave).has('crystal')).toBe(true)
    // Underground and away from every light it is dark.
    expect(darkCells(mapLight(dungeon), mapNav(dungeon)).length).toBeGreaterThan(0)
  })

  it('draws the light and walkability overlays as a few paths', () => {
    const map = generateMap(project, { id: 'd', name: 'D', type: 'Dungeon' }, 4)!
    const nav = navOverlay(mapNav(map))
    const light = lightOverlay(mapLight(map), mapNav(map))
    expect(nav.children!.length).toBe(5)
    expect(String(nav.children![0].attrs!.d).length).toBeGreaterThan(100)
    expect(light.children!.length).toBe(4)
  })
})

describe('sun and time of day in the drawing', () => {
  it('casts shadows away from the sun and tints dusk and night', () => {
    const map = generateMap(project, { id: 'v', name: 'V', type: 'Village' }, 3)!
    const svg = (m: LocationMap) => toSvgString(renderMap(project, { id: 'v', name: 'V', type: 'Village' }, m).node)
    const east = svg({ ...map, env: { sun: 90 } })
    const west = svg({ ...map, env: { sun: 270 } })
    expect(east).not.toBe(west)
    expect(svg(map)).toBe(svg({ ...map }))
    expect(svg({ ...map, env: { time: 'night' } })).toContain('#14203d')
    expect(svg(map)).not.toContain('#14203d')
  })
})

describe('secrets and the player view', () => {
  it('marks the secret room, its way in, its chest and the traps, and leaves them out of the player view', () => {
    const map = generateMap(project, { id: 'd', name: 'Vault', type: 'Dungeon', size: 'Large', secretRooms: 1, traps: true, keyLocks: 1 }, 8)!
    const secret = all(map).filter((o) => o.secret)
    const kinds = new Set(secret.map((o) => o.kind))
    for (const k of ['chamber', 'corridor', 'door', 'trap']) expect(kinds.has(k), k).toBe(true)
    const player = playerView(map)
    expect(all(player).some((o) => o.secret || o.kind === 'marker' || o.kind === 'key' || o.kind === 'trap')).toBe(false)
    expect(all(player).some((o) => o.label === 'Secret room' || o.label === 'Boss' || o.label === 'Red key')).toBe(false)
    expect(all(player, 'rooms').length).toBe(all(map, 'rooms').length - 1)
    // The secret room's link is secret in the room graph too.
    expect(mapGraph(map)!.edges.some((e) => e.secret)).toBe(true)
  })
})

describe('people as spawn points', () => {
  it('puts merchants by the stalls and residents round the town, all reachable', () => {
    const p = peopleProject()
    const city = { id: 'c', name: 'C', type: 'City', merchants: ['m1', 'm2'], residents: ['smith', 'guard'] }
    const map = generateMap(p, city, 6)!
    const people = all(map, 'people')
    expect(people.filter((o) => o.spawn?.role === 'merchant').map((o) => o.refId).sort()).toEqual(['m1', 'm2'])
    expect(people.filter((o) => o.spawn?.role === 'npc').length).toBeGreaterThanOrEqual(2)
    expect(mapChecks(city, map).filter((c) => c.id.startsWith('reach-'))).toEqual([])
    const stalls = all(map, 'buildings').filter((h) => h.props?.use === 'stall')
    if (stalls.length) {
      const m = people.find((o) => o.refId === 'm1')!
      expect(Math.min(...stalls.map((s) => Math.hypot(s.x - m.x, s.y - m.y)))).toBeLessThan(40)
    }
  })

  it('puts the owner in the main room of the house', () => {
    const p = peopleProject()
    const map = generateMap(p, { id: 'h', name: 'H', type: 'Dwelling', footprint: 'House', owner: 'smith' }, 2)!
    const owner = all(map, 'people')[0]
    expect(owner).toMatchObject({ refId: 'smith', spawn: { role: 'npc', refId: 'smith' } })
    const room = all(map, 'rooms').find((r) => inRoom(r, [owner.x, owner.y]))
    expect(['Main room', 'Great hall', 'Living room', 'Hall']).toContain(room?.label)
  })

  it('reports a creature put where nobody can walk and a boss outside the boss room', () => {
    const loc: Entity = { id: 'd', name: 'D', type: 'Dungeon' }
    const map = generateMap(project, loc, 3)!
    const boss = all(map, 'contents').find((o) => o.props?.type === 'boss')!
    const moved = withObjects(map, 'contents', [...all(map, 'contents').filter((o) => o !== boss), { ...boss, x: 8, y: 8 }])
    const ids = mapChecks(loc, moved).map((c) => c.id)
    expect(ids).toContain(`boss-${boss.id}`)
    expect(ids).toContain(`reach-${boss.id}`)
  })
})

describe('cave rivers', () => {
  it('run along the floor', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const map = generateMap(project, { id: 'k', name: 'K', type: 'Cave', caveWater: 'Underground river' }, seed)!
      const river = all(map, 'water').find((o) => o.kind === 'river')
      if (!river) continue
      const rock = gridOf(map.fields!.rock)!
      const onRock = river.points!.filter(([x, y]) => rock.data[Math.floor(y / rock.cell) * rock.cols + Math.floor(x / rock.cell)] === 1)
      expect(onRock.length / river.points!.length, `seed ${seed}`).toBeLessThan(0.08)
    }
  })
})

describe('Map view controls', () => {
  it('switches overlays, the player view and the time of day', async () => {
    const p = createProject('UI')
    const loc = { id: 'd', name: 'Crypt', type: 'Dungeon', secretRooms: 1, traps: true }
    p.documents[WORLD_DOC].data.locations = [{ ...loc, map: generateMap(p, loc, 5) }]
    useStore.getState().loadProject(p, 'x')
    window.location.hash = '#/doc/design.world?s=locations'
    const { container } = render(<App />)
    fireEvent.click((await screen.findAllByRole('button', { name: 'Map' })).find((b) => b.closest('.tabs'))!)
    expect(container.querySelector('[data-testid="loc-overlay"]')).toBeNull()
    fireEvent.change(screen.getByLabelText('Overlay'), { target: { value: 'nav' } })
    expect(container.querySelector('[data-overlay="nav"]')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Overlay'), { target: { value: 'light' } })
    expect(container.querySelector('[data-overlay="light"]')).toBeTruthy()
    const traps = () => container.querySelectorAll('.loc-svg [data-layer="features"] [data-obj]').length
    const before = traps()
    fireEvent.click(screen.getByLabelText('Player view'))
    expect(traps()).toBeLessThan(before)
    fireEvent.change(screen.getByLabelText('Time of day'), { target: { value: 'night' } })
    const stored = useStore.getState().project.documents[WORLD_DOC].data.locations[0].map
    expect(stored.env).toEqual({ time: 'night' })
    expect(screen.getByLabelText('Checks')).toBeTruthy()
  })
})
