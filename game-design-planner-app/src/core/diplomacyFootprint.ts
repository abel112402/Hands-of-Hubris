import type { Entity, Project } from './model/types'
import { findUsages, type Usage } from './references/refs'
import { DIPLOMACY_DOC, factionsOf } from './diplomacy'

/**
 * Where each faction shows up across the project. Kept apart from `diplomacy.ts` because `findUsages` walks every
 * module definition, which would make the module registry depend on this file's imports.
 */
export type FootprintGroup = { docId: string; docTitle: string; usages: Usage[] }
export type Footprint = {
  faction: Entity
  /** Inside Factions & Diplomacy: actions that target the faction and endings that involve it. */
  actions: number
  endings: number
  characters: number
  unlocks: number
  /** Other modules that reference the faction, grouped by module. */
  elsewhere: FootprintGroup[]
  /** Number of references outside this module. */
  outside: number
}

const len = (v: unknown) => (Array.isArray(v) ? v.length : 0)

export function factionFootprints(project: Project): Footprint[] {
  return factionsOf(project).map((f) => {
    const usages = findUsages(project, f.id)
    const own = usages.filter((u) => u.docId === DIPLOMACY_DOC)
    const groups = new Map<string, FootprintGroup>()
    for (const u of usages) {
      if (u.docId === DIPLOMACY_DOC) continue
      const g = groups.get(u.docId) ?? { docId: u.docId, docTitle: u.docTitle, usages: [] }
      g.usages.push(u)
      groups.set(u.docId, g)
    }
    const elsewhere = [...groups.values()]
    return {
      faction: f,
      actions: own.filter((u) => u.sectionId === 'actions' && u.field === 'Faction').length,
      endings: own.filter((u) => u.sectionId === 'endings').length,
      characters: len(f.characters),
      unlocks: len(f.unlocks),
      elsewhere,
      outside: elsewhere.reduce((n, g) => n + g.usages.length, 0),
    }
  })
}

/** Factions no other module references, only once at least one faction is referenced elsewhere. */
export function unlinkedFactions(project: Project): Entity[] {
  const fp = factionFootprints(project)
  if (!fp.some((x) => x.outside > 0)) return []
  return fp.filter((x) => x.outside === 0).map((x) => x.faction)
}
