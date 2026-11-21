import type { Entity, Project } from '../model/types'
import { storedReport, type StoredReport } from './report'

/**
 * Playtest measurements from the engine report next to the Balance plan's targets (QA › Balance plan › Metrics).
 * A metric names the engine key it is measured under; its acceptable range is “Acceptable from” – “Acceptable to”
 * (either may be empty). Read-only: “Current” only changes when the user takes the measured value over.
 */
export const BALANCE_DOC = 'qa.balance'

export type Measured = StoredReport['metrics'][number]
export type MetricState = 'in' | 'low' | 'high' | 'noRange' | 'notMeasured' | 'noKey'
export type BalanceRow = { metric: Entity; key: string; target?: number; min?: number; max?: number; current?: number; measured?: Measured; state: MetricState; offTarget?: number }

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

export const balanceMetrics = (p: Project): Entity[] => {
  const list = p.documents[BALANCE_DOC]?.data.metrics
  return Array.isArray(list) ? list : []
}

/** Where a value falls against a range; an open end does not limit. */
export function rangeState(value: number, min?: number, max?: number): 'in' | 'low' | 'high' | 'noRange' {
  if (min === undefined && max === undefined) return 'noRange'
  if (min !== undefined && value < min) return 'low'
  if (max !== undefined && value > max) return 'high'
  return 'in'
}

export function balanceRows(p: Project): BalanceRow[] {
  const report = storedReport(p)
  const byKey = new Map((report?.metrics ?? []).map((m) => [m.key, m]))
  return balanceMetrics(p).map((metric) => {
    const key = str(metric.key)
    const target = num(metric.target)
    const lo = num(metric.min)
    const hi = num(metric.max)
    // A range written the wrong way round still means the span between the two numbers.
    const [min, max] = lo !== undefined && hi !== undefined && lo > hi ? [hi, lo] : [lo, hi]
    const measured = key ? byKey.get(key) : undefined
    const state: MetricState = !key ? 'noKey' : !measured ? 'notMeasured' : rangeState(measured.value, min, max)
    const offTarget = measured && target ? (measured.value - target) / Math.abs(target) : undefined
    return { metric, key, target, min, max, current: num(metric.current), measured, state, ...(offTarget !== undefined && { offTarget }) }
  })
}

/** Keys the engine measured that no Balance plan metric names, so the designer can add them. */
export function unmatchedMeasurements(p: Project): Measured[] {
  const keys = new Set(balanceMetrics(p).map((m) => str(m.key)).filter(Boolean))
  return (storedReport(p)?.metrics ?? []).filter((m) => !keys.has(m.key))
}

/** A readable name for a new metric from its key: “combat.deaths_per_hour” → “Combat: deaths per hour”. */
export function nameFromKey(key: string): string {
  const parts = key.split('.').filter(Boolean)
  const words = (s: string) => s.replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().trim()
  if (parts.length < 2) return words(key).replace(/^./, (c) => c.toUpperCase())
  const head = words(parts[0]).replace(/^./, (c) => c.toUpperCase())
  return `${head}: ${parts.slice(1).map(words).join(' ')}`
}

export const outOfRange = (p: Project) => balanceRows(p).filter((r) => r.state === 'low' || r.state === 'high')
