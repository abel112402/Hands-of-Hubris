import type { Entity } from '../../model/types'
import type { Hint, HintRule } from '../types'
import { entitiesOf, entityName, hintId, isBlank, isDocEmpty, shortList } from '../util'
import { pillarCoverage, pillarList, pitchCheck, scopeList, scopeWithoutPillar, uspWithoutPillar } from '../../vision'

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
  {
    id: 'vision.pitchShape',
    scope: 'section',
    appliesTo: ({ project, docId }) => docId === DOC && !isDocEmpty(project, DOC),
    evaluate: ({ project }) => {
      const text = String(project.documents[DOC]?.data.pitch?.pitch ?? '')
      const { words, problems } = pitchCheck(text)
      const real = problems.filter((p) => p !== 'empty')
      if (!text.trim() || !real.length) return []
      return [hint({ key: 'visionPitchShape', ruleId: 'vision.pitchShape', severity: 'info', sectionId: 'pitch', params: { words, problems: real.join(', ') } })]
    },
  },
  {
    id: 'vision.scopeNoPillar',
    scope: 'entity',
    appliesTo: ({ project, docId }) => docId === DOC && !isDocEmpty(project, DOC),
    evaluate: ({ project }) => {
      if (!pillarList(project).length) return []
      const loose = scopeWithoutPillar(project).filter((e) => e.bucket === 'In MVP')
      return loose.length
        ? [hint({ key: 'visionScopeNoPillar', ruleId: 'vision.scopeNoPillar', severity: 'suggest', sectionId: 'scope', entityId: loose[0].id, params: { count: loose.length, names: names(loose) } })]
        : []
    },
  },
  {
    id: 'vision.uspPillar',
    scope: 'entity',
    appliesTo: ({ project, docId }) => docId === DOC && !isDocEmpty(project, DOC),
    evaluate: ({ project }) => {
      if (!pillarList(project).length) return []
      const loose = uspWithoutPillar(project)
      return loose.length
        ? [hint({ key: 'visionUspPillar', ruleId: 'vision.uspPillar', severity: 'info', sectionId: 'usps', entityId: loose[0].id, params: { count: loose.length, names: names(loose) } })]
        : []
    },
  },
  {
    id: 'vision.pillarUsage',
    scope: 'entity',
    appliesTo: ({ project, docId }) => docId === DOC && !isDocEmpty(project, DOC),
    evaluate: ({ project }) => {
      // Only meaningful once something has been linked to a pillar; otherwise the link hints above already cover it.
      const cov = pillarCoverage(project)
      if (!cov.some((c) => !c.unused)) return []
      const unused = cov.filter((c) => c.unused).map((c) => c.pillar)
      const out: Hint[] = []
      if (unused.length)
        out.push(hint({ key: 'visionPillarUnused', ruleId: 'vision.pillarUnused', severity: 'info', sectionId: 'pillars', entityId: unused[0].id, params: { count: unused.length, names: names(unused) } }))
      const noMvp = cov.filter((c) => !c.unused && c.notInMvp).map((c) => c.pillar)
      if (noMvp.length && scopeList(project).some((e) => e.bucket === 'In MVP'))
        out.push(hint({ key: 'visionPillarNotInMvp', ruleId: 'vision.pillarNotInMvp', severity: 'info', sectionId: 'pillars', entityId: noMvp[0].id, params: { count: noMvp.length, names: names(noMvp) } }))
      return out
    },
  },
]
