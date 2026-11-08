/**
 * Genre profiles: deterministic editor recommendations and the composed project guide.
 * Pure functions over the portable `meta.profile`; no UI, no storage, so the same logic can run
 * in the local app, a future cloud project list, or a server-side job.
 */
import {
  ALWAYS_SHOWN_GROUPS,
  FOUNDATION_EDITORS,
  GENERAL_ORDER,
  GENRES,
  PROJECT_GUIDE_STEPS,
  type GenreDef,
  type ProjectGuideStepDef,
} from '../modules/genres'
import { GROUPS, MODULES, getModule, getSections } from './modules/registry'
import { isDocEmpty, isSectionEmpty } from './hints/util'
import type { ModuleGroup, Project, ProjectProfile } from './model/types'

export const PROFILE_VERSION = 1
export const MAX_GENRES = 8
export const MAX_CUSTOM_GENRES = 5
export const MAX_CUSTOM_GENRE_LENGTH = 60

export const getGenre = (id: string): GenreDef | undefined => GENRES.find((g) => g.id === id)

/** The project's profile, or a neutral one. Never mutates the project. */
export function readProfile(project: Project): ProjectProfile {
  return project.meta.profile ?? { version: PROFILE_VERSION, genres: [] }
}

/** Selected genre IDs (known and unknown). Use this for list/search metadata, e.g. a cloud `genres` column. */
export const projectGenres = (project: Project): string[] => [...readProfile(project).genres]

export const knownGenres = (profile: ProjectProfile): GenreDef[] =>
  profile.genres.map(getGenre).filter((g): g is GenreDef => !!g)

/** True when at least one catalog genre is selected, so recommendations are genre-specific. */
export const hasGenreProfile = (profile: ProjectProfile) => knownGenres(profile).length > 0

/** Display label for any saved genre ID; unknown (future or retired) IDs are shown as-is. */
export const genreLabel = (id: string) => getGenre(id)?.label ?? id

export type RecommendationReason =
  | { kind: 'foundation'; why: string }
  | { kind: 'genre'; genre: string; why: string }
  | { kind: 'general' }
  | { kind: 'manual' }

export type Recommendation = { docId: string; reasons: RecommendationReason[] }

const registryIndex = (docId: string) => {
  const i = MODULES.findIndex((m) => m.id === docId)
  return i < 0 ? Number.MAX_SAFE_INTEGER : i
}

/**
 * Default recommendations for a profile, before user overrides.
 * Foundation first, then the union of the genres' editors ordered by their best rank in any selected
 * genre, ties broken by registry order. Without a known genre, falls back to the general order.
 * Missing/retired modules are skipped (the stored profile is not changed).
 */
export function defaultRecommendations(profile: ProjectProfile): Recommendation[] {
  const genres = knownGenres(profile)
  const out = new Map<string, Recommendation>()
  for (const f of FOUNDATION_EDITORS) out.set(f.docId, { docId: f.docId, reasons: [{ kind: 'foundation', why: f.why }] })

  if (!genres.length) {
    for (const docId of GENERAL_ORDER) if (!out.has(docId)) out.set(docId, { docId, reasons: [{ kind: 'general' }] })
    return [...out.values()].filter((r) => getModule(r.docId))
  }

  const rank = new Map<string, number>()
  const extra = new Map<string, RecommendationReason[]>()
  for (const g of genres) {
    g.editors.forEach((e, i) => {
      rank.set(e.docId, Math.min(rank.get(e.docId) ?? Infinity, i))
      const reasons = extra.get(e.docId) ?? []
      reasons.push({ kind: 'genre', genre: g.id, why: e.why })
      extra.set(e.docId, reasons)
    })
  }
  for (const [docId, reasons] of extra) {
    const existing = out.get(docId)
    if (existing) existing.reasons.push(...reasons)
  }
  const rest = [...extra.keys()]
    .filter((d) => !out.has(d))
    .sort((a, b) => rank.get(a)! - rank.get(b)! || registryIndex(a) - registryIndex(b))
  for (const docId of rest) out.set(docId, { docId, reasons: extra.get(docId)! })
  return [...out.values()].filter((r) => getModule(r.docId))
}

/** Final recommended editors: defaults minus explicit removals, plus explicit additions (last). */
export function recommendEditors(profile: ProjectProfile): Recommendation[] {
  const removed = new Set(profile.editors?.remove ?? [])
  const list = defaultRecommendations(profile).filter((r) => !removed.has(r.docId))
  const have = new Set(list.map((r) => r.docId))
  for (const docId of profile.editors?.add ?? []) {
    if (have.has(docId) || removed.has(docId) || !getModule(docId)) continue
    have.add(docId)
    list.push({ docId, reasons: [{ kind: 'manual' }] })
  }
  return list
}

/** True when the planner's group is shown for every genre (see ALWAYS_SHOWN_GROUPS). */
export const isAlwaysShownGroup = (group: ModuleGroup) => ALWAYS_SHOWN_GROUPS.includes(group)

/** True when genres decide which of the planner's group are shown (today: Game Design). */
export const isGenreDrivenModule = (docId: string) => {
  const mod = getModule(docId)
  return !!mod && !isAlwaysShownGroup(mod.group)
}

export type EditorEntry = { docId: string; recommended: boolean; reasons?: RecommendationReason[] }
export type EditorGroupView = {
  group: ModuleGroup
  label: string
  /** True when this group is narrowed to the recommendations (genre-driven group of a tailored profile). */
  filtered: boolean
  /** Planners of the group not listed because the genres don't recommend them. */
  hidden: number
  editors: EditorEntry[]
}

/**
 * Planners to show, per group, for a profile. Always-shown groups list every planner in registry order
 * (genre picks marked as recommended, with reasons). Genre-driven groups list only the recommendations,
 * in recommendation order, when a known genre is selected; without one, everything is shown unmarked.
 * Empty groups are left out. Pure, so the planner menu and a future side rail share it.
 */
export function editorGroups(profile: ProjectProfile): EditorGroupView[] {
  const tailored = hasGenreProfile(profile)
  const recs = tailored ? recommendEditors(profile) : []
  const byId = new Map(recs.map((r) => [r.docId, r]))
  return GROUPS.flatMap(({ id, label }): EditorGroupView[] => {
    const mods = MODULES.filter((m) => m.group === id)
    if (!mods.length) return []
    if (!tailored || isAlwaysShownGroup(id)) {
      const editors = mods.map((m) => ({ docId: m.id, recommended: byId.has(m.id), reasons: byId.get(m.id)?.reasons }))
      return [{ group: id, label, filtered: false, hidden: 0, editors }]
    }
    const editors = recs.filter((r) => getModule(r.docId)?.group === id).map((r) => ({ docId: r.docId, recommended: true, reasons: r.reasons }))
    return [{ group: id, label, filtered: true, hidden: mods.length - editors.length, editors }]
  })
}

/**
 * Order for onboarding hints: the recommendations first, then remaining general steps, so hints
 * never contradict the tailored guide. Editors the user removed are left out.
 */
export function onboardingOrder(project: Project): string[] {
  const profile = readProfile(project)
  const removed = new Set(profile.editors?.remove ?? [])
  const order = recommendEditors(profile).map((r) => r.docId)
  for (const d of GENERAL_ORDER) if (!order.includes(d) && !removed.has(d)) order.push(d)
  return order
}

// ---------- Profile edits (pure; call inside useStore.mutate so they are one undo step) ----------

const clean = (list: string[]) => [...new Set(list.map((s) => s.trim()).filter(Boolean))]

/** Ensures `meta.profile` exists and returns it (for use on an Immer draft). */
export function ensureProfile(project: Project): ProjectProfile {
  project.meta.profile ??= { version: PROFILE_VERSION, genres: [] }
  return project.meta.profile
}

/**
 * Sets genres and custom labels. Never deletes documents and keeps explicit editor overrides.
 * Unknown IDs already saved are kept unless the caller drops them explicitly.
 */
export function setGenres(project: Project, genres: string[], customGenres: string[] = []) {
  const p = ensureProfile(project)
  p.genres = clean(genres).slice(0, MAX_GENRES)
  const custom = clean(customGenres.map((c) => c.slice(0, MAX_CUSTOM_GENRE_LENGTH))).slice(0, MAX_CUSTOM_GENRES)
  if (custom.length) p.customGenres = custom
  else delete p.customGenres
}

/** Adds or removes one editor from the recommendations, recording only real deviations from the defaults. */
export function setEditorRecommended(project: Project, docId: string, on: boolean) {
  const p = ensureProfile(project)
  const defaults = new Set(defaultRecommendations(p).map((r) => r.docId))
  const add = new Set(p.editors?.add ?? [])
  const remove = new Set(p.editors?.remove ?? [])
  add.delete(docId)
  remove.delete(docId)
  if (on && !defaults.has(docId)) add.add(docId)
  if (!on && defaults.has(docId)) remove.add(docId)
  if (add.size || remove.size) p.editors = { ...p.editors, add: [...add], remove: [...remove] }
  else delete p.editors
}

export function restoreEditorDefaults(project: Project) {
  if (project.meta.profile) delete project.meta.profile.editors
}

export const hasEditorOverrides = (profile: ProjectProfile) =>
  !!(profile.editors?.add.length || profile.editors?.remove.length)

// ---------- Project guide ----------

export type ProjectGuideStep = ProjectGuideStepDef & {
  /** Selected genre IDs (or 'foundation') that added this step. */
  sources: string[]
  done: boolean
}

function stepDone(project: Project, step: ProjectGuideStepDef): boolean {
  const mod = getModule(step.docId)
  if (!mod) return false
  if (!step.section) return !isDocEmpty(project, step.docId)
  const sec = getSections(mod, project.registry).find((s) => s.id === step.section)
  if (!sec) return !isDocEmpty(project, step.docId)
  return !isSectionEmpty(sec, project.documents[step.docId]?.data[sec.id])
}

/**
 * Composes the guide: foundation steps plus each selected genre's steps, deduplicated by step ID,
 * ordered by priority then catalog order. Steps for missing modules or removed editors are skipped.
 * Completion is derived from project data only, so it survives genre changes and needs no extra state.
 */
export function composeProjectGuide(project: Project, steps: ProjectGuideStepDef[] = PROJECT_GUIDE_STEPS): ProjectGuideStep[] {
  const profile = readProfile(project)
  const selected = new Set(knownGenres(profile).map((g) => g.id))
  if (!selected.size) return []
  const removed = new Set(profile.editors?.remove ?? [])
  return steps
    .map((s, i) => ({ s, i, sources: s.genres.filter((g) => g === 'foundation' || selected.has(g)) }))
    .filter(({ s, sources }) => sources.length && getModule(s.docId) && !removed.has(s.docId))
    .sort((a, b) => a.s.priority - b.s.priority || a.i - b.i)
    .filter(({ s }, idx, arr) => arr.findIndex((x) => x.s.id === s.id) === idx)
    .map(({ s, sources }) => ({ ...s, sources, done: stepDone(project, s) }))
}
