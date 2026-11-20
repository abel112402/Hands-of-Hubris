import { describe, expect, it } from 'vitest'
import { createProject } from '../src/core/model/project'
import { useStore } from '../src/core/store/store'
import { getModule, getSection } from '../src/core/modules/registry'
import { COMBAT_DOC, damagePerHit, phaseCoverage } from '../src/core/combat'
import { COMBAT_GUIDE } from '../src/modules/guides/combat'
import { applyExample, previewProject } from '../src/ui/guides/ExamplePicker'

const step = (id: string) => COMBAT_GUIDE.steps.find((s) => s.id === id)!
const example = (id: string) => COMBAT_GUIDE.examples.find((e) => e.id === id)!

describe('combat guide', () => {
  it('points every step, map node, example, concept and empty text at a real section', () => {
    const mod = getModule(COMBAT_DOC)!
    const reg = createProject('t').registry
    const ids = [
      ...COMBAT_GUIDE.steps.map((s) => s.section),
      ...COMBAT_GUIDE.map.nodes.flatMap((n) => (n.section ? [n.section] : [])),
      ...COMBAT_GUIDE.examples.map((e) => e.section),
      ...Object.keys(COMBAT_GUIDE.concepts),
      ...Object.keys(COMBAT_GUIDE.empty),
    ]
    for (const id of ids) expect(getSection(mod, reg, id), id).toBeTruthy()
    for (const n of COMBAT_GUIDE.map.nodes) if (n.doc) expect(getModule(n.doc), n.doc).toBeTruthy()
  })

  it('lays the map out so no link runs through a landmark or crosses another link', () => {
    const { nodes, edges } = COMBAT_GUIDE.map
    // Landmark centres of the 140×44 node boxes; a landmark (ring and name) keeps a 40-unit radius clear.
    const c = Object.fromEntries(nodes.map((n) => [n.id, { x: n.x + 70, y: n.y + 22 }]))
    const segs = edges.map((e) => ({ id: `${e.from}>${e.to}`, ends: [e.from, e.to], a: c[e.from], b: c[e.to] }))
    const distToSeg = (p: { x: number; y: number }, a: typeof p, b: typeof p) => {
      const dx = b.x - a.x
      const dy = b.y - a.y
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)))
      return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
    }
    for (const s of segs)
      for (const n of nodes) if (!s.ends.includes(n.id)) expect(distToSeg(c[n.id], s.a, s.b), `${s.id} passes ${n.id}`).toBeGreaterThan(40)
    const cross = (p: { a: { x: number; y: number }; b: { x: number; y: number } }, q: typeof p) => {
      const o = (a: typeof p.a, b: typeof p.a, r: typeof p.a) => Math.sign((b.x - a.x) * (r.y - a.y) - (b.y - a.y) * (r.x - a.x))
      return o(p.a, p.b, q.a) * o(p.a, p.b, q.b) < 0 && o(q.a, q.b, p.a) * o(q.a, q.b, p.b) < 0
    }
    for (const [i, s] of segs.entries())
      for (const t of segs.slice(i + 1)) if (!s.ends.some((e) => t.ends.includes(e))) expect(cross(s, t), `${s.id} crosses ${t.id}`).toBe(false)
  })

  it('ticks steps from data and quick actions', () => {
    const p = createProject('T')
    expect(step('status').done!(p)).toBe(false)
    const a = step('status').action!
    if ('run' in a) a.run(p)
    expect(step('status').done!(p)).toBe(true)
    expect(step('formula').done!(p)).toBe(false)
    example('formula-diminishing').apply(p)
    expect(step('formula').done!(p)).toBe(true)
    // The preset also links the seeded Difficulty parameters for enemy HP and damage.
    expect(step('difficulty').done!(p)).toBe(true)
    expect(step('sandbox').done).toBeUndefined()
  })

  it('scales the roster by biome stage and previews before inserting as one undo step', () => {
    const base = createProject('T')
    base.documents['design.world'].data.biomes = [{ id: 'late', name: 'Ashlands', role: 'Late' }]
    useStore.getState().loadProject(base, 'x')
    const before = useStore.getState().project
    const preview = previewProject(before, example('roster'), 'late')
    const enemies = preview.documents[COMBAT_DOC].data.enemies
    expect(enemies).toHaveLength(4)
    // Late = stage 3, so ×1.6³ ≈ 4.1: the 30 HP swarmling becomes 123.
    expect(enemies[0]).toMatchObject({ name: 'Ashlands swarmling', biome: 'late', hp: 123, tier: 4 })
    expect(before.documents[COMBAT_DOC].data.enemies).toEqual([])
    applyExample(example('roster'), 'late')
    expect(useStore.getState().project.documents[COMBAT_DOC].data.enemies).toHaveLength(4)
    useStore.getState().undo()
    expect(useStore.getState().project.documents[COMBAT_DOC].data.enemies).toEqual([])
  })

  it('builds gap-free phase templates and loadouts from Player casts', () => {
    const p = createProject('T')
    p.documents[COMBAT_DOC].data.bosses = [{ id: 'b', name: 'Hydra' }]
    for (const id of ['phases-three', 'phases-enrage', 'phases-adds']) {
      const q = previewProject(p, example(id), 'b')
      const c = phaseCoverage(q, 'b')
      expect(c.gaps).toEqual([])
      expect(c.overlaps).toEqual([])
    }
    p.documents['design.items'].data.items = [{ id: 'axe', name: 'Axe', damage: 12 }]
    p.documents['design.player'].data.casts = [{ id: 'w', name: 'Warrior', cast: 'warrior' }]
    p.documents['design.player'].data.leveling = { levelCap: 30 }
    example('loadouts').apply(p)
    expect(p.documents[COMBAT_DOC].data.loadouts.map((l: any) => [l.name, l.level, l.weapon])).toEqual([
      ['Warrior lv 1', 1, 'axe'],
      ['Warrior lv 15', 15, 'axe'],
    ])
  })

  it('offers damage formula presets that all evaluate', () => {
    for (const id of ['formula-diminishing', 'formula-flat', 'formula-percent']) {
      const p = createProject('T')
      example(id).apply(p)
      expect(damagePerHit(p, 20, { armor: 50, resistances: {}, weaknesses: [] }), id).not.toBeNull()
    }
  })
})
