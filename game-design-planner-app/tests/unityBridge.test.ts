import { describe, expect, it } from 'vitest'
import { deserializeProject } from '../src/core/persistence/serialize'
import { buildBundle } from '../src/core/engine/bundle'
import { manifestJsonSchema } from '../src/core/engine/manifest'

/**
 * The Unity bridge package reads these fixtures in its own tests (Tests/Editor/Fixtures), so the C# side is
 * checked against the contract the planner writes. Run with UPDATE_BRIDGE_FIXTURES=1 to rewrite them.
 */
const fs: { readFileSync: (p: string, e: string) => string; writeFileSync: (p: string, t: string) => void; existsSync: (p: string) => boolean; readdirSync: (p: string) => string[]; statSync: (p: string) => { isDirectory: () => boolean } } = await import('node:fs' as string)
const env: Record<string, string | undefined> = ((globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env) ?? {}
const DIR = 'engine-packages/unity/com.handsofhubris.planner-bridge'
const FIXTURES = `${DIR}/Tests/Editor/Fixtures`

const expected = () => {
  const p = deserializeProject(fs.readFileSync('examples/cinderholm.hohplan.json', 'utf8')).project
  const b = buildBundle(p, 'unity', '2026-01-01T00:00:00.000Z')
  return {
    'hoh-engine.schema.json': JSON.stringify(manifestJsonSchema(), null, 2) + '\n',
    'sample-manifest.json': b.files[0].content,
  }
}

describe('Unity bridge package', () => {
  it('has current contract fixtures', () => {
    for (const [name, text] of Object.entries(expected())) {
      const path = `${FIXTURES}/${name}`
      if (env.UPDATE_BRIDGE_FIXTURES) fs.writeFileSync(path, text)
      expect(fs.existsSync(path), `${path} is missing; run the tests with UPDATE_BRIDGE_FIXTURES=1`).toBe(true)
      expect(fs.readFileSync(path, 'utf8').replace(/\r\n/g, '\n'), `${name} is out of date; run the tests with UPDATE_BRIDGE_FIXTURES=1`).toBe(text)
    }
  })

  it('declares the format version the planner writes and ships .meta files for every asset', () => {
    const manifest = fs.readFileSync(`${DIR}/Editor/PlannerManifest.cs`, 'utf8')
    expect(manifest).toContain('public const int SupportedVersion = 1;')
    const pkg = JSON.parse(fs.readFileSync(`${DIR}/package.json`, 'utf8'))
    expect(pkg.name).toBe('com.handsofhubris.planner-bridge')
    // A git-URL package is read-only in Unity: an asset without a committed .meta file is ignored.
    // Missing ones: node engine-packages/unity/make-meta.cjs
    const walk = (dir: string): string[] =>
      fs.readdirSync(dir).filter((n) => !n.endsWith('.meta') && !n.startsWith('.')).flatMap((n) => [`${dir}/${n}`, ...(fs.statSync(`${dir}/${n}`).isDirectory() ? walk(`${dir}/${n}`) : [])])
    const all = walk(DIR)
    expect(all.length).toBeGreaterThan(20)
    expect(all.filter((f) => !fs.existsSync(`${f}.meta`))).toEqual([])
    const guids = all.map((f) => fs.readFileSync(`${f}.meta`, 'utf8').match(/guid: ([0-9a-f]{32})/)?.[1])
    expect(new Set(guids).size).toBe(all.length)
  })
})
