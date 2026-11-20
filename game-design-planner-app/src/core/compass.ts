/**
 * The v3 phase compass (plans/UI_V3_PLAN.md, "Phase compass"): every planner placed in one walkthrough phase, so
 * the rail shows five phases instead of a flat list of 30+ planners. Pure over the project and its walkthrough.
 */
import type { ModuleGroup, PlannerModule, Project } from './model/types'
import { MODULES } from './modules/registry'
import { docProgress } from './progress'
import { PHASES, type PhaseId, type Walkthrough } from './walkthrough/types'

/** Where planners that no walkthrough step opens belong, by their group. */
const GROUP_PHASE: Record<ModuleGroup, PhaseId> = {
  overview: 'concept',
  design: 'systems',
  artAudio: 'content',
  technical: 'production',
  production: 'production',
  qa: 'ship',
  templates: 'production',
  custom: 'production',
}

/**
 * A planner's phase: the phase of the first walkthrough step that opens it (so the compass follows the
 * project's genre-tailored walkthrough), else its group's phase.
 */
export function plannerPhase(walk: Pick<Walkthrough, 'steps'>, mod: Pick<PlannerModule, 'id' | 'group'>): PhaseId {
  return walk.steps.find((s) => s.target?.docId === mod.id)?.phase ?? GROUP_PHASE[mod.group] ?? 'production'
}

export type CompassPlanner = { id: string; title: string; progress: number }
export type CompassPhase = { phase: PhaseId; planners: CompassPlanner[]; progress: number }

/** The five phases in order, each with its planners (registry order) and their average fill (0–100). */
export function compassPhases(project: Project, walk: Pick<Walkthrough, 'steps'>): CompassPhase[] {
  return PHASES.map((phase) => {
    const planners = MODULES.filter((m) => plannerPhase(walk, m) === phase).map((m) => ({ id: m.id, title: m.title, progress: docProgress(project, m.id) }))
    const progress = planners.length ? Math.round(planners.reduce((n, p) => n + p.progress, 0) / planners.length) : 0
    return { phase, planners, progress }
  })
}
