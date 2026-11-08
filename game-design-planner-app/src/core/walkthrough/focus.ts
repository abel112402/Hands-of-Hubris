/**
 * Connects walkthrough steps to the rest of the app: which hints belong to a step, which steps
 * belong to a planner page, and what the AI is told about a step. Pure functions.
 */
import { ruleOf } from '../hints/engine'
import type { Hint } from '../hints/types'
import { textOf } from './compose'
import type { ComposedStep, DoneRule, Walkthrough, WalkStep } from './types'

/** Hint rule IDs a step's completion depends on (its quality gates). */
export function gateRules(rule: DoneRule): string[] {
  switch (rule.kind) {
    case 'hintsClear':
      return rule.ruleIds
    case 'all':
    case 'any':
      return rule.rules.flatMap(gateRules)
    default:
      return []
  }
}

/**
 * Hints relevant to a step, most relevant first: hints of its quality-gate rules, then hints on its
 * target section, then other hints on its target planner. Each hint appears once.
 */
export function hintsForStep(step: WalkStep, hints: Hint[]): Hint[] {
  const gates = new Set(gateRules(step.done))
  const t = step.target
  const rank = (h: Hint) => {
    if (gates.has(ruleOf(h.ruleId)) || gates.has(h.ruleId)) return 0
    if (!t || h.target.docId !== t.docId) return -1
    if (t.section && h.target.sectionId === t.section) return 1
    return t.section && h.target.sectionId ? -1 : 2
  }
  return hints
    .map((h, i) => ({ h, i, r: rank(h) }))
    .filter((x) => x.r >= 0)
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.h)
}

/** Puts the hints of the focused step first, keeping the engine's order otherwise. */
export function focusHints(hints: Hint[], step: WalkStep | undefined): Hint[] {
  if (!step) return hints
  const first = hintsForStep(step, hints)
  const ids = new Set(first.map((h) => h.id))
  return [...first, ...hints.filter((h) => !ids.has(h.id))]
}

/**
 * Walkthrough steps that point at a planner page: the steps for that section, or, on sections
 * without their own step, the steps for the planner as a whole (such as reviews). Used to bring the
 * walkthrough along into the editor.
 */
export function stepsForPage(w: Walkthrough, docId: string, sectionId?: string): ComposedStep[] {
  const onDoc = w.steps.filter((s) => s.target?.docId === docId)
  const onSection = onDoc.filter((s) => sectionId && s.target?.section === sectionId)
  const whole = onDoc.filter((s) => !s.target?.section)
  return onSection.length ? onSection : whole
}

/**
 * The step as data for the AI prompt (sent fenced as untrusted data, like project content).
 * Includes the genre notes so answers follow the selected genres.
 */
export function stepPromptData(w: Walkthrough, step: ComposedStep, lang = 'en'): string {
  const chapter = w.chapters.find((c) => c.id === step.chapter)
  return JSON.stringify({
    phase: step.phase,
    chapter: chapter ? textOf(chapter.title, lang) : step.chapter,
    step: textOf(step.title, lang),
    goal: textOf(step.body, lang),
    tips: [...(step.tips ?? []).map((x) => textOf(x, lang)), ...step.notes.map((n) => `${n.source}: ${textOf(n.text, lang)}`)],
    genres: step.sources.filter((s) => s !== 'base'),
    planner: step.target?.docId,
    section: step.target?.section,
  })
}
