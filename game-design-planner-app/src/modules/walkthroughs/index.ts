/**
 * Walkthrough content: the base pack every project gets, and one pack per genre.
 * Content only; the engine lives in src/core/walkthrough.
 *
 * Rules for editing:
 * - Step, chapter and pack IDs are stable and saved in project files (ticks, skips). Never rename or reuse.
 * - Bump a pack's `version` when its content changes meaningfully.
 * - Add a genre walkthrough = one GenrePack file + one entry in GENRE_PACKS (key = genre ID). No other code changes.
 *
 * M4 ships the engine with the foundation chapter only; the full base (M5) and genre packs (M6) follow.
 */
import type { BasePack, GenrePack } from '../../core/walkthrough/types'

export const BASE_PACK: BasePack = {
  id: 'base',
  version: 1,
  chapters: [{ id: 'foundation', phase: 'concept', title: 'Foundation' }],
  steps: [
    {
      id: 'concept.pitch',
      kind: 'decide',
      phase: 'concept',
      chapter: 'foundation',
      title: 'Write the pitch',
      body: 'One paragraph: who the player is, what they do and why it is fun.',
      target: { docId: 'overview.vision', section: 'pitch' },
      done: { kind: 'sectionFilled', docId: 'overview.vision', section: 'pitch' },
      aiPrompt: 'Help me sharpen my game pitch into one clear paragraph.',
    },
    {
      id: 'concept.pillars',
      kind: 'decide',
      phase: 'concept',
      chapter: 'foundation',
      title: 'Pick 3–5 design pillars',
      body: 'Pillars decide which features stay when time runs out.',
      target: { docId: 'overview.vision', section: 'pillars' },
      done: { kind: 'sectionFilled', docId: 'overview.vision', section: 'pillars', min: 3 },
    },
    {
      id: 'concept.loop',
      kind: 'decide',
      phase: 'concept',
      chapter: 'foundation',
      title: 'Describe the core loop',
      body: 'What the player does every minute, every session and over the whole game.',
      target: { docId: 'design.coreLoop', section: 'loops' },
      done: { kind: 'sectionFilled', docId: 'design.coreLoop', section: 'loops' },
    },
  ],
}

/** Genre walkthrough packs, keyed by genre ID. A selected genre without a pack uses the base only. */
export const GENRE_PACKS: Record<string, GenrePack> = {}
