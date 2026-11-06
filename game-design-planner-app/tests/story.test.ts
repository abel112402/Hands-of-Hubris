import { describe, expect, it } from 'vitest'
import { collectHints, makeContext } from '../src/core/hints/engine'
import { moduleToMarkdown } from '../src/core/export/markdown'
import { createProject, makeId } from '../src/core/model/project'
import { ensureDocument, getModule } from '../src/core/modules/registry'
import {
  actDays,
  actHours,
  actPacing,
  biomeGateOrder,
  castCoverage,
  endingReachability,
  graphDisagreements,
  questDeps,
  repShortfalls,
  rewardsByAct,
  simulatePath,
  STORY_DOC,
} from '../src/core/story'
import { moneyFlow } from '../src/core/trade'

const story = getModule(STORY_DOC)!

/**
 * Two acts (10 and 20 days at 1 play hour per day), a flat 100-XP-per-level curve, a three-quest main line, a faction
 * quest, one decision with two options and an ending for each.
 */
function storyProject() {
  const p = createProject('S')
  p.documents['design.player'].data.leveling = { xpFormula: '100', levelCap: 20 }
  p.documents['design.player'].data.xpSources = []
  p.documents['design.items'].data.items = [{ id: 'sword', name: 'Sword', value: 50, rarity: 'common' }]
  p.documents['design.world'].data.biomes = [{ id: 'b1', name: 'Shore' }, { id: 'b2', name: 'Marsh' }]
  const fac = p.documents['design.factions'].data
  fac.factions = [{ id: 'f1', name: 'Wardens' }, { id: 'f2', name: 'Corsairs' }]
  fac.overview = { startValue: 0 }
  fac.thresholds = [
    { id: 'hostile', name: 'Hostile', min: -100 },
    { id: 'neutral', name: 'Neutral', min: -20 },
    { id: 'friendly', name: 'Friendly', min: 20 },
    { id: 'allied', name: 'Allied', min: 60 },
  ]
  const d = p.documents[STORY_DOC].data
  d.overview = { background: 'Shipwreck', conflict: 'Factions', secret: 'A god sleeps below' }
  d.structure = { hoursPerDay: 1 }
  d.acts = [
    { id: 'a2', name: 'Act 2', start: 10, duration: 20, biome: 'b2', levelMin: 4, levelMax: 8 },
    { id: 'a1', name: 'Act 1', start: 0, duration: 10, biome: 'b1', levelMin: 1, levelMax: 4 },
  ]
  d.characters = [
    { id: 'mentor', name: 'Maren', importance: 'Main' },
    { id: 'rival', name: 'Daro', importance: 'Main' },
  ]
  const obj = [{ id: 'o', text: 'Do it', done: false }]
  d.quests = [
    { id: 'q1', name: 'Washed ashore', type: 'Main', act: 'a1', giver: 'mentor', estMinutes: 300, rewardXp: 300, rewardMoney: 20, rewardItems: { sword: 1 }, rewardRep: { f1: 30 }, objectives: obj },
    { id: 'q2', name: 'Lighthouse', type: 'Main', act: 'a1', giver: 'mentor', estMinutes: 240, requires: ['q1'], rewardMoney: 5, objectives: obj },
    { id: 'q3', name: 'Fog', type: 'Main', act: 'a2', giver: 'mentor', estMinutes: 600, requires: ['q2'], rewardXp: 200, objectives: obj },
    { id: 'q4', name: 'Patrol', type: 'Faction', act: 'a2', faction: 'f1', giver: 'mentor', rewardRep: { f1: 40 }, objectives: obj },
    { id: 'qa', name: 'Keep the light', type: 'Event', act: 'a2' },
    { id: 'qb', name: 'Dark tide', type: 'Event', act: 'a2' },
  ]
  d.choices = [
    { id: 'oa', name: 'Relight it', decision: 'Fate', quest: 'q3', leadsTo: ['qa'], blocks: ['qb'] },
    { id: 'ob', name: 'Let it fall', decision: 'Fate', quest: 'q3', leadsTo: ['qb'], blocks: ['qa'] },
  ]
  d.endings = [
    { id: 'e1', name: 'Beacon', requiresChoices: ['oa'], requiresQuests: ['qa'] },
    { id: 'e2', name: 'Dark', requiresChoices: ['ob'], requiresQuests: ['qb'] },
  ]
  return p
}
type P = ReturnType<typeof storyProject>
const data = (p: P) => p.documents[STORY_DOC].data
const ruleIds = (p: P, docId = STORY_DOC) => collectHints(makeContext(p, { docId })).filter((h) => h.ruleId.startsWith('story.')).map((h) => h.ruleId)

describe('story module v2', () => {
  it('migrates v1 data: tone moves, text objectives become a checklist, graph endings and choices become entries with the same ids', () => {
    const p = createProject('t')
    p.documents[STORY_DOC] = {
      moduleVersion: 1,
      data: {
        overview: { background: 'Wreck', tone: 'Grim and dry' },
        acts: [{ id: 'a', name: 'One', start: 0, duration: 5 }],
        characters: [{ id: 'c', name: 'Maren', role: 'Mentor', bio: 'Old' }],
        quests: [{ id: 'q', name: 'Start', type: 'Main', conditions: 'After the storm', objectives: 'Find shelter', rewards: '50 gold', consequences: 'Wardens notice' }],
        questGraph: {
          nodes: [
            { id: 'n1', label: 'Start', kind: 'Quest', x: 0, y: 0, refId: 'q' },
            { id: 'n2', label: 'Spare him?', kind: 'Choice', x: 1, y: 0 },
            { id: 'n3', label: 'Exile', kind: 'Ending', x: 2, y: 0, notes: 'Alone again' },
          ],
          edges: [{ id: 'e', source: 'n1', target: 'n2' }],
        },
      },
    }
    const doc = ensureDocument(p, story, makeId)
    expect(doc.moduleVersion).toBe(2)
    expect(doc.data.overview).toEqual({ background: 'Wreck' })
    expect(doc.data.dialogue.tone).toBe('Grim and dry')
    expect(doc.data.quests[0]).toMatchObject({ conditions: 'After the storm', rewards: '50 gold', consequences: 'Wardens notice', objectives: [{ text: 'Find shelter', done: false }] })
    expect(doc.data.endings).toEqual([{ id: 'n3', name: 'Exile', description: 'Alone again' }])
    expect(doc.data.choices).toEqual([{ id: 'n2', name: 'Spare him?', decision: 'Spare him?' }])
    expect(doc.data.questGraph.nodes.map((n: any) => n.refId)).toEqual(['q', 'n2', 'n3'])
    expect(doc.data.acts).toEqual([{ id: 'a', name: 'One', start: 0, duration: 5 }])
    expect(doc.data.characters[0]).toMatchObject({ role: 'Mentor', bio: 'Old' })
  })

  it('converts act lengths between days and play hours, and Trade follows', () => {
    const p = storyProject()
    const a1 = data(p).acts[1]
    expect(actDays(p, a1)).toBe(10)
    expect(actHours(p, a1)).toBe(10)
    p.documents['design.trade'].data.flows = [{ id: 'x', name: 'Loot', direction: 'Source', kind: 'Other', amount: 1, per: 'Day' }]
    expect(moneyFlow(p).periods.map((x) => x.days)).toEqual([10, 20])
    data(p).structure = { actUnit: 'Play hours', hoursPerDay: 2 }
    expect(actDays(p, a1)).toBe(5)
    expect(actHours(p, a1)).toBe(10)
    expect(moneyFlow(p).periods.map((x) => x.days)).toEqual([5, 10])
    data(p).structure = {}
    expect(actHours(p, a1)).toBeNull()
  })

  it('exports in the order of story_quests.md with the act table, main line and decision tree', () => {
    const md = moduleToMarkdown(storyProject(), story)
    const heads = md.split('\n').filter((l) => l.startsWith('## ')).map((l) => l.replace(/^## \d+\. /, ''))
    const order = ['Story overview', 'Acts', 'Characters', 'Quest types', 'Quests', 'Choices', 'Endings', 'Dialogue and narrative style']
    const pos = order.map((h) => heads.indexOf(h))
    expect(pos.every((i) => i >= 0)).toBe(true)
    expect([...pos].sort((a, b) => a - b)).toEqual(pos)
    expect(md).toContain('| Act 1 |  | Shore |  | 1–4 (est. 4) | 9 |')
    expect(md).toContain('**Main questline:** Washed ashore → Lighthouse → Fog')
    expect(md).toContain('D0{"Fate"}')
    expect(md).toContain('* **Beacon:** reachable')
  })

  it('orders quests and finds loops, blocked and forward requirements', () => {
    const p = storyProject()
    const d = questDeps(p)
    expect(d.mainPath.map((q) => q.id)).toEqual(['q1', 'q2', 'q3'])
    expect(d.depth.get('q3')).toBe(2)
    expect(d.edges).toContainEqual({ from: 'q3', to: 'qa', kind: 'leadsTo' })
    expect(d.cycles).toEqual([])
    expect(d.unreachable).toEqual([])
    data(p).quests[0].requires = ['q3']
    expect(questDeps(p).cycles.map((q) => q.id).sort()).toEqual(['q1', 'q2', 'q3'])
    const q = storyProject()
    data(q).quests[3].requires = ['q1']
    data(q).quests[0].blocks = ['q4']
    expect(questDeps(q).unreachable).toMatchObject([{ quest: { id: 'q4' }, reason: 'Washed ashore closes it or one of its prerequisites' }])
    data(q).quests[1].requires = ['q3']
    expect(questDeps(q).actInversions).toMatchObject([{ quest: { id: 'q2' }, required: { id: 'q3' } }])
  })

  it('checks endings and plans a path through the choices', () => {
    const p = storyProject()
    expect(endingReachability(p).map((r) => r.reachable)).toEqual([true, true])
    const path = simulatePath(p, ['oa'])
    expect([...path.blockedQuests]).toEqual(['qb'])
    expect(path.openEndings.map((e) => e.id)).toEqual(['e1'])
    expect(path.blockedEndings).toMatchObject([{ ending: { id: 'e2' }, why: 'needs “Let it fall”' }])
    data(p).endings.push({ id: 'e3', name: 'Both', requiresChoices: ['oa', 'ob'] })
    const e3 = endingReachability(p)[2]
    expect(e3.reachable).toBe(false)
    expect(e3.reasons[0]).toBe('needs both “Relight it” and “Let it fall” of Fate')
  })

  it('paces acts against the XP curve', () => {
    const rows = actPacing(storyProject())
    expect(rows.map((r) => r.act.id)).toEqual(['a1', 'a2'])
    // Act 1: 300 quest XP on a flat 100-per-level curve is level 4; 9 quest hours in a 10-hour act.
    expect(rows[0]).toMatchObject({ quests: 2, questHours: 9, actHours: 10, xp: 300, cumXp: 300, level: 4, problem: null })
    expect(rows[0].load).toBeCloseTo(0.9)
    expect(rows[1]).toMatchObject({ cumXp: 500, level: 6, problem: null })
    const p = storyProject()
    data(p).acts[1].levelMax = 3
    expect(actPacing(p)[0].problem).toBe('high')
  })

  it('adds up rewards per act and reputation over the acts', () => {
    const { rows } = rewardsByAct(storyProject())
    expect(rows[0]).toMatchObject({ label: 'Act 1', xp: 300, money: 25, itemValue: 50, rep: { f1: 30 } })
    expect(rows[1].cumRep).toEqual({ f1: 70, f2: 0 })
  })

  it('covers the cast, biome gates, reputation needs and sketch edges', () => {
    const p = storyProject()
    const c = castCoverage(p)
    expect(c.rows.find((r) => r.character.id === 'mentor')!.byAct).toEqual({ a1: 2, a2: 2 })
    expect(c.idleMain.map((x) => x.id)).toEqual(['rival'])
    expect(c.factionsWithoutQuests.map((x) => x.id)).toEqual(['f2'])
    p.documents['design.world'].data.biomes[0].entryQuests = ['q3']
    expect(biomeGateOrder(p)).toMatchObject([{ biome: { id: 'b1' }, quest: { id: 'q3' } }])
    p.documents['design.trade'].data.merchants = [{ id: 'm', name: 'Quartermaster', type: 'Faction capital', faction: 'f2', minLevel: 'friendly' }]
    expect(repShortfalls(p)).toMatchObject([{ faction: { id: 'f2' }, level: { id: 'friendly' }, best: 0, by: 'Quartermaster' }])
    data(p).questGraph = {
      nodes: [{ id: 'n1', refId: 'q1' }, { id: 'n2', refId: 'q2' }, { id: 'n3', refId: 'q3' }],
      edges: [{ id: 'x', source: 'n1', target: 'n2' }, { id: 'y', source: 'n1', target: 'n3' }],
    }
    expect(graphDisagreements(p)).toMatchObject([{ from: { id: 'q1' }, to: { id: 'q3' } }])
  })
})

describe('story hints', () => {
  it('stay quiet on an empty doc and in other editors, and never exceed suggest', () => {
    expect(ruleIds(createProject('x') as P)).toEqual([])
    const p = storyProject()
    data(p).quests[0].requires = ['q3']
    expect(ruleIds(p, 'design.items')).toEqual([])
    const hints = collectHints(makeContext(p, { docId: STORY_DOC })).filter((h) => h.ruleId.startsWith('story.'))
    expect(hints.length).toBeGreaterThan(0)
    expect(hints.every((h) => h.severity !== 'important')).toBe(true)
  })

  const cases: [string, (p: P) => void][] = [
    ['story.questCycle', (p) => (data(p).quests[0].requires = ['q3'])],
    [
      'story.unreachable',
      (p) => {
        data(p).quests[3].requires = ['q1']
        data(p).quests[0].blocks = ['q4']
      },
    ],
    ['story.actOrder', (p) => (data(p).quests[1].requires = ['q1', 'q4'])],
    ['story.endings', (p) => data(p).endings.push({ id: 'e3', name: 'Both', requiresChoices: ['oa', 'ob'] })],
    ['story.endingsEmpty', (p) => data(p).endings.push({ id: 'e4', name: 'Someday' })],
    ['story.pacing', (p) => (data(p).acts[1].levelMax = 3)],
    ['story.reputation', (p) => (p.documents['design.trade'].data.merchants = [{ id: 'm', name: 'QM', type: 'Faction capital', faction: 'f2', minLevel: 'friendly' }])],
    [
      'story.graphSync',
      (p) =>
        (data(p).questGraph = { nodes: [{ id: 'n1', refId: 'q1' }, { id: 'n3', refId: 'q3' }], edges: [{ id: 'y', source: 'n1', target: 'n3' }] }),
    ],
  ]
  for (const [id, make] of cases)
    it(`${id} fires only when its problem exists`, () => {
      const p = storyProject()
      expect(ruleIds(p)).not.toContain(id)
      make(p)
      expect(ruleIds(p)).toContain(id)
    })

  it('info rules: incomplete quests, idle main characters, factions without quests', () => {
    const p = storyProject()
    expect(ruleIds(p)).toEqual(expect.arrayContaining(['story.cast', 'story.factionQuests']))
    expect(ruleIds(p)).not.toContain('story.questBasics')
    delete data(p).quests[2].giver
    expect(ruleIds(p)).toContain('story.questBasics')
    data(p).characters[1].importance = 'Minor'
    data(p).quests.push({ id: 'q5', name: 'Raid', type: 'Faction', faction: 'f2' })
    expect(ruleIds(p)).not.toContain('story.cast')
    expect(ruleIds(p)).not.toContain('story.factionQuests')
  })
})
