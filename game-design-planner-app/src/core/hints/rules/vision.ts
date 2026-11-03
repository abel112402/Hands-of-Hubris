import type { Entity } from '../../model/types'
import type { Hint, HintRule } from '../types'
import { entitiesOf, entityName, hintId, isBlank, isDocEmpty, shortList } from '../util'

const DOC = 'overview.vision'
const PILLAR_RANGE = [3, 5] as const

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

const names = (list: Entity[]) => shortList(list.map(entityName))

/** Soft readiness prompts for the vision. Never above 'suggest': a draft vision is not an error. */
export const visionRules: HintRule[] = [
  {
    id: 'vision.pitch',
    scope: 'section',
    appliesTo: ({ project, docId }) => docId === DOC && !isDocEmpty(project, DOC),
    evaluate: ({ project }) =>
      isBlank(project.documents[DOC]?.data.pitch?.pitch?.trim?.())
        ? [hint({ key: 'visionPitch', ruleId: 'vision.pitch', severity: 'suggest', sectionId: 'pitch' })]
        : [],
  },
  {
    id: 'vision.pillars',
    scope: 'section',
    appliesTo: ({ project, docId }) => docId === DOC && !isDocEmpty(project, DOC),
    evaluate: ({ project }) => {
      const pillars = entitiesOf(project, DOC, 'pillars')
      const [min, max] = PILLAR_RANGE
      if (!pillars.length)
        return [
          hint({
            key: 'visionNoPillars',
            ruleId: 'vision.pillars',
            severity: 'suggest',
            sectionId: 'pillars',
            action: { kind: 'addEntity', docId: DOC, sectionId: 'pillars' },
          }),
        ]
      if (pillars.length < min || pillars.length > max)
        return [
          hint({
            key: 'visionPillarCount',
            ruleId: 'vision.pillarCount',
            severity: 'info',
            sectionId: 'pillars',
            params: { count: pillars.length, min, max },
          }),
        ]
      return []
    },
  },
  {
    id: 'vision.pillarTest',
    scope: 'entity',
    appliesTo: ({ docId }) => docId === DOC,
    evaluate: ({ project }) => {
      const missing = entitiesOf(project, DOC, 'pillars').filter((e) => isBlank(e.decisionTest))
      return missing.length
        ? [
            hint({
              key: 'visionPillarTest',
              ruleId: 'vision.pillarTest',
              severity: 'info',
              sectionId: 'pillars',
              entityId: missing[0].id,
              params: { count: missing.length, names: names(missing) },
            }),
          ]
        : []
    },
  },
  {
    id: 'vision.uspBenefit',
    scope: 'entity',
    appliesTo: ({ docId }) => docId === DOC,
    evaluate: ({ project }) => {
      const missing = entitiesOf(project, DOC, 'usps').filter((e) => isBlank(e.playerBenefit))
      return missing.length
        ? [
            hint({
              key: 'visionUspBenefit',
              ruleId: 'vision.uspBenefit',
              severity: 'info',
              sectionId: 'usps',
              entityId: missing[0].id,
              params: { count: missing.length, names: names(missing) },
            }),
          ]
        : []
    },
  },
  {
    id: 'vision.scope',
    scope: 'section',
    appliesTo: ({ docId }) => docId === DOC,
    evaluate: ({ project }) => {
      const items = entitiesOf(project, DOC, 'scope')
      if (!items.length) return []
      const undecided = items.filter((e) => isBlank(e.bucket))
      if (undecided.length)
        return [
          hint({
            key: 'visionScopeBucket',
            ruleId: 'vision.scopeBucket',
            severity: 'suggest',
            sectionId: 'scope',
            entityId: undecided[0].id,
            params: { count: undecided.length, names: names(undecided) },
          }),
        ]
      if (!items.some((e) => e.bucket === 'In MVP'))
        return [hint({ key: 'visionScopeMvp', ruleId: 'vision.scopeMvp', severity: 'info', sectionId: 'scope' })]
      return []
    },
  },
]
