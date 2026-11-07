import type { Entity, Project } from './model/types'

export const VISION_DOC = 'overview.vision'
export const PILLAR_RANGE = [3, 5] as const
export const SCOPE_BUCKETS = ['In MVP', 'Later', 'Out of scope'] as const

const sectionList = (p: Project, id: string): Entity[] => {
  const d = p.documents[VISION_DOC]?.data[id]
  return Array.isArray(d) ? d : []
}
const formField = (p: Project, sectionId: string, key: string): string => {
  const v = p.documents[VISION_DOC]?.data[sectionId]?.[key]
  return typeof v === 'string' ? v.trim() : ''
}
const ids = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])

export const pillarList = (p: Project) => sectionList(p, 'pillars')
export const uspList = (p: Project) => sectionList(p, 'usps')
export const scopeList = (p: Project) => sectionList(p, 'scope')

export type PillarCoverage = { pillar: Entity; scope: Entity[]; mvp: Entity[]; usps: Entity[]; unused: boolean; notInMvp: boolean }

/** Per pillar: which scope items and USPs point at it. Planning aid, not a verdict. */
export function pillarCoverage(p: Project): PillarCoverage[] {
  const scope = scopeList(p)
  const usps = uspList(p)
  return pillarList(p).map((pillar) => {
    const s = scope.filter((e) => ids(e.pillars).includes(pillar.id))
    const u = usps.filter((e) => ids(e.pillars).includes(pillar.id))
    const mvp = s.filter((e) => e.bucket === 'In MVP')
    return { pillar, scope: s, mvp, usps: u, unused: s.length === 0 && u.length === 0, notInMvp: mvp.length === 0 }
  })
}

/** Scope items whose pillars list is empty or only names pillars that no longer exist. */
export function scopeWithoutPillar(p: Project): Entity[] {
  const known = new Set(pillarList(p).map((e) => e.id))
  return scopeList(p).filter((e) => !ids(e.pillars).some((id) => known.has(id)))
}

export function uspWithoutPillar(p: Project): Entity[] {
  const known = new Set(pillarList(p).map((e) => e.id))
  return uspList(p).filter((e) => !ids(e.pillars).some((id) => known.has(id)))
}

export function scopeCounts(p: Project): Record<(typeof SCOPE_BUCKETS)[number] | 'Undecided', number> {
  const out = { 'In MVP': 0, Later: 0, 'Out of scope': 0, Undecided: 0 }
  for (const e of scopeList(p)) {
    const b = e.bucket as keyof typeof out
    if (b in out && b !== 'Undecided') out[b]++
    else out.Undecided++
  }
  return out
}

export type PitchCheck = { words: number; problems: ('empty' | 'short' | 'long' | 'multiSentence' | 'noGoal')[] }

/** Rough shape check of the one-sentence pitch (heuristic, English text). */
export function pitchCheck(text: string): PitchCheck {
  const t = text.trim()
  if (!t) return { words: 0, problems: ['empty'] }
  const words = t.split(/\s+/).length
  const problems: PitchCheck['problems'] = []
  if (words < 8) problems.push('short')
  if (words > 40) problems.push('long')
  if ((t.replace(/\.\.\./g, '').match(/[.!?](\s+|$)/g) ?? []).length > 1) problems.push('multiSentence')
  if (!/\b(in order to|to|so that|so they|so you|while|and)\b/i.test(t) && words >= 8) problems.push('noGoal')
  return { words, problems }
}

export type ReadinessItem = { sectionId: string; filled: boolean }

/** The nine chapters of the vision doc, filled yes/no. */
export function visionReadiness(p: Project): ReadinessItem[] {
  const form = (sectionId: string) => {
    const d = p.documents[VISION_DOC]?.data[sectionId]
    return !!d && typeof d === 'object' && Object.values(d).some((v) => typeof v === 'string' && v.trim() !== '')
  }
  return [
    { sectionId: 'pitch', filled: formField(p, 'pitch', 'pitch') !== '' },
    { sectionId: 'references', filled: form('references') },
    { sectionId: 'audience', filled: form('audience') },
    { sectionId: 'usps', filled: uspList(p).length > 0 },
    { sectionId: 'pillars', filled: pillarList(p).length > 0 },
    { sectionId: 'tone', filled: form('tone') },
    { sectionId: 'scope', filled: scopeList(p).length > 0 },
    { sectionId: 'platform', filled: form('platform') },
    { sectionId: 'monetization', filled: form('monetization') },
  ]
}
