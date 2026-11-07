import { describe, expect, it } from 'vitest'
import { collectHints, makeContext } from '../src/core/hints/engine'
import { createProject, makeId } from '../src/core/model/project'
import { ensureDocument, getModule, getSection, MODULES } from '../src/core/modules/registry'
import { moduleToMarkdown } from '../src/core/export/markdown'
import { useStore } from '../src/core/store/store'
import {
  addBorders,
  atlasModel,
  biomeContent,
  biomeCoverage,
  biomeThreat,
  dossier,
  levelInversions,
  placeUnplaced,
  touchingWithoutBorder,
  unlockPath,
  WORLD_DOC,
} from '../src/core/world'
import { GUIDES } from '../src/modules/guides'
import { WORLD_GUIDE } from '../src/modules/guides/world'
import { applyExample, previewProject } from '../src/ui/guides/ExamplePicker'

const mod = MODULES.find((m) => m.id === WORLD_DOC)!

const BIOMES = [
  { id: 'm', name: 'Meadow', role: 'Starter', levelMin: 1, levelMax: 4 },
  { id: 'f', name: 'Forest', role: 'Early', levelMin: 4, levelMax: 8, entryType: 'Boss', entryBosses: ['boar'], neighbors: ['m'] },
  { id: 's', name: 'Swamp', role: 'Mid', levelMin: 8, entryType: 'Story', entryQuests: ['q'] },
  { id: 'p', name: 'Peak', role: 'Final', levelMin: 15, entryType: 'Boss', entryBosses: ['hydra'] },
]

function build(world: Record<string, any> = {}, other: (p: ReturnType<typeof createProject>) => void = () => {}) {
  const p = createProject('T', false)
  p.documents[WORLD_DOC] = { moduleVersion: 3, data: { exploration: {}, biomes: BIOMES.map((b) => ({ ...b })), progression: { nodes: [], edges: [] }, map: { items: [] }, outposts: [], ...world } }
  p.documents['design.combat'] = {
    moduleVersion: 2,
    data: {
      enemies: [
        { id: 'w', name: 'Wolf', biome: 'm', hp: 20, damage: 2, attackRate: 1 },
        { id: 'r', name: 'Rat', biome: 'm', hp: 10, damage: 1, attackRate: 1 },
        { id: 'b', name: 'Bear', biome: 'f', hp: 100, damage: 5, attackRate: 1 },
        { id: 'g', name: 'Gator', biome: 's', hp: 10, damage: 2, attackRate: 1 },
      ],
      bosses: [
        { id: 'boar', name: 'Old Boar', biome: 'm', hp: 300, damage: 10, attackRate: 1 },
        { id: 'hydra', name: 'Hydra', biome: 's', hp: 2000, damage: 40, attackRate: 1 },
      ],
    },
  }
  p.documents['design.story'] = { moduleVersion: 2, data: { acts: [{ id: 'a1', name: 'Act 1', biome: 'f' }], quests: [{ id: 'q', name: 'Into the reeds', locations: ['f'] }] } }
  p.documents['design.timeWeather'] = { moduleVersion: 2, data: { weather: [{ id: 'fog', name: 'Fog', biomes: ['s', 'f'], frequency: 30 }] } }
  other(p)
  return p
}

const ruleIds = (p: ReturnType<typeof build>, docId = WORLD_DOC) =>
  collectHints(makeContext(p, { docId }))
    .map((h) => h.ruleId)
    .filter((r) => r.startsWith('world.'))

describe('world schema v3', () => {
  it('migrates v2 data: ids and text kept, a single border id wrapped into a list', () => {
    const p = createProject('t', false)
    p.documents[WORLD_DOC] = { moduleVersion: 2, data: { biomes: [{ id: 'b', name: 'Home', role: 'Starter', entry: 'Gate notes', neighbors: 'x' }, { id: 'x', name: 'Next' }] } }
    const doc = ensureDocument(p, mod, makeId)
    expect(doc.moduleVersion).toBe(3)
    expect(doc.data.biomes.map((b: any) => b.id)).toEqual(['b', 'x'])
    expect(doc.data.biomes[0]).toMatchObject({ entry: 'Gate notes', neighbors: ['x'], entryType: 'None' })
  })

  it('offers the new biome fields in inspector groups and the visual views first', () => {
    const sec = getSection(mod, createProject('t').registry, 'biomes')!
    if (sec.kind !== 'collection') throw new Error('biomes is a collection')
    expect(sec.fields.filter((f) => ['levelMin', 'levelMax', 'neighbors'].includes(f.key)).map((f) => f.group)).toEqual(['Identity', 'Identity', 'Identity'])
    expect(sec.views.slice(0, 5).map((v) => v.kind)).toEqual(['biomeDossier', 'worldAtlas', 'unlockPath', 'biomeThreat', 'biomeCoverage'])
  })
})

describe('biome content and unlock path', () => {
  it('collects content from both sides of each link', () => {
    const p = build()
    const c = biomeContent(p, p.documents[WORLD_DOC].data.biomes[1])
    expect(c.enemies.map((e) => e.id)).toEqual(['b'])
    expect(c.weather.map((e) => e.id)).toEqual(['fog'])
    expect([c.acts.length, c.quests.length]).toEqual([1, 1])
  })

  it('places boss and quest gates in the biome where they are met and opens biomes in waves', () => {
    const u = unlockPath(build())
    expect(u.links.map((l) => [l.from, l.to, l.via, l.gate])).toEqual([
      ['m', 'f', 'boss', 'Old Boar'],
      ['f', 's', 'quest', 'Into the reeds'],
      ['s', 'p', 'boss', 'Hydra'],
    ])
    expect(Object.fromEntries(u.wave)).toEqual({ m: 0, f: 1, s: 2, p: 3 })
    expect(u.locked).toEqual([])
  })

  it('locks a biome whose gate is met inside it, and flags gates met in a later-role biome', () => {
    const p = build({}, (p) => {
      p.documents['design.combat'].data.bosses[0].biome = 'f'
      p.documents['design.combat'].data.bosses[1].biome = 'p'
    })
    const u = unlockPath(p)
    expect(u.links.find((l) => l.to === 'f')!.inside).toBe(true)
    expect(u.locked.map((b) => b.id)).toEqual(['f', 's', 'p'])
    expect(ruleIds(p)).toContain('world.locked')
    expect(ruleIds(build())).not.toContain('world.locked')
    const back = build({}, (p) => (p.documents['design.combat'].data.bosses[0].biome = 'p'))
    expect(unlockPath(back).links.find((l) => l.to === 'f')!.backward).toBe(true)
  })

  it('adds progression-graph arrows only where no entry condition explains them', () => {
    const p = build({ progression: { nodes: [{ id: 'n1', refId: 'm' }, { id: 'n2', refId: 'f' }, { id: 'n3', refId: 'p' }], edges: [{ id: 'e1', source: 'n1', target: 'n2' }, { id: 'e2', source: 'n1', target: 'n3', label: 'secret path' }] } })
    const graph = unlockPath(p).links.filter((l) => l.via === 'graph')
    expect(graph.map((l) => [l.from, l.to, l.gate])).toEqual([['m', 'p', 'secret path']])
  })
})

describe('threat, levels and coverage', () => {
  it('computes threat per biome in role order and flags a dip', () => {
    const rows = biomeThreat(build())
    // Meadow: wolf 40, rat 10 → median 25; boss 3000. Forest: bear 500. Swamp: gator 20 < 25 → dip.
    expect(rows.map((r) => [r.biome.id, r.median, r.boss, r.flag])).toEqual([
      ['m', 25, 3000, null],
      ['f', 500, null, 'spike'],
      ['s', 20, 80000, 'dip'],
      ['p', null, null, null],
    ])
    expect(rows[2]).toMatchObject({ levelMin: 8, levelMax: 8 })
  })

  it('flags level ranges that run backwards, quietly otherwise', () => {
    expect(levelInversions(build()).length).toBe(0)
    const p = build({ biomes: [...BIOMES.slice(0, 3), { ...BIOMES[3], levelMin: 3 }] })
    expect(levelInversions(p).map((b) => b.id)).toEqual(['p'])
    expect(ruleIds(p)).toContain('world.levels')
    expect(ruleIds(p, 'design.combat')).toEqual([])
  })

  it('counts coverage per biome', () => {
    const cov = biomeCoverage(build())
    const forest = cov.find((r) => r.biome.id === 'f')!
    expect(forest.cells).toMatchObject({ enemies: 1, weather: 1, story: 2, entry: 1, levels: 1, zone: 0, hazards: 0 })
    expect(forest.score).toBeCloseTo(5 / 11)
  })
})

describe('atlas', () => {
  it('places unplaced biomes in role columns, finds touching zones and records borders', () => {
    const p = build()
    placeUnplaced(p, makeId)
    const m = atlasModel(p)
    expect(m.unplaced).toEqual([])
    expect(m.zones.map((z) => [z.biome!.id, z.item.x])).toEqual([['m', 20], ['f', 180], ['s', 340], ['p', 660]])
    // Existing border m–f is known; f–s (x 180+150 = 330 vs 340) is within 10 px.
    expect(touchingWithoutBorder(p)).toEqual([['f', 's']])
    addBorders(p, touchingWithoutBorder(p))
    expect(atlasModel(p).borders).toEqual([['f', 'm'], ['f', 's']])
  })

  it('assigns markers to the zone they sit in and builds a dossier', () => {
    const p = build({ map: { items: [{ id: 'z', kind: 'Biome zone', label: 'x', refId: 'f', x: 0, y: 0, w: 200, h: 200 }, { id: 'c', kind: 'Capital', label: 'Oakton', x: 50, y: 50, w: 20, h: 20 }] } })
    const d = dossier(p, 'f')!
    expect(d.markers.map((x) => x.label)).toEqual(['Oakton'])
    expect(d.gates.map((l) => l.gate)).toEqual(['Old Boar'])
    expect(d.opens.map((l) => l.to)).toEqual(['s'])
    expect(d.wave).toBe(1)
    expect(d.neighbors.map((b) => b.id)).toEqual(['m'])
  })
})

describe('export', () => {
  it('writes the world overview table and a Mermaid unlock path after the biome sheets', () => {
    const md = moduleToMarkdown(build(), mod)
    expect(md).toContain('**World overview**')
    expect(md).toMatch(/\| Forest \| Early \| 4–8 \| wave 1 \| boss: Old Boar \| 500 \(spike\) \|/)
    expect(md).toContain('b_m -->|boss: Old Boar| b_f')
    expect(md.indexOf('## ')).toBeLessThan(md.indexOf('**World overview**'))
  })
})

describe('world guide', () => {
  const step = (id: string) => WORLD_GUIDE.steps.find((s) => s.id === id)!

  it('points every step, map node, example, concept and empty text at a real section', () => {
    const m = getModule(WORLD_DOC)!
    const reg = createProject('t').registry
    const ids = [
      ...WORLD_GUIDE.steps.map((s) => s.section),
      ...WORLD_GUIDE.map.nodes.flatMap((n) => (n.section ? [n.section] : [])),
      ...WORLD_GUIDE.examples.map((e) => e.section),
      ...Object.keys(WORLD_GUIDE.concepts),
      ...Object.keys(WORLD_GUIDE.empty),
    ]
    for (const id of ids) expect(getSection(m, reg, id), id).toBeTruthy()
    for (const n of WORLD_GUIDE.map.nodes) if (n.doc) expect(getModule(n.doc), n.doc).toBeTruthy()
    for (const e of WORLD_GUIDE.map.edges) expect(WORLD_GUIDE.map.nodes.some((n) => n.id === e.from) && WORLD_GUIDE.map.nodes.some((n) => n.id === e.to)).toBe(true)
    expect(GUIDES[WORLD_DOC]).toBe(WORLD_GUIDE)
  })

  it('ticks steps from the data and runs quick actions', () => {
    const p = build()
    expect(step('tiers').done!(p)).toBe(true)
    expect(step('path').done!(p)).toBe(true)
    expect(step('map').done!(p)).toBe(false)
    const place = step('map').action!
    if ('run' in place) place.run(p)
    expect(step('map').done!(p)).toBe(true)
    expect(step('threat').done!(p)).toBe(false)
  })

  it('previews an example world on a copy and inserts it as one undo step', () => {
    useStore.getState().loadProject(createProject('T'), 'x')
    const before = useStore.getState().project
    const ex = WORLD_GUIDE.examples.find((e) => e.id === 'tiered')!
    const preview = previewProject(before, ex)
    expect(before.documents[WORLD_DOC].data.biomes).toHaveLength(0)
    const u = unlockPath(preview)
    expect(u.locked).toEqual([])
    expect(Math.max(...u.wave.values())).toBe(4)
    expect(atlasModel(preview).unplaced).toEqual([])
    expect(biomeThreat(preview).every((r) => r.flag === null)).toBe(true)
    applyExample(ex)
    expect(useStore.getState().project.documents[WORLD_DOC].data.biomes).toHaveLength(6)
    useStore.getState().undo()
    expect(useStore.getState().project.documents[WORLD_DOC].data.biomes).toHaveLength(0)
    expect(useStore.getState().project.documents['design.combat'].data.bosses).toHaveLength(0)
  })
})

describe('older world hints follow the derived unlock path', () => {
  it('counts a boss or quest gate as reaching a biome and enemies linked from Combat as content', () => {
    const r = ruleIds(build())
    expect(r).not.toContain('world.reach')
    expect(r).toContain('world.enemies') // Peak has no enemies on either side
    const bare = build({ biomes: [{ id: 'm', name: 'Meadow', role: 'Starter' }, { id: 'x', name: 'Island', role: 'Mid' }] })
    expect(ruleIds(bare)).toContain('world.reach')
  })
})
