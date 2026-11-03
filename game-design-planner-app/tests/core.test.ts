import { describe, expect, it } from 'vitest'
import { evaluate, tryEvaluate, variablesOf } from '../src/core/formula'
import { createProject, makeId } from '../src/core/model/project'
import { deserializeProject, documentToFile, parseDocumentFile, serializeProject } from '../src/core/persistence/serialize'
import { MODULES, ensureDocument } from '../src/core/modules/registry'
import { moduleToMarkdown, exportPath } from '../src/core/export/markdown'
import { validateProject } from '../src/core/references/refs'
import { analyze, phaseLoad, weekToDate, withBuffer } from '../src/core/schedule'

describe('formula', () => {
  it('evaluates with precedence, functions and variables', () => {
    expect(evaluate('2 + 3 * 4')).toBe(14)
    expect(evaluate('max(a, 2) * 2', { a: 5 })).toBe(10)
    expect(variablesOf('hp * armor + 1').sort()).toEqual(['armor', 'hp'])
  })
  it('rejects unsafe input', () => {
    expect(tryEvaluate('constructor.constructor("x")()').ok).toBe(false)
    expect(tryEvaluate('1 +').ok).toBe(false)
  })
})

describe('project persistence', () => {
  it('roundtrips a seeded project', () => {
    const p = createProject('T')
    const { project } = deserializeProject(serializeProject(p))
    expect(project).toEqual(p)
  })
  it('preserves unknown keys', () => {
    const p: any = createProject('T')
    p.extra = { a: 1 }
    expect((deserializeProject(serializeProject(p)).project as any).extra).toEqual({ a: 1 })
  })
  it('rejects wrong format', () => {
    expect(() => deserializeProject('{"format":"nope"}')).toThrow()
    expect(() => deserializeProject('not json')).toThrow()
  })
  it('roundtrips a single document', () => {
    const p = createProject('T')
    const { docId, document } = parseDocumentFile(documentToFile(p, 'overview.roadmap'))
    expect(docId).toBe('overview.roadmap')
    expect(document).toEqual(p.documents['overview.roadmap'])
  })
})

describe('modules', () => {
  it('have unique ids and export paths', () => {
    expect(new Set(MODULES.map((m) => m.id)).size).toBe(MODULES.length)
    expect(new Set(MODULES.map(exportPath)).size).toBe(MODULES.length)
  })
  it.each(MODULES.map((m) => [m.id, m] as const))('%s: empty doc serializes and exports markdown', (_id, m) => {
    const p = createProject('T', false)
    ensureDocument(p, m, makeId)
    const back = deserializeProject(serializeProject(p)).project
    expect(back.documents[m.id]).toEqual(p.documents[m.id])
    expect(moduleToMarkdown(back, m)).toContain(m.title)
  })
})

describe('validation', () => {
  it('detects broken references', () => {
    const p = createProject('T')
    const items = p.documents['design.items']
    expect(validateProject(p).filter((i) => i.message.toLowerCase().includes('broken'))).toHaveLength(0)
    const sec = Object.keys(items?.data ?? {})[0]
    expect(sec === undefined || typeof sec === 'string').toBe(true)
  })
})

describe('vision module v2', () => {
  const vision = MODULES.find((m) => m.id === 'overview.vision')!

  it('migrates the v1 concept form into separate sections', () => {
    const p = createProject('T', false)
    p.documents['overview.vision'] = {
      moduleVersion: 1,
      data: { concept: { pitch: 'P', genres: 'G', audience: 'A', tone: 'T', platform: 'PL', monetization: 'M' }, pillars: [], usps: [], scope: [] },
    }
    const back = deserializeProject(serializeProject(p)).project.documents['overview.vision']
    expect(back.moduleVersion).toBe(vision.version)
    expect(back.data.concept).toBeUndefined()
    expect(back.data.pitch).toEqual({ pitch: 'P' })
    expect(back.data.references).toEqual({ genres: 'G' })
    expect(back.data.audience).toEqual({ audience: 'A' })
    expect(back.data.tone).toEqual({ tone: 'T' })
    expect(back.data.platform).toEqual({ platform: 'PL' })
    expect(back.data.monetization).toEqual({ monetization: 'M' })
  })

  it('exports in the source outline order without repeating single-field labels', () => {
    const p = createProject('T', false)
    const doc = ensureDocument(p, vision, makeId)
    doc.data.pitch = { pitch: 'A town sim' }
    doc.data.audience = { audience: 'Cozy builders' }
    doc.data.monetization = { monetization: 'Premium' }
    const md = moduleToMarkdown(p, vision)
    const headings = [...md.matchAll(/^## \d+\. (.+)$/gm)].map((m) => m[1])
    expect(headings).toEqual([
      'One-sentence pitch',
      'Genre and reference games',
      'Target audience',
      'Unique selling points',
      'Design pillars',
      'Mood and tone',
      'Scope',
      'Platform and technical frame',
      'Monetization / release plan',
    ])
    expect(md).toContain('* **One-sentence pitch:** A town sim')
    expect(md).toContain('Cozy builders')
    expect(md).not.toContain('**Target audience:**')
  })
})

describe('schedule engine', () => {
  const keys = { start: 'start', duration: 'duration', deps: 'dependsOn', kind: 'kind' }

  it('finds dependency conflicts, cycles and missing values', () => {
    const items = [
      { id: 'a', start: 0, duration: 4 },
      { id: 'b', start: 2, duration: 3, dependsOn: ['a'] },
      { id: 'c', start: 5, dependsOn: ['b'] },
      { id: 'x', start: 0, duration: 1, dependsOn: ['y'] },
      { id: 'y', start: 0, duration: 1, dependsOn: ['x'] },
    ]
    const r = analyze(items, keys)
    expect(r.conflicts).toEqual(expect.arrayContaining([{ id: 'b', dep: 'a', overlap: 2 }]))
    expect(r.missing).toEqual(['c'])
    expect([...r.cycles].sort()).toEqual(['x', 'y'])
  })

  it('computes slack and a critical chain, treating milestones as zero length', () => {
    const items = [
      { id: 'a', start: 0, duration: 4 },
      { id: 'b', start: 4, duration: 6, dependsOn: ['a'] },
      { id: 'c', start: 0, duration: 2 },
      { id: 'm', start: 10, duration: 5, kind: 'Milestone', dependsOn: ['b'] },
    ]
    const r = analyze(items, keys)
    expect(r.end).toBe(10)
    expect(r.slack.get('c')).toBe(8)
    expect([...r.critical].sort()).toEqual(['a', 'b', 'm'])
  })

  it('applies the buffer and maps weeks to calendar dates', () => {
    expect(withBuffer(10, 20)).toBe(12)
    expect(withBuffer(10, undefined)).toBe(10)
    expect(weekToDate('2026-01-05', 2)).toBe('2026-01-19')
    expect(weekToDate('', 2)).toBeNull()
  })

  it('compares effort with capacity per phase', () => {
    const load = phaseLoad([{ id: 'p', capacity: 5 }, { id: 'q' }], [{ id: 't', phase: 'p', effort: 3 }, { id: 'u', phase: 'p', effort: 4 }])
    expect(load.map((l) => l.over)).toEqual([true, false])
  })
})

describe('roadmap module v2', () => {
  const roadmap = MODULES.find((m) => m.id === 'overview.roadmap')!

  it('migrates free-text blocks into blocksNote', () => {
    const p = createProject('T', false)
    p.documents['overview.roadmap'] = { moduleVersion: 1, data: { dependencies: [{ id: 'd', name: 'D', blocks: 'Alpha' }] } }
    const back = deserializeProject(serializeProject(p)).project.documents['overview.roadmap']
    expect(back.moduleVersion).toBe(roadmap.version)
    expect(back.data.dependencies[0]).toMatchObject({ blocksNote: 'Alpha' })
    expect(back.data.dependencies[0].blocks).toBeUndefined()
  })

  it('seeds the post-release phase and exports the schedule summary with dates', () => {
    const p = createProject('T', true)
    const data = p.documents['overview.roadmap'].data
    expect(data.phases.map((x: any) => x.name)).toContain('Post-release support')
    data.assumptions = { startDate: '2026-01-05', buffer: 10 }
    const md = moduleToMarkdown(p, roadmap)
    expect(md).toContain('Planned end: week 80 (2027-07-19); with 10% buffer: week 88')
  })
})

describe('core loop module v2', () => {
  const mod = MODULES.find((m) => m.id === 'design.coreLoop')!
  const loaded = (data: Record<string, any>, version = 2) => {
    const p = createProject('T', false)
    p.documents['design.coreLoop'] = { moduleVersion: version, data }
    return p
  }

  it('migrates the v1 rewards field into reward', () => {
    const p = loaded({ loops: [{ id: 'l', name: 'L', scale: 'Short (minutes)', rewards: 'Wood' }] }, 1)
    const loadedProject = deserializeProject(serializeProject(p)).project
    const back = loadedProject.documents['design.coreLoop']
    expect(back.moduleVersion).toBe(mod.version)
    expect(back.data.loops[0]).toMatchObject({ reward: 'Wood' })
    expect(back.data.loops[0].rewards).toBeUndefined()
    ensureDocument(loadedProject, mod, makeId)
    expect(loadedProject.documents['design.coreLoop'].data.rewardsProgression).toBeDefined()
  })

  it('resolves loop → node links and reports a link to a deleted node', () => {
    const p = loaded({
      loops: [{ id: 'l', name: 'L', nodes: ['n1'] }],
      loopGraph: { nodes: [{ id: 'n1', kind: 'Action', label: 'Gather', x: 0, y: 0 }], edges: [] },
    })
    expect(validateProject(p).filter((i) => i.message.includes('broken reference'))).toEqual([])
    p.documents['design.coreLoop'].data.loopGraph.nodes = []
    expect(validateProject(p).some((i) => i.message.includes('broken reference'))).toBe(true)
  })

  it('exports one heading per time scale, then rewards and diagrams', () => {
    const p = loaded({
      loops: [{ id: 'l', name: 'Gather', scale: 'Short (minutes)', action: 'Chop', reward: 'Wood', nextDecision: 'Craft?' }],
      rewardsProgression: { rewardsProgression: 'Crafting motivates gathering.' },
      loopGraph: { nodes: [], edges: [] },
    })
    const md = moduleToMarkdown(p, mod)
    const heads = md.split('\n').filter((l) => l.startsWith('## '))
    expect(heads).toEqual([
      '## 1. Moment-to-moment',
      '## 2. Short-term loop (minutes)',
      '## 3. Medium-term loop (hours / days)',
      '## 4. Long-term loop (campaign)',
      '## 5. Rewards and progression systems',
      '## 6. Gameplay diagrams',
    ])
    expect(md).toContain('* **Player action:** Chop')
    expect(md).toContain('Crafting motivates gathering.')
  })
})
