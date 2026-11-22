import { describe, expect, it } from 'vitest'
import { buildReferenceSlice } from './fixtures/referenceSlice3d'
import { buildBundle } from '../src/core/engine/bundle'
import { BREAKS, uncaret, exitCodeOf, gateManifest, overallOf, packagesOf, parseNUnit, renderMarkdown, unityOutcome, withBothInputs, withChangedValue, type EditorRun, type Step } from '../scripts/unityGate'

/** plans/UNITY_PLAYABLE_GAME_GENERATION_PLAN.md, phase 13: the parts of the Unity gate that need no Unity. */
const step = (id: string, status: Step['status']): Step => ({ id, title: id, status, detail: '', seconds: 0 })
const editor = (...steps: Step[]): EditorRun => ({ editor: 'Unity.exe', version: '6000.0.40f1', mode: 'full', project: 'p', packages: {}, steps })

describe('reading Unity results', () => {
  it('reads an NUnit result file', () => {
    const xml = `<?xml version="1.0"?><test-run id="2" testcasecount="3" result="Failed(Child)" total="3" passed="1" failed="1" inconclusive="0" skipped="1">
      <test-case id="1" name="A" fullname="Ns.T.A" result="Passed" /><test-case id="2" name="B" fullname="Ns.T.B" result="Failed" /><test-case id="3" name="C" fullname="Ns.T.C" result="Skipped" /></test-run>`
    expect(parseNUnit(xml)).toEqual({ total: 3, passed: 1, failed: 1, skipped: 1, failedNames: ['Ns.T.B'], passedNames: ['Ns.T.A'] })
    expect(parseNUnit('')).toBeNull()
  })

  it('tells a licence problem (blocked) from a failure and a pass', () => {
    expect(unityOutcome(null, '').status).toBe('blocked')
    expect(unityOutcome(1, 'No valid Unity Editor license found. Please activate your license.').status).toBe('blocked')
    expect(unityOutcome(0, 'all fine')).toEqual({ status: 'passed', detail: 'exit code 0' })
    const failed = unityOutcome(1, 'Assets/X.cs(1,1): error CS0246: The type or namespace name …\nScripts have compiler errors.')
    expect(failed.status).toBe('failed')
    expect(failed.detail).toContain('error CS0246')
  })

  it('undoes the ^ escapes cmd.exe adds to arguments (npm on Windows)', () => {
    expect(uncaret('^C:/Program^ Files/Unity/Editor/Unity.exe^')).toBe('C:/Program Files/Unity/Editor/Unity.exe')
    expect(uncaret('C:/UnityProjects/gate')).toBe('C:/UnityProjects/gate')
  })

  it('lists the planner’s and the profile’s package versions', () => {
    const lock = JSON.stringify({ dependencies: { 'com.handsofhubris.planner-runtime': { version: 'file:../r' }, 'com.unity.inputsystem': { version: '1.13.0' }, 'com.unity.ugui': { version: '2.0.0' } } })
    expect(packagesOf(lock, (path) => (path === '../r' ? '0.8.0' : undefined))).toEqual({ 'com.handsofhubris.planner-runtime': '0.8.0 (local)', 'com.unity.inputsystem': '1.13.0' })
    expect(packagesOf('not json')).toEqual({})
  })
})

describe('the verdict', () => {
  it('is blocked when a step is blocked, never passed without Unity', () => {
    expect(overallOf([editor(step('export', 'passed'), step('import', 'blocked'))])).toBe('blocked')
    expect(overallOf([])).toBe('blocked')
    expect(exitCodeOf('blocked')).toBe(2)
  })

  it('fails on any failed step and passes only when everything passed or was not applicable', () => {
    expect(overallOf([editor(step('a', 'passed'), step('b', 'failed'), step('c', 'skipped'))])).toBe('failed')
    expect(overallOf([editor(step('a', 'passed'), step('selftest', 'skipped'))])).toBe('passed')
    expect([exitCodeOf('passed'), exitCodeOf('failed')]).toEqual([0, 1])
  })

  it('is written as Markdown with each step', () => {
    const md = renderMarkdown({ startedAt: 't', plan: 'plan.json', breaks: ['no-interact'], editors: [{ ...editor(step('import', 'failed')), packages: { 'com.unity.inputsystem': '1.13.0' } }], overall: 'failed' })
    expect(md).toContain('# Unity gate: FAILED')
    expect(md).toContain('broken on purpose:** no-interact')
    expect(md).toContain('| import | ❌ failed |')
    expect(md).toContain('com.unity.inputsystem 1.13.0')
  })
})

describe('the gate project', () => {
  it('gets the planner packages from this repository and the profile’s packages', () => {
    const m = JSON.parse(gateManifest(JSON.stringify({ dependencies: { 'com.unity.ugui': '2.0.0' } }), 'C:\\repo\\bridge', 'C:\\repo\\runtime', 6))
    expect(m.dependencies).toMatchObject({ 'com.unity.ugui': '2.0.0', 'com.handsofhubris.planner-bridge': 'file:C:/repo/bridge', 'com.handsofhubris.planner-runtime': 'file:C:/repo/runtime', 'com.unity.inputsystem': '1.13.0', 'com.unity.render-pipelines.universal': '17.0.4' })
    expect(m.testables).toEqual(['com.handsofhubris.planner-bridge', 'com.handsofhubris.planner-runtime'])
    expect(JSON.parse(gateManifest(null, 'b', 'r', 2022)).dependencies['com.unity.render-pipelines.universal']).toBe('14.0.11')
  })

  it('turns the Input System on', () => {
    expect(withBothInputs('  m_X: 1\n  activeInputHandler: 0\n')).toContain('activeInputHandler: 2')
  })
})

describe('breaks and changes of the reference', () => {
  const errors = (apply: (p: ReturnType<typeof buildReferenceSlice>) => void) => {
    const p = buildReferenceSlice()
    apply(p)
    return buildBundle(p, 'unity', '2026-01-01T00:00:00.000Z').issues.filter((i) => i.level === 'error')
  }

  it('the reference itself exports without errors', () => {
    expect(errors(() => {})).toEqual([])
  })

  it('no-interact, missing-scene and ranged-enemy stop the strict export', () => {
    expect(errors(BREAKS['no-interact'].apply).length).toBeGreaterThan(0)
    expect(errors(BREAKS['missing-scene'].apply).map((i) => i.field)).toContain('gameplay.unknownScene')
    expect(errors(BREAKS['ranged-enemy'].apply).map((i) => i.field)).toContain('gameplay.attackUnsupported')
  })

  it('quest-unreachable exports cleanly, so only the Unity tests can catch it', () => {
    expect(errors(BREAKS['quest-unreachable'].apply)).toEqual([])
    const p = buildReferenceSlice()
    BREAKS['quest-unreachable'].apply(p)
    const config = buildBundle(p, 'unity', '2026-01-01T00:00:00.000Z').files.find((f) => f.path.endsWith('PlannerGameplay.cs'))!.content
    expect(config).toMatch(/new \(string, int\)\[\] \{ \("refItemKey", 2\) \}/)
  })

  it('the value change raises the walk speed by 1 m/s and says what the code must contain', () => {
    const { project, expect: text } = withChangedValue(buildReferenceSlice())
    expect(text).toBe('MoveSpeed = 5.5f;')
    expect(buildBundle(project, 'unity', '2026-01-01T00:00:00.000Z').files.find((f) => f.path.endsWith('PlannerGameplay.cs'))!.content).toContain(text)
  })
})
