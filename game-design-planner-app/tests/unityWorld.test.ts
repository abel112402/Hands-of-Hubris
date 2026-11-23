import { describe, expect, it } from 'vitest'
import { buildReferenceSlice, IDS } from './fixtures/referenceSlice3d'
import { buildBundle } from '../src/core/engine/bundle'
import { buildIR } from '../src/core/engine/ir'
import { prototypeReport } from '../src/core/engine/capabilities'
import { worldRules } from '../src/core/gameplay'
import { mapOf } from '../src/core/location/schema'
import type { MapObject } from '../src/core/location/types'
import type { Entity, Project } from '../src/core/model/types'

/**
 * plans/UNITY_PLAYABLE_GAME_GENERATION_PLAN.md, phase 18: the prototype's world — several locations of the plan,
 * passages between them from the maps' “Opens location” links, the way back on the other map, and what cannot work
 * (no map, no way back, out of reach, blocked spawns) reported with its place.
 */
const AT = '2026-01-01T00:00:00.000Z'
const proto = (p: Project) => p.documents['technical.architecture'].data.prototype as Record<string, unknown>
const locations = (p: Project) => p.documents['design.world'].data.locations as Entity[]
const objects = (p: Project, id: string): MapObject[] => Object.values(mapOf(locations(p).find((l) => l.id === id))!.layers).flatMap((l) => l.objects)
/** The stored map's objects (not mapOf's parsed copy), to change in place. */
const stored = (p: Project, id: string): MapObject[] => Object.values((locations(p).find((l) => l.id === id)!.map as { layers: Record<string, { objects: MapObject[] }> }).layers).flatMap((l) => l.objects)
const object = (p: Project, loc: string, id: string) => stored(p, loc).find((o) => o.id === id)!
const errors = (p: Project) => prototypeReport(p, 'unity').issues.filter((i) => i.level === 'error')
const file = (p: Project, path: string) => buildBundle(p, 'unity', AT).files.find((f) => f.path === path)?.content ?? ''
/** Changes a location's map in place and gives it a fresh object (mapOf caches by object). */
const edit = (p: Project, loc: string, change: (objects: MapObject[]) => void) => {
  const l = locations(p).find((x) => x.id === loc)!
  change(stored(p, loc))
  l.map = { ...(l.map as object) }
}

describe('the prototype’s world from the plan', () => {
  it('has the yard and the cave, with the stairs down and the way back up', () => {
    const { rules, issues } = worldRules(buildReferenceSlice())
    expect(issues).toEqual([])
    expect(rules.loading).toBe('one-scene')
    expect(rules.locations.map((l) => [l.id, l.name])).toEqual([[IDS.location, 'Keeper’s Yard'], [IDS.cave, 'Old Well Cave']])
    const way = objects(buildReferenceSlice(), IDS.cave).find((o) => o.link?.locationId === IDS.location)!
    expect(rules.passages.map((x) => [x.object, x.location, x.to, x.arrival.object])).toEqual([
      [IDS.stairs, IDS.location, IDS.cave, way.id],
      [way.id, IDS.cave, IDS.location, IDS.stairs],
    ])
  })

  it('lays the locations out side by side in the IR, the start first, with their scale and size', () => {
    const w = buildIR(buildReferenceSlice()).ir.gameplay!.world!
    expect(w.locations).toEqual([
      { location: IDS.location, name: 'Keeper’s Yard', map: `Maps/${IDS.location}.json`, metresPerUnit: 0.1, offset: { x: 0, z: 0 }, size: { w: 80, d: 56 } },
      { location: IDS.cave, name: 'Old Well Cave', map: `Maps/${IDS.cave}.json`, metresPerUnit: 0.1, offset: { x: 100, z: 0 }, size: { w: 80, d: 56 } },
    ])
    expect(w.passages.map((x) => x.toName)).toEqual(['Old Well Cave', 'Keeper’s Yard'])
  })

  it('without chosen locations takes only the start location, says so, and leaves the stairs closed', () => {
    const p = buildReferenceSlice()
    delete proto(p).locations
    const { rules, issues } = worldRules(p)
    expect(rules.locations.map((l) => l.id)).toEqual([IDS.location])
    expect(rules.passages).toEqual([])
    expect(issues).toEqual([expect.objectContaining({ level: 'info', code: 'gameplay.passageOutside', message: expect.stringContaining('opens Old Well Cave, which is not in the prototype') })])
    expect(buildIR(p).issues).toContainEqual(expect.objectContaining({ code: 'gameplay.default', message: expect.stringContaining('Locations in the prototype: only Keeper’s Yard') }))
    expect(errors(p)).toEqual([])
  })

  it('reports a location without a map, an unknown location, and a start outside the chosen ones', () => {
    const p = buildReferenceSlice()
    delete locations(p).find((l) => l.id === IDS.cave)!.map
    proto(p).locations = [IDS.location, IDS.cave, 'ghost']
    expect(worldRules(p).issues.map((i) => i.code)).toEqual(['gameplay.noMap', 'gameplay.unknownLocation', 'gameplay.passageOutside'])
    const q = buildReferenceSlice()
    proto(q).locations = [IDS.cave]
    expect(worldRules(q).issues.map((i) => i.code)).toContain('gameplay.startOutside')
  })

  it('needs a way back to arrive at', () => {
    const p = buildReferenceSlice()
    edit(p, IDS.cave, (os) => os.filter((o) => o.link).forEach((o) => delete o.link))
    const { rules, issues } = worldRules(p)
    expect(rules.passages).toEqual([])
    expect(issues).toEqual([
      expect.objectContaining({ level: 'error', code: 'gameplay.passageNoWayBack', where: expect.objectContaining({ id: IDS.cave }) }),
      expect.objectContaining({ level: 'warning', code: 'gameplay.locationUnreached' }),
    ])
  })

  it('reports a passage the player cannot reach, and does not check a location nothing leads to', () => {
    const p = buildReferenceSlice()
    edit(p, IDS.location, () => Object.assign(object(p, IDS.location, IDS.stairs), { x: -500, y: -500 }))
    // Off the map, the stairs are also no place to arrive at from the cave.
    expect(worldRules(p).issues.map((i) => [i.level, i.code])).toEqual([
      ['error', 'gameplay.passageBlocked'],
      ['warning', 'gameplay.locationUnreached'],
      ['error', 'gameplay.passageUnreachable'],
    ])
  })

  it('reports a pickup out of the player’s reach', () => {
    const p = buildReferenceSlice()
    edit(p, IDS.cave, () => Object.assign(object(p, IDS.cave, IDS.caveCoin), { x: -500, y: -500 }))
    expect(errors(p)).toEqual([expect.objectContaining({ code: 'proto.dataInvalid', field: 'gameplay.spawnBlocked', message: expect.stringContaining(`the pickup of ${IDS.itemCoin} is out of the player's reach`) })])
  })

  it('uses passages by interacting', () => {
    const p = buildReferenceSlice()
    proto(p).interaction = false
    expect(errors(p)).toContainEqual(expect.objectContaining({ code: 'proto.requires', field: 'movement', message: expect.stringContaining('through passages by interacting') }))
  })
})

describe('Unity export of the world', () => {
  it('names the locations and passages, places the cave’s pickup, exports both maps and tests the travel', () => {
    const p = buildReferenceSlice()
    const b = buildBundle(p, 'unity', AT)
    expect(b.files.map((f) => f.path)).toEqual(expect.arrayContaining([`Maps/${IDS.location}.json`, `Maps/${IDS.cave}.json`]))
    const config = b.files.find((f) => f.path === 'Unity/Scripts/Generated/Gameplay/PlannerGameplay.cs')!.content
    expect(config).toContain(`Locations = { ("${IDS.location}", "Keeper’s Yard"), ("${IDS.cave}", "Old Well Cave") };`)
    expect(config).toContain(`("${IDS.stairs}", "${IDS.location}", "${IDS.cave}")`)
    expect(config).toContain('public const int PlacedItems = 2;')
    const test = file(p, 'Unity/Tests/PlayMode/PlannerPrototypeSceneTests.cs')
    expect(test).toContain('TravelsThroughEveryPassageAndBack')
    expect(test).toContain('SavingInAnotherLocationLoadsThere')
  })

  it('generates no travel test for one location', () => {
    const p = buildReferenceSlice()
    proto(p).locations = [IDS.location]
    expect(file(p, 'Unity/Tests/PlayMode/PlannerPrototypeSceneTests.cs')).not.toContain('TravelsThroughEveryPassageAndBack')
    expect(file(p, 'Unity/Scripts/Generated/Gameplay/PlannerGameplay.cs')).toContain('public const int PlacedItems = 1;')
  })
})
