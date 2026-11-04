import { paramsOf } from '../../difficulty'
import {
  abilitiesWithoutCost,
  activeSkillsWithoutAbility,
  castCoverage,
  comparedLevels,
  levelCap,
  levelTable,
  PLAYER_DOC as DOC,
  playerList,
  survivalWithoutRestore,
  timeToCritical,
  treeAnalysis,
  unitOf,
} from '../../player'
import type { Hint, HintRule } from '../types'
import { hintId, isDocEmpty, shortList } from '../util'

/** Survival pacing outside this window (real minutes, middle difficulty) is flagged for review. */
export const SURVIVAL_PACE_MINUTES: [number, number] = [2, 60]

type Draft = Omit<Hint, 'id' | 'scope' | 'target' | 'titleKey' | 'bodyKey'> & { key: string; sectionId: string; entityId?: string }

const hint = (d: Draft): Hint => ({
  id: hintId(d.ruleId, d.entityId),
  ruleId: d.ruleId,
  severity: d.severity,
  scope: d.entityId ? 'entity' : 'section',
  target: { docId: DOC, sectionId: d.sectionId, entityId: d.entityId },
  titleKey: `hints.${d.key}.title`,
  bodyKey: `hints.${d.key}.body`,
  params: d.params,
  action: d.action ?? { kind: 'goto', docId: DOC, sectionId: d.sectionId },
})

const active = (id: string, evaluate: HintRule['evaluate']): HintRule => ({
  id,
  scope: 'section',
  appliesTo: ({ project, docId }) => docId === DOC && !isDocEmpty(project, DOC),
  evaluate,
})

const names = (l: Record<string, any>[]) => shortList(l.map((x) => String(x.name ?? x.label ?? '') || '(unnamed)'))
const round = (n: number) => Math.round(n * 10) / 10

/** Advisory player-character checks; pacing and budgets are design choices, so nothing exceeds 'suggest'. */
export const playerRules: HintRule[] = [
  active('player.survivalRestore', ({ project }) => {
    const rows = survivalWithoutRestore(project)
    return rows.length ? [hint({ key: 'playerSurvivalRestore', ruleId: 'player.survivalRestore', severity: 'suggest', sectionId: 'survival', entityId: rows[0].id, params: { count: rows.length, names: names(rows) } })] : []
  }),
  active('player.survivalPace', ({ project }) => {
    const levels = comparedLevels(project)
    const mid = levels[Math.floor((levels.length - 1) / 2)]
    const [lo, hi] = SURVIVAL_PACE_MINUTES
    const odd = playerList(project, 'survival')
      .filter((s) => unitOf(s) === 'real minute')
      .map((s) => ({ s, t: timeToCritical(project, s, mid.id || undefined) }))
      .filter((x): x is { s: (typeof x)['s']; t: number } => x.t !== null && (x.t < lo || x.t > hi))
    return odd.length
      ? [hint({ key: 'playerSurvivalPace', ruleId: 'player.survivalPace', severity: 'info', sectionId: 'survival', entityId: odd[0].s.id, params: { level: mid.label, min: lo, max: hi, names: shortList(odd.map((x) => `${x.s.name || '(unnamed)'} ${round(x.t)} min`)) } })]
      : []
  }),
  active('player.survivalDifficulty', ({ project }) => {
    const survivalParams = paramsOf(project).filter((p) => p.category === 'Survival')
    if (!survivalParams.length) return []
    const rows = playerList(project, 'survival').filter((s) => !s.difficultyParam && typeof s.decay === 'number' && s.decay > 0)
    return rows.length ? [hint({ key: 'playerSurvivalDifficulty', ruleId: 'player.survivalDifficulty', severity: 'info', sectionId: 'survival', entityId: rows[0].id, params: { count: rows.length, names: names(rows) } })] : []
  }),
  active('player.curve', ({ project }) => {
    const l = project.documents[DOC]?.data.leveling ?? {}
    if (!String(l.xpFormula ?? '').trim() && levelCap(project) === null) {
      return playerList(project, 'xpSources').length || playerList(project, 'skills').length
        ? [hint({ key: 'playerCurveMissing', ruleId: 'player.curve', severity: 'suggest', sectionId: 'leveling' })]
        : []
    }
    const t = levelTable(project)
    const problems = [
      ...(t.capSet ? [] : ['no level cap']),
      ...(String(l.xpFormula ?? '').trim() ? [] : ['no XP formula']),
      ...(t.error ? [`the formula fails: ${t.error}`] : []),
      ...(t.flat.length ? [`XP does not increase at level ${shortList(t.flat.map(String), 4)}`] : []),
    ]
    return problems.length ? [hint({ key: 'playerCurve', ruleId: 'player.curve', severity: 'suggest', sectionId: 'leveling', params: { names: problems.join('; ') } })] : []
  }),
  active('player.xpSources', ({ project }) => {
    const sources = playerList(project, 'xpSources')
    if (levelCap(project) === null && !String(project.documents[DOC]?.data.leveling?.xpFormula ?? '').trim()) return []
    if (!sources.length) return [hint({ key: 'playerXpSourcesNone', ruleId: 'player.xpSources', severity: 'info', sectionId: 'xpSources', action: { kind: 'addEntity', docId: DOC, sectionId: 'xpSources' } })]
    return sources.some((s) => typeof s.xp === 'number' && typeof s.perHour === 'number')
      ? []
      : [hint({ key: 'playerXpSourcesRate', ruleId: 'player.xpSources', severity: 'info', sectionId: 'xpSources' })]
  }),
  active('player.castCoverage', ({ project }) => {
    const cov = castCoverage(project)
    const out: Hint[] = []
    const noEntry = cov.filter((c) => !c.entry)
    if (noEntry.length && playerList(project, 'casts').length)
      out.push(hint({ key: 'playerCastEntry', ruleId: 'player.castCoverage', severity: 'info', sectionId: 'casts', params: { count: noEntry.length, names: names(noEntry.map((c) => c.cast)) }, action: { kind: 'addEntity', docId: DOC, sectionId: 'casts', init: { cast: noEntry[0].cast.id, name: noEntry[0].cast.label } } }))
    const empty = cov.filter((c) => c.entry && (!c.skills || !c.abilities))
    if (empty.length)
      out.push(hint({ key: 'playerCastContent', ruleId: 'player.castContent', severity: 'suggest', sectionId: 'skills', params: { count: empty.length, names: shortList(empty.map((c) => `${c.cast.label} (${c.skills} skills, ${c.abilities} abilities)`)) } }))
    return out
  }),
  active('player.treeBudget', ({ project }) => {
    const over = treeAnalysis(project).casts.filter((c) => c.skills.length && c.totalCost > 0 && c.budget > 0)
    const tooBig = over.filter((c) => c.totalCost > c.budget)
    const tooSmall = over.filter((c) => c.totalCost < c.budget * 0.5)
    const out: Hint[] = []
    if (tooBig.length)
      out.push(hint({ key: 'playerTreeOver', ruleId: 'player.treeBudget', severity: 'info', sectionId: 'skills', params: { names: shortList(tooBig.map((c) => `${c.cast.label} ${c.totalCost}/${c.budget}`)) } }))
    if (tooSmall.length)
      out.push(hint({ key: 'playerTreeUnder', ruleId: 'player.treeBudget', severity: 'info', sectionId: 'skills', params: { names: shortList(tooSmall.map((c) => `${c.cast.label} ${c.totalCost}/${c.budget}`)) } }))
    return out
  }),
  active('player.treeShape', ({ project }) => {
    const a = treeAnalysis(project)
    const problems = [
      ...(a.cycles.length ? [`circular: ${names(a.cycles)}`] : []),
      ...(a.missingRequires.length ? [`requires a deleted skill: ${names(a.missingRequires)}`] : []),
      ...(a.tierInversions.length ? [`requires a skill on the same or a later tier: ${names(a.tierInversions)}`] : []),
      ...(a.crossCast.length ? [`requires another cast's skill: ${names(a.crossCast)}`] : []),
      ...(a.aboveCap.length ? [`required level above the cap: ${names(a.aboveCap)}`] : []),
      ...(a.unassigned.length ? [`no cast: ${names(a.unassigned)}`] : []),
    ]
    return problems.length ? [hint({ key: 'playerTreeShape', ruleId: 'player.treeShape', severity: 'suggest', sectionId: 'skills', params: { names: problems.join('; ') } })] : []
  }),
  active('player.abilities', ({ project }) => {
    const out: Hint[] = []
    const noAbility = activeSkillsWithoutAbility(project)
    if (noAbility.length)
      out.push(hint({ key: 'playerSkillAbility', ruleId: 'player.abilities', severity: 'info', sectionId: 'skills', entityId: noAbility[0].id, params: { count: noAbility.length, names: names(noAbility) } }))
    const noCost = abilitiesWithoutCost(project)
    if (noCost.length)
      out.push(hint({ key: 'playerAbilityCost', ruleId: 'player.abilityCost', severity: 'info', sectionId: 'abilities', entityId: noCost[0].id, params: { count: noCost.length, names: names(noCost) } }))
    const other = treeAnalysis(project).grantsOtherCast
    if (other.length)
      out.push(hint({ key: 'playerAbilityCast', ruleId: 'player.abilityCast', severity: 'suggest', sectionId: 'skills', entityId: other[0].id, params: { names: names(other) } }))
    return out
  }),
  active('player.startGear', ({ project }) => {
    const rows = playerList(project, 'casts').filter((c) => !(c.startAbilities?.length) && !(c.startGear?.length))
    return rows.length ? [hint({ key: 'playerStartGear', ruleId: 'player.startGear', severity: 'info', sectionId: 'casts', entityId: rows[0].id, params: { count: rows.length, names: names(rows) } })] : []
  }),
]
