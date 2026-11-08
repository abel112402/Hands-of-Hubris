/**
 * Walkthrough completion and progress, derived from project data plus `meta.guide` (manual ticks
 * and skips). Pure over the project; cheap enough to run on every render via useMemo.
 */
import { getModule, getSections } from '../modules/registry'
import { isSectionEmpty } from '../hints/util'
import { collectHints, makeContext, ruleOf } from '../hints/engine'
import { guideOf } from '../../modules/guides'
import type { Project } from '../model/types'
import { PHASES, type ComposedStep, type DoneRule, type GuideState, type PhaseId, type StepStatus, type Walkthrough } from './types'

export const GUIDE_STATE_VERSION = 1

export const readGuideState = (project: Project): GuideState =>
  project.meta.guide ?? { version: GUIDE_STATE_VERSION, manual: [], skipped: [] }

/** Lazily computed facts shared by all rules of one evaluation. */
type Ctx = { project: Project; firing?: Set<string> }

function firingRules(ctx: Ctx): Set<string> {
  // Raw rule output, before snooze/mute/dismiss: muting a hint must not count as fixing it.
  ctx.firing ??= new Set(collectHints(makeContext(ctx.project)).map((h) => ruleOf(h.ruleId)))
  return ctx.firing
}

function ruleDone(rule: DoneRule, ctx: Ctx): boolean {
  switch (rule.kind) {
    case 'sectionFilled': {
      const mod = getModule(rule.docId)
      const sec = mod && getSections(mod, ctx.project.registry).find((s) => s.id === rule.section)
      if (!sec) return false
      const data = ctx.project.documents[rule.docId]?.data[sec.id]
      if (sec.kind === 'collection') return Array.isArray(data) && data.length >= (rule.min ?? 1)
      return !isSectionEmpty(sec, data)
    }
    case 'moduleStep': {
      const step = guideOf(rule.docId)?.steps.find((s) => s.id === rule.stepId)
      if (!step) return false
      // Module steps without a check are ticked by hand in that planner's guide.
      return step.done ? step.done(ctx.project) : !!readGuideState(ctx.project).modules?.[rule.docId]?.includes(step.id)
    }
    case 'hintsClear': {
      const firing = firingRules(ctx)
      return rule.ruleIds.every((r) => !firing.has(r))
    }
    case 'all':
      return rule.rules.every((r) => ruleDone(r, ctx))
    case 'any':
      return rule.rules.some((r) => ruleDone(r, ctx))
    case 'manual':
      return false
  }
}

/** Done (by data or by hand) wins over skipped; a skipped step that later gets done counts as done. */
function statusOf(step: ComposedStep, state: GuideState, ctx: Ctx): StepStatus {
  if (state.manual.includes(step.id) || ruleDone(step.done, ctx)) return 'done'
  return state.skipped.includes(step.id) ? 'skipped' : 'open'
}

export type PhaseProgress = { phase: PhaseId; total: number; done: number; skipped: number }

export type WalkthroughProgress = {
  status: Record<string, StepStatus>
  total: number
  done: number
  skipped: number
  /** 0–100; skipped steps count as finished so they don't hold progress back. */
  percent: number
  phases: PhaseProgress[]
  /** First open, non-optional step (else first open optional step); undefined when all are finished. */
  next?: ComposedStep
}

export function evaluateWalkthrough(w: Walkthrough, project: Project): WalkthroughProgress {
  const ctx: Ctx = { project }
  const state = readGuideState(project)
  const status: Record<string, StepStatus> = {}
  for (const s of w.steps) status[s.id] = statusOf(s, state, ctx)
  const count = (steps: ComposedStep[], st: StepStatus) => steps.filter((s) => status[s.id] === st).length
  const done = count(w.steps, 'done')
  const skipped = count(w.steps, 'skipped')
  const open = w.steps.filter((s) => status[s.id] === 'open')
  return {
    status,
    total: w.steps.length,
    done,
    skipped,
    percent: w.steps.length ? Math.round(((done + skipped) / w.steps.length) * 100) : 0,
    phases: PHASES.map((phase) => {
      const inPhase = w.steps.filter((s) => s.phase === phase)
      return { phase, total: inPhase.length, done: count(inPhase, 'done'), skipped: count(inPhase, 'skipped') }
    }).filter((p) => p.total),
    next: open.find((s) => !s.optional) ?? open[0],
  }
}

// ---------- State edits (pure; call inside useStore.mutate so each is one undo step) ----------

function ensureState(project: Project): GuideState {
  project.meta.guide ??= { version: GUIDE_STATE_VERSION, manual: [], skipped: [] }
  return project.meta.guide
}

const toggleIn = (list: string[], id: string, on?: boolean) => {
  const has = list.includes(id)
  const want = on ?? !has
  return want === has ? list : want ? [...list, id] : list.filter((x) => x !== id)
}

/** Marks a walkthrough step done by hand (or clears the mark). Also un-skips it. */
export function setStepManual(project: Project, stepId: string, on?: boolean) {
  const s = ensureState(project)
  s.manual = toggleIn(s.manual, stepId, on)
  if (s.manual.includes(stepId)) s.skipped = s.skipped.filter((x) => x !== stepId)
}

export function setStepSkipped(project: Project, stepId: string, on?: boolean) {
  const s = ensureState(project)
  s.skipped = toggleIn(s.skipped, stepId, on)
}

/** Ticks a module-guide step by hand (or clears it). */
export function setModuleStepManual(project: Project, docId: string, stepId: string, on?: boolean) {
  const s = ensureState(project)
  const next = toggleIn(s.modules?.[docId] ?? [], stepId, on)
  s.modules = { ...s.modules, [docId]: next }
  if (!next.length) delete s.modules[docId]
  if (!Object.keys(s.modules).length) delete s.modules
}

/** Clears manual ticks and skips of the walkthrough (module-guide ticks are kept unless `modules`). */
export function resetGuideState(project: Project, { modules = false } = {}) {
  const s = project.meta.guide
  if (!s) return
  s.manual = []
  s.skipped = []
  if (modules) delete s.modules
}
