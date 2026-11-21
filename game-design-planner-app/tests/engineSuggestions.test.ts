import { describe, expect, it } from 'vitest'
import { produce } from 'immer'
import { deserializeProject } from '../src/core/persistence/serialize'
import { buildIR } from '../src/core/engine/ir'
import { applyReport, currentIrHash, parseReport } from '../src/core/engine/report'
import { applySuggestions, dismissSuggestions, statusSuggestions } from '../src/core/engine/suggestions'
import { collectHints, makeContext } from '../src/core/hints/engine'
import { ARCH_DOC } from '../src/core/architecture'
import { DATA_DOC } from '../src/core/dataDriven'
import type { Project } from '../src/core/model/types'

const fs: { readFileSync: (path: string, enc: string) => string } = await import('node:fs' as string)

type Cls = { status: 'implemented' | 'stub' | 'missing'; todo: number }
/** Cinderholm with a report: every record done except the given ones; classes as given (others implemented). */
function setup(recordStatus: Record<string, string> = {}, classes: Record<string, Cls> = {}, edit?: (p: Project) => void) {
  const p = deserializeProject(fs.readFileSync('examples/cinderholm.hohplan.json', 'utf8')).project
  edit?.(p)
  const { ir } = buildIR(p)
  const report = {
    format: 'hoh-engine-report',
    v: 1,
    engine: 'unity',
    engineVersion: '6000.0.40f1',
    generatedAt: '2026-11-21T10:00:00Z',
    project: { name: p.meta.name },
    irHash: currentIrHash(p),
    records: ir.records.map((r) => ({ plannerId: r.plannerId, schema: r.schema, key: r.key, status: recordStatus[r.key] ?? 'implemented', issues: recordStatus[r.key] === 'incomplete' ? ['prefab: required, but empty.', 'no period here'] : [] })),
    classes: ir.classes.map((c) => ({ plannerId: c.id, name: c.name, methods: c.methods.length, ...(classes[c.name] ?? { status: 'implemented', todo: 0 }) })),
  }
  applyReport(p, parseReport(JSON.stringify(report), p).report)
  return p
}
const rows = (p: Project) => statusSuggestions(p).suggestions.map((s) => `${s.name}: ${s.from || '—'} → ${s.to}`)

describe('status suggestions from the engine report', () => {
  it('moves classes and their modules forward, never backward, and leaves written ones alone', () => {
    const p = setup({}, { Health: { status: 'stub', todo: 1 }, CinderPlayerController: { status: 'stub', todo: 2 }, NpcBrain: { status: 'stub', todo: 1 }, SaveService: { status: 'stub', todo: 2 }, IDamageable: { status: 'missing', todo: 0 } })
    expect(rows(p)).toEqual(
      expect.arrayContaining([
        'NpcBrain: Planned → In progress', // 1 of 2 bodies written
        'NeedState: Planned → Done',
        'TownLedger: Planned → Done',
        'HealthBar: Planned → Done',
        'Core.Events: — → Done',
        'Gameplay.Player: — → In progress',
        'Simulation.Npc: — → In progress', // 2 of 3 classes written
        'UI.Hud: — → Done',
      ]),
    )
    const all = rows(p).join('\n')
    expect(all).not.toMatch(/^Persistence\.Save:/m) // SaveService has no body written yet
    expect(all).not.toMatch(/^Health:/m) // already In progress
    expect(all).not.toMatch(/^CinderPlayerController:/m) // in progress, nothing written yet
    expect(all).not.toMatch(/^SaveService:/m) // nothing written: no suggestion
    expect(all).not.toMatch(/^IDamageable:/m)
    expect(statusSuggestions(p).warnings).toEqual([expect.objectContaining({ name: 'IDamageable', current: 'Done', reason: 'the engine has no file for it' })])
  })

  it('suggests “Ready for testing” for finished records, never “Final”, and warns where the plan is ahead', () => {
    const p = setup({ 'bld.house': 'incomplete', 'bld.miner': 'missing' }, {}, (d) => {
      const b = d.documents['design.town'].data.buildings
      b[0].status = 'Final' // house: Final in the plan, incomplete in the engine
      b[2].status = 'Draft' // lumberjack: done in the engine
      b[3].status = 'Blocked' as never // farmer: blocked items are never moved
    })
    expect(rows(p).filter((r) => /^(House|Miner|Lumberjack|Farmer):/.test(r))).toEqual(['Lumberjack: Draft → Ready for testing'])
    const w = statusSuggestions(p).warnings.filter((x) => x.sectionId === 'buildings').map((x) => `${x.name} (${x.current}): ${x.reason}`)
    expect(w).toEqual(['House (Final): bld.house is incomplete in the engine: prefab: required, but empty; no period here', 'Miner (Ready for testing): bld.miner has no asset in the engine'])
  })

  it('applies only what still matches, and dismissed ones stay hidden until the next report', () => {
    const p = setup()
    const { suggestions } = statusSuggestions(p)
    const done = suggestions.find((s) => s.name === 'NeedState')!
    const changed = produce(p, (d) => {
      d.documents[ARCH_DOC].data.classes.find((c: { name: string }) => c.name === 'TownLedger').status = 'Blocked'
    })
    const ledger = suggestions.find((s) => s.name === 'TownLedger')!
    let n = 0
    const after = produce(changed, (d) => void (n = applySuggestions(d, [done, ledger])))
    expect(n).toBe(1)
    expect(after.documents[ARCH_DOC].data.classes.find((c: { name: string }) => c.name === 'NeedState').status).toBe('Done')
    expect(after.documents[ARCH_DOC].data.classes.find((c: { name: string }) => c.name === 'TownLedger').status).toBe('Blocked')

    const hidden = produce(p, (d) => dismissSuggestions(d, [done]))
    expect(statusSuggestions(hidden).suggestions.map((s) => s.name)).not.toContain('NeedState')
    const again = produce(hidden, (d) => {
      const raw = JSON.parse(JSON.stringify({ format: 'hoh-engine-report', v: 1, engine: 'unity', generatedAt: '2026-11-22T10:00:00Z', records: [], classes: [{ plannerId: done.entityId, name: 'NeedState', status: 'implemented', methods: 0 }] }))
      applyReport(d, parseReport(JSON.stringify(raw), d).report)
    })
    expect(statusSuggestions(again).suggestions.map((s) => s.name)).toContain('NeedState')
  })

  it('points to the suggestions from the Data-driven and Architecture pages', () => {
    const p = setup()
    const count = statusSuggestions(p).suggestions.length
    for (const docId of [DATA_DOC, ARCH_DOC]) {
      const h = collectHints(makeContext(p, { docId })).find((x) => x.ruleId === 'engine.suggestions')
      expect(h).toMatchObject({ params: { count }, target: { docId: DATA_DOC, sectionId: 'schemas' } })
    }
  })
})
