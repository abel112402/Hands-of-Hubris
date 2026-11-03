export const FORMAT = 'hands-of-hubris-planner'
export const FORMAT_VERSION = 1
export const APP_VERSION = '0.1.0'

export type Source = { catalog: string } | { doc?: string; section: string }

export type FieldBase = { key: string; label: string; help?: string; required?: boolean }
export type FieldDef = FieldBase &
  (
    | { type: 'text' }
    | { type: 'longtext' }
    | { type: 'number'; min?: number; max?: number; step?: number }
    | { type: 'boolean' }
    | { type: 'enum'; options: string[] }
    | { type: 'ref'; source: Source }
    | { type: 'multiref'; source: Source }
    | { type: 'color' }
    | { type: 'list' }
    | { type: 'map'; source: Source; max?: number }
    | { type: 'formula' }
    | { type: 'checklist' }
  )
export type FieldType = FieldDef['type']

export type CollectionView =
  | { kind: 'cards' }
  | { kind: 'table'; columns?: string[] }
  | { kind: 'kanban'; groupBy: string }
  | { kind: 'radar'; mapField: string }
  | { kind: 'grid2d'; xField: string; yField: string; max: number }
  | {
      kind: 'timeline'
      startField: string
      durationField: string
      laneField?: string
      depsField?: string
      unit: string
    }

export type SectionBase = { id: string; title: string; description?: string }
export type SectionDef = SectionBase &
  (
    | { kind: 'form'; fields: FieldDef[] }
    | {
        kind: 'collection'
        singular: string
        fields: FieldDef[]
        views: CollectionView[]
        seed?: Record<string, unknown>[]
      }
    | {
        kind: 'matrix'
        rows: Source
        cols: Source
        cell: { type: 'number'; min: number; max: number } | { type: 'enum'; options: string[] }
        diagonal?: boolean
      }
    | { kind: 'graph'; nodeKinds: string[]; edgeKinds?: string[]; nodeSource?: Source }
    | { kind: 'canvas'; itemKinds: string[] }
    | { kind: 'checklist' }
    | { kind: 'richtext' }
    | { kind: 'formulas' }
  )
export type CollectionSection = Extract<SectionDef, { kind: 'collection' }>

export type ModuleGroup =
  | 'overview'
  | 'design'
  | 'technical'
  | 'artAudio'
  | 'production'
  | 'qa'
  | 'templates'
  | 'custom'

export interface PlannerModule {
  id: string
  group: ModuleGroup
  title: string
  summary: string
  icon: string
  docsPath: string
  version: number
  sections: SectionDef[] | ((registry: Registry) => SectionDef[])
}

export type Entity = { id: string; [key: string]: any }
export type CatalogItem = { id: string; label: string }
export type Catalog = { label: string; items: CatalogItem[] }
export type CustomType = { id: string; name: string; fields: FieldDef[] }

export interface Registry {
  catalogs: Record<string, Catalog>
  customFields: Record<string, FieldDef[]>
  entityTypes: CustomType[]
  hintRules?: DeclarativeHintRule[]
}

export type HintSeverity = 'info' | 'suggest' | 'important'
export type HintCondition =
  | { kind: 'isEmpty' }
  | { kind: 'count'; op: '<' | '<=' | '>' | '>=' | '=='; value: number }
  | { kind: 'fieldEmpty'; field: string }
  | { kind: 'fieldCompare'; field: string; op: '<' | '<=' | '>' | '>=' | '==' | '!='; value: number | string }

/** User-defined hint rule stored in the project file; evaluated without eval. */
export interface DeclarativeHintRule {
  id: string
  doc: string
  section: string
  when: HintCondition
  severity: HintSeverity
  title: string
  body: string
}

export interface HintThresholds {
  outlierIqr: number
  kanbanWip: number
  sparseRatio: number
  minSamples: number
}
export const DEFAULT_THRESHOLDS: HintThresholds = { outlierIqr: 3, kanbanWip: 8, sparseRatio: 0.4, minSamples: 6 }

/** Hint preferences shared with the team through the project file. */
export interface HintPrefs {
  enabled: boolean
  minSeverity: HintSeverity
  dismissed: Record<string, true>
  mutedRules: string[]
  thresholds: HintThresholds
}
export const defaultHintPrefs = (): HintPrefs => ({
  enabled: true,
  minSeverity: 'info',
  dismissed: {},
  mutedRules: [],
  thresholds: { ...DEFAULT_THRESHOLDS },
})

export type DocData = Record<string, any>
export interface DocumentEnvelope {
  moduleVersion: number
  data: DocData
}

export interface Link {
  from: string
  to: string
  kind: string
}

export interface Project {
  format: typeof FORMAT
  formatVersion: number
  meta: { name: string; createdAt: string; updatedAt: string; appVersion: string; hints?: HintPrefs }
  registry: Registry
  documents: Record<string, DocumentEnvelope>
  links: Link[]
}

export type GraphNode = {
  id: string
  label: string
  kind: string
  x: number
  y: number
  notes?: string
  refId?: string
}
export type GraphEdge = { id: string; source: string; target: string; label?: string; kind?: string }
export type GraphData = { nodes: GraphNode[]; edges: GraphEdge[] }
export type CanvasItem = {
  id: string
  kind: string
  label: string
  x: number
  y: number
  w: number
  h: number
}
export type CheckItem = { id: string; text: string; done: boolean }
export type ChecklistData = { groups: { id: string; title: string; items: CheckItem[] }[] }
export type FormulaData = {
  items: { id: string; name: string; expr: string; vars: Record<string, number> }[]
}
export type MatrixData = { cells: Record<string, string | number> }
