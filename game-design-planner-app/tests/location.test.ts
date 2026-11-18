import { describe, expect, it } from 'vitest'
import { createProject } from '../src/core/model/project'
import type { Entity } from '../src/core/model/types'
import { exportAssets, locationMapPath, moduleToMarkdown } from '../src/core/export/markdown'
import { dependents, generateMap, regenerateLayer, regenerateStale, setLayerHidden, staleLayers } from '../src/core/location/generate'
import { addObject, ctrlMoved, duplicateObject, findObject, moved, putObject, removeObject, resized, resizedTo, rotatedTo, setLayerLocked, setPinned } from '../src/core/location/edit'
import { dist, radiusOf } from '../src/core/location/geometry'
import { KINDS } from '../src/core/location/objects'
import { getLocationType } from '../src/core/location/registry'
import { locationSvg } from '../src/core/location/render/svg'
import { mapOf, parseMap } from '../src/core/location/schema'
import type { LocationMap } from '../src/core/location/types'
import { getModule, getSections } from '../src/core/modules/registry'
import { WORLD_DOC } from '../src/core/world'

const project = createProject('Maps')
const village = (extra: Record<string, unknown> = {}): Entity => ({ id: 'v1', name: 'Oakham', type: 'Village', ...extra })
const gen = (location: Entity, seed = 42) => generateMap(project, location, seed)!
const count = (map: LocationMap, layer: string, kind?: string) => map.layers[layer].objects.filter((o) => !kind || o.kind === kind).length

describe('locations section', () => {
  it('is the last World section and offers the gallery and the map', () => {
    const sections = getSections(getModule(WORLD_DOC)!, project.registry)
    const sec = sections[sections.length - 1]
    expect(sec.id).toBe('locations')
    expect(sec.kind === 'collection' && sec.views.slice(0, 2).map((v) => v.kind)).toEqual(['locationGallery', 'locationMap'])
    expect(project.documents[WORLD_DOC].data.locations).toEqual([])
  })
})

describe('map generation', () => {
  it('gives the same map for the same inputs and seed, and another one for another seed', () => {
    expect(gen(village())).toEqual(gen(village()))
    expect(gen(village(), 43)).not.toEqual(gen(village()))
  })

  it('has every layer of the type and stores whole numbers', () => {
    const map = gen(village())
    // Stored in generation order, which can differ from the drawing order.
    expect(Object.keys(map.layers).sort()).toEqual(getLocationType('Village')!.layers.map((l) => l.id).sort())
    for (const o of Object.values(map.layers).flatMap((l) => l.objects)) {
      expect(Number.isInteger(o.x) && Number.isInteger(o.y)).toBe(true)
      for (const p of o.points ?? []) expect(Number.isInteger(p[0]) && Number.isInteger(p[1])).toBe(true)
    }
  })

  it('returns nothing for a type without a generator', () => {
    expect(generateMap(project, { id: 'd', name: 'Moon base', type: 'Space station' }, 1)).toBeNull()
    expect(generateMap(project, { id: 'x', name: 'Untyped' }, 1)).toBeNull()
  })

  it('follows the inputs: size, population, walls and water', () => {
    expect(gen(village({ size: 'Small' })).w).toBeLessThan(gen(village({ size: 'Large' })).w)
    expect(count(gen(village({ population: 40 })), 'buildings')).toBeLessThan(count(gen(village({ population: 200 })), 'buildings'))
    expect(count(gen(village()), 'walls')).toBe(0)
    const walled = gen(village({ walls: 'Stone' }))
    expect(count(walled, 'walls', 'wall')).toBe(1)
    expect(count(walled, 'walls', 'gate')).toBeGreaterThan(0)
    const river = gen(village({ water: 'River' }))
    expect(count(river, 'water', 'river')).toBe(1)
    expect(count(river, 'roads', 'bridge')).toBeGreaterThan(0)
    expect(count(gen(village({ water: 'Coast' })), 'water', 'coast')).toBe(1)
  })

  it('keeps houses on the map and apart from each other', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const map = gen(village({ size: 'Large', water: 'River', walls: 'Palisade' }), seed)
      const houses = map.layers.buildings.objects
      expect(houses.length).toBeGreaterThan(10)
      for (const [i, a] of houses.entries()) {
        expect(a.x > 0 && a.y > 0 && a.x < map.w && a.y < map.h).toBe(true)
        for (const b of houses.slice(i + 1)) expect(dist([a.x, a.y], [b.x, b.y])).toBeGreaterThan((radiusOf(a) + radiusOf(b)) * 0.7)
      }
    }
  })

  it('draws landmark buildings from the Town module with a label', () => {
    const p = createProject('Landmarks')
    const inn = p.documents['design.town'].data.buildings[0]
    const map = generateMap(p, village({ landmarks: [inn.id, 'gone'] }), 7)!
    const marks = map.layers.landmarks.objects.filter((o) => o.kind === 'landmark')
    expect(marks.map((o) => [o.label, o.refId])).toEqual([[inn.name, inn.id]])
    expect(map.layers.labels.objects.map((o) => o.label)).toEqual([inn.name])
  })
})

describe('layers', () => {
  it('rerolls one layer, leaves the layers below alone and marks the ones above stale', () => {
    const location = village({ water: 'River' })
    const map = gen(location)
    const next = regenerateLayer(project, location, map, 'roads')
    expect(next.layers.roads.nonce).toBe(1)
    expect(next.layers.roads.objects).not.toEqual(map.layers.roads.objects)
    expect(next.layers.water).toBe(map.layers.water)
    expect(next.layers.ground).toBe(map.layers.ground)
    expect(staleLayers(next).sort()).toEqual(dependents(getLocationType('Village')!, 'roads').sort())
    expect(next.layers.buildings.objects).toEqual(map.layers.buildings.objects)
    expect(map.layers.roads.nonce).toBe(0)
  })

  it('updates stale layers to fit, without rerolling them', () => {
    const location = village()
    const next = regenerateStale(project, location, regenerateLayer(project, location, gen(location), 'roads'))
    expect(staleLayers(next)).toEqual([])
    expect(next.layers.buildings.nonce).toBe(0)
    expect(regenerateStale(project, location, next)).toBe(next)
  })

  it('keeps pinned objects through a reroll and a new map', () => {
    const location = village()
    const map = gen(location)
    const pinned = { ...map.layers.buildings.objects[0], pinned: true as const }
    const edited: LocationMap = { ...map, layers: { ...map.layers, buildings: { ...map.layers.buildings, objects: [pinned, ...map.layers.buildings.objects.slice(1)] } } }
    const rerolled = regenerateLayer(project, location, edited, 'buildings')
    expect(rerolled.layers.buildings.objects).toContainEqual(pinned)
    const others = rerolled.layers.buildings.objects.filter((o) => o.id !== pinned.id)
    for (const o of others) expect(dist([o.x, o.y], [pinned.x, pinned.y])).toBeGreaterThan(8)
    expect(generateMap(project, location, 99, edited)!.layers.buildings.objects).toContainEqual(pinned)
  })

  it('hides a layer and skips locked ones', () => {
    const location = village()
    const map = gen(location)
    const hidden = setLayerHidden(map, 'vegetation', true)
    expect(hidden.layers.vegetation.hidden).toBe(true)
    expect(locationSvg(project, { ...location, map: hidden })).not.toContain('data-layer="vegetation"')
    expect(setLayerHidden(hidden, 'vegetation', false)).toEqual(map)
    expect(regenerateLayer(project, location, hidden, 'roads').layers.vegetation.hidden).toBe(true)
    const locked: LocationMap = { ...map, layers: { ...map.layers, roads: { ...map.layers.roads, locked: true } } }
    expect(regenerateLayer(project, location, locked, 'roads')).toBe(locked)
  })
})

describe('editing by hand', () => {
  const location = village({ walls: 'Stone', water: 'River' })
  const map = gen(location)
  const house = map.layers.buildings.objects[0]
  const road = map.layers.roads.objects.find((o) => o.kind === 'road')!
  const wall = map.layers.walls.objects.find((o) => o.kind === 'wall')!

  it('knows how to handle every kind a generator makes', () => {
    for (const o of Object.values(map.layers).flatMap((l) => l.objects)) expect(KINDS[o.kind], o.kind).toBeTruthy()
    for (const l of getLocationType('Village')!.layers) for (const kind of l.addable ?? []) expect(KINDS[kind].make, kind).toBeTruthy()
  })

  it('moves an object, pins it and marks the layers above stale', () => {
    const next = putObject(map, moved(house, 12.4, -7))
    const got = findObject(next, house.id)!
    expect(got.layerId).toBe('buildings')
    expect([got.object.x, got.object.y, got.object.pinned]).toEqual([house.x + 12, house.y - 7, true])
    expect(staleLayers(next)).toEqual(['vegetation'])
    expect(findObject(map, house.id)!.object.pinned).toBeUndefined()
    expect(regenerateLayer(project, location, next, 'buildings').layers.buildings.objects).toContainEqual(got.object)
  })

  it('moves a curve with its waypoints and bends it by one waypoint', () => {
    const shifted = moved(road, 10, 5)
    expect(shifted.points![0]).toEqual([road.points![0][0] + 10, road.points![0][1] + 5])
    expect(shifted.ctrl![1]).toEqual([road.ctrl![1][0] + 10, road.ctrl![1][1] + 5])
    const bent = ctrlMoved(road, 1, [road.ctrl![1][0], road.ctrl![1][1] + 120])
    expect(bent.ctrl![1][1]).toBe(road.ctrl![1][1] + 120)
    expect(bent.ctrl![0]).toEqual(road.ctrl![0])
    expect(bent.points).not.toEqual(road.points)
    expect(bent.points![0]).toEqual(road.ctrl![0])
    expect(ctrlMoved(road, 99, [0, 0])).toBe(road)
    expect(ctrlMoved(house, 0, [0, 0])).toBe(house)
  })

  it('keeps a wall closed when it is bent', () => {
    const bent = ctrlMoved(wall, 0, [wall.ctrl![0][0] + 40, wall.ctrl![0][1]])
    const pts = bent.points!
    expect(dist(pts[0], pts[pts.length - 1])).toBeLessThan(40)
    expect(pts[0]).not.toEqual(pts[pts.length - 1])
  })

  it('resizes about the centre, in the rotated frame, and rotates towards the pointer', () => {
    const box = { id: 'b', kind: 'house', x: 100, y: 100, w: 20, h: 10, rot: 0 }
    expect(resizedTo(box, [130, 110])).toMatchObject({ w: 60, h: 20 })
    expect(resizedTo({ ...box, rot: 90 }, [110, 130])).toMatchObject({ w: 60, h: 20 })
    expect(resizedTo(box, [100, 100])).toMatchObject({ w: 6, h: 6 })
    expect(resized({ ...box, kind: 'tree' }, 30, 12)).toMatchObject({ w: 30, h: 30 })
    expect(rotatedTo(box, [100, 50]).rot).toBe(0)
    expect(rotatedTo(box, [150, 100]).rot).toBe(90)
  })

  it('adds, duplicates and removes objects', () => {
    const added = addObject(map, 'buildings', 'house', [300.6, 200], 'm-1')
    expect(findObject(added, 'm-1')!.object).toMatchObject({ kind: 'house', x: 301, y: 200, pinned: true })
    expect(addObject(added, 'buildings', 'house', [1, 1], 'm-1')).toBe(added)
    expect(addObject(map, 'buildings', 'patch', [1, 1], 'm-2')).toBe(map)
    expect(addObject(map, 'nowhere', 'house', [1, 1], 'm-2')).toBe(map)
    const copied = duplicateObject(added, 'm-1', 'm-3')
    expect(findObject(copied, 'm-3')!.object).toMatchObject({ kind: 'house', x: 315, y: 214 })
    const removed = removeObject(copied, 'm-1')
    expect(findObject(removed, 'm-1')).toBeNull()
    expect(findObject(removed, 'm-3')).toBeTruthy()
    expect(removeObject(map, 'missing')).toBe(map)
    expect(regenerateLayer(project, location, copied, 'buildings').layers.buildings.objects.map((o) => o.id)).toEqual(expect.arrayContaining(['m-1', 'm-3']))
  })

  it('releases a pin without marking anything stale, and leaves locked layers alone', () => {
    const pinned = setPinned(map, house.id, true)
    expect(findObject(pinned, house.id)!.object.pinned).toBe(true)
    expect(staleLayers(pinned)).toEqual([])
    expect(findObject(setPinned(pinned, house.id, false), house.id)!.object).toEqual(house)
    const locked = setLayerLocked(map, 'buildings', true)
    expect(putObject(locked, moved(house, 5, 5))).toBe(locked)
    expect(removeObject(locked, house.id)).toBe(locked)
    expect(addObject(locked, 'buildings', 'house', [1, 1], 'm-9')).toBe(locked)
    expect(generateMap(project, location, 5, locked)!.layers.buildings).toBe(locked.layers.buildings)
    expect(setLayerLocked(locked, 'buildings', false)).toEqual(map)
  })

  it('survives a save and load with edits', () => {
    const edited = putObject(addObject(map, 'roads', 'road', [200, 200], 'm-r'), ctrlMoved(road, 1, [400, 300]))
    expect(parseMap(JSON.parse(JSON.stringify(edited)))).toEqual(edited)
  })
})

describe('stored maps are untrusted', () => {
  it('round-trips a generated map', () => {
    const map = gen(village({ walls: 'Stone', water: 'River' }))
    expect(parseMap(JSON.parse(JSON.stringify(map)))).toEqual(map)
  })

  it('drops junk instead of failing', () => {
    const map = gen(village())
    const good = map.layers.buildings.objects[0]
    const raw = { ...map, layers: { buildings: { nonce: 'x', objects: [good, { id: 'bad', kind: 'house', x: 'NaN', y: 0 }, null, { ...good, id: 'far', x: 1e12 }] }, broken: 5 } }
    const parsed = parseMap(raw)!
    expect(parsed.layers.buildings).toEqual({ nonce: 0, objects: [good] })
    expect(parsed.layers.broken).toBeUndefined()
    expect(parseMap({ v: 2 })).toBeNull()
    expect(mapOf({ id: 'a', map: 'nope' })).toBeNull()
    expect(mapOf({ id: 'a' })).toBeNull()
  })
})

describe('rendering and export', () => {
  it('escapes names and draws every layer', () => {
    const location = village({ name: '<script>alert(1)</script> & "Sons"' })
    const svg = locationSvg(project, { ...location, map: gen(location) })!
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg).not.toContain('<script>')
    expect(svg).toContain('&lt;script&gt;')
    for (const l of getLocationType('Village')!.layers) expect(svg).toContain(`data-layer="${l.id}"`)
    expect(locationSvg(project, village())).toBeNull()
  })

  it('exports each map as a file the Markdown links to', () => {
    const p = createProject('Export')
    const location = village()
    p.documents[WORLD_DOC].data.locations = [{ ...location, map: gen(location) }, { id: 'v2', name: 'Unmapped', type: 'Village' }]
    const mod = getModule(WORLD_DOC)!
    const assets = exportAssets(p, mod)
    expect(assets.map((a) => a.path)).toEqual([locationMapPath(location)])
    expect(assets[0].content).toContain('<svg')
    const md = moduleToMarkdown(p, mod)
    expect(md).toContain(`](${locationMapPath(location)})`)
    expect(md).not.toContain('"layers"')
  })
})
