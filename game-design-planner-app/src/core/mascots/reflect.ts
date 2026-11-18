/**
 * Hubi's reflections: short remarks on the state of the project, built only from existing analyses
 * (planner progress, hints, open questions, roadmap load, milestones, section counts). Pure, so the
 * companion can pick one deterministically and the tests can pin every rule.
 * Text lives in i18n under `mascot.reflect.<key>`, with the params below as interpolation values.
 */
import { averageProgress, docProgress, nextMilestone } from '../progress'
import { questionStats } from '../openQuestions'
import { overload } from '../roadmap'
import { sectionCount } from '../flavor/milestones'
import { getModule, MODULES } from '../modules/registry'
import type { Project } from '../model/types'
import { costumeFor, type CostumeId } from './cast'

/** Every reflection key with the params its text may use (the i18n test checks the placeholders). */
export const REFLECT_PARAMS = {
  docEmpty: [],
  docStarted: ['pct'],
  docHalf: ['pct'],
  docDone: [],
  hintsHere: ['count'],
  hintsClear: [],
  hintsTotal: ['count'],
  overallLow: ['pct'],
  overallMid: ['pct'],
  overallHigh: ['pct'],
  nextMilestone: ['name'],
  roadmapOverload: ['weeks'],
  questionsOpen: ['count'],
  questionsOverdue: ['count'],
  itemsNoRecipes: ['items', 'recipes'],
  npcCrowd: ['count'],
  factionsMany: ['count'],
  questsMany: ['count'],
} as const satisfies Record<string, readonly string[]>

export type ReflectKey = keyof typeof REFLECT_PARAMS

export type Reflection = { key: ReflectKey; costume: CostumeId; params: Record<string, string | number>; weight: number }

export type ReflectCtx = {
  /** Planner on screen; without it only project-wide remarks apply. */
  docId?: string
  /** Active hints on this planner and in the whole project (from the hint engine, so this stays pure). */
  hintsHere?: number
  hintsTotal?: number
  now?: number
}

const PROJECT_DOCS = MODULES.filter((m) => m.group !== 'templates' && m.group !== 'custom').map((m) => m.id)

export function reflections(project: Project, ctx: ReflectCtx = {}): Reflection[] {
  const out: Reflection[] = []
  const add = (key: ReflectKey, costume: CostumeId, params: Reflection['params'] = {}, weight = 1) => out.push({ key, costume, params, weight })
  const { docId, hintsHere = 0, hintsTotal = 0, now = Date.now() } = ctx

  if (docId && getModule(docId)) {
    const own = costumeFor(docId)
    const pct = docProgress(project, docId)
    if (pct === 0) add('docEmpty', own, {}, 2)
    else if (pct === 100) add('docDone', own, {}, 2)
    else if (pct >= 50) add('docHalf', own, { pct })
    else add('docStarted', own, { pct })
    if (hintsHere >= 3) add('hintsHere', own, { count: hintsHere }, 2)
    else if (hintsHere === 0 && pct > 0) add('hintsClear', own)
  }

  if (hintsTotal >= 10) add('hintsTotal', 'zombie', { count: hintsTotal })

  const avg = averageProgress(project, PROJECT_DOCS.filter((d) => project.documents[d]))
  add(avg >= 75 ? 'overallHigh' : avg >= 30 ? 'overallMid' : 'overallLow', 'suit', { pct: avg }, docId ? 0.5 : 1.5)

  const next = nextMilestone(project)
  if (next?.name) add('nextMilestone', 'suit', { name: next.name }, docId?.startsWith('production.') || docId === 'overview.roadmap' ? 2 : 0.5)

  const over = Math.round(overload(project))
  if (over > 0) add('roadmapOverload', 'suit', { weeks: over }, docId === 'overview.roadmap' ? 3 : 1)

  const q = questionStats(project, now)
  if (q.overdue > 0) add('questionsOverdue', 'wizard', { count: q.overdue }, 2)
  else if (q.open >= 5) add('questionsOpen', 'wizard', { count: q.open })

  const items = sectionCount(project, 'design.items', 'items')
  const recipes = sectionCount(project, 'design.items', 'recipes')
  if (items >= 10 && recipes * 5 < items) add('itemsNoRecipes', 'smith', { items, recipes }, docId === 'design.items' ? 2 : 0.5)

  const npcs = sectionCount(project, 'design.npc', 'archetypes')
  if (npcs >= 5) add('npcCrowd', 'farmer', { count: npcs }, docId === 'design.npc' ? 1.5 : 0.3)

  const factions = sectionCount(project, 'design.factions', 'factions')
  if (factions >= 3) add('factionsMany', 'knight', { count: factions }, docId === 'design.factions' ? 1.5 : 0.3)

  const quests = sectionCount(project, 'design.story', 'quests')
  if (quests >= 10) add('questsMany', 'wizard', { count: quests }, docId === 'design.story' ? 1.5 : 0.3)

  return out
}

/** Reflections for the current planner first (its own costume or explicit relevance), heaviest first. */
export function rankReflections(list: Reflection[]): Reflection[] {
  return [...list].sort((a, b) => b.weight - a.weight)
}
