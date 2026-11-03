import { analyzeDifficulty, DIFFICULTY_DOC as DOC, paramsOf } from '../../difficulty'
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

const rule = (id: string, evaluate: HintRule['evaluate']): HintRule => ({
  id,
  scope: 'section',
  appliesTo: ({ project, docId }) => docId === DOC && paramsOf(project).length > 0,
  evaluate,
})

/** Soft tuning prompts for difficulty. Never above 'suggest': designers may break "harder = higher" on purpose. */
export const difficultyRules: HintRule[] = [
  rule('difficulty.missing', ({ project }) => {
    const { missing } = analyzeDifficulty(project)
    return missing.length
      ? [
          hint({
            key: 'difficultyMissing',
            ruleId: 'difficulty.missing',
            severity: 'suggest',
            sectionId: 'values',
            params: { names: shortList(missing.map((m) => `${m.level.label} (${m.params.length})`)) },
          }),
        ]
      : []
  }),
  rule('difficulty.range', ({ project }) => {
    const { outOfRange } = analyzeDifficulty(project)
    return outOfRange.length
      ? [
          hint({
            key: 'difficultyRange',
            ruleId: 'difficulty.range',
            severity: 'suggest',
            sectionId: 'values',
            params: { count: outOfRange.length, names: shortList(outOfRange.map((o) => `${o.param.name} / ${o.level.label}`)) },
          }),
        ]
      : []
  }),
  rule('difficulty.reversal', ({ project }) => {
    const { reversals } = analyzeDifficulty(project)
    return reversals.length
      ? [
          hint({
            key: 'difficultyReversal',
            ruleId: 'difficulty.reversal',
            severity: 'suggest',
            sectionId: 'values',
            params: { names: shortList(reversals.map((r) => `${r.param.name} (${r.from.label} → ${r.to.label})`)) },
          }),
        ]
      : []
  }),
  rule('difficulty.context', ({ project }) => {
    const { noContext } = analyzeDifficulty(project)
    return noContext.length
      ? [
          hint({
            key: 'difficultyContext',
            ruleId: 'difficulty.context',
            severity: 'info',
            sectionId: 'params',
            entityId: noContext[0].id,
            params: { count: noContext.length, names: shortList(noContext.map((p) => p.name)) },
          }),
        ]
      : []
  }),
  rule('difficulty.intent', ({ project }) => {
    const presets = entitiesOf(project, DOC, 'presets')
    const open = presets.filter((p) => isBlank(p.intent))
    if (!presets.length)
      return [hint({ key: 'difficultyNoPresets', ruleId: 'difficulty.intent', severity: 'info', sectionId: 'presets', action: { kind: 'addEntity', docId: DOC, sectionId: 'presets' } })]
    return open.length
      ? [
          hint({
            key: 'difficultyIntent',
            ruleId: 'difficulty.intent',
            severity: 'info',
            sectionId: 'presets',
            entityId: open[0].id,
            params: { count: open.length, names: shortList(open.map((p) => p.name)) },
          }),
        ]
      : []
  }),
]
