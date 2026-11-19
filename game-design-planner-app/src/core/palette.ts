/**
 * The command palette's index and search (v3, plans/UI_V3_PLAN.md "Navigation model"): every planner, every
 * section and every named entry of a collection, so one search jumps anywhere. Pure; the UI adds its own
 * actions and pages and does the navigation.
 */
import type { Project } from './model/types'
import { getSections, GROUPS, MODULES } from './modules/registry'

export type PaletteKind = 'planner' | 'section' | 'entity' | 'page' | 'action'

export type PaletteItem = {
  id: string
  kind: PaletteKind
  label: string
  /** Where it lives ("Combat, Enemies & Bosses › Enemies"); searched too, with less weight. */
  detail?: string
  /** Route to open; actions run instead. */
  to?: string
  /** The planner it belongs to, for its icon. */
  doc?: string
}

/** `/doc/<id>?s=<section>&e=<entity>`: the editor opens the section and selects the entry. */
export const entityRoute = (docId: string, sectionId: string, entityId?: string) =>
  `/doc/${docId}?s=${encodeURIComponent(sectionId)}` + (entityId ? `&e=${encodeURIComponent(entityId)}` : '')

export function buildPaletteIndex(project: Project): PaletteItem[] {
  const out: PaletteItem[] = []
  for (const mod of MODULES) {
    const group = GROUPS.find((g) => g.id === mod.group)?.label
    out.push({ id: `p:${mod.id}`, kind: 'planner', label: mod.title, detail: group, to: `/doc/${mod.id}`, doc: mod.id })
    for (const sec of getSections(mod, project.registry)) {
      out.push({ id: `s:${mod.id}/${sec.id}`, kind: 'section', label: sec.title, detail: mod.title, to: entityRoute(mod.id, sec.id), doc: mod.id })
      if (sec.kind !== 'collection') continue
      const list = project.documents[mod.id]?.data[sec.id]
      if (!Array.isArray(list)) continue
      for (const e of list) {
        const name = typeof e?.name === 'string' ? e.name.trim() : ''
        if (!name || typeof e.id !== 'string') continue
        out.push({ id: `e:${mod.id}/${sec.id}/${e.id}`, kind: 'entity', label: name, detail: `${mod.title} › ${sec.title}`, to: entityRoute(mod.id, sec.id, e.id), doc: mod.id })
      }
    }
  }
  return out
}

const KIND_BOOST: Record<PaletteKind, number> = { planner: 6, page: 5, section: 4, action: 3, entity: 2 }

/** How well one query word matches a text: whole text, start, start of a word, anywhere; 0 = no match. */
function wordScore(text: string, word: string): number {
  if (text === word) return 100
  if (text.startsWith(word)) return 80
  if (text.split(/[^\p{L}\p{N}]+/u).some((w) => w.startsWith(word))) return 60
  return text.includes(word) ? 30 : 0
}

/**
 * Items whose label (or, weaker, detail) contains every word of the query, with at least one in the label;
 * best first. Ties keep the index
 * order, which is document order. An empty query returns the planners.
 */
export function searchPalette(items: PaletteItem[], query: string, limit = 30): PaletteItem[] {
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean)
  if (!words.length) return items.filter((i) => i.kind === 'planner' || i.kind === 'page').slice(0, limit)
  const scored: { item: PaletteItem; score: number; at: number }[] = []
  items.forEach((item, at) => {
    const label = item.label.toLowerCase()
    const detail = (item.detail ?? '').toLowerCase()
    let score = 0
    let inLabel = false
    for (const w of words) {
      const l = wordScore(label, w)
      const s = Math.max(l, wordScore(detail, w) / 4)
      if (!s) return
      inLabel ||= l > 0
      score += s
    }
    // The detail only narrows ("ghoul combat"); a match there alone would list every section of a planner.
    if (!inLabel) return
    scored.push({ item, score: score + KIND_BOOST[item.kind], at })
  })
  scored.sort((a, b) => b.score - a.score || a.at - b.at)
  return scored.slice(0, limit).map((s) => s.item)
}
