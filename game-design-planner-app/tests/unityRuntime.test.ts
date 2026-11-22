import { describe, expect, it } from 'vitest'
import { buildReferenceSlice } from './fixtures/referenceSlice3d'
import { buildBundle } from '../src/core/engine/bundle'
import { parseManifest, UNITY_RUNTIME } from '../src/core/engine/manifest'
import { deserializeProject } from '../src/core/persistence/serialize'

/**
 * plans/UNITY_PLAYABLE_GAME_GENERATION_PLAN.md, phase 4: the Unity runtime package and the export's runtime requirement.
 * The C# side is tested in Unity (the package's own EditMode and PlayMode tests); this checks the contract around it.
 */
const fs: { readFileSync: (p: string, e: string) => string; existsSync: (p: string) => boolean; readdirSync: (p: string) => string[]; statSync: (p: string) => { isDirectory: () => boolean } } = await import('node:fs' as string)
const DIR = 'engine-packages/unity/com.handsofhubris.planner-runtime'
const walk = (dir: string): string[] =>
  fs.readdirSync(dir).filter((n) => !n.endsWith('.meta') && !n.startsWith('.')).flatMap((n) => [`${dir}/${n}`, ...(fs.statSync(`${dir}/${n}`).isDirectory() ? walk(`${dir}/${n}`) : [])])

describe('Unity runtime package', () => {
  it('has the name and version the planner asks for, in package.json and in code', () => {
    const pkg = JSON.parse(fs.readFileSync(`${DIR}/package.json`, 'utf8'))
    expect(pkg).toMatchObject({ name: UNITY_RUNTIME.package, version: UNITY_RUNTIME.version, unity: '2022.3' })
    const info = fs.readFileSync(`${DIR}/Runtime/PlannerRuntimeInfo.cs`, 'utf8')
    expect(info).toContain(`Version = "${UNITY_RUNTIME.version}"`)
    expect(info).toContain(`PackageName = "${UNITY_RUNTIME.package}"`)
    expect(fs.readFileSync(`${DIR}/CHANGELOG.md`, 'utf8')).toContain(`## ${UNITY_RUNTIME.version}`)
  })

  it('keeps Editor code out of the runtime assembly, so it goes into player builds', () => {
    const asmdef = JSON.parse(fs.readFileSync(`${DIR}/Runtime/HoHPlanner.Runtime.asmdef`, 'utf8'))
    expect(asmdef.includePlatforms).toEqual([])
    expect(asmdef.references).toEqual([])
    for (const f of walk(`${DIR}/Runtime`).filter((x) => x.endsWith('.cs'))) expect(fs.readFileSync(f, 'utf8'), f).not.toMatch(/UnityEditor/)
  })

  it('ships a .meta file for every asset (git-URL packages are read-only)', () => {
    expect(walk(DIR).filter((f) => !fs.existsSync(`${f}.meta`))).toEqual([])
  })

  it('has EditMode and PlayMode test assemblies', () => {
    const editor = JSON.parse(fs.readFileSync(`${DIR}/Tests/Editor/HoHPlanner.Runtime.Tests.Editor.asmdef`, 'utf8'))
    const play = JSON.parse(fs.readFileSync(`${DIR}/Tests/Runtime/HoHPlanner.Runtime.Tests.asmdef`, 'utf8'))
    expect(editor.includePlatforms).toEqual(['Editor'])
    expect(play.includePlatforms).toEqual([])
    for (const a of [editor, play]) expect(a.defineConstraints).toEqual(['UNITY_INCLUDE_TESTS'])
  })
})

describe('runtime requirement in the manifest', () => {
  it('is set for a Unity export of a plan that asks for a playable prototype', () => {
    const m = buildBundle(buildReferenceSlice(), 'unity', '2026-01-01T00:00:00.000Z').manifest
    expect(m.requires).toEqual({ runtime: { package: 'com.handsofhubris.planner-runtime', version: UNITY_RUNTIME.version } })
    expect(parseManifest(JSON.stringify(m)).ok).toBe(true)
  })

  it('is absent for other engines and for plans without a prototype', () => {
    expect(buildBundle(buildReferenceSlice(), 'godot', '2026-01-01T00:00:00.000Z').manifest.requires).toBeUndefined()
    const cinderholm = deserializeProject(fs.readFileSync('examples/cinderholm.hohplan.json', 'utf8')).project
    expect(buildBundle(cinderholm, 'unity', '2026-01-01T00:00:00.000Z').manifest.requires).toBeUndefined()
  })

  it('is read by the bridge, which refuses the import without the package', () => {
    const manifest = fs.readFileSync('engine-packages/unity/com.handsofhubris.planner-bridge/Editor/PlannerManifest.cs', 'utf8')
    expect(manifest).toContain(`RuntimePackageName = "${UNITY_RUNTIME.package}"`)
    const importer = fs.readFileSync('engine-packages/unity/com.handsofhubris.planner-bridge/Editor/PlannerImporter.cs', 'utf8')
    expect(importer.match(/manifest\.RequireRuntime\(\)/g)).toHaveLength(2)
  })
})
