import type { GuideExample, ModuleGuide } from '../../core/guides/types'
import { makeId } from '../../core/model/project'
import type { Entity, Project } from '../../core/model/types'
import { addMissingArrows, controlConflicts, flowAnalysis, hudCoverage, hudScreen, kindDef, layoutIssues, layoutOf, newElement, safeRect, screensOf, UI_DOC, uiList } from '../../core/ui'
import { applyTemplate, menuLayout } from '../../core/uiTemplates'

const data = (p: Project): Record<string, any> => p.documents[UI_DOC]?.data ?? {}
const filled = (v: unknown) => typeof v === 'string' && v.trim() !== ''
const ensureForm = (p: Project, id: string): Record<string, any> => {
  const d = p.documents[UI_DOC]?.data
  if (!d) return {}
  if (!d[id] || typeof d[id] !== 'object' || Array.isArray(d[id])) d[id] = {}
  return d[id]
}
const ensureList = (p: Project, section: string): Entity[] => {
  const d = p.documents[UI_DOC]?.data
  if (!d) return []
  if (!Array.isArray(d[section])) d[section] = []
  return d[section]
}
/** The screen with this name, created with the given fields when missing. */
const screenNamed = (p: Project, name: string, init: Record<string, unknown>): Entity => {
  const list = ensureList(p, 'screens')
  let s = list.find((x) => String(x.name ?? '').toLowerCase() === name.toLowerCase())
  if (!s) {
    s = { id: makeId(), name, ...init }
    list.push(s)
  } else for (const [k, v] of Object.entries(init)) s[k] ??= v
  return s
}

const WINDOWS = ['inventory', 'crafting', 'character / skill tree', 'town overview', 'npc sheet', 'trade', 'diplomacy', 'quest log', 'settings']

/** Gives screens without a kind one from their name, and makes the HUD the entry screen when none is marked. */
export function setKindsByName(p: Project) {
  const screens = screensOf(p)
  for (const s of screens) {
    if (s.kind) continue
    const n = String(s.name ?? '').trim().toLowerCase()
    s.kind = n === 'hud' ? 'HUD' : n === 'map' || n.includes('menu') ? 'Fullscreen menu' : WINDOWS.includes(n) ? 'Window' : n.includes('confirm') || n.includes('popup') ? 'Popup' : 'Window'
  }
  if (!screens.some((s) => s.entry)) {
    const hud = screens.find((s) => s.kind === 'HUD')
    if (hud) hud.entry = true
  }
}

// ---------- Examples ----------

const rules = (id: string, title: string, description: string, r: Record<string, unknown>): GuideExample => ({
  id,
  section: 'layoutRules',
  title,
  description,
  preview: 'wireframe',
  apply: (p) => Object.assign(ensureForm(p, 'layoutRules'), r),
})

type Bind = { name: string; category: string; key?: string; mouse?: string; gamepad?: string; mode?: string; screen?: string }
const controlsPreset = (id: string, title: string, description: string, field: 'key' | 'gamepad', specs: Bind[]): GuideExample => ({
  id,
  section: 'controls',
  title,
  description,
  preview: 'bindings',
  apply: (p) => {
    const list = ensureList(p, 'controls')
    for (const s of specs) {
      const screen = s.screen ? screensOf(p).find((x) => String(x.name).toLowerCase() === s.screen!.toLowerCase()) : undefined
      const existing = list.find((c) => String(c.name).toLowerCase() === s.name.toLowerCase())
      const values = Object.fromEntries((['key', 'mouse', 'gamepad', 'mode'] as const).filter((k) => s[k]).map((k) => [k, s[k]]))
      if (existing) Object.assign(existing, field === 'gamepad' ? { gamepad: s.gamepad } : values)
      else list.push({ id: makeId(), name: s.name, category: s.category, rebindable: true, ...values, ...(screen ? { contexts: [screen.id] } : {}) })
    }
  },
})

export const UI_EXAMPLES: GuideExample[] = [
  rules('rules-pc', 'PC 1080p', '1920×1080, 5 % safe area, 8 px grid, 18 px text, 32 px click targets.', { resolution: '1920×1080', safeArea: 5, grid: 8, minTextPx: 18, minTargetPx: 32, density: 'Balanced' }),
  rules('rules-deck', 'Steam Deck / handheld', '1280×800, 4 % safe area, 16 px text and 44 px targets for thumbs and a small screen.', { resolution: '1280×800 (Steam Deck)', safeArea: 4, grid: 8, minTextPx: 16, minTargetPx: 44, density: 'Sparse' }),
  {
    id: 'hud-template',
    section: 'screens',
    title: 'HUD',
    description: 'A bar per survival stat (Player), a hotbar with the Items slot count, a clock, a minimap, a quest tracker and the first currency, inside the safe area.',
    preview: 'wireframe',
    apply: (p) => {
      const hud = hudScreen(p) ?? screenNamed(p, 'HUD', { kind: 'HUD', entry: true })
      hud.layout = { elements: [] }
      applyTemplate(p, hud.id, 'hud')
      hud.states ??= ['default', 'combat', 'low health']
      hud.purpose ??= 'Shows what the player needs at a glance without hiding the world.'
    },
  },
  {
    id: 'inventory-template',
    section: 'screens',
    title: 'Inventory window',
    description: 'A 1440×864 window with a grid sized from Items inventory slots, an item detail column and a Close button that goes back.',
    preview: 'wireframe',
    apply: (p) => {
      const inv = screenNamed(p, 'Inventory', { kind: 'Window', system: 'Items' })
      inv.layout = { elements: [] }
      applyTemplate(p, inv.id, 'inventory')
      inv.states ??= ['default', 'empty', 'full']
      inv.purpose ??= 'Manage carried items: inspect, use, drop and move them to the hotbar.'
    },
  },
  {
    id: 'menu-set',
    section: 'screens',
    title: 'Main menu, pause and settings',
    description: 'Three linked screens with button actions; the HUD gets a pause button. Flow arrows are added to Screen flow.',
    preview: 'screenMap',
    apply: (p) => {
      const settings = screenNamed(p, 'Settings', { kind: 'Window', system: 'Settings' })
      const hud = hudScreen(p) ?? screenNamed(p, 'HUD', { kind: 'HUD', entry: true })
      const main = screenNamed(p, 'Main menu', { kind: 'Fullscreen menu' })
      const pause = screenNamed(p, 'Pause', { kind: 'Overlay' })
      main.layout = { elements: menuLayout(p, main, ['Continue', 'New game', 'Settings', 'Quit']).map((e) => (e.text === 'Continue' || e.text === 'New game' ? { ...e, action: { kind: 'opens' as const, screen: hud.id } } : e)) }
      pause.layout = { elements: menuLayout(p, pause, ['Resume', 'Settings', 'Main menu']).map((e) => (e.text === 'Resume' ? { ...e, action: { kind: 'back' as const } } : e.text === 'Main menu' ? { ...e, action: { kind: 'opens' as const, screen: main.id } } : e)) }
      if (!layoutOf(settings).length) {
        settings.width ??= 1200
        settings.height ??= 760
        settings.layout = {
          elements: [
            newElement('panel', 0, 0, { w: settings.width, h: settings.height, text: 'Settings' }),
            newElement('tabs', 40, 72, { w: settings.width - 80, props: { tabs: 4 } }),
            newElement('slider', 40, 160, { w: 400 }),
            newElement('checkbox', 40, 220, { text: 'Subtitles', w: 300 }),
            newElement('dropdown', 40, 280, { text: 'Language', w: 300 }),
            newElement('button', settings.width - 200, settings.height - 88, { text: 'Back', w: 160, props: { variant: 'Secondary', textSize: 'M' }, action: { kind: 'back' } }),
          ],
        }
      }
      const hudEls = layoutOf(hud)
      if (!hudEls.some((e) => e.action?.screen === pause.id)) hud.layout = { elements: [...hudEls, newElement('iconButton', safeRect(p, hud).x + safeRect(p, hud).w - 48, safeRect(p, hud).y + safeRect(p, hud).h - 48, { action: { kind: 'opens', screen: pause.id } })] }
      addMissingArrows(p)
    },
  },
  {
    id: 'popup-confirm',
    section: 'screens',
    title: 'Confirm popup',
    description: 'A 640×320 dialog with a question, Cancel (back) and Confirm (closes).',
    preview: 'wireframe',
    apply: (p) => {
      const pop = screenNamed(p, 'Confirm', { kind: 'Popup', width: 640, height: 320 })
      pop.layout = { elements: [] }
      applyTemplate(p, pop.id, 'popup')
      pop.purpose ??= 'Asks before anything that cannot be undone.'
      pop.states ??= ['default']
    },
  },
  controlsPreset('controls-kbm', 'Keyboard & mouse', 'WASD movement, E to interact, I inventory, M map, Esc pause, mouse to attack and block.', 'key', [
    { name: 'Move forward', category: 'Movement', key: 'W' },
    { name: 'Move back', category: 'Movement', key: 'S' },
    { name: 'Move left', category: 'Movement', key: 'A' },
    { name: 'Move right', category: 'Movement', key: 'D' },
    { name: 'Jump', category: 'Movement', key: 'Space' },
    { name: 'Sprint', category: 'Movement', key: 'Shift', mode: 'Hold' },
    { name: 'Interact', category: 'Building', key: 'E' },
    { name: 'Inventory', category: 'Menus', key: 'I' },
    { name: 'Map', category: 'Menus', key: 'M' },
    { name: 'Pause', category: 'System', key: 'Esc' },
    { name: 'Attack', category: 'Combat', mouse: 'LMB' },
    { name: 'Block', category: 'Combat', mouse: 'RMB', mode: 'Hold' },
    { name: 'Close window', category: 'Menus', key: 'Esc', screen: 'Inventory' },
  ]),
  controlsPreset('controls-pad', 'Gamepad', 'Adds gamepad buttons to the same actions (A jump, X interact, RT attack, LT block, Start pause).', 'gamepad', [
    { name: 'Jump', category: 'Movement', gamepad: 'A' },
    { name: 'Sprint', category: 'Movement', gamepad: 'LS' },
    { name: 'Interact', category: 'Building', gamepad: 'X' },
    { name: 'Inventory', category: 'Menus', gamepad: 'Y' },
    { name: 'Map', category: 'Menus', gamepad: 'Select' },
    { name: 'Pause', category: 'System', gamepad: 'Start' },
    { name: 'Attack', category: 'Combat', gamepad: 'RT' },
    { name: 'Block', category: 'Combat', gamepad: 'LT' },
  ]),
]

// ---------- Guide ----------

const nonHudWired = (p: Project) => screensOf(p).filter((s) => s.kind !== 'HUD' && layoutOf(s).length >= 3)

export const UI_GUIDE: ModuleGuide = {
  map: {
    width: 790,
    height: 330,
    nodes: [
      { id: 'principles', label: 'UX principles', section: 'principles', x: 10, y: 14 },
      { id: 'layoutRules', label: 'Layout rules', section: 'layoutRules', x: 220, y: 14 },
      { id: 'accessibility', label: 'Accessibility', section: 'accessibility', x: 430, y: 14 },
      { id: 'player', label: 'Player', doc: 'design.player', x: 640, y: 14 },
      { id: 'flow', label: 'Screen flow', section: 'flow', x: 10, y: 102 },
      { id: 'screens', label: 'Screens · Wireframe', section: 'screens', x: 220, y: 102 },
      { id: 'hud', label: 'HUD', section: 'hud', x: 430, y: 102 },
      { id: 'items', label: 'Items', doc: 'design.items', x: 640, y: 102 },
      { id: 'input', label: 'Input', section: 'input', x: 10, y: 190 },
      { id: 'controls', label: 'Controls', section: 'controls', x: 220, y: 190 },
      { id: 'trade', label: 'Trade', doc: 'design.trade', x: 430, y: 190 },
      { id: 'time', label: 'Time & Weather', doc: 'design.timeWeather', x: 640, y: 190 },
      { id: 'story', label: 'Story', doc: 'design.story', x: 220, y: 278 },
      { id: 'world', label: 'World', doc: 'design.world', x: 430, y: 278 },
      { id: 'factions', label: 'Factions', doc: 'design.factions', x: 640, y: 278 },
    ],
    edges: [
      { from: 'principles', to: 'layoutRules', label: 'sets' },
      { from: 'layoutRules', to: 'screens', label: 'checks' },
      { from: 'accessibility', to: 'screens', label: 'text fit' },
      { from: 'flow', to: 'screens', label: 'arrows ⇄ buttons' },
      { from: 'hud', to: 'screens', label: 'HUD screen' },
      { from: 'player', to: 'hud', label: 'survival stats' },
      { from: 'items', to: 'hud', label: 'hotbar, slots' },
      { from: 'trade', to: 'hud', label: 'currencies' },
      { from: 'time', to: 'hud', label: 'clock' },
      { from: 'input', to: 'controls', label: 'rules' },
      { from: 'controls', to: 'screens', label: 'contexts' },
      { from: 'story', to: 'screens', label: 'quest log' },
      { from: 'world', to: 'screens', label: 'map' },
      { from: 'factions', to: 'screens', label: 'diplomacy' },
    ],
  },
  steps: [
    {
      id: 'pillars',
      title: 'Write the UX pillars',
      body: 'Two or three rules every screen follows, e.g. “Readable at a glance” or “Every window closes with the same key”.',
      section: 'principles',
      target: 'field-principles',
      done: (p) => filled(data(p).principles?.principles) || (Array.isArray(data(p).principles?.pillars) && data(p).principles.pillars.length > 0),
    },
    {
      id: 'rules',
      title: 'Set the layout rules',
      body: 'Target resolution, safe area, grid and minimum text and target sizes. The wireframe checks use them.',
      section: 'layoutRules',
      target: 'examples',
      done: (p) => filled(data(p).layoutRules?.resolution),
      action: { label: 'Pick a preset…', examples: 'layoutRules' },
    },
    {
      id: 'kinds',
      title: 'Give every screen a kind',
      body: 'HUD, fullscreen menu, window, popup or overlay, and one entry screen where play starts (normally the HUD).',
      section: 'screens',
      target: 'view-table',
      done: (p) => screensOf(p).length > 0 && screensOf(p).every((s) => s.kind) && screensOf(p).some((s) => s.entry),
      action: { label: 'Set kinds from names', run: setKindsByName },
    },
    {
      id: 'hud',
      title: 'Wireframe the HUD',
      body: 'Start from the HUD template: it reads your survival stats, hotbar size and currencies.',
      section: 'screens',
      target: 'examples',
      done: (p) => layoutOf(hudScreen(p)).length >= 5,
      action: { label: 'Insert the HUD…', examples: 'screens' },
    },
    {
      id: 'bind',
      title: 'Bind every HUD widget',
      body: 'Each bar, counter and hotbar should show real game data. Pick it under Data in the properties.',
      section: 'screens',
      target: 'view-wireframe',
      done: (p) => {
        const hud = hudScreen(p)
        const c = hudCoverage(p)
        return layoutOf(hud).length > 0 && !layoutOf(hud).some((e) => kindDef(e.kind).hud && kindDef(e.kind).bind && !e.bind) && !c.missingStats.length && !c.hotbar
      },
    },
    {
      id: 'windows',
      title: 'Wireframe the main windows',
      body: 'Inventory, crafting, map and the other MVP windows. Each needs a purpose and its states (empty, full…).',
      section: 'screens',
      target: 'view-wireframe',
      done: (p) => nonHudWired(p).length >= 3,
      action: { label: 'Insert a window…', examples: 'screens' },
    },
    {
      id: 'preview',
      title: 'Give buttons actions and click through',
      body: 'Set “Opens screen”, “Back” or “Closes” on buttons, then switch to Preview and play through the menus. Tick this step by hand.',
      section: 'screens',
      target: 'view-wireframe',
    },
    {
      id: 'map',
      title: 'Check the Screen map',
      body: 'Every screen reachable from the entry screen, and a way back from each one.',
      section: 'screens',
      target: 'view-screenMap',
      done: (p) => {
        const f = flowAnalysis(p)
        return nonHudWired(p).length > 0 && f.unreachable.length === 0 && f.deadEnds.length === 0
      },
    },
    {
      id: 'controls',
      title: 'Map the controls',
      body: 'Every action with its keyboard, mouse and gamepad input, and where it applies. Resolve conflicts in Binding map.',
      section: 'controls',
      target: 'examples',
      done: (p) => uiList(p, 'controls').length >= 5 && controlConflicts(p).length === 0,
      action: { label: 'Insert a control scheme…', examples: 'controls' },
    },
    {
      id: 'a11y',
      title: 'Plan accessibility and languages',
      body: 'List the languages, set the text expansion of the longest one, and fix labels that would not fit.',
      section: 'accessibility',
      target: 'field-textExpansion',
      done: (p) => {
        const a = data(p).accessibility ?? {}
        return Array.isArray(a.languages) && a.languages.length > 0 && typeof a.textExpansion === 'number' && !screensOf(p).some((s) => layoutIssues(p, s).some((i) => i.kind === 'textFit'))
      },
    },
  ],
  examples: UI_EXAMPLES,
  concepts: {
    screens: {
      title: 'Anatomy of a wireframe',
      body: 'Each screen is drawn at the target resolution. Keep HUD and controls inside the dashed safe area, snap to the grid, and keep text and click targets above the minimum sizes. ⚑ marks what breaks a rule.',
      diagram: 'wireAnatomy',
    },
    flow: {
      title: 'Clicks and ways back',
      body: 'From the entry screen, every screen should be a few clicks away, and every screen needs a way back. Buttons with “Opens screen” in the wireframes and arrows here should tell the same story.',
      diagram: 'screenDepth',
    },
    hud: {
      title: 'Widgets bound to data',
      body: 'A HUD widget shows one piece of game data: a stat bar a survival stat, a counter a currency, the hotbar the Items slots. Bound widgets keep the HUD honest when the data changes.',
      diagram: 'hudBinding',
    },
    controls: {
      title: 'Conflicts are per context',
      body: 'Two actions may share a key if they never apply at the same time, e.g. Esc pauses in gameplay and closes a window. In the same context they clash.',
      diagram: 'keyConflict',
    },
  },
  empty: {
    screens: 'Screens are everything the player sees: the HUD, menus, windows and popups. Each gets its own wireframe.',
    controls: 'Controls list each action with its keys and where it applies.',
  },
}
