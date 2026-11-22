import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import '../src/core/i18n'
import { App } from '../src/App'
import { useStore } from '../src/core/store/store'
import { deserializeProject } from '../src/core/persistence/serialize'
import { buildIR, IR_VERSION } from '../src/core/engine/ir'
import { runChecks } from '../src/core/engine/irExtras'
import { unity } from '../src/core/engine/adapters/unity'
import { evaluate } from '../src/core/formula'

/** Plan § 7, first round: I6 data checks (planner + Unity tests), I5 debug console, I2 the palette for placeholders. */
const fs: { readFileSync: (p: string, e: string) => string } = await import('node:fs' as string)
const cinderholm = () => deserializeProject(fs.readFileSync('examples/cinderholm.hohplan.json', 'utf8')).project

afterEach(cleanup)

describe('data checks (I6)', () => {
  it('runs the Balance plan checks on the plan’s records', () => {
    const { ir } = buildIR(cinderholm())
    expect(ir.v).toBe(IR_VERSION)
    const results = new Map(runChecks(ir.checks, ir.records).map((r) => [r.check.name, r]))
    expect(results.get('Enemy toughness')).toMatchObject({ checked: 24, outside: [] })
    // The example's Iron longsword (value 1100) is above the planned Item value range, so the check reports it.
    expect(results.get('Item value')).toMatchObject({ checked: 16, outside: [{ key: 'item.iron_longsword', name: 'Iron longsword', value: 1100 }] })
    const hits = results.get('Hits to kill with a 40-damage weapon')!
    expect(hits.check.level).toBe('warning')
    expect(hits.outside).toEqual([
      { key: 'enemy.frostpeak_warden', name: 'Frostpeak warden', value: 31 },
      { key: 'enemy.cinder_spire_warden', name: 'Cinder Spire warden', value: 50 },
    ])
  })

  it('leaves out a check it cannot run, with a reason', () => {
    const p = cinderholm()
    const checks = p.documents['qa.balance'].data.checks
    checks.push({ id: 'b1', name: 'Bad field', schema: checks[0].schema, expr: 'name * 2', min: 0, max: 1 }, { id: 'b2', name: 'No range', schema: checks[0].schema, expr: 'damage' })
    const { ir, issues } = buildIR(p)
    expect(ir.checks.find((c) => c.id === 'b1')!.error).toBe('“name” is not a number field of Enemy')
    expect(ir.checks.find((c) => c.id === 'b2')!.error).toBe('no range (Acceptable from / to)')
    expect(issues.filter((i) => i.code === 'check.invalid')).toHaveLength(2)
  })

  it('writes an EditMode test per check that computes what the planner computes', () => {
    const { ir } = buildIR(cinderholm())
    const files = new Map(unity.emit(ir).map((f) => [f.path, f.content]))
    const asmdef = JSON.parse(files.get('Tests/Editor/CinderholmExample.PlannerTests.asmdef')!)
    expect(asmdef).toMatchObject({ references: ['CinderholmExample', 'UnityEngine.TestRunner', 'UnityEditor.TestRunner'], includePlatforms: ['Editor'], defineConstraints: ['UNITY_INCLUDE_TESTS'] })
    const code = files.get('Tests/Editor/PlannerDataChecks.cs')!
    expect(code).toContain('public void EnemyToughness()')
    expect(code).toContain('var v = (float)a.health / (float)a.damage;')
    expect(code).toContain('if (!(float.IsFinite(v) && v >= 5f && v <= 20f)) outside.Add($"{a.id} = {v}");')
    // A warning never fails the run: Unity’s NUnit has no Assert.Warn.
    expect(code).toContain('if (outside.Count > 0) { Debug.LogWarning(message); Assert.Pass(message); }')
    expect(code).not.toContain('Assert.Warn')
    const v = new Function('a', 'Mathf', `return ${/var v = (Mathf\.Ceil\(\(float\)a\.health \/ 40f\));/.exec(code)![1].replace(/\(float\)/g, '').replace(/(\d)f\b/g, '$1')}`)({ health: 1229 }, { Ceil: Math.ceil })
    expect(v).toBe(evaluate('ceil(health / 40)', { health: 1229 }))
  })
})

describe('debug console (I5)', () => {
  const { ir } = buildIR(cinderholm())

  it('takes its commands and accepted IDs from the plan', () => {
    expect(ir.cheats.map((c) => c.command)).toEqual(['give', 'quest.start', 'quest.complete', 'time.set', 'season.set', 'weather.set', 'faction.rep', 'difficulty.set'])
    const give = ir.cheats[0]
    expect(give.args[0].values!.map((v) => v.id)).toContain('item.iron_longsword')
    expect(give.args[1]).toEqual({ name: 'count', kind: 'int', optional: true })
    expect(ir.cheats.find((c) => c.command === 'difficulty.set')!.args[0].values!.map((v) => v.id)).toEqual(['easy', 'medium', 'hard'])
  })

  it('leaves out a command with nothing to choose from', () => {
    const p = cinderholm()
    p.documents['design.timeWeather'].data.weather = []
    expect(buildIR(p).ir.cheats.some((c) => c.command === 'weather.set')).toBe(false)
  })

  it('writes the console with a handler interface for the game', () => {
    const code = unity.emit(ir).find((f) => f.path === 'Scripts/Generated/PlannerConsole.cs')!.content
    expect(code).toContain('public interface IPlannerCheats')
    expect(code).toContain('void Give(string item, int count);')
    expect(code).toContain('void TimeSet(int hour, int minute);')
    expect(code).toContain('void FactionRep(string faction, int value);')
    expect(code).toContain('["item"] = new[] { "item.plank",')
    const overlay = unity.emit(ir).find((f) => f.path === 'Scripts/Generated/PlannerConsoleOverlay.cs')!.content
    expect(overlay).toContain('#if (UNITY_EDITOR || DEVELOPMENT_BUILD) && !HOH_NO_PLANNER_CONSOLE')
    expect(overlay).toContain('public sealed class PlannerConsoleOverlay : MonoBehaviour')
  })
})

describe('placeholder palette (I2)', () => {
  it('takes the global palette of Art Direction first', () => {
    const { ir } = buildIR(cinderholm())
    expect(ir.art.palette.slice(0, 4)).toEqual(['#2b2135', '#f2a65a', '#5ad1d1', '#e8dcc0'])
    expect(ir.art.palette.every((c) => /^#[0-9a-f]{6}$/.test(c))).toBe(true)
  })
})

describe('Balance plan › Data checks', () => {
  it('shows each check’s result and the records outside the range', async () => {
    useStore.getState().loadProject(cinderholm(), 'x')
    window.location.hash = '#/doc/qa.balance?s=checks'
    render(<App />)
    const table = await screen.findByRole('table', { name: 'Data check results' })
    const row = (name: string) => within(table).getByRole('button', { name }).closest('tr')!
    expect(row('Enemy toughness').textContent).toMatch(/24 records in range/)
    expect(row('Hits to kill with a 40-damage weapon').textContent).toMatch(/2 of 24 records outside:.*enemy\.frostpeak_warden = 31/)
    fireEvent.click(within(table).getByRole('button', { name: 'Item value' }))
  })
})
