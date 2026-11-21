import { describe, expect, it } from 'vitest'
import { deserializeProject } from '../src/core/persistence/serialize'
import { buildIR } from '../src/core/engine/ir'
import { unity } from '../src/core/engine/adapters/unity'
import { controlPath } from '../src/core/engine/adapters/unityScaffold'

/** Plan § 7, third round: I13 input map, I8 screens and navigation, I4 state machines. */
const fs: { readFileSync: (p: string, e: string) => string } = await import('node:fs' as string)
const cinderholm = () => deserializeProject(fs.readFileSync('examples/cinderholm.hohplan.json', 'utf8')).project
const { ir } = buildIR(cinderholm())
const files = new Map(unity.emit(ir).map((f) => [f.path, f.content]))

describe('input map (I13)', () => {
  it('takes the controls with their keys and buttons', () => {
    expect(ir.input.actions).toHaveLength(13)
    expect(ir.input.actions.find((a) => a.name === 'Sprint')).toMatchObject({ category: 'Movement', key: 'Shift', gamepad: 'LS', mode: 'Hold' })
    expect(ir.input.actions.find((a) => a.name === 'Close window')!.contexts).toEqual(['oyDUjktg'])
  })

  it('knows the usual keys, mouse buttons and gamepad buttons', () => {
    expect(controlPath('key', 'W')).toBe('<Keyboard>/w')
    expect(controlPath('key', 'Esc')).toBe('<Keyboard>/escape')
    expect(controlPath('key', 'F5')).toBe('<Keyboard>/f5')
    expect(controlPath('mouse', 'LMB')).toBe('<Mouse>/leftButton')
    expect(controlPath('gamepad', 'A')).toBe('<Gamepad>/buttonSouth')
    expect(controlPath('gamepad', 'Select')).toBe('<Gamepad>/select')
    expect(controlPath('key', 'Hyper')).toBeUndefined()
  })

  it('writes an Input System asset with one map per category and stable IDs', () => {
    const asset = JSON.parse(files.get('Input/CinderholmExample.inputactions')!)
    expect(asset.maps.map((m: { name: string }) => m.name)).toEqual(['Movement', 'Building', 'Menus', 'System', 'Combat'])
    const movement = asset.maps[0]
    expect(movement.actions.map((a: { name: string }) => a.name)).toContain('Jump')
    expect(movement.bindings.filter((b: { action: string }) => b.action === 'Jump').map((b: { path: string; groups: string }) => [b.path, b.groups])).toEqual([
      ['<Keyboard>/space', 'Keyboard&Mouse'],
      ['<Gamepad>/buttonSouth', 'Gamepad'],
    ])
    expect(JSON.parse(unity.emit(buildIR(cinderholm()).ir).find((f) => f.path.endsWith('.inputactions'))!.content)).toEqual(asset)
    const ids = [...JSON.stringify(asset).matchAll(/"id": ?"([0-9a-f-]{36})"/g)].map((m) => m[1])
    expect(new Set(ids).size).toBe(ids.length)
    const code = files.get('Scripts/Generated/Input/PlannerInput.cs')!
    expect(code).toContain('public const string Jump = "Movement/Jump";')
    expect(code).toContain('/// <summary>Close window (key Esc, only on Inventory).</summary>')
  })

  it('notes a key it cannot bind', () => {
    const p = cinderholm()
    p.documents['design.ui'].data.controls.push({ id: 'zz', name: 'Hyper jump', category: 'Movement', key: 'Hyper' })
    expect(unity.checks(buildIR(p).ir).some((i) => i.code === 'input.binding' && /Hyper jump: “Hyper”/.test(i.message))).toBe(true)
  })
})

describe('screens and navigation (I8)', () => {
  it('takes the screens, their layout and the flow', () => {
    expect(ir.ui).toMatchObject({ width: 1920, height: 1080 })
    expect(ir.ui.screens).toHaveLength(14)
    expect(ir.ui.screens.find((s) => s.entry)!.name).toBe('HUD')
    const id = (name: string) => ir.ui.screens.find((s) => s.name === name)!.id
    expect(ir.ui.links).toContainEqual({ from: id('Main menu'), to: id('Settings'), kind: 'opens' })
  })

  it('writes one UXML per screen, laid out in percent of the planned resolution', () => {
    const menu = files.get('UI/Screens/MainMenu.uxml')!
    expect(menu).toContain('<ui:UXML xmlns:ui="UnityEngine.UIElements"')
    expect(menu).toContain('<Style src="../PlannerUI.uss" />')
    expect(menu).toContain('<ui:Button name="open-Settings" class="planner-button" style="position: absolute; left: 40.63%; top: 53.33%; width: 18.75%; height: 5.19%;" text="Settings" />')
    expect(files.get('UI/Screens/Hud.uxml')).toContain('<ui:ProgressBar name="bind-survivalStat-hunger"')
    expect(files.get('UI/PlannerUI.uss')).toContain('.planner-heading')
  })

  it('writes the screen IDs, the planned flow and a router that follows it', () => {
    const code = files.get('Scripts/Generated/UI/PlannerScreens.cs')!
    expect(code).toContain('public const ScreenId Entry = ScreenId.Hud;')
    expect(code).toContain('(ScreenId.MainMenu, ScreenId.Settings, "opens"),')
    expect(files.get('Scripts/Generated/UI/PlannerScreenRouter.cs')).toContain('public sealed class PlannerScreenRouter : MonoBehaviour')
    expect(files.get('Scripts/Generated/UI/PlannerScreenSet.cs')).toContain('var path = $"{root}/Screens.asset";')
  })

  it('puts every ScriptableObject and MonoBehaviour in a file named after it (Unity finds the script by the file)', () => {
    for (const [path, text] of files) {
      if (!path.endsWith('.cs')) continue
      // A partial class (a component of the class diagram) is found by its own file, which has its name.
      for (const m of text.matchAll(/(?<!partial )class (\w+)\s*:\s*(?:ScriptableObject|MonoBehaviour)\b/g)) expect(path.split('/').pop(), `${m[1]} in ${path}`).toBe(`${m[1]}.cs`)
    }
  })
})

describe('state machines (I4)', () => {
  it('finds the state machines drawn in the planner', () => {
    expect(ir.stateMachines.map((m) => m.name)).toEqual(['NPC System › Life cycle state machine'])
    const m = ir.stateMachines[0]
    expect(m.states.map((s) => `${s.name}:${s.kind}`)).toEqual(['Birth:start', 'Child:state', 'Adult:state', 'Elder:state', 'Death:end', 'Arrival:start', 'Leaves town:end'])
    expect(m.transitions.find((t) => t.cause)).toMatchObject({ kind: 'on event', cause: 'Traveller arrives' })
  })

  it('writes a typed machine that only allows the planned transitions', () => {
    const code = files.get('Scripts/Generated/StateMachines/NpcLifecycleStates.cs')!
    expect(code).toContain('public static readonly State[] Starts = { State.Birth, State.Arrival };')
    expect(code).toContain('new PlannerTransition<State>(State.Adult, State.LeavesTown, "on event", "Feud"),')
    expect(code).toContain('public static PlannerStateMachine<State> Create(State start = State.Birth)')
    expect(files.get('Scripts/Generated/StateMachines/PlannerStateMachine.cs')).toContain('public bool Go(TState to)')
  })

  it('leaves out a graph with fewer than two states', () => {
    const p = cinderholm()
    p.documents['design.npc'].data.lifecycle.edges = []
    expect(buildIR(p).ir.stateMachines).toEqual([])
  })
})
