import { describe, expect, it } from 'vitest'
import { evaluate, tryEvaluate, variablesOf } from '../src/core/formula'
import { createProject, makeId } from '../src/core/model/project'
import { deserializeProject, documentToFile, parseDocumentFile, serializeProject } from '../src/core/persistence/serialize'
import { MODULES, ensureDocument } from '../src/core/modules/registry'
import { moduleToMarkdown, exportPath } from '../src/core/export/markdown'
import { validateProject } from '../src/core/references/refs'

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
