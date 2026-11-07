import type { Project } from '../model/types'

/** A box on the system map: a section of this module, or another module (doc) it depends on. */
export type GuideMapNode = { id: string; label: string; x: number; y: number; section?: string; doc?: string }
export type GuideMap = { width: number; height: number; nodes: GuideMapNode[]; edges: { from: string; to: string; label: string }[] }

export type GuideStep = {
  id: string
  title: string
  body: string
  section: string
  /** `data-guide` id of the control to spotlight when the step is opened. */
  target?: string
  /** Ticks the step from project data. Steps without it are ticked by hand. */
  done?: (p: Project) => boolean
  /** One-click help for the step: a direct change (one undo step) or opening the example picker. */
  action?: { label: string; run: (p: Project) => void } | { label: string; examples: string }
}

/** Optional input an example asks for before it is built, e.g. which cast a skill tree is for. */
export type ExampleParam = { key: string; label: string; options: (p: Project) => { id: string; label: string }[] }

export type PreviewKind =
  | 'xpCurve'
  | 'skillTree'
  | 'survival'
  | 'multiplier'
  | 'recipes'
  | 'lootOdds'
  | 'typeProfiles'
  | 'damageFormula'
  | 'enemyRoster'
  | 'bossPhases'
  | 'statusSet'
  | 'loadouts'
  | 'dayClock'
  | 'seasons'
  | 'weatherMix'
  | 'yearEvents'
  | 'merchants'
  | 'priceLadder'
  | 'moneyFlow'
  | 'actTimeline'
  | 'cast'
  | 'questFlow'
  | 'endingPaths'
  | 'wireframe'
  | 'screenMap'
  | 'bindings'
  | 'questions'
  | 'visionList'
  | 'roadmapList'
  | 'coreLoopList'
  | 'difficultyPressure'
  | 'diplomacy'
  | 'worldAtlas'
  | 'townFlow'
  | 'townNetwork'
  | 'npcPopulation'
  | 'npcLifespan'
  | 'npcNeeds'
  | 'npcWorkforce'
  | 'npcRelations'
  | 'npcEvents'

export type GuideExample = {
  id: string
  /** Section the example fills; the picker opens per section. */
  section: string
  title: string
  description: string
  param?: ExampleParam
  /** How the preview draws the result (computed on a copy of the project). */
  preview: PreviewKind
  /** Mutates the project; applied in one store mutation, so one undo step. */
  apply: (p: Project, param?: string) => void
}

/** Explainer card under a section title. `diagram` picks an inline SVG from ui/guides/concepts. */
export type GuideConcept = { title: string; body: string; diagram: 'decay' | 'pipeline' | 'tree' | 'abilityTimeline' | 'value' | 'craftChain' | 'lootRoll' | 'typeProfile' | 'damageFlow' | 'ttk' | 'threatRamp' | 'phaseBar' | 'dayClock' | 'modifierStack' | 'weatherMix' | 'eventCalendar' | 'priceChain' | 'spread' | 'wanderOdds' | 'sourceSink' | 'actPacing' | 'questChain' | 'choiceBranch' | 'rewardBudget' | 'wireAnatomy' | 'screenDepth' | 'hudBinding' | 'keyConflict' | 'pillarTest' | 'scopeBuckets' | 'criticalPath' | 'cutLadder' | 'nestedLoops' | 'feedbackLoop' | 'tuningTrack' | 'pressureBars' | 'relationWeb' | 'repScale' | 'unlockWaves' | 'atlasLayers' | 'shareMix' | 'needChain' | 'lifespanBands' | 'workforceFlow' | 'affinityLadder' | 'eventOdds' }

export type ModuleGuide = {
  map: GuideMap
  steps: GuideStep[]
  examples: GuideExample[]
  concepts: Record<string, GuideConcept>
  /** Teaching text for empty sections, shown with the matching examples. */
  empty: Record<string, string>
}
