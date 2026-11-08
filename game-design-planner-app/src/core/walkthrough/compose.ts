/**
 * Composes the project walkthrough: the base pack plus each selected genre pack, in selection order.
 * Pure and deterministic (no registry, no storage), so it can run anywhere and is cheap to test.
 */
import { PHASES, type BasePack, type ChapterDef, type ComposedStep, type GenrePack, type I18nText, type Walkthrough, type WalkStep } from './types'

/** Resolves content text for a language, falling back to English. */
export const textOf = (text: I18nText, lang = 'en'): string => (typeof text === 'string' ? text : text[lang] || text.en)

const fresh = (s: WalkStep, source: string): ComposedStep => ({ ...s, sources: [source], notes: [] })
const addSource = (s: ComposedStep, source: string) => {
  if (!s.sources.includes(source)) s.sources.push(source)
}

/**
 * - `insert` places new steps after their anchor (consecutive steps of one insert stay together).
 *   A step ID that already exists is merged: the first definition wins, later tips become notes.
 *   A missing anchor appends the step at the end of its phase.
 * - `replace` overrides fields of existing steps; `notes` attaches genre tips to existing steps.
 * - `remove` drops a step only when every applied pack removes it, so one genre never hides a step
 *   another selected genre relies on.
 * Final order: phase, then chapter (declaration order), then position.
 */
export function composeWalkthrough(base: BasePack, packs: GenrePack[]): Walkthrough {
  const steps: ComposedStep[] = base.steps.map((s) => fresh(s, 'base'))
  const chapters: ChapterDef[] = [...base.chapters]
  const removeVotes = new Map<string, number>()
  const find = (id: string) => steps.find((s) => s.id === id)

  for (const pack of packs) {
    for (const c of pack.chapters ?? []) if (!chapters.some((x) => x.id === c.id)) chapters.push(c)

    for (const group of pack.insert ?? []) {
      let anchor = group.after
      for (const s of group.steps) {
        const existing = find(s.id)
        if (existing) {
          addSource(existing, pack.id)
          for (const tip of s.tips ?? []) existing.notes.push({ source: pack.id, text: tip })
        } else {
          const at = steps.findIndex((x) => x.id === anchor)
          const lastOfPhase = steps.map((x) => x.phase).lastIndexOf(s.phase)
          const index = at >= 0 ? at + 1 : lastOfPhase >= 0 ? lastOfPhase + 1 : steps.length
          steps.splice(index, 0, fresh(s, pack.id))
        }
        anchor = s.id
      }
    }

    for (const [id, patch] of Object.entries(pack.replace ?? {})) {
      const s = find(id)
      if (!s) continue
      Object.assign(s, patch, { id })
      addSource(s, pack.id)
    }

    for (const [id, tips] of Object.entries(pack.notes ?? {})) {
      const s = find(id)
      if (!s) continue
      for (const text of tips) s.notes.push({ source: pack.id, text })
      addSource(s, pack.id)
    }

    for (const id of new Set(pack.remove ?? [])) removeVotes.set(id, (removeVotes.get(id) ?? 0) + 1)
  }

  const kept = steps.filter((s) => !(packs.length && removeVotes.get(s.id) === packs.length))
  const phaseIdx = (p: string) => PHASES.indexOf(p as (typeof PHASES)[number])
  const chapterIdx = (id: string) => {
    const i = chapters.findIndex((c) => c.id === id)
    return i < 0 ? chapters.length : i
  }
  const ordered = kept
    .map((s, pos) => ({ s, pos }))
    .sort((a, b) => phaseIdx(a.s.phase) - phaseIdx(b.s.phase) || chapterIdx(a.s.chapter) - chapterIdx(b.s.chapter) || a.pos - b.pos)
    .map(({ s }) => s)

  return {
    packs: Object.fromEntries([['base', base.version], ...packs.map((p) => [p.id, p.version])]),
    chapters,
    steps: ordered,
  }
}

/** Steps grouped for display: phase → chapter → steps. Empty phases and chapters are left out. */
export function groupWalkthrough(w: Walkthrough) {
  return PHASES.map((phase) => {
    const inPhase = w.steps.filter((s) => s.phase === phase)
    const chapterIds = [...new Set(inPhase.map((s) => s.chapter))]
    return {
      phase,
      chapters: chapterIds.map((id) => ({
        id,
        title: w.chapters.find((c) => c.id === id)?.title ?? id,
        steps: inPhase.filter((s) => s.chapter === id),
      })),
    }
  }).filter((p) => p.chapters.length)
}
