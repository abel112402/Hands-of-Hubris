import { describe, expect, it } from 'vitest'
import { collectHints, makeContext } from '../src/core/hints/engine'
import { createProject, makeId } from '../src/core/model/project'
import { MODULES, ensureDocument } from '../src/core/modules/registry'
import { moduleToMarkdown } from '../src/core/export/markdown'
import { actionEffect, DIPLOMACY_DOC, factionStandings, levelAt, markProblems, relationPairs, simulateActions, startValue } from '../src/core/diplomacy'
import { factionFootprints, unlinkedFactions } from '../src/core/diplomacyFootprint'

const mod = MODULES.find((m) => m.id === DIPLOMACY_DOC)!
const FACTIONS = [
  { id: 'cr', name: 'Crown' },
  { id: 'gu', name: 'Guild' },
  { id: 'fa', name: 'Faith' },
]
const LEVELS = [
  { id: 'h', name: 'Hostile', min: -100, consequences: 'Attacked' },
  { id: 'n', name: 'Neutral', min: -30 },
  { id: 'f', name: 'Friendly', min: 30, consequences: 'Discounts' },
]
const build = (extra: Record<string, any> = {}) => {
  const p = createProject('T', false)
  p.documents[DIPLOMACY_DOC] = {
    moduleVersion: 2,
    data: { overview: {}, factions: FACTIONS, relations: { cells: {} }, relationGraph: { nodes: [], edges: [] }, thresholds: LEVELS, actions: [], endings: [], ...extra },
  }
  return p
}
const ruleIds = (p: ReturnType<typeof build>, docId = DIPLOMACY_DOC) =>
  collectHints(makeContext(p, { docId }))
    .map((h) => h.ruleId)
    .filter((r) => r.startsWith('diplomacy.'))

describe('relations', () => {
  it('pairs every two factions with both directions, a standing and graph kinds', () => {
    const p = build({
      relations: { cells: { 'cr|gu': 60, 'gu|cr': 40, 'cr|fa': -70, 'fa|cr': -70 } },
      relationGraph: { nodes: [{ id: 'n1', refId: 'cr' }, { id: 'n2', refId: 'fa' }], edges: [{ id: 'e', source: 'n2', target: 'n1', kind: 'Enemy' }] },
    })
    const pairs = relationPairs(p)
    expect(pairs.map((x) => [x.a.id, x.b.id, x.ab, x.ba, x.mean, x.standing, x.asymmetric, x.kinds])).toEqual([
      ['cr', 'gu', 60, 40, 50, 'ally', true, []],
      ['cr', 'fa', -70, -70, -70, 'enemy', false, ['Enemy']],
      ['gu', 'fa', undefined, undefined, undefined, undefined, false, []],
    ])
    const crown = factionStandings(p).find((s) => s.faction.id === 'cr')!
    expect([crown.allies.map((x) => x.id), crown.enemies.map((x) => x.id), crown.regard]).toEqual([['gu'], ['fa'], -15])
    expect(factionStandings(p).find((s) => s.faction.id === 'gu')!.unset.map((x) => x.id)).toEqual(['fa'])
  })
})

describe('action simulator', () => {
  const actions = [
    { id: 'a1', name: 'Help Crown', faction: 'cr', effectOnFaction: 40, spillover: { gu: 10 }, spilloverDefault: -20 },
    { id: 'a2', name: 'Rob Guild', faction: 'gu', effectOnFaction: -80 },
  ]

  it('applies direct change, per-faction spillover and the default', () => {
    expect(['cr', 'gu', 'fa'].map((id) => actionEffect(actions[0], id))).toEqual([40, 10, -20])
    expect(actionEffect({ id: 'x', effectOnFaction: 5 }, 'cr')).toBe(0)
  })

  it('plays a sequence from the start value, clamps to the scale and reports level changes', () => {
    const p = build({ overview: { startValue: 0 }, actions })
    const rows = simulateActions(p, ['a1', 'a1', 'a2', 'missing'])
    const crown = rows.find((r) => r.faction.id === 'cr')!
    expect(crown.values).toEqual([0, 40, 80, 80])
    expect(crown.crossings.map((c) => [c.step, c.from?.name, c.to?.name])).toEqual([[1, 'Neutral', 'Friendly']])
    const guild = rows.find((r) => r.faction.id === 'gu')!
    expect(guild.values).toEqual([0, 10, 20, -60])
    expect(guild.endLevel?.name).toBe('Hostile')
    // The faith keeps losing 20 per "Help Crown" and is clamped at the bottom.
    expect(simulateActions(p, Array(6).fill('a1')).find((r) => r.faction.id === 'fa')!.end).toBe(-100)
  })

  it('starts at the overview value, clamped, else at 0 or the scale middle', () => {
    expect(startValue(build({ overview: { startValue: 500 } }))).toBe(100)
    expect(startValue(build())).toBe(0)
    expect(startValue(build({ overview: { scaleMin: 0, scaleMax: 10 } }))).toBe(0)
    expect(startValue(build({ overview: { scaleMin: 10, scaleMax: 20 } }))).toBe(15)
    expect(levelAt(build(), -30)?.name).toBe('Neutral')
  })

  it('reports overview markers that do not fit the scale', () => {
    expect(markProblems(build({ overview: { startValue: 150, allyAt: -60, enemyAt: -50 } }))).toEqual(['starting value 150', 'allied cut-off not above the hostile one'])
    expect(markProblems(build({ overview: { startValue: 0 } }))).toEqual([])
  })
})

describe('faction footprint', () => {
  const linked = () => {
    const p = build({ actions: [{ id: 'a', faction: 'cr' }], endings: [{ id: 'e', name: 'Crown wins', factions: ['cr', 'gu'] }] })
    p.documents[DIPLOMACY_DOC].data.factions = [{ ...FACTIONS[0], characters: ['c1'], unlocks: ['s1', 's2'] }, FACTIONS[1], FACTIONS[2]]
    p.documents['design.story'] = { moduleVersion: 2, data: { characters: [{ id: 'c1', name: 'Queen', faction: 'cr' }], quests: [{ id: 'q', name: 'Q', faction: 'gu', rewardRep: { cr: 10 } }] } }
    return p
  }

  it('counts links inside the module and groups references from other modules', () => {
    const fp = factionFootprints(linked())
    const crown = fp.find((f) => f.faction.id === 'cr')!
    expect([crown.actions, crown.endings, crown.characters, crown.unlocks, crown.outside]).toEqual([1, 1, 1, 2, 2])
    expect(crown.elsewhere.map((g) => [g.docId, g.usages.length])).toEqual([['design.story', 2]])
    expect(unlinkedFactions(linked()).map((f) => f.id)).toEqual(['fa'])
    expect(unlinkedFactions(build())).toEqual([])
  })
})

describe('diplomacy export', () => {
  it('adds standings after the matrix, a footprint after the factions and the start level, keeping doc order', () => {
    const p = build({ overview: { startValue: 0 }, relations: { cells: { 'cr|gu': 60, 'gu|cr': 40, 'cr|fa': -70, 'fa|cr': -70 } } })
    ensureDocument(p, mod, makeId)
    const md = moduleToMarkdown(p, mod)
    const headings = [...md.matchAll(/^## \d+\. (.+)$/gm)].map((m) => m[1])
    expect(headings).toEqual(['System overview', 'Factions', 'Relationship matrix', 'Relationship graph', 'Actions → reputation effects', 'Relationship levels and consequences', 'Endings'])
    const at = (h: string) => md.indexOf(`. ${h}`)
    const between = (a: string, b: string) => md.slice(at(a), at(b))
    expect(between('Factions', 'Relationship matrix')).toContain('| Crown | 1 | 1 | 0 | 0 | 0 | 0 | none yet |')
    expect(between('Relationship matrix', 'Relationship graph')).toContain('* **Allied:** Crown – Guild')
    expect(between('Relationship matrix', 'Relationship graph')).toContain('* **One-sided:** Crown → Guild 60, back 40')
    expect(between('Relationship levels and consequences', 'Endings')).toContain('_A new game starts at 0 (Neutral)._')
  })
})

describe('diplomacy hints', () => {
  it('flag scale markers outside the scale', () => {
    expect(ruleIds(build({ overview: { startValue: 150 } }))).toContain('diplomacy.marks')
    expect(ruleIds(build({ overview: { startValue: 0 } }))).not.toContain('diplomacy.marks')
  })

  it('flag factions no action reaches, only once there are actions', () => {
    expect(ruleIds(build())).not.toContain('diplomacy.untouched')
    expect(ruleIds(build({ actions: [{ id: 'a', faction: 'cr', effectOnFaction: 5 }] }))).toContain('diplomacy.untouched')
    expect(ruleIds(build({ actions: [{ id: 'a', faction: 'cr', effectOnFaction: 5, spilloverDefault: -2 }] }))).not.toContain('diplomacy.untouched')
  })

  it('flag unlinked factions only once one faction is linked elsewhere', () => {
    const p = build()
    expect(ruleIds(p)).not.toContain('diplomacy.unlinked')
    p.documents['design.story'] = { moduleVersion: 2, data: { characters: [{ id: 'c', name: 'C', faction: 'cr' }] } }
    expect(ruleIds(p)).toContain('diplomacy.unlinked')
  })

  it('stay quiet in other editors and never reach important', () => {
    const p = build({ overview: { startValue: 150 }, actions: [{ id: 'a', faction: 'cr', effectOnFaction: 5 }] })
    expect(ruleIds(p, 'design.items')).toEqual([])
    const hints = collectHints(makeContext(p, { docId: DIPLOMACY_DOC })).filter((h) => h.ruleId.startsWith('diplomacy.'))
    expect(hints.length).toBeGreaterThan(0)
    expect(hints.every((h) => h.severity !== 'important')).toBe(true)
  })
})
