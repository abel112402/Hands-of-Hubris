import { describe, expect, it } from 'vitest'
import { deserializeProject, serializeProject } from '../src/core/persistence/serialize'
import { buildIR } from '../src/core/engine/ir'
import { applyReport, classProblems, currentIrHash, engineStatusOf, MAX_REPORT_BYTES, parseReport, reportBySchema, reportProblems, reportStale, reportSummary, storedReport } from '../src/core/engine/report'
import { collectHints, makeContext } from '../src/core/hints/engine'
import { ARCH_DOC } from '../src/core/architecture'
import { DATA_DOC } from '../src/core/dataDriven'
import type { Project } from '../src/core/model/types'

const fs: { readFileSync: (path: string, enc: string) => string } = await import('node:fs' as string)
const cinderholm = () => deserializeProject(fs.readFileSync('examples/cinderholm.hohplan.json', 'utf8')).project

/** A report as the Unity bridge writes it: every record, every third one incomplete; classes half written. */
function report(p: Project, extra: Record<string, unknown> = {}) {
  const { ir } = buildIR(p)
  return {
    format: 'hoh-engine-report',
    v: 1,
    engine: 'unity',
    engineVersion: '6000.0.40f1',
    generatedAt: '2026-11-20T17:00:00.000Z',
    project: { name: p.meta.name },
    irHash: currentIrHash(p),
    records: ir.records.map((r, i) => ({ plannerId: r.plannerId, schema: r.schema, key: r.key, status: i % 3 === 0 ? 'incomplete' : 'implemented', issues: i % 3 === 0 ? ['icon: required, but empty.'] : [] })),
    classes: ir.classes.map((c, i) => ({ plannerId: c.id, name: c.name, status: i % 2 ? 'stub' : 'implemented', todo: i % 2, methods: c.methods.length })),
    metrics: [],
    ...extra,
  }
}

describe('engine report', () => {
  it('reads a report and keeps only what the plan knows', () => {
    const p = cinderholm()
    const r = report(p)
    r.records.push({ plannerId: 'nope', schema: 'x', key: 'x.y', status: 'implemented', issues: [] })
    const { report: parsed, warnings } = parseReport(JSON.stringify(r), p)
    expect(warnings).toEqual(['1 record in the report is not in this plan and left out.'])
    const stored = applyReport(p, parsed, 'NOW')
    expect(stored.importedAt).toBe('NOW')
    expect(Object.keys(stored.records)).toHaveLength(r.records.length - 1)
    expect(storedReport(p)).toEqual(stored)
    const plank = p.documents['design.items'].data.items[0]
    expect(engineStatusOf(p, plank.id)).toEqual({ kind: 'record', status: 'incomplete', key: 'item.plank', issues: ['icon: required, but empty.'], engine: 'unity' })
    expect(reportSummary(stored)).toMatch(/^Unity 6000\.0\.40f1: 75 records: 50 done, 25 incomplete, 0 missing, 0 removed from the plan; 10 classes: 5 written, 5 with TODOs, 0 missing\.$/)
  })

  it('refuses what is not a usable report, with a readable reason', () => {
    const p = cinderholm()
    expect(() => parseReport('{', p)).toThrow('not valid JSON')
    expect(() => parseReport('{"format":"other"}', p)).toThrow('not an engine report')
    expect(() => parseReport(JSON.stringify(report(p, { v: 2 })), p)).toThrow('version 2')
    expect(() => parseReport(JSON.stringify(report(p, { records: [{ plannerId: 'a', schema: 'b', key: 'c', status: 'great' }] })), p)).toThrow(/Invalid report: records\.0\.status/)
    expect(() => parseReport(' '.repeat(MAX_REPORT_BYTES + 1), p)).toThrow('larger than 20 MB')
  })

  it('warns about another project and an older export, and knows when the plan moved on', () => {
    const p = cinderholm()
    const { warnings } = parseReport(JSON.stringify(report(p, { project: { name: 'Other' }, irHash: '00000000' })), p)
    expect(warnings).toEqual(['The report is for “Other”, this project is “Cinderholm (example)”.', expect.stringContaining('older export')])
    applyReport(p, parseReport(JSON.stringify(report(p)), p).report)
    expect(reportStale(p)).toBe(false)
    const changed = structuredClone(p)
    changed.documents['design.items'].data.items[0].value = 999
    expect(reportStale(changed)).toBe(true)
  })

  it('counts per schema, lists what to finish and survives saving; a damaged stored report is ignored', () => {
    const p = cinderholm()
    applyReport(p, parseReport(JSON.stringify(report(p)), p).report)
    const item = reportBySchema(p).find((r) => r.schema.name === 'Item')!
    expect(item.total).toBe(16)
    expect(item.counts.implemented + item.counts.incomplete).toBe(16)
    expect(reportBySchema(p).find((r) => r.schema.name === 'NPC need')!.total).toBe(0)
    expect(reportProblems(p).length).toBe(25)
    expect(classProblems(p).map((c) => c.status)).toEqual(Array(5).fill('stub'))
    const back = deserializeProject(serializeProject(p)).project
    expect(storedReport(back)).toEqual(storedReport(p))
    ;(back.meta.engine as { report: unknown }).report = { engine: 'unity', records: 'broken' }
    expect(storedReport(back)).toBeUndefined()
    expect(engineStatusOf(back, 'anything')).toBeUndefined()
  })

  it('gives hints on the Data-driven and Architecture pages', () => {
    const p = cinderholm()
    expect(collectHints(makeContext(p, { docId: DATA_DOC })).some((h) => h.ruleId.startsWith('engine.'))).toBe(false)
    applyReport(p, parseReport(JSON.stringify(report(p)), p).report)
    // engine.suggestions is covered in engineSuggestions.test.ts
    const data = collectHints(makeContext(p, { docId: DATA_DOC })).filter((h) => h.ruleId.startsWith('engine.') && h.ruleId !== 'engine.suggestions')
    expect(data.map((h) => [h.ruleId, h.params?.count])).toEqual([['engine.incomplete', 25]])
    const arch = collectHints(makeContext(p, { docId: ARCH_DOC })).filter((h) => h.ruleId.startsWith('engine.') && h.ruleId !== 'engine.suggestions')
    expect(arch.map((h) => [h.ruleId, h.params?.count])).toEqual([['engine.classes', 5]])
    const changed = structuredClone(p) // the store gives every edit a new project object
    changed.documents['design.items'].data.items[0].value = 999
    expect(collectHints(makeContext(changed, { docId: DATA_DOC })).map((h) => h.ruleId)).toContain('engine.stale')
  })
})
