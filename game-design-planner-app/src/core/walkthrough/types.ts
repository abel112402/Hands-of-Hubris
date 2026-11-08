/**
 * Walkthrough model: a base walkthrough plus genre packs, composed per project.
 * Everything here is plain data (no functions), so packs can be validated with Zod, versioned,
 * and later loaded from JSON (imported, user-authored or AI-drafted packs).
 * See plans/GUIDED_WORKSPACE_PLAN.md §4.
 */

/** Production phases, in order. IDs are stable and saved; add new ones at the end only. */
export const PHASES = ['concept', 'systems', 'content', 'production', 'ship'] as const
export type PhaseId = (typeof PHASES)[number]

/** Content text: an English string, or per-language strings with English as the fallback. */
export type I18nText = string | ({ en: string } & Record<string, string>)

export type StepKind = 'learn' | 'decide' | 'build' | 'review' | 'milestone'

/** Declarative completion check; evaluated against project data only (see evaluate.ts). */
export type DoneRule =
  /** The section has content; for collections, at least `min` entries (default 1). */
  | { kind: 'sectionFilled'; docId: string; section: string; min?: number }
  /** A step of the planner's own module guide is done (reuses its `done` check). */
  | { kind: 'moduleStep'; docId: string; stepId: string }
  /** Quality gate: none of these hint rules currently fires. */
  | { kind: 'hintsClear'; ruleIds: string[] }
  | { kind: 'all'; rules: DoneRule[] }
  | { kind: 'any'; rules: DoneRule[] }
  /** Ticked by hand only. */
  | { kind: 'manual' }

export type WalkTarget = { docId: string; section?: string; moduleStep?: string }

export type WalkStep = {
  /** Stable and saved (ticks, skips). Never rename or reuse. */
  id: string
  kind: StepKind
  phase: PhaseId
  /** Chapter ID within the phase; chapters are ordered by first appearance. */
  chapter: string
  title: I18nText
  /** Teaching text (markdown): what to decide and why it matters. */
  body: I18nText
  tips?: I18nText[]
  /** Examples of the planners' module guides to offer for this step. */
  examples?: { docId: string; exampleId: string }[]
  /** Where "Open" goes. */
  target?: WalkTarget
  done: DoneRule
  optional?: boolean
  /** Pre-filled question for "Ask AI about this step". */
  aiPrompt?: I18nText
}

export type ChapterDef = { id: string; phase: PhaseId; title: I18nText }

/** The walkthrough every project gets, with or without a genre. */
export type BasePack = {
  id: 'base'
  version: number
  chapters: ChapterDef[]
  steps: WalkStep[]
}

/** A genre's changes to the base. Applied in genre selection order. */
export type GenrePack = {
  /** Genre ID from the catalog (src/modules/genres.ts). */
  id: string
  version: number
  /** Extra chapters this pack introduces. */
  chapters?: ChapterDef[]
  /** New steps placed right after the anchor step (base or another pack); a missing anchor appends to the step's phase. */
  insert?: { after: string; steps: WalkStep[] }[]
  /** Overrides of existing steps (wording, done rule, target…). The ID cannot change. */
  replace?: Record<string, Partial<Omit<WalkStep, 'id'>>>
  /** Genre tips attached to existing steps, so shared topics are merged instead of duplicated. */
  notes?: Record<string, I18nText[]>
  /** Steps that don't fit the genre. With several genres, a step is removed only if every selected pack removes it. */
  remove?: string[]
}

/** A composed step: the merged content plus where it came from. */
export type ComposedStep = WalkStep & {
  /** 'base' and/or genre IDs that added or changed this step. */
  sources: string[]
  /** Tips merged from all packs, tagged with the genre that added them. */
  notes: { source: string; text: I18nText }[]
}

export type Walkthrough = {
  /** Pack IDs and versions used, e.g. { base: 1, survival: 2 }. */
  packs: Record<string, number>
  chapters: ChapterDef[]
  /** Ordered by phase, then chapter, then position. */
  steps: ComposedStep[]
}

/** Walkthrough progress saved in the project file (shared with the team, survives renames). */
export type GuideState = {
  version: number
  /** Walkthrough steps ticked by hand. */
  manual: string[]
  /** Walkthrough steps the user chose to skip. */
  skipped: string[]
  /** Module-guide steps ticked by hand, per planner. */
  modules?: Record<string, string[]>
}

export type StepStatus = 'done' | 'skipped' | 'open'
