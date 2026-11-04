import { describe, expect, it } from 'vitest'
import { collectHints, makeContext } from '../src/core/hints/engine'
import { moduleToMarkdown } from '../src/core/export/markdown'
import { createProject, makeId } from '../src/core/model/project'
import { ensureDocument, getModule, getSections } from '../src/core/modules/registry'
import { validateProject } from '../src/core/references/refs'
import { buildState, levelTable, PLAYER_DOC, pointsAt, timeToCritical, treeAnalysis, unlearn } from '../src/core/player'

const player = getModule(PLAYER_DOC)!

function playerProject() {
  const p = createProject('T')
  p.registry.catalogs.casts = { label: 'Player casts', items: [{ id: 'warrior', label: 'Warrior' }, { id: 'ranger', label: 'Ranger' }] }
  p.registry.catalogs.survivalStats = { label: 'Survival stats', items: [{ id: 'hunger', label: 'Hunger' }, { id: 'health', label: 'Health' }] }
  const diff = p.documents['design.difficulty'].data
  diff.params = [{ id: 'hp', name: 'Hunger decay', category: 'Survival', baseline: 1 }]
  diff.values = { cells: { 'hp|easy': 0.5, 'hp|medium': 1, 'hp|hard': 2 } }
  const d = p.documents[PLAYER_DOC].data
  d.leveling = { levelCap: 5, xpFormula: '100 * level', skillPointsPerLevel: 1, startSkillPoints: 1 }
  d.xpSources = [{ id: 'x1', name: 'Kills', xp: 10, perHour: 30 }]
  d.survival = [{ id: 'h', name: 'Hunger', stat: 'hunger', max: 100, decay: 2, criticalAt: 20, difficultyParam: 'hp', restore: 'Eating' }]
  d.skills = [
    { id: 'a', name: 'Slash', cast: 'warrior', kind: 'Active', tier: 1, cost: 1, requiredLevel: 1 },
    { id: 'b', name: 'Cleave', cast: 'warrior', kind: 'Passive', tier: 2, cost: 2, requiredLevel: 3, requires: ['a'] },
    { id: 'c', name: 'Whirl', cast: 'warrior', kind: 'Passive', tier: 3, cost: 3, requiredLevel: 5, requires: ['b'] },
  ]
  return p
}
const hintIds = (p: ReturnType<typeof createProject>) =>
  collectHints(makeContext(p, { docId: PLAYER_DOC })).filter((h) => h.ruleId.startsWith('player.')).map((h) => h.ruleId)

describe('player module v2', () => {
  it('migrates the v1 graph into skills with the same ids, death, affinity and text lists', () => {
    const p = createProject('t')
    p.documents[PLAYER_DOC] = {
      moduleVersion: 1,
      data: {
        hero: { background: 'Soldier', death: 'Lose half the gold' },
        skillTree: {
          nodes: [
            { id: 'n1', kind: 'Passive', label: 'Grit', refId: 'warrior', x: 0, y: 0, notes: '+10% HP' },
            { id: 'n2', kind: 'Skill', label: 'Charge', refId: 'warrior', x: 0, y: 0 },
          ],
          edges: [{ id: 'e', source: 'n1', target: 'n2', kind: 'requires' }],
        },
        casts: [{ id: 'c', name: 'Warrior', cast: 'warrior', affinity: 'f1', startAbilities: ['Slash'], startGear: [] }],
      },
    }
    const doc = ensureDocument(p, player, makeId)
    expect(doc.moduleVersion).toBe(2)
    expect(doc.data.skillTree).toBeUndefined()
    expect(doc.data.hero.death).toBeUndefined()
    expect(doc.data.death.penalty).toBe('Lose half the gold')
    expect(doc.data.skills).toEqual([
      { id: 'n1', name: 'Grit', cast: 'warrior', kind: 'Passive', effect: '+10% HP' },
      { id: 'n2', name: 'Charge', cast: 'warrior', requires: ['n1'] },
    ])
    expect(doc.data.casts[0]).toMatchObject({ affinity: ['f1'], legacyNotes: 'Starting abilities: Slash' })
    expect(doc.data.casts[0].startAbilities).toBeUndefined()
    expect(doc.data.casts[0].startGear).toBeUndefined()
    expect(doc.data.leveling).toEqual({})
  })

  it('keeps faction unlocks valid and exports in the order of player_character.md', () => {
    const p = playerProject()
    p.documents['design.factions'].data.factions = [{ id: 'f', name: 'Crown', unlocks: ['b'] }]
    expect(validateProject(p).filter((i) => i.message.includes('broken reference'))).toEqual([])
    const heads = moduleToMarkdown(p, player).split('\n').filter((l) => l.startsWith('## ')).map((l) => l.replace(/^## \d+\. /, ''))
    const order = ['The hero', 'Survival stats', 'Levelling', 'XP sources', 'Casts', 'Abilities and spells', 'Controls and camera', 'Death and respawn']
    const positions = order.map((h) => heads.indexOf(h))
    expect(positions.every((i) => i >= 0)).toBe(true)
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
  })

  it('exports pacing summaries and a Mermaid skill tree', () => {
    const md = moduleToMarkdown(playerProject(), player)
    expect(md).toContain('**Time from full to critical**')
    expect(md).toContain('| 5 | 400 | 1000 | 3.3 | 5 |')
    expect(md).toContain('Warrior 6 of 5 points at cap')
    expect(md).toContain('s_a --> s_b')
  })

  it('scales survival time to critical by the linked difficulty parameter', () => {
    const p = playerProject()
    const hunger = p.documents[PLAYER_DOC].data.survival[0]
    expect(timeToCritical(p, hunger)).toBe(40)
    expect(timeToCritical(p, hunger, 'easy')).toBe(80)
    expect(timeToCritical(p, hunger, 'hard')).toBe(20)
    expect(timeToCritical(p, { id: 'x', max: 100 })).toBeNull()
  })

  it('builds the level table with hours and skill points, and flags bad curves', () => {
    const p = playerProject()
    const t = levelTable(p)
    expect(t.rows.map((r) => r.total)).toEqual([0, 100, 300, 600, 1000])
    expect(t.rows[4].hours).toBeCloseTo(3.333, 2)
    expect(pointsAt(p, 5)).toBe(5)
    p.documents[PLAYER_DOC].data.leveling.xpFormula = '500 - level * 100'
    expect(levelTable(p).flat).toEqual([3, 4, 5])
    p.documents[PLAYER_DOC].data.leveling.xpFormula = 'level * speed'
    expect(levelTable(p).error).toBe('Unknown variable speed')
  })

  it('analyses tree cost against the budget and structure problems', () => {
    const p = playerProject()
    const warrior = treeAnalysis(p).casts.find((c) => c.cast.id === 'warrior')!
    expect(warrior).toMatchObject({ totalCost: 6, budget: 5, affordableAt: null, maxTier: 3 })
    const skills = p.documents[PLAYER_DOC].data.skills
    skills[0].requires = ['c']
    skills.push({ id: 'd', name: 'Volley', cast: 'ranger', tier: 1, requires: ['a'], requiredLevel: 9 })
    const a = treeAnalysis(p)
    expect(a.cycles.map((s) => s.id).sort()).toEqual(['a', 'b', 'c'])
    expect(a.tierInversions.map((s) => s.id)).toEqual(['a', 'd'])
    expect(a.crossCast.map((s) => s.id)).toEqual(['d'])
    expect(a.aboveCap.map((s) => s.id)).toEqual(['d'])
  })

  it('plans builds: locks with reasons, budget, and unlearning dependents', () => {
    const p = playerProject()
    const s = buildState(p, 'warrior', 3, ['a'])
    expect(s).toMatchObject({ points: 3, spent: 1, left: 2 })
    expect(s.skills.find((x) => x.skill.id === 'b')!.state).toBe('available')
    expect(s.skills.find((x) => x.skill.id === 'c')!.reasons).toEqual(['needs level 5', 'needs Cleave', 'costs 3, 2 left'])
    expect(unlearn(p, ['a', 'b', 'c'], 'a')).toEqual([])
    expect(buildState(p, 'warrior', 1, ['a', 'b']).invalid).toEqual(['b'])
  })

  it('has the four new views on the right sections', () => {
    const secs = getSections(player, createProject('t').registry)
    const views = (id: string) => (secs.find((s) => s.id === id) as any).views.map((v: any) => v.kind)
    expect(views('survival')).toContain('depletion')
    expect(views('xpSources')).toContain('levelCurve')
    expect(views('skills')).toEqual(expect.arrayContaining(['skillTree', 'buildPlanner']))
  })
})

describe('player design checks', () => {
  it('stays quiet on an empty document and in other editors', () => {
    const p = createProject('T', false)
    ensureDocument(p, player, makeId)
    expect(hintIds(p)).toEqual([])
    expect(collectHints(makeContext(playerProject(), { docId: 'design.world' })).filter((h) => h.ruleId.startsWith('player.'))).toEqual([])
  })

  it('flags restore, pace, difficulty, curve, coverage, budget, shape, abilities and gear', () => {
    const p = playerProject()
    const d = p.documents[PLAYER_DOC].data
    d.survival.push({ id: 't', name: 'Thirst', stat: 'thirst', max: 100, decay: 80 })
    d.leveling.xpFormula = '500 - level * 100'
    d.casts = [{ id: 'cw', name: 'Warrior', cast: 'warrior' }]
    d.skills[2].tier = 1
    expect(hintIds(p)).toEqual(
      expect.arrayContaining([
        'player.survivalRestore',
        'player.survivalPace',
        'player.survivalDifficulty',
        'player.curve',
        'player.castCoverage',
        'player.treeBudget',
        'player.treeShape',
        'player.abilities',
        'player.startGear',
      ]),
    )
  })

  it('does not flag a complete setup', () => {
    const p = playerProject()
    const d = p.documents[PLAYER_DOC].data
    d.leveling.levelCap = 8
    d.survival = [{ id: 'h', name: 'Hunger', stat: 'hunger', max: 100, decay: 2, criticalAt: 20, difficultyParam: 'hp', restore: 'Eating' }]
    d.abilities = [{ id: 'ab', name: 'Slash', cast: 'warrior', kind: 'Active', mana: 5, cooldown: 2 }]
    d.skills[0].grants = 'ab'
    d.skills.push({ id: 'r1', name: 'Aim', cast: 'ranger', kind: 'Passive', tier: 1, cost: 4 })
    d.abilities.push({ id: 'ab2', name: 'Shoot', cast: 'ranger', kind: 'Active', mana: 3, cooldown: 1 })
    d.skills.push({ id: 'r2', name: 'Shoot', cast: 'ranger', kind: 'Active', tier: 2, cost: 2, requires: ['r1'], grants: 'ab2' })
    d.casts = [
      { id: 'cw', name: 'Warrior', cast: 'warrior', startAbilities: ['ab'] },
      { id: 'cr', name: 'Ranger', cast: 'ranger', startGear: ['bow'] },
    ]
    expect(hintIds(p)).toEqual([])
  })

  it('never exceeds suggest severity', () => {
    const p = playerProject()
    p.documents[PLAYER_DOC].data.leveling.xpFormula = 'nope('
    expect(collectHints(makeContext(p, { docId: PLAYER_DOC })).filter((h) => h.ruleId.startsWith('player.')).every((h) => h.severity !== 'important')).toBe(true)
  })
})
