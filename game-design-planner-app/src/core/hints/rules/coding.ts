import { branchFlow, CODING_DOC as DOC, codingList, enforcementSummary, exampleIssues, folderTree, lfsCoverage, moduleFolders, nameOf, namespaceCheck } from '../../coding'
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

/** Advisory Coding Standards checks over the declared rules. Nothing exceeds 'suggest'. */
export const codingRules: HintRule[] = [
  active('coding.example', ({ project }) => {
    const rows = exampleIssues(project)
    return rows.length ? [hint({ key: 'codingExample', ruleId: 'coding.example', severity: 'suggest', sectionId: 'naming', entityId: rows[0].rule.id, params: { count: rows.length, names: shortList(rows.map((r) => nameOf(r.rule))) } })] : []
  }),
  active('coding.namespace', ({ project }) => {
    const rows = namespaceCheck(project).rows.filter((r) => r.check.pass === false)
    return rows.length ? [hint({ key: 'codingNamespace', ruleId: 'coding.namespace', severity: 'info', sectionId: 'naming', params: { count: rows.length, names: shortList(rows.map((r) => r.assembly)) } })] : []
  }),
  active('coding.unplaced', ({ project }) => {
    if (!codingList(project, 'folders').length) return []
    const rows = moduleFolders(project).unplaced
    return rows.length ? [hint({ key: 'codingUnplaced', ruleId: 'coding.unplaced', severity: 'info', sectionId: 'folders', params: { count: rows.length, names: shortList(rows.map(nameOf)) } })] : []
  }),
  active('coding.folderLoop', ({ project }) => {
    const rows = folderTree(project).loops
    return rows.length ? [hint({ key: 'codingFolderLoop', ruleId: 'coding.folderLoop', severity: 'info', sectionId: 'folders', entityId: rows[0].id, params: { names: shortList(rows.map(nameOf)) } })] : []
  }),
  active('coding.lfs', ({ project }) => {
    const rows = lfsCoverage(project).filter((r) => !r.covered)
    return rows.length ? [hint({ key: 'codingLfs', ruleId: 'coding.lfs', severity: 'suggest', sectionId: 'git', params: { count: rows.length, names: shortList(rows.map((r) => r.ext), 5) } })] : []
  }),
  active('coding.branch', ({ project }) => {
    const rows = branchFlow(project).filter((r) => r.issues.some((i) => i !== 'unprotectedMain'))
    return rows.length ? [hint({ key: 'codingBranch', ruleId: 'coding.branch', severity: 'info', sectionId: 'branches', entityId: rows[0].branch.id, params: { count: rows.length, names: shortList(rows.map((r) => nameOf(r.branch))) } })] : []
  }),
  active('coding.protect', ({ project }) => {
    const rows = branchFlow(project).filter((r) => r.issues.includes('unprotectedMain'))
    return rows.length ? [hint({ key: 'codingProtect', ruleId: 'coding.protect', severity: 'info', sectionId: 'branches', entityId: rows[0].branch.id, params: { names: shortList(rows.map((r) => nameOf(r.branch))) } })] : []
  }),
  active('coding.manualBlocker', ({ project }) => {
    const rows = enforcementSummary(project).manualBlockers
    return rows.length ? [hint({ key: 'codingManualBlocker', ruleId: 'coding.manualBlocker', severity: 'info', sectionId: 'review', params: { count: rows.length, names: shortList(rows.map((r) => nameOf(r.rule))) } })] : []
  }),
  active('coding.legacy', ({ project }) => {
    const text = project.documents[DOC]?.data.standards?.legacyNotes
    return typeof text === 'string' && text.trim() ? [hint({ key: 'codingLegacy', ruleId: 'coding.legacy', severity: 'info', sectionId: 'standards' })] : []
  }),
]
