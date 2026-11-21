import { describe, expect, it } from 'vitest'
import { deserializeProject } from '../src/core/persistence/serialize'
import { buildIR } from '../src/core/engine/ir'
import { parseParams, telemetryMetricKeys } from '../src/core/engine/irExtras'
import { unity } from '../src/core/engine/adapters/unity'

/** Plan § 7, second round: I3 communication channels → event bus / ScriptableObject channels, I11 telemetry events. */
const fs: { readFileSync: (p: string, e: string) => string } = await import('node:fs' as string)
const cinderholm = () => deserializeProject(fs.readFileSync('examples/cinderholm.hohplan.json', 'utf8')).project

describe('parameters of channels and telemetry events', () => {
  const { ir } = buildIR(cinderholm())

  it('reads “name: type”, and guesses the type from the name when there is none', () => {
    const { params, problems } = parseParams('NpcId, NeedId, value, tick number, enemy: Enemy, ok: bool, label: colour', ir.schemas)
    expect(params.map((p) => [p.name, p.type])).toEqual([
      ['NpcId', { k: 'string' }],
      ['NeedId', { k: 'string' }],
      ['value', { k: 'float' }],
      ['tick number', { k: 'int' }],
      ['enemy', { k: 'ref', schema: ir.schemas.find((s) => s.name === 'Enemy')!.id }],
      ['ok', { k: 'bool' }],
      ['label', { k: 'string' }],
    ])
    expect(problems).toEqual(['“colour” is not a type the planner knows (int, float, bool, string or a data schema); “label” is text'])
    expect(parseParams('a, a', ir.schemas).problems).toEqual(['“a” is named twice'])
  })
})

describe('communication channels (I3)', () => {
  const { ir } = buildIR(cinderholm())
  const files = new Map(unity.emit(ir).map((f) => [f.path, f.content]))

  it('takes the Architecture’s channels with their modules', () => {
    const need = ir.channels.find((c) => c.name === 'NeedChanged')!
    expect(need).toMatchObject({ kind: 'bus', publishers: ['Simulation.Npc'], subscribers: ['UI.Hud', 'Simulation.Town'], frequency: 'Per tick' })
    expect(ir.channels.find((c) => c.name === 'SaveRequested')!.kind).toBe('asset')
  })

  it('writes the event buses as typed static events and each ScriptableObject channel as its own type', () => {
    const bus = files.get('Scripts/Generated/Channels/GameEvents.cs')!
    expect(bus).toContain('public static event Action<string, string, float> NeedChanged;')
    expect(bus).toContain('public static void RaiseNeedChanged(string npcId, string needId, float @value) => NeedChanged?.Invoke(npcId, needId, @value);')
    expect(bus).toContain('/// <summary>NeedChanged (Event bus, per tick). Published by Simulation.Npc. Listened to by UI.Hud, Simulation.Town.</summary>')
    expect(bus).toContain('            TickCompleted = null;')
    const save = files.get('Scripts/Generated/Channels/SaveRequestedChannel.cs')!
    expect(save).toContain('public sealed class SaveRequestedChannel : ScriptableObject')
    expect(save).toContain('public const string ChannelId = "RunCiGFg";')
    expect(save).toContain('public event Action<int> Raised;')
  })

  it('writes nothing for an architecture without channels', () => {
    const p = cinderholm()
    p.documents['technical.architecture'].data.channels = []
    expect(unity.emit(buildIR(p).ir).some((f) => f.path.includes('/Channels/'))).toBe(false)
  })
})

describe('telemetry events (I11)', () => {
  const { ir } = buildIR(cinderholm())

  it('takes the Balance plan’s events, and says which metrics they feed', () => {
    const kill = ir.telemetry.find((t) => t.key === 'enemy_killed')!
    expect(kill.params.map((p) => p.type.k)).toEqual(['ref', 'float', 'string'])
    expect(telemetryMetricKeys(kill)).toEqual(['enemy_killed.count', 'enemy_killed.seconds'])
    // The example's Balance plan has a metric fed by it, so the measured mean lands there.
    expect(cinderholm().documents['qa.balance'].data.metrics.some((m: { key?: string }) => m.key === 'enemy_killed.seconds')).toBe(true)
  })

  it('leaves out an event with a bad or repeated key', () => {
    const p = cinderholm()
    p.documents['qa.balance'].data.telemetry.push({ id: 'x1', name: 'Bad', key: 'has space' }, { id: 'x2', name: 'Again', key: 'enemy_killed' })
    const { ir: next, issues } = buildIR(p)
    expect(next.telemetry).toHaveLength(3)
    expect(issues.filter((i) => i.code === 'telemetry.key')).toHaveLength(2)
  })

  it('writes one typed call per event that logs a JSON line', () => {
    const code = unity.emit(ir).find((f) => f.path === 'Scripts/Generated/Telemetry.cs')!.content
    expect(code).toContain('public static void EnemyKilled(EnemyDefinition enemy, float seconds, string biome) => Write("enemy_killed", ("enemy", (object)(enemy != null ? enemy.id : null)), ("seconds", (object)(seconds)), ("biome", (object)(biome)));')
    expect(code).toContain('public static void TownspersonStarved(string npcId, int day) => Write("npc_starved", ("npc_id", (object)(npcId)), ("day", (object)(day)));')
    expect(code).toContain('public const string FileName = "hoh-telemetry.jsonl";')
    expect(code).toContain('case float f: return float.IsFinite(f) ? f.ToString("R", CultureInfo.InvariantCulture) : "null";')
  })
})
