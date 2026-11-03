import type {
  CollectionView,
  FieldDef,
  ModuleGroup,
  PlannerModule,
  SectionDef,
  Source,
} from '../core/model/types'

type K<T> = Omit<T, 'key' | 'label' | 'type'>
type Opt = { help?: string; required?: boolean }

export const catalog = (c: string): Source => ({ catalog: c })
export const section = (s: string, doc?: string): Source => ({ section: s, ...(doc ? { doc } : {}) })

export const f = {
  text: (key: string, label: string, o: Opt = {}): FieldDef => ({ key, label, type: 'text', ...o }),
  long: (key: string, label: string, o: Opt = {}): FieldDef => ({ key, label, type: 'longtext', ...o }),
  num: (key: string, label: string, o: Opt & K<{ min?: number; max?: number; step?: number }> = {}): FieldDef => ({
    key,
    label,
    type: 'number',
    ...o,
  }),
  bool: (key: string, label: string, o: Opt = {}): FieldDef => ({ key, label, type: 'boolean', ...o }),
  enm: (key: string, label: string, options: string[], o: Opt = {}): FieldDef => ({
    key,
    label,
    type: 'enum',
    options,
    ...o,
  }),
  ref: (key: string, label: string, source: Source, o: Opt = {}): FieldDef => ({
    key,
    label,
    type: 'ref',
    source,
    ...o,
  }),
  multi: (key: string, label: string, source: Source, o: Opt = {}): FieldDef => ({
    key,
    label,
    type: 'multiref',
    source,
    ...o,
  }),
  color: (key: string, label: string, o: Opt = {}): FieldDef => ({ key, label, type: 'color', ...o }),
  list: (key: string, label: string, o: Opt = {}): FieldDef => ({ key, label, type: 'list', ...o }),
  map: (key: string, label: string, source: Source, max?: number, o: Opt = {}): FieldDef => ({
    key,
    label,
    type: 'map',
    source,
    max,
    ...o,
  }),
  formula: (key: string, label: string, o: Opt = {}): FieldDef => ({ key, label, type: 'formula', ...o }),
  check: (key: string, label: string, o: Opt = {}): FieldDef => ({ key, label, type: 'checklist', ...o }),
}

export const NAME: FieldDef = { key: 'name', label: 'Name', type: 'text', required: true }

export const v = {
  cards: (): CollectionView => ({ kind: 'cards' }),
  table: (columns?: string[]): CollectionView => ({ kind: 'table', columns }),
  kanban: (groupBy: string): CollectionView => ({ kind: 'kanban', groupBy }),
  radar: (mapField: string): CollectionView => ({ kind: 'radar', mapField }),
  grid2d: (xField: string, yField: string, max = 5): CollectionView => ({
    kind: 'grid2d',
    xField,
    yField,
    max,
  }),
  timeline: (
    startField: string,
    durationField: string,
    unit: string,
    o: { laneField?: string; depsField?: string } = {},
  ): CollectionView => ({ kind: 'timeline', startField, durationField, unit, ...o }),
}

export const s = {
  form: (id: string, title: string, fields: FieldDef[], description?: string): SectionDef => ({
    id,
    title,
    description,
    kind: 'form',
    fields,
  }),
  collection: (
    id: string,
    title: string,
    singular: string,
    fields: FieldDef[],
    views: CollectionView[] = [v.cards(), v.table()],
    o: { description?: string; seed?: Record<string, unknown>[] } = {},
  ): SectionDef => ({
    id,
    title,
    description: o.description,
    kind: 'collection',
    singular,
    fields: fields.some((x) => x.key === 'name') ? fields : [NAME, ...fields],
    views,
    seed: o.seed,
  }),
  matrix: (
    id: string,
    title: string,
    rows: Source,
    cols: Source,
    cell: Extract<SectionDef, { kind: 'matrix' }>['cell'],
    o: { description?: string; diagonal?: boolean } = {},
  ): SectionDef => ({ id, title, description: o.description, kind: 'matrix', rows, cols, cell, diagonal: o.diagonal }),
  graph: (
    id: string,
    title: string,
    nodeKinds: string[],
    o: { description?: string; edgeKinds?: string[]; nodeSource?: Source } = {},
  ): SectionDef => ({ id, title, description: o.description, kind: 'graph', nodeKinds, edgeKinds: o.edgeKinds, nodeSource: o.nodeSource }),
  canvas: (id: string, title: string, itemKinds: string[], description?: string): SectionDef => ({
    id,
    title,
    description,
    kind: 'canvas',
    itemKinds,
  }),
  checklist: (id: string, title: string, description?: string): SectionDef => ({ id, title, description, kind: 'checklist' }),
  richtext: (id: string, title: string, description?: string): SectionDef => ({ id, title, description, kind: 'richtext' }),
  formulas: (id: string, title: string, description?: string): SectionDef => ({ id, title, description, kind: 'formulas' }),
}

export const mod = (
  group: ModuleGroup,
  key: string,
  title: string,
  docsPath: string,
  icon: string,
  summary: string,
  sections: PlannerModule['sections'],
): PlannerModule => ({
  id: `${group}.${key}`,
  group,
  title,
  summary,
  icon,
  docsPath,
  version: 1,
  sections,
})
