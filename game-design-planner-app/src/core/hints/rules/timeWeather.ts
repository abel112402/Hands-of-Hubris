import { biomeWeather, dayCoverage, eventProblems, extremeModifiers, nightProblems, phaseBasicsMissing, seasonYear, TIME_DOC as DOC, timeList, unresolvedCoincidences } from '../../timeWeather'
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

const names = (l: Record<string, any>[]) => shortList(l.map((x) => String(x.name ?? '') || '(unnamed)'))
const hh = (h: number) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`

/** Advisory time, weather and event checks; nothing exceeds 'suggest'. */
export const timeWeatherRules: HintRule[] = [
  active('time.dayCoverage', ({ project }) => {
    const c = dayCoverage(project)
    if (!c.arcs.length) return []
    const problems = [...c.gaps.map(([f, t]) => `no phase ${hh(f)}–${hh(t)}`), ...c.overlaps.map(([f, t]) => `overlap ${hh(f)}–${hh(t)}`)]
    return problems.length ? [hint({ key: 'timeDayCoverage', ruleId: 'time.dayCoverage', severity: 'suggest', sectionId: 'dayPhases', params: { names: shortList(problems, 4) } })] : []
  }),
  active('time.basics', ({ project }) => {
    const out: Hint[] = []
    const len = project.documents[DOC]?.data.time?.dayLength
    if (timeList(project, 'dayPhases').length && !(typeof len === 'number' && len > 0)) out.push(hint({ key: 'timeDayLength', ruleId: 'time.dayLength', severity: 'suggest', sectionId: 'time' }))
    const rows = phaseBasicsMissing(project)
    if (rows.length) out.push(hint({ key: 'timePhaseBasics', ruleId: 'time.basics', severity: 'info', sectionId: 'dayPhases', entityId: rows[0].id, params: { count: rows.length, names: names(rows) } }))
    return out
  }),
  active('time.nightHarder', ({ project }) => {
    const problems = nightProblems(project)
    return problems.length ? [hint({ key: 'timeNightHarder', ruleId: 'time.nightHarder', severity: 'info', sectionId: 'dayPhases', params: { names: problems.join('; ') } })] : []
  }),
  active('time.weatherShare', ({ project }) => {
    if (!timeList(project, 'weather').length) return []
    const rows = biomeWeather(project)
    const out: Hint[] = []
    const over = rows.filter((r) => r.over)
    if (over.length)
      out.push(hint({ key: 'timeWeatherOver', ruleId: 'time.weatherShare', severity: 'suggest', sectionId: 'weather', params: { names: shortList(over.map((r) => `${r.biome.name} ${Math.round(r.total)}%`)) } }))
    const none = rows.filter((r) => r.weathers.length === 0)
    if (none.length) out.push(hint({ key: 'timeWeatherNone', ruleId: 'time.weatherNone', severity: 'info', sectionId: 'weather', params: { count: none.length, names: shortList(none.map((r) => String(r.biome.name ?? ''))) } }))
    return out
  }),
  active('time.events', ({ project }) => {
    const rows = eventProblems(project)
    return rows.length ? [hint({ key: 'timeEvents', ruleId: 'time.events', severity: 'suggest', sectionId: 'events', entityId: rows[0].id, params: { count: rows.length, names: names(rows) } })] : []
  }),
  active('time.coincide', ({ project }) => {
    const rows = unresolvedCoincidences(project)
    const pairs = [...new Set(rows.map((c) => [c.a.event.name, c.b.event.name].sort().join(' + ')))]
    return pairs.length ? [hint({ key: 'timeCoincide', ruleId: 'time.coincide', severity: 'info', sectionId: 'events', params: { names: shortList(pairs) } })] : []
  }),
  active('time.seasons', ({ project }) => {
    const s = seasonYear(project)
    return s.ranges.length && s.total !== s.year ? [hint({ key: 'timeSeasons', ruleId: 'time.seasons', severity: 'suggest', sectionId: 'seasons', params: { total: s.total, year: s.year } })] : []
  }),
  active('time.extremes', ({ project }) => {
    const rows = extremeModifiers(project)
    return rows.length ? [hint({ key: 'timeExtremes', ruleId: 'time.extremes', severity: 'info', sectionId: 'events', params: { names: shortList(rows, 3) } })] : []
  }),
]
