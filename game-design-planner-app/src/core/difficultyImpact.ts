import { COMBAT_DOC } from './combat'
import { levelsOf, paramsOf } from './difficulty'
import type { Entity, Project } from './model/types'
import { difficultyMultiplier, PLAYER_DOC, playerList, timeToCritical, unitOf } from './player'
import { difficultyParam as tradePriceParam, difficultyPriceMult } from './trade'

/**
 * What the difficulty levels do to other modules: which systems read each parameter, and the numbers they produce
 * per level. Kept apart from core/difficulty.ts because Player, Combat and Trade import that file.
 * Planning estimates from the entered data, not a play simulation.
 */

export type ParamUse = { docId: string; label: string }

const damageModel = (project: Project): Record<string, any> => project.documents[COMBAT_DOC]?.data.damageModel ?? {}

/** Per parameter id: the systems that read it (Player survival stats, Combat enemy HP / damage, Trade prices). */
export function paramUsage(project: Project): Map<string, ParamUse[]> {
  const known = new Set(paramsOf(project).map((p) => p.id))
  const out = new Map<string, ParamUse[]>()
  const add = (id: unknown, use: ParamUse) => {
    if (typeof id !== 'string' || !known.has(id)) return
    out.set(id, [...(out.get(id) ?? []), use])
  }
  for (const stat of playerList(project, 'survival')) add(stat.difficultyParam, { docId: PLAYER_DOC, label: `Player › ${stat.name ?? 'stat'} decay` })
  add(damageModel(project).hpParam, { docId: COMBAT_DOC, label: 'Combat › enemy HP' })
  add(damageModel(project).damageParam, { docId: COMBAT_DOC, label: 'Combat › enemy damage' })
  add(tradePriceParam(project)?.id, { docId: 'design.trade', label: 'Trade › prices' })
  return out
}

export const unusedParams = (project: Project): Entity[] => {
  const used = paramUsage(project)
  return paramsOf(project).filter((p) => !used.get(p.id)?.length)
}

export type ImpactRow = {
  group: 'Survival' | 'Combat' | 'Trade'
  label: string
  /** 'time': time to critical in `unit`; 'mult': a × multiplier. */
  kind: 'time' | 'mult'
  unit: string
  param?: Entity
  values: Record<string, number | null>
}

/** Per difficulty level: survival time to critical, enemy HP / damage multipliers and the price multiplier. */
export function difficultyImpact(project: Project): ImpactRow[] {
  const levels = levelsOf(project)
  const params = new Map(paramsOf(project).map((p) => [p.id, p]))
  const per = (fn: (levelId: string) => number | null) => Object.fromEntries(levels.map((l) => [l.id, fn(l.id)]))
  const rows: ImpactRow[] = []
  for (const stat of playerList(project, 'survival')) {
    const param = params.get(stat.difficultyParam)
    if (!param) continue
    rows.push({ group: 'Survival', label: `${stat.name ?? 'Stat'}: time to critical`, kind: 'time', unit: unitOf(stat), param, values: per((id) => timeToCritical(project, stat, id)) })
  }
  const dm = damageModel(project)
  for (const [key, label] of [
    ['hpParam', 'Enemy HP'],
    ['damageParam', 'Enemy damage'],
  ] as const) {
    const param = params.get(dm[key])
    if (param) rows.push({ group: 'Combat', label, kind: 'mult', unit: '×', param, values: per((id) => difficultyMultiplier(project, param.id, id)) })
  }
  const price = tradePriceParam(project)
  if (price) rows.push({ group: 'Trade', label: 'Buy prices', kind: 'mult', unit: '×', param: price, values: per((id) => difficultyPriceMult(project, id)) })
  return rows
}
