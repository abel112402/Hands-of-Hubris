import { describe, expect, it } from 'vitest'
import { deserializeProject } from '../src/core/persistence/serialize'
import { buildIR } from '../src/core/engine/ir'
import { godot } from '../src/core/engine/adapters/godot'
import { unreal } from '../src/core/engine/adapters/unreal'
import { godotEvent } from '../src/core/engine/adapters/godotScaffold'
import { unrealKey } from '../src/core/engine/adapters/unrealScaffold'

/** Plan § 7, third round on Godot and Unreal: input map, screens and navigation, state machines. */
const fs: { readFileSync: (p: string, e: string) => string } = await import('node:fs' as string)
const cinderholm = () => deserializeProject(fs.readFileSync('examples/cinderholm.hohplan.json', 'utf8')).project
const { ir } = buildIR(cinderholm())

describe('Godot', () => {
  const files = new Map(godot.emit(ir).map((f) => [f.path, f.content]))
  const gen = (name: string) => files.get(`Scripts/Generated/${name}`)!

  it('maps planned keys, mouse and gamepad buttons to input events', () => {
    expect(godotEvent('key', 'W')).toBe('_key(KEY_W)')
    expect(godotEvent('key', 'Esc')).toBe('_key(KEY_ESCAPE)')
    expect(godotEvent('mouse', 'RMB')).toBe('_mouse(MOUSE_BUTTON_RIGHT)')
    expect(godotEvent('gamepad', 'A')).toBe('_joy(JOY_BUTTON_A)')
    expect(godotEvent('gamepad', 'LT')).toBe('_axis(JOY_AXIS_TRIGGER_LEFT)')
    expect(godotEvent('key', 'Hyper')).toBeUndefined()
  })

  it('writes the input actions the addon registers in the Input Map', () => {
    const code = gen('cinderholm_example_input.gd')
    expect(code).toContain('const JUMP := &"jump"')
    expect(code).toContain('\t\t"jump":\n\t\t\treturn [_key(KEY_SPACE), _joy(JOY_BUTTON_A)]')
    expect(code).toContain('\t\t"block":\n\t\t\treturn [_mouse(MOUSE_BUTTON_RIGHT), _axis(JOY_AXIS_TRIGGER_LEFT)]')
    expect(code).toContain('static func register_project_settings() -> int:')
    expect(fs.readFileSync('engine-packages/godot/addons/hoh_planner/planner_extras.gd', 'utf8')).toContain('script.call("register_project_settings")')
  })

  it('writes the screens with their layout and flow, and a router', () => {
    const code = gen('cinderholm_example_screens.gd')
    expect(code).toContain('enum Screen { HUD, INVENTORY,')
    expect(code).toContain('const ENTRY := Screen.HUD')
    expect(code).toContain('[Screen.MAIN_MENU, Screen.SETTINGS, "opens"],')
    expect(code).toMatch(/"kind": "button", "rect": \[[^\]]+\], "text": "Settings", "opens": Screen\.SETTINGS/)
    expect(gen('planner_screen_router.gd')).toContain('c.pressed.connect(open.bind(int(c.get_meta("opens"))))')
  })

  it('writes typed state machines', () => {
    const m = gen('StateMachines/npc_lifecycle_states.gd')
    expect(m).toContain('enum State { BIRTH, CHILD, ADULT, ELDER, DEATH, ARRIVAL, LEAVES_TOWN }')
    expect(m).toContain('[State.ADULT, State.LEAVES_TOWN, "on event", "Feud"],')
    expect(m).toContain('static func create(start: State = State.BIRTH) -> CinderholmExampleStateMachine:')
    expect(gen('StateMachines/cinderholm_example_state_machine.gd')).toContain('func go(to: int) -> bool:')
    for (const [path, text] of files) if (path.endsWith('.gd')) expect(text, path).not.toMatch(/^ +\S/m)
  })
})

describe('Unreal', () => {
  const files = new Map(unreal.emit(ir).map((f) => [f.path, f.content]))
  const gen = (name: string) => files.get(`Source/PlannerGame/Generated/${name}`)!

  it('names planned keys as Unreal keys and lists the Enhanced Input assets', () => {
    expect(unrealKey('key', 'Space')).toBe('SpaceBar')
    expect(unrealKey('key', '1')).toBe('One')
    expect(unrealKey('mouse', 'LMB')).toBe('LeftMouseButton')
    expect(unrealKey('gamepad', 'Start')).toBe('Gamepad_Special_Right')
    const types = JSON.parse(files.get('Meta/planner-types.json')!)
    const combat = types.input.find((c: { category: string }) => c.category === 'Combat')
    expect(combat.actions.find((a: { name: string }) => a.name === 'Block')).toEqual({ name: 'Block', asset: 'IA_Block', keys: ['RightMouseButton', 'Gamepad_LeftTrigger'], mode: 'Hold' })
    expect(gen('PlannerInput.h')).toContain('constexpr const TCHAR* Jump = TEXT("/Game/HoHPlanner/Input/IA_Jump.IA_Jump");')
  })

  it('writes the screens as UMG widgets built at run time, with a router, and asks Build.cs for UMG', () => {
    const h = gen('PlannerScreens.h')
    expect(h).toContain('enum class EPlannerScreen : uint8')
    expect(h).toContain('class PLANNERGAME_API UPlannerScreenWidget : public UUserWidget')
    expect(h).toContain('static UPlannerScreenRouter* Create(APlayerController* PlayerController);')
    const cpp = gen('PlannerScreens.cpp')
    expect(cpp).toContain('{ EPlannerScreen::MainMenu, EPlannerScreen::Settings }, // opens')
    expect(cpp).toContain('UCanvasPanelSlot* CanvasSlot = Canvas->AddChildToCanvas(Made);')
    expect(gen('Dependencies.txt').trim().split('\n').slice(1)).toEqual(['UMG', 'Slate', 'SlateCore'])
    expect(files.get('Source/PlannerGame/PlannerGame.Build.cs')).toContain('Path.Combine(ModuleDirectory, "Generated", "Dependencies.txt")')
  })

  it('writes typed state machines on a template that only allows the planned transitions', () => {
    const m = gen('NpcLifecycleStates.h')
    expect(m).toContain('enum class ENpcLifecycleState : uint8')
    expect(m).toContain('{ ENpcLifecycleState::Adult, ENpcLifecycleState::LeavesTown, TEXT("on event"), TEXT("Feud") },')
    expect(m).toContain('static TPlannerStateMachine<ENpcLifecycleState> Create(ENpcLifecycleState Start = ENpcLifecycleState::Birth)')
    expect(gen('PlannerStateMachine.h')).toContain('bool Go(TState To)')
  })
})
