import { afterEach, describe, expect, it } from 'vitest'
import { buildReferenceSlice } from './fixtures/referenceSlice3d'
import { CAPABILITIES, PROTOTYPE_DOC, PROTOTYPE_SECTION, prototypeProfile, prototypeReport, wantsPrototype } from '../src/core/engine/capabilities'
import { buildBundle } from '../src/core/engine/bundle'
import { deserializeProject } from '../src/core/persistence/serialize'
import { getModule, getSections } from '../src/core/modules/registry'
import type { Project } from '../src/core/model/types'

/** plans/UNITY_PLAYABLE_GAME_GENERATION_PLAN.md, phase 1: explicit profile, capability matrix and diagnostics. */
const fs: { readFileSync: (p: string, e: string) => string } = await import('node:fs' as string)
const proto = (p: Project) => p.documents[PROTOTYPE_DOC].data[PROTOTYPE_SECTION] as Record<string, unknown>
const errors = (p: Project, engine: 'unity' | 'godot' = 'unity') => prototypeReport(p, engine).issues.filter((i) => i.level === 'error')

describe('Playable prototype section', () => {
  it('is a form in Technical Architecture with the profile and one switch per system', () => {
    const p = buildReferenceSlice()
    const sec = getSections(getModule(PROTOTYPE_DOC)!, p.registry).find((s) => s.id === PROTOTYPE_SECTION)!
    if (sec.kind !== 'form') throw new Error('Playable prototype must be a form')
    expect(sec.fields.map((f) => f.key)).toEqual(['dimension', 'perspective', 'renderPipeline', 'platform', ...CAPABILITIES.map((c) => c.id), 'weapon', 'scene', 'locations', 'mapScale'])
  })

  it('reads the profile and ignores unknown values', () => {
    const p = buildReferenceSlice()
    expect(prototypeProfile(p)).toEqual({ dimension: '3D', perspective: 'Third-person', renderPipeline: 'URP', platform: 'Windows', systems: ['movement', 'interaction', 'inventory', 'quests', 'saveLoad', 'crafting', 'combat', 'dialogue', 'progression', 'trade', 'time'] })
    proto(p).perspective = 'Over the shoulder (from a newer file)'
    expect(prototypeProfile(p).perspective).toBeUndefined()
  })
})

describe('projects that do not ask for a prototype', () => {
  it('get no prototype checks and no README section (Cinderholm stays as it was)', () => {
    const p = deserializeProject(fs.readFileSync('examples/cinderholm.hohplan.json', 'utf8')).project
    expect(wantsPrototype(p)).toBe(false)
    expect(prototypeReport(p, 'unity').issues).toEqual([])
    const b = buildBundle(p, 'unity', '2026-01-01T00:00:00.000Z')
    expect(b.issues.some((i) => i.code.startsWith('proto.'))).toBe(false)
    expect(b.files.find((f) => f.path === 'README.md')!.content).not.toContain('Playable prototype')
  })
})

describe('diagnostics', () => {
  it('asks for every missing choice instead of guessing it, and points to the field', () => {
    const p = buildReferenceSlice()
    proto(p).perspective = ''
    delete proto(p).platform
    const missing = errors(p).filter((i) => i.code === 'proto.choiceMissing')
    expect(missing.map((i) => i.field)).toEqual(['perspective', 'platform'])
    expect(missing[0].where).toEqual({ doc: PROTOTYPE_DOC, section: PROTOTYPE_SECTION, field: 'perspective' })
  })

  it('rejects unsupported profile choices; an unverified platform only warns', () => {
    const p = buildReferenceSlice()
    Object.assign(proto(p), { dimension: '2D', perspective: 'First-person', renderPipeline: 'HDRP', platform: 'Android' })
    const r = prototypeReport(p, 'unity')
    const bad = r.issues.filter((i) => i.code === 'proto.profileUnsupported').map((i) => [i.field, i.level])
    expect(bad).toEqual([['dimension', 'error'], ['perspective', 'error'], ['renderPipeline', 'error'], ['platform', 'warning']])
    expect(r.playable).toBe(false)
  })

  it('names a missing dependency and missing data with where to fix it', () => {
    const p = buildReferenceSlice()
    proto(p).interaction = false
    p.documents['design.items'].data.items = []
    const e = errors(p)
    expect(e).toContainEqual(expect.objectContaining({ code: 'proto.requires', field: 'inventory', where: { doc: PROTOTYPE_DOC, section: PROTOTYPE_SECTION, field: 'interaction' } }))
    expect(e).toContainEqual(expect.objectContaining({ code: 'proto.dataMissing', field: 'inventory', where: { doc: 'design.items', section: 'items' } }))
  })

  it('warns when no system is chosen', () => {
    const p = buildReferenceSlice()
    for (const c of CAPABILITIES) proto(p)[c.id] = false
    expect(prototypeReport(p, 'unity').issues.map((i) => i.code)).toContain('proto.noSystems')
  })

  it('treats engines without prototype support as unsupported for every choice', () => {
    const p = buildReferenceSlice()
    const e = errors(p, 'godot')
    expect(e.filter((i) => i.code === 'proto.unsupported').map((i) => i.field)).toEqual(['movement', 'interaction', 'inventory', 'quests', 'saveLoad', 'crafting', 'combat', 'dialogue', 'progression', 'trade', 'time'])
    expect(e.filter((i) => i.code === 'proto.profileUnsupported')).toHaveLength(4)
  })
})

describe('playable verdict', () => {
  const saved = CAPABILITIES.map((c) => ({ ...c.support }))
  afterEach(() => CAPABILITIES.forEach((c, i) => (c.support = { ...saved[i] })))

  it('is claimed for the reference since phase 12: every system it chose is a template (crafting since 14, combat since 15, dialogue since 16, progression, trade and time since 20; settlement not yet), the others not yet', () => {
    const working = ['movement', 'interaction', 'inventory', 'quests', 'saveLoad', 'crafting', 'combat', 'dialogue', 'progression', 'trade', 'time']
    expect(CAPABILITIES.filter((c) => working.includes(c.id)).map((c) => c.support.unity?.level)).toEqual(['template', 'template', 'template', 'template', 'template', 'template', 'template', 'template', 'template', 'template', 'template'])
    expect(CAPABILITIES.filter((c) => !working.includes(c.id)).every((c) => c.support.unity?.level === 'frame' || c.support.unity?.level === 'unsupported')).toBe(true)
    const r = prototypeReport(buildReferenceSlice(), 'unity')
    expect(r.playable).toBe(true)
    expect(r.issues.at(-1)).toMatchObject({ code: 'proto.verdict', message: 'Playable prototype: every chosen system works from the plan.' })
    // Choosing a system that is not supported yet takes the claim back.
    const p = buildReferenceSlice()
    ;(p.documents['technical.architecture'].data.prototype as Record<string, unknown>).dialogue = true
    p.documents['design.story'].data.characters = [{ id: 'c1', name: 'Keeper' }]
    expect(prototypeReport(p, 'unity').playable).toBe(false)
  })

  it('is given only when every chosen system works and nothing blocks', () => {
    for (const c of CAPABILITIES) c.support = { unity: { level: 'template', note: '' } }
    const p = buildReferenceSlice()
    expect(prototypeReport(p, 'unity').playable).toBe(true)
    p.documents['design.story'].data.quests = []
    expect(prototypeReport(p, 'unity').playable).toBe(false)
  })
})
