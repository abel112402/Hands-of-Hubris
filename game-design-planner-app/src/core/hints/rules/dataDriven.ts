import { DATA_DOC as DOC, dataList, dataModel, duplicatePrefixes, loadPlan, nameOf, pipelineReadiness, schemaFields } from '../../dataDriven'
import type { Hint, HintRule } from '../types'
import { hintId, isDocEmpty, shortList } from '../util'

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

/** Advisory Data-driven Design checks over the declared schemas. Nothing exceeds 'suggest'. */
export const dataDrivenRules: HintRule[] = [
  active('data.type', ({ project }) => {
    const rows = dataModel(project).problems
    return rows.length ? [hint({ key: 'dataType', ruleId: 'data.type', severity: 'suggest', sectionId: 'schemas', entityId: rows[0].schema.id, params: { count: rows.length, names: shortList(rows.map((r) => `${nameOf(r.schema)}.${r.field.name}`)) } })] : []
  }),
  active('data.prefix', ({ project }) => {
    const dup = [...duplicatePrefixes(project)]
    return dup.length ? [hint({ key: 'dataPrefix', ruleId: 'data.prefix', severity: 'suggest', sectionId: 'schemas', entityId: dup[0][1][0].id, params: { names: shortList(dup.map(([pre, s]) => `${pre} (${s.map(nameOf).join(', ')})`), 2) } })] : []
  }),
  active('data.noFields', ({ project }) => {
    const schemas = dataList(project, 'schemas')
    if (!schemas.some((s) => schemaFields(project, s).length)) return []
    const rows = schemas.filter((s) => !schemaFields(project, s).length)
    return rows.length ? [hint({ key: 'dataNoFields', ruleId: 'data.noFields', severity: 'info', sectionId: 'schemas', entityId: rows[0].id, params: { count: rows.length, names: shortList(rows.map(nameOf)) } })] : []
  }),
  active('data.unloaded', ({ project }) => {
    if (!dataList(project, 'loadGroups').length) return []
    const rows = loadPlan(project).unassigned
    return rows.length ? [hint({ key: 'dataUnloaded', ruleId: 'data.unloaded', severity: 'info', sectionId: 'loadGroups', params: { count: rows.length, names: shortList(rows.map(nameOf)) } })] : []
  }),
  active('data.budget', ({ project }) => {
    const rows = loadPlan(project).phases.flatMap((ph) => ph.groups).filter((g) => g.over)
    return rows.length ? [hint({ key: 'dataBudget', ruleId: 'data.budget', severity: 'suggest', sectionId: 'loadGroups', entityId: rows[0].group.id, params: { count: rows.length, names: shortList(rows.map((g) => nameOf(g.group))) } })] : []
  }),
  active('data.unvalidated', ({ project }) => {
    if (!dataList(project, 'validators').length) return []
    const rows = pipelineReadiness(project).rows.filter((r) => !r.cells.validation.ok)
    return rows.length ? [hint({ key: 'dataUnvalidated', ruleId: 'data.unvalidated', severity: 'info', sectionId: 'validators', params: { count: rows.length, names: shortList(rows.map((r) => nameOf(r.schema))) } })] : []
  }),
  active('data.legacy', ({ project }) => {
    const text = project.documents[DOC]?.data.principle?.legacyNotes
    return typeof text === 'string' && text.trim() ? [hint({ key: 'dataLegacy', ruleId: 'data.legacy', severity: 'info', sectionId: 'principle' })] : []
  }),
]
