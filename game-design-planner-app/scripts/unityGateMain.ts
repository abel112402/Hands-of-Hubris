import {
  BREAKS,
  GATE_USAGE,
  exitCodeOf,
  exportPlan,
  gateManifest,
  overallOf,
  packagesOf,
  parseNUnit,
  renderMarkdown,
  uncaret,
  unityOutcome,
  withBothInputs,
  withChangedValue,
  type EditorRun,
  type GateReport,
  type Step,
  type StepStatus,
} from './unityGate'
import type { NodeFs } from './nodeFolder'

/** Entry of the Unity gate (built by vite.gate.config.ts into dist-gate/unity-gate.mjs). See scripts/unityGate.ts. */
declare const process: { argv: string[]; exitCode?: number; cwd(): string; platform: string; env: Record<string, string | undefined>; stdout: { write(s: string): void } }

type Child = { on(e: 'close', f: (code: number | null) => void): void; on(e: 'error', f: (e: Error) => void): void }
const cp = (await import('node:child_process' as string)) as { spawn(cmd: string, args: string[], o: { stdio: string }): Child }
const fs = (await import('node:fs' as string)) as NodeFs & { copyFileSync(a: string, b: string): void; appendFileSync(p: string, t: string): void }
const os = (await import('node:os' as string)) as { homedir(): string }

const slash = (p: string) => p.replace(/\\/g, '/')
const say = (l: string) => process.stdout.write(l + '\n')
const read = (p: string) => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '')
const run = (cmd: string, args: string[]) =>
  new Promise<number | null>((resolve) => {
    if (!fs.existsSync(cmd)) return resolve(null)
    const c = cp.spawn(cmd, args, { stdio: 'ignore' })
    c.on('error', () => resolve(null))
    c.on('close', (code) => resolve(code))
  })

// ---- arguments ----
const args = process.argv.slice(2)
const opt = (name: string) => {
  const i = args.indexOf(name)
  return i >= 0 && args[i + 1] !== undefined ? uncaret(args[i + 1]) : undefined
}
const all = (name: string) => args.flatMap((a, i) => (a === name && args[i + 1] ? [uncaret(args[i + 1])] : []))
if (args.includes('--help')) {
  say(GATE_USAGE)
  process.exitCode = 0
} else {
  process.exitCode = await main()
}

async function main(): Promise<number> {
  const app = slash(process.cwd())
  const work = slash(opt('--work') ?? `${os.homedir()}/hoh-unity-gate`)
  const planFile = opt('--plan') ?? `${app}/tests/fixtures/reference-slice-3d.hohplan.json`
  const breaks = all('--break')
  for (const b of breaks) if (!BREAKS[b]) return bad(`Unknown --break ${b}; one of ${Object.keys(BREAKS).join(', ')}.`)
  const hub = 'C:/Program Files/Unity/Hub/Editor'
  const fromEnv = (v?: string) => (v ? v.split(';').map((x) => x.trim()).filter(Boolean) : [])
  const full = [...all('--editor'), ...fromEnv(process.env.HOH_GATE_EDITOR)]
  const compile = [...all('--compile'), ...fromEnv(process.env.HOH_GATE_COMPILE)]
  if (!full.length && !compile.length) {
    full.push(`${hub}/6000.0.40f1/Editor/Unity.exe`)
    compile.push(`${hub}/2022.3.21f1/Editor/Unity.exe`)
  }
  if (!fs.existsSync(planFile)) return bad(`No plan file ${planFile}.`)
  fs.mkdirSync(work, { recursive: true })
  const report: GateReport = { startedAt: new Date().toISOString(), plan: slash(planFile), breaks, editors: [], overall: 'blocked' }
  const planText = read(planFile)
  const change = breaks.length ? (p: Parameters<(typeof BREAKS)[string]['apply']>[0]) => breaks.forEach((b) => BREAKS[b].apply(p)) : null
  for (const b of breaks) say(`Broken on purpose: ${b} — ${BREAKS[b].what} Expected to fail: ${BREAKS[b].fails}.`)

  // The export, shared by every editor.
  const zip = `${work}/export.zip`
  const t0 = Date.now()
  const exported = await exportPlan(planText, change, zip, fs, `${work}/plan.hohplan.json`)
  const exportStep: Step = {
    id: 'export',
    title: 'Export (CLI, --strict)',
    status: exported.code === 0 ? 'passed' : 'failed',
    detail: exported.code === 0 ? exported.out.filter((l) => /files for unity|error\(s\)/.test(l)).join(' ') : exported.out.filter((l) => l.startsWith('error')).slice(0, 5).join(' | ') || `exit code ${exported.code}`,
    seconds: (Date.now() - t0) / 1000,
  }
  say(`[gate] ${exportStep.status}: ${exportStep.title} — ${exportStep.detail}`)

  for (const exe of [...full, ...compile]) {
    const mode = full.includes(exe) ? 'full' : 'compile'
    const version = /(\d{4}\.\d+\.\d+[abfp]\d+)/.exec(exe)?.[1] ?? 'unknown'
    const e: EditorRun = { editor: slash(exe), version, mode, project: `${work}/project-${version}`, packages: {}, steps: [{ ...exportStep }] }
    report.editors.push(e)
    if (!fs.existsSync(exe)) say(`[gate] No Unity editor at ${exe}: its steps are blocked.`)
    await gateEditor(e, { exe, app, work, zip, planText, change })
    e.packages = packagesOf(read(`${e.project}/Packages/packages-lock.json`), (path) => { try { return (JSON.parse(read(`${path}/package.json`)) as { version?: string }).version } catch { return undefined } })
  }
  report.overall = overallOf(report.editors)
  fs.writeFileSync(`${work}/gate-report.json`, JSON.stringify(report, null, 2) + '\n')
  const md = renderMarkdown(report)
  fs.writeFileSync(`${work}/gate-report.md`, md)
  say('')
  say(md)
  say(`Report: ${work}/gate-report.md`)
  return exitCodeOf(report.overall)
}

function bad(message: string): number {
  say(message)
  say(GATE_USAGE)
  return 2
}

type Ctx = { exe: string; app: string; work: string; zip: string; planText: string; change: ((p: never) => void) | null }

async function gateEditor(e: EditorRun, c: Ctx) {
  const P = e.project
  const logs = `${c.work}/logs-${e.version}`
  fs.mkdirSync(logs, { recursive: true })
  const has = (id: string) => e.steps.find((s) => s.id === id)?.status === 'passed'
  const step = async (id: string, title: string, needs: string[], body: () => Promise<{ status: StepStatus; detail: string; log?: string }>) => {
    const t = Date.now()
    let s: Step
    const missing = needs.filter((n) => !has(n))
    if (missing.length) {
      const blocked = missing.some((n) => e.steps.find((x) => x.id === n)?.status === 'blocked')
      s = { id, title, status: blocked ? 'blocked' : 'skipped', detail: `needs ${missing.join(', ')}`, seconds: 0 }
    } else {
      try {
        s = { id, title, ...(await body()), seconds: (Date.now() - t) / 1000 }
      } catch (err) {
        s = { id, title, status: 'failed', detail: String(err), seconds: (Date.now() - t) / 1000 }
      }
    }
    e.steps.push(s)
    say(`[gate ${e.version}] ${s.status}: ${title} — ${s.detail}`)
    return s
  }
  const unity = async (name: string, extra: string[], graphics = false) => {
    const log = `${logs}/${name}.log`
    if (fs.existsSync(log)) fs.rmSync(log, { force: true })
    const code = await run(c.exe, ['-batchmode', ...(graphics ? [] : ['-nographics']), '-projectPath', P, ...extra, '-logFile', log])
    const text = read(log)
    return { code, text, log, ...unityOutcome(code, text) }
  }
  const method = async (name: string, m: string, extra: string[] = []) => {
    const r = await unity(name, ['-executeMethod', m, ...extra])
    const said = r.text.split(/\r?\n/).filter((l) => /\[Planner (bridge|runtime)\]/.test(l)).map((l) => l.trim())
    return { status: r.status, detail: r.status === 'passed' ? said.slice(-2).join(' ') || r.detail : r.detail, log: r.log, text: r.text }
  }
  const tests = async (platform: 'EditMode' | 'PlayMode') => {
    const xml = `${logs}/${platform}.xml`
    if (fs.existsSync(xml)) fs.rmSync(xml, { force: true })
    const r = await unity(platform, ['-runTests', '-testPlatform', platform, '-testResults', xml], platform === 'PlayMode')
    const n = parseNUnit(read(xml))
    if (r.status === 'blocked') return { status: r.status, detail: r.detail, log: r.log }
    if (!n) return { status: 'failed' as const, detail: `no test results (${r.detail})`, log: r.log }
    const ok = n.failed === 0 && n.total > 0
    return { status: ok ? ('passed' as const) : ('failed' as const), detail: `${n.passed}/${n.total} passed, ${n.failed} failed, ${n.skipped} skipped${n.failedNames.length ? ': ' + n.failedNames.slice(0, 5).join(', ') : ''}`, log: r.log }
  }

  // 1. The project: created once (or with --fresh), with the planner's packages and the Input System active.
  await step('project', 'Unity project', [], async () => {
    if (args.includes('--fresh') && fs.existsSync(P)) fs.rmSync(P, { recursive: true, force: true })
    if (!fs.existsSync(`${P}/ProjectSettings/ProjectSettings.asset`)) {
      const code = await run(c.exe, ['-batchmode', '-nographics', '-quit', '-createProject', P, '-logFile', `${logs}/create.log`])
      const o = unityOutcome(code, read(`${logs}/create.log`))
      if (o.status !== 'passed') return o
    }
    const major = e.version.startsWith('6000') ? 6 : 2022
    fs.writeFileSync(`${P}/Packages/manifest.json`, gateManifest(read(`${P}/Packages/manifest.json`) || null, `${c.app}/engine-packages/unity/com.handsofhubris.planner-bridge`, `${c.app}/engine-packages/unity/com.handsofhubris.planner-runtime`, major))
    fs.writeFileSync(`${P}/ProjectSettings/ProjectSettings.asset`, withBothInputs(read(`${P}/ProjectSettings/ProjectSettings.asset`)))
    return { status: 'passed', detail: `${P} (packages for Unity ${major === 6 ? 6 : '2022.3'})` }
  })
  // 2–4. Prepare (URP), import (-ignorecompilererrors: the previous export's code may not match the runtime), validate (compiles).
  await step('prepare', 'Prepare (URP asset, input handling)', ['project'], () => method('prepare', 'HoHPlanner.Bridge.Editor.PlannerCIProject.Prepare', ['-ignorecompilererrors']))
  await step('import', 'Import the export', ['export', 'prepare'], () => method('import', 'HoHPlanner.Bridge.Editor.PlannerCI.Import', ['-hohBundle', c.zip, '-ignorecompilererrors']))
  await step('validate', 'Compile and validate', ['import'], () => method('validate', 'HoHPlanner.Bridge.Editor.PlannerCI.Validate'))
  if (e.mode === 'compile') {
    await step('editmode', 'EditMode tests', ['validate'], () => tests('EditMode'))
    return
  }
  // 5–9. The prototype scene, Build Settings, tests.
  await step('scene', 'Build the prototype scene', ['validate'], () => method('scene', 'HoHPlanner.Bridge.Editor.PlannerPrototypeScene.CI'))
  await step('buildScenes', 'Build Settings scenes', ['scene'], () => method('buildScenes', 'HoHPlanner.Bridge.Editor.PlannerCI.BuildScenes'))
  await step('editmode', 'EditMode tests', ['validate'], () => tests('EditMode'))
  await step('playmode', 'PlayMode tests (generated scene tests included)', ['scene'], () => tests('PlayMode'))
  // 10–11. A player for the plan's platform, and its self-test.
  const platform = /"platform":\s*"(\w+)"/.exec(c.planText)?.[1] ?? 'Windows'
  const target = ({ Windows: ['StandaloneWindows64', 'Game.exe'], macOS: ['StandaloneOSX', 'Game.app'], Linux: ['StandaloneLinux64', 'Game.x86_64'] } as Record<string, [string, string]>)[platform]
  const exePath = target ? `${c.work}/build-${e.version}/${target[1]}` : ''
  await step('player', `Player build (${target?.[0] ?? platform})`, ['buildScenes'], async () =>
    target ? method('player', 'HoHPlanner.Bridge.Editor.PlannerCIProject.BuildPlayer', ['-hohBuildPath', exePath, '-hohBuildTarget', target[0]]) : { status: 'skipped', detail: `no standalone build target for ${platform}` },
  )
  const selfReport = `${logs}/selftest.json`
  await step('selftest', 'Player self-test (play, pick up, quest, save, fresh game, load)', ['player'], async () => {
    if (!(platform === 'Windows' && process.platform === 'win32')) return { status: 'skipped', detail: `a ${platform} player does not run on this machine` }
    if (fs.existsSync(selfReport)) fs.rmSync(selfReport, { force: true })
    const code = await run(exePath, ['-batchmode', '-nographics', '-hohSelfTest', '-hohSelfTestReport', selfReport, '-logFile', `${logs}/selftest.log`])
    const r = read(selfReport)
    if (!r) return { status: 'failed', detail: `no self-test report (exit code ${code})`, log: `${logs}/selftest.log` }
    const j = JSON.parse(r) as { passed: boolean; checks: { name: string; passed: boolean; detail: string }[] }
    return { status: j.passed && code === 0 ? 'passed' : 'failed', detail: j.checks.map((x) => `${x.passed ? '✓' : '✗'} ${x.name}`).join('; '), log: `${logs}/selftest.log` }
  })
  // 12. Save/load: the generated PlayMode test and the player self-test.
  await step('saveload', 'Save and load into a fresh game', ['playmode'], async () => {
    const n = parseNUnit(read(`${logs}/PlayMode.xml`))
    const inEditor = n?.passedNames.find((x) => x.includes('TheSliceIsTheSameAfterSavingAndLoadingIntoAFreshGame'))
    const self = read(selfReport) ? (JSON.parse(read(selfReport)) as { checks: { name: string; passed: boolean }[] }).checks.find((x) => x.name.startsWith('save and load')) : undefined
    const ok = !!inEditor && (self ? self.passed : true)
    return { status: ok ? 'passed' : 'failed', detail: `PlayMode ${inEditor ? 'passed' : 'not passed'}; player ${self ? (self.passed ? 'passed' : 'failed') : 'not run'}` }
  })
  // 13. Unchanged re-import: nothing written, the scene up to date.
  await step('reimport', 'Unchanged re-import (no writes, scene up to date)', ['scene'], async () => {
    const imp = await method('reimport', 'HoHPlanner.Bridge.Editor.PlannerCI.Import', ['-hohBundle', c.zip, '-ignorecompilererrors'])
    const sc = await method('reimport-scene', 'HoHPlanner.Bridge.Editor.PlannerPrototypeScene.CI')
    const zero = /Files: 0 written/.test(imp.text)
    const upToDate = /is up to date/.test(sc.text)
    return { status: imp.status === 'passed' && sc.status === 'passed' && zero && upToDate ? 'passed' : 'failed', detail: `${zero ? '0 files written' : 'files were written'}; scene ${upToDate ? 'up to date' : 'rebuilt'}` }
  })
  // 14. A value changed in the plan reaches the code and the scene; your files and the GUIDs stay; then back.
  await step('change', 'Value change in the plan; your files and GUIDs kept', ['scene'], async () => {
    const own = `${P}/Assets/HoHPlanner/Unity/Scripts/Classes/GateOwnFile.cs`
    const ownText = '// Written by the Unity gate: a file of yours. Imports must keep it as it is.\n'
    fs.mkdirSync(`${P}/Assets/HoHPlanner/Unity/Scripts/Classes`, { recursive: true })
    fs.writeFileSync(own, ownText)
    const root = `${P}/Assets/HoHPlanner`
    const guid = (f: string) => /guid: (\w+)/.exec(read(`${f}.meta`))?.[1] ?? '?'
    const scene = fs.readdirSync(`${root}/Prototype`).find((f) => f.endsWith('.unity'))
    const watch = [`${root}/Prototype/${scene}`, `${root}/Prototype/Player.prefab`]
    const before = watch.map(guid)
    const prefab = read(`${root}/Prototype/Player.prefab`)
    const zip2 = `${c.work}/export-changed.zip`
    let expect = ''
    const ex = await exportPlan(c.planText, (p) => {
      c.change?.(p as never)
      expect = withChangedValue(p).expect
    }, zip2, fs, `${c.work}/plan-changed.hohplan.json`)
    if (ex.code !== 0) return { status: 'failed', detail: 'the changed plan did not export' }
    const imp = await method('change-import', 'HoHPlanner.Bridge.Editor.PlannerCI.Import', ['-hohBundle', zip2, '-ignorecompilererrors'])
    const val = await method('change-validate', 'HoHPlanner.Bridge.Editor.PlannerCI.Validate')
    const sc = await method('change-scene', 'HoHPlanner.Bridge.Editor.PlannerPrototypeScene.CI')
    const code = read(`${root}/Unity/Scripts/Generated/Gameplay/PlannerGameplay.cs`)
    const speed = /MoveSpeed = ([\d.]+)f;/.exec(expect)?.[1] ?? '?'
    const sceneText = read(watch[0])
    const checks: [string, boolean][] = [
      ['import, compile, scene', imp.status === 'passed' && val.status === 'passed' && sc.status === 'passed' && /built/.test(sc.text)],
      [`code has ${expect}`, code.includes(expect)],
      [`scene has walk speed ${speed}`, new RegExp(`propertyPath: MoveSpeed\\s+value: ${speed.replace('.', '\\.')}`).test(sceneText) || new RegExp(`MoveSpeed: ${speed.replace('.', '\\.')}`).test(sceneText)],
      ['your file kept', read(own) === ownText],
      ['Player.prefab (yours) unchanged', read(`${root}/Prototype/Player.prefab`) === prefab],
      ['scene and prefab GUIDs kept', watch.map(guid).join() === before.join()],
    ]
    // Back to the plan as it was.
    const back = await method('change-back', 'HoHPlanner.Bridge.Editor.PlannerCI.Import', ['-hohBundle', c.zip, '-ignorecompilererrors'])
    const backVal = await method('change-back-validate', 'HoHPlanner.Bridge.Editor.PlannerCI.Validate')
    const backScene = await method('change-back-scene', 'HoHPlanner.Bridge.Editor.PlannerPrototypeScene.CI')
    checks.push(['back to the plan', back.status === 'passed' && backVal.status === 'passed' && backScene.status === 'passed' && !read(`${root}/Unity/Scripts/Generated/Gameplay/PlannerGameplay.cs`).includes(expect)])
    fs.rmSync(own, { force: true })
    fs.rmSync(`${own}.meta`, { force: true })
    return { status: checks.every(([, ok]) => ok) ? 'passed' : 'failed', detail: checks.map(([n, ok]) => `${ok ? '✓' : '✗'} ${n}`).join('; ') }
  })
}
