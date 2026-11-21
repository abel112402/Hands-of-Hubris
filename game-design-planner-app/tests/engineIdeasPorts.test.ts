import { describe, expect, it } from 'vitest'
import { deserializeProject } from '../src/core/persistence/serialize'
import { buildIR } from '../src/core/engine/ir'
import { godot } from '../src/core/engine/adapters/godot'
import { unreal } from '../src/core/engine/adapters/unreal'
import { evaluate } from '../src/core/formula'

/** Plan § 7 on Godot and Unreal: data checks, debug console, channels and telemetry in the generated code. */
const fs: { readFileSync: (p: string, e: string) => string } = await import('node:fs' as string)
const cinderholm = () => deserializeProject(fs.readFileSync('examples/cinderholm.hohplan.json', 'utf8')).project
const { ir } = buildIR(cinderholm())

describe('Godot', () => {
  const files = new Map(godot.emit(ir).map((f) => [f.path, f.content]))
  const gen = (name: string) => files.get(`Scripts/Generated/${name}`)!

  it('writes the data checks the addon’s Validate runs, computing what the planner computes', () => {
    const code = gen('cinderholm_example_data_checks.gd')
    expect(code).toContain('class_name CinderholmExampleDataChecks')
    expect(code).toContain('{ "name": "Enemy toughness", "schema": "VOS_sAP0", "type": "EnemyDefinition", "expr": "health / damage", "level": "error", "min": 5, "max": 20 },')
    const body = /\t\t1:\n\t\t\treturn (.+)\n/.exec(code)![1]
    const js = body.replace(/float\(r\.(\w+)\)/g, 'r.$1').replace(/ceilf/g, 'Math.ceil')
    expect(new Function('r', `return ${js}`)({ health: 1229 })).toBe(evaluate('ceil(health / 40)', { health: 1229 }))
  })

  it('writes the console, its overlay, the event-bus autoload, the Resource channels and typed telemetry', () => {
    const console = gen('cinderholm_example_console.gd')
    expect(console).toContain('static var handler: Object')
    expect(console).toContain('\t\t"give":')
    expect(console).toContain('return _call("give", [a0, a1], line)')
    expect(console).toContain('return _call("time_set", [t0[0].to_int(), t0[1].to_int()], line)')
    expect(gen('planner_console_overlay.gd')).toContain('extends CanvasLayer')
    expect(gen('planner_console_overlay.gd')).not.toMatch(/var _input\b/)
    const bus = gen('Channels/game_events.gd')
    expect(bus).toContain('signal need_changed(npc_id: String, need_id: String, value: float)')
    const save = gen('Channels/save_requested_channel.gd')
    expect(save).toContain('class_name SaveRequestedChannel\nextends Resource')
    expect(save).toContain('signal raised(slot: int)')
    const tel = gen('cinderholm_example_telemetry.gd')
    expect(tel).toContain('static func enemy_killed(enemy: EnemyDefinition, seconds: float, biome: String) -> void:\n\t_write("enemy_killed", {"enemy": enemy.id if enemy != null else null, "seconds": seconds, "biome": biome})')
    expect(tel).toContain('const FILE := "user://hoh-telemetry.jsonl"')
    // Every generated GDScript file indents with tabs only.
    for (const [path, text] of files) if (path.endsWith('.gd')) expect(text, path).not.toMatch(/^ +\S/m)
  })

  it('reports a generated class that clashes with a class of the plan', () => {
    const p = cinderholm()
    p.documents['technical.architecture'].data.classes.push({ id: 'x9', name: 'CinderholmExampleTelemetry', kind: 'class' })
    expect(godot.checks(buildIR(p).ir).some((i) => i.code === 'godot.duplicate' && /CinderholmExampleTelemetry/.test(i.message))).toBe(true)
  })
})

describe('Unreal', () => {
  const files = new Map(unreal.emit(ir).map((f) => [f.path, f.content]))
  const gen = (name: string) => files.get(`Source/PlannerGame/Generated/${name}`)!

  it('writes the event buses as native delegates and each channel as a data asset', () => {
    const bus = gen('PlannerGameEvents.h')
    expect(bus).toContain('DECLARE_MULTICAST_DELEGATE_ThreeParams(FPlannerOnNeedChanged, const FString&, const FString&, float);')
    expect(bus).toContain('\tstatic FPlannerOnNeedChanged NeedChanged;')
    expect(gen('PlannerGameEvents.cpp')).toContain('FPlannerOnNeedChanged FPlannerGameEvents::NeedChanged;')
    const save = gen('SaveRequestedChannel.h')
    expect(save).toContain('DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FPlannerSaveRequestedChannelRaised, int32, Slot);')
    expect(save).toContain('class PLANNERGAME_API USaveRequestedChannel : public UDataAsset')
    const types = JSON.parse(files.get('Meta/planner-types.json')!)
    expect(types.channels).toEqual([{ id: 'RunCiGFg', name: 'SaveRequested', path: '/Script/PlannerGame.SaveRequestedChannel' }])
  })

  it('writes typed telemetry and the console command', () => {
    const h = gen('CinderholmExampleTelemetry.h')
    expect(h).toContain('static void EnemyKilled(UEnemyDefinition* Enemy, float Seconds, const FString& Biome);')
    expect(h).toContain('class FJsonObject;')
    const cpp = gen('CinderholmExampleTelemetry.cpp')
    expect(cpp).toContain('SetText(*Values, TEXT("enemy"), Enemy ? Enemy->Id.ToString() : FString());')
    expect(cpp).toContain('FILEWRITE_Append')
    const ch = gen('PlannerConsole.h')
    expect(ch).toContain('virtual void Give(const FString& Item, int32 Count) = 0;')
    expect(ch).toContain('virtual void TimeSet(int32 Hour, int32 Minute) = 0;')
    const cc = gen('PlannerConsole.cpp')
    expect(cc).toContain('static FAutoConsoleCommand GPlannerConsoleCommand(')
    expect(cc).toContain('#if !UE_BUILD_SHIPPING')
    expect(cc).toContain('GHandler->Give(A0, A1);')
  })
})
