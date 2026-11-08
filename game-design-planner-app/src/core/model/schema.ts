import { z } from 'zod'
import { FORMAT } from './types'

const catalogItem = z.object({ id: z.string(), label: z.string() }).passthrough()
const registry = z
  .object({
    catalogs: z.record(z.string(), z.object({ label: z.string(), items: z.array(catalogItem) }).passthrough()),
    customFields: z.record(z.string(), z.array(z.any())).default({}),
    entityTypes: z.array(z.object({ id: z.string(), name: z.string(), fields: z.array(z.any()) }).passthrough()).default([]),
  })
  .passthrough()

/** Genre profile. Optional, so files without it (format v1) load unchanged as neutral projects. */
export const profileSchema = z
  .object({
    version: z.number().int().min(1),
    genres: z.array(z.string()),
    customGenres: z.array(z.string()).optional(),
    editors: z.object({ add: z.array(z.string()), remove: z.array(z.string()) }).passthrough().optional(),
  })
  .passthrough()

/** Unknown keys are kept (passthrough) so files saved by newer versions do not lose data. */
export const projectSchema = z
  .object({
    format: z.literal(FORMAT),
    formatVersion: z.number().int().min(1),
    meta: z
      .object({
        name: z.string(),
        createdAt: z.string(),
        updatedAt: z.string(),
        appVersion: z.string(),
        profile: profileSchema.optional(),
      })
      .passthrough(),
    registry,
    documents: z.record(
      z.string(),
      z.object({ moduleVersion: z.number(), data: z.record(z.string(), z.any()) }).passthrough(),
    ),
    links: z.array(z.object({ from: z.string(), to: z.string(), kind: z.string() })).default([]),
  })
  .passthrough()
