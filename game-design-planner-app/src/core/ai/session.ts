import { create } from 'zustand'
import { z } from 'zod'
import { cleanKey } from './security'
import { PROVIDER_IDS, type ModelInfo, type ProviderId } from './types'

/**
 * API keys live ONLY in this module-private map (browser memory). They are never put in a persisted
 * store, the project, autosave, exports, logs or the DOM beyond the password input.
 */
const keys = new Map<ProviderId, string>()
export const getKey = (p: ProviderId): string | undefined => keys.get(p)

type SessionState = {
  hasKey: Record<ProviderId, boolean>
  models: Partial<Record<ProviderId, ModelInfo[]>>
  setKey: (p: ProviderId, raw: string) => void
  clearKey: (p: ProviderId) => void
  clearAll: () => void
  setModels: (p: ProviderId, m: ModelInfo[]) => void
}
const noKeys = (): Record<ProviderId, boolean> => ({ openai: false, anthropic: false, gemini: false })

export const useAiSession = create<SessionState>((set) => ({
  hasKey: noKeys(),
  models: {},
  setKey: (p, raw) => {
    keys.set(p, cleanKey(raw))
    set((s) => ({ hasKey: { ...s.hasKey, [p]: true } }))
  },
  clearKey: (p) => {
    keys.delete(p)
    set((s) => ({ hasKey: { ...s.hasKey, [p]: false }, models: { ...s.models, [p]: undefined } }))
  },
  clearAll: () => {
    keys.clear()
    set({ hasKey: noKeys(), models: {} })
  },
  setModels: (p, m) => set((s) => ({ models: { ...s.models, [p]: m } })),
}))

const num = z.number().finite().min(0)
const settingsSchema = z.object({
  provider: z.enum(PROVIDER_IDS as [ProviderId, ...ProviderId[]]).default('anthropic'),
  models: z.record(z.string(), z.string()).default({}),
  maxOutputTokens: z.number().int().min(64).max(64000).default(4096),
  timeoutSec: z.number().int().min(10).max(600).default(120),
  maxContextChars: z.number().int().min(2000).max(400000).default(60000),
  limits: z
    .object({ dayTokens: num.default(0), monthTokens: num.default(0), dayCost: num.default(0), monthCost: num.default(0) })
    .default({ dayTokens: 0, monthTokens: 0, dayCost: 0, monthCost: 0 }),
  // price per 1M tokens, keyed by "provider/model"
  prices: z.record(z.string(), z.object({ input: num, output: num })).default({}),
  promptLanguage: z.enum(['auto', 'en', 'hu']).default('auto'),
})
export type AiSettings = z.infer<typeof settingsSchema>
export const SETTINGS_KEY = 'hohplan:ai:settings'

const readJson = (key: string): unknown => {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

const parseSettings = (v: unknown): AiSettings => {
  const r = settingsSchema.safeParse(v)
  return r.success ? r.data : settingsSchema.parse({})
}

export const useAiSettings = create<{ settings: AiSettings; update: (fn: (s: AiSettings) => void) => void }>((set, get) => ({
  settings: parseSettings(readJson(SETTINGS_KEY)),
  update: (fn) => {
    const next = structuredClone(get().settings)
    fn(next)
    const valid = parseSettings(next)
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(valid))
    } catch {
      /* storage may be unavailable; settings stay in memory */
    }
    set({ settings: valid })
  },
}))

export const priceKey = (p: ProviderId, model: string) => `${p}/${model}`
