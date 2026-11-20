import type { CollectionSection, CollectionView, Entity, FieldDef, Project, SectionDef } from './model/types'
import { MODULES, getSections } from './modules/registry'
import { entityLabel } from './references/refs'
import { isSectionEmpty } from './hints/util'

/** Where an entry lives, so a reference to it can link there. */
export type BookPlace = { docId: string; sectionId: string; label: string }
/** One entry that points at another entry. */
export type BookUse = { docId: string; docTitle: string; sectionId: string; entityId: string; label: string }

export type BookIndex = { where: Map<string, BookPlace>; usedBy: Map<string, BookUse[]> }

/**
 * Locations of every collection entry and the reverse references to it, built in one pass
 * (a per-entry `findUsages` would rescan the whole project for each entry).
 */
export function bookIndex(project: Project): BookIndex {
  const where = new Map<string, BookPlace>()
  const usedBy = new Map<string, BookUse[]>()
  for (const m of MODULES) {
    const doc = project.documents[m.id]
    if (!doc) continue
    for (const sec of getSections(m, project.registry)) {
      if (sec.kind !== 'collection' || !Array.isArray(doc.data[sec.id])) continue
      for (const e of doc.data[sec.id] as Entity[]) {
        const label = entityLabel(e)
        where.set(e.id, { docId: m.id, sectionId: sec.id, label })
        for (const f of sec.fields) {
          const v = e[f.key]
          const ids = f.type === 'ref' ? (typeof v === 'string' && v ? [v] : []) : f.type === 'multiref' && Array.isArray(v) ? v : f.type === 'map' && v && typeof v === 'object' ? Object.keys(v) : []
          for (const id of ids) {
            const list = usedBy.get(id) ?? []
            if (!list.some((u) => u.entityId === e.id)) list.push({ docId: m.id, docTitle: m.title, sectionId: sec.id, entityId: e.id, label })
            usedBy.set(id, list)
          }
        }
      }
    }
  }
  return { where, usedBy }
}

/** Views that edit or simulate rather than show the data; the book never picks them. */
const NOT_FOR_BOOK = new Set<CollectionView['kind']>([
  'cards', 'table', 'kanban', 'wireframe', 'biomeDossier', 'locationMap', 'dataTester', 'codingNaming', 'combatSandbox', 'customSimulator', 'actionSimulator', 'buildPlanner', 'grid2d', 'timeline', 'ladder',
])

/** The section's first visual (diagram or chart) view, if it has one. */
export const bookVisual = (sec: CollectionSection): CollectionView | undefined => sec.views.find((v) => !NOT_FOR_BOOK.has(v.kind))

/** Sections that hold data, per planner; empty sections are left out of the book. */
export function filledSections(project: Project, docId: string): SectionDef[] {
  const m = MODULES.find((x) => x.id === docId)
  const doc = project.documents[docId]
  if (!m || !doc) return []
  return getSections(m, project.registry).filter((s) => !isSectionEmpty(s, doc.data[s.id]))
}

const blankValue = (v: unknown) => v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length) || (typeof v === 'object' && !Array.isArray(v) && !Object.keys(v as object).length)

/** The brief's opening text: the planner's first written answers (form text fields), at most `max`. */
export function briefLead(project: Project, docId: string, max = 2): { label: string; text: string }[] {
  const out: { label: string; text: string }[] = []
  for (const sec of filledSections(project, docId)) {
    if (sec.kind !== 'form') continue
    const data = project.documents[docId].data[sec.id] ?? {}
    for (const f of sec.fields)
      if ((f.type === 'longtext' || f.type === 'text') && f.key !== 'legacyNotes' && typeof data[f.key] === 'string' && data[f.key].trim()) {
        out.push({ label: f.label, text: data[f.key].trim() })
        if (out.length >= max) return out
      }
  }
  return out
}

/** Entry counts of the planner's filled collections, for the brief's number row. */
export function briefNumbers(project: Project, docId: string, max = 6): { label: string; value: number }[] {
  return filledSections(project, docId)
    .filter((s): s is CollectionSection => s.kind === 'collection')
    .map((s) => ({ label: s.title, value: (project.documents[docId].data[s.id] as unknown[]).length }))
    .slice(0, max)
}

/** The picture that best sums up a planner; used when its section holds data. */
const FEATURED: Record<string, string> = {
  'overview.roadmap': 'phases',
  'design.coreLoop': 'loopGraph',
  'design.factions': 'relationGraph',
  'design.world': 'biomes',
  'design.town': 'flow',
  'design.npc': 'archetypes',
  'design.player': 'skills',
  'design.items': 'recipes',
  'design.combat': 'enemies',
  'design.timeWeather': 'dayPhases',
  'design.trade': 'flows',
  'design.story': 'quests',
  'design.ui': 'flow',
  'technical.architecture': 'modules',
}

const drawable = (s: SectionDef) => s.kind === 'graph' || s.kind === 'canvas' || (s.kind === 'collection' && !!bookVisual(s))

/** The one figure the brief shows for a planner: the featured section, else its first diagram or chart. */
export function briefFigure(project: Project, docId: string): SectionDef | undefined {
  const filled = filledSections(project, docId)
  const featured = filled.find((s) => s.id === FEATURED[docId] && drawable(s))
  return featured ?? filled.find((s) => s.kind === 'graph' || s.kind === 'canvas') ?? filled.find(drawable)
}

/** Lists this long are printed as a table instead of one card per entry. */
export const TABLE_FROM = 6

/**
 * Columns for the appendix table: the section's own table-view columns (else its first fields),
 * keeping only fields some entry fills; every other filled field goes in a "More" column so no data is dropped.
 */
export function tableColumns(sec: CollectionSection, items: Entity[]): { main: FieldDef[]; rest: FieldDef[] } {
  const used = sec.fields.filter((f) => f.key !== 'name' && f.key !== 'legacyNotes' && items.some((e) => !blankValue(e[f.key])))
  const preferred = sec.views.find((v): v is Extract<CollectionView, { kind: 'table' }> => v.kind === 'table')?.columns?.filter((k) => k !== 'name')
  const main = (preferred?.length ? preferred.map((k) => used.find((f) => f.key === k)).filter((f): f is FieldDef => !!f) : used.filter((f) => f.type !== 'longtext' && f.type !== 'checklist')).slice(0, 6)
  return { main, rest: used.filter((f) => !main.includes(f)) }
}

/** Headline counts for the book's summary page; only counts that are above zero. */
export function bookStats(project: Project): { label: string; value: number }[] {
  const n = (doc: string, sec: string) => {
    const v = project.documents[doc]?.data[sec]
    return Array.isArray(v) ? v.length : 0
  }
  const stats = [
    { label: 'Biomes', value: n('design.world', 'biomes') },
    { label: 'Locations', value: n('design.world', 'locations') },
    { label: 'Factions', value: n('design.factions', 'factions') },
    { label: 'Townspeople types', value: n('design.npc', 'archetypes') },
    { label: 'Buildings', value: n('design.town', 'buildings') },
    { label: 'Items', value: n('design.items', 'items') },
    { label: 'Recipes', value: n('design.items', 'recipes') },
    { label: 'Enemies', value: n('design.combat', 'enemies') },
    { label: 'Bosses', value: n('design.combat', 'bosses') },
    { label: 'Skills', value: n('design.player', 'skills') },
    { label: 'Quests', value: n('design.story', 'quests') },
    { label: 'Screens', value: n('design.ui', 'screens') },
  ]
  return stats.filter((s) => s.value > 0)
}
