import { describe, expect, it } from 'vitest'
import { mapChecks, mapGraph } from '../src/core/location/analysis'
import { checkPlan, doorAllowed, planDoors, programme, ROOM_RULES, type Slot } from '../src/core/location/architecture'
import { generateMap, regenerateLayer } from '../src/core/location/generate'
import { OUTSIDE } from '../src/core/location/topology'
import type { LocationMap } from '../src/core/location/types'
import { createProject } from '../src/core/model/project'
import type { Entity } from '../src/core/model/types'

const project = createProject('Houses')
const house = (extra: Partial<Entity> = {}): Entity => ({ id: 'h', name: 'Cottage', type: 'Dwelling', ...extra })
const rooms = (map: LocationMap) => map.layers.rooms.objects
const label = (map: LocationMap, id: string) => (id === OUTSIDE ? 'Outside' : String(rooms(map).find((r) => r.id === id)?.label))
const SEEDS = Array.from({ length: 30 }, (_, i) => i * 31 + 7)

describe('house rules', () => {
  it('say which rooms may share a door', () => {
    expect(doorAllowed('Main room', 'Bedroom', 'Normal')).toBe(true)
    expect(doorAllowed('Kitchen', 'Bedroom', 'Low')).toBe(false)
    expect(doorAllowed('Storage', 'Bedroom', 'Normal')).toBe(false)
    expect(doorAllowed('Storage', 'Bedroom', 'Low')).toBe(true)
    expect(doorAllowed('Bedroom', 'Study', 'Normal')).toBe(true)
    // Not through a bedroom to reach the rest of the house.
    expect(doorAllowed('Bedroom', 'Main room', 'Normal')).toBe(false)
    expect(doorAllowed('Main room', 'Bedroom', 'Strict', 'Main room')).toBe(false)
    expect(doorAllowed('Hall', 'Bedroom', 'Strict', 'Hall')).toBe(true)
  })

  it('give a house of four or more rooms an entrance hall', () => {
    expect(programme(['Main room', 'Kitchen', 'Bedroom'], 3)).toEqual(['Main room', 'Kitchen', 'Bedroom'])
    expect(programme(['Main room', 'Kitchen', 'Bedroom'], 4)).toEqual(['Hall', 'Main room', 'Kitchen', 'Bedroom'])
    expect(programme(['Hall', 'Study'], 5)[0]).toBe('Hall')
  })

  it('reach a bedroom through the hall, not the kitchen next to it', () => {
    // Hall (south, by the front), Kitchen beside it, Bedroom behind both.
    const slots: Slot[] = [
      { use: 'Hall', rect: { x: 0, y: 100, w: 100, h: 100 } },
      { use: 'Kitchen', rect: { x: 100, y: 100, w: 100, h: 100 } },
      { use: 'Bedroom', rect: { x: 0, y: 0, w: 200, h: 100 } },
    ]
    const plan = planDoors(slots, 'Normal')
    expect(plan).toMatchObject({ entrance: 0, unreached: [], forced: 0 })
    expect(plan.doors.find((d) => d.b === 2)?.a).toBe(0)
    expect(plan.doors.find((d) => d.entrance)?.at[1]).toBe(200)
  })

  it('break a rule only when nothing else reaches a room, and say so', () => {
    const slots: Slot[] = [
      { use: 'Main room', rect: { x: 0, y: 100, w: 100, h: 100 } },
      { use: 'Kitchen', rect: { x: 100, y: 100, w: 100, h: 100 } },
      // Only the kitchen touches the bedroom.
      { use: 'Bedroom', rect: { x: 100, y: 0, w: 100, h: 100 } },
    ]
    const plan = planDoors(slots, 'Normal')
    expect(plan.unreached).toEqual([])
    expect(plan.forced).toBe(1)
  })
})

describe('generated houses', { timeout: 60_000 }, () => {
  it('keep every house rule for every footprint and privacy level', () => {
    for (const footprint of ['Hut', 'House', 'Manor', 'Tower']) {
      for (const privacy of ['Low', 'Normal', 'Strict']) {
        for (const seed of SEEDS.slice(0, footprint === 'Manor' ? 30 : 12)) {
          const loc = house({ footprint, privacy })
          expect(mapChecks(loc, generateMap(project, loc, seed)!).map((c) => c.text), `${footprint} ${privacy} ${seed}`).toEqual([])
        }
      }
    }
  })

  it('open the front door into an entrance hall when there is one, and put the pantry by the kitchen', () => {
    let pantryByKitchen = 0
    for (const seed of SEEDS) {
      const map = generateMap(project, house({ footprint: 'Manor' }), seed)!
      const g = mapGraph(map)!
      const front = g.edges.filter((e) => e.a === OUTSIDE || e.b === OUTSIDE).map((e) => label(map, e.a === OUTSIDE ? e.b : e.a))
      expect(front, `seed ${seed}`).toEqual(['Hall'])
      const doors = g.edges.map((e) => [label(map, e.a), label(map, e.b)].sort().join('+'))
      if (doors.includes('Kitchen+Pantry')) pantryByKitchen++
      for (const [a, b] of ROOM_RULES.noDoor) expect(doors).not.toContain([a, b].sort().join('+'))
    }
    expect(pantryByKitchen).toBeGreaterThan(SEEDS.length / 2)
  })

  it('furnish the entrance hall and every other room', () => {
    const map = generateMap(project, house({ footprint: 'Manor', furnishing: 'Rich' }), 3)!
    const furniture = map.layers.furniture.objects
    for (const r of rooms(map)) {
      const inside = furniture.filter((f) => Math.abs(f.x - r.x) < (r.w ?? 0) / 2 && Math.abs(f.y - r.y) < (r.h ?? 0) / 2)
      expect(inside.length, String(r.label)).toBeGreaterThan(0)
    }
  })
})

describe('checking a plan after hand edits', () => {
  it('reports a room renamed to Kitchen next to a bedroom it shares a door with', () => {
    const loc = house({ footprint: 'House', dwellingRooms: 4 })
    const map = generateMap(project, loc, 9)!
    const g = mapGraph(map)!
    const bedroom = rooms(map).find((r) => r.label === 'Bedroom')!
    const neighbour = g.edges.find((e) => e.a === bedroom.id || e.b === bedroom.id)!
    const other = neighbour.a === bedroom.id ? neighbour.b : neighbour.a
    const renamed: LocationMap = { ...map, layers: { ...map.layers, rooms: { ...map.layers.rooms, objects: rooms(map).map((r) => (r.id === other ? { ...r, label: 'Kitchen' } : r)) } } }
    const checks = mapChecks(loc, renamed)
    expect(checks.some((c) => c.objects.includes(bedroom.id) && /Kitchen/.test(c.text))).toBe(true)
    // Regenerating the doors for the renamed rooms never makes it worse; a break stays only when no other wall
    // reaches the bedroom.
    const fixed = regenerateLayer(project, loc, renamed, 'doors')
    expect(mapChecks(loc, fixed).length).toBeLessThanOrEqual(checks.length)
  })

  it('reports rooms without a door and a house without a way in', () => {
    const map = generateMap(project, house({ footprint: 'House' }), 2)!
    const noDoors: LocationMap = { ...map, layers: { ...map.layers, doors: { ...map.layers.doors, objects: [] } } }
    const issues = checkPlan(mapGraph(noDoors)!, rooms(noDoors), 'Normal', rooms(noDoors).map((r) => r.id))
    expect(issues[0]).toMatchObject({ rule: 'entrance', text: 'The house has no door to the outside.' })
    expect(issues.filter((i) => i.rule === 'unreachable')).toHaveLength(rooms(noDoors).length)
  })

  it('reports a dungeon lock whose key is gone', () => {
    const loc: Entity = { id: 'd', name: 'Vault', type: 'Dungeon', size: 'Medium', keyLocks: 1 }
    const map = generateMap(project, loc, 6)!
    expect(mapChecks(loc, map)).toEqual([])
    const noKey: LocationMap = { ...map, layers: { ...map.layers, contents: { ...map.layers.contents, objects: map.layers.contents.objects.filter((o) => o.kind !== 'key') } } }
    const checks = mapChecks(loc, noKey)
    expect(checks.map((c) => c.id)).toEqual(['lock-red'])
    expect(checks[0].objects.some((id) => id.startsWith('doors.'))).toBe(true)
  })
})
