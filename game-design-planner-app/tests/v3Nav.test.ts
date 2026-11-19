import { describe, expect, it } from 'vitest'
import { compassPhases, plannerPhase } from '../src/core/compass'
import { createProject } from '../src/core/model/project'
import { getModule, MODULES } from '../src/core/modules/registry'
import { projectWalkthrough } from '../src/core/walkthrough/project'
import { PHASES } from '../src/core/walkthrough/types'
import { shortcutAction } from '../src/ui/v3/shortcuts'

describe('phase compass', () => {
  it('puts every planner in exactly one of the five phases, in order', () => {
    const p = createProject('Compass')
    const groups = compassPhases(p, projectWalkthrough(p))
    expect(groups.map((g) => g.phase)).toEqual([...PHASES])
    const ids = groups.flatMap((g) => g.planners.map((x) => x.id))
    expect(ids.sort()).toEqual(MODULES.map((m) => m.id).sort())
    for (const g of groups) expect(g.progress).toBeGreaterThanOrEqual(0)
  })

  it("follows the walkthrough: a planner a step opens sits in that step's phase, others by group", () => {
    const walk = { steps: [{ phase: 'ship', target: { docId: 'overview.vision' } }] } as never
    expect(plannerPhase(walk, getModule('overview.vision')!)).toBe('ship')
    expect(plannerPhase(walk, getModule('design.combat')!)).toBe('systems')
    expect(plannerPhase({ steps: [] }, getModule('overview.vision')!)).toBe('concept')
  })
})

describe('shortcuts', () => {
  const project = createProject('Keys')
  it('steps through sections with J and K and stops at the ends', () => {
    expect(shortcutAction('j', { project, docId: 'design.combat', sectionId: 'enemies' })).toEqual({ kind: 'go', to: '/doc/design.combat?s=bosses' })
    expect(shortcutAction('K', { project, docId: 'design.combat', sectionId: 'enemies' })?.kind).toBe('go')
    expect(shortcutAction('k', { project, docId: 'design.combat' })).toBeUndefined()
  })

  it('maps the other keys and ignores the rest', () => {
    expect(shortcutAction('a', { project })).toEqual({ kind: 'go', to: '/' })
    expect(shortcutAction('/', { project })).toEqual({ kind: 'palette' })
    expect(shortcutAction('.', { project })).toEqual({ kind: 'hints' })
    expect(shortcutAction('n', { project, nextLink: '/doc/overview.vision' })).toEqual({ kind: 'go', to: '/doc/overview.vision' })
    expect(shortcutAction('n', { project })).toBeUndefined()
    expect(shortcutAction('m', { project })).toBeUndefined()
    expect(shortcutAction('m', { project, docId: 'design.combat' })).toEqual({ kind: 'map' })
    expect(shortcutAction('x', { project, docId: 'design.combat' })).toBeUndefined()
  })
})
