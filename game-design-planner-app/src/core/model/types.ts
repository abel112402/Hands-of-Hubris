export const FORMAT = 'hands-of-hubris-planner'
export const FORMAT_VERSION = 1
export const APP_VERSION = '0.1.0'

export type Source = { catalog: string } | { doc?: string; section: string }
/** A graph's node source may merge several sections (e.g. all the systems a loop can refer to). */
export type GraphSource = Source | { any: Source[] }

export type GroupFilter = { field: string; profiles: { section: string; key: string }; groups: Record<string, string> }

/** Reads a numeric range from a form section of the same document (e.g. a stat scale). */
export type RangeFrom = { section: string; minField: string; maxField: string }

/** `group` collects fields under one collapsible heading in the inspector. */
export type FieldBase = { key: string; label: string; help?: string; placeholder?: string; required?: boolean; group?: string }
export type FieldDef = FieldBase &
  (
    | { type: 'text' }
    | { type: 'longtext' }
    | { type: 'number'; min?: number; max?: number; step?: number }
    | { type: 'boolean' }
    | { type: 'enum'; options: string[] }
    | { type: 'ref'; source: Source }
    | { type: 'multiref'; source: GraphSource }
    | { type: 'color' }
    | { type: 'date' }
    | { type: 'list' }
    | { type: 'map'; source: Source; min?: number; max?: number; rangeFrom?: RangeFrom }
    | { type: 'formula' }
    | { type: 'checklist' }
  )
export type FieldType = FieldDef['type']

export type CollectionView =
  | { kind: 'cards' }
  | { kind: 'table'; columns?: string[] }
  | { kind: 'kanban'; groupBy: string }
  | { kind: 'radar'; mapField: string; scale?: RangeFrom }
  | {
      kind: 'statPreview'
      /** Formula and stat-ref fields of this collection, evaluated against the map field of another collection's entries. */
      formulaField: string
      statField: string
      against: { section: string; mapField: string }
    }
  | {
      kind: 'needsBalance'
      /** Map field giving the population per archetype; building counts come from the Town module. */
      populationField: string
    }
  /** Player Character views; the fields they read are fixed by the module (see core/player.ts). */
  | { kind: 'depletion' }
  | { kind: 'levelCurve' }
  | { kind: 'skillTree' }
  | { kind: 'buildPlanner' }
  /** Items & Crafting views; fields are fixed by the module (see core/items.ts). */
  | { kind: 'itemCoverage' }
  | { kind: 'valuePreview' }
  | { kind: 'craftTree' }
  | { kind: 'rarityCurve' }
  | { kind: 'lootOdds' }
  /** Combat views; fields are fixed by the module (see core/combat.ts). */
  | { kind: 'combatSandbox' }
  | { kind: 'threatCurve' }
  | { kind: 'weaknessMatrix' }
  | { kind: 'phaseBars' }
  | { kind: 'grid2d'; xField: string; yField: string; max: number }
  | { kind: 'ladder'; orderField: string; linkFields?: string[] }
  | {
      kind: 'ranges'
      minField: string
      maxField: string
      /** Form section whose fields give the full scale the ranges should cover. */
      scale: { section: string; minField: string; maxField: string; fallback: [number, number] }
    }
  /** Planning estimate of resource balance, workforce and route load, derived from the Town module. */
  | { kind: 'economy' }
  | { kind: 'progression'; scaleField: string; leadsField: string }
  | {
      kind: 'compare'
      /** Matrix section holding the values, and the catalog giving its columns. */
      valuesSection: string
      columns: Source
    }
  | {
      kind: 'timeline'
      startField: string
      durationField: string
      laneField?: string
      depsField?: string
      unit: string
      /** Marks items with this field set to 'Milestone' as zero-duration events. */
      kindField?: string
      /** Reads the project start date and buffer (%) from a form section, so bars can be shown as calendar dates. */
      calendar?: { section: string; startField: string; bufferField: string }
      /** Draws another collection's items as phase bands behind the bars. */
      bands?: { section: string; startField: string; durationField: string }
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
        /** Exports one heading per option of this enum field instead of a single list. */
        exportSplit?: { field: string; headings: string[] }
        /**
         * Hides field groups that do not apply to an entity's kind. The profile entry whose `key` equals the entity's
         * `field` value says, per group, through a boolean field, whether the group applies. Without a profile all groups show.
         */
        groupFilter?: GroupFilter
      }
    | {
        kind: 'matrix'
        rows: Source
        cols: Source
        cell: { type: 'number'; min: number; max: number } | { type: 'enum'; options: string[] }
        diagonal?: boolean
        /** Row entity fields that give each row its own range, unit, notes and group. */
        /** Takes the allowed range from a form section instead of the fixed `cell` range. */
        rangeFrom?: { section: string; minField: string; maxField: string }
        /** Offers mirroring and marks pairs whose two directions differ. */
        symmetric?: boolean
        rowMeta?: { unit?: string; min?: string; max?: string; baseline?: string; notes?: string; group?: string }
      }
    | {
        kind: 'graph'
        nodeKinds: string[]
        edgeKinds?: string[]
        nodeSource?: GraphSource
        /** Lets a connection point at the entry that causes it (e.g. the quest, faction or boss behind an unlock). */
        edgeSource?: GraphSource
        /** A collection whose multiref field points at this graph's nodes (e.g. loops → nodes). */
        links?: { section: string; field: string; label: string }
      }
    | {
        kind: 'canvas'
        itemKinds: string[]
        /** Element kinds that stand for an entry from `source`, taking their label from it. */
        zones?: { kinds: string[]; source: GraphSource }
        /** Real-world size of the canvas, read from a form section, so the sketch has a scale. */
        scale?: { section: string; widthField: string; heightField: string; unitField: string }
      }
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
  /** Upgrades stored section data when a document's moduleVersion is older than `version`. */
  migrate?: (data: Record<string, any>) => void
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

/** User prompt template shared in the project file (never contains keys). */
export interface AiTemplate {
  id: string
  name: string
  text: string
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
  meta: { name: string; createdAt: string; updatedAt: string; appVersion: string; hints?: HintPrefs; aiTemplates?: AiTemplate[] }
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
export type GraphEdge = { id: string; source: string; target: string; label?: string; kind?: string; refId?: string }
export type GraphData = { nodes: GraphNode[]; edges: GraphEdge[] }
export type CanvasItem = {
  id: string
  kind: string
  label: string
  x: number
  y: number
  w: number
  h: number
  /** Entry this element stands for (e.g. a biome for a biome zone). */
  refId?: string
}
export type CheckItem = { id: string; text: string; done: boolean }
export type ChecklistData = { groups: { id: string; title: string; items: CheckItem[] }[] }
export type FormulaData = {
  items: { id: string; name: string; expr: string; vars: Record<string, number> }[]
}
export type MatrixData = { cells: Record<string, string | number> }
