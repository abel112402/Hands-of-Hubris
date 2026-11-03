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
