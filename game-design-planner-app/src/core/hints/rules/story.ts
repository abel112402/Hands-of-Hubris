import {
  biomeGateOrder,
  castCoverage,
  endingReachability,
  graphDisagreements,
  pacingProblems,
  questBasicsMissing,
  questDeps,
  repShortfalls,
  STORY_DOC as DOC,
} from '../../story'
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

const nm = (e: Record<string, any>) => String(e.name ?? '') || '(unnamed)'
const names = (l: Record<string, any>[], max = 3) => shortList(l.map(nm), max)

/** Advisory story and quest checks; nothing exceeds 'suggest'. */
export const storyRules: HintRule[] = [
  active('story.questCycle', ({ project }) => {
    const c = questDeps(project).cycles
    return c.length ? [hint({ key: 'storyQuestCycle', ruleId: 'story.questCycle', severity: 'suggest', sectionId: 'quests', entityId: c[0].id, params: { names: names(c, 5) } })] : []
  }),
  active('story.unreachable', ({ project }) => {
    const d = questDeps(project)
    const rows = d.unreachable.filter((u) => !d.cycles.includes(u.quest))
    return rows.length
      ? [hint({ key: 'storyUnreachable', ruleId: 'story.unreachable', severity: 'suggest', sectionId: 'quests', entityId: rows[0].quest.id, params: { count: rows.length, names: shortList(rows.map((u) => `${nm(u.quest)} (${u.reason})`)) } })]
      : []
  }),
  active('story.actOrder', ({ project }) => {
    const inv = questDeps(project).actInversions.map((x) => `${nm(x.quest)} needs ${nm(x.required)}`)
    const gates = biomeGateOrder(project).map((x) => `${nm(x.biome)} needs ${nm(x.quest)}`)
    const all = [...inv, ...gates]
    return all.length ? [hint({ key: 'storyActOrder', ruleId: 'story.actOrder', severity: 'suggest', sectionId: 'quests', params: { count: all.length, names: shortList(all) } })] : []
  }),
  active('story.endings', ({ project }) => {
    const r = endingReachability(project)
    const out: Hint[] = []
    const bad = r.filter((x) => !x.reachable)
    if (bad.length)
      out.push(hint({ key: 'storyEndings', ruleId: 'story.endings', severity: 'suggest', sectionId: 'endings', entityId: bad[0].ending.id, params: { names: shortList(bad.map((x) => `${nm(x.ending)}: ${x.reasons[0]}`)) } }))
    const empty = r.filter((x) => x.empty)
    if (empty.length) out.push(hint({ key: 'storyEndingsEmpty', ruleId: 'story.endingsEmpty', severity: 'info', sectionId: 'endings', entityId: empty[0].ending.id, params: { count: empty.length, names: names(empty.map((x) => x.ending)) } }))
    return out
  }),
  active('story.pacing', ({ project }) => {
    const rows = pacingProblems(project)
    if (!rows.length) return []
    const text = rows.map((r) =>
      r.problem ? `${nm(r.act)}: level ${r.level} (meant ${r.act.levelMin ?? '…'}–${r.act.levelMax ?? '…'})` : `${nm(r.act)}: quests fill ${Math.round((r.load ?? 0) * 100)} %`,
    )
    return [hint({ key: 'storyPacing', ruleId: 'story.pacing', severity: 'suggest', sectionId: 'acts', entityId: rows[0].act.id, params: { names: shortList(text) } })]
  }),
  active('story.questBasics', ({ project }) => {
    const rows = questBasicsMissing(project)
    return rows.length ? [hint({ key: 'storyQuestBasics', ruleId: 'story.questBasics', severity: 'info', sectionId: 'quests', entityId: rows[0].id, params: { count: rows.length, names: names(rows, 5) } })] : []
  }),
  active('story.cast', ({ project }) => {
    const c = castCoverage(project)
    const out: Hint[] = []
    if (c.idleMain.length)
      out.push(hint({ key: 'storyCastIdle', ruleId: 'story.cast', severity: 'info', sectionId: 'characters', entityId: c.idleMain[0].id, params: { count: c.idleMain.length, names: names(c.idleMain) } }))
    if (c.factionsWithoutQuests.length && c.rows.length)
      out.push(
        hint({
          key: 'storyFactionQuests',
          ruleId: 'story.factionQuests',
          severity: 'info',
          sectionId: 'quests',
          params: { count: c.factionsWithoutQuests.length, names: names(c.factionsWithoutQuests) },
          action: { kind: 'addEntity', docId: DOC, sectionId: 'quests', init: { type: 'Faction', faction: c.factionsWithoutQuests[0].id } },
        }),
      )
    return out
  }),
  active('story.reputation', ({ project }) => {
    const rows = repShortfalls(project)
    return rows.length
      ? [hint({ key: 'storyReputation', ruleId: 'story.reputation', severity: 'info', sectionId: 'quests', params: { names: shortList(rows.map((r) => `${nm(r.faction)} tops out at ${Math.round(r.best)}, ${r.by} needs ${nm(r.level)} (${r.level.min})`)) } })]
      : []
  }),
  active('story.graphSync', ({ project }) => {
    const rows = graphDisagreements(project)
    return rows.length ? [hint({ key: 'storyGraphSync', ruleId: 'story.graphSync', severity: 'info', sectionId: 'questGraph', params: { names: shortList(rows.map((r) => `${nm(r.from)} → ${nm(r.to)}`)) } })] : []
  }),
]
