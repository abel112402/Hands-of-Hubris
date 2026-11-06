import { controlConflicts, flowAnalysis, hudCoverage, kindDef, layoutIssues, layoutOf, screensOf, UI_DOC as DOC } from '../../ui'
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

const nm = (e?: Record<string, any>) => (e ? String(e.name ?? '') || '(unnamed)' : '?')
const wired = (p: Parameters<typeof screensOf>[0]) => screensOf(p).some((s) => layoutOf(s).length > 0)

/** Advisory UI checks; nothing exceeds 'suggest'. Flow checks start once any screen has a wireframe or the flow graph has arrows. */
export const uiRules: HintRule[] = [
  active('ui.unreachable', ({ project }) => {
    const f = flowAnalysis(project)
    const g = project.documents[DOC]?.data.flow
    if (!wired(project) && !(Array.isArray(g?.edges) && g.edges.length)) return []
    return f.unreachable.length
      ? [hint({ key: 'uiUnreachable', ruleId: 'ui.unreachable', severity: 'suggest', sectionId: 'screens', entityId: f.unreachable[0].id, params: { count: f.unreachable.length, entry: nm(f.entry), names: shortList(f.unreachable.map(nm), 5) } })]
      : []
  }),
  active('ui.deadEnd', ({ project }) => {
    const d = flowAnalysis(project).deadEnds
    return d.length ? [hint({ key: 'uiDeadEnd', ruleId: 'ui.deadEnd', severity: 'suggest', sectionId: 'screens', entityId: d[0].id, params: { count: d.length, names: shortList(d.map(nm)) } })] : []
  }),
  active('ui.navMismatch', ({ project }) => {
    const f = flowAnalysis(project)
    const screens = new Map(screensOf(project).map((s) => [s.id, s]))
    const list = [...f.missingInGraph.map((e) => `${nm(screens.get(e.from))} → ${nm(screens.get(e.to))} (button only)`), ...f.noButton.map((e) => `${nm(screens.get(e.from))} → ${nm(screens.get(e.to))} (graph only)`)]
    return list.length ? [hint({ key: 'uiNavMismatch', ruleId: 'ui.navMismatch', severity: 'info', sectionId: 'flow', params: { count: list.length, names: shortList(list) } })] : []
  }),
  active('ui.layout', ({ project }) => {
    const rows = screensOf(project)
      .map((s) => ({ s, n: layoutIssues(project, s).filter((i) => ['outside', 'unsafe', 'smallText', 'smallTarget', 'overlap', 'deadLink'].includes(i.kind)).length }))
      .filter((r) => r.n > 0)
    return rows.length ? [hint({ key: 'uiLayout', ruleId: 'ui.layout', severity: 'suggest', sectionId: 'screens', entityId: rows[0].s.id, params: { names: shortList(rows.map((r) => `${nm(r.s)} (${r.n})`)) } })] : []
  }),
  active('ui.textFit', ({ project }) => {
    const rows = screensOf(project).flatMap((s) => layoutIssues(project, s).filter((i) => i.kind === 'textFit').map((i) => ({ s, i })))
    return rows.length ? [hint({ key: 'uiTextFit', ruleId: 'ui.textFit', severity: 'info', sectionId: 'screens', entityId: rows[0].s.id, params: { count: rows.length, names: shortList(rows.map((r) => `${nm(r.s)}: ${r.i.message}`), 2) } })] : []
  }),
  active('ui.hudCoverage', ({ project }) => {
    const c = hudCoverage(project)
    if (!c.hud || !layoutOf(c.hud).length) return []
    const parts = [
      ...(c.missingStats.length ? [`no bar for ${c.missingStats.map((s) => s.label).join(', ')}`] : []),
      ...(c.hotbar ? [c.hotbar.have === null ? `no hotbar (Items has ${c.hotbar.want} slots)` : `hotbar has ${c.hotbar.have} slots, Items ${c.hotbar.want}`] : []),
      ...c.inventory.map((i) => `${nm(i.screen)} grid holds ${i.have}, Items ${i.want}`),
      ...(c.missingClock ? ['no clock although Time & Weather has day phases'] : []),
      ...(c.missingCurrencies.length ? [`${c.missingCurrencies.map(nm).join(', ')} not shown anywhere`] : []),
    ]
    return parts.length ? [hint({ key: 'uiHudCoverage', ruleId: 'ui.hudCoverage', severity: 'info', sectionId: 'screens', entityId: c.hud.id, params: { names: parts.join('; ') } })] : []
  }),
  active('ui.unbound', ({ project }) => {
    const rows = screensOf(project).flatMap((s) => layoutOf(s).filter((e) => kindDef(e.kind).hud && kindDef(e.kind).bind && !e.bind).map((e) => ({ s, e })))
    return rows.length ? [hint({ key: 'uiUnbound', ruleId: 'ui.unbound', severity: 'suggest', sectionId: 'screens', entityId: rows[0].s.id, params: { count: rows.length, names: shortList([...new Set(rows.map((r) => `${nm(r.s)}: ${kindDef(r.e.kind).label}`))]) } })] : []
  }),
  active('ui.controlConflicts', ({ project }) => {
    const c = controlConflicts(project)
    return c.length ? [hint({ key: 'uiControlConflicts', ruleId: 'ui.controlConflicts', severity: 'suggest', sectionId: 'controls', entityId: c[0].b.id, params: { names: shortList(c.map((x) => `${x.value}: ${nm(x.a)} + ${nm(x.b)}`)) } })] : []
  }),
  active('ui.screenBasics', ({ project }) => {
    const screens = screensOf(project)
    const scope = screens.some((s) => s.priority === 'MVP') ? screens.filter((s) => s.priority === 'MVP') : wired(project) ? screens : []
    const rows = scope.filter((s) => !String(s.purpose ?? '').trim() || layoutOf(s).length < 3 || !(Array.isArray(s.states) && s.states.length))
    return rows.length ? [hint({ key: 'uiScreenBasics', ruleId: 'ui.screenBasics', severity: 'info', sectionId: 'screens', entityId: rows[0].id, params: { count: rows.length, names: shortList(rows.map(nm), 5) } })] : []
  }),
]
