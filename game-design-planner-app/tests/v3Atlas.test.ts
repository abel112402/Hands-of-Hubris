import { describe, expect, it } from 'vitest'
import { ATLAS_H, ATLAS_W, buildAtlas, plannerLinks } from '../src/core/atlas'
import { emblemState, figureFor, RANK_AT } from '../src/core/emblem'
import { createProject } from '../src/core/model/project'
import { MODULES } from '../src/core/modules/registry'
import { evaluateWalkthrough } from '../src/core/walkthrough/evaluate'
import { projectWalkthrough } from '../src/core/walkthrough/project'
import { PHASES } from '../src/core/walkthrough/types'
import { GUIDES } from '../src/modules/guides'

function atlasOf(p = createProject('Atlas')) {
  const walk = projectWalkthrough(p)
  return { atlas: buildAtlas(p, walk, GUIDES, evaluateWalkthrough(walk, p).next), walk }
}

describe('atlas layout', () => {
  it('places every planner once, inside its phase region and the map', () => {
    const { atlas } = atlasOf()
    expect(atlas.landmarks.map((l) => l.id).sort()).toEqual(MODULES.map((m) => m.id).sort())
    for (const l of atlas.landmarks) {
      const r = atlas.regions.find((x) => x.phase === l.phase)!
      expect(l.x, l.id).toBeGreaterThan(r.x)
      expect(l.x, l.id).toBeLessThan(r.x + r.w)
      expect(l.y, l.id).toBeGreaterThan(r.y)
      expect(l.y, l.id).toBeLessThan(r.y + r.h)
      expect(l.x).toBeLessThan(ATLAS_W)
      expect(l.y).toBeLessThan(ATLAS_H)
    }
    // No two landmarks on the same spot.
    expect(new Set(atlas.landmarks.map((l) => `${l.x},${l.y}`)).size).toBe(atlas.landmarks.length)
  })

  it('draws the walkthrough route through planners in order and walks it up to the next step', () => {
    const { atlas } = atlasOf()
    expect(atlas.route.length).toBeGreaterThan(0)
    for (let i = 1; i < atlas.route.length; i++) expect(atlas.route[i].from).toBe(atlas.route[i - 1].to)
    expect(atlas.here).toBeTruthy()
    const walkedTo = atlas.route.filter((s) => s.walked).map((s) => s.to)
    if (walkedTo.length) expect(walkedTo[walkedTo.length - 1]).toBe(atlas.here)
  })

  it('fogs only phases with nothing started that the walkthrough has not reached', () => {
    const { atlas } = atlasOf()
    const herePhase = atlas.landmarks.find((l) => l.id === atlas.here)!.phase
    for (const r of atlas.regions) {
      if (!r.fog) continue
      expect(PHASES.indexOf(r.phase)).toBeGreaterThan(PHASES.indexOf(herePhase))
      expect(atlas.landmarks.filter((l) => l.phase === r.phase).every((l) => l.progress === 0)).toBe(true)
    }
  })

  it('links planners that system maps join, each pair once', () => {
    const links = plannerLinks(GUIDES)
    expect(links.length).toBeGreaterThan(0)
    const pairs = links.map((l) => [l.from, l.to].sort().join('|'))
    expect(new Set(pairs).size).toBe(pairs.length)
    expect(links.every((l) => l.from !== l.to)).toBe(true)
    // Combat's system map reaches the World planner.
    expect(pairs).toContain(['design.combat', 'design.world'].sort().join('|'))
  })
})

describe('design emblem', () => {
  it('picks the figure from the first known genre', () => {
    expect(figureFor([])).toBe('knight')
    expect(figureFor(['survival', 'rpg'])).toBe('camp')
    expect(figureFor(['unknown', 'strategy'])).toBe('castle')
  })

  it('fills parts by phase progress and ranks by the explored share', () => {
    const s = emblemState(['rpg'], { concept: 100, systems: 40 }, 12)
    expect(s.parts.concept).toBe(1)
    expect(s.parts.systems).toBeCloseTo(0.4)
    expect(s.parts.ship).toBe(0)
    expect(s.rank).toBe(1)
    expect(s.nextRankAt).toBe(RANK_AT[2])
    expect(s.nextPart).toBe('systems')
    const top = emblemState([], Object.fromEntries(PHASES.map((p) => [p, 100])), 90)
    expect(top.rank).toBe(RANK_AT.length - 1)
    expect(top.nextRankAt).toBeUndefined()
    expect(top.nextPart).toBeUndefined()
  })
})
