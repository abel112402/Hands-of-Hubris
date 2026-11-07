import { describe, expect, it } from 'vitest'
import { collectHints, makeContext } from '../src/core/hints/engine'
import { createProject, makeId } from '../src/core/model/project'
import { MODULES, ensureDocument } from '../src/core/modules/registry'
import { moduleToMarkdown } from '../src/core/export/markdown'
import {
  baselineOutOfRange,
  customValues,
  customPressure,
  customRange,
  DIFFICULTY_DOC,
  levelPressure,
  levelSteps,
  pressureProfile,
  snap,
  spreadValues,
  stepOf,
} from '../src/core/difficulty'
import { difficultyImpact, paramUsage, unusedParams } from '../src/core/difficultyImpact'

const H = 'Higher = harder'
const E = 'Higher = easier'
const mod = MODULES.find((m) => m.id === DIFFICULTY_DOC)!

/** Levels come from the default catalog: easy, medium, hard. */
const build = (params: any[], cells: Record<string, number> = {}, extra: Record<string, any> = {}) => {
  const p = createProject('T', false)
  p.documents[DIFFICULTY_DOC] = { moduleVersion: 2, data: { params, presets: [], values: { cells }, custom: [], ...extra } }
  return p
}
const hp = { id: 'hp', name: 'Enemy HP', category: 'Combat', unit: '×', direction: H, baseline: 1, min: 0, max: 2 }
const morale = { id: 'mo', name: 'Morale', category: 'NPC', unit: '%', direction: E, baseline: 50, min: 0, max: 100 }
const CELLS = { 'hp|easy': 0.5, 'hp|medium': 1, 'hp|hard': 2, 'mo|easy': 80, 'mo|medium': 50, 'mo|hard': 40 }
const rules = (p: ReturnType<typeof build>, docId = DIFFICULTY_DOC) => collectHints(makeContext(p, { docId })).filter((h) => h.ruleId.startsWith('difficulty.'))
const ruleIds = (p: ReturnType<typeof build>, docId?: string) => rules(p, docId).map((h) => h.ruleId)

describe('pressure profile', () => {
  it('scores each level, splits it by category, and flips "higher = easier"', () => {
    const p = build([hp, morale, { id: 'n', name: 'Neutral', direction: 'Neutral', min: 0, max: 1 }], CELLS)
    const [easy, medium, hard] = levelPressure(p)
    // Easy: HP 0.25, morale 1 - 0.8 = 0.2 → mean 0.225.
    expect(easy.overall).toBeCloseTo(0.225)
    expect(easy.count).toBe(2)
    expect(easy.categories).toEqual([
      { category: 'Combat', mean: 0.25, share: 0.125, count: 1 },
      { category: 'NPC', mean: expect.closeTo(0.2), share: expect.closeTo(0.1), count: 1 },
    ])
    expect(medium.overall).toBeCloseTo(0.5)
    expect(hard.overall).toBeCloseTo(0.8)
    // Shares always add up to the overall score.
    expect(hard.categories.reduce((s, c) => s + c.share, 0)).toBeCloseTo(hard.overall!)
  })

  it('clamps values outside the range and ignores parameters without one', () => {
    const p = build([hp, { id: 'x', name: 'No range', direction: H }], { 'hp|easy': 5, 'x|easy': 3 })
    expect(pressureProfile(p, (q) => (q.id === 'hp' ? 5 : 3))).toMatchObject({ overall: 1, count: 1 })
    expect(pressureProfile(build([]), () => 1)).toEqual({ overall: null, categories: [], count: 0 })
  })

  it('reports the step between neighbouring levels', () => {
    const steps = levelSteps(build([hp], { 'hp|easy': 1, 'hp|medium': 1.05, 'hp|hard': 0.8 }))
    expect(steps.map((s) => [s.from.id, s.to.id, Math.round(s.delta * 1000) / 1000, s.tooClose, s.inverted])).toEqual([
      ['easy', 'medium', 0.025, true, false],
      ['medium', 'hard', -0.125, false, true],
    ])
  })
})

describe('editing helpers', () => {
  it('picks round steps and snaps without float noise', () => {
    expect(stepOf({ id: 'a', unit: '×' })).toBe(0.05)
    expect(stepOf({ id: 'a', unit: '%' })).toBe(1)
    expect(stepOf({ id: 'a', unit: 'absolute', min: 0, max: 300 })).toBe(5)
    expect(stepOf({ id: 'a', unit: 'seconds', min: 0, max: 7 })).toBe(0.1)
    expect(snap(0.1 + 0.2, 0.05)).toBe(0.3)
    expect(snap(1.5649, 0.05)).toBe(1.55)
  })

  it('spreads levels evenly around the baseline in pressure terms', () => {
    const p = build([hp, morale, { ...hp, id: 'ex', exception: true }, { ...hp, id: 'nb', baseline: undefined }])
    expect(spreadValues(p, 0.25)).toEqual({ 'hp|easy': 0.5, 'hp|medium': 1, 'hp|hard': 1.5, 'mo|easy': 75, 'mo|medium': 50, 'mo|hard': 25 })
  })

  it('finds baselines outside their range', () => {
    expect(baselineOutOfRange(build([hp, { ...hp, id: 'b', baseline: 3 }])).map((x) => x.id)).toEqual(['b'])
  })
})

describe('custom settings', () => {
  const settings = [
    { id: 's1', name: 'Enemy strength', params: ['hp'], min: 0.5, max: 2 },
    { id: 's2', name: 'Also HP', params: ['hp'] },
  ]

  it('multiplies the base level, stacks settings and clamps to the range', () => {
    const p = build([hp, morale], CELLS, { custom: settings })
    expect(customValues(p, 'medium', { s1: 1.5 })).toEqual({ hp: 1.5, mo: 50 })
    expect(customValues(p, 'medium', { s1: 1.5, s2: 2 })).toEqual({ hp: 2, mo: 50 })
    expect(customValues(p, 'medium', {})).toEqual({ hp: 1, mo: 50 })
    expect(customPressure(p, 'medium', { s1: 1.5 }).overall).toBeCloseTo(0.625)
    expect(customRange(settings[0])).toEqual([0.5, 2])
    expect(customRange(settings[1])).toEqual([0.5, 2])
    expect(customRange({ id: 'x', min: 2, max: 1 })).toEqual([0.5, 2])
  })
})

describe('impact on other systems', () => {
  const linked = () => {
    const p = build([hp, { ...hp, id: 'dmg', name: 'Enemy damage' }, { ...hp, id: 'hunger', name: 'Hunger rate', category: 'Survival' }, { ...hp, id: 'pr', name: 'Prices' }], {
      'hp|easy': 0.5,
      'hp|hard': 2,
      'hunger|easy': 0.5,
      'hunger|medium': 1,
      'hunger|hard': 2,
      'pr|hard': 1.5,
    })
    p.documents['design.player'] = { moduleVersion: 2, data: { survival: [{ id: 'h', name: 'Hunger', max: 100, decay: 10, difficultyParam: 'hunger' }] } }
    p.documents['design.combat'] = { moduleVersion: 2, data: { damageModel: { hpParam: 'hp' } } }
    p.documents['design.trade'] = { moduleVersion: 2, data: { margins: { difficultyParam: 'pr' } } }
    return p
  }

  it('lists which system reads each parameter', () => {
    const u = paramUsage(linked())
    expect(u.get('hp')).toEqual([{ docId: 'design.combat', label: 'Combat › enemy HP' }])
    expect(u.get('hunger')?.[0].label).toBe('Player › Hunger decay')
    expect(u.get('pr')?.[0].label).toBe('Trade › prices')
    expect(unusedParams(linked()).map((x) => x.id)).toEqual(['dmg'])
  })

  it('computes survival time, enemy multipliers and prices per level', () => {
    const rows = difficultyImpact(linked())
    expect(rows.map((r) => [r.group, r.label, r.values])).toEqual([
      ['Survival', 'Hunger: time to critical', { easy: 20, medium: 10, hard: 5 }],
      ['Combat', 'Enemy HP', { easy: 0.5, medium: 1, hard: 2 }],
      ['Trade', 'Buy prices', { easy: 1, medium: 1, hard: 1.5 }],
    ])
  })
})

describe('difficulty export', () => {
  it('adds the pressure and impact tables after the values, keeping doc order', () => {
    const p = build([hp, morale], CELLS)
    p.documents['design.combat'] = { moduleVersion: 2, data: { damageModel: { hpParam: 'hp' } } }
    ensureDocument(p, mod, makeId)
    const md = moduleToMarkdown(p, mod)
    const headings = [...md.matchAll(/^## \d+\. (.+)$/gm)].map((m) => m[1])
    expect(headings).toEqual(['Principles', 'Difficulty presets', 'Parameters', 'Parameter values per difficulty', 'Custom and accessibility settings', 'Changing difficulty', 'Data storage'])
    const values = md.slice(md.indexOf('Parameter values per difficulty'), md.indexOf('Custom and accessibility settings'))
    expect(values).toContain('| Level | Overall | Step | Combat | NPC |')
    expect(values).toContain('| Medium | 50 | +28 | 50 | 50 |')
    expect(values).toContain('| Combat | Enemy HP | ×0.5 | ×1 | ×2 |')
  })
})

describe('difficulty hints', () => {
  it('stay quiet without parameters and in other editors', () => {
    expect(ruleIds(build([]))).toEqual([])
    expect(ruleIds(build([hp], CELLS), 'design.items')).toEqual([])
  })

  it('flag levels that are too close or out of order', () => {
    expect(ruleIds(build([hp], { 'hp|easy': 1, 'hp|medium': 1.05, 'hp|hard': 2 }))).toContain('difficulty.spacing')
    expect(ruleIds(build([hp], { 'hp|easy': 0.5, 'hp|medium': 1, 'hp|hard': 2 }))).not.toContain('difficulty.spacing')
  })

  it('flag baselines outside the range', () => {
    expect(ruleIds(build([{ ...hp, baseline: 3 }]))).toContain('difficulty.baseline')
    expect(ruleIds(build([hp]))).not.toContain('difficulty.baseline')
  })

  it('flag unused parameters only once a system reads one', () => {
    const p = build([hp, { ...hp, id: 'other', name: 'Other' }], CELLS)
    expect(ruleIds(p)).not.toContain('difficulty.unused')
    p.documents['design.combat'] = { moduleVersion: 2, data: { damageModel: { hpParam: 'hp' } } }
    expect(rules(p).find((h) => h.ruleId === 'difficulty.unused')?.params).toEqual({ count: 1, names: 'Other' })
  })

  it('never reach important severity', () => {
    const p = build([{ ...hp, baseline: 3 }], { 'hp|easy': 1, 'hp|medium': 1, 'hp|hard': 0.5 })
    const hints = rules(p)
    expect(hints.length).toBeGreaterThan(0)
    expect(hints.every((h) => h.severity !== 'important')).toBe(true)
  })
})
