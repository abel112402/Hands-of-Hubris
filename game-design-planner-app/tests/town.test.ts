import { describe, expect, it } from 'vitest'
import { createProject } from '../src/core/model/project'
import { ensureDocument, getModule, migrateDocument } from '../src/core/modules/registry'
import { analyzeTown, estimateTown, TOWN_DOC } from '../src/core/town'
import { townRules } from '../src/core/hints/rules/town'
import { DEFAULT_THRESHOLDS } from '../src/core/model/types'
import { validateProject } from '../src/core/references/refs'

function townProject() {
  const p = createProject('T')
  p.registry.catalogs.resources = { label: 'Resources', items: [{ id: 'wood', label: 'Wood' }, { id: 'plank', label: 'Planks' }, { id: 'ore', label: 'Ore' }] }
  const d = p.documents[TOWN_DOC].data
  d.buildings = [
    { id: 'saw', name: 'Sawmill', count: 2, cycle: 2, inputs: { wood: 4 }, outputs: { plank: 2 }, workersRequired: 3, capacity: 0 },
    { id: 'house', name: 'House', count: 1, capacity: 4 },
  ]
  d.bases = [{ id: 'hub', name: 'Hub', startStock: { wood: 10 } }, { id: 'out', name: 'Outpost' }]
  d.economy = { horizon: 10, timeUnit: 'day' }
  return p
}

describe('town estimate', () => {
  it('derives per-time-unit rates, runway and workforce', () => {
    const e = estimateTown(townProject())
    const wood = e.resources.find((r) => r.id === 'wood')!
    expect(wood.consumed).toBe(4)
    expect(wood.runway).toBe(2.5)
    expect(wood.projected).toBe(0)
    expect(e.resources.find((r) => r.id === 'plank')!.produced).toBe(2)
    expect(e.workforce).toMatchObject({ demand: 6, supply: 4, shortage: 2 })
  })
  it('uses the assumed population over housing', () => {
    const p = townProject()
    p.documents[TOWN_DOC].data.economy.population = 10
    expect(estimateTown(p).workforce).toMatchObject({ shortage: 0, unused: 4 })
  })
  it('flags missing sources, depleting stock and bad routes', () => {
    const p = townProject()
    p.documents[TOWN_DOC].data.buildings.push({ id: 'f', name: 'Forge', inputs: { ore: 1 } })
    p.documents[TOWN_DOC].data.routes = [
      { id: 'r1', name: 'Haul', fromBase: 'hub', toBase: 'gone', cargo: ['ore'] },
      { id: 'r2', name: 'Loop', fromBase: 'hub', toBase: 'hub' },
      { id: 'r3', name: 'Cart', fromBase: 'hub', toBase: 'out', capacity: 2, frequency: 1, quantity: { wood: 5 } },
    ]
    const a = analyzeTown(p)
    expect(a.noSource).toEqual(['Ore'])
    expect(a.depleting.map((d) => d.label)).toContain('Wood')
    expect(a.routeProblems.join('|')).toMatch(/does not exist.*|same place/s)
    expect(a.routeProblems.some((m) => m.includes('Cart'))).toBe(true)
  })
  it('emits hints only for towns with buildings', () => {
    const ctx = { project: townProject(), docId: TOWN_DOC, thresholds: DEFAULT_THRESHOLDS, now: 0 }
    expect(townRules.flatMap((r) => r.evaluate(ctx)).length).toBeGreaterThan(0)
  })
})

describe('town migration', () => {
  it('turns text route endpoints into bases', () => {
    const p = createProject('T')
    const mod = getModule(TOWN_DOC)!
    const doc = { moduleVersion: 1, data: { routes: [{ id: 'r', name: 'A', from: 'Camp', to: 'camp' }, { id: 's', name: 'B', from: 'Mine', to: '' }] } as Record<string, any> }
    migrateDocument(mod, doc)
    expect(doc.data.bases.map((b: any) => b.name)).toEqual(['Camp', 'Mine'])
    expect(doc.data.routes[0].fromBase).toBe(doc.data.routes[0].toBase)
    expect(doc.data.routes[1].toBase).toBeUndefined()
    p.documents[TOWN_DOC] = doc
    ensureDocument(p, mod, () => 'x')
    expect(validateProject(p).filter((i) => i.docId === TOWN_DOC && i.level === 'error')).toEqual([])
  })
})
