import type { Entity, Project } from './model/types'

export const DIFFICULTY_DOC = 'design.difficulty'
export const HARDER = 'Higher = harder'
export const EASIER = 'Higher = easier'

export type Level = { id: string; label: string }

export const levelsOf = (project: Project): Level[] => project.registry.catalogs.difficulties?.items ?? []
export const paramsOf = (project: Project): Entity[] => project.documents[DIFFICULTY_DOC]?.data.params ?? []
export const cellsOf = (project: Project): Record<string, string | number> => project.documents[DIFFICULTY_DOC]?.data.values?.cells ?? {}

export const numeric = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** Where a value sits in the parameter's range, 0–1, flipped so that 1 is always the hardest. Null if the range is unknown. */
export function pressure(param: Entity, value: unknown): number | null {
  if (!numeric(value) || !numeric(param.min) || !numeric(param.max) || param.max === param.min) return null
  const t = (value - param.min) / (param.max - param.min)
  if (param.direction === EASIER) return 1 - t
  return t
}

export type DifficultyFindings = {
  missing: { level: Level; params: Entity[] }[]
  outOfRange: { param: Entity; level: Level; value: number }[]
  reversals: { param: Entity; from: Level; to: Level }[]
  noContext: Entity[]
}

export function analyzeDifficulty(project: Project): DifficultyFindings {
  const levels = levelsOf(project)
  const params = paramsOf(project)
  const cells = cellsOf(project)
  const at = (p: Entity, l: Level) => cells[`${p.id}|${l.id}`]
  const out: DifficultyFindings = { missing: [], outOfRange: [], reversals: [], noContext: [] }

  for (const level of levels) {
    const gone = params.filter((p) => !numeric(at(p, level)))
    if (gone.length) out.missing.push({ level, params: gone })
  }
  for (const p of params) {
    if (!p.direction || !numeric(p.min) || !numeric(p.max)) out.noContext.push(p)
    for (const level of levels) {
      const v = at(p, level)
      if (numeric(v) && ((numeric(p.min) && v < p.min) || (numeric(p.max) && v > p.max))) out.outOfRange.push({ param: p, level, value: v })
    }
    if (p.exception || (p.direction !== HARDER && p.direction !== EASIER)) continue
    for (let i = 1; i < levels.length; i++) {
      const a = at(p, levels[i - 1])
      const b = at(p, levels[i])
      if (!numeric(a) || !numeric(b)) continue
      if (p.direction === HARDER ? b < a : b > a) out.reversals.push({ param: p, from: levels[i - 1], to: levels[i] })
    }
  }
  return out
}
