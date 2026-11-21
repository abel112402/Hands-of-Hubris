import { describe, expect, it } from 'vitest'
import { deserializeProject } from '../src/core/persistence/serialize'
import { buildIR } from '../src/core/engine/ir'
import { godot } from '../src/core/engine/adapters/godot'
import { unreal } from '../src/core/engine/adapters/unreal'
import type { ArchitecturePlan } from '../src/core/engine/architecture'

/** Plan § 7, fourth round on Godot and Unreal: performance budgets, audio events, pseudo-locale, architecture guard. */
const fs: { readFileSync: (p: string, e: string) => string } = await import('node:fs' as string)
const cinderholm = () => deserializeProject(fs.readFileSync('examples/cinderholm.hohplan.json', 'utf8')).project
const { ir } = buildIR(cinderholm())
const addon = (f: string) => fs.readFileSync(`engine-packages/godot/addons/hoh_planner/${f}`, 'utf8')

describe('Godot', () => {
  const files = new Map(godot.emit(ir).map((f) => [f.path, f.content]))

  it('writes a budget sampler the addon adds as an autoload, and reads what it measured into the report', () => {
    const code = files.get('Scripts/Generated/Perf/planner_budgets.gd')!
    expect(code).toContain('const SIMULATION_TICK := "perf.simulation_tick"')
    expect(code).toContain('\trecord("perf.frame_time", frame_ms)')
    expect(code).toContain('\trecord("perf.memory", Performance.get_monitor(Performance.MEMORY_STATIC) / 1073741824.0)')
    expect(code).not.toContain('record("perf.simulation_tick"')
    expect(addon('planner_extras.gd')).toContain('"PlannerBudgets": "Perf/planner_budgets.gd"')
    expect(addon('planner_report.gd')).toContain('Metrics.summaries(Extras.BUDGETS)')
  })

  it('writes the audio event resource and the planned list the addon turns into resources', () => {
    expect(files.get('Scripts/Generated/Audio/cinderholm_example_audio_event.gd')).toContain('class_name CinderholmExampleAudioEvent\nextends Resource')
    const list = files.get('Scripts/Generated/Audio/cinderholm_example_audio_events.gd')!
    expect(list).toContain('const EVENT := preload("cinderholm_example_audio_event.gd")')
    expect(list).toContain('{ "id": "yP0nAsVA", "file": "axe_chop", "name": "Axe chop", "kind": "sfx", "volume": 0.7, "pitch": 0.05, "loop": false, "spatial": false,')
    expect(addon('planner_extras.gd')).toContain('static func make_audio(at: String) -> int:')
    expect(godot.checks(ir).filter((i) => i.level !== 'info')).toEqual([])
  })

  it('sets up Godot’s pseudolocalization once, when the plan has a translation table', () => {
    const extras = addon('planner_extras.gd')
    expect(extras).toContain('ProjectSettings.set_setting(PSEUDO + "expansion_ratio", 0.3)')
    expect(extras).toContain('if Bundle.files_in(at + "/Localization", "csv").is_empty() or ProjectSettings.has_setting(PSEUDO + "expansion_ratio"):')
  })

  it('writes the architecture plan with each module’s folders and class names, which Validate checks', () => {
    const plan = JSON.parse(files.get('ProjectFiles/architecture.json')!) as ArchitecturePlan
    expect(plan.match).toBe('identifier')
    const npc = plan.modules.find((m) => m.name === 'Simulation.Npc')!
    expect(npc).toEqual({ name: 'Simulation.Npc', folders: ['Scripts/Classes/simulation_npc/', 'res://_Project/Scripts/Simulation.Npc/'], allows: ['Core.Data', 'Core.Events', 'Simulation.Town'], tokens: ['NpcBrain', 'NpcBrainBase', 'NeedState', 'NeedStateBase', 'NpcMood'] })
    expect(addon('planner_validator.gd')).toContain('issues.append_array(architecture(at))')
  })
})

describe('Unreal', () => {
  const files = new Map(unreal.emit(ir).map((f) => [f.path, f.content]))
  const gen = (name: string) => files.get(`Source/PlannerGame/Generated/${name}`)!

  it('writes a budget subsystem that samples while the game runs and saves next to the metrics', () => {
    const h = gen('PlannerBudgets.h')
    expect(h).toContain('class PLANNERGAME_API UPlannerBudgets : public UGameInstanceSubsystem, public FTickableGameObject')
    expect(h).toContain('constexpr const TCHAR* SimulationTick = TEXT("perf.simulation_tick");')
    const cpp = gen('PlannerBudgets.cpp')
    expect(cpp).toContain('\tRecord(PlannerBudgetKeys::FrameTime, FrameMs);')
    expect(cpp).toContain('\tRecord(PlannerBudgetKeys::Memory, double(FPlatformMemory::GetStats().UsedPhysical) / (1024.0 * 1024.0 * 1024.0));')
    expect(cpp).not.toContain('PlannerBudgetKeys::SimulationTick,')
    expect(cpp).toContain('TEXT("hoh-planner-budgets.json")')
    // No draw-call or triangle budget in the example, so no RHI dependency.
    expect(gen('Dependencies.txt')).not.toContain('RHI')
  })

  it('needs RHI only for draw-call and triangle budgets', () => {
    const p = cinderholm()
    const budgets = p.documents['technical.performance'].data.budgets as { name: string; metric: string }[]
    budgets.push({ ...budgets[0], name: 'Draw calls', metric: 'draw calls' } as (typeof budgets)[number])
    const out = new Map(unreal.emit(buildIR(p).ir).map((f) => [f.path, f.content]))
    expect(out.get('Source/PlannerGame/Generated/Dependencies.txt')).toContain('RHI')
    expect(out.get('Source/PlannerGame/Generated/PlannerBudgets.cpp')).toContain('Record(PlannerBudgetKeys::DrawCalls, GNumDrawCallsRHI[0]);')
  })

  it('writes the audio event data asset and lists the planned sounds for the bridge', () => {
    expect(gen('PlannerAudioEvent.h')).toContain('class PLANNERGAME_API UPlannerAudioEvent : public UPrimaryDataAsset')
    expect(gen('PlannerAudioEvent.cpp')).toContain('UGameplayStatics::SpawnSoundAtLocation(WorldContextObject, Sound, Location, FRotator::ZeroRotator, Volume, Pitch)')
    const types = JSON.parse(files.get('Meta/planner-types.json')!)
    expect(types.audio.events.find((e: { name: string }) => e.name === 'Aether hum')).toMatchObject({ asset: 'AE_AetherHum', kind: 'sfx', spatial: true })
    expect(unreal.checks(ir).filter((i) => i.level === 'error')).toEqual([])
  })

  it('writes the architecture plan by class headers, which the bridge’s Validate checks', () => {
    const plan = JSON.parse(files.get('ProjectFiles/architecture.json')!) as ArchitecturePlan
    expect(plan.match).toBe('include')
    expect(plan.modules.find((m) => m.name === 'Gameplay.Player')).toMatchObject({ folders: ['Source/PlannerGame/Classes/GameplayPlayer/'], tokens: expect.arrayContaining(['HealthBase.h', 'Health.h']) })
  })
})
