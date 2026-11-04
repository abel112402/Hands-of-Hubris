import { analyzeTown, TOWN_DOC as DOC } from '../../town'
import type { Hint, HintRule } from '../types'
import { entitiesOf, hintId, shortList } from '../util'

type Draft = Omit<Hint, 'id' | 'scope' | 'target' | 'titleKey' | 'bodyKey'> & { key: string; sectionId: string }

const hint = (d: Draft): Hint => ({
  id: hintId(d.ruleId),
  ruleId: d.ruleId,
  severity: d.severity,
  scope: 'section',
  target: { docId: DOC, sectionId: d.sectionId },
  titleKey: `hints.${d.key}.title`,
  bodyKey: `hints.${d.key}.body`,
  params: d.params,
  action: { kind: 'goto', docId: DOC, sectionId: d.sectionId },
})

const rule = (id: string, evaluate: HintRule['evaluate']): HintRule => ({
  id,
  scope: 'section',
  appliesTo: ({ project, docId }) => docId === DOC && entitiesOf(project, DOC, 'buildings').length > 0,
  evaluate,
})

/** Advisory checks on the town economy. Rates are estimates, so nothing exceeds 'suggest'. */
export const townRules: HintRule[] = [
  rule('town.noSource', ({ project }) => {
    const { noSource } = analyzeTown(project)
    return noSource.length ? [hint({ key: 'townNoSource', ruleId: 'town.noSource', severity: 'suggest', sectionId: 'buildings', params: { names: shortList(noSource) } })] : []
  }),
  rule('town.noConsumer', ({ project }) => {
    const { noConsumer } = analyzeTown(project)
    return noConsumer.length ? [hint({ key: 'townNoConsumer', ruleId: 'town.noConsumer', severity: 'info', sectionId: 'buildings', params: { names: shortList(noConsumer) } })] : []
  }),
  rule('town.depleting', ({ project }) => {
    const { depleting } = analyzeTown(project)
    return depleting.length
      ? [hint({ key: 'townDepleting', ruleId: 'town.depleting', severity: 'suggest', sectionId: 'buildings', params: { names: shortList(depleting.map((d) => d.label)) } })]
      : []
  }),
  rule('town.workforce', ({ project }) => {
    const { workforceShortage } = analyzeTown(project)
    return workforceShortage > 0
      ? [hint({ key: 'townWorkforce', ruleId: 'town.workforce', severity: 'suggest', sectionId: 'buildings', params: { count: Math.round(workforceShortage * 100) / 100 } })]
      : []
  }),
  rule('town.routes', ({ project }) => {
    const { routeProblems } = analyzeTown(project)
    return routeProblems.length ? [hint({ key: 'townRoutes', ruleId: 'town.routes', severity: 'suggest', sectionId: 'routes', params: { names: shortList(routeProblems, 3) } })] : []
  }),
  rule('town.bases', ({ project }) => {
    const { baseProblems } = analyzeTown(project)
    return baseProblems.length ? [hint({ key: 'townBases', ruleId: 'town.bases', severity: 'suggest', sectionId: 'bases', params: { names: shortList(baseProblems, 3) } })] : []
  }),
]
