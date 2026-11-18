/**
 * Hubi, the mascot: one character in eight costumes (see plans/MASCOT_PLAN.md). Each planner area has a
 * costume, so the line next to it sounds like that area's expert. Pure data; the pictures live in src/ui/mascots.
 */
import { getModule } from '../modules/registry'
import type { ModuleGroup } from '../model/types'
import type { TimeBucket } from '../flavor/easter'
import { hashString } from '../flavor/pick'

export const COSTUMES = ['wizard', 'scientist', 'knight', 'farmer', 'smith', 'pirate', 'suit', 'zombie'] as const
export type CostumeId = (typeof COSTUMES)[number]

export const isCostume = (v: unknown): v is CostumeId => typeof v === 'string' && (COSTUMES as readonly string[]).includes(v)

/** Planner → costume. Planners not listed fall back to their group's costume. */
const BY_DOC: Record<string, CostumeId> = {
  'overview.vision': 'wizard',
  'overview.glossary': 'wizard',
  'overview.roadmap': 'suit',
  'design.story': 'wizard',
  'design.openQuestions': 'wizard',
  'design.difficulty': 'scientist',
  'design.combat': 'knight',
  'design.player': 'knight',
  'design.factions': 'knight',
  'design.coreLoop': 'farmer',
  'design.town': 'farmer',
  'design.npc': 'farmer',
  'design.timeWeather': 'farmer',
  'design.items': 'smith',
  'design.trade': 'pirate',
  'design.world': 'pirate',
  'design.ui': 'scientist',
  'technical.dataDriven': 'scientist',
  'technical.performance': 'scientist',
  'technical.ai': 'scientist',
  'production.release': 'pirate',
}

const BY_GROUP: Record<ModuleGroup, CostumeId> = {
  overview: 'suit',
  design: 'farmer',
  technical: 'smith',
  artAudio: 'pirate',
  production: 'suit',
  qa: 'scientist',
  templates: 'suit',
  custom: 'suit',
}

/** The costume Hubi wears in a planner. Unknown ids get the suit: he is the host. */
export function costumeFor(docId: string | undefined): CostumeId {
  if (!docId) return 'suit'
  const own = BY_DOC[docId]
  if (own) return own
  const group = getModule(docId)?.group
  return group ? BY_GROUP[group] : 'suit'
}

/** Who announces a flavor moment: milestones by their planner, the rest by mood. */
export function costumeForMoment(key: string, docId?: string): CostumeId {
  if (key === 'flavor.welcomeBack' || key === 'flavor.undoSpree' || key === 'flavor.brandClicks') return 'zombie'
  if (key === 'flavor.phaseDone') return 'suit'
  if (key === 'flavor.konami') return 'wizard'
  return costumeFor(docId)
}

/** The costume for the time-of-day greeting (buckets from src/core/flavor/easter.ts). */
const BY_TIME = {
  night: 'zombie',
  morning: 'farmer',
  afternoon: 'scientist',
  fridayAfternoon: 'suit',
  evening: 'wizard',
  weekend: 'pirate',
} as const satisfies Record<TimeBucket, CostumeId>

export const costumeForTime = (bucket: TimeBucket): CostumeId => BY_TIME[bucket]

/** A costume for a loading screen: stable for one seed (a day), different between days. */
export const costumeForSeed = (seed: string): CostumeId => COSTUMES[hashString(seed) % COSTUMES.length]

/**
 * April Fools' Day: Hubi turns up in the wrong costume (the suit in Combat, the zombie in Vision…).
 * A fixed shift, so every planner gets a different, never correct, costume.
 */
export function wrongCostume(costume: CostumeId): CostumeId {
  const i = COSTUMES.indexOf(costume)
  return COSTUMES[(i + 3) % COSTUMES.length]
}
