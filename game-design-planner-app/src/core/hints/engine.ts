import { DEFAULT_THRESHOLDS, defaultHintPrefs, type HintPrefs, type Project } from '../model/types'
import { declarativeRule } from './rules/declarative'
import { documentRules } from './rules/document'
import { projectRules } from './rules/project'
import { coreLoopRules } from './rules/coreLoop'
import { difficultyRules } from './rules/difficulty'
import { diplomacyRules } from './rules/diplomacy'
import { worldRules } from './rules/world'
import { townRules } from './rules/town'
import { npcRules } from './rules/npc'
import { architectureRules } from './rules/architecture'
import { codingRules } from './rules/coding'
import { dataDrivenRules } from './rules/dataDriven'
import { playerRules } from './rules/player'
import { itemRules } from './rules/items'
import { combatRules } from './rules/combat'
import { timeWeatherRules } from './rules/timeWeather'
import { tradeRules } from './rules/trade'
import { storyRules } from './rules/story'
import { uiRules } from './rules/ui'
import { roadmapRules } from './rules/roadmap'
import { visionRules } from './rules/vision'
import { openQuestionRules } from './rules/openQuestions'
import { SEVERITY_RANK, type Hint, type HintContext, type HintRule } from './types'

export const MAX_ACTIVE_HINTS = 5

export const RULES: HintRule[] = [...projectRules, ...documentRules, ...visionRules, ...roadmapRules, ...coreLoopRules, ...difficultyRules, ...diplomacyRules, ...worldRules, ...townRules, ...npcRules, ...architectureRules, ...codingRules, ...dataDrivenRules, ...playerRules, ...itemRules, ...combatRules, ...timeWeatherRules, ...tradeRules, ...storyRules, ...uiRules, ...openQuestionRules, declarativeRule]

export const ruleOf = (hintRuleId: string) => (hintRuleId.startsWith('user:') ? 'user.declarative' : hintRuleId)

export function makeContext(project: Project, extra: Partial<HintContext> = {}): HintContext {
  return {
    project,
    thresholds: { ...DEFAULT_THRESHOLDS, ...project.meta.hints?.thresholds },
    now: Date.now(),
    ...extra,
  }
}

/** All hints for the context, unfiltered by user preferences. Rules are pure; order is deterministic. */
export function collectHints(ctx: HintContext, rules: HintRule[] = RULES): Hint[] {
  return rules.filter((r) => !r.appliesTo || r.appliesTo(ctx)).flatMap((r) => r.evaluate(ctx))
}

const relevance = (h: Hint, ctx: HintContext) => {
  if (ctx.selectedEntityId && h.target.entityId === ctx.selectedEntityId) return 0
  if (ctx.docId && h.target.docId === ctx.docId && h.target.sectionId === ctx.sectionId) return 1
  if (ctx.docId && h.target.docId === ctx.docId) return 2
  return 3
}

export function filterHints(
  hints: Hint[],
  prefs: HintPrefs,
  snoozed: Record<string, number> = {},
  now = Date.now(),
): Hint[] {
  return hints.filter(
    (h) =>
      SEVERITY_RANK[h.severity] >= SEVERITY_RANK[prefs.minSeverity] &&
      !prefs.dismissed[h.id] &&
      !prefs.mutedRules.includes(ruleOf(h.ruleId)) &&
      !prefs.mutedRules.includes(h.ruleId) &&
      !((snoozed[h.id] ?? 0) > now),
  )
}

export function rankHints(hints: Hint[], ctx: HintContext): Hint[] {
  return hints
    .map((h, i) => ({ h, i }))
    .sort(
      (a, b) =>
        relevance(a.h, ctx) - relevance(b.h, ctx) ||
        SEVERITY_RANK[b.h.severity] - SEVERITY_RANK[a.h.severity] ||
        a.i - b.i,
    )
    .map((x) => x.h)
}

export function evaluateHints(
  ctx: HintContext,
  snoozed: Record<string, number> = {},
  rules: HintRule[] = RULES,
): { visible: Hint[]; total: number; all: Hint[] } {
  const prefs = ctx.project.meta.hints ?? defaultHintPrefs()
  if (!prefs.enabled) return { visible: [], total: 0, all: [] }
  const all = dedupeHints(rankHints(filterHints(collectHints(ctx, rules), prefs, snoozed, ctx.now), ctx))
  return { visible: all.slice(0, MAX_ACTIVE_HINTS), total: all.length, all }
}

/**
 * Project-wide hints that send the user to the same place say the same thing twice
 * (e.g. "Write the vision first" and "Next: Vision & Concept"). Keep the first one,
 * which after ranking is the most severe. Page-level hints are never merged: two
 * different problems in one section are both worth showing.
 */
export function dedupeHints(ranked: Hint[]): Hint[] {
  const seen = new Set<string>()
  return ranked.filter((h) => {
    if (h.scope !== 'project' || !h.action) return true
    const key = `${h.action.kind}:${h.action.docId}:${h.action.sectionId ?? ''}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** Hints about the open page (or pointing at it) vs. project-wide hints about other planners. */
export function splitByScope(hints: Hint[], ctx: Pick<HintContext, 'docId'>): { here: Hint[]; elsewhere: Hint[] } {
  const here: Hint[] = []
  const elsewhere: Hint[] = []
  for (const h of hints) (h.scope === 'project' && h.target.docId !== ctx.docId ? elsewhere : here).push(h)
  return { here, elsewhere }
}
