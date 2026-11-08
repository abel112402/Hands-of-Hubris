import { describe, expect, it } from 'vitest'
import { collectHints, makeContext } from '../src/core/hints/engine'
import { moduleToMarkdown } from '../src/core/export/markdown'
import { createProject, makeId } from '../src/core/model/project'
import { ensureDocument, getModule } from '../src/core/modules/registry'
import { DATA_DOC, dataModel, loadPlan, parseField, pipelineReadiness, recordCount, sampleRecord, validateRecord } from '../src/core/dataDriven'

const mod = getModule(DATA_DOC)!
type P = ReturnType<typeof createProject>
const ARCH = 'technical.architecture'

function project(data: Record<string, unknown> = {}, extra: Record<string, Record<string, unknown>> = {}) {
  const p = createProject('T', false)
  p.documents[DATA_DOC] = { moduleVersion: 2, data }
  for (const [doc, d] of Object.entries(extra)) p.documents[doc] = { moduleVersion: 2, data: d }
  return p
}
const ITEM = { id: 'it', name: 'Item', idPrefix: 'item.', required: ['name: string', 'value: int', 'icon: Sprite'], optional: ['tags: string[]'] }
const RECIPE = { id: 'rc', name: 'Recipe', idPrefix: 'rcp.', required: ['output: Item', 'inputs: List<Item>', 'seconds: float'] }
const ruleIds = (p: P, docId = DATA_DOC) =>
  collectHints(makeContext(p, { docId }))
    .filter((h) => h.ruleId.startsWith('data.'))
    .map((h) => h.ruleId)
    .sort()

describe('data-driven module v2', () => {
  it('migrates v1 text into notes and format names into format refs, keeping schema ids', () => {
    const p = createProject('t', false)
    p.documents[DATA_DOC] = {
      moduleVersion: 1,
      data: {
        principle: { principle: 'Content is data', formats: 'SO mostly', loading: 'Addressables' },
        schemas: [{ id: 's1', name: 'Item', format: 'ScriptableObject', required: ['name: string'] }, { id: 's2', name: 'Map', format: 'Tiled' }, { id: 's3', name: 'Quest' }],
      },
    }
    const doc = ensureDocument(p, mod, makeId)
    expect(doc.moduleVersion).toBe(2)
    expect(doc.data.principle).toEqual({ principle: 'Content is data', legacyNotes: 'Formats: SO mostly\n\nLoading and Addressables: Addressables' })
    expect(doc.data.schemas.map((s: { id: string; format?: string }) => `${s.id}:${s.format}`)).toEqual(['s1:format-so', 's2:format-tiled', 's3:undefined'])
    expect(doc.data.formats.map((f: { name: string }) => f.name)).toEqual(['ScriptableObject', 'JSON', 'CSV', 'Tiled'])
    expect(doc.data.schemas[0].required).toEqual(['name: string'])
    for (const s of ['loadGroups', 'validators']) expect(Array.isArray(doc.data[s]), s).toBe(true)
  })

  it('exports sections in doc-chapter order with a class diagram', () => {
    const md = moduleToMarkdown(createProject('T'), mod)
    const order = ['Principle', 'Data formats', 'Data schemas', 'IDs and references', 'Loading and Addressables', 'Validation and editor tools', 'Mods and extensibility']
    const at = order.map((h, i) => md.indexOf(`## ${i + 1}. ${h}\n`))
    expect(at.every((x) => x >= 0)).toBe(true)
    expect([...at].sort((a, b) => a - b)).toEqual(at)
    const md2 = moduleToMarkdown(project({ schemas: [ITEM, RECIPE] }), mod)
    expect(md2).toContain('S_Recipe --> S_Item : inputs [*]')
    expect(md2).toContain('+value : int')
  })
})

describe('data model and records', () => {
  it('parses field types', () => {
    const schemas = [ITEM]
    expect(parseField('output: Item', schemas)).toMatchObject({ name: 'output', kind: 'ref', array: false })
    expect(parseField('inputs: List<item>', schemas)).toMatchObject({ kind: 'ref', array: true })
    expect(parseField('tags: string[]', schemas)).toMatchObject({ kind: 'primitive', array: true })
    expect(parseField('icon: Sprite', schemas).kind).toBe('asset')
    expect(parseField('owner: Faction', schemas).kind).toBe('unknown')
    expect(parseField('broken', schemas).kind).toBe('missing')
    expect(parseField('need: ref NPC need', [{ id: 'n', name: 'NPC need' }]).kind).toBe('ref')
  })

  it('builds edges and lists problems', () => {
    const m = dataModel(project({ schemas: [ITEM, { ...RECIPE, optional: ['by: Faction'] }] }))
    expect(m.edges.map((e) => `${e.from.id}.${e.field.name}>${e.to.id}${e.field.array ? '[]' : ''}`)).toEqual(['rc.output>it', 'rc.inputs>it[]'])
    expect(m.problems.map((x) => x.field.name)).toEqual(['by'])
  })

  it('counts records from the content planner unless overridden', () => {
    const p = project({ schemas: [{ ...ITEM, source: 'Items — Items & Crafting' }] }, { 'design.items': { items: [{ id: 'a', name: 'Iron Sword' }, { id: 'b' }] } })
    const item = p.documents[DATA_DOC].data.schemas[0]
    expect(recordCount(p, item)).toEqual({ count: 2, from: 'planner' })
    item.records = 10
    expect(recordCount(p, item)).toEqual({ count: 10, from: 'manual' })
  })

  it('builds a sample record that validates, and catches broken ones', () => {
    const p = project({ schemas: [{ ...ITEM, source: 'Items — Items & Crafting' }, RECIPE] }, { 'design.items': { items: [{ id: 'a', name: 'Iron Sword' }] } })
    const [item, recipe] = p.documents[DATA_DOC].data.schemas
    expect(sampleRecord(p, item)).toEqual({ id: 'item.iron_sword', name: 'Iron Sword', value: 1, icon: 'Assets/_Project/Sprites/IronSword', tags: ['…'] })
    expect(sampleRecord(p, recipe).output).toBe('item.iron_sword')
    expect(validateRecord(p, recipe, JSON.stringify(sampleRecord(p, recipe)))).toEqual([])
    const issues = validateRecord(p, recipe, '{"id":"Recipe1","output":"bld.x","inputs":"item.a","extra":1}')
    expect(issues.map((i) => `${i.level}:${i.field}`)).toEqual(['error:id', 'error:output', 'error:inputs', 'error:seconds', 'warning:extra'])
    expect(validateRecord(p, recipe, '{oops')[0].message).toMatch(/^Not valid JSON/)
    p.documents[DATA_DOC].data.ids = { casing: 'kebab-case' }
    expect(sampleRecord(p, item).id).toBe('item.iron-sword')
  })
})

describe('pipeline readiness and load plan', () => {
  it('scores each schema per step', () => {
    const p = project(
      {
        formats: [{ id: 'f', name: 'SO' }],
        schemas: [{ ...ITEM, format: 'f', editorTool: 'Inspector', source: 'Items — Items & Crafting' }, { ...RECIPE, idPrefix: 'item.' }],
        validators: [{ id: 'v', name: 'Unique', kind: 'Unique ID' }],
        loadGroups: [{ id: 'g', name: 'Core', schemas: ['it'] }],
      },
      { [ARCH]: { extensionPoints: [{ id: 'x', name: 'Items', schemas: ['it'] }] }, 'design.items': { items: [{ id: 'a' }] } },
    )
    const [item, recipe] = pipelineReadiness(p).rows
    expect(item.score).toBe(7)
    expect(item.cells.id.ok).toBe(false)
    expect(item.cells.id.note).toBe('shared with Recipe')
    expect(recipe.cells.validation.ok).toBe(true)
    expect(Object.entries(recipe.cells).filter(([, c]) => c.ok).map(([k]) => k)).toEqual(['fields', 'validation'])
  })

  it('orders groups by when they load and estimates size', () => {
    const p = project(
      {
        schemas: [{ ...ITEM, records: 256, avgSizeKb: 4 }, { ...RECIPE, records: 100 }, { id: 'q', name: 'Quest' }],
        loadGroups: [
          { id: 'late', name: 'Late', schemas: ['rc'], strategy: 'On demand' },
          { id: 'world', name: 'World', schemas: ['rc'], strategy: 'With scene', scene: 's2', budgetMb: 0.1 },
          { id: 'core', name: 'Core', schemas: ['it'], strategy: 'Preload at boot', budgetMb: 1 },
        ],
      },
      { [ARCH]: { scenes: [{ id: 's2', name: 'World', loadOrder: 2 }, { id: 's1', name: 'Menu', loadOrder: 1 }] } },
    )
    const plan = loadPlan(p)
    expect(plan.phases.map((ph) => `${ph.label}:${ph.groups.map((g) => g.group.id).join('+')}`)).toEqual(['Boot:core', 'World:world', 'On demand:late'])
    expect(plan.phases[0].mb).toBe(1)
    expect(plan.phases[1].groups[0].over).toBe(true)
    expect(plan.unassigned.map((s) => s.id)).toEqual(['q'])
    expect(plan.duplicated.map((s) => s.id)).toEqual(['rc'])
    expect(loadPlan(p, 2).phases[0].mb).toBe(2)
  })
})

describe('data-driven hints', () => {
  it('stay quiet on an empty doc and in other editors', () => {
    expect(ruleIds(project({ schemas: [] }))).toEqual([])
    expect(ruleIds(project({ schemas: [{ id: 'a', name: 'A', required: ['x: Nope'] }] }), ARCH)).toEqual([])
  })
  it('fire on each problem and never exceed suggest', () => {
    const p = project({
      principle: { legacyNotes: 'old' },
      schemas: [{ ...ITEM, required: ['owner: Faction'], records: 2000, avgSizeKb: 10 }, { ...RECIPE, idPrefix: 'item.' }, { id: 'e', name: 'Empty' }],
      loadGroups: [{ id: 'g', name: 'Core', schemas: ['it'], budgetMb: 1 }],
      validators: [{ id: 'v', name: 'Range', schema: 'it' }],
    })
    expect(ruleIds(p)).toEqual(['data.budget', 'data.legacy', 'data.noFields', 'data.prefix', 'data.type', 'data.unloaded', 'data.unvalidated'])
    const hints = collectHints(makeContext(p, { docId: DATA_DOC })).filter((h) => h.ruleId.startsWith('data.'))
    expect(hints.every((h) => h.severity === 'suggest' || h.severity === 'info')).toBe(true)
  })
  it('are quiet for a clean setup', () => {
    const p = project({
      schemas: [ITEM, RECIPE],
      loadGroups: [{ id: 'g', name: 'Core', schemas: ['it', 'rc'], budgetMb: 10 }],
      validators: [{ id: 'v', name: 'Unique', kind: 'Unique ID' }],
    })
    expect(ruleIds(p)).toEqual([])
  })
})
