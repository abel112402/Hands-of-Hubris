import { describe, expect, it } from 'vitest'
import { buildReferenceSlice, IDS } from './fixtures/referenceSlice3d'
import { buildBundle } from '../src/core/engine/bundle'
import { buildIR } from '../src/core/engine/ir'
import { prototypeReport } from '../src/core/engine/capabilities'
import { combatRules, placements, worldRules } from '../src/core/gameplay'
import { deserializeProject, serializeProject } from '../src/core/persistence/serialize'
import type { MapObject } from '../src/core/location/types'
import type { Entity, Project } from '../src/core/model/types'

/**
 * plans/UNITY_PLAYABLE_GAME_GENERATION_PLAN.md, phase 19: a limited enemy behaviour template configured by the plan
 * (guard or patrol a route, sight, chase, give up, go back) on a navigation mesh; AI the plan only describes is a frame.
 */
const AT = '2026-01-01T00:00:00.000Z'
const enemy = (p: Project) => (p.documents['design.combat'].data.enemies as Entity[])[0]
const yardObjects = (p: Project): MapObject[] => Object.values(((p.documents['design.world'].data.locations as Entity[]).find((l) => l.id === IDS.location)!.map as { layers: Record<string, { objects: MapObject[] }> }).layers).flatMap((l) => l.objects)
const edit = (p: Project, change: (os: MapObject[]) => void) => {
  const yard = (p.documents['design.world'].data.locations as Entity[]).find((l) => l.id === IDS.location)!
  change(yardObjects(p))
  yard.map = { ...(yard.map as object) }
}
const file = (p: Project, path: string) => buildBundle(p, 'unity', AT).files.find((f) => f.path === path)?.content ?? ''

describe('the enemy behaviour template from the plan', () => {
  it('reads aggression, sight and the give-up range', () => {
    const rat = combatRules(buildReferenceSlice()).rules.enemies[0]
    expect([rat.aggression, rat.sight, rat.giveUp]).toEqual(['Territorial', 6, 10])
  })

  it('fills visible defaults: Territorial, 8 m sight, 12 m give-up; a Hunter has no give-up range, a passive enemy no sight', () => {
    const p = buildReferenceSlice()
    delete enemy(p).aggression
    delete enemy(p).sight
    delete enemy(p).giveUp
    const { rules } = combatRules(p)
    expect([rules.enemies[0].aggression, rules.enemies[0].sight, rules.enemies[0].giveUp]).toEqual(['Territorial', 8, 12])
    expect(rules.defaults).toEqual(expect.arrayContaining(['Yard Rat aggression = Territorial', 'Yard Rat sight range = 8 m', 'Yard Rat gives up beyond 12 m']))
    enemy(p).aggression = 'Hunter'
    expect(combatRules(p).rules.enemies[0].giveUp).toBeUndefined()
    enemy(p).aggression = 'Passive'
    expect(combatRules(p).rules.defaults.some((d) => d.includes('sight'))).toBe(false)
  })

  it('takes the patrol route from the line the placed enemy names, and keeps it through a save', () => {
    const rat = placements(buildReferenceSlice()).placements.find((x) => x.role === 'enemy')!
    expect(rat.route).toHaveLength(3)
    expect(rat.route![0]).toEqual({ x: rat.x, y: rat.y })
    const back = deserializeProject(serializeProject(buildReferenceSlice()))
    expect(placements(back.project).placements.find((x) => x.role === 'enemy')!.route).toEqual(rat.route)
  })

  it('reports a route that is not a line of this map, and route points the player cannot walk to', () => {
    const p = buildReferenceSlice()
    edit(p, (os) => (os.find((o) => o.id === IDS.enemySpawn)!.spawn!.route = 'ghost'))
    expect(placements(p).issues).toEqual([expect.objectContaining({ level: 'error', code: 'gameplay.routeUnknown' })])
    const q = buildReferenceSlice()
    edit(q, (os) => os.find((o) => o.id === IDS.ratRun)!.points!.push([-500, -500]))
    expect(worldRules(q).issues).toEqual([expect.objectContaining({ level: 'warning', code: 'gameplay.routeBlocked', message: expect.stringContaining('1 point of an enemy') })])
  })

  it('carries the route, the behaviour and the forget time in the IR', () => {
    const g = buildIR(buildReferenceSlice()).ir.gameplay!
    expect(g.placements.find((x) => x.role === 'enemy')!.route).toHaveLength(3)
    expect(g.combat!.enemies[0]).toMatchObject({ aggression: 'Territorial', sight: 6, giveUp: 10 })
    expect(g.combat!.forgetAfter).toBe(3)
  })
})

describe('AI the plan only describes is a frame', () => {
  it('says the NPC life cycle and the AI behaviour graph are not run', () => {
    const p = buildReferenceSlice()
    p.documents['design.npc'].data.lifecycle = { nodes: [{ id: 'n1', label: 'Birth', kind: 'Start', x: 0, y: 0 }], edges: [] }
    p.documents['technical.ai'] = { ...(p.documents['technical.ai'] ?? { id: 'technical.ai' }), data: { approach: { approach: 'Utility AI' }, behavior: { nodes: [{ id: 'b1', label: 'Root', kind: 'Selector', x: 0, y: 0 }], edges: [] } } } as Project['documents'][string]
    const info = prototypeReport(p, 'unity').issues.find((i) => i.code === 'proto.aiFrame')!
    expect(info.level).toBe('info')
    expect(info.message).toContain('the NPC life cycle (a state graph), the AI behavior tree / state machine')
    expect(info.message).toContain('typed state machines, a frame you drive from code')
    expect(prototypeReport(buildReferenceSlice(), 'unity').issues.some((i) => i.code === 'proto.aiFrame')).toBe(false)
  })
})

describe('Unity export of the behaviour', () => {
  it('names the planned sight, give-up range and route, and tests the template and the navigation mesh in the scene', () => {
    const p = buildReferenceSlice()
    expect(file(p, 'Unity/Scripts/Generated/Gameplay/PlannerGameplay.cs')).toContain('float Sight, float GiveUp, int RoutePoints)[] Enemies')
    const test = file(p, 'Unity/Tests/PlayMode/PlannerPrototypeSceneTests.cs')
    expect(test).toContain('TheLevelHasANavigationMesh')
    expect(test).toContain('TheEnemyPatrolsSeesChasesAndGoesBack')
    p.documents['technical.architecture'].data.prototype = { ...(p.documents['technical.architecture'].data.prototype as object), combat: false }
    expect(file(p, 'Unity/Tests/PlayMode/PlannerPrototypeSceneTests.cs')).not.toContain('TheEnemyPatrolsSeesChasesAndGoesBack')
  })
})
