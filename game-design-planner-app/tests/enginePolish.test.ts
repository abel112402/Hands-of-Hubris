import { describe, expect, it } from 'vitest'
import { deserializeProject } from '../src/core/persistence/serialize'
import { buildIR } from '../src/core/engine/ir'
import { budgetProbe, budgetsOver } from '../src/core/engine/irPolish'
import { unity } from '../src/core/engine/adapters/unity'
import { engineRules } from '../src/core/hints/rules/engine'

/** Plan § 7, fourth round: I10 performance budgets, I12 audio events, I18 architecture guard (I15 is in the bridge). */
const fs: { readFileSync: (p: string, e: string) => string } = await import('node:fs' as string)
const cinderholm = () => deserializeProject(fs.readFileSync('examples/cinderholm.hohplan.json', 'utf8')).project
const { ir } = buildIR(cinderholm())
const files = new Map(unity.emit(ir).map((f) => [f.path, f.content]))

describe('performance budgets (I10)', () => {
  it('knows which budgets the engine can measure by itself', () => {
    expect(budgetProbe('ms per frame', 'ms', 'Frame time')).toBe('frameTime')
    expect(budgetProbe('RAM', 'GB', 'Memory')).toBe('memory')
    expect(budgetProbe('draw calls', '', 'Draw calls')).toBe('drawCalls')
    expect(budgetProbe('ms per tick', 'ms', 'Simulation tick')).toBe('custom')
    expect(ir.budgets.map((b) => [b.key, b.probe])).toEqual([
      ['perf.frame_time', 'frameTime'],
      ['perf.frame_time_deck', 'frameTime'],
      ['perf.simulation_tick', 'custom'],
      ['perf.memory', 'memory'],
    ])
  })

  it('writes a sampler that records the measurable budgets and takes the others from the game', () => {
    const code = files.get('Scripts/Generated/Perf/PlannerBudgets.cs')!
    expect(code).toContain('public sealed class PlannerBudgets : MonoBehaviour')
    expect(code).toContain('recorders[0] = ProfilerRecorder.StartNew(ProfilerCategory.Memory, "Total Used Memory");')
    expect(code).toContain('Record("perf.memory", recorders[0].LastValue * (1.0 / (1024.0 * 1024.0 * 1024.0)));')
    expect(code).toContain('public const string SimulationTick = "perf.simulation_tick";')
    expect(code).not.toContain('Record("perf.simulation_tick"')
  })

  it('warns in the planner when the engine measured a budget over its target', () => {
    const p = cinderholm()
    expect(budgetsOver(p, [{ key: 'perf.frame_time', value: 21.4, max: 40 }, { key: 'perf.memory', value: 4.1 }]).map((r) => [r.key, r.measured, r.target])).toEqual([['perf.frame_time', 21.4, 16.6]])
    p.meta.engine = { report: { engine: 'unity', engineVersion: '6000.0.40f1', generatedAt: '2026-11-21T10:00:00Z', importedAt: '2026-11-21T10:01:00Z', records: {}, classes: {}, metrics: [{ key: 'perf.frame_time', value: 21.4, samples: 900 }] } }
    const rule = engineRules.find((r) => r.id === 'engine.budgetOver')!
    const ctx = { project: p, docId: 'technical.performance' } as Parameters<typeof rule.evaluate>[0]
    expect(rule.appliesTo!(ctx)).toBe(true)
    const hints = rule.evaluate(ctx)
    expect(hints).toHaveLength(1)
    expect(hints[0].params).toMatchObject({ count: 1, names: 'Frame time (21.4 / 16.6 ms)' })
  })
})

describe('audio events (I12)', () => {
  it('takes music and sound effects with their planned settings', () => {
    const axe = ir.audio.events.find((e) => e.name === 'Axe chop')!
    expect(axe).toMatchObject({ kind: 'sfx', volume: 0.7, pitch: 0.05, loop: false, spatial: false })
    expect(ir.audio.events.find((e) => e.name === 'Steam vent')!.loop).toBe(true)
    expect(ir.audio.events.find((e) => e.name === 'Aether hum')!.spatial).toBe(true)
    expect(ir.audio.events.find((e) => e.name === 'Greenhollow morning')).toMatchObject({ kind: 'music', loop: true, when: ['dawn', 'Greenhollow'] })
  })

  it('writes the audio event type and the planned events the bridge turns into assets', () => {
    expect(files.get('Scripts/Generated/Audio/PlannerAudioEvent.cs')).toContain('public static void PlannerCreateOrUpdate(string root)')
    expect(files.get('Scripts/Generated/Audio/PlannerAudioEvents.cs')).toContain('new Entry("yP0nAsVA", "AxeChop", "Axe chop", PlannerAudioKind.Sfx, 0.7f, 0.05f, false, false, "Three variations, pitch random ±5 %."),')
  })
})

describe('architecture guard (I18)', () => {
  it('writes a test with each module’s allowed assemblies', () => {
    const code = files.get('Tests/Editor/PlannerArchitecture.cs')!
    expect(code).toContain('["Cinder.Core.Events"] = new string[] {  },')
    expect(code).toContain('["Cinder.Simulation.Npc"] = new string[] { "Cinder.Core.Data", "Cinder.Core.Events", "Cinder.Simulation.Town" },')
    expect(code).toContain('public void AssembliesReferenceOnlyThePlannedModules()')
    expect(files.has('Tests/Editor/CinderholmExample.PlannerTests.asmdef')).toBe(true)
  })

  it('still writes the test assembly when only the architecture test is there', () => {
    const p = cinderholm()
    p.documents['qa.balance'].data.checks = []
    const only = new Map(unity.emit(buildIR(p).ir).map((f) => [f.path, f.content]))
    expect(only.has('Tests/Editor/PlannerDataChecks.cs')).toBe(false)
    expect(only.has('Tests/Editor/PlannerArchitecture.cs')).toBe(true)
    expect(only.has('Tests/Editor/CinderholmExample.PlannerTests.asmdef')).toBe(true)
  })
})
