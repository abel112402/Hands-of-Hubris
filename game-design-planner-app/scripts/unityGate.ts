import type { Project } from '../src/core/model/types'
import { deserializeProject, serializeProject } from '../src/core/persistence/serialize'
import { runCli } from './engineCli'
import type { NodeFs } from './nodeFolder'

/**
 * The Unity gate (plans/UNITY_PLAYABLE_GAME_GENERATION_PLAN.md, phase 13): the reference slice exported with the CLI,
 * imported into a Unity project per editor, compiled, validated, its prototype scene built, EditMode and PlayMode tests
 * run, a player built and self-tested, and the re-import, value-change, asset-keeping and save/load checks done — with a
 * report of every step, the Unity version and the packages. A step that cannot run because Unity or its licence is
 * missing is “blocked”, never “passed”. Breaks (--break) change the plan on purpose, to show the gate fails.
 *
 *   npm run gate:unity -- [--work <dir>] [--editor <Unity.exe>]… [--only full|compile] [--break <kind>] [--plan <file>]
 *
 * Exit code: 0 passed, 1 a check failed, 2 blocked (no Unity, no licence) or bad arguments.
 */

export const GATE_USAGE = `Usage: npm run gate:unity -- [options]

  --work <dir>           where the Unity projects, exports, builds and reports go (default: ~/hoh-unity-gate)
  --editor <Unity.exe>   a Unity editor to run; repeat for more (or HOH_GATE_EDITOR, ; between paths). Default: the Hub's ${'6000.0.40f1'} (full) and 2022.3.21f1 (compile)
  --compile <Unity.exe>  an editor that only imports, compiles and runs EditMode tests (the LTS floor; or HOH_GATE_COMPILE)
  --plan <file>          the plan (default: tests/fixtures/reference-slice-3d.hohplan.json)
  --break <kind>         change the plan on purpose: ${'quest-unreachable | no-interact | missing-scene'}
  --fresh                make the Unity projects again`

export type StepStatus = 'passed' | 'failed' | 'blocked' | 'skipped'
export type Step = { id: string; title: string; status: StepStatus; detail: string; seconds: number; log?: string }
export type EditorRun = { editor: string; version: string; mode: 'full' | 'compile'; project: string; packages: Record<string, string>; steps: Step[] }
export type GateReport = { startedAt: string; plan: string; breaks: string[]; editors: EditorRun[]; overall: 'passed' | 'failed' | 'blocked' }

// ---- pure parts (tested in tests/unityGate.test.ts) ----

export type NUnitResult = { total: number; passed: number; failed: number; skipped: number; failedNames: string[]; passedNames: string[] }

/** The counts and failed test names of an NUnit 3 result file (Unity's -testResults). */
export function parseNUnit(xml: string): NUnitResult | null {
  const run = /<test-run\b[^>]*>/.exec(xml)?.[0]
  if (!run) return null
  const attr = (tag: string, name: string) => Number(new RegExp(`\\b${name}="(\\d+)"`).exec(tag)?.[1] ?? 0)
  const cases = [...xml.matchAll(/<test-case\b[^>]*>/g)].map((m) => m[0])
  const names = (result: string) => cases.filter((c) => new RegExp(`\\bresult="${result}"`).test(c)).map((c) => /\bfullname="([^"]*)"/.exec(c)?.[1] ?? '?')
  return { total: attr(run, 'total'), passed: attr(run, 'passed'), failed: attr(run, 'failed'), skipped: attr(run, 'skipped'), failedNames: names('Failed'), passedNames: names('Passed') }
}

const LICENSE = /No valid Unity Editor license|License is not active|Failed to activate|com\.unity\.editor\.headless|Unity has not been activated|license.*(expired|invalid)/i
const COMPILE = /Scripts have compiler errors|error CS\d{4}/

/** An argument as cmd.exe passed it (npm runs scripts through cmd on Windows, which may add ^ escapes): without them. */
export const uncaret = (arg: string) => arg.replace(/\^(.)/g, '$1').replace(/\^$/, '')

/** What a Unity batch run means for the gate: a licence problem blocks, compile errors and a non-zero exit fail. */
export function unityOutcome(code: number | null, log: string): { status: StepStatus; detail: string } {
  if (code === null) return { status: 'blocked', detail: 'Unity could not be started (no editor at the given path?).' }
  if (LICENSE.test(log)) return { status: 'blocked', detail: 'Unity has no valid licence on this machine (activate it; the gate does not pass without Unity).' }
  if (code !== 0) {
    const errors = [...new Set(log.split(/\r?\n/).filter((l) => COMPILE.test(l) || /\[Planner (bridge|runtime|self-test)\].*(error|FAIL|stopped|cannot)/i.test(l)).map((l) => l.trim()))].slice(0, 6)
    return { status: 'failed', detail: `exit code ${code}${errors.length ? ': ' + errors.join(' | ') : ''}` }
  }
  return { status: 'passed', detail: 'exit code 0' }
}

/** The versions of the packages a project resolved (Packages/packages-lock.json), the planner's and Unity's own; a local (file:) package by its package.json version. */
export function packagesOf(lockJson: string, localVersion: (path: string) => string | undefined = () => undefined): Record<string, string> {
  try {
    const deps = (JSON.parse(lockJson) as { dependencies?: Record<string, { version?: string }> }).dependencies ?? {}
    const keep = (n: string) => n.startsWith('com.handsofhubris.') || ['com.unity.inputsystem', 'com.unity.render-pipelines.universal', 'com.unity.test-framework', 'com.unity.nuget.newtonsoft-json'].includes(n)
    return Object.fromEntries(Object.entries(deps).filter(([n]) => keep(n)).map(([n, d]) => { const v = String(d.version ?? '?'); return [n, v.startsWith('file:') ? `${localVersion(v.slice(5)) ?? '?'} (local)` : v] }).sort(([a], [b]) => a.localeCompare(b)))
  } catch {
    return {}
  }
}

/** Overall: any blocked step blocks the gate (it never passes without Unity); else any failure fails it. */
export function overallOf(editors: EditorRun[]): GateReport['overall'] {
  const steps = editors.flatMap((e) => e.steps)
  if (!steps.length || steps.some((s) => s.status === 'blocked')) return 'blocked'
  return steps.some((s) => s.status === 'failed') ? 'failed' : 'passed'
}

export const exitCodeOf = (overall: GateReport['overall']) => (overall === 'passed' ? 0 : overall === 'failed' ? 1 : 2)

/** Changes that break the reference on purpose: each must fail the check it concerns. */
export const BREAKS: Record<string, { what: string; fails: string; apply: (p: Project) => void }> = {
  'quest-unreachable': {
    what: 'The quest wants 2 Brass Keys, but only 1 lies on the map.',
    fails: 'PlayMode (the quest cannot complete by playing)',
    apply: (p) => {
      const quests = p.documents['design.story'].data.quests as Record<string, unknown>[]
      const q = quests.find((x) => x.collectItems && typeof x.collectItems === 'object')!
      q.collectItems = Object.fromEntries(Object.keys(q.collectItems as object).map((k) => [k, 2]))
    },
  },
  'no-interact': {
    what: 'No control has the Runtime action Interact.',
    fails: 'export (--strict: interaction needs an Interact control)',
    apply: (p) => {
      for (const c of p.documents['design.ui'].data.controls as Record<string, unknown>[]) if (c.drives === 'Interact') delete c.drives
    },
  },
  'missing-scene': {
    what: 'The Prototype scene points at a scene that is not planned.',
    fails: 'export (--strict: the prototype scene is unknown)',
    apply: (p) => {
      ;(p.documents['technical.architecture'].data.prototype as Record<string, unknown>).scene = 'noSuchScene'
    },
  },
}

/** The plan with a planner-side value changed, for the value-change check (player walk speed + 1 m/s). */
export function withChangedValue(p: Project): { project: Project; expect: string } {
  const controls = p.documents['design.player'].data.controls as Record<string, unknown>
  const speed = (typeof controls.moveSpeed === 'number' ? controls.moveSpeed : 4) + 1
  controls.moveSpeed = speed
  return { project: p, expect: `MoveSpeed = ${Number.isInteger(speed) ? speed.toFixed(1) : String(speed)}f;` }
}

/** The report as Markdown, for a CI summary or a pull request. */
export function renderMarkdown(r: GateReport): string {
  const icon = (s: StepStatus) => ({ passed: '✅', failed: '❌', blocked: '⛔', skipped: '➖' })[s]
  const lines = [`# Unity gate: ${r.overall.toUpperCase()}`, '', `Plan: \`${r.plan}\` · started ${r.startedAt}${r.breaks.length ? ` · **broken on purpose:** ${r.breaks.join(', ')}` : ''}`, '']
  for (const e of r.editors) {
    lines.push(`## Unity ${e.version} (${e.mode})`, '', `Project: \`${e.project}\``, '')
    const pk = Object.entries(e.packages)
    if (pk.length) lines.push('Packages: ' + pk.map(([n, v]) => `${n} ${v}`).join(', '), '')
    lines.push('| Step | Result | Detail | s |', '|---|---|---|---|')
    for (const s of e.steps) lines.push(`| ${s.title} | ${icon(s.status)} ${s.status} | ${s.detail.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')} | ${s.seconds.toFixed(0)} |`)
    lines.push('')
  }
  return lines.join('\n')
}

/** Packages/manifest.json for a gate project: the planner's bridge and runtime from this repository, and the profile's packages. */
export function gateManifest(existing: string | null, bridge: string, runtime: string, major: 6 | 2022): string {
  const m = existing ? (JSON.parse(existing) as { dependencies?: Record<string, string>; testables?: string[] }) : {}
  const deps = { ...(m.dependencies ?? {}) }
  const versions = major === 6 ? { input: '1.13.0', urp: '17.0.4', tests: '1.4.6' } : { input: '1.7.0', urp: '14.0.11', tests: '1.1.33' }
  deps['com.handsofhubris.planner-bridge'] = `file:${bridge.replace(/\\/g, '/')}`
  deps['com.handsofhubris.planner-runtime'] = `file:${runtime.replace(/\\/g, '/')}`
  deps['com.unity.inputsystem'] = versions.input
  deps['com.unity.render-pipelines.universal'] = versions.urp
  deps['com.unity.test-framework'] = versions.tests
  const testables = [...new Set([...(m.testables ?? []), 'com.handsofhubris.planner-bridge', 'com.handsofhubris.planner-runtime'])]
  return JSON.stringify({ ...m, dependencies: deps, testables }, null, 2) + '\n'
}

/** Active Input Handling “Both” in ProjectSettings.asset (the Input System needs it; Unity reads it at start). */
export const withBothInputs = (projectSettings: string) => projectSettings.replace(/activeInputHandler: \d/, 'activeInputHandler: 2')

/** Exports the plan (optionally changed) with the planner's CLI into a zip; returns the CLI's exit code and output. */
export async function exportPlan(planText: string, change: ((p: Project) => void) | null, zip: string, fs: NodeFs, file: string): Promise<{ code: number; out: string[] }> {
  const { project } = deserializeProject(planText)
  if (change) change(project)
  fs.writeFileSync(file, serializeProject(project))
  const out: string[] = []
  const code = await runCli([file, zip, '--engine', 'unity', '--strict', '--exported-at', '2026-01-01T00:00:00.000Z'], { fs, log: (l) => out.push(l), error: (l) => out.push(l) })
  return { code, out }
}
