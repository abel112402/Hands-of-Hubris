import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '../src/core/i18n'
import { App } from '../src/App'
import { lockCheck, mapChecks, mapGraph, mapNav } from '../src/core/location/analysis'
import { moved, putObject } from '../src/core/location/edit'
import { generateMap } from '../src/core/location/generate'
import { inPolygon } from '../src/core/location/geometry'
import { anchorOf, childrenOf, parentChain, wayOut } from '../src/core/location/links'
import { reachable } from '../src/core/location/nav'
import { parseMap } from '../src/core/location/schema'
import { metrics, reach } from '../src/core/location/topology'
import type { LocationMap, MapObject } from '../src/core/location/types'
import { caveLocks } from '../src/core/location/types/cave'
import { createProject } from '../src/core/model/project'
import type { Entity, Project } from '../src/core/model/types'
import { useStore } from '../src/core/store/store'
import { WORLD_DOC } from '../src/core/world'

afterEach(cleanup)

const all = (map: LocationMap, layer?: string) => (layer ? map.layers[layer]?.objects ?? [] : Object.values(map.layers).flatMap((l) => l.objects))
const withLocations = (p: Project, list: Entity[]) => {
  p.documents[WORLD_DOC].data.locations = list
  return p
}
/** A village, and a house on it linked to a new dwelling inside it. */
function villageWithHouse(houseIndex = 0) {
  const p = createProject('Links')
  const village: Entity = { id: 'v', name: 'Oakham', type: 'Village' }
  const vmap = generateMap(p, village, 3)!
  const house = all(vmap, 'buildings').filter((h) => h.attach)[houseIndex]
  const linked = putObject(vmap, { ...house, link: { locationId: 'h' } }, { heal: false })
  const home: Entity = { id: 'h', name: 'Miller house', type: 'Dwelling', footprint: 'House', parent: 'v' }
  withLocations(p, [{ ...village, map: linked }, home])
  return { p, village: { ...village, map: linked }, house: { ...house, link: { locationId: 'h' } } as MapObject, home }
}

describe('maps inside maps', () => {
  it('knows the chain of places and the children of a place', () => {
    const { p, village, home } = villageWithHouse()
    const cellar: Entity = { id: 'c', name: 'Cellar', type: 'Dungeon', parent: 'h' }
    withLocations(p, [village, home, cellar])
    expect(parentChain(p, cellar).map((l) => l.id)).toEqual(['v', 'h', 'c'])
    expect(childrenOf(p, village).map((l) => l.id)).toEqual(['h'])
    // A loop of parents stops instead of running forever.
    const own = { ...cellar, parent: 'c' }
    withLocations(p, [village, home, own])
    expect(parentChain(p, own).length).toBe(1)
  })

  it('puts a house’s front door on the side that faces its road on the town map', () => {
    for (const i of [0, 1, 2, 3, 4]) {
      const { p, home } = villageWithHouse(i)
      const anchor = anchorOf(p, home)!
      expect(anchor.object.link?.locationId).toBe('h')
      const map = generateMap(p, home, 5 + i)!
      const front = wayOut(map)!
      const rooms = all(map, 'rooms')
      const x1 = Math.max(...rooms.map((r) => r.x + (r.w ?? 0) / 2))
      const [y0, y1] = [Math.min(...rooms.map((r) => r.y - (r.h ?? 0) / 2)), Math.max(...rooms.map((r) => r.y + (r.h ?? 0) / 2))]
      const side = Math.abs(front.y - y1) < 1 ? 'south' : Math.abs(front.y - y0) < 1 ? 'north' : Math.abs(front.x - x1) < 1 ? 'east' : 'west'
      expect(side, `house ${i}`).toBe(anchor.side)
      // The way out leads back to the town, and the map remembers which house it was made for.
      expect(front.link).toEqual({ locationId: 'v' })
      expect(map.anchorStamp).toBe(anchor.stamp)
    }
  })

  it('notices when the house on the town map changed, and is quiet again after a new map', () => {
    const { p, village, house, home } = villageWithHouse()
    const map = generateMap(p, home, 2)!
    withLocations(p, [village, { ...home, map }])
    expect(mapChecks(home, map, p).filter((c) => c.id === 'anchor')).toEqual([])
    const turned = putObject(village.map, { ...house, rot: (house.rot ?? 0) + 90 })
    withLocations(p, [{ ...village, map: turned }, { ...home, map }])
    expect(mapChecks(home, map, p).map((c) => c.id)).toContain('anchor')
    const fresh = generateMap(p, home, 3)!
    expect(mapChecks(home, fresh, p).filter((c) => c.id === 'anchor')).toEqual([])
    // Moving it also counts: the house is a different shape on the map.
    expect(putObject(village.map, moved(house, 30, 0))).not.toBe(village.map)
  })

  it('labels the way up from a cellar dungeon and links it back, and reports links to places that are gone', () => {
    const { p, village, home } = villageWithHouse()
    const cellar: Entity = { id: 'c', name: 'Cellar', type: 'Dungeon', parent: 'h' }
    withLocations(p, [village, home, cellar])
    const map = generateMap(p, cellar, 4)!
    expect(all(map, 'labels').some((l) => l.label === 'Up to Miller house')).toBe(true)
    expect(wayOut(map)!.link).toEqual({ locationId: 'h' })
    withLocations(p, [village])
    expect(mapChecks(village, village.map, p).map((c) => c.id)).not.toContain(`link-${wayOut(map)!.id}`)
    const orphan = mapChecks(village, village.map, p)
    expect(orphan.some((c) => c.text.includes('no longer exists'))).toBe(true)
  })
})

describe('the world map', () => {
  function world() {
    const p = createProject('World')
    p.documents[WORLD_DOC].data.biomes = [
      { id: 'g', name: 'Greenvale', color: '#7fae5a' },
      { id: 'a', name: 'Ashen Wastes', color: '#a08060' },
      { id: 'f', name: 'Frostpeaks', color: '#b8cfe0' },
    ]
    const places: Entity[] = [
      { id: 'o', name: 'Oakham', type: 'Village', biome: 'g' },
      { id: 'h', name: 'Highgate', type: 'City', biome: 'g' },
      { id: 'c', name: 'Old Crypt', type: 'Dungeon', biome: 'a' },
      { id: 'i', name: 'Ice Cave', type: 'Cave', biome: 'f' },
      { id: 'x', name: 'Cellar', type: 'Dungeon', parent: 'o' },
    ]
    const w: Entity = { id: 'w', name: 'The Known Lands', type: 'World' }
    withLocations(p, [...places, w])
    return { p, w, places }
  }

  it('shares the land out among the biomes and puts every top-level place in its own biome, linked', () => {
    const { p, w } = world()
    for (const seed of [1, 2, 3, 4, 5]) {
      const map = generateMap(p, w, seed)!
      expect(all(map, 'land').length, `seed ${seed}`).toBeGreaterThan(0)
      expect(new Set(all(map, 'regions').map((r) => r.refId))).toEqual(new Set(['g', 'a', 'f']))
      const sites = all(map, 'sites')
      expect(sites.map((s) => s.link?.locationId).sort(), `seed ${seed}`).toEqual(['c', 'h', 'i', 'o'])
      for (const s of sites) {
        const biome = { o: 'g', h: 'g', c: 'a', i: 'f' }[s.link!.locationId as 'o']
        expect(all(map, 'regions').some((r) => r.refId === biome && inPolygon([s.x, s.y], r.points!)), `${s.label} seed ${seed}`).toBe(true)
      }
      expect(all(map, 'roads').length).toBe(1)
      expect(parseMap(JSON.parse(JSON.stringify(map)))).toEqual(map)
    }
  })

  it('is the same for the same seed and walkable on land only', () => {
    const { p, w } = world()
    expect(generateMap(p, w, 9)).toEqual(generateMap(p, w, 9))
    const map = generateMap(p, w, 9)!
    const nav = mapNav(map)
    expect(nav.cost[0]).toBe(0)
    const site = all(map, 'sites')[0]
    expect(nav.cost[Math.floor(site.y / nav.cell) * nav.cols + Math.floor(site.x / nav.cell)]).toBeGreaterThan(0)
  })

  it('makes one region of wild land when the world has no biomes yet', () => {
    const p = createProject('Empty')
    const map = generateMap(p, { id: 'w', name: 'W', type: 'World' }, 2)!
    expect(new Set(all(map, 'regions').map((r) => r.label))).toEqual(new Set(['Wilds']))
  })
})

describe('locked gates in caves', () => {
  it('locks only links that are the sole way on', () => {
    // 0–1–2–0 is a ring; 2–3–4 is a spur off it.
    const links: [number, number][] = [[0, 1], [1, 2], [2, 0], [2, 3], [3, 4]]
    expect(caveLocks(2, 5, links, 0)).toEqual([{ a: 2, b: 3, lock: 'red' }, { a: 3, b: 4, lock: 'blue' }])
    expect(caveLocks(1, 3, [[0, 1], [1, 2], [2, 0]], 0)).toEqual([])
  })

  it('keeps every cave solvable: each key lies before its gate, and the deepest chamber needs the keys', { timeout: 60_000 }, () => {
    const p = createProject('Caves')
    let locked = 0
    for (const seed of Array.from({ length: 20 }, (_, i) => i * 37 + 3)) {
      const loc: Entity = { id: 'k', name: 'K', type: 'Cave', size: 'Large', caveLocks: 2 }
      const map = generateMap(p, loc, seed)!
      const g = mapGraph(map)!
      const locks = [...new Set(g.edges.flatMap((e) => (e.lock ? [e.lock] : [])))]
      expect(lockCheck(map), `seed ${seed}`).toMatchObject({ ok: true })
      expect(all(map, 'contents').filter((o) => o.kind === 'key').map((k) => k.key).sort()).toEqual(locks.slice().sort())
      expect(all(map, 'chambers').filter((o) => o.kind === 'door' && o.lock).length).toBe(locks.length)
      if (locks.length) {
        locked++
        const open = reach(g, g.entrance, (e) => !e.lock)
        expect(open.size, `seed ${seed}`).toBeLessThan(metrics(g).nodes)
      }
    }
    expect(locked).toBeGreaterThan(10)
  })

  it('closes the passage on the walkability grid too, most of the time', () => {
    const p = createProject('Caves')
    let shut = 0
    let tried = 0
    for (const seed of [3, 40, 77, 114, 151, 188]) {
      const map = generateMap(p, { id: 'k', name: 'K', type: 'Cave', size: 'Large', caveLocks: 1 }, seed)!
      const g = mapGraph(map)!
      const gate = g.edges.find((e) => e.lock)
      if (!gate) continue
      tried++
      const behind = reach(g, g.entrance, () => true)
      const open = reach(g, g.entrance, (e) => !e.lock)
      const far = g.nodes.find((n) => behind.has(n.id) && !open.has(n.id))!
      const nav = mapNav(map)
      const entrance = g.nodes.find((n) => n.id === g.entrance)!
      const seen = reachable(nav, [entrance.x, entrance.y], { open: new Set() })
      if (!seen[Math.floor(far.y / nav.cell) * nav.cols + Math.floor(far.x / nav.cell)]) shut++
    }
    expect(shut).toBeGreaterThanOrEqual(Math.ceil(tried * 0.6))
  })
})

describe('Map view links', () => {
  it('creates a linked map from a house, opens it, and goes back by the breadcrumb', async () => {
    const p = createProject('UI')
    const village: Entity = { id: 'v', name: 'Oakham', type: 'Village' }
    withLocations(p, [{ ...village, map: generateMap(p, village, 3) }])
    useStore.getState().loadProject(p, 'x')
    window.location.hash = '#/doc/design.world?s=locations'
    const { container } = render(<App />)
    fireEvent.click((await screen.findAllByRole('button', { name: 'Map' })).find((b) => b.closest('.tabs'))!)
    const stored = () => useStore.getState().project.documents[WORLD_DOC].data.locations as Entity[]
    const house = all(stored()[0].map as LocationMap, 'buildings')[0]
    fireEvent.pointerDown(container.querySelector(`[data-obj="${house.id}"]`)!, { button: 0 })
    fireEvent.pointerUp(window)
    fireEvent.click(screen.getByRole('button', { name: 'Create linked map' }))
    const [, child] = stored()
    expect(child).toMatchObject({ type: 'Dwelling', parent: 'v' })
    expect(child.map).toBeTruthy()
    expect(all(stored()[0].map as LocationMap, 'buildings').find((h) => h.id === house.id)!.link).toEqual({ locationId: child.id })
    const crumbs = await screen.findByRole('navigation', { name: 'Inside' })
    expect(crumbs.textContent).toContain('Oakham')
    fireEvent.click(screen.getByRole('button', { name: 'Oakham' }))
    expect((screen.getByLabelText('Location') as HTMLSelectElement).value).toBe('v')
    expect(container.querySelector('[data-testid="loc-links"] .loc-link')).toBeTruthy()
    // One undo takes the new place and the link away together.
    useStore.getState().undo()
    expect(stored()).toHaveLength(1)
    expect(all(stored()[0].map as LocationMap, 'buildings').find((h) => h.id === house.id)!.link).toBeUndefined()
  })
})
