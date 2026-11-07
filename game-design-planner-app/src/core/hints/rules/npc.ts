import {
  bondLadder,
  eventOdds,
  formulaProblems,
  lifespan,
  routineStrips,
  incompleteEvents,
  jobBuildingMismatches,
  lifecycleIssues,
  NPC_DOC as DOC,
  needRulesWithoutConsequence,
  needRulesWithoutSupply,
  needsWithoutRule,
  npcList,
  professionsWithoutJob,
  rangeProblems,
  relationLevelAnalysis,
  scenarioShortfalls,
  shareTotal,
  stageAnalysis,
  statScale,
  statsOutOfRange,
  statsWithoutRule,
} from '../../npc'
import { seasonYear, yearLength } from '../../timeWeather'
import type { Hint, HintRule } from '../types'
import { hintId, isDocEmpty, shortList } from '../util'
import { countOf } from '../../text'

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

/** Advisory NPC checks. Coverage gaps are often just unfinished work, so nothing exceeds 'suggest'. */
export const npcRules: HintRule[] = [
  active('npc.statCoverage', ({ project }) => {
    if (!npcList(project, 'statRules').length && !npcList(project, 'archetypes').length) return []
    const missing = statsWithoutRule(project)
    return missing.length
      ? [hint({ key: 'npcStatCoverage', ruleId: 'npc.statCoverage', severity: 'info', sectionId: 'statRules', params: { count: missing.length, names: names(missing) }, action: { kind: 'addEntity', docId: DOC, sectionId: 'statRules', init: { stat: missing[0].id, name: missing[0].label } } })]
      : []
  }),
  active('npc.needCoverage', ({ project }) => {
    const missing = needsWithoutRule(project)
    const noConsequence = needRulesWithoutConsequence(project)
    const out: Hint[] = []
    if (missing.length && (npcList(project, 'needRules').length || npcList(project, 'archetypes').length))
      out.push(hint({ key: 'npcNeedCoverage', ruleId: 'npc.needCoverage', severity: 'suggest', sectionId: 'needRules', params: { count: missing.length, names: names(missing) }, action: { kind: 'addEntity', docId: DOC, sectionId: 'needRules', init: { need: missing[0].id, name: missing[0].label } } }))
    if (noConsequence.length)
      out.push(hint({ key: 'npcNeedConsequence', ruleId: 'npc.needConsequence', severity: 'suggest', sectionId: 'needRules', entityId: noConsequence[0].id, params: { count: noConsequence.length, names: names(noConsequence) } }))
    return out
  }),
  active('npc.needSupply', ({ project }) => {
    const rows = needRulesWithoutSupply(project)
    return rows.length ? [hint({ key: 'npcNeedSupply', ruleId: 'npc.needSupply', severity: 'info', sectionId: 'needRules', entityId: rows[0].id, params: { count: rows.length, names: names(rows) } })] : []
  }),
  active('npc.statRange', ({ project }) => {
    const rows = statsOutOfRange(project)
    const [lo, hi] = statScale(project)
    return rows.length ? [hint({ key: 'npcStatRange', ruleId: 'npc.statRange', severity: 'suggest', sectionId: 'archetypes', entityId: rows[0].id, params: { count: rows.length, names: names(rows), min: lo, max: hi } })] : []
  }),
  active('npc.formula', ({ project }) => {
    const bad = formulaProblems(project)
    return bad.length
      ? [hint({ key: 'npcFormula', ruleId: 'npc.formula', severity: 'suggest', sectionId: 'statRules', params: { count: bad.length, names: shortList(bad.map((b) => `${String(b.entity.name ?? '')}: ${b.error}`), 2) } })]
      : []
  }),
  active('npc.stages', ({ project }) => {
    if (!npcList(project, 'lifeStages').length) return []
    const problems = rangeProblems(stageAnalysis(project))
    return problems.length ? [hint({ key: 'npcStages', ruleId: 'npc.stages', severity: 'suggest', sectionId: 'lifeStages', params: { names: shortList(problems, 4) } })] : []
  }),
  active('npc.relationLevels', ({ project }) => {
    if (!npcList(project, 'relationLevels').length) return []
    const problems = rangeProblems(relationLevelAnalysis(project))
    return problems.length ? [hint({ key: 'npcRelationLevels', ruleId: 'npc.relationLevels', severity: 'info', sectionId: 'relationLevels', params: { names: shortList(problems, 4) } })] : []
  }),
  active('npc.lifecycle', ({ project }) => {
    const l = lifecycleIssues(project)
    if (!l) return []
    const problems = [
      ...(l.noStart ? ['no Start node'] : []),
      ...(l.noEnd ? ['no End node'] : []),
      ...(l.unreachable.length ? [`unreachable from Start: ${names(l.unreachable)}`] : []),
      ...(l.deadEnds.length ? [`dead ends: ${names(l.deadEnds)}`] : []),
      ...(l.eventEdgesWithoutEvent ? [`${countOf(l.eventEdgesWithoutEvent, '“on event” connection')} without an event`] : []),
      ...(l.stagesMissing.length ? [`stages not in the diagram: ${names(l.stagesMissing)}`] : []),
    ]
    return problems.length ? [hint({ key: 'npcLifecycle', ruleId: 'npc.lifecycle', severity: 'suggest', sectionId: 'lifecycle', params: { names: problems.join('; ') } })] : []
  }),
  active('npc.professions', ({ project }) => {
    const out: Hint[] = []
    const noJob = professionsWithoutJob(project)
    if (noJob.length)
      out.push(hint({ key: 'npcProfessionJob', ruleId: 'npc.professions', severity: 'info', sectionId: 'jobs', params: { count: noJob.length, names: names(noJob) }, action: { kind: 'addEntity', docId: DOC, sectionId: 'jobs', init: { profession: noJob[0].id, name: noJob[0].label } } }))
    const mismatch = jobBuildingMismatches(project)
    if (mismatch.length)
      out.push(hint({ key: 'npcJobBuilding', ruleId: 'npc.jobBuilding', severity: 'suggest', sectionId: 'jobs', entityId: mismatch[0].job.id, params: { count: mismatch.length, names: shortList(mismatch.map((m) => `${String(m.job.name ?? '')} → ${String(m.building.name ?? '')}`)) } }))
    return out
  }),
  active('npc.shares', ({ project }) => {
    const total = shareTotal(project)
    return total !== null && Math.abs(total - 100) > 0.5 ? [hint({ key: 'npcShares', ruleId: 'npc.shares', severity: 'info', sectionId: 'archetypes', params: { total: Math.round(total * 10) / 10 } })] : []
  }),
  active('npc.events', ({ project }) => {
    const rows = incompleteEvents(project)
    return rows.length ? [hint({ key: 'npcEvents', ruleId: 'npc.events', severity: 'info', sectionId: 'events', entityId: rows[0].id, params: { count: rows.length, names: names(rows) } })] : []
  }),
  active('npc.noWorkStage', ({ project }) => {
    const l = lifespan(project)
    return l.rows.length && !l.rows.some((r) => r.canWork) ? [hint({ key: 'npcNoWorkStage', ruleId: 'npc.noWorkStage', severity: 'suggest', sectionId: 'lifeStages', params: { count: l.rows.length } })] : []
  }),
  active('npc.bondLevel', ({ project }) => {
    if (!npcList(project, 'relationLevels').length) return []
    const loose = bondLadder(project).loose
    return loose.length ? [hint({ key: 'npcBondLevel', ruleId: 'npc.bondLevel', severity: 'info', sectionId: 'bonds', entityId: loose[0].id, params: { count: loose.length, names: names(loose) } })] : []
  }),
  active('npc.eventFrequent', ({ project }) => {
    const days = yearLength(project)
    const rows = eventOdds(project, days, seasonYear(project).ranges.length || 4).filter((r) => r.perYear !== null && r.perYear > days / 7)
    return rows.length ? [hint({ key: 'npcEventFrequent', ruleId: 'npc.eventFrequent', severity: 'info', sectionId: 'events', entityId: rows[0].event.id, params: { count: rows.length, names: names(rows.map((r) => r.event)) } })] : []
  }),
  active('npc.routineWork', ({ project }) => {
    const strips = routineStrips(project)
    if (!strips.rows.some((r) => r.slots.some(Boolean))) return []
    const withJob = new Set(npcList(project, 'jobs').map((j) => j.profession).filter(Boolean))
    const idle = strips.rows.filter((r) => withJob.has(r.profession.id) && !r.slots.includes('Work')).map((r) => r.profession)
    return idle.length ? [hint({ key: 'npcRoutineWork', ruleId: 'npc.routineWork', severity: 'info', sectionId: 'routine', params: { count: idle.length, names: names(idle) } })] : []
  }),
  active('npc.balance', ({ project }) => {
    const short = scenarioShortfalls(project)
    return short.length
      ? [hint({ key: 'npcBalance', ruleId: 'npc.balance', severity: 'suggest', sectionId: 'scenarios', entityId: short[0].scenario.id, params: { count: short.length, names: shortList(short.map((s) => `${String(s.scenario.name ?? '')}: ${s.short.map((r) => r.label).join(', ')}`), 2) } })]
      : []
  }),
]
