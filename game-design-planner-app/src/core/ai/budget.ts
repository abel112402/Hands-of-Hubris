import { z } from 'zod'
import type { AiSettings } from './session'
import type { ProviderId } from './types'

export const USAGE_KEY = 'hohplan:ai:usage'

/** Rough token estimate (about 4 characters per token); good enough for a pre-send budget check. */
export const estimateTokens = (text: string) => Math.ceil(text.length / 4)

const ledgerSchema = z.object({
  day: z.string(), month: z.string(),
  dayTokens: z.number().min(0), monthTokens: z.number().min(0),
  dayCost: z.number().min(0), monthCost: z.number().min(0),
})
export type Ledger = z.infer<typeof ledgerSchema>

const dayOf = (d = new Date()) => d.toISOString().slice(0, 10)

export function readLedger(now = new Date()): Ledger {
  let l: Ledger = { day: dayOf(now), month: dayOf(now).slice(0, 7), dayTokens: 0, monthTokens: 0, dayCost: 0, monthCost: 0 }
  try {
    const p = ledgerSchema.safeParse(JSON.parse(localStorage.getItem(USAGE_KEY) ?? 'null'))
    if (p.success) l = p.data
  } catch {
    /* ignore */
  }
  const day = dayOf(now)
  if (l.month !== day.slice(0, 7)) l = { ...l, month: day.slice(0, 7), monthTokens: 0, monthCost: 0, day, dayTokens: 0, dayCost: 0 }
  if (l.day !== day) l = { ...l, day, dayTokens: 0, dayCost: 0 }
  return l
}

export function recordUsage(tokens: number, cost: number, now = new Date()) {
  const l = readLedger(now)
  l.dayTokens += tokens; l.monthTokens += tokens; l.dayCost += cost; l.monthCost += cost
  try {
    localStorage.setItem(USAGE_KEY, JSON.stringify(l))
  } catch {
    /* ignore */
  }
}

export const resetLedger = () => {
  try { localStorage.removeItem(USAGE_KEY) } catch { /* ignore */ }
}

export function costOf(settings: AiSettings, provider: ProviderId, model: string, input: number, output: number): number | null {
  const p = settings.prices[`${provider}/${model}`]
  if (!p || (p.input === 0 && p.output === 0)) return null
  return (input * p.input + output * p.output) / 1_000_000
}

export type BudgetCheck = { ok: boolean; reasons: string[] }

/** Checks the estimated request against the configured daily/monthly limits (0 = no limit). */
export function checkBudget(settings: AiSettings, estTokens: number, estCost: number | null, ledger = readLedger()): BudgetCheck {
  const L = settings.limits
  const reasons: string[] = []
  if (L.dayTokens && ledger.dayTokens + estTokens > L.dayTokens) reasons.push('dayTokens')
  if (L.monthTokens && ledger.monthTokens + estTokens > L.monthTokens) reasons.push('monthTokens')
  if (estCost !== null) {
    if (L.dayCost && ledger.dayCost + estCost > L.dayCost) reasons.push('dayCost')
    if (L.monthCost && ledger.monthCost + estCost > L.monthCost) reasons.push('monthCost')
  }
  return { ok: reasons.length === 0, reasons }
}
