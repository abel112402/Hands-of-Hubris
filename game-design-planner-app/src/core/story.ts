import { scaleOf } from './diplomacy'
import { finalValue, itemList } from './items'
import type { Entity, Project } from './model/types'
import { levelTable } from './player'

/**
 * Story & Quests analysis. Quest order, reachability, pacing and reward budgets are planning estimates from the quest
 * data, not a simulation of play.
 */
export const STORY_DOC = 'design.story'
/** Quest hours below / above this share of an act's length count as under- / over-filled. */
export const LOAD_MIN = 0.5
export const LOAD_MAX = 1.5

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const ids = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
const asMap = (v: unknown): Record<string, number> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, number>) : {})
const listOf = (project: Project, docId: string, section: string): Entity[] => {
  const d = project.documents[docId]?.data[section]
  return Array.isArray(d) ? d : []
}
const nameOf = (e: Entity | undefined) => (e ? String(e.name ?? '') || '(unnamed)' : '⚠ missing')

export const storyList = (project: Project, section: string) => listOf(project, STORY_DOC, section)
export const storyForm = (project: Project, section: string): Record<string, any> => {
  const d = project.documents[STORY_DOC]?.data[section]
  return d && typeof d === 'object' && !Array.isArray(d) ? d : {}
}

// ---------- Acts ----------

/** Acts in timeline order (by start, then list order). */
export const actsInOrder = (project: Project) =>
  storyList(project, 'acts')
    .map((a, i) => ({ a, i }))
    .sort((x, y) => (isNum(x.a.start) ? x.a.start : x.i) - (isNum(y.a.start) ? y.a.start : y.i) || x.i - y.i)
    .map((x) => x.a)

const actLength = (act: Entity) => (isNum(act.duration) && act.duration > 0 ? act.duration : 1)
const inHours = (project: Project) => storyForm(project, 'structure').actUnit === 'Play hours'
const hoursPerDay = (project: Project) => {
  const h = storyForm(project, 'structure').hoursPerDay
  return isNum(h) && h > 0 ? h : null
}

/** An act's length in in-game days (acts in play hours are converted with hours per day). */
export function actDays(project: Project, act: Entity): number {
  const h = hoursPerDay(project)
  return inHours(project) && h ? actLength(act) / h : actLength(act)
}

/** An act's length in play hours; null when acts are in days and hours per day is not set. */
export function actHours(project: Project, act: Entity): number | null {
  if (inHours(project)) return actLength(act)
  const h = hoursPerDay(project)
  return h ? actLength(act) * h : null
}

const actIndexMap = (project: Project) => new Map(actsInOrder(project).map((a, i) => [a.id, i]))

// ---------- Quest order ----------

export type QuestEdge = { from: string; to: string; kind: 'requires' | 'leadsTo' }
export type QuestDeps = {
  edges: QuestEdge[]
  depth: Map<string, number>
  cycles: Entity[]
  unreachable: { quest: Entity; reason: string }[]
  actInversions: { quest: Entity; required: Entity }[]
  mainPath: Entity[]
}

/**
 * Quest dependencies from `requires` (and choice options' `leadsTo`): longest requirement chain per quest, quests in
 * requirement loops, quests that can never start, quests requiring a later act's quest, and the longest Main chain.
 */
export function questDeps(project: Project): QuestDeps {
  const quests = storyList(project, 'quests')
  const byId = new Map(quests.map((q) => [q.id, q]))
  const edges: QuestEdge[] = []
  for (const q of quests) for (const r of ids(q.requires)) edges.push({ from: r, to: q.id, kind: 'requires' })
  for (const c of storyList(project, 'choices')) if (c.quest) for (const l of ids(c.leadsTo)) edges.push({ from: c.quest, to: l, kind: 'leadsTo' })

  // Cycles in the requirement graph (DFS with a stack).
  const inCycle = new Set<string>()
  const state = new Map<string, 1 | 2>()
  const stack: string[] = []
  const visit = (id: string) => {
    state.set(id, 1)
    stack.push(id)
    for (const r of ids(byId.get(id)?.requires)) {
      if (!byId.has(r)) continue
      if (state.get(r) === 1) stack.slice(stack.indexOf(r)).forEach((x) => inCycle.add(x))
      else if (!state.has(r)) visit(r)
    }
    stack.pop()
    state.set(id, 2)
  }
  for (const q of quests) if (!state.has(q.id)) visit(q.id)

  // Longest chain of requirements below each quest.
  const depth = new Map<string, number>()
  const parent = new Map<string, string>()
  const depthOf = (id: string, seen: Set<string>): number => {
    if (depth.has(id)) return depth.get(id)!
    if (inCycle.has(id) || seen.has(id)) return 0
    seen.add(id)
    let d = 0
    for (const r of ids(byId.get(id)?.requires)) {
      if (!byId.has(r)) continue
      const rd = depthOf(r, seen) + 1
      if (rd > d) {
        d = rd
        parent.set(id, r)
      }
    }
    depth.set(id, d)
    return d
  }
  for (const q of quests) depthOf(q.id, new Set())

  // All prerequisites of a quest, transitively.
  const prereqs = (id: string) => {
    const out = new Set<string>()
    const walk = (x: string) => {
      for (const r of ids(byId.get(x)?.requires)) if (!out.has(r)) {
        out.add(r)
        walk(r)
      }
    }
    walk(id)
    return out
  }
  const unreachable: QuestDeps['unreachable'] = []
  const bad = new Set<string>()
  for (const q of quests) {
    const pre = prereqs(q.id)
    const missing = ids(q.requires).filter((r) => !byId.has(r))
    let reason = ''
    if (inCycle.has(q.id)) reason = 'in a requirement loop'
    else if (missing.length) reason = 'requires a deleted quest'
    else {
      const closer = [...pre].map((p) => byId.get(p)).find((p) => p && ids(p.blocks).some((b) => b === q.id || pre.has(b)))
      if (closer) reason = `${nameOf(closer)} closes it or one of its prerequisites`
    }
    if (reason) {
      bad.add(q.id)
      unreachable.push({ quest: q, reason })
    }
  }
  // Quests that need an unreachable quest are unreachable too.
  let grew = true
  while (grew) {
    grew = false
    for (const q of quests)
      if (!bad.has(q.id) && ids(q.requires).some((r) => bad.has(r))) {
        bad.add(q.id)
        unreachable.push({ quest: q, reason: `needs ${nameOf(byId.get(ids(q.requires).find((r) => bad.has(r))!))}` })
        grew = true
      }
  }

  const actIdx = actIndexMap(project)
  const actInversions: QuestDeps['actInversions'] = []
  for (const q of quests)
    for (const r of ids(q.requires)) {
      const req = byId.get(r)
      if (req && q.act && req.act && actIdx.has(q.act) && actIdx.has(req.act) && actIdx.get(req.act)! > actIdx.get(q.act)!) actInversions.push({ quest: q, required: req })
    }

  const mains = quests.filter((q) => q.type === 'Main' && !inCycle.has(q.id))
  const last = mains.sort((a, b) => (depth.get(b.id) ?? 0) - (depth.get(a.id) ?? 0))[0]
  const mainPath: Entity[] = []
  for (let id: string | undefined = last?.id; id; id = parent.get(id)) mainPath.unshift(byId.get(id)!)
  return { edges, depth, cycles: quests.filter((q) => inCycle.has(q.id)), unreachable, actInversions, mainPath }
}

// ---------- Choices and endings ----------

export type Decision = { name: string; options: Entity[] }

/** Options grouped by decision name, in list order. */
export function decisionsOf(project: Project): Decision[] {
  const out: Decision[] = []
  for (const c of storyList(project, 'choices')) {
    const name = String(c.decision ?? '').trim() || nameOf(c)
    const d = out.find((x) => x.name === name)
    if (d) d.options.push(c)
    else out.push({ name, options: [c] })
  }
  return out
}
const decisionKey = (c: Entity) => String(c.decision ?? '').trim() || nameOf(c)

export type EndingReach = { ending: Entity; reachable: boolean; reasons: string[]; quests: Entity[]; options: Entity[]; empty: boolean }

/** Whether each ending can be reached: its options must come from different decisions and nothing it needs may be closed. */
export function endingReachability(project: Project): EndingReach[] {
  const quests = new Map(storyList(project, 'quests').map((q) => [q.id, q]))
  const choices = new Map(storyList(project, 'choices').map((c) => [c.id, c]))
  const deps = questDeps(project)
  const bad = new Set(deps.unreachable.map((u) => u.quest.id))
  return storyList(project, 'endings').map((ending) => {
    const reasons: string[] = []
    const need = new Set<string>()
    const walk = (id: string) => {
      if (need.has(id)) return
      need.add(id)
      ids(quests.get(id)?.requires).forEach(walk)
    }
    ids(ending.requiresQuests).forEach(walk)
    const options = ids(ending.requiresChoices).map((id) => choices.get(id)).filter((c): c is Entity => !!c)
    if (ids(ending.requiresChoices).length > options.length || [...need].some((id) => !quests.has(id))) reasons.push('needs a deleted quest or option')
    const seen = new Map<string, Entity>()
    for (const o of options) {
      const k = decisionKey(o)
      if (seen.has(k)) reasons.push(`needs both “${nameOf(seen.get(k))}” and “${nameOf(o)}” of ${k}`)
      else seen.set(k, o)
    }
    for (const o of options) for (const b of ids(o.blocks)) if (need.has(b)) reasons.push(`“${nameOf(o)}” closes ${nameOf(quests.get(b))}`)
    for (const id of need) for (const b of ids(quests.get(id)?.blocks)) if (need.has(b)) reasons.push(`${nameOf(quests.get(id))} closes ${nameOf(quests.get(b))}`)
    for (const id of need) if (bad.has(id)) reasons.push(`${nameOf(quests.get(id))} can never start`)
    return {
      ending,
      reachable: reasons.length === 0,
      reasons,
      quests: [...need].map((id) => quests.get(id)).filter((q): q is Entity => !!q),
      options,
      empty: !ids(ending.requiresQuests).length && !ids(ending.requiresChoices).length && !ending.repLevel,
    }
  })
}

export type PathState = { blockedQuests: Set<string>; openEndings: Entity[]; blockedEndings: { ending: Entity; why: string }[] }

/**
 * What a set of picked options does: quests they close, quests that only unpicked options of a decided decision open,
 * quests needing any of those, and the endings left open.
 */
export function simulatePath(project: Project, picked: string[]): PathState {
  const choices = storyList(project, 'choices')
  const quests = storyList(project, 'quests')
  const pickedSet = new Set(picked)
  const decided = new Set(choices.filter((c) => pickedSet.has(c.id)).map(decisionKey))
  const lost = new Set(choices.filter((c) => !pickedSet.has(c.id) && decided.has(decisionKey(c))).map((c) => c.id))
  const blocked = new Set<string>()
  for (const c of choices) if (pickedSet.has(c.id)) ids(c.blocks).forEach((b) => blocked.add(b))
  for (const q of quests) {
    const openers = choices.filter((c) => ids(c.leadsTo).includes(q.id))
    if (openers.length && openers.every((c) => lost.has(c.id))) blocked.add(q.id)
  }
  let grew = true
  while (grew) {
    grew = false
    for (const q of quests)
      if (!blocked.has(q.id) && ids(q.requires).some((r) => blocked.has(r))) {
        blocked.add(q.id)
        grew = true
      }
  }
  const reach = new Map(endingReachability(project).map((r) => [r.ending.id, r]))
  const openEndings: Entity[] = []
  const blockedEndings: PathState['blockedEndings'] = []
  for (const e of storyList(project, 'endings')) {
    const r = reach.get(e.id)!
    const lostOption = ids(e.requiresChoices).find((id) => lost.has(id))
    const lostQuest = r.quests.find((q) => blocked.has(q.id))
    const why = !r.reachable ? r.reasons[0] : lostOption ? `needs “${nameOf(choices.find((c) => c.id === lostOption))}”` : lostQuest ? `needs ${nameOf(lostQuest)}` : ''
    if (why) blockedEndings.push({ ending: e, why })
    else openEndings.push(e)
  }
  return { blockedQuests: blocked, openEndings, blockedEndings }
}

// ---------- Pacing and rewards ----------

/** Highest level whose cumulative XP is reached; null without an XP formula. */
export function levelForXp(project: Project, xp: number): number | null {
  const t = levelTable(project)
  if (t.rows.length < 2 || t.rows[1].next === null) return null
  let level = 1
  for (const r of t.rows) if (r.total <= xp + 1e-9) level = r.level
  return level
}

export type PacingRow = {
  act: Entity
  quests: number
  questHours: number
  actHours: number | null
  load: number | null
  xp: number
  cumXp: number
  level: number | null
  problem: 'low' | 'high' | null
}

/**
 * Per act: quest count and play time against the act's length, XP from its quests (plus Player XP sources × act hours
 * when the hours are known) and the level reached at the act's end, compared with the act's level range.
 */
export function actPacing(project: Project): PacingRow[] {
  const quests = storyList(project, 'quests')
  const rate = levelTable(project).xpPerHour
  let cum = 0
  return actsInOrder(project).map((act) => {
    const own = quests.filter((q) => q.act === act.id)
    const questHours = own.reduce((s, q) => s + (isNum(q.estMinutes) ? q.estMinutes / 60 : 0), 0)
    const hours = actHours(project, act)
    const xp = own.reduce((s, q) => s + (isNum(q.rewardXp) ? q.rewardXp : 0), 0)
    cum += xp + (hours !== null ? rate * hours : 0)
    const level = levelForXp(project, cum)
    const problem = level === null ? null : isNum(act.levelMax) && level > act.levelMax ? 'high' : isNum(act.levelMin) && level < act.levelMin ? 'low' : null
    return { act, quests: own.length, questHours, actHours: hours, load: hours ? questHours / hours : null, xp, cumXp: cum, level, problem }
  })
}

export type RewardRow = { id: string; label: string; xp: number; money: number; itemValue: number; rep: Record<string, number>; cumRep: Record<string, number> }

/** XP, money, item value and reputation from quests per act, with reputation cumulative from the Factions starting value. */
export function rewardsByAct(project: Project): { rows: RewardRow[]; factions: Entity[] } {
  const quests = storyList(project, 'quests')
  const items = new Map(itemList(project, 'items').map((i) => [i.id, i]))
  const factions = listOf(project, 'design.factions', 'factions')
  const start = project.documents['design.factions']?.data.overview?.startValue
  const [lo, hi] = scaleOf(project)
  const acts = actsInOrder(project)
  const buckets: { id: string; label: string; list: Entity[] }[] = acts.map((a) => ({ id: a.id, label: nameOf(a), list: quests.filter((q) => q.act === a.id) }))
  const loose = quests.filter((q) => !q.act || !acts.some((a) => a.id === q.act))
  if (loose.length) buckets.push({ id: '', label: 'No act', list: loose })
  const running: Record<string, number> = Object.fromEntries(factions.map((f) => [f.id, isNum(start) ? start : 0]))
  const rows = buckets.map((b) => {
    const rep: Record<string, number> = {}
    let xp = 0
    let money = 0
    let itemValue = 0
    for (const q of b.list) {
      if (isNum(q.rewardXp)) xp += q.rewardXp
      if (isNum(q.rewardMoney)) money += q.rewardMoney
      for (const [id, n] of Object.entries(asMap(q.rewardItems))) if (isNum(n)) itemValue += (finalValue(project, items.get(id)) ?? 0) * n
      for (const [id, n] of Object.entries(asMap(q.rewardRep))) if (isNum(n)) rep[id] = (rep[id] ?? 0) + n
    }
    for (const f of factions) running[f.id] = Math.min(hi, Math.max(lo, running[f.id] + (rep[f.id] ?? 0)))
    return { id: b.id, label: b.label, xp, money, itemValue, rep, cumRep: { ...running } }
  })
  return { rows, factions }
}

/** The Factions relationship level a reputation value falls in (highest level whose minimum it reaches). */
export function repLevelAt(project: Project, value: number): Entity | undefined {
  const levels = listOf(project, 'design.factions', 'thresholds').filter((l) => isNum(l.min)).sort((a, b) => a.min - b.min)
  return levels.filter((l) => l.min <= value).at(-1)
}

/**
 * Factions whose best reachable reputation from quests and options stays below a level that another module asks for
 * (a capital merchant's required level, or a quest's or ending's reputation requirement).
 */
export function repShortfalls(project: Project): { faction: Entity; level: Entity; best: number; by: string }[] {
  const factions = listOf(project, 'design.factions', 'factions')
  const levels = new Map(listOf(project, 'design.factions', 'thresholds').map((l) => [l.id, l]))
  const start = project.documents['design.factions']?.data.overview?.startValue
  const quests = storyList(project, 'quests')
  if (!quests.some((q) => Object.keys(asMap(q.rewardRep)).length)) return []
  const best = (fid: string) => {
    let v = isNum(start) ? start : 0
    for (const q of quests) {
      const n = asMap(q.rewardRep)[fid]
      if (isNum(n) && n > 0) v += n
    }
    for (const d of decisionsOf(project)) v += Math.max(0, ...d.options.map((o) => (isNum(asMap(o.repEffects)[fid]) ? asMap(o.repEffects)[fid] : 0)))
    return v
  }
  const wants: { fid: string; lid: string; by: string }[] = []
  const capitalDefault = project.documents['design.trade']?.data.capital?.minLevel
  for (const m of listOf(project, 'design.trade', 'merchants'))
    if (m.type === 'Faction capital' && m.faction && (m.minLevel || capitalDefault)) wants.push({ fid: m.faction, lid: m.minLevel || capitalDefault, by: nameOf(m) })
  for (const e of [...quests, ...storyList(project, 'endings')]) if (e.repFaction && e.repLevel) wants.push({ fid: e.repFaction, lid: e.repLevel, by: nameOf(e) })
  const out: ReturnType<typeof repShortfalls> = []
  for (const w of wants) {
    const faction = factions.find((f) => f.id === w.fid)
    const level = levels.get(w.lid)
    if (!faction || !level || !isNum(level.min)) continue
    const b = best(w.fid)
    if (b < level.min) out.push({ faction, level, best: b, by: w.by })
  }
  return out
}

// ---------- Coverage and consistency ----------

export type CastRow = { character: Entity; byAct: Record<string, number>; total: number }

/** Quests each character gives per act ('' = no act), idle characters, and factions without a Faction quest. */
export function castCoverage(project: Project) {
  const quests = storyList(project, 'quests')
  const rows: CastRow[] = storyList(project, 'characters').map((character) => {
    const byAct: Record<string, number> = {}
    const own = quests.filter((q) => q.giver === character.id)
    for (const q of own) byAct[q.act ?? ''] = (byAct[q.act ?? ''] ?? 0) + 1
    return { character, byAct, total: own.length }
  })
  const factionsWithoutQuests = listOf(project, 'design.factions', 'factions').filter((f) => !quests.some((q) => q.faction === f.id && q.type === 'Faction'))
  return { acts: actsInOrder(project), rows, idleMain: rows.filter((r) => r.total === 0 && r.character.importance === 'Main').map((r) => r.character), factionsWithoutQuests }
}

/** World biomes that require a quest from a later act than the first act set in that biome. */
export function biomeGateOrder(project: Project): { biome: Entity; quest: Entity }[] {
  const acts = actsInOrder(project)
  const quests = new Map(storyList(project, 'quests').map((q) => [q.id, q]))
  const idx = actIndexMap(project)
  const out: { biome: Entity; quest: Entity }[] = []
  for (const b of listOf(project, 'design.world', 'biomes')) {
    const first = acts.findIndex((a) => a.biome === b.id || ids(a.extraBiomes).includes(b.id))
    if (first < 0) continue
    for (const id of ids(b.entryQuests)) {
      const q = quests.get(id)
      if (q?.act && idx.has(q.act) && idx.get(q.act)! > first) out.push({ biome: b, quest: q })
    }
  }
  return out
}

const hasReward = (q: Entity) => isNum(q.rewardXp) || isNum(q.rewardMoney) || Object.keys(asMap(q.rewardItems)).length > 0 || Object.keys(asMap(q.rewardRep)).length > 0 || ids(q.unlocks).length > 0

/** Main and Faction quests without a giver, objectives, act or any structured reward. */
export const questBasicsMissing = (project: Project) =>
  storyList(project, 'quests').filter((q) => (q.type === 'Main' || q.type === 'Faction') && (!q.giver || !Array.isArray(q.objectives) || !q.objectives.length || !q.act || !hasReward(q)))

/** Acts whose expected level is outside their range, or whose quests fill too little or too much of their length. */
export const pacingProblems = (project: Project) =>
  actPacing(project).filter((r) => r.problem || (r.load !== null && r.quests > 0 && (r.load < LOAD_MIN || r.load > LOAD_MAX)))

/** Sketch edges between two quest-linked boxes that no `requires` or option `leadsTo` backs. */
export function graphDisagreements(project: Project): { from: Entity; to: Entity }[] {
  const g = storyForm(project, 'questGraph')
  const nodes = new Map<string, any>((Array.isArray(g.nodes) ? g.nodes : []).map((n: any) => [n.id, n]))
  const quests = new Map(storyList(project, 'quests').map((q) => [q.id, q]))
  const data = new Set(questDeps(project).edges.map((e) => `${e.from}>${e.to}`))
  const out: { from: Entity; to: Entity }[] = []
  for (const e of Array.isArray(g.edges) ? g.edges : []) {
    const a = quests.get(nodes.get(e.source)?.refId)
    const b = quests.get(nodes.get(e.target)?.refId)
    if (a && b && !data.has(`${a.id}>${b.id}`)) out.push({ from: a, to: b })
  }
  return out
}
