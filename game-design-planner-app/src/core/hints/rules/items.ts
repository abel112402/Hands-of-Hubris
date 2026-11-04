import { basicsMissing, coverage, ITEMS_DOC as DOC, itemList, lootProblems, orphanItems, recipeProblems, tierProblems, typeFieldMismatches, valueAdded } from '../../items'
import type { Hint, HintRule } from '../types'
import { hintId, isDocEmpty, shortList } from '../util'

/** Crafting worth more than this multiple of its ingredients is flagged as possibly too generous. */
export const VALUE_ADDED_MAX = 3

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
const r2 = (n: number) => Math.round(n * 100) / 100

/** Advisory item checks; content gaps are often unfinished work, so nothing exceeds 'suggest'. */
export const itemRules: HintRule[] = [
  active('items.noSource', ({ project }) => {
    const rows = orphanItems(project).noSource
    return rows.length ? [hint({ key: 'itemsNoSource', ruleId: 'items.noSource', severity: 'suggest', sectionId: 'items', entityId: rows[0].id, params: { count: rows.length, names: names(rows) } })] : []
  }),
  active('items.unused', ({ project }) => {
    const rows = orphanItems(project).unused
    return rows.length ? [hint({ key: 'itemsUnused', ruleId: 'items.unused', severity: 'info', sectionId: 'items', entityId: rows[0].id, params: { count: rows.length, names: names(rows) } })] : []
  }),
  active('items.recipeShape', ({ project }) => {
    const p = recipeProblems(project)
    const problems = [
      ...(p.noResult.length ? [`no result: ${names(p.noResult)}`] : []),
      ...(p.noIngredients.length ? [`no ingredients: ${names(p.noIngredients)}`] : []),
      ...(p.noStation.length ? [`no station: ${names(p.noStation)}`] : []),
      ...(p.cycles.length ? [`loops back on itself: ${names(p.cycles)}`] : []),
      ...(p.tierInversions.length ? [`uses an ingredient from a higher tier: ${names(p.tierInversions)}`] : []),
    ]
    return problems.length ? [hint({ key: 'itemsRecipeShape', ruleId: 'items.recipeShape', severity: 'suggest', sectionId: 'recipes', params: { names: problems.join('; ') } })] : []
  }),
  active('items.valueLoss', ({ project }) => {
    const rows = itemList(project, 'recipes')
      .map((r) => ({ r, v: valueAdded(project, r) }))
      .filter((x): x is { r: (typeof x)['r']; v: NonNullable<(typeof x)['v']> } => x.v !== null && (x.v.ratio < 1 || x.v.ratio > VALUE_ADDED_MAX))
    return rows.length
      ? [hint({ key: 'itemsValueLoss', ruleId: 'items.valueLoss', severity: 'suggest', sectionId: 'recipes', entityId: rows[0].r.id, params: { max: VALUE_ADDED_MAX, names: shortList(rows.map((x) => `${x.r.name || '(unnamed)'} ×${x.v.ratio === Infinity ? '∞' : r2(x.v.ratio)}`)) } })]
      : []
  }),
  active('items.coverage', ({ project }) => {
    const holes = coverage(project).holes
    return holes.length
      ? [hint({ key: 'itemsCoverage', ruleId: 'items.coverage', severity: 'info', sectionId: 'items', params: { count: holes.length, names: shortList(holes.map((h) => `${h.type.label} ${h.rarity.label}`), 5) } })]
      : []
  }),
  active('items.tiers', ({ project }) => {
    const problems = tierProblems(project)
    return problems.length ? [hint({ key: 'itemsTiers', ruleId: 'items.tiers', severity: 'suggest', sectionId: 'rarityTiers', params: { names: shortList(problems, 3) } })] : []
  }),
  active('items.loot', ({ project }) => {
    const rows = lootProblems(project)
    return rows.length ? [hint({ key: 'itemsLoot', ruleId: 'items.loot', severity: 'suggest', sectionId: 'loot', entityId: rows[0].id, params: { count: rows.length, names: names(rows) } })] : []
  }),
  active('items.typeFields', ({ project }) => {
    const rows = typeFieldMismatches(project)
    return rows.length
      ? [hint({ key: 'itemsTypeFields', ruleId: 'items.typeFields', severity: 'info', sectionId: 'items', entityId: rows[0].item.id, params: { names: shortList(rows.map((x) => `${x.item.name || '(unnamed)'} (${x.groups.join(', ')})`)) } })]
      : []
  }),
  active('items.basics', ({ project }) => {
    const rows = basicsMissing(project)
    return rows.length ? [hint({ key: 'itemsBasics', ruleId: 'items.basics', severity: 'info', sectionId: 'items', entityId: rows[0].id, params: { count: rows.length, names: names(rows) } })] : []
  }),
]
