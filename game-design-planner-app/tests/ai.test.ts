import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { checkBudget, readLedger, recordUsage, resetLedger } from '../src/core/ai/budget'
import { buildContext } from '../src/core/ai/context'
import { buildIndex, searchIndex } from '../src/core/ai/docsIndex'
import { applyDiff, buildDiff, parseProposal } from '../src/core/ai/proposals'
import { assertAllowedUrl, isValidModelId, redact } from '../src/core/ai/security'
import { useAiSession, useAiSettings } from '../src/core/ai/session'
import { createProject } from '../src/core/model/project'
import { serializeProject } from '../src/core/persistence/serialize'
import { useStore } from '../src/core/store/store'

const KEY = 'sk-test-SECRET1234567890abcdef'

describe('ai security', () => {
  it('only allows https provider hosts', () => {
    expect(() => assertAllowedUrl('https://api.openai.com/v1/models')).not.toThrow()
    for (const u of ['http://api.openai.com/x', 'https://evil.com/x', 'https://api.openai.com:8443/x', 'https://u:p@api.openai.com/x'])
      expect(() => assertAllowedUrl(u)).toThrow()
  })
  it('validates model ids', () => {
    expect(isValidModelId('gpt-4o-mini')).toBe(true)
    for (const m of ['', '../x', 'a b', 'a?b=1', 'a/../b']) expect(isValidModelId(m)).toBe(false)
  })
  it('redacts keys from text', () => {
    expect(redact(`bad key ${KEY}`, KEY)).not.toContain(KEY)
  })
  it('never leaks the key into the project, exports or storage', () => {
    useAiSession.getState().setKey('openai', KEY)
    expect(useAiSession.getState().hasKey.openai).toBe(true)
    useAiSettings.getState().update((s) => void (s.maxOutputTokens = 1000))
    expect(serializeProject(useStore.getState().project)).not.toContain(KEY)
    expect(JSON.stringify(useAiSession.getState())).not.toContain(KEY)
    expect(JSON.stringify({ ...localStorage })).not.toContain(KEY)
    useAiSession.getState().clearAll()
    expect(useAiSession.getState().hasKey.openai).toBe(false)
  })
})

describe('proposals', () => {
  beforeEach(() => useStore.getState().loadProject(createProject('T', false)))
  const add = (fields: Record<string, unknown>) =>
    parseProposal(JSON.stringify({ summary: 's', ops: [{ op: 'addEntity', docId: 'design.items', sectionId: 'items', fields }] }))

  it('rejects delete and malformed proposals', () => {
    expect(parseProposal('{"ops":[{"op":"deleteEntity","docId":"a","sectionId":"b","entityId":"c"}]}').ok).toBe(false)
    expect(parseProposal('not json').ok).toBe(false)
  })

  it('sanitizes fields, drops unsafe keys and applies as one undoable step with AI mark', () => {
    const r = add({ name: 'Sword', __proto__: { x: 1 }, constructor: 'x', id: 'hacked', bogus: 1 })
    if (!r.ok) throw new Error(r.error)
    const project = useStore.getState().project
    const diff = buildDiff(project, r.proposal)
    expect(diff[0].error).toBeUndefined()
    expect(diff[0].clean).not.toHaveProperty('id')
    expect(diff[0].clean).not.toHaveProperty('bogus')
    expect(diff[0].warnings.length).toBeGreaterThan(0)
    const res = applyDiff(diff, new Set([0]), { provider: 'openai', model: 'm' })
    expect(res.applied).toBe(1)
    const items = useStore.getState().project.documents['design.items'].data.items as any[]
    expect(items[0].name).toBe('Sword')
    expect(items[0].id).not.toBe('hacked')
    expect(items[0]._ai.model).toBe('m')
    expect(({} as any).x).toBeUndefined()
  })

  it('skips stale updates', () => {
    const r = add({ name: 'A' })
    if (!r.ok) throw new Error()
    applyDiff(buildDiff(useStore.getState().project, r.proposal), new Set([0]), { provider: 'p', model: 'm' })
    const id = (useStore.getState().project.documents['design.items'].data.items as any[])[0].id
    const upd = parseProposal(JSON.stringify({ ops: [{ op: 'updateField', docId: 'design.items', sectionId: 'items', entityId: id, field: 'name', value: 'B' }] }))
    if (!upd.ok) throw new Error()
    const diff = buildDiff(useStore.getState().project, upd.proposal)
    useStore.getState().mutate((p) => void ((p.documents['design.items'].data.items as any[])[0].name = 'C'))
    expect(applyDiff(diff, new Set([0]), { provider: 'p', model: 'm' }).applied).toBe(0)
  })
})

describe('budget and context', () => {
  afterEach(() => resetLedger())
  it('tracks usage and enforces limits', () => {
    recordUsage(1000, 0.5)
    expect(readLedger().dayTokens).toBe(1000)
    const s = { ...useAiSettings.getState().settings, limits: { dayTokens: 1500, monthTokens: 0, dayCost: 0, monthCost: 0 } }
    expect(checkBudget(s, 400, null).ok).toBe(true)
    expect(checkBudget(s, 600, null).ok).toBe(false)
  })
  it('errors instead of silently truncating context', () => {
    const p = createProject('T', false)
    p.documents['design.items'] = { moduleVersion: 1, data: { items: [{ id: 'a', name: 'x'.repeat(500) }] } }
    expect(() => buildContext(p, { mode: 'document', docId: 'design.items' }, 50)).toThrow()
  })
  it('finds relevant doc chunks with accent folding', () => {
    const idx = buildIndex([{ path: 'a.md', text: '# Harc\nA sebzés képlete\n# Térkép\nerdő' }])
    expect(searchIndex(idx, 'sebzes')[0].text).toContain('sebzés')
  })
})
