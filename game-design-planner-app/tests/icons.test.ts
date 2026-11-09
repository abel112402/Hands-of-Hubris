import { describe, expect, it } from 'vitest'
import { MODULES } from '../src/core/modules/registry'
import { ICON_NAMES } from '../src/ui/Icon'
import { MODULE_ICONS } from '../src/ui/ModuleIcon'

describe('planner icons', () => {
  it('gives every planner a line icon that exists', () => {
    for (const m of MODULES) {
      expect(MODULE_ICONS[m.id], m.id).toBeDefined()
      expect(ICON_NAMES).toContain(MODULE_ICONS[m.id])
    }
  })

  it('has no entries for planners that no longer exist', () => {
    const ids = new Set(MODULES.map((m) => m.id))
    expect(Object.keys(MODULE_ICONS).filter((id) => !ids.has(id))).toEqual([])
  })
})
