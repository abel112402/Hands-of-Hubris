import { describe, expect, it } from 'vitest'
import { deserializeProject } from '../src/core/persistence/serialize'
import { buildIR } from '../src/core/engine/ir'
import { evalFormula, parseFormula } from '../src/core/engine/formulaAst'
import { evaluate } from '../src/core/formula'
import { createProject } from '../src/core/model/project'
import { DATA_DOC } from '../src/core/dataDriven'

const fs: { readFileSync: (path: string, enc: string) => string } = await import('node:fs' as string)
const cinderholm = () => deserializeProject(fs.readFileSync('examples/cinderholm.hohplan.json', 'utf8')).project

describe('formula tree', () => {
  it.each(['1 + 2 * 3', '(1 + 2) * 3', '2 ^ 3 ^ 2', '-a + -(b - 1)', '10 - 4 - 3', '12 / 3 / 2', 'max(a, b * 2) + pow(a, 2) - min(1, 2, 3)', 'sqrt(abs(-16)) + floor(2.7) + ceil(.2)'])(
    'means the same as the evaluator: %s',
    (expr) => {
      const vars = { a: 3, b: 5 }
      expect(evalFormula(parseFormula(expr), vars)).toBeCloseTo(evaluate(expr, vars))
    },
  )

  it('rejects what the evaluator rejects', () => {
    expect(() => parseFormula('foo(1)')).toThrow(/Unknown function/)
    expect(() => parseFormula('1 +')).toThrow()
    expect(() => parseFormula('(1')).toThrow()
  })
})

describe('engine IR from the example project', () => {
  const p = cinderholm()
  const { ir, issues } = buildIR(p)

  it('takes every schema with typed fields, its format and load group', () => {
    expect(ir.schemas.map((s) => s.name)).toEqual(['Item', 'Building', 'NPC need', 'Recipe', 'Enemy', 'Quest'])
    const item = ir.schemas[0]
    expect(item.format).toBe('native')
    expect(ir.schemas.find((s) => s.name === 'Recipe')!.format).toBe('csv')
    expect(ir.schemas.find((s) => s.name === 'Quest')!.format).toBe('json')
    expect(item.fields.map((f) => [f.name, f.type.k])).toEqual([
      ['name', 'string'],
      ['icon', 'asset'],
      ['rarity', 'enum'],
      ['value', 'int'],
      ['stackSize', 'int'],
      ['tags', 'list'],
      ['description', 'text'],
    ])
    expect(ir.schemas.find((s) => s.name === 'Building')!.fields.find((f) => f.name === 'buildCost')!.type).toEqual({ k: 'list', of: { k: 'ref', schema: 'UgNzlgZV' } })
  })

  it('exports one record per content-planner entry with stable keys', () => {
    const items = p.documents['design.items'].data.items
    const recs = ir.records.filter((r) => r.schema === 'UgNzlgZV')
    expect(recs).toHaveLength(items.length)
    expect(recs[0]).toMatchObject({ plannerId: items[0].id, key: 'item.plank', values: { id: 'item.plank', name: 'Plank', rarity: 'common', value: 2, stackSize: 50 } })
    expect(new Set(ir.records.map((r) => r.key)).size).toBe(ir.records.length)
    expect(ir.records.filter((r) => r.schema === 'rka0hMnP')).toEqual([])
  })

  it('turns catalogs into enums and localized fields into string keys', () => {
    const rarity = ir.enums.find((e) => e.id === 'catalog:rarities')!
    expect(rarity.members.map((m) => m.id)).toEqual(['common', 'uncommon', 'rare', 'epic', 'legendary'])
    const quest = ir.records.find((r) => r.key === 'quest.washed_ashore')!
    expect(quest.values.title).toBe('quest.washed_ashore.title')
    expect(ir.strings).toContainEqual({ key: 'quest.washed_ashore.title', text: 'Washed ashore' })
  })

  it('reads every formula as a tree that evaluates like the planner', () => {
    expect(ir.formulas.length).toBeGreaterThan(0)
    for (const f of ir.formulas) {
      expect(f.error).toBeUndefined()
      expect(evalFormula(f.ast!, f.sample)).toBeCloseTo(evaluate(f.expr, f.sample))
    }
  })

  it('reports what could not be filled, without errors on the example', () => {
    expect(issues.filter((i) => i.level === 'error')).toEqual([])
    expect(issues).toContainEqual(expect.objectContaining({ code: 'record.assetUnset', field: 'icon' }))
    expect(issues).toContainEqual(expect.objectContaining({ code: 'schema.noSource', schema: 'rka0hMnP' }))
  })

  it('is deterministic', () => {
    expect(JSON.stringify(buildIR(cinderholm()))).toBe(JSON.stringify({ ir, issues }))
  })
})

describe('engine IR checks', () => {
  it('flags shared prefixes, unknown types, clashing type names and resolves references', () => {
    const p = createProject('Checks', false)
    p.documents['design.items'] = { moduleVersion: 99, data: { items: [{ id: 'i1', name: 'Iron sword' }, { id: 'i2', name: 'Iron sword' }], recipes: [{ id: 'r1', name: 'Smelt', output: 'i2' }] } }
    p.documents[DATA_DOC] = {
      moduleVersion: 2,
      data: {
        formats: [{ id: 'j', name: 'JSON' }],
        schemas: [
          { id: 'a', name: 'Item', idPrefix: 'x.', format: 'j', source: 'Items — Items & Crafting', required: ['name: string'] },
          { id: 'b', name: 'item', idPrefix: 'x.', format: 'j', source: 'Recipes — Items & Crafting', required: ['output: Item', 'owner: Faction'] },
        ],
      },
    }
    const { ir, issues } = buildIR(p)
    const codes = issues.map((i) => i.code)
    expect(codes).toContain('schema.sharedPrefix')
    expect(codes).toContain('schema.sameTypeName')
    expect(codes).toContain('field.unknownType')
    expect(codes).toContain('record.keyClash')
    expect(ir.records.map((r) => r.key)).toEqual(['x.iron_sword', 'x.iron_sword_2', 'x.smelt'])
    expect(ir.records[2].values.output).toBe('x.iron_sword_2')
  })
})

describe('field mapping', () => {
  it('fills schema fields from mapped planner fields, maps { id: qty } to a list, and warns on unknown names', () => {
    const p = cinderholm()
    const schemas = p.documents[DATA_DOC].data.schemas
    const recipe = schemas.find((s: { name: string }) => s.name === 'Recipe')
    const enemy = schemas.find((s: { name: string }) => s.name === 'Enemy')
    recipe.fieldMap = ['output ← result', 'inputs ← ingredients', 'seconds = nope']
    enemy.fieldMap = ['health <- hp', 'ghost ← hp']
    const { ir, issues } = buildIR(p)
    const plank = ir.records.find((r) => r.key === 'rcp.plank')!
    expect(plank.values.output).toBe('item.plank')
    const sword = ir.records.find((r) => r.key === 'rcp.iron_longsword')!
    expect((sword.values.inputs as string[]).every((x) => x.startsWith('item.'))).toBe(true)
    expect(ir.records.find((r) => r.key === 'enemy.greenhollow_swarmling')!.values.health).toBe(30)
    expect(issues).toContainEqual(expect.objectContaining({ code: 'map.unknownSource', field: 'seconds' }))
    expect(issues).toContainEqual(expect.objectContaining({ code: 'map.unknownField', field: 'ghost' }))
    expect(issues.some((i) => i.code === 'record.missing' && i.field === 'health')).toBe(false)
  })

  it('treats “—” as no planner field', () => {
    const p = cinderholm()
    p.documents[DATA_DOC].data.schemas[0].fieldMap = ['stackSize ← —']
    const { ir } = buildIR(p)
    expect(ir.records[0].values.stackSize).toBeNull()
  })
})
