/**
 * Walkthrough content: the base pack every project gets, and one pack per genre.
 * Content only; the engine lives in src/core/walkthrough.
 *
 * Rules for editing:
 * - Step, chapter and pack IDs are stable and saved in project files (ticks, skips). Never rename or reuse.
 * - Bump a pack's `version` when its content changes meaningfully.
 * - Add a genre walkthrough = one GenrePack file + one entry in GENRE_PACKS (key = genre ID). No other code changes.
 */
import type { GenrePack } from '../../core/walkthrough/types'

export { BASE_PACK } from './base'

/** Genre walkthrough packs, keyed by genre ID. A selected genre without a pack uses the base only. */
export const GENRE_PACKS: Record<string, GenrePack> = {}
