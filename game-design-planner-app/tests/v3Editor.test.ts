import { describe, expect, it } from 'vitest'
import { coreFieldKeys, DEFAULT_CORE_COUNT, splitByTier } from '../src/core/fieldTier'
import { createProject } from '../src/core/model/project'
import type { CollectionSection, FieldDef } from '../src/core/model/types'
import { getModule, getSection } from '../src/core/modules/registry'
import { sectionStates } from '../src/core/progress'

const text = (key: string, o: Partial<FieldDef> = {}): FieldDef => ({ key, label: key, type: 'text', ...o }) as FieldDef

describe('field tiers', () => {
  it('makes required fields and the leading fields of the first group core', () => {
    const fields = [text('name', { required: true }), text('biome', { group: 'Identity' }), text('role', { group: 'Identity' }), text('tier', { group: 'Identity' }), text('hp', { group: 'Stats' })]
    expect([...coreFieldKeys(fields)]).toEqual(['name', 'biome', 'role'])
  })

  it('adds marked core fields on top of the default and never shows marked detail fields by default', () => {
    const fields = [text('a'), text('b', { tier: 'detail' }), text('c'), text('d'), text('e', { group: 'G', tier: 'core' })]
    const core = coreFieldKeys(fields)
    expect(core.has('b')).toBe(false)
    expect([...core].sort()).toEqual(['a', 'c', 'd', 'e'])
  })

  it('uses the real enemy schema: name, the first identity fields, and the marked combat stats', () => {
    const sec = getSection(getModule('design.combat')!, createProject('T').registry, 'enemies') as CollectionSection
    expect([...coreFieldKeys(sec.fields)].sort()).toEqual(['attackRate', 'biome', 'damage', 'hp', 'name', 'role'])
    expect(DEFAULT_CORE_COUNT).toBe(3)
  })

  it('shows core, filled and opened fields and hides the rest in order', () => {
    const fields = [text('a'), text('b'), text('c'), text('d'), text('e'), text('f')]
    const { shown, hidden } = splitByTier(fields, { e: 'x', d: '' }, new Set(['f']))
    expect(shown.map((f) => f.key)).toEqual(['a', 'b', 'c', 'e', 'f'])
    expect(hidden.map((f) => f.key)).toEqual(['d'])
  })
})

describe('section states', () => {
  it('reports empty sections and done sections like the system map', () => {
    const p = createProject('States')
    const before = sectionStates(p, 'design.combat')
    expect(before.enemies.state).toBe('empty')
    p.documents['design.combat'].data.enemies = [{ id: 'e1', name: 'Ghoul' }]
    const after = sectionStates(p, 'design.combat')
    expect(after.enemies.state).not.toBe('empty')
    expect(after.enemies.state === 'started').toBe(after.enemies.hints > 0)
    expect(sectionStates(p, 'nope')).toEqual({})
  })
})
