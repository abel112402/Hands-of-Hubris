import { getModule } from '../../modules/registry'
import type { HintRule } from '../types'
import { hintId, isDocEmpty } from '../util'

/** Recommended order, following docs/README.md: vision first, then the core design documents. */
export const ONBOARDING_ORDER = [
  'overview.vision',
  'design.coreLoop',
  'design.player',
  'design.world',
  'design.items',
  'design.npc',
  'design.combat',
  'design.trade',
  'design.story',
  'production.milestones',
  'qa.testPlan',
]

const DESIGN_DOCS = ONBOARDING_ORDER.filter((d) => d.startsWith('design.'))

export const projectRules: HintRule[] = [
  {
    id: 'onboarding.next',
    scope: 'project',
    evaluate: ({ project }) =>
      ONBOARDING_ORDER.filter((d) => getModule(d) && isDocEmpty(project, d))
        .slice(0, 3)
        // All onboarding steps share one severity, so their colour does not depend on their position.
        .map((docId) => ({
          id: hintId('onboarding.next', docId),
          ruleId: 'onboarding.next',
          severity: 'info',
          scope: 'project',
          target: { docId },
          titleKey: 'hints.onboarding.next.title',
          bodyKey: 'hints.onboarding.next.body',
          params: { doc: getModule(docId)!.title },
          action: { kind: 'goto', docId },
        })),
  },
  {
    id: 'dependency.visionFirst',
    scope: 'project',
    appliesTo: ({ project }) => isDocEmpty(project, 'overview.vision'),
    evaluate: ({ project }) =>
      DESIGN_DOCS.some((d) => !isDocEmpty(project, d))
        ? [
            {
              id: 'dependency.visionFirst',
              ruleId: 'dependency.visionFirst',
              severity: 'important',
              scope: 'project',
              target: { docId: 'overview.vision' },
              titleKey: 'hints.visionFirst.title',
              bodyKey: 'hints.visionFirst.body',
              action: { kind: 'goto', docId: 'overview.vision' },
            },
          ]
        : [],
  },
]
