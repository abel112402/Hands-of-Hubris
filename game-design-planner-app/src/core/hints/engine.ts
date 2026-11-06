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
import { playerRules } from './rules/player'
import { itemRules } from './rules/items'
import { combatRules } from './rules/combat'
import { timeWeatherRules } from './rules/timeWeather'
import { tradeRules } from './rules/trade'
import { storyRules } from './rules/story'
import { roadmapRules } from './rules/roadmap'
import { visionRules } from './rules/vision'
import { SEVERITY_RANK, type Hint, type HintContext, type HintRule } from './types'

export const MAX_ACTIVE_HINTS = 5

export const RULES: HintRule[] = [...projectRules, ...documentRules, ...visionRules, ...roadmapRules, ...coreLoopRules, ...difficultyRules, ...diplomacyRules, ...worldRules, ...townRules, ...npcRules, ...playerRules, ...itemRules, ...combatRules, ...timeWeatherRules, ...tradeRules, ...storyRules, declarativeRule]

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
): { visible: Hint[]; total: number } {
  const prefs = ctx.project.meta.hints ?? defaultHintPrefs()
  if (!prefs.enabled) return { visible: [], total: 0 }
  const all = rankHints(filterHints(collectHints(ctx, rules), prefs, snoozed, ctx.now), ctx)
  return { visible: all.slice(0, MAX_ACTIVE_HINTS), total: all.length }
}
