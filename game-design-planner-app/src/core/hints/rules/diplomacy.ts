import { actionEffect, actionsOf, analyzeRanges, asymmetricPairs, DIPLOMACY_DOC as DOC, graphDisagreements, markProblems, scaleOf } from '../../diplomacy'
import { unlinkedFactions } from '../../diplomacyFootprint'
import type { Hint, HintRule } from '../types'
import { entitiesOf, hintId, isBlank, shortList } from '../util'

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
  appliesTo: ({ project, docId }) => docId === DOC && entitiesOf(project, DOC, 'factions').length > 0,
  evaluate,
})

const FACTION_PARTS: [string, string][] = [['goals', 'goals'], ['capital', 'capital'], ['characters', 'characters']]

/** Advisory relationship checks. Asymmetric or mismatched relations can be intentional, so nothing exceeds 'suggest'. */
export const diplomacyRules: HintRule[] = [
  active('diplomacy.profile', ({ project }) => {
    const gaps = entitiesOf(project, DOC, 'factions').filter((f) => FACTION_PARTS.some(([k]) => isBlank(f[k])))
    return gaps.length
      ? [
          hint({
            key: 'diplomacyProfile',
            ruleId: 'diplomacy.profile',
            severity: 'info',
            sectionId: 'factions',
            entityId: gaps[0].id,
            params: { count: gaps.length, names: shortList(gaps.map((f) => String(f.name ?? ''))) },
          }),
        ]
      : []
  }),
  active('diplomacy.levels', ({ project }) => {
    const levels = entitiesOf(project, DOC, 'thresholds')
    if (!levels.length)
      return [hint({ key: 'diplomacyNoThresholds', ruleId: 'diplomacy.thresholds', severity: 'suggest', sectionId: 'thresholds', action: { kind: 'addEntity', docId: DOC, sectionId: 'thresholds' } })]
    const a = analyzeRanges(levels, scaleOf(project))
    const problems = [
      ...a.rows.filter((r) => r.overlaps).map((r) => `${r.name} overlaps`),
      ...a.rows.filter((r) => r.gapBefore).map((r) => `gap before ${r.name}`),
      ...(a.gapAtBottom ? ['values below the first level'] : []),
      ...(a.gapAtTop ? ['values above the last level'] : []),
      ...a.unset.map((l) => `${String(l.name ?? '')} has no minimum`),
    ]
    return problems.length
      ? [hint({ key: 'diplomacyRanges', ruleId: 'diplomacy.ranges', severity: 'suggest', sectionId: 'thresholds', params: { names: shortList(problems, 4) } })]
      : []
  }),
  active('diplomacy.asymmetry', ({ project }) => {
    const pairs = asymmetricPairs(project)
    return pairs.length
      ? [
          hint({
            key: 'diplomacyAsymmetry',
            ruleId: 'diplomacy.asymmetry',
            severity: 'info',
            sectionId: 'relations',
            params: { count: pairs.length, names: shortList(pairs.map((p) => `${p.a.name} ↔ ${p.b.name}`)) },
          }),
        ]
      : []
  }),
  active('diplomacy.graph', ({ project }) => {
    const bad = graphDisagreements(project)
    return bad.length
      ? [
          hint({
            key: 'diplomacyGraph',
            ruleId: 'diplomacy.graph',
            severity: 'suggest',
            sectionId: 'relationGraph',
            params: { count: bad.length, names: shortList(bad.map((b) => `${b.from.name} – ${b.to.name} (${b.kind}, matrix ${b.value})`)) },
          }),
        ]
      : []
  }),
  active('diplomacy.matrix', ({ project }) => {
    const factions = entitiesOf(project, DOC, 'factions')
    if (factions.length < 2) return []
    const cells = project.documents[DOC]?.data.relations?.cells ?? {}
    const missing = factions.reduce((n, a) => n + factions.filter((b) => b.id !== a.id && cells[`${a.id}|${b.id}`] === undefined).length, 0)
    return missing
      ? [hint({ key: 'diplomacyMatrix', ruleId: 'diplomacy.matrix', severity: 'info', sectionId: 'relations', params: { count: missing } })]
      : []
  }),
  active('diplomacy.spillover', ({ project }) => {
    const hostile = (project.documents[DOC]?.data.overview?.enemyAt as number | undefined) ?? -50
    const cells = project.documents[DOC]?.data.relations?.cells ?? {}
    const rows = entitiesOf(project, DOC, 'actions').filter((a) => {
      const has = Object.keys(a.spillover ?? {}).length > 0 || typeof a.spilloverDefault === 'number'
      const rivals = entitiesOf(project, DOC, 'factions').some((f) => f.id !== a.faction && (cells[`${a.faction}|${f.id}`] ?? 0) <= hostile)
      return a.faction && rivals && !has
    })
    return rows.length
      ? [
          hint({
            key: 'diplomacySpillover',
            ruleId: 'diplomacy.spillover',
            severity: 'info',
            sectionId: 'actions',
            entityId: rows[0].id,
            params: { count: rows.length, names: shortList(rows.map((a) => String(a.name ?? ''))) },
          }),
        ]
      : []
  }),
  active('diplomacy.marks', ({ project }) => {
    const problems = markProblems(project)
    return problems.length
      ? [hint({ key: 'diplomacyMarks', ruleId: 'diplomacy.marks', severity: 'info', sectionId: 'overview', params: { names: shortList(problems, 4) } })]
      : []
  }),
  active('diplomacy.unlinked', ({ project }) => {
    const loose = unlinkedFactions(project)
    return loose.length
      ? [
          hint({
            key: 'diplomacyUnlinked',
            ruleId: 'diplomacy.unlinked',
            severity: 'info',
            sectionId: 'factions',
            entityId: loose[0].id,
            params: { count: loose.length, names: shortList(loose.map((f) => String(f.name ?? ''))) },
          }),
        ]
      : []
  }),
  active('diplomacy.untouched', ({ project }) => {
    const actions = actionsOf(project).filter((a) => a.faction)
    if (!actions.length) return []
    const none = entitiesOf(project, DOC, 'factions').filter((f) => actions.every((a) => actionEffect(a, f.id) === 0))
    return none.length
      ? [hint({ key: 'diplomacyUntouched', ruleId: 'diplomacy.untouched', severity: 'info', sectionId: 'actions', params: { count: none.length, names: shortList(none.map((f) => String(f.name ?? ''))) } })]
      : []
  }),
]
