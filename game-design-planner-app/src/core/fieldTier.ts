/**
 * Progressive fields (v3, plans/UI_V3_PLAN.md "Field tiers"): a new entry or an empty form shows only its core
 * fields; the rest wait behind "+ field" chips until they have a value or are opened. Pure.
 */
import type { FieldDef } from './model/types'

/** How many fields count as core when a section marks none itself. */
export const DEFAULT_CORE_COUNT = 3

export const isBlank = (v: unknown) =>
  v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0) || (typeof v === 'object' && !Array.isArray(v) && Object.keys(v as object).length === 0)

/**
 * The always-visible fields. Fields marked `tier: 'core'` always are, `tier: 'detail'` never. Of the unmarked
 * ones, required fields are core, then the first remaining fields of the first group that has any (ungrouped
 * fields count as one group), until `DEFAULT_CORE_COUNT` unmarked fields are core. So a collection whose only
 * ungrouped field is the required Name still gets its first real group's leading fields, and marking a few
 * fields core adds to that default instead of replacing it.
 */
export function coreFieldKeys(fields: FieldDef[]): Set<string> {
  const core = new Set<string>()
  let auto = 0
  for (const f of fields) {
    if (f.tier === 'core') core.add(f.key)
    else if (f.tier === undefined && f.required) {
      core.add(f.key)
      auto++
    }
  }
  const rest = fields.filter((f) => f.tier === undefined && !core.has(f.key))
  const firstGroup = rest[0]?.group
  for (const f of rest) {
    if (auto >= DEFAULT_CORE_COUNT) break
    if (f.group === firstGroup) {
      core.add(f.key)
      auto++
    }
  }
  return core
}

/**
 * Which fields to show and which to offer as chips: core fields, fields with a value and fields the user opened
 * are shown; the rest are hidden, in their original order.
 */
export function splitByTier(fields: FieldDef[], values: Record<string, unknown>, opened: ReadonlySet<string>, core = coreFieldKeys(fields)) {
  const shown: FieldDef[] = []
  const hidden: FieldDef[] = []
  for (const f of fields) (core.has(f.key) || !isBlank(values[f.key]) || opened.has(f.key) ? shown : hidden).push(f)
  return { shown, hidden }
}
