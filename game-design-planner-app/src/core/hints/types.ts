import type { HintSeverity, HintThresholds, Project } from '../model/types'

export type HintScope = 'project' | 'document' | 'section' | 'entity'

export type HintContext = {
  project: Project
  docId?: string
  sectionId?: string
  selectedEntityId?: string
  thresholds: HintThresholds
  now: number
}

export type HintAction =
  | { kind: 'goto'; docId: string; sectionId?: string }
  | { kind: 'addEntity'; docId: string; sectionId: string; init?: Record<string, unknown> }

export type Hint = {
  id: string
  ruleId: string
  severity: HintSeverity
  scope: HintScope
  target: { docId: string; sectionId?: string; entityId?: string }
  /** i18n keys for built-in rules; literal text is used for user-defined rules. */
  titleKey?: string
  bodyKey?: string
  title?: string
  body?: string
  params?: Record<string, string | number>
  action?: HintAction
}

export type HintRule = {
  id: string
  scope: HintScope
  appliesTo?: (ctx: HintContext) => boolean
  evaluate: (ctx: HintContext) => Hint[]
}

export const SEVERITY_RANK: Record<HintSeverity, number> = { info: 0, suggest: 1, important: 2 }
