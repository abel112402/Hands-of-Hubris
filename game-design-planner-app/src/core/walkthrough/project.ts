/**
 * Glue between the walkthrough engine, the genre profile and the content registry.
 */
import { BASE_PACK, GENRE_PACKS } from '../../modules/walkthroughs'
import { guideOf } from '../../modules/guides'
import { knownGenres, readProfile } from '../genre'
import { getModule, getSections } from '../modules/registry'
import { createProject } from '../model/project'
import { composeWalkthrough } from './compose'
import type { BasePack, DoneRule, GenrePack, Walkthrough, WalkStep, WalkTarget } from './types'
import type { Project } from '../model/types'

const cache = new Map<string, Walkthrough>()

/**
 * The project's walkthrough: base plus the packs of its selected catalog genres, in selection order.
 * No genre, custom genres and genres without a pack get the base walkthrough. Cached per genre list,
 * since composition depends only on the genres and the (static) packs.
 */
export function projectWalkthrough(project: Project, packs: Record<string, GenrePack> = GENRE_PACKS, base: BasePack = BASE_PACK): Walkthrough {
  const genres = knownGenres(readProfile(project)).map((g) => g.id).filter((id) => packs[id])
  if (packs !== GENRE_PACKS || base !== BASE_PACK) return composeWalkthrough(base, genres.map((id) => packs[id]))
  const key = genres.join(',')
  let w = cache.get(key)
  if (!w) {
    w = composeWalkthrough(base, genres.map((id) => packs[id]))
    cache.set(key, w)
  }
  return w
}

/** Link for a step's "Open" action, or undefined when it has no (known) target. */
export function stepLink(target: WalkTarget | undefined): string | undefined {
  if (!target || !getModule(target.docId)) return undefined
  return `/doc/${target.docId}${target.section ? `?s=${encodeURIComponent(target.section)}` : ''}`
}

// ---------- Referential validation of content (used by tests and before using imported packs) ----------

const emptyRegistry = () => createProject('validate', false).registry

function checkTarget(where: string, docId: string, section: string | undefined, errors: string[]) {
  const mod = getModule(docId)
  if (!mod) return void errors.push(`${where}: unknown planner ${docId}`)
  if (section && !getSections(mod, emptyRegistry()).some((s) => s.id === section)) errors.push(`${where}: unknown section ${docId}/${section}`)
}

function checkRule(where: string, rule: DoneRule, errors: string[]) {
  switch (rule.kind) {
    case 'sectionFilled':
      return checkTarget(where, rule.docId, rule.section, errors)
    case 'moduleStep':
      if (!guideOf(rule.docId)?.steps.some((s) => s.id === rule.stepId)) errors.push(`${where}: unknown module step ${rule.docId}#${rule.stepId}`)
      return
    case 'all':
    case 'any':
      return rule.rules.forEach((r) => checkRule(where, r, errors))
  }
}

function checkStep(s: Partial<WalkStep>, where: string, chapters: Set<string>, errors: string[]) {
  if (s.chapter && !chapters.has(s.chapter)) errors.push(`${where}: unknown chapter ${s.chapter}`)
  if (s.target) checkTarget(where, s.target.docId, s.target.section, errors)
  if (s.target?.moduleStep && !guideOf(s.target.docId)?.steps.some((x) => x.id === s.target!.moduleStep)) errors.push(`${where}: unknown module step ${s.target.moduleStep}`)
  if (s.done) checkRule(where, s.done, errors)
  for (const e of s.examples ?? []) if (!guideOf(e.docId)?.examples.some((x) => x.id === e.exampleId)) errors.push(`${where}: unknown example ${e.docId}#${e.exampleId}`)
}

/**
 * Checks a pack against the registry, module guides and the base: planners, sections, module steps,
 * examples, chapters, anchors and references to existing steps. Returns readable errors (empty = valid).
 */
export function validatePack(pack: BasePack | GenrePack, base: BasePack = BASE_PACK): string[] {
  const errors: string[] = []
  const chapters = new Set([...base.chapters, ...(pack.chapters ?? [])].map((c) => c.id))
  if ('steps' in pack) {
    const ids = pack.steps.map((s) => s.id)
    if (new Set(ids).size !== ids.length) errors.push('base: duplicate step IDs')
    for (const s of pack.steps) checkStep(s, s.id, chapters, errors)
    return errors
  }
  const known = new Set(base.steps.map((s) => s.id))
  for (const g of pack.insert ?? []) {
    if (!known.has(g.after)) errors.push(`${pack.id}: unknown anchor ${g.after}`)
    for (const s of g.steps) {
      checkStep(s, `${pack.id}/${s.id}`, chapters, errors)
      known.add(s.id)
    }
  }
  for (const [id, patch] of Object.entries(pack.replace ?? {})) {
    if (!known.has(id)) errors.push(`${pack.id}: replace of unknown step ${id}`)
    checkStep(patch, `${pack.id}/replace/${id}`, chapters, errors)
  }
  for (const id of [...Object.keys(pack.notes ?? {}), ...(pack.remove ?? [])]) if (!known.has(id)) errors.push(`${pack.id}: unknown step ${id}`)
  return errors
}
