# UI / UX editor: analysis and v2 plan

**Status:** Proposed | **Date:** 2026-11-06 | **Module:** `design.ui` ([src/modules/design.ts](src/modules/design.ts), `mod('design', 'ui', …)`) | **Method:** [EDITOR_UPGRADE_GUIDE.md](EDITOR_UPGRADE_GUIDE.md)

## Context

UI / UX is still the **v1 generic module**:
- one `principles` form with 3 textareas
- a `screens` collection with purpose and three text lists, seeded with the 11 screens the doc names
- a `flow` graph whose nodes link to screens
- **one** shared `wireframe` canvas, using the generic `CanvasEditor`

No other module references UI sections, so the schema can grow freely. It still has to keep its own ids: `principles`, `screens`, `flow`, `wireframe`, and the seeded screen ids in both example projects.

This module is about **visual** design, so the centrepiece of the upgrade is a real wireframe editor (§4). The generic canvas, a fixed 1000 × 640 board shared by all screens, can't carry that work.

## 1. Analysis

### Coverage against `docs/01_design/ui_ux.md`

| Doc chapter | Today | Problem |
|---|---|---|
| 1. UX principles (readability, information density, control) | `principles.principles` | Prose only. No rules the editor can check: minimum text size, minimum click target, safe area, grid, target resolution |
| 2. Screen flow | `flow` graph | Fine as a diagram, but nothing checks it. Is every screen reachable? Can the player always get back? How many clicks to reach a screen? |
| 3. HUD (elements, placement, feedback: survival stats, time, minimap) | a seeded "HUD" screen with an `elements` text list | No HUD section. Nothing ties HUD widgets to the data they show: Player survival stats, the Time & Weather clock, Items hotbar slots, Trade currencies |
| 4. Menus and windows (purpose · elements · interactions · states · **wireframe link**) | `screens` (purpose + text lists) and one shared canvas | No wireframe *per screen*, so the template's "wireframe link" has nothing to point to. States are text and don't change what a wireframe shows. No screen kind or size (HUD layer, fullscreen menu, window, popup) |
| 5. Input and controls (keyboard/mouse, gamepad, rebinding) | `principles.input` textarea | No action → binding table, so key conflicts can't be found |
| 6. Accessibility and localization (text size, colour-blind mode, languages) | `principles.a11y` textarea | Nothing measurable. Text-expansion overflow for translations and minimum sizes can't be checked |

### Today's wireframe canvas
- **One** board for all screens. Screens are only told apart by hand-drawn "Frame" boxes.
- Single selection only: no multi-select, alignment, duplicate, copy, z-order, lock or keyboard.
- One bottom-right resize handle, a fixed 10 px snap and no smart guides.
- No zoom, so the 1000 × 640 board can't hold a 1920 × 1080 screen at real proportions.
- Every element kind looks the same (blue boxes). A button, a stat bar and a list are indistinguishable.
- Elements don't link to data or to other screens. No states, no annotations, nothing in the export but a coordinate table.
- Every drag step creates an undo entry per element. Coalescing exists via the update key, but it isn't per gesture.

### Numbers the designer needs but can't see
- Clicks (depth) from the HUD to every screen. Screens with no way in, or no way back.
- Text and click-target sizes against the minimums at the target resolution. How much space is left inside the safe area.
- Whether a label still fits when translated: width at +30 % text expansion.
- HUD coverage: which survival stats, currencies and hotbar slots the HUD actually shows, against Player, Trade and Items.
- Key conflicts: the same key bound to two actions in the same context.

### Questions the designer can't answer today
- What does the Inventory window look like, and does it hold the slot count Items defines?
- Does the HUD show every survival stat? Is the hotbar as long as Items says?
- From the HUD, how many clicks is the Diplomacy screen? Can I get back from Crafting?
- Which buttons lead nowhere, and which flow arrows have no button behind them?
- Which screens are still missing a wireframe, a purpose or states for the MVP?
- Does any action share a key with another in gameplay?

### Bugs and inconsistencies
- `principles` mixes three doc chapters (1, 5 and 6) in one form.
- The shared canvas "Frame" convention breaks as soon as two screens need different sizes.
- Canvas `zIndex` is 0 for Frames and 1 for everything else, so overlapping elements can't be ordered.

## 2. Target data model (module `version: 2`, `migrate: migrateUi`)

Sections follow doc order. **Existing ids are kept**: `principles`, `screens`, `flow` and `wireframe`; the field keys `principles`, `purpose`, `elements`, `interactions` and `states`; and the seeded screen ids.

| # | Ch. | Section (id) | Kind | Key content |
|---|---|---|---|---|
| 1 | 1 | UX principles (`principles`) | form (kept) | `principles` (kept), `pillars` (list, e.g. "Readable at a glance") |
| 2 | 1 | Layout rules (`layoutRules`) | form (new) | `resolution` (1920×1080, 2560×1440, 1280×800 Steam Deck, 1280×720), `safeArea` (% inset, default 5), `grid` (px, default 8), `minTextPx` (default 18 at 1080p), `minTargetPx` (default 32 for mouse, 48 for gamepad / touch), `density` (Sparse, Balanced, Dense). The editor and the checks read these |
| 3 | 2 | Screen flow (`flow`) | graph (kept) | Nodes stay linked to screens, with edge kinds `opens`, `closes` and `navigates`. Now *checked*: reachability from the entry screen, ways back, depth. A toolbar action, "Add arrows from wireframes", creates edges for wireframe buttons that open a screen |
| 4 | 3 | HUD (`hud`) | form (new) | `hudScreen` (ref screens; defaults to the screen of kind HUD), `placement` and `feedback` notes, `minimal` (bool: diegetic or minimal HUD), `autoHide` notes. The export lists the HUD's widgets and bindings here (chapter 3) |
| 5 | 4 | Screens (`screens`) | collection (kept) | **Identity:** `kind` (HUD, Fullscreen menu, Window, Popup, Overlay), `system` (enum of the design modules the screen serves: Items, Player, World, Town, NPC, Trade, Factions, Story, Settings), `entry` (bool: where the game starts, normally the HUD), `priority` (MVP, Later). **Template:** `purpose` (kept), `interactions` (kept), `states` (kept list; drives the wireframe state switcher), `elements` (kept, now "Element notes"). **Size:** `width` and `height` (windows and popups; empty = full resolution). **Layout:** `layout` (no inspector field; edited only in the Wireframe view, §4). Views: **Wireframe**, **Screen map**, **Screen readiness**, cards, table |
| 6 | 5 | Input (`input`) | form (new) | `notes` (moved from `principles.input`), `devices` (list), `rebinding` (bool), `holdToggle` (bool: hold actions can be toggles) |
| 7 | 5 | Controls (`controls`) | collection (new) | `action`, `category` (Movement, Combat, Building, Menus, Camera, System), `contexts` (multi screens; empty = gameplay), `key`, `mouse`, `gamepad`, `mode` (Press, Hold, Double), `rebindable`, notes. Views: table, **Binding map** |
| 8 | 6 | Accessibility and localization (`accessibility`) | form (new) | `notes` (moved from `principles.a11y`), `textScale` (min / max %), `colorblind` (list of modes), `subtitles` (bool), `reduceMotion` (bool), `languages` (list), `textExpansion` (% for the longest language, default 30) |
| 9 | — | Sketch board (`wireframe`) | canvas (kept) | Retitled "Sketch board (free)". It stays a free space for loose ideas; the per-screen wireframes replace it |

### Wireframe layout (stored on each screen as `layout`)
```ts
type WireLayout = { elements: WireElement[] }      // the array order is the z-order (last = on top)
type WireElement = {
  id: string; kind: WireKind
  x: number; y: number; w: number; h: number       // artboard px at the target resolution
  text?: string                                    // label, heading, button caption
  props?: Record<string, string | number | boolean> // kind-specific (text size, variant, rows/cols, …)
  bind?: { source: 'survivalStat' | 'currency' | 'resource' | 'item' | 'skill' | 'quest' | 'clock'; id?: string }
  action?: { kind: 'opens' | 'closes' | 'back'; screen?: string }
  states?: string[]                                // visible only in these screen states; empty = all
  locked?: boolean; hidden?: boolean
  note?: string                                    // designer annotation, shown as a numbered pin
}
```
`layout` lives on the screen entity, so a screen's wireframe is copied, deleted and exported along with the screen. Elements keep stable ids across edits so annotations, tests and undo can rely on them.

### `migrateUi` (v1 → v2)
- `principles.input` → `input.notes` and `principles.a11y` → `accessibility.notes`. The old keys are deleted (the Story `tone` pattern).
- Screens: nothing is removed. A screen named "HUD" gets `kind: 'HUD'` and `entry: true`; "Settings" and the doc-listed windows get `kind: 'Window'`; the others are left unset.
- **Canvas frames → screen layouts:**
  - Each `wireframe` canvas item of kind **Frame** whose label matches a screen name (case-insensitive) becomes that screen's artboard.
  - Every item lying fully inside the frame moves into the screen's `layout`, **keeping its id**. Coordinates become frame-relative and are scaled from the frame size to the target resolution.
  - Kinds are mapped: Button → Button, Text → Text, Icon → Icon, List → List, Image → Image, Input → Text input, Panel → Panel.
  - The frame and its moved items leave the sketch board; unmatched frames and loose items stay there unchanged.

## 3. Analysis core: `src/core/ui.ts`

Pure functions, with no React and no DOM measuring.

- `UI_DOC`, `screensOf`, `layoutOf(screen)`, `layoutRules(project)` (with defaults), `artboardOf(project, screen)` (width and height: screen size, else resolution), `safeRect(project, screen)`.
- **Geometry** (shared by the editor and the checks):
  - `bounds`, `contains`, `intersects`, `elementsInside(container)`
  - `snapMove` / `snapResize(rect, others, artboard, grid, threshold)`: the snapped rect plus the guide lines to draw (edges and centres of other elements, the artboard and the safe area)
  - `align(els, mode)` and `distribute(els, axis)`: return new rects
- **Text fit:** `textWidth(text, px)` estimates 0.55 em per character; `fits(element, expansion)` checks the label at +`textExpansion` % against the element width minus padding.
- `layoutIssues(project, screen)`:
  - elements outside the artboard or the safe area
  - text below `minTextPx`
  - interactive elements below `minTargetPx`
  - overlapping interactive elements
  - labels that overflow at the text expansion
  - HUD widgets with no binding
  - buttons with no action (info)
  
  Each issue carries the element id, so the editor can highlight it.
- `navEdges(project)` (from element actions) and `flowAnalysis(project)`:
  - `depth` (clicks from the entry screen via the flow graph and wireframe actions)
  - `unreachable` screens
  - `deadEnds` (no closes, back or navigates edge out, except the entry)
  - `mismatches`: wireframe actions missing from the graph, and graph arrows no wireframe button implements
- `hudCoverage(project)`:
  - survival stats (catalog / Player `survival`) shown by a Stat bar on the HUD
  - Hotbar slot count against Items `inventory.hotbar`
  - Inventory grid cells against Items `inventory.slots`
  - Trade currencies shown by a Counter
  - a Clock widget when Time & Weather has day phases
- `controlConflicts(project)`: pairs that share a key, mouse or gamepad binding in an overlapping context. An empty context counts as gameplay; a screen context overlaps only itself.
- `screenReadiness(project)`: per screen, whether it has a purpose, a wireframe (≥ 3 elements), states, a flow link, and its issue count.
- `layoutSvg(project, screen)`: a static low-fi SVG string of a layout, used for thumbnails, the example preview and the export.

## 4. The wireframe editor (Wireframe view on `screens`)

The visual heart of the module. It's a full-width view with its own panels; the generic inspector stays closed while it's open. Design goals: **clean low-fidelity look, direct manipulation, everything reachable by mouse and keyboard, and one undo step per gesture.**

### 4.1 Layout of the editor
```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ [Inventory ▾]  Edit | Preview   State: [default ▾]   ⌖ Grid  ▭ Safe area  ⚑ Checks (3)  │
│ ─ Palette ────────────────────────────────────────────────  − 75% +  Fit   ⟲ ⟳          │
│ Layout: ▭ Panel ─ Divider │ Text: H Heading T Text │ Controls: ▢ Button ⊙ Toggle ═ Slider…│
│ HUD: ▮ Stat bar # Counter ◷ Clock ◍ Minimap ▦ Hotbar ✎ Quest tracker │ Content: ▦ Grid …  │
├───────────────┬──────────────────────────────────────────────────────┬───────────────────┤
│ SCREENS       │  pasteboard (neutral dots)                           │ PROPERTIES        │
│ ▣ HUD     ✓   │   ┌──────────── 1920 × 1080 artboard ───────────┐    │ Button            │
│ ▣ Inventory ⚑ │   │ ┆safe area┆                                  │    │ x 120  y 80       │
│ ▢ Crafting    │   │   ┌Panel───────────────┐                     │    │ w 160  h 48       │
│ …             │   │   │ ▦▦▦▦▦▦ grid 6×4     │   [ Close ]●1       │    │ Text  [Close   ]  │
├───────────────┤   │   └────────────────────┘                     │    │ Style ○Primary ●… │
│ LAYERS        │   └──────────────────────────────────────────────┘    │ Action Opens ▾ HUD│
│ ▢ Close   👁 🔒│                                                      │ States ☑default…  │
│ ▦ Grid    👁 🔒│                                                      │ Note  [ … ]       │
│ ▭ Panel   👁 🔒│                                                      │ CHECKS            │
└───────────────┴──────────────────────────────────────────────────────┴───────────────────┘
```
- **Left rail:**
  - *Screens*: every screen with a live SVG thumbnail, its kind icon, a ✓ when the wireframe is ready and a ⚑ issue count. Click to switch; double-click to rename; "+ New screen".
  - *Layers*: the elements in z-order, top first. Each row has a kind icon, a name, 👁 hide and 🔒 lock. Drag to reorder (also ↑ / ↓ buttons for keyboard users). Click selects, shift-click multi-selects.
- **Centre:**
  - The artboard sits on a neutral dotted pasteboard, at the screen's real size (resolution, or the window or popup size centred on a dimmed full-resolution backdrop).
  - Zoom 10–400 % with Ctrl + wheel, the −/+ buttons, or **Fit** (the default on open). Space-drag or middle-drag pans.
- **Right panel:** *Properties* for the selection (§4.4) and *Checks*: the issues of this screen, each clickable to select and zoom to the element. It collapses to an icon strip for more canvas space.
- **Top bar:**
  - screen picker
  - **Edit / Preview** toggle
  - **State switcher**: the screen's `states` plus "All"; only elements visible in the chosen state are drawn
  - toggles for grid, safe area, checks overlay and annotation pins
  - zoom
  - undo / redo, using the global store, so Ctrl+Z works too

### 4.2 Element palette
The palette is grouped, with icon + label buttons and tooltips. **Click** places the element at the centre of the view (or inside the selected Panel). **Drag** onto the artboard places it under the cursor. Each kind has a sensible default size at the target resolution and a distinct low-fi rendering, so screens read clearly without colour:

| Group | Kinds (rendering) |
|---|---|
| Layout | **Panel** (rounded outline, optional title bar), **Divider** (hairline), **Spacer** (dashed, invisible in Preview) |
| Text | **Heading** (bold sample text), **Text** (2–3 grey lines or the given text), **Label** |
| Controls | **Button** (rounded, caption; Primary / Secondary / Ghost), **Icon button**, **Toggle**, **Checkbox**, **Slider**, **Dropdown**, **Text input**, **Tabs** (N tabs, active one marked) |
| Content | **List** (N rows of lines), **Grid** (rows × cols slot cells; *Slots* binds to Items inventory), **Image** (box with a cross), **Icon** (circle glyph), **Portrait**, **Tooltip** (callout) |
| HUD | **Stat bar** (bar at 70 % with the stat name; binds a survival stat), **Counter** (icon + "123"; binds a currency or resource), **Clock** (dial; binds the Time & Weather clock), **Minimap** (circle or square with a north tick), **Hotbar** (N slots from Items `hotbar`, numbered keys), **Quest tracker** (title + 2 objective lines), **Toast** (notification card), **Crosshair**, **Dialog box** (speaker + 2 lines + choice buttons) |

The style is greyscale strokes on `--panel` with `--text` / `--muted` lines. Only the accent marks selection, `--warn` and `--danger` mark issues, and there's no other colour. That keeps wireframes looking like wireframes, readable in both themes.

### 4.3 Direct manipulation
- **Select:** click; shift-click adds or removes; drag on empty artboard draws a marquee; Ctrl+A selects all; Esc clears. Locked elements can't be selected on the canvas (only from Layers).
- **Move:** drag; arrow keys move 1 px, Shift+arrows move one grid step. Dragging a **Panel** moves every element lying inside it (cheap grouping without a tree); hold Alt to move the panel alone.
- **Resize:** 8 handles on a single selection; Shift keeps the aspect ratio; minimum 8 px.
- **Snapping:** to the grid when it's on, and to *smart guides* (edges and centres of other elements, the artboard and the safe area) within 6 screen px. Active guides draw as thin accent lines, and the gap to the nearest neighbour shows as a small px badge while dragging. Alt disables snapping.
- **Edit text:** double-click a text-bearing element to edit inline; Enter or blur commits, Esc cancels.
- **Clipboard and order:** Ctrl+C / Ctrl+V (pasting offsets by one grid step, and works across screens), Ctrl+D duplicates, Delete removes, Ctrl+] / Ctrl+[ bring forward / send backward (with Shift: to front / back), Ctrl+L lock.
- **Multi-selection bar:** with 2+ selected, a floating bar offers align left / centre / right / top / middle / bottom, distribute horizontally / vertically, and match width / height.
- **Undo:** each gesture (a drag, resize, nudge burst, paste or align) is **one** undo step, via an update key per gesture id; typing in a property is coalesced per field.
- **Context menu** (right-click): the same actions as the keyboard, so nothing is shortcut-only.

### 4.4 Properties panel
Sections appear only when they apply to the selection:
- **Position & size:** x, y, w, h (number inputs that accept `+10`-style arithmetic), plus a constraints hint showing the distance to the safe-area edges.
- **Element** (kind-specific): text; text size (S 14 / M 18 / L 24 / XL 32 px at 1080p); alignment; button style; rows / cols for List, Grid and Hotbar; tab count; placeholder.
- **Data binding** (HUD and content kinds): a source, then an entry picked from the live project, e.g. Stat bar → *Health*, Counter → *Silver*, Hotbar → *Items hotbar (8)*. The canvas label shows the bound name. Unbound HUD widgets are flagged.
- **Action** (interactive kinds): None, Opens screen ▾, Closes, or Back. The flow arrows these imply show in Screen map and are offered to the graph.
- **States:** a checkbox per screen state (empty = all). The canvas shows the active state.
- **Note:** a free annotation, shown as a numbered pin when pins are on; exported as the screen's spec notes.
- With several elements selected, only shared fields show, with "mixed" placeholders.

### 4.5 Preview mode
- Handles, guides, pins and Spacers are hidden.
- Clicking an element with an action **navigates**: *Opens* switches to the target screen; *Back* and *Closes* return along a breadcrumb trail. A window or popup opens over a dimmed render of the screen it came from.
- A hover outline shows what's clickable.

This is the module's interactive "planner": the designer clicks through the game's menus to test the flow before any art exists.

### 4.6 Checks overlay and empty state
- **Checks overlay:** elements with issues get a ⚑ badge and a `--warn` / `--danger` outline. The Checks list names each issue in plain words, e.g. "‘Close’ is 28 px tall; buttons need 32 px", or "‘Wiederherstellen’ needs ~210 px at +30 %, has 160".
- **Empty state:** a screen without a layout shows "Start from a template": the examples for its kind (HUD, Inventory window, Menu, Popup), plus "Blank" and "Copy from screen…".

### 4.7 Accessibility and robustness of the editor itself
- Every action is reachable without a mouse: Layers is a keyboard-navigable list, arrows move, and the toolbar is tabbable.
- Buttons have `aria-label`s, and the artboard has a text alternative: the Layers list. Respects `prefers-reduced-motion`.
- Pointer events with `setPointerCapture` (mouse, pen and touch). Rendering uses absolutely positioned divs inside a CSS-scaled artboard, which stays smooth for ~300 elements; thumbnails use `layoutSvg`.
- The editor never writes to the store on pointer *move* without a gesture key, and calls jsdom-unsafe APIs only with fallbacks (`scrollIntoView?.()`).

### 4.8 Code structure (`src/ui/editors/wireframe/`)
| File | Responsibility |
|---|---|
| `WireframeView.tsx` | shell: top bar, rails, mode and state; reads and writes `screens[i].layout` through `useSection` |
| `Artboard.tsx` | zoom and pan, the pasteboard, rendering elements, the safe area, grid, guides, pins, marquee |
| `useGestures.ts` | pointer gestures (move, resize, marquee, pan), using `snapMove` / `snapResize` from `core/ui.ts`, with one gesture key per drag |
| `useShortcuts.ts` | the keyboard map (§4.3), active only while the editor is focused and the user isn't typing |
| `kinds.tsx` | the palette registry: kind, group, icon, default size, props schema, interactive / bindable flags, renderer |
| `PropertiesPanel.tsx`, `LayersPanel.tsx`, `ScreenRail.tsx`, `ChecksPanel.tsx`, `AlignBar.tsx` | the panels |

The world map keeps the generic `CanvasEditor`; the snapping helpers in `core/ui.ts` could serve it later.

## 5. Other views

| View | On | Shows |
|---|---|---|
| **Screen map** (`screenMap`) | screens | A generated navigation map. Screens are thumbnail cards in layers by click depth from the entry screen. Solid arrows are wireframe actions, dashed arrows are graph-only. Unreachable screens and dead ends are marked, and the depth sits on each card. Click to open a screen in the Wireframe view |
| **Screen readiness** (`screenReadiness`) | screens | Screens × checks (purpose, wireframe, states, in flow, issues, priority), filtered to MVP by default. Clicking a row opens the screen; the handoff checklist |
| **Binding map** (`bindingMap`) | controls | A keyboard and a gamepad diagram with each key labelled by its action, filtered by context. Conflicting keys are filled `--danger`; clicking a key lists or opens its actions |

Wiring: add the kinds `wireframe`, `screenMap`, `screenReadiness` and `bindingMap` to `CollectionView`, the `v` helpers and the `CollectionEditor` labels and dispatch. `CollectionEditor` hides its inspector while the Wireframe view is active. Styles use CSS variables only (`.wf-*` classes).

## 6. Hints (`src/core/hints/rules/ui.ts`)

All at `suggest` or below, each with a `goto` (or `addEntity` where it helps). Quiet on an empty doc and in other editors.

| Rule | Fires when |
|---|---|
| `ui.unreachable` | a screen can't be reached from the entry screen through the flow or wireframe actions |
| `ui.deadEnd` | a non-entry screen has no way back (no closes, back or navigates out) |
| `ui.navMismatch` | wireframe buttons open screens the flow graph doesn't show, or graph arrows have no button (info) |
| `ui.layout` | text below the minimum size, interactive elements below the minimum target size, elements outside the safe area, or overlapping controls (count per screen) |
| `ui.textFit` | labels that overflow at the configured text expansion (info) |
| `ui.hudCoverage` | survival stats not on the HUD, hotbar or inventory grid size differs from Items, or currencies not shown (info) |
| `ui.unbound` | HUD widgets without a data binding |
| `ui.controlConflicts` | two actions share a binding in the same context |
| `ui.screenBasics` | MVP screens without a purpose, a wireframe or states (info, max 5) |

Register them in `RULES`, and add `hints.ui*.title/body` to both `en.json` and `hu.json`.

## 7. Help and export
- **Help** (`MODULE_HELP['design.ui']`):
  - one wireframe per screen; key gestures and shortcuts
  - bindings and actions
  - states
  - Preview click-through
  - layout rules feed the checks
  - Screen map and Binding map
  - a pointer to the Guide tab
- **Export:**
  - **Chapter 2:** a Mermaid flowchart of screens and arrows (graph and wireframe actions), plus reachability.
  - **Chapter 3:** the HUD's widgets with placement and binding (e.g. "Stat bar · top-left · Health").
  - **Chapter 4:** per screen, the doc template block (**Purpose · Elements · Interactions · States · Wireframe link**), where:
    - Elements are listed from the layout (kind, text, binding)
    - Interactions come from the actions
    - Wireframe link points to `ui_wireframes/<screen>.svg`, written into the export zip from `layoutSvg`
    - numbered annotation notes follow as the spec
  - **Chapter 5:** the controls table, plus conflicts.
  - **Chapter 6:** the accessibility settings and the text-fit result.

## 8. Guide (`src/modules/guides/ui.ts`, registered in `GUIDES`)

- **System map:**
  - Sections: Principles → Layout rules → Screens (Wireframe) ⇄ Screen flow; HUD → Screens; Input → Controls; Accessibility.
  - Neighbouring modules, with their edge labels:
    - Player: "survival stats"
    - Items: "hotbar, inventory slots"
    - Trade: "currencies"
    - Time & Weather: "clock"
    - Story: "quest log"
    - World: "map"
    - Factions: "diplomacy"
    - Town: "town overview"
- **Steps (10):**
  1. Write the UX pillars.
  2. Set the layout rules. Action: *PC 1080p* / *Steam Deck* preset.
  3. Mark the entry screen and screen kinds. Action: *set kinds by name*.
  4. Wireframe the HUD from the template (target `view-wireframe`).
  5. Bind every HUD widget (done when `ui.unbound` and `ui.hudCoverage` are clear).
  6. Wireframe the MVP windows.
  7. Give buttons actions and click through in Preview (done by hand).
  8. Check the Screen map: everything reachable, no dead ends.
  9. Add the control scheme and resolve conflicts. Action: *keyboard & mouse* / *gamepad* preset.
  10. Set the accessibility and localization rules, then fix text-fit issues.
- **Examples:**
  - **HUD template**: bars bound to every survival stat, a hotbar sized from Items, a clock, a minimap, a quest tracker and a currency counter, placed inside the safe area.
  - **Inventory window**: a grid sized from Items `inventory.slots`, item details, a weight bar and a close button that goes back.
  - **Menu set**: main menu, pause and settings, with button actions and flow arrows.
  - **Popup**: a confirm dialog.
  - **Control schemes**: KB&M and gamepad.
  - **Layout-rule presets.**

  Each example builds a screen layout, previews it as an SVG thumbnail, and inserts as one undo step. They need new `PreviewKind`s: `wireframe`, `screenMap` and `bindings`.
- **Concept cards** (new diagrams in `concepts.tsx`):
  - *wireAnatomy*: artboard, safe area, grid, minimum target
  - *screenDepth*: clicks from the HUD, a dead end
  - *hudBinding*: a widget linked to a survival stat
  - *keyConflict*: two actions on one key in one context
- **Empty texts** for `screens` and `controls`.

## 9. Tests
- **`tests/ui.test.ts`:**
  - migration: input and a11y move; HUD gets its kind; a canvas frame matched to "Inventory" moves its inner items into that screen's layout with **ids kept** and scaled coordinates; unmatched items stay on the sketch board
  - export headings follow doc order, with the Mermaid flow, the per-screen template blocks and the SVG files in the zip
  - geometry: `snapMove` (grid, edge, centre, threshold), `align`, `distribute`, `elementsInside`
  - `textWidth` / `fits` at +30 %; `layoutIssues` for each issue type
  - `flowAnalysis` (depth, unreachable, dead end, mismatches in both directions), `hudCoverage` against Player, Items and Trade data, `controlConflicts` (context overlap), `screenReadiness`
  - each hint with a positive and a negative case; quiet on an empty doc and in other editors; never `important`
- **`tests/uiGuide.test.ts`:** sections and doc ids exist, step predicates and actions work, example preview equals the inserted result, undo removes it, the HUD template binds every survival stat, and the hotbar matches Items.
- **`tests/uiWireframe.test.tsx`** (jsdom, pointer events by `clientX` / `clientY`):
  - clicking a palette item adds an element
  - dragging moves it and snaps to the grid, and the drag is one undo step
  - arrow and Shift+arrow nudge
  - Delete, Ctrl+D and Ctrl+Z
  - multi-select + align left
  - the state switcher hides state-only elements
  - Preview click-through opens the target screen and Back returns
  - Properties binding changes the canvas label
- **Existing tests:** `render.test.tsx` and `editing.test.tsx` must pass; the world map's `CanvasEditor` is untouched.

## 10. Implementation order
1. Schema v2, `migrateUi`, the `layout` storage, and the `CollectionEditor` hook to hide the inspector for the Wireframe view.
2. `src/core/ui.ts`: geometry and snapping first, then the checks, flow, HUD coverage, conflicts and `layoutSvg`, each with unit tests.
3. The wireframe editor in this order: Artboard + kinds rendering → select / move / resize + snapping + guides → palette + Properties → Layers + keyboard → multi-select + align → states → Preview → Checks overlay → empty state and templates.
4. Screen map, Screen readiness, Binding map.
5. Hint rules, i18n (en and hu), help; export (Markdown and SVG files).
6. Guide content, concept diagrams and preview kinds.
7. Tests, typecheck and lint, then a browser check: build the HUD and the Inventory from templates, click through the menus in Preview, and resize the window to check the panels collapse.

**Out of scope (follow-ups):**
- High-fidelity mockups (colours, fonts, image uploads).
- Responsive layouts and anchoring across resolutions.
- Moving the World map onto the new editor engine.
- Live preview of real game data (item icons, numbers) inside the wireframe.

## 11. Verification
- `npx tsc -b --noEmit`, `npx eslint .` and `npx vitest run` all pass.
- `examples/hands-of-hubris.hohplan.json` migrates silently: the HUD gets its kind, and the export follows `ui_ux.md`.
- Insert the HUD template with 4 survival stats: 4 bound Stat bars appear inside the safe area. Delete one and `ui.hudCoverage` names the missing stat.
- Set Items hotbar slots to 8: the template's hotbar has 8 slots. Change it to 10 and the hint reports 8 vs 10.
- Make a 28 px button with `minTargetPx` 32: a ⚑ badge and the Checks entry appear, and resizing to 32 clears both.
- Put "Wiederherstellen" in a 160 px button at 18 px with 30 % expansion: a text-fit issue appears.
- In Preview, Inventory's Close (Back) returns to the HUD. An unlinked "Diplomacy" screen shows as unreachable in Screen map.
- Bind Inventory and Interact both to `E` in gameplay: Binding map fills `E` red and `ui.controlConflicts` fires.

## Decisions to confirm before coding
1. **One wireframe per screen**, stored on the screen (`layout`), edited in a dedicated Wireframe view. The old shared canvas stays as a free sketch board, and frames matched by name are migrated. Recommended over one big canvas, because sizes, states, bindings and export all work per screen.
2. **A dedicated wireframe editor** instead of extending the generic `CanvasEditor`. The World map keeps the simple editor, so nothing there changes.
3. **The flow graph remains the authoritative "intended flow"**; wireframe button actions are compared with it, and one click adds the missing arrows. The alternative is generating the graph from the wireframes and dropping the hand-drawn one.
4. **Deliberately low fidelity:** greyscale, no images or custom fonts. This keeps it a wireframe tool, fast and theme-safe; hi-fi mockups stay in art tools.
