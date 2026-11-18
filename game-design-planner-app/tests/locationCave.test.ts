import { describe, expect, it } from 'vitest'
import { mapGraph, unreachableObjects } from '../src/core/location/analysis'
import { generateMap, regenerateLayer } from '../src/core/location/generate'
import { inPolygon } from '../src/core/location/geometry'
import { fractal, simplex2 } from '../src/core/location/noise'
import { gridOf } from '../src/core/location/raster'
import { makeRng } from '../src/core/location/rng'
import { parseMap } from '../src/core/location/schema'
import { metrics } from '../src/core/location/topology'
import type { LocationMap } from '../src/core/location/types'
import { carve, CAVE_METHODS, cellular, floorOf, hollows, noisy, regions, trace, type Grid } from '../src/core/location/types/cave'
import { createProject } from '../src/core/model/project'
import type { Entity } from '../src/core/model/types'

const project = createProject('Caves')
const SEEDS = Array.from({ length: 30 }, (_, i) => i * 97 + 5)
const share = (g: Grid) => g.floor.filter(Boolean).length / g.floor.length
const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length
const methods = {
  'Cellular automata': (seed: number, openness = 1) => cellular(1000, 700, 6, openness, makeRng(seed)),
  'Simplex noise': (seed: number, openness = 1) => noisy(1000, 700, 6, openness, makeRng(seed)),
  'Chambers and tunnels': (seed: number, openness = 1) => carve(1000, 700, 6, openness, makeRng(seed)),
}
const cave = (extra: Partial<Entity> = {}): Entity => ({ id: 'c', name: 'Gloomhollow', type: 'Cave', ...extra })
const all = (map: LocationMap, layer: string, kind?: string) => (map.layers[layer]?.objects ?? []).filter((o) => !kind || o.kind === kind)

describe('noise', () => {
  it('is smooth, bounded and the same for the same seed', () => {
    const n = simplex2(makeRng(1))
    const values = Array.from({ length: 400 }, (_, i) => n(i * 0.13, i * 0.07))
    expect(Math.max(...values.map(Math.abs))).toBeLessThanOrEqual(1.01)
    expect(values.some((v) => v > 0.2) && values.some((v) => v < -0.2)).toBe(true)
    expect(Math.abs(n(3.2, 4.1) - n(3.201, 4.1))).toBeLessThan(0.05)
    expect(simplex2(makeRng(1))(5.5, 2.25)).toBe(n(5.5, 2.25))
    expect(simplex2(makeRng(2))(5.5, 2.25)).not.toBe(n(5.5, 2.25))
    expect(Math.abs(fractal(n, 4)(1.3, 7.7))).toBeLessThanOrEqual(1.01)
  })
})

// Many maps per test: slow on a busy machine.
describe('cave floor methods', { timeout: 60_000 }, () => {
  for (const [name, make] of Object.entries(methods)) {
    it(`${name}: one piece of floor, a sensible share of it, the same for the same seed`, () => {
      for (const seed of SEEDS) {
        const g = make(seed)
        expect(regions(g).length, `seed ${seed}`).toBe(1)
        expect(share(g), `seed ${seed}`).toBeGreaterThan(0.12)
        expect(share(g), `seed ${seed}`).toBeLessThan(0.65)
        // The border stays rock, so the outline never runs off the map.
        for (let x = 0; x < g.cols; x++) expect(g.floor[x] || g.floor[(g.rows - 1) * g.cols + x]).toBe(false)
      }
      expect(make(3).floor).toEqual(make(3).floor)
      expect(make(3).floor).not.toEqual(make(4).floor)
    })
  }

  it('opens up with the openness input, and smoothing leaves fewer rock islands', () => {
    for (const make of [methods['Cellular automata'], methods['Simplex noise']]) {
      expect(mean(SEEDS.map((s) => share(make(s, 1.3))))).toBeGreaterThan(mean(SEEDS.map((s) => share(make(s, 0.8)))))
    }
    const islands = (passes: number) => mean(SEEDS.map((s) => trace(cellular(1000, 700, 6, 1, makeRng(s), passes)).length))
    expect(islands(8)).toBeLessThan(islands(1))
  })

  it('finds the hollows of a floor and links the ones that meet', () => {
    // Two square rooms joined by a short passage, and a third far off on its own.
    const g: Grid = { cell: 10, cols: 40, rows: 20, floor: new Array(800).fill(false) }
    const open = (x0: number, y0: number, x1: number, y1: number) => {
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) g.floor[y * 40 + x] = true
    }
    open(2, 2, 10, 10)
    open(11, 5, 16, 7)
    open(17, 2, 25, 10)
    open(30, 12, 37, 18)
    const h = hollows(g, 10)
    expect(h.centres.length).toBe(3)
    expect(h.links).toHaveLength(1)
    expect(Math.min(...h.radii)).toBeGreaterThanOrEqual(30)
  })
})

describe('generated caves', { timeout: 60_000 }, () => {
  it('store their floor as the rock field, matching the drawn outline', () => {
    for (const method of CAVE_METHODS) {
      const map = generateMap(project, cave({ caveMethod: method }), 11)!
      expect(parseMap(JSON.parse(JSON.stringify(map)))).toEqual(map)
      const field = gridOf(map.fields!.rock)!
      const outer = all(map, 'cavern', 'cavern')[0].points!
      const islands = all(map, 'cavern', 'rockpile').map((o) => o.points!)
      let [floor, agree] = [0, 0]
      for (let i = 0; i < field.data.length; i++) {
        if (field.data[i]) continue
        floor++
        const p: [number, number] = [((i % field.cols) + 0.5) * field.cell, (Math.floor(i / field.cols) + 0.5) * field.cell]
        if (inPolygon(p, outer) && !islands.some((r) => inPolygon(p, r))) agree++
      }
      expect(agree / floor, method).toBeGreaterThan(0.95)
    }
  })

  it('have a connected chamber graph with an entrance, and every creature can be reached', () => {
    const p = createProject('Lair')
    const enemies = [{ id: 'e1', name: 'Cave bat' }, { id: 'e2', name: 'Troll' }]
    p.documents['design.combat'].data.enemies = enemies
    for (const method of CAVE_METHODS) {
      for (const seed of SEEDS.slice(0, 8)) {
        const map = generateMap(p, cave({ caveMethod: method, enemies: ['e1', 'e2'], caveWater: 'Pools' }), seed)!
        const g = mapGraph(map)!
        expect(g.nodes.length, `${method} ${seed}`).toBeGreaterThanOrEqual(3)
        expect(g.nodes.filter((n) => n.role === 'entrance')).toHaveLength(1)
        expect(metrics(g).unreachable, `${method} ${seed}`).toEqual([])
        expect(all(map, 'contents', 'marker').length).toBeGreaterThan(0)
        expect(all(map, 'contents', 'marker').every((m) => m.spawn?.role === 'enemy')).toBe(true)
        expect(unreachableObjects(map, ['marker']).length, `${method} ${seed}`).toBe(0)
      }
    }
  })

  it('reads the floor of older maps from the outline, and a new roll replaces the rock field', () => {
    const map = generateMap(project, cave(), 4)!
    const old: LocationMap = { ...map }
    delete old.fields
    expect(floorOf(old)).not.toBeNull()
    expect(all(regenerateLayer(project, cave(), old, 'chambers'), 'chambers', 'hollow').length).toBeGreaterThanOrEqual(3)
    const again = regenerateLayer(project, cave(), map, 'cavern')
    expect(again.fields!.rock).not.toEqual(map.fields!.rock)
    expect(again.layers.chambers.stale).toBe(true)
    expect(generateMap(project, cave(), 5, map)!.fields!.rock).not.toEqual(map.fields!.rock)
  })

  it('follows the method input', () => {
    const outlines = CAVE_METHODS.map((m) => JSON.stringify(all(generateMap(project, cave({ caveMethod: m }), 2)!, 'cavern', 'cavern')[0].points))
    expect(new Set(outlines).size).toBe(3)
  })
})
