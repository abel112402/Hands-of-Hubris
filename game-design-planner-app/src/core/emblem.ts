/**
 * The design emblem (v3 Atlas, from the prototype review): a small figure built up by the project's progress,
 * one part per walkthrough phase, chosen by the project's genre, with a rank that rises with the explored share.
 * Pure; the picture is drawn in ui/v3/Emblem.tsx.
 */
import { PHASES, type PhaseId } from './walkthrough/types'

export type EmblemFigure = 'knight' | 'camp' | 'castle'

/** Which figure a genre draws; the project's first genre decides, no genre draws the knight. */
const GENRE_FIGURE: Record<string, EmblemFigure> = {
  rpg: 'knight', action: 'knight', adventure: 'knight', roguelike: 'knight',
  survival: 'camp', sandbox: 'camp',
  strategy: 'castle', simulation: 'castle',
}
export const figureFor = (genres: readonly string[]): EmblemFigure => GENRE_FIGURE[genres.find((g) => GENRE_FIGURE[g]) ?? ''] ?? 'knight'

/** Explored share (%) at which each rank begins. */
export const RANK_AT = [0, 10, 25, 50, 75] as const

/** i18n keys: v3.emblem.<figure>.ranks.<n> and v3.emblem.<figure>.parts.<phase>. */
export type EmblemState = {
  figure: EmblemFigure
  /** Fill of each part (0–1), by phase. */
  parts: Record<PhaseId, number>
  rank: number
  /** The explored share (0–100) the next rank needs; undefined at the top rank. */
  nextRankAt?: number
  /** The first part not complete yet, to say what to fill next; undefined when all are built. */
  nextPart?: PhaseId
  explored: number
}

export function emblemState(genres: readonly string[], phaseProgress: Partial<Record<PhaseId, number>>, explored: number): EmblemState {
  const parts = Object.fromEntries(PHASES.map((p) => [p, Math.max(0, Math.min(1, (phaseProgress[p] ?? 0) / 100))])) as Record<PhaseId, number>
  let rank = 0
  RANK_AT.forEach((at, i) => {
    if (explored >= at) rank = i
  })
  return {
    figure: figureFor(genres),
    parts,
    rank,
    nextRankAt: RANK_AT[rank + 1],
    nextPart: PHASES.find((p) => parts[p] < 1),
    explored,
  }
}
