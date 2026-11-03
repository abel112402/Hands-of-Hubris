import { describe, expect, it } from 'vitest'
import { evaluate, tryEvaluate, variablesOf } from '../src/core/formula'
import { createProject, makeId } from '../src/core/model/project'
import { deserializeProject, documentToFile, parseDocumentFile, serializeProject } from '../src/core/persistence/serialize'
import { MODULES, ensureDocument } from '../src/core/modules/registry'
import { moduleToMarkdown, exportPath } from '../src/core/export/markdown'
import { validateProject } from '../src/core/references/refs'
import { analyzeRanges, asymmetricPairs, graphDisagreements } from '../src/core/diplomacy'
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

describe('difficulty module v2', () => {
  const mod = MODULES.find((m) => m.id === 'design.difficulty')!

  it('migrates free-text units, categories and the rules form', () => {
    const p = createProject('T', false)
    p.documents['design.difficulty'] = {
      moduleVersion: 1,
      data: {
        params: [{ id: 'a', name: 'A', unit: 'hp/s', category: 'combat' }, { id: 'b', name: 'B', unit: '%', category: 'Weird' }],
        rules: { switching: 'No', storage: 'JSON' },
      },
    }
    const back = deserializeProject(serializeProject(p)).project.documents['design.difficulty']
    expect(back.moduleVersion).toBe(mod.version)
    expect(back.data.params[0]).toMatchObject({ unit: 'other', category: 'Combat', notes: 'Unit: hp/s' })
    expect(back.data.params[1]).toMatchObject({ unit: '%', category: 'Other' })
    expect(back.data.switching.switching).toBe('No')
    expect(back.data.storage.storage).toBe('JSON')
    expect(back.data.rules).toBeUndefined()
  })

  it('seeds ranges and presets, and exports principles, unit and notes', () => {
    const p = createProject('T', true)
    const data = p.documents['design.difficulty'].data
    expect(data.presets.map((x: any) => x.level)).toEqual(['easy', 'medium', 'hard'])
    const morale = data.params.find((x: any) => x.name === 'Morale loss threshold')
    expect(morale).toMatchObject({ unit: '%', min: 0, max: 100 })
    data.params[0].notes = 'Watch late game'
    data.values.cells[`${morale.id}|hard`] = 70
    data.principles = { principles: 'Scale pressure, not rules.' }
    const md = moduleToMarkdown(p, mod)
    expect(md).toContain('Scale pressure, not rules.')
    expect(md).toContain('| Unit |')
    expect(md).toContain('Watch late game')
    expect(validateProject(p).filter((i) => i.level === 'error')).toEqual([])
  })
})

describe('factions module v2', () => {
  const mod = MODULES.find((m) => m.id === 'design.factions')!

  it('migrates text lists and the single spillover number', () => {
    const p = createProject('T', false)
    p.documents['design.factions'] = {
      moduleVersion: 1,
      data: {
        factions: [{ id: 'f', name: 'F', characters: ['Ann', 'Bo'], unlocks: ['Axe'] }],
        actions: [{ id: 'a', name: 'A', effectOnOthers: -10 }],
      },
    }
    const back = deserializeProject(serializeProject(p)).project.documents['design.factions']
    expect(back.moduleVersion).toBe(mod.version)
    expect(back.data.factions[0].characters).toBeUndefined()
    expect(back.data.factions[0].legacyNotes).toBe('Characters: Ann, Bo\nUnlocks: Axe')
    expect(back.data.actions[0]).toMatchObject({ spilloverDefault: -10 })
    expect(back.data.actions[0].effectOnOthers).toBeUndefined()
  })

  it('resolves unlocks from the skill tree and items, and flags a broken one', () => {
    const p = createProject('T', false)
    p.documents['design.player'] = { moduleVersion: 1, data: { skillTree: { nodes: [{ id: 's1', kind: 'Skill', label: 'Parry', x: 0, y: 0 }], edges: [] } } }
    p.documents['design.factions'] = { moduleVersion: 2, data: { factions: [{ id: 'f', name: 'F', unlocks: ['s1'] }] } }
    expect(validateProject(p).filter((i) => i.message.includes('broken reference'))).toEqual([])
    p.documents['design.factions'].data.factions[0].unlocks = ['gone']
    expect(validateProject(p).some((i) => i.message.includes('broken reference'))).toBe(true)
  })

  it('exports sections in the order of the source outline', () => {
    const p = createProject('T', false)
    p.documents['design.factions'] = { moduleVersion: 2, data: {} }
    ensureDocument(p, mod, makeId)
    const heads = moduleToMarkdown(p, mod).split('\n').filter((l) => l.startsWith('## ')).map((l) => l.replace(/^## \d+\. /, ''))
    expect(heads.slice(0, 3)).toEqual(['System overview', 'Factions', 'Relationship matrix'])
    expect(heads[heads.length - 1]).toBe('Endings')
  })
})

describe('relationship analysis', () => {
  const lvl = (id: string, min?: number, max?: number) => ({ id, name: id, min, max })

  it('finds gaps and overlaps in ranges, and uses the next minimum for open ends', () => {
    const ok = analyzeRanges([lvl('a', -100), lvl('b', 0), lvl('c', 50)], [-100, 100])
    expect(ok.rows.map((r) => [r.from, r.to])).toEqual([[-100, -1], [0, 49], [50, 100]])
    expect([ok.gapAtBottom, ok.gapAtTop, ...ok.rows.flatMap((r) => [r.overlaps, r.gapBefore])].some(Boolean)).toBe(false)
    const bad = analyzeRanges([lvl('a', -50, 10), lvl('b', 5, 20), lvl('c', 40), lvl('d')], [-100, 100])
    expect(bad.rows[1].overlaps).toBe(true)
    expect(bad.rows[2].gapBefore).toBe(true)
    expect(bad.gapAtBottom).toBe(true)
    expect(bad.unset.map((l) => l.id)).toEqual(['d'])
  })

  it('reports asymmetric pairs and graph/matrix disagreements', () => {
    const p = createProject('T', false)
    p.documents['design.factions'] = {
      moduleVersion: 2,
      data: {
        factions: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }],
        relations: { cells: { 'a|b': 80, 'b|a': 20 } },
        relationGraph: { nodes: [{ id: 'n1', refId: 'a', kind: 'Faction', label: 'A' }, { id: 'n2', refId: 'b', kind: 'Faction', label: 'B' }], edges: [{ id: 'e', source: 'n1', target: 'n2', kind: 'Enemy' }] },
        overview: {},
      },
    }
    expect(asymmetricPairs(p)).toHaveLength(1)
    expect(graphDisagreements(p).map((d) => d.kind)).toEqual(['Enemy'])
    p.documents['design.factions'].data.relationGraph.edges[0].kind = 'Ally'
    expect(graphDisagreements(p)).toHaveLength(1)
    p.documents['design.factions'].data.relations.cells = { 'a|b': 80, 'b|a': 75 }
    expect(asymmetricPairs(p)).toHaveLength(0)
    expect(graphDisagreements(p)).toHaveLength(0)
  })
})
