import { afterAll, describe, expect, it } from 'vitest'
import { runCli, type CliIo } from '../scripts/engineCli'
import type { NodeFs } from '../scripts/nodeFolder'
import { DATA_DOC } from '../src/core/dataDriven'

const fs = (await import('node:fs' as string)) as NodeFs & { mkdtempSync(p: string): string; readFileSync(p: string, enc?: 'utf8'): string }
const os = (await import('node:os' as string)) as { tmpdir(): string }
const tmp = fs.mkdtempSync(`${os.tmpdir()}/hoh-cli-`)
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }))

function io() {
  const out: string[] = []
  const err: string[] = []
  const value: CliIo = { fs, log: (l) => void out.push(l), error: (l) => void err.push(l) }
  return { value, out, err }
}
const EXAMPLE = 'examples/cinderholm.hohplan.json'

describe('engine export CLI', () => {
  it('prints the usage', async () => {
    const o = io()
    expect(await runCli(['--help'], o.value)).toBe(0)
    expect(o.out[0]).toContain('Usage: npm run export:engine')
  })

  it('writes the same zip bytes for a fixed export time', async () => {
    const a = `${tmp}/a.zip`
    const b = `${tmp}/b.zip`
    expect(await runCli([EXAMPLE, a, '--exported-at', '2026-01-01T00:00:00.000Z'], io().value)).toBe(0)
    expect(await runCli([EXAMPLE, b, '--exported-at', '2026-01-01T00:00:00.000Z'], io().value)).toBe(0)
    const bytes = fs.readFileSync as unknown as (p: string) => Uint8Array
    expect(bytes(a)).toEqual(bytes(b))
  })

  it('writes a folder with the linked-folder rules, and a second run changes nothing', async () => {
    const dir = `${tmp}/Assets/HoHPlanner`
    const first = io()
    expect(await runCli([EXAMPLE, dir], first.value)).toBe(0)
    expect(first.out[0]).toMatch(/\(unity\): \d+ written, 0 unchanged/)
    expect(fs.readFileSync(`${dir}/Data/Item/item.plank.json`, 'utf8')).toContain('"Plank"')
    fs.writeFileSync(`${dir}/Unity/Scripts/Classes/GameplayPlayer/Health.cs`, '// mine')
    const second = io()
    expect(await runCli([EXAMPLE, dir], second.value)).toBe(0)
    expect(second.out[0]).toMatch(/: 0 written, \d+ unchanged, 0 removed, 7 of your class files kept\.$/)
    expect(fs.readFileSync(`${dir}/Unity/Scripts/Classes/GameplayPlayer/Health.cs`, 'utf8')).toBe('// mine')
  })

  it('exports C++ for Unreal Engine', async () => {
    const o = io()
    expect(await runCli([EXAMPLE, `${tmp}/unreal`, '--engine', 'unreal'], o.value)).toBe(0)
    expect(fs.existsSync(`${tmp}/unreal/Unity`)).toBe(false)
    expect(fs.readFileSync(`${tmp}/unreal/Unreal/PlannerGame.uplugin`, 'utf8')).toContain('"PlannerGame"')
    // No export errors: --strict passes.
    expect(await runCli([EXAMPLE, `${tmp}/unreal`, '--engine', 'unreal', '--strict'], io().value)).toBe(0)
  })

  it('exports GDScript for Godot', async () => {
    const o = io()
    expect(await runCli([EXAMPLE, `${tmp}/godot`, '--engine', 'godot'], o.value)).toBe(0)
    expect(o.out[0]).toMatch(/\(godot\): \d+ written/)
    expect(fs.readFileSync(`${tmp}/godot/Godot/Scripts/Generated/item_definition.gd`, 'utf8')).toContain('class_name ItemDefinition')
    expect(fs.existsSync(`${tmp}/godot/Unity`)).toBe(false)
  })

  it('fails with a reason on bad input, and on export errors only with --strict', async () => {
    let o = io()
    expect(await runCli(['nope.hohplan.json', `${tmp}/x.zip`], o.value)).toBe(2)
    expect(o.err[0]).toBe('No such file: nope.hohplan.json')
    o = io()
    expect(await runCli([EXAMPLE, `${tmp}/x.zip`, '--engine', 'cryengine'], o.value)).toBe(2)
    expect(o.err[0]).toMatch(/Unknown engine “cryengine”/)
    o = io()
    expect(await runCli([EXAMPLE], o.value)).toBe(2)
    fs.writeFileSync(`${tmp}/broken.hohplan.json`, '{"not":"a plan"}')
    o = io()
    expect(await runCli([`${tmp}/broken.hohplan.json`, `${tmp}/x.zip`], o.value)).toBe(2)
    expect(o.err[0]).toMatch(/Invalid project file/)

    // Two schemas sharing a prefix is an export error.
    const plan = JSON.parse(fs.readFileSync(EXAMPLE, 'utf8'))
    plan.documents[DATA_DOC].data.schemas[1].idPrefix = 'item.'
    fs.writeFileSync(`${tmp}/clash.hohplan.json`, JSON.stringify(plan))
    expect(await runCli([`${tmp}/clash.hohplan.json`, `${tmp}/c.zip`], io().value)).toBe(0)
    o = io()
    expect(await runCli([`${tmp}/clash.hohplan.json`, `${tmp}/c.zip`, '--strict'], o.value)).toBe(1)
    expect(o.err.some((l) => /^error: .*ID prefix “item\.” is shared/.test(l))).toBe(true)
  })
})
