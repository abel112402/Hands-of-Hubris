/**
 * The Atlas (v3 home, plans/UI_V3_PLAN.md "Screen 1"): the project's planners as landmarks in five phase
 * regions, the links between planners from their system maps, the walkthrough as a route across them, and fog
 * over the phases not reached yet. Pure: a layout in a fixed 1200 × 680 box that the page scales.
 */
import { MODULES } from './modules/registry'
import type { Project } from './model/types'
import type { GuideMap } from './guides/types'
import { compassPhases } from './compass'
import { PHASES, type PhaseId, type Walkthrough } from './walkthrough/types'

export const ATLAS_W = 1200
export const ATLAS_H = 680

/** Region boxes, sized for the planners each phase holds (3, 12, 5, 14, 4 in the default registry). */
export const REGIONS: Record<PhaseId, { x: number; y: number; w: number; h: number }> = {
  concept: { x: 20, y: 30, w: 260, h: 300 },
  systems: { x: 300, y: 30, w: 540, h: 300 },
  content: { x: 860, y: 30, w: 320, h: 300 },
  production: { x: 20, y: 360, w: 760, h: 300 },
  ship: { x: 800, y: 360, w: 380, h: 300 },
}

export type AtlasLandmark = { id: string; title: string; phase: PhaseId; x: number; y: number; progress: number }
export type AtlasRegion = { phase: PhaseId; x: number; y: number; w: number; h: number; progress: number; fog: boolean }
export type AtlasSegment = { from: string; to: string; walked: boolean }
export type Atlas = {
  regions: AtlasRegion[]
  landmarks: AtlasLandmark[]
  /** Planners that feed each other (from the system maps' "other planner" nodes), each pair once. */
  links: { from: string; to: string }[]
  /** The walkthrough's path across planners; segments up to the current step are walked. */
  route: AtlasSegment[]
  /** The planner of the walkthrough's next step. */
  here?: string
  explored: number
}

/** First walkthrough position of each planner, for ordering landmarks and the route. */
function firstVisits(walk: Pick<Walkthrough, 'steps'>): string[] {
  const seen: string[] = []
  for (const s of walk.steps) {
    const d = s.target?.docId
    if (d && !seen.includes(d) && MODULES.some((m) => m.id === d)) seen.push(d)
  }
  return seen
}

/** Each pair of planners joined in some system map, once, in the direction the map draws it. */
export function plannerLinks(guides: Record<string, { map: GuideMap } | undefined>): { from: string; to: string }[] {
  const out: { from: string; to: string }[] = []
  const has = (a: string, b: string) => out.some((l) => (l.from === a && l.to === b) || (l.from === b && l.to === a))
  const known = new Set(MODULES.map((m) => m.id))
  for (const [docId, guide] of Object.entries(guides)) {
    if (!guide || !known.has(docId)) continue
    const doc = (id: string) => guide.map.nodes.find((n) => n.id === id)?.doc ?? docId
    for (const e of guide.map.edges) {
      const [a, b] = [doc(e.from), doc(e.to)]
      if (a !== b && known.has(a) && known.has(b) && !has(a, b)) out.push({ from: a, to: b })
    }
  }
  return out
}

export function buildAtlas(project: Project, walk: Pick<Walkthrough, 'steps'>, guides: Record<string, { map: GuideMap } | undefined>, next?: { target?: { docId: string } }): Atlas {
  const visits = firstVisits(walk)
  const order = (id: string) => {
    const i = visits.indexOf(id)
    return i < 0 ? visits.length + MODULES.findIndex((m) => m.id === id) : i
  }
  const here = next?.target?.docId
  const hereAt = here ? visits.indexOf(here) : -1
  const groups = compassPhases(project, walk)
  const herePhase = groups.find((g) => g.planners.some((p) => p.id === here))?.phase
  const landmarks: AtlasLandmark[] = []
  const regions: AtlasRegion[] = groups.map((g) => {
    const box = REGIONS[g.phase]
    const planners = [...g.planners].sort((a, b) => order(a.id) - order(b.id))
    // A grid inside the region, below its label, roughly as wide as the box is.
    const cols = Math.max(1, Math.ceil(Math.sqrt((planners.length * box.w) / box.h)))
    const rows = Math.max(1, Math.ceil(planners.length / cols))
    const top = box.y + 48
    const cw = box.w / cols
    const ch = (box.h - 64) / rows
    planners.forEach((p, i) => landmarks.push({ id: p.id, title: p.title, phase: g.phase, x: Math.round(box.x + cw * (i % cols) + cw / 2), y: Math.round(top + ch * Math.floor(i / cols) + ch / 2), progress: p.progress }))
    // Fog: nothing started here, and the walkthrough has not reached this phase yet.
    const reached = herePhase ? PHASES.indexOf(g.phase) <= PHASES.indexOf(herePhase) : true
    return { phase: g.phase, ...box, progress: g.progress, fog: !reached && g.planners.every((p) => p.progress === 0) }
  })
  const route: AtlasSegment[] = []
  for (let i = 1; i < visits.length; i++) route.push({ from: visits[i - 1], to: visits[i], walked: hereAt >= 0 && i <= hereAt })
  const explored = landmarks.length ? Math.round(landmarks.reduce((n, l) => n + l.progress, 0) / landmarks.length) : 0
  return { regions, landmarks, links: plannerLinks(guides), route, here, explored }
}
