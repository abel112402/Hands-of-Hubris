import { describe, expect, it, vi } from 'vitest'
import JSZip from 'jszip'
import { deserializeProject } from '../src/core/persistence/serialize'
import { ENGINE_ADAPTERS } from '../src/core/engine/adapters'
import { unity } from '../src/core/engine/adapters/unity'
import { ALL_NEUTRAL_TYPES, buildIR } from '../src/core/engine/ir'
import { BUNDLE_ROOT, buildBundle, bundleZip } from '../src/core/engine/bundle'
import { fnv1a, manifestSchema, parseManifest } from '../src/core/engine/manifest'
import type { EngineId } from '../src/core/engine/adapter'

const fs: { readFileSync: (path: string, enc: string) => string } = await import('node:fs' as string)
const cinderholm = () => deserializeProject(fs.readFileSync('examples/cinderholm.hohplan.json', 'utf8')).project

/** The contract every engine adapter meets; a Godot or Unreal adapter added to ENGINE_ADAPTERS runs it too. */
describe.each(ENGINE_ADAPTERS.map((a) => [a.label, a] as const))('%s adapter contract', (_, adapter) => {
  const { ir } = buildIR(cinderholm())

  it('names every neutral type in every format', () => {
    for (const t of ALL_NEUTRAL_TYPES) for (const fmt of ['native', 'json', 'csv'] as const) expect(adapter.typeName(t, ir, fmt)).toMatch(/\S/)
  })

  it('never returns a bare reserved word or an invalid identifier', () => {
    for (const kind of ['type', 'field', 'constant', 'method', 'param', 'member'] as const) {
      for (const w of [[[...adapter.reservedWords][0]], ['2d', 'sprite'], [], ['iron', 'sword']]) {
        const id = adapter.identifier(w, kind)
        expect(adapter.reservedWords.has(id)).toBe(false)
        expect(id).toMatch(/^@?[A-Za-z_][A-Za-z0-9_]*$/)
      }
    }
  })

  it('emits the same files for the same project, with unique paths under its root', () => {
    const a = adapter.emit(ir)
    expect(adapter.emit(buildIR(cinderholm()).ir)).toEqual(a)
    expect(new Set(a.map((f) => f.path)).size).toBe(a.length)
    expect(a.every((f) => !f.path.startsWith('/') && !f.path.includes('..'))).toBe(true)
  })

  it('bundles exactly one data file or CSV row per record', () => {
    const b = buildBundle(cinderholm(), adapter.id, 'T')
    for (const s of b.manifest.schemas) {
      if (s.format === 'csv') {
        const f = b.files.find((x) => x.path === s.data)!
        expect(f.content.trim().split('\n')).toHaveLength(s.records + 1)
      } else expect(b.files.filter((x) => x.path.startsWith(s.data))).toHaveLength(s.records)
    }
  })
})

describe('Unity adapter output', () => {
  const files = new Map(unity.emit(buildIR(cinderholm()).ir).map((f) => [f.path, f.content]))
  const get = (name: string) => files.get(`Scripts/Generated/${name}`)!

  it('writes a ScriptableObject for native schemas and record classes for JSON and CSV', () => {
    const item = get('ItemDefinition.cs')
    expect(item).toContain('public partial class ItemDefinition : ScriptableObject')
    expect(item).toContain('[CreateAssetMenu(menuName = "Cinderholm (example)/Item", fileName = "NewItem")]')
    expect(item).toContain('public string displayName;')
    expect(item).not.toMatch(/public string name;/)
    expect(item).toContain('public Sprite icon;')
    expect(item).toContain('public Rarity rarity;')
    expect(get('BuildingDefinition.cs')).toContain('public List<ItemDefinition> buildCost;')
    expect(get('BuildingDefinition.cs')).toContain('public Vector2 footprint;')
    const recipe = get('RecipeRecord.cs')
    expect(recipe).toContain('[Serializable]')
    expect(recipe).toContain('public List<string> inputs;')
    expect(get('QuestRecord.cs')).toContain('Localization key.')
  })

  it('writes enums with planner IDs, ID constants and formulas', () => {
    expect(get('Enums.cs')).toContain('[InspectorName("Building item")] BuildingItem,')
    expect(get('Enums.cs')).toContain('["common"] = global::CinderholmExample.Data.Rarity.Common')
    expect(get('Ids.cs')).toContain('public const string IronSword = "item.iron_sword";')
    const formulas = get('Formulas.cs')
    expect(formulas).toContain('public static float HealthRegenPerSecond(float @base, float level, float perLevel) => @base + level * perLevel;')
    expect(formulas).toContain('baseHp * Mathf.Pow(1.6f, stage)')
    expect(formulas).toContain('value * (1f - Mathf.Min(qty, 20f) / 100f)')
    expect(files.get('Scripts/CinderholmExample.asmdef')).toContain('"rootNamespace": "CinderholmExample"')
  })

  it('keeps the generated C# stable', () => {
    expect(get('ItemDefinition.cs')).toMatchSnapshot()
    expect(get('Formulas.cs')).toMatchSnapshot()
  })
})

describe('engine bundle', () => {
  it('writes a manifest that matches its schema and hashes every file', () => {
    const b = buildBundle(cinderholm(), 'unity', '2026-01-01T00:00:00.000Z')
    const m = b.files[0]
    expect(m.path).toBe('hoh-engine.json')
    const parsed = parseManifest(m.content)
    expect(parsed.ok).toBe(true)
    expect(b.manifest.files.map((f) => f.path)).toEqual(b.files.slice(1).map((f) => f.path))
    for (const f of b.files.slice(1)) expect(b.manifest.files.find((x) => x.path === f.path)!.hash).toBe(fnv1a(f.content))
    expect(b.manifest.counts.maps).toBeGreaterThan(0)
    expect(JSON.parse(b.files.find((f) => f.path === 'hoh-engine.schema.json')!.content).type).toBe('object')
  })

  it('rejects a broken manifest', () => {
    expect(parseManifest('{').ok).toBe(false)
    const r = parseManifest(JSON.stringify({ format: 'hoh-engine', v: 2 }))
    expect(r.ok).toBe(false)
    expect(manifestSchema.safeParse({}).success).toBe(false)
  })

  it('zips the same bytes for the same project', async () => {
    const zip = async () => new Uint8Array(await (await bundleZip(buildBundle(cinderholm(), 'unity', 'T'))).arrayBuffer())
    // Minutes apart: nothing in the zip may carry the time it was made (JSZip dates the folders it adds itself).
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-01-01T10:00:00Z'))
    const a = await zip()
    vi.setSystemTime(new Date('2026-01-01T10:07:31Z'))
    const b = await zip()
    vi.useRealTimers()
    expect(a).toEqual(b)
    const back = await JSZip.loadAsync(a)
    expect(back.file(`${BUNDLE_ROOT}/Unity/Scripts/Generated/Ids.cs`)).toBeTruthy()
    expect(back.file(`${BUNDLE_ROOT}/Data/Recipe.csv`)).toBeTruthy()
  })
})

describe('target engine', () => {
  it('comes from the setting, else the Architecture stack, else Unity', async () => {
    const { engineTarget } = await import('../src/core/engine/target')
    const p = cinderholm()
    expect(engineTarget(p)).toMatchObject({ id: 'unity', from: 'stack', hasAdapter: true })
    p.documents['technical.architecture'].data.stack = [{ id: 'e', name: 'Godot 4.4', category: 'Engine' }]
    expect(engineTarget(p)).toMatchObject({ id: 'godot', from: 'stack', hasAdapter: true })
    p.meta.engine = { target: 'unreal' }
    expect(engineTarget(p)).toMatchObject({ id: 'unreal', from: 'setting', label: 'Unreal Engine' })
    p.meta.engine = { target: 'cryengine' }
    expect(engineTarget(p).from).toBe('stack')
    p.documents['technical.architecture'].data.stack = []
    expect(engineTarget(p)).toMatchObject({ id: 'unity', from: 'default' })
  })

  it('exports the engine-neutral part for an engine without an adapter', () => {
    // Every engine the planner knows has an adapter now; a new one starts without.
    const b = buildBundle(cinderholm(), 'cryengine' as EngineId, 'T')
    expect(b.manifest.engine).toEqual({ id: 'cryengine', adapterVersion: 0 })
    expect(b.files.some((f) => /^(Unity|Godot|Unreal)\//.test(f.path))).toBe(false)
    expect(b.files.some((f) => f.path === 'ir/engine-ir.json')).toBe(true)
    expect(b.files.find((f) => f.path === 'README.md')!.content).toContain('engine-neutral part only')
  })

  it('keeps the target engine in the project file', () => {
    const p = cinderholm()
    p.meta.engine = { target: 'godot' }
    expect(deserializeProject(JSON.stringify(p)).project.meta.engine).toEqual({ target: 'godot' })
  })
})
