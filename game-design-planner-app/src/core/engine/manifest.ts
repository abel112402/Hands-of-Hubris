import { z } from 'zod'

/** `hoh-engine.json`, the manifest at the root of every engine export. Engine-side importers read this first. */
export const ENGINE_FORMAT = 'hoh-engine'
export const ENGINE_FORMAT_VERSION = 1

export const manifestSchema = z.object({
  format: z.literal(ENGINE_FORMAT),
  v: z.literal(ENGINE_FORMAT_VERSION),
  /** adapterVersion 0 = no code generator for this engine yet; the bundle holds the engine-neutral part only. */
  engine: z.object({ id: z.enum(['unity', 'godot', 'unreal']), adapterVersion: z.number().int().nonnegative() }),
  generator: z.object({ app: z.string(), version: z.string() }),
  project: z.object({ name: z.string() }),
  exportedAt: z.string(),
  schemas: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      format: z.enum(['native', 'json', 'csv']),
      idPrefix: z.string(),
      version: z.number().int().positive(),
      records: z.number().int().nonnegative(),
      /** Folder (native, json) or file (csv) holding the records, relative to the bundle root. */
      data: z.string(),
      load: z.object({ group: z.string(), strategy: z.string(), label: z.string().optional() }).optional(),
    }),
  ),
  counts: z.object({ records: z.number().int(), enums: z.number().int(), formulas: z.number().int(), strings: z.number().int(), maps: z.number().int() }),
  /** Every other file of the bundle with a content hash (FNV-1a, hex), so importers can skip unchanged files. */
  files: z.array(z.object({ path: z.string(), hash: z.string() })),
  /** Engine packages the export needs (a plan with a playable prototype needs the planner runtime); the importer refuses without them. Absent otherwise. */
  requires: z.object({ runtime: z.object({ package: z.string(), version: z.string() }) }).optional(),
})

/** The Unity runtime package a playable-prototype export needs (engine-packages/unity/com.handsofhubris.planner-runtime). */
export const UNITY_RUNTIME = { package: 'com.handsofhubris.planner-runtime', version: '0.10.0' } as const
export type EngineManifest = z.infer<typeof manifestSchema>

/** Parses a manifest from untrusted text. */
export function parseManifest(text: string): { ok: true; manifest: EngineManifest } | { ok: false; error: string } {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (e) {
    return { ok: false, error: `Not valid JSON: ${(e as Error).message}` }
  }
  const r = manifestSchema.safeParse(raw)
  return r.success ? { ok: true, manifest: r.data } : { ok: false, error: r.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ') }
}

/** JSON Schema of the manifest, shipped in the bundle so engine-side code can validate against the same contract. */
export const manifestJsonSchema = () => z.toJSONSchema(manifestSchema)

/** 32-bit FNV-1a over UTF-16 code units, as 8 hex digits. Stable and synchronous; not for security. */
export function fnv1a(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}
