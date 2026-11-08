import { z } from 'zod'
import { PHASES, type DoneRule } from './types'

/**
 * Zod schemas for walkthrough packs. Built-in packs are checked in tests; packs loaded at runtime
 * (imported files, community or AI-drafted packs) must pass `parsePack` before use.
 * Referential checks (known modules, sections, anchors) live in `validatePack` in compose.ts.
 */

const id = z.string().min(1).max(80).regex(/^[\w.-]+$/)
export const i18nText = z.union([z.string().min(1), z.object({ en: z.string().min(1) }).catchall(z.string())])
const phase = z.enum(PHASES)

export const doneRule: z.ZodType<DoneRule> = z.lazy(() =>
  z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('sectionFilled'), docId: id, section: id, min: z.number().int().min(1).optional() }),
    z.object({ kind: z.literal('moduleStep'), docId: id, stepId: id }),
    z.object({ kind: z.literal('hintsClear'), ruleIds: z.array(z.string().min(1)).min(1) }),
    z.object({ kind: z.literal('all'), rules: z.array(doneRule).min(1) }),
    z.object({ kind: z.literal('any'), rules: z.array(doneRule).min(1) }),
    z.object({ kind: z.literal('manual') }),
  ]),
)

const stepFields = {
  kind: z.enum(['learn', 'decide', 'build', 'review', 'milestone']),
  phase,
  chapter: id,
  title: i18nText,
  body: i18nText,
  tips: z.array(i18nText).optional(),
  examples: z.array(z.object({ docId: id, exampleId: id })).optional(),
  target: z.object({ docId: id, section: id.optional(), moduleStep: id.optional() }).optional(),
  done: doneRule,
  optional: z.boolean().optional(),
  aiPrompt: i18nText.optional(),
}

export const walkStep = z.object({ id, ...stepFields })
const chapter = z.object({ id, phase, title: i18nText })

export const basePack = z.object({
  id: z.literal('base'),
  version: z.number().int().min(1),
  chapters: z.array(chapter),
  steps: z.array(walkStep),
})

export const genrePack = z.object({
  id,
  version: z.number().int().min(1),
  chapters: z.array(chapter).optional(),
  insert: z.array(z.object({ after: id, steps: z.array(walkStep).min(1) })).optional(),
  replace: z.record(id, z.object(stepFields).partial()).optional(),
  notes: z.record(id, z.array(i18nText).min(1)).optional(),
  remove: z.array(id).optional(),
})

export const parsePack = (raw: unknown) => genrePack.parse(raw)

/** `meta.guide` in the project file. Unknown keys are kept so newer files round-trip. */
export const guideStateSchema = z
  .object({
    version: z.number().int().min(1),
    manual: z.array(z.string()).default([]),
    skipped: z.array(z.string()).default([]),
    modules: z.record(z.string(), z.array(z.string())).optional(),
  })
  .passthrough()
