import { tryEvaluate, variablesOf } from '../../formula'
import { findUsages, resolveSource } from '../../references/refs'
import type { FieldDef } from '../../model/types'
import { hiddenGroups } from '../../groupFilter'
import type { Hint, HintRule } from '../types'
import { entitiesOf, entityName, hintId, isBlank, isSectionEmpty, quartiles, sectionsOf, shortList } from '../util'

const DAY = 86_400_000

export const documentRules: HintRule[] = [
  {
    id: 'completeness.emptySection',
    scope: 'section',
    appliesTo: (c) => !!c.docId,
    evaluate: ({ project, docId, sectionId }) => {
      const out: Hint[] = []
      for (const sec of sectionsOf(project, docId!)) {
        if (sectionId && sec.id !== sectionId) continue
        if (!isSectionEmpty(sec, project.documents[docId!]?.data[sec.id])) continue
        out.push({
          id: hintId('completeness.emptySection', docId, sec.id),
          ruleId: 'completeness.emptySection',
          severity: 'info',
          scope: 'section',
          target: { docId: docId!, sectionId: sec.id },
          titleKey: 'hints.emptySection.title',
          bodyKey: 'hints.emptySection.body',
          params: { section: sec.title },
          action: sec.kind === 'collection' ? { kind: 'addEntity', docId: docId!, sectionId: sec.id } : undefined,
        })
      }
      return out
    },
  },
  {
    id: 'completeness.sparseEntities',
    scope: 'section',
    appliesTo: (c) => !!c.docId,
    evaluate: ({ project, docId, thresholds }) => {
      const out: Hint[] = []
      for (const sec of sectionsOf(project, docId!)) {
        if (sec.kind !== 'collection') continue
        // Checkboxes (unticked is an answer) and carried-over notes do not count towards completeness.
        const fields = sec.fields.filter((f) => f.key !== 'name' && f.key !== 'legacyNotes' && f.type !== 'boolean')
        if (fields.length < 3) continue
        const sparse = entitiesOf(project, docId!, sec.id).filter((e) => {
          // Field groups the entity's type does not use (see groupFilter) are not expected to be filled.
          const hidden = hiddenGroups(project, docId!, sec, e)
          const own = fields.filter((f) => !f.group || !hidden.has(f.group))
          return own.length > 0 && own.filter((f) => !isBlank(e[f.key])).length / own.length < thresholds.sparseRatio
        })
        if (!sparse.length) continue
        out.push({
          id: hintId('completeness.sparseEntities', docId, sec.id),
          ruleId: 'completeness.sparseEntities',
          severity: 'suggest',
          scope: 'section',
          target: { docId: docId!, sectionId: sec.id, entityId: sparse[0].id },
          titleKey: 'hints.sparse.title',
          bodyKey: 'hints.sparse.body',
          params: { count: sparse.length, names: shortList(sparse.map(entityName)), section: sec.title },
          action: { kind: 'goto', docId: docId!, sectionId: sec.id },
        })
      }
      return out
    },
  },
  {
    id: 'consistency.orphan',
    scope: 'entity',
    appliesTo: (c) => !!c.docId,
    evaluate: ({ project, docId }) => {
      const out: Hint[] = []
      for (const sec of sectionsOf(project, docId!)) {
        if (sec.kind !== 'collection' || !isReferenced(project, docId!, sec.id)) continue
        const orphans = entitiesOf(project, docId!, sec.id).filter((e) => findUsages(project, e.id).length === 0)
        if (!orphans.length) continue
        out.push({
          id: hintId('consistency.orphan', docId, sec.id),
          ruleId: 'consistency.orphan',
          severity: 'info',
          scope: 'entity',
          target: { docId: docId!, sectionId: sec.id, entityId: orphans[0].id },
          titleKey: 'hints.orphan.title',
          bodyKey: 'hints.orphan.body',
          params: { count: orphans.length, names: shortList(orphans.map(entityName)), section: sec.title },
          action: { kind: 'goto', docId: docId!, sectionId: sec.id },
        })
      }
      return out
    },
  },
  {
    id: 'editor.graph',
    scope: 'section',
    appliesTo: (c) => !!c.docId,
    evaluate: ({ project, docId }) => {
      const out: Hint[] = []
      for (const sec of sectionsOf(project, docId!)) {
        if (sec.kind !== 'graph') continue
        const g = project.documents[docId!]?.data[sec.id]
        const nodes: any[] = g?.nodes ?? []
        if (nodes.length < 2) continue
        const linked = new Set<string>()
        for (const e of g.edges ?? []) { linked.add(e.source); linked.add(e.target) }
        const lone = nodes.filter((n) => !linked.has(n.id))
        if (!lone.length) continue
        out.push({
          id: hintId('editor.graph', docId, sec.id),
          ruleId: 'editor.graph',
          severity: 'suggest',
          scope: 'section',
          target: { docId: docId!, sectionId: sec.id },
          titleKey: 'hints.graphIsolated.title',
          bodyKey: 'hints.graphIsolated.body',
          params: { count: lone.length, names: shortList(lone.map((n) => n.label)) },
          action: { kind: 'goto', docId: docId!, sectionId: sec.id },
        })
      }
      return out
    },
  },
  {
    id: 'editor.kanban',
    scope: 'section',
    appliesTo: (c) => !!c.docId,
    evaluate: ({ project, docId, thresholds }) => {
      const out: Hint[] = []
      for (const sec of sectionsOf(project, docId!)) {
        if (sec.kind !== 'collection') continue
        for (const view of sec.views) {
          if (view.kind !== 'kanban') continue
          const counts = new Map<string, number>()
          for (const e of entitiesOf(project, docId!, sec.id)) {
            const k = String(e[view.groupBy] ?? '')
            if (k) counts.set(k, (counts.get(k) ?? 0) + 1)
          }
          const [col, n] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? ['', 0]
          if (n <= thresholds.kanbanWip) continue
          out.push({
            id: hintId('editor.kanban', docId, sec.id, view.groupBy),
            ruleId: 'editor.kanban',
            severity: 'info',
            scope: 'section',
            target: { docId: docId!, sectionId: sec.id },
            titleKey: 'hints.kanban.title',
            bodyKey: 'hints.kanban.body',
            params: { count: n, limit: thresholds.kanbanWip, column: col },
          })
        }
      }
      return out
    },
  },
  {
    id: 'editor.timeline',
    scope: 'section',
    appliesTo: (c) => !!c.docId,
    evaluate: ({ project, docId }) => {
      const out: Hint[] = []
      for (const sec of sectionsOf(project, docId!)) {
        if (sec.kind !== 'collection') continue
        for (const view of sec.views) {
          if (view.kind !== 'timeline') continue
          const items = entitiesOf(project, docId!, sec.id)
            .map((e) => ({ e, s: Number(e[view.startField]), d: Number(e[view.durationField]), lane: String(e[view.laneField ?? ''] ?? '') }))
            .filter((x) => Number.isFinite(x.s) && x.d > 0 && !isBlank(x.e[view.startField]))
            .sort((a, b) => a.s - b.s)
          const clash: string[] = []
          const lastEnd = new Map<string, { end: number; name: string }>()
          for (const x of items) {
            const prev = lastEnd.get(x.lane)
            if (prev && x.s < prev.end) clash.push(`${prev.name} / ${entityName(x.e)}`)
            if (!prev || x.s + x.d > prev.end) lastEnd.set(x.lane, { end: x.s + x.d, name: entityName(x.e) })
          }
          if (!clash.length) continue
          out.push({
            id: hintId('editor.timeline', docId, sec.id),
            ruleId: 'editor.timeline',
            severity: 'info',
            scope: 'section',
            target: { docId: docId!, sectionId: sec.id },
            titleKey: 'hints.timeline.title',
            bodyKey: 'hints.timeline.body',
            params: { count: clash.length, pairs: shortList(clash, 2) },
          })
        }
      }
      return out
    },
  },
  {
    id: 'balance.outlier',
    scope: 'entity',
    appliesTo: (c) => !!c.docId,
    evaluate: ({ project, docId, thresholds }) => {
      const out: Hint[] = []
      for (const sec of sectionsOf(project, docId!)) {
        if (sec.kind !== 'collection') continue
        const list = entitiesOf(project, docId!, sec.id)
        for (const fd of sec.fields) {
          if (fd.type !== 'number') continue
          const vals = list.filter((e) => typeof e[fd.key] === 'number')
          if (vals.length < thresholds.minSamples) continue
          const sorted = vals.map((e) => e[fd.key] as number).sort((a, b) => a - b)
          const [q1, q3] = quartiles(sorted)
          const iqr = q3 - q1
          if (iqr === 0) continue
          const lo = q1 - thresholds.outlierIqr * iqr
          const hi = q3 + thresholds.outlierIqr * iqr
          const odd = vals.filter((e) => e[fd.key] < lo || e[fd.key] > hi)
          if (!odd.length) continue
          out.push({
            id: hintId('balance.outlier', docId, sec.id, fd.key),
            ruleId: 'balance.outlier',
            severity: 'suggest',
            scope: 'entity',
            target: { docId: docId!, sectionId: sec.id, entityId: odd[0].id },
            titleKey: 'hints.outlier.title',
            bodyKey: 'hints.outlier.body',
            params: { field: fd.label, names: shortList(odd.map(entityName)), count: odd.length },
            action: { kind: 'goto', docId: docId!, sectionId: sec.id },
          })
        }
      }
      return out
    },
  },
  {
    id: 'balance.unusedCategory',
    scope: 'section',
    appliesTo: (c) => !!c.docId,
    evaluate: ({ project, docId, thresholds }) => {
      const out: Hint[] = []
      for (const sec of sectionsOf(project, docId!)) {
        if (sec.kind !== 'collection') continue
        const list = entitiesOf(project, docId!, sec.id)
        if (list.length < thresholds.minSamples) continue
        for (const fd of sec.fields) {
          if (fd.type !== 'ref' || !('catalog' in fd.source)) continue
          const used = new Set(list.map((e) => e[fd.key]))
          const missing = resolveSource(project, docId!, fd.source).filter((i) => !used.has(i.id))
          if (!missing.length || missing.length === resolveSource(project, docId!, fd.source).length) continue
          out.push({
            id: hintId('balance.unusedCategory', docId, sec.id, fd.key),
            ruleId: 'balance.unusedCategory',
            severity: 'info',
            scope: 'section',
            target: { docId: docId!, sectionId: sec.id },
            titleKey: 'hints.unusedCategory.title',
            bodyKey: 'hints.unusedCategory.body',
            params: { field: fd.label, values: shortList(missing.map((m) => m.label), 4), section: sec.title },
            action: { kind: 'addEntity', docId: docId!, sectionId: sec.id, init: { [fd.key]: missing[0].id } },
          })
        }
      }
      return out
    },
  },
  {
    id: 'formula.check',
    scope: 'entity',
    appliesTo: (c) => !!c.docId,
    evaluate: ({ project, docId }) => {
      const out: Hint[] = []
      for (const sec of sectionsOf(project, docId!)) {
        if (sec.kind !== 'formulas') continue
        const items: { id: string; name: string; expr: string; vars: Record<string, number> }[] =
          project.documents[docId!]?.data[sec.id]?.items ?? []
        for (const it of items) {
          if (!it.expr?.trim()) continue
          const missing = variablesOf(it.expr).filter((v) => typeof it.vars?.[v] !== 'number')
          const failed = !missing.length && !tryEvaluate(it.expr, it.vars).ok
          if (!missing.length && !failed) continue
          out.push({
            id: hintId('formula.check', docId, it.id),
            ruleId: 'formula.check',
            severity: 'important',
            scope: 'entity',
            target: { docId: docId!, sectionId: sec.id, entityId: it.id },
            titleKey: missing.length ? 'hints.formulaVars.title' : 'hints.formulaFail.title',
            bodyKey: missing.length ? 'hints.formulaVars.body' : 'hints.formulaFail.body',
            params: { name: it.name, vars: missing.join(', ') },
          })
        }
      }
      return out
    },
  },
  {
    id: 'process.milestones',
    scope: 'entity',
    appliesTo: (c) => c.docId === 'production.milestones',
    evaluate: ({ project, now }) =>
      entitiesOf(project, 'production.milestones', 'milestones')
        .filter((m) => {
          const t = Date.parse(String(m.due ?? ''))
          return Number.isFinite(t) && t < now - DAY && m.status !== 'Done'
        })
        .map((m) => ({
          id: hintId('process.milestones', m.id),
          ruleId: 'process.milestones',
          severity: 'important' as const,
          scope: 'entity' as const,
          target: { docId: 'production.milestones', sectionId: 'milestones', entityId: m.id },
          titleKey: 'hints.milestonePast.title',
          bodyKey: 'hints.milestonePast.body',
          params: { name: entityName(m), due: String(m.due) },
        })),
  },
  {
    id: 'process.backlog',
    scope: 'section',
    appliesTo: (c) => c.docId === 'production.backlog',
    evaluate: ({ project }) => {
      const open = entitiesOf(project, 'production.backlog', 'features').filter((e) => e.status !== 'Done')
      const bad = open.filter((e) => isBlank(e.estimate) || isBlank(e.milestone))
      return bad.length
        ? [
            {
              id: 'process.backlog',
              ruleId: 'process.backlog',
              severity: 'suggest' as const,
              scope: 'section' as const,
              target: { docId: 'production.backlog', sectionId: 'features', entityId: bad[0].id },
              titleKey: 'hints.backlog.title',
              bodyKey: 'hints.backlog.body',
              params: { count: bad.length, names: shortList(bad.map(entityName)) },
            },
          ]
        : []
    },
  },
]

function isReferenced(project: Parameters<typeof findUsages>[0], docId: string, sectionId: string) {
  // A section is only checked for orphans if some field points at it.
  return Object.keys(project.documents).some((d) =>
    sectionsOf(project, d).some(
      (s) =>
        s.kind === 'collection' &&
        s.fields.some(
          (f: FieldDef) =>
            (f.type === 'ref' || f.type === 'multiref' || f.type === 'map') &&
            'section' in f.source &&
            (f.source.doc ?? d) === docId &&
            f.source.section === sectionId,
        ),
    ),
  )
}
