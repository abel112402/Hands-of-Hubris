import { archList } from '../../core/architecture'
import { DATA_DOC, dataList, dataModel, loadPlan } from '../../core/dataDriven'
import type { GuideExample, ModuleGuide } from '../../core/guides/types'
import { makeId } from '../../core/model/project'
import type { Entity, Project } from '../../core/model/types'
import { CONTENT_SOURCES, DEFAULT_FORMATS } from '../technical'

const data = (p: Project): Record<string, any> => {
  if (!p.documents[DATA_DOC]) p.documents[DATA_DOC] = { moduleVersion: 2, data: {} }
  return p.documents[DATA_DOC].data
}
const ensureList = (p: Project, section: string): Entity[] => {
  const d = data(p)
  if (!Array.isArray(d[section])) d[section] = []
  return d[section]
}
const ensureForm = (p: Project, section: string): Record<string, any> => {
  const d = data(p)
  if (!d[section] || typeof d[section] !== 'object' || Array.isArray(d[section])) d[section] = {}
  return d[section]
}
const byName = (list: Entity[], name: string) => list.find((e) => String(e.name ?? '').toLowerCase() === name.toLowerCase())
const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const empty = (v: unknown) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)
const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

/** Adds the default formats that are missing (by name); returns name → id. */
const ensureFormats = (p: Project) => {
  const list = ensureList(p, 'formats')
  for (const f of DEFAULT_FORMATS) if (!byName(list, f.name)) list.push({ ...f, id: list.some((x) => x.id === f.id) ? makeId() : f.id })
  return (name: string) => byName(list, name)!.id
}
/** Content planner whose label starts with the schema’s name (Item → Items — Items & Crafting). */
const guessSource = (name: string) => {
  const k = key(name)
  return CONTENT_SOURCES.find((c) => {
    const first = key(c.label.split(' — ')[0])
    return first === k || first === k + 's' || first === k + 'es' || first === k.replace(/y$/, 'ies')
  })?.label
}
const prefixFor = (name: string) => {
  const w = name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
  return (w.length > 1 ? w.join('_') : (w[0] ?? 'rec')).slice(0, 10) + '.'
}

const formatsExample: GuideExample = {
  id: 'data-unity-formats',
  section: 'formats',
  title: 'ScriptableObject, JSON and CSV',
  description: 'ScriptableObjects for content edited in Unity, JSON for nested data mods can write, CSV for flat tables balanced in a spreadsheet.',
  preview: 'dataFormats',
  apply: (p) => void ensureFormats(p),
}

type Spec = { required: string[]; optional?: string[]; prefix: string; format: string; avgSizeKb: number; editorTool?: string; records?: number; moddable?: boolean }
const SCHEMAS: [string, Spec][] = [
  ['Item', { required: ['name: string', 'icon: Sprite', 'rarity: enum', 'value: int', 'stackSize: int'], optional: ['tags: string[]', 'description: text'], prefix: 'item.', format: 'ScriptableObject', avgSizeKb: 6, editorTool: 'Item inspector with icon preview', moddable: true }],
  ['Building', { required: ['name: string', 'prefab: Prefab', 'buildCost: Item[]', 'workers: int', 'footprint: Vector2'], optional: ['produces: Recipe[]'], prefix: 'bld.', format: 'ScriptableObject', avgSizeKb: 40, editorTool: 'Footprint gizmo' }],
  ['NPC need', { required: ['name: string', 'decayPerHour: float', 'icon: Sprite'], optional: ['satisfiedBy: Item[]'], prefix: 'need.', format: 'ScriptableObject', avgSizeKb: 2, records: 8 }],
  ['Recipe', { required: ['inputs: Item[]', 'output: Item', 'seconds: float', 'station: Building'], prefix: 'rcp.', format: 'CSV', avgSizeKb: 1, moddable: true }],
  ['Enemy', { required: ['name: string', 'prefab: Prefab', 'health: int', 'damage: int'], optional: ['drops: Item[]'], prefix: 'enemy.', format: 'ScriptableObject', avgSizeKb: 30 }],
  ['Quest', { required: ['title: localizedString', 'giver: string', 'steps: string[]'], optional: ['rewards: Item[]', 'requires: Quest[]'], prefix: 'quest.', format: 'JSON', avgSizeKb: 3, moddable: true }],
]

const schemasExample: GuideExample = {
  id: 'data-colony-schemas',
  section: 'schemas',
  title: 'Colony-sim content schemas',
  description: 'Item, Building, NPC need, Recipe, Enemy and Quest with typed fields that reference each other, ID prefixes and their content planners. Fills only empty fields of existing schemas.',
  preview: 'dataSchemas',
  apply: (p) => {
    const fmt = ensureFormats(p)
    const list = ensureList(p, 'schemas')
    for (const [name, s] of SCHEMAS) {
      let e = byName(list, name)
      if (!e) list.push((e = { id: makeId(), name }))
      const set = (k: string, v: unknown) => {
        if (v !== undefined && empty(e![k])) e![k] = v
      }
      set('required', s.required)
      set('optional', s.optional)
      set('idPrefix', s.prefix)
      set('format', fmt(s.format))
      set('source', guessSource(name))
      set('avgSizeKb', s.avgSizeKb)
      set('editorTool', s.editorTool)
      if (!guessSource(name)) set('records', s.records)
      if (s.moddable && e.moddable === undefined) e.moddable = true
    }
  },
}

const loadExample: GuideExample = {
  id: 'data-load-groups',
  section: 'loadGroups',
  title: 'Boot, world and on-demand groups',
  description: 'Small shared data at boot, town content with the world scene, enemies and quests on demand, each with a memory budget.',
  preview: 'dataLoad',
  apply: (p) => {
    const schemas = dataList(p, 'schemas')
    const sid = (...names: string[]) => names.map((n) => byName(schemas, n)?.id).filter((x): x is string => !!x)
    const scenes = archList(p, 'scenes')
    const world = byName(scenes, 'World') ?? scenes.find((s) => s.kind === 'Level')
    const list = ensureList(p, 'loadGroups')
    const add = (name: string, e: Record<string, unknown>) => {
      if (!byName(list, name)) list.push({ id: makeId(), name, ...e })
    }
    add('Core data', { schemas: sid('Item', 'NPC need', 'Recipe'), strategy: 'Preload at boot', label: 'content-core', budgetMb: 8 })
    add('Town', { schemas: sid('Building'), ...(world ? { strategy: 'With scene', scene: world.id } : { strategy: 'On demand' }), label: 'content-town', budgetMb: 64 })
    add('Enemies', { schemas: sid('Enemy'), strategy: 'On demand', label: 'content-enemies', budgetMb: 32 })
    add('Quests', { schemas: sid('Quest'), strategy: 'On demand', label: 'content-quests', budgetMb: 4 })
  },
}

const validatorsExample: GuideExample = {
  id: 'data-validators',
  section: 'validators',
  title: 'Validators from editor to CI',
  description: 'Required fields in OnValidate, unique IDs on import, reference checks and quest loops in CI, ranges in the editor.',
  preview: 'dataValidators',
  apply: (p) => {
    const schemas = dataList(p, 'schemas')
    const sid = (n: string) => byName(schemas, n)?.id
    const list = ensureList(p, 'validators')
    const add = (name: string, e: Record<string, unknown>) => {
      if (!byName(list, name)) list.push({ id: makeId(), name, severity: 'Error', ...Object.fromEntries(Object.entries(e).filter(([, v]) => v !== undefined)) })
    }
    add('Required fields set', { kind: 'Required', when: 'In the editor', tool: 'OnValidate' })
    add('IDs are unique', { kind: 'Unique ID', when: 'On import', tool: 'Asset postprocessor' })
    add('Item value is not negative', { schema: sid('Item'), field: 'value', kind: 'Range', when: 'In the editor', tool: 'Range attribute' })
    add('Recipe items exist', { schema: sid('Recipe'), field: 'inputs, output', kind: 'Reference exists', when: 'Build / CI', tool: 'Content validation job' })
    add('Quest prerequisites have no loop', { schema: sid('Quest'), field: 'requires', kind: 'Custom', when: 'Build / CI', tool: 'Content validation job', severity: 'Warning' })
  },
}

export const DATA_DRIVEN_GUIDE: ModuleGuide = {
  map: {
    width: 1050,
    height: 230,
    nodes: [
      { id: 'principle', label: 'Principle', x: 30, y: 35, section: 'principle' },
      { id: 'formats', label: 'Formats', x: 240, y: 35, section: 'formats' },
      { id: 'schemas', label: 'Schemas', x: 450, y: 35, section: 'schemas' },
      { id: 'ids', label: 'IDs & references', x: 660, y: 35, section: 'ids' },
      { id: 'modding', label: 'Mods', x: 870, y: 35, section: 'modding' },
      { id: 'items', label: 'Items & Crafting', x: 30, y: 145, doc: 'design.items' },
      { id: 'validators', label: 'Validators', x: 240, y: 145, section: 'validators' },
      { id: 'loadGroups', label: 'Load groups', x: 450, y: 145, section: 'loadGroups' },
      { id: 'architecture', label: 'Technical Architecture', x: 660, y: 145, doc: 'technical.architecture' },
      { id: 'performance', label: 'Performance', x: 870, y: 145, doc: 'technical.performance' },
    ],
    edges: [
      { from: 'principle', to: 'formats', label: 'pick' },
      { from: 'formats', to: 'schemas', label: 'stored as' },
      { from: 'schemas', to: 'ids', label: 'identified by' },
      { from: 'ids', to: 'modding', label: 'stable for' },
      { from: 'items', to: 'schemas', label: 'records' },
      { from: 'schemas', to: 'validators', label: 'checked by' },
      { from: 'schemas', to: 'loadGroups', label: 'loaded in' },
      { from: 'architecture', to: 'loadGroups', label: 'scenes' },
      { from: 'architecture', to: 'modding', label: 'extension points' },
      { from: 'loadGroups', to: 'performance', label: 'memory' },
    ],
  },
  steps: [
    { id: 'principle', title: 'Write the principle', body: 'One or two sentences on what lives in data, e.g. “adding an item never needs a code change”.', section: 'principle', target: 'field-principle', done: (p) => !!text(data(p).principle?.principle) },
    { id: 'formats', title: 'Choose formats', body: 'Which formats content is authored in, and when each fits.', section: 'formats', target: 'add', done: (p) => dataList(p, 'formats').length > 0, action: { label: 'Insert SO, JSON and CSV', examples: 'formats' } },
    { id: 'fields', title: 'Type the fields', body: 'Give each schema its fields as “name: type”, required and optional.', section: 'schemas', target: 'add', done: (p) => dataList(p, 'schemas').some((s) => Array.isArray(s.required) && s.required.length > 0), action: { label: 'Insert colony-sim schemas', examples: 'schemas' } },
    { id: 'refs', title: 'Connect the schemas', body: 'A type that names another schema is a reference. The Data model draws them and flags unknown types.', section: 'schemas', target: 'view-dataModel', done: (p) => dataModel(p).edges.length > 0 && dataModel(p).problems.length === 0 },
    {
      id: 'ids',
      title: 'Set ID rules',
      body: 'A unique prefix per schema and one casing for every ID, so references never collide.',
      section: 'ids',
      target: 'field-casing',
      done: (p) => !!data(p).ids?.casing && dataList(p, 'schemas').length > 0 && dataList(p, 'schemas').every((s) => text(s.idPrefix)),
      action: {
        label: 'Use snake_case and a prefix per schema',
        run: (p) => {
          const ids = ensureForm(p, 'ids')
          if (!ids.casing) ids.casing = 'snake_case'
          if (!text(ids.example)) ids.example = 'item.iron_sword'
          for (const s of dataList(p, 'schemas')) if (!text(s.idPrefix)) s.idPrefix = prefixFor(String(s.name ?? ''))
        },
      },
    },
    {
      id: 'sources',
      title: 'Link the content planners',
      body: 'Say which design planner holds each schema’s records. Counts then come from there.',
      section: 'schemas',
      target: 'view-dataReadiness',
      done: (p) => dataList(p, 'schemas').some((s) => s.source),
      action: {
        label: 'Match planners by name',
        run: (p) => {
          for (const s of dataList(p, 'schemas')) if (!s.source) {
            const src = guessSource(String(s.name ?? ''))
            if (src) s.source = src
          }
        },
      },
    },
    { id: 'tester', title: 'Try a record', body: 'Open the Record tester, edit the sample and watch the checks. Tick this step by hand.', section: 'schemas', target: 'view-dataTester' },
    { id: 'loading', title: 'Plan the loading', body: 'Group schemas and say when each group loads. The Load plan estimates sizes; nothing should be left unloaded.', section: 'loadGroups', target: 'view-dataLoadPlan', done: (p) => dataList(p, 'loadGroups').length > 0 && loadPlan(p).unassigned.length === 0, action: { label: 'Insert load groups', examples: 'loadGroups' } },
    { id: 'validators', title: 'Add validators', body: 'Automatic checks and where they run. Earlier is cheaper: editor, then import, then CI.', section: 'validators', target: 'add', done: (p) => dataList(p, 'validators').length > 0, action: { label: 'Insert validators', examples: 'validators' } },
    { id: 'modding', title: 'Decide on mods', body: 'None, data mods, or data and scripts. Moddable schemas need stable IDs and an extension point.', section: 'modding', target: 'field-support', done: (p) => !!data(p).modding?.support },
  ],
  examples: [formatsExample, schemasExample, loadExample, validatorsExample],
  concepts: {
    formats: { title: 'Pick the format by who edits it', body: 'Designers in Unity want ScriptableObjects; balancing in a spreadsheet wants CSV; mods and tools want JSON. Text formats merge well in Git, Unity YAML less so.', diagram: 'formatFit' },
    schemas: { title: 'Types make references', body: 'A field typed with another schema’s name stores that record’s ID, so Recipe.output: Item points at an item. With [] it holds a list. That is how content links without code.', diagram: 'schemaRef' },
    ids: { title: 'Prefix plus a stable name', body: 'item.iron_sword reads well in logs and saves, never clashes with bld.iron_sword, and keeps working when the display name changes.', diagram: 'idAnatomy' },
    loadGroups: { title: 'Load what the scene needs', body: 'Small shared data loads at boot; heavy content with its scene or on demand. Total memory is records × size, so more content means more megabytes.', diagram: 'loadTimeline' },
    validators: { title: 'Catch bad data early', body: 'A check in the editor stops a mistake while typing; on import, when the file lands; in CI, before anyone plays it; at load, only when it is already broken.', diagram: 'shiftLeft' },
  },
  empty: {
    formats: 'Formats are the file types content is authored in.',
    schemas: 'Schemas describe each content type’s fields; records follow them.',
    loadGroups: 'Load groups say which content loads together, and when.',
    validators: 'Validators are the automatic checks that catch bad content.',
  },
}
