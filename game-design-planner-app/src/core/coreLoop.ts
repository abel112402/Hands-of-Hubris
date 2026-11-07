import type { Entity, GraphData, Project } from './model/types'
import { TIME_DOC } from './timeWeather'

/**
 * Core Loop planning numbers: link direction, pacing between nested loops, pillar coverage.
 * Rough planning aids from the entered cycle lengths, not a simulation of play.
 */
export const CORE_LOOP_DOC = 'design.coreLoop'
const VISION_DOC = 'overview.vision'
export const SCALES = ['Moment-to-moment', 'Short (minutes)', 'Medium (hours / days)', 'Long (campaign)'] as const

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined)
const ids = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])

export const loopList = (p: Project): Entity[] => {
  const d = p.documents[CORE_LOOP_DOC]?.data.loops
  return Array.isArray(d) ? d : []
}
export const loopGraph = (p: Project): GraphData => p.documents[CORE_LOOP_DOC]?.data.loopGraph ?? { nodes: [], edges: [] }

/** Index in SCALES, or -1 for a loop with no (or an unknown) scale. */
export const scaleIndex = (e: Entity) => SCALES.indexOf(e.scale)

/** True when following the edges from some node leads back to it, i.e. the diagram contains a feedback loop. */
export function hasFeedback(g: GraphData): boolean {
  const next = new Map<string, string[]>()
  for (const e of g.edges) next.set(e.source, [...(next.get(e.source) ?? []), e.target])
  const state = new Map<string, 1 | 2>()
  const visit = (id: string): boolean => {
    if (state.get(id) === 1) return true
    if (state.get(id) === 2) return false
    state.set(id, 1)
    const found = (next.get(id) ?? []).some(visit)
    state.set(id, 2)
    return found
  }
  return g.nodes.some((n) => visit(n.id))
}

export type LoopLink = { from: Entity; to: Entity }

/** "Builds toward" links whose target is not on a longer time scale (both scales set). */
export function wrongDirection(p: Project): LoopLink[] {
  const loops = loopList(p)
  const byId = new Map(loops.map((l) => [l.id, l]))
  const out: LoopLink[] = []
  for (const from of loops) {
    for (const id of ids(from.leadsTo)) {
      const to = byId.get(id)
      if (!to || scaleIndex(from) < 0 || scaleIndex(to) < 0) continue
      if (scaleIndex(to) <= scaleIndex(from)) out.push({ from, to })
    }
  }
  return out
}

export type PacingLink = { to: Entity; ratio: number; inverted: boolean }
export type LoopPacing = { loop: Entity; minutes?: number; /** In-game days per cycle, when Time & Weather sets a day length. */ days?: number; links: PacingLink[] }

/** Real minutes of one in-game day from Time & Weather, if set. */
export const dayLength = (p: Project) => num(p.documents[TIME_DOC]?.data.time?.dayLength)

/**
 * Per loop: its cycle length, the same in in-game days, and for each longer loop it builds toward how many of its
 * cycles fit into one of that loop's (ratio). `inverted` marks a target that is not longer than the loop itself.
 * Sorted by scale, then length.
 */
export function loopPacing(p: Project): LoopPacing[] {
  const loops = loopList(p)
  const byId = new Map(loops.map((l) => [l.id, l]))
  const day = dayLength(p)
  const rank = (e: Entity) => (scaleIndex(e) < 0 ? SCALES.length : scaleIndex(e))
  return [...loops]
    .sort((a, b) => rank(a) - rank(b) || (num(a.cycleMinutes) ?? Infinity) - (num(b.cycleMinutes) ?? Infinity))
    .map((loop) => {
      const minutes = num(loop.cycleMinutes)
      const links: PacingLink[] = []
      for (const id of ids(loop.leadsTo)) {
        const to = byId.get(id)
        const target = to && num(to.cycleMinutes)
        if (!to || minutes === undefined || target === undefined) continue
        links.push({ to, ratio: target / minutes, inverted: target <= minutes })
      }
      return { loop, minutes, days: minutes !== undefined && day ? minutes / day : undefined, links }
    })
}

export type PillarLoops = { pillar: Entity; loops: Entity[] }

/** Vision pillars with the loops that serve them. */
export function pillarLoops(p: Project): PillarLoops[] {
  const pillars = p.documents[VISION_DOC]?.data.pillars
  const loops = loopList(p)
  return (Array.isArray(pillars) ? (pillars as Entity[]) : []).map((pillar) => ({ pillar, loops: loops.filter((l) => ids(l.pillars).includes(pillar.id)) }))
}

/** Readable real time: seconds, minutes, hours or days. */
export function formatMinutes(m: number): string {
  const r = (n: number) => (Math.round(n * 10) / 10).toString()
  if (m < 1) return `${r(m * 60)} s`
  if (m < 60) return `${r(m)} min`
  if (m < 1440) return `${r(m / 60)} h`
  return `${r(m / 1440)} d`
}
