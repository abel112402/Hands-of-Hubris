import { afterAll, describe, expect, it } from 'vitest'
import { deserializeProject } from '../src/core/persistence/serialize'
import { unreal, UE_MODULE } from '../src/core/engine/adapters/unreal'
import { buildIR } from '../src/core/engine/ir'
import { buildBundle } from '../src/core/engine/bundle'
import { exportFolderIn, folderState, writeExport } from '../src/core/engine/folder'
import { parseReport } from '../src/core/engine/report'
import { evaluate } from '../src/core/formula'
import { MemoryFolder } from './memoryFolder'

type Fs = {
  readFileSync(p: string, e: string): string
  writeFileSync(p: string, d: string): void
  mkdirSync(p: string, o: { recursive: true }): void
  mkdtempSync(p: string): string
  rmSync(p: string, o: { recursive: true; force: true }): void
}
const fs = (await import('node:fs' as string)) as Fs
const os = (await import('node:os' as string)) as { tmpdir(): string }
const cp = (await import('node:child_process' as string)) as { spawnSync(cmd: string, args: string[], o: { encoding: 'utf8' }): { status: number | null; stdout: string; stderr: string; error?: Error } }
const cinderholm = () => deserializeProject(fs.readFileSync('examples/cinderholm.hohplan.json', 'utf8')).project

describe('Unreal adapter output', () => {
  const { ir } = buildIR(cinderholm())
  const files = new Map(unreal.emit(ir).map((f) => [f.path, f.content]))
  const gen = (name: string) => files.get(`Source/${UE_MODULE}/Generated/${name}`)!

  it('is a plugin with one module whose rules and module file are yours', () => {
    const plugin = JSON.parse(files.get(`${UE_MODULE}.uplugin`)!)
    expect(plugin.Modules).toEqual([{ Name: UE_MODULE, Type: 'Runtime', LoadingPhase: 'Default' }])
    expect(files.get(`Source/${UE_MODULE}/${UE_MODULE}.Build.cs`)).toContain('PublicIncludePaths.Add(Path.Combine(ModuleDirectory, "Generated"));')
    expect(files.get(`Source/${UE_MODULE}/${UE_MODULE}.cpp`)).toContain(`IMPLEMENT_MODULE(FDefaultModuleImpl, ${UE_MODULE});`)
    expect(unreal.ownDir).toBe(`Source/${UE_MODULE}/`)
    expect(unreal.generatedDirs).toContain(`Source/${UE_MODULE}/Generated/`)
  })

  it('writes data assets for native schemas and DataTable rows for JSON and CSV', () => {
    const item = gen('ItemDefinition.h')
    expect(item).toContain('#include "ItemDefinition.generated.h"')
    expect(item).toContain('class PLANNERGAME_API UItemDefinition : public UPrimaryDataAsset')
    expect(item).toContain('static constexpr const TCHAR* SchemaId = TEXT("')
    expect(item).toContain('FString DisplayName;')
    expect(item).toContain('TSoftObjectPtr<UTexture2D> Icon;')
    expect(item).toContain('ERarity Rarity = static_cast<ERarity>(0);')
    expect(item).toContain('int32 StackSize = 0;')
    expect(item).toContain('class UTexture2D;')
    expect(item).toContain('#include "CinderholmExampleEnums.h"')
    expect(gen('BuildingDefinition.h')).toContain('TArray<TObjectPtr<UItemDefinition>> BuildCost;')
    expect(gen('BuildingDefinition.h')).toContain('class UItemDefinition;')
    const recipe = gen('RecipeRow.h')
    expect(recipe).toContain('struct PLANNERGAME_API FRecipeRow : public FTableRowBase')
    expect(recipe).toContain('TArray<FName> Inputs;')
    const table = JSON.parse(files.get('DataTables/Recipe.json')!)
    expect(table.length).toBe(ir.records.filter((r) => ir.schemas.find((s) => s.id === r.schema)?.name === 'Recipe').length)
    expect(table[0]).toMatchObject({ Name: expect.stringMatching(/^rcp\./), PlannerId: expect.any(String) })
  })

  it('writes enums with planner IDs, IDs and formulas that compute what the planner computes', () => {
    const enums = gen('CinderholmExampleEnums.h')
    expect(enums).toContain('UENUM(BlueprintType)\nenum class ERarity : uint8')
    expect(enums).toContain('BuildingItem UMETA(DisplayName = "Building item"),')
    // The “Resources” catalog would clash with nothing in Unreal, so it keeps its name.
    expect(enums).toContain('enum class EResource : uint8')
    expect(gen('CinderholmExampleEnumIds.h')).toContain('{ TEXT("common"), ERarity::Common },')
    expect(gen('CinderholmExampleIds.h')).toContain('constexpr const TCHAR* IronLongsword = TEXT("item.iron_longsword");')
    const text = gen('CinderholmExampleFormulas.h')
    expect(text).toContain('static float HealthRegenPerSecond(float Base, float Level, float PerLevel) { return Base + Level * PerLevel; }')
    expect(text).toContain('FMath::Min(Qty, 20.f)')
    const FMath = { Min: Math.min, Max: Math.max, Pow: Math.pow, Sqrt: Math.sqrt, Abs: Math.abs, FloorToFloat: Math.floor, CeilToFloat: Math.ceil, Loge: Math.log }
    for (const f of ir.formulas.filter((x) => x.ast && Object.keys(x.sample).length)) {
      const at = text.indexOf(`Planner: ${f.expr}.`)
      const m = /static float \w+\(([^)]*)\) \{ return (.+); \}/.exec(text.slice(at))!
      const params = m[1] ? m[1].split(', ').map((p) => p.split(' ')[1]) : []
      const js = m[2].replace(/FMath::/g, 'FMath.').replace(/(\d+(?:\.\d+)?(?:e-?\d+)?)\.?f\b/g, '$1')
      const got = new Function('FMath', ...params, `return ${js}`)(FMath, ...f.params.map((p) => f.sample[p] ?? 0))
      expect(got, f.name).toBeCloseTo(evaluate(f.expr, f.sample), 5)
    }
  })

  it('writes each diagram class as a generated base and your class that overrides its methods', () => {
    const base = gen('Classes/HealthBase.h')
    expect(base).toContain('class PLANNERGAME_API UHealthBase : public UActorComponent, public IDamageable')
    expect(base).toContain('UCLASS(Abstract, BlueprintType)')
    expect(base).toContain('virtual void Die() PURE_VIRTUAL(UHealthBase::Die, );')
    const own = files.get(`Source/${UE_MODULE}/Classes/GameplayPlayer/Health.h`)!
    expect(own).toContain('#include "Classes/HealthBase.h"')
    expect(own).toContain('class PLANNERGAME_API UHealth : public UHealthBase')
    expect(own).toContain('virtual float TakeDamage(float Amount) override;')
    expect(files.get(`Source/${UE_MODULE}/Classes/GameplayPlayer/Health.cpp`)).toContain('float UHealth::TakeDamage(float Amount)\n{\n\treturn {}; // TODO\n}')
    // Not “= 0”: Unreal makes a default object of UHealthBase, which must not be abstract in C++.
    const iface = gen('Classes/Damageable.h')
    expect(iface).toContain('class UDamageable : public UInterface')
    expect(iface).toContain('virtual float TakeDamage(float Amount) PURE_VIRTUAL(IDamageable::TakeDamage, return {};);')
    expect(iface).not.toMatch(/= 0;/)
    expect(gen('Classes/NeedChangedEventBase.h')).toContain('DECLARE_DYNAMIC_MULTICAST_DELEGATE_ThreeParams(FNeedChangedEventRaised, FString, NpcId, FString, Need, float, Amount);')
    expect(gen('Classes/SaveServiceBase.h')).toContain('static inline int32 SlotCount{ 0 };')
    expect(files.get(`Source/${UE_MODULE}/Classes/PersistenceSave/SaveService.h`)).toContain('static void Save(int32 Slot);')
    expect(gen('Classes/NpcMood.h')).toContain('enum class ENpcMood : uint8')
    expect(gen('Classes/NeedState.h')).toContain('TObjectPtr<UNpcNeedDefinition> Need;')
    // Every reflected header includes its own .generated.h last among its includes, and every file name is unique.
    for (const [path, text] of files) {
      if (!path.endsWith('.h') || !/\b(UCLASS|USTRUCT|UENUM|UINTERFACE)\(/.test(text)) continue
      const name = path.split('/').pop()!.replace(/\.h$/, '')
      const includes = [...text.matchAll(/^#include "([^"]+)"$/gm)].map((m) => m[1])
      expect(includes.at(-1), path).toBe(`${name}.generated.h`)
    }
    const headers = [...files.keys()].filter((p) => p.endsWith('.h')).map((p) => p.split('/').pop())
    expect(new Set(headers).size).toBe(headers.length)
  })

  it('reports Unreal type names and clashes as errors', () => {
    const issues = unreal.checks(ir)
    // The example exports without errors (its player controller is called CinderPlayerController for that reason).
    expect(issues.filter((i) => i.level === 'error')).toEqual([])
    const p = cinderholm()
    p.documents['technical.architecture'].data.classes.push({ id: 'x1', name: 'PlayerController', kind: 'actor' })
    expect(unreal.checks(buildIR(p).ir).some((i) => i.level === 'error' && /^Class PlayerController: PlayerController is an Unreal type name/.test(i.message))).toBe(true)
    p.documents['technical.architecture'].data.classes.push({ id: 'x2', name: 'Health', kind: 'data' })
    expect(unreal.checks(buildIR(p).ir).some((i) => i.code === 'unreal.duplicate' && /Health/.test(i.message))).toBe(true)
  })

  it('keeps the generated C++ stable', () => {
    expect(gen('ItemDefinition.h')).toMatchSnapshot()
    expect(gen('Classes/HealthBase.h')).toMatchSnapshot()
    expect(files.get('Meta/planner-types.json')).toMatchSnapshot()
  })
})

describe('Unreal linked folder', () => {
  it('writes into Plugins/HoHPlanner of an Unreal project, replacing Generated/ but never your module files', async () => {
    const root = new MemoryFolder('MyGame')
    root.put('MyGame.uproject', '{}')
    expect(await folderState(root)).toMatchObject({ unrealProject: true })
    const { folder, path } = await exportFolderIn(root)
    expect(path).toBe('Plugins/HoHPlanner')
    const dir = folder as MemoryFolder
    const files = buildBundle(cinderholm(), 'unreal', 'T').files
    await writeExport(dir, files)
    dir.put(`Unreal/Source/${UE_MODULE}/${UE_MODULE}.Build.cs`, '// mine')
    dir.put(`Unreal/Source/${UE_MODULE}/Classes/GameplayPlayer/Health.cpp`, '// mine')
    dir.put(`Unreal/Source/${UE_MODULE}/Generated/ItemDefinition.h`, '// stale')
    dir.put(`Unreal/Source/${UE_MODULE}/Generated/Old.h`, '// old')
    // A generated header changed by hand stops the write (core/engine/ownership); nothing is written.
    expect(await writeExport(dir, files)).toMatchObject({ stopped: true, conflicts: [`Unreal/Source/${UE_MODULE}/Generated/ItemDefinition.h`] })
    expect(dir.read(`Unreal/Source/${UE_MODULE}/Generated/ItemDefinition.h`)).toBe('// stale')
    const r = await writeExport(dir, files, { overwrite: true })
    expect(dir.read(`Unreal/Source/${UE_MODULE}/${UE_MODULE}.Build.cs`)).toBe('// mine')
    expect(dir.read(`Unreal/Source/${UE_MODULE}/Classes/GameplayPlayer/Health.cpp`)).toBe('// mine')
    expect(dir.read(`Unreal/Source/${UE_MODULE}/Generated/ItemDefinition.h`)).toContain('UItemDefinition')
    // Old.h was not written by the planner: kept, never deleted.
    expect(dir.read(`Unreal/Source/${UE_MODULE}/Generated/Old.h`)).toBe('// old')
    expect(r).toMatchObject({ written: 1, deleted: 0, codeChanged: true, keptNotOurs: [`Unreal/Source/${UE_MODULE}/Generated/Old.h`] })
  })
})

describe('Unreal bridge (Python core)', () => {
  const py = ['python', 'python3', 'py'].find((c) => !cp.spawnSync(c, ['--version'], { encoding: 'utf8' }).error)
  const tmp = fs.mkdtempSync(`${os.tmpdir()}/hoh-unreal-`)
  afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }))

  it.skipIf(!py)('reads a real export and writes a report the planner accepts', () => {
    const p = cinderholm()
    for (const f of buildBundle(p, 'unreal', 'T').files) {
      const full = `${tmp}/export/${f.path}`
      fs.mkdirSync(full.slice(0, full.lastIndexOf('/')), { recursive: true })
      fs.writeFileSync(full, f.content)
    }
    const r = cp.spawnSync(py!, ['tests/unrealBridgeCore.py', `${tmp}/export`, `${tmp}/report.json`], { encoding: 'utf8' })
    expect(r.status, r.stderr).toBe(0)
    const { report, warnings } = parseReport(fs.readFileSync(`${tmp}/report.json`, 'utf8'), p)
    expect(report.engine).toBe('unreal')
    expect(report.records.some((x) => x.status === 'missing')).toBe(true)
    expect(report.classes.find((c) => c.name === 'Health')).toMatchObject({ status: 'stub', methods: 2 })
    // Only the made-up deprecated record is unknown to the plan.
    expect(warnings).toEqual(['1 record in the report is not in this plan and left out.'])
  })
})
