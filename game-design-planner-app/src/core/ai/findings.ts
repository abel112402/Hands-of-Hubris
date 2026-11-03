import { z } from 'zod'
import { getModule, getSections } from '../modules/registry'
import type { Project } from '../model/types'
import { extractJson } from './proposals'

const findingsSchema = z.object({
  findings: z
    .array(z.object({
      severity: z.enum(['info', 'warning', 'error']).default('info'),
      docId: z.string().max(100),
      sectionId: z.string().max(100).optional(),
      entityId: z.string().max(100).optional(),
      message: z.string().min(1).max(700),
    }))
    .max(60),
})
export type Finding = z.infer<typeof findingsSchema>['findings'][number]

/** Parses a review answer. Findings pointing to unknown documents/sections are discarded, not trusted. */
export function parseFindings(project: Project, text: string): { ok: true; findings: Finding[] } | { ok: false; error: string } {
  try {
    const r = findingsSchema.safeParse(extractJson(text))
    if (!r.success) return { ok: false, error: r.error.issues.slice(0, 3).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') }
    const findings = r.data.findings
      .filter((f) => !!getModule(f.docId))
      .map((f) => {
        const secs = getSections(getModule(f.docId)!, project.registry)
        return secs.some((s) => s.id === f.sectionId) ? f : { ...f, sectionId: undefined, entityId: undefined }
      })
    return { ok: true, findings }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Invalid JSON' }
  }
}
