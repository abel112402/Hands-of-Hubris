# Version 3: "The Design Atlas": editor critique and redesign plan

**Status:** Proposed, prototype reviewed (see "Prototype review decisions") | **Date:** 2026-11-19 | **Scope:** the planner editors (`EditorPage`, `CollectionEditor` + Inspector, section forms, Hints / Guide / AI panel) and the navigation between them. The home workspace joins in Phase 3.
**Method:** live preview at 1024×768 (the "Hands of Hubris" sample, local mode) and 1440×900, plus the source. Planners looked at: Vision & Concept (form), Core Loop (collection + diagrams), Combat › Enemies (dense collection), World & Biomes › Locations (map editor, already redesigned 2026-11-19).
**Builds on:** [WORKSPACE_LANDING_REDESIGN_PLAN.md](WORKSPACE_LANDING_REDESIGN_PLAN.md) (home and landing, v2; editors were out of scope there) and [DESIGN_CRITIQUE_FIX_PLAN.md](DESIGN_CRITIQUE_FIX_PLAN.md) (contrast and focus).
**Screenshots:** `design-critique/v3-before-*.jpg`
**Clickable prototype:** [Design Atlas prototype](https://claude.ai/artifact/PYVH5tzuBwk3oa8NTZjKHJ) (private until shared). Source: `prototypes/v3-atlas/project/Main.dc.html`. Wired end to end: Atlas (map and list) → Vision, Core Loop, Combat, World → sections → Enemies table, cards and threat curve with a record sheet. Also: phase compass, Ctrl K palette, Companion, Guided/Studio, Next-step pill, current-step card, genre emblem and a light/dark toggle. The local source is synced with the live canvas (version `1795102421-3b05`). The canvas is edited on its page too, so sync again before changing the local file.

---

## Design critique: planner editors (v2)

### Overall impression
The content is excellent. Concept cards, examples, hints, system maps and specialised views make this one of the most guided design tools around. But all of it is shown **at once, on every section, in the same visual weight**, so the editor feels like a stack of panels rather than a place to work. The most distinctive asset, the **system map**, is shrunk to a thumbnail above the form. The biggest opportunity: make that map the navigation and the identity of the product, and give the editing surface the screen back.

### Usability
| Finding | Severity | Recommendation |
|---|---|---|
| **The editing column is the narrowest column on the page.** At 1024 px: icon rail 36 · sections 220 · content 478 · hints 280. Selecting a record opens the 320 px Inspector **inside** the 478 px content column, so the Enemies table is squeezed to **95 px** (`v3-before-enemies-1024.jpg`). | 🔴 Critical | Layout budget: the work surface gets ≥ 60% of the width at every breakpoint. Side panels collapse to icon trays below 1280 px. The Inspector becomes a **sheet** (slides over, 480–560 px) or a **record page**; it never shares width with a table. |
| **586 px of chrome before the data** on Core Loop at 768 px height: view toggle + Document + Help, system map, H2, walkthrough chip, concept card, view tabs, filter, count + CSV, and only then the content. | 🔴 Critical | One sticky **section header** (≤ 120 px): title · fill ring · view switcher · overflow menu (Document, CSV, Markdown, Help). The concept card becomes an ⓘ popover. The walkthrough chip is a thin banner shown only when this section *is* the current step. The system map moves into navigation (see below). |
| **Too many fields at once for newcomers.** One new enemy shows 26 inputs in 4 groups (1,680 px tall). Vision shows every long textarea with no sense of what is essential. | 🔴 Critical | **Progressive fields**: each field gets a tier (`core` / `detail`). New entries show only core fields (≈ 3–6) plus "Add detail ▸ Stats · Behavior · Reward" chips. The type filter (`groupFilter`) already shows this works. |
| **Hints nag immediately.** Adding a blank enemy instantly raises 4 hint cards ("Incomplete", "Missing basics", "Unused", "Drops nothing") for an entry the user created one second ago. | 🟡 Moderate | Grace period: no hints for an entry until it is left (blur or navigation) or 60 s pass. Show counts as **badges on map nodes and list rows**, and let the companion panel open on demand. |
| **Navigation is three flat lists**: top-level planners (30+ in the home rail), sections (up to 11 per planner) and view tabs (up to 5). Nothing shows how they relate. The relationships exist (system map, walkthrough phases), but they aren't used to navigate. | 🟡 Moderate | **Semantic-zoom navigation**: Atlas (all planners) → Planner map (its sections) → Section → Record, with breadcrumbs, the ⌘K palette and keyboard steps. |
| Section list items have no state: an empty section and a finished one look the same. | 🟡 Moderate | Show the state in the nav: ○ empty · ◐ started · ● filled, plus the hint badge. Use the same glyphs on map nodes. |
| The Hints / Guide / AI panel takes a permanent 280 px column, even when it has nothing new to say. | 🟡 Moderate | It becomes a **Companion** tray (icon + badge) that opens as an overlay or docks only on wide screens (≥ 1440 px). |
| Empty sections repeat the same pattern: sentence, joke, "+ Add" and "Insert example…" buttons, at body size, left-aligned. | 🟢 Minor | A designed empty state per section: illustration or mascot, one-line purpose, **Start from example** as the primary action (it is the best onboarding the app has), "Start blank" as secondary. |
| "Visual editor / Markdown preview" segmented control is the first thing in every section. | 🟢 Minor | Move it to the overflow menu or a `P` shortcut. It is a per-document mode, not a per-section action. |

### Visual hierarchy
- **What draws the eye first:** the blue **Save** button and the system map's outlined boxes. Neither is the task. The section title (21 px) and the fields (12 px labels) are visually quieter than the chrome around them.
- **Reading flow:** top bar → toolbar → map → title → chips → tabs → filter → content → (far right) hints. The eye passes five horizontal bands before the work starts, while a fourth column competes on the right.
- **Emphasis:** every container has the same 1 px border, `--panel` background and radius, so walkthrough chip, concept card, hint card, inspector group and table all read as equals. Nothing tells you "this is the work, the rest is help".

### Consistency
| Element | Issue | Recommendation |
|---|---|---|
| Panels and cards | One border/radius style for every container, regardless of role | Three surface roles: **canvas** (the work, borderless), **sheet** (inspector, popovers; elevated, shadow), **note** (guidance; tinted, no border) |
| Actions | Primary blue is used for Save, + Add, Go, Create and the active view tab at once | One primary per region. The active tab uses an underline. "Go" in hints uses a link style. |
| Phase colour | `--phase-*` tokens exist but only show on the home progress bar | Each planner takes its phase colour as accent (header rule, active nav, map region). This is free wayfinding. |
| Type scale | The H2 is 21 px but labels are 12 px and help text 11–12 px; the display font appears only in headings | Labels 13 px/500, help 12.5 px. The display font (Space Grotesk) also goes on planner names, map labels and numbers. |
| Inspectors | Collection inspector, map ObjectPanel and wireframe inspector are three different panel designs | One `Sheet` component with a shared header (title · type chip · prev/next · overflow · close) |

### Accessibility
- **Colour contrast:** body and muted text pass AA on dark (muted ≈ 6:1). The coloured legend chips on the system map ("Has open tips", 11 px) are borderline. Keep text in `--text` and colour only the chip border or dot.
- **Touch targets:** many controls are 24–28 px (`small`, ↑ ↓ in the inspector, hint "…"). The v3 minimum is 32 px (36 px for icon-only).
- **Text readability:** a 12 px label above a 12 px help line above an input is dense. Use 13 px labels and put help behind ⓘ for `detail` fields.
- **Keyboard:** solid today (focus rings, drawer focus return). v3 adds shortcuts, and needs an accessible list view as an equal alternative to every map or canvas navigator.

### What works well
- **Guidance content:** concept cards, examples with previews, hints with personality, and the walkthrough are genuinely useful and rare in tools like this.
- **System maps** per planner already describe the information architecture. v3 only has to promote them.
- **Specialised views** (threat curve, weaknesses, map editor, wireframes) make the data visual. That is the "wow" material.
- **Undo-safe everything**, autosave and restore, Markdown export: trustworthy foundations.
- **Design tokens** (`--surface-*`, `--space-*`, `--phase-*`, motion tokens) make a re-skin cheap.

### Priority recommendations
1. **Give the work surface the screen**: layout budget, a sheet inspector, one sticky section header. This fixes the 95 px table and the 586 px chrome.
2. **Progressive fields**: core vs detail tiers, so a newcomer sees 3–6 fields, not 26.
3. **Make the map the navigation**: the Atlas and section maps with semantic zoom. It's unique, interactive, and explains the structure while you move.

---

## The Version 3 concept: "The Design Atlas"

> Your game design is a world you explore. Each planner is a **region**, each section a **landmark**, the links between them are **roads**. Unfilled parts lie under **fog**; filling them in reveals the map. The walkthrough is the **route** lit across it.

This fits a game-design tool, nobody else does it, and it does three jobs at once:

| Goal | How the Atlas delivers it |
|---|---|
| **Eye-catching** | A living, animated map is the first thing you see. It changes as the project grows (fog clears, regions get colour, landmarks get icons). Screenshots of it *are* the marketing. |
| **Not overwhelming** | Fog hides what you haven't reached. Guided mode shows only the next 3 lit landmarks. Fields come in tiers. Help appears on demand. |
| **Interactive, clear navigation** | Semantic zoom: Atlas → Region → Landmark → Record, with breadcrumbs, ⌘K, J/K and a mini-map you can always see. |
| **Unique** | Fog of war, route lines, phase-coloured regions, parchment and blueprint styling shared with the location map renderer. |

### Visual language
- **Two materials:** *Blueprint* for the app chrome (deep ink `--surface-0`, faint 18 px dot grid as on the map canvas, hairline cyan-grey lines) and *Parchment* for content you've created (cards, filled nodes and the record sheet header get a subtle warm paper tint in the dark theme; full parchment in light). Filling in the design literally turns blueprint into paper.
- **Phase colours as region colours, chrome stays monochrome:** Concept violet, Systems blue, Content teal, Production amber, Polish rose (existing `--phase-*`). They appear only where they help you find your way: Atlas regions and landmarks, the planner map, and the current planner's header rule and eyebrow. Navigation chrome (rail, toolbar, buttons) is grey and white. Amber (`--brand`) is reserved for "you are here" and the next action: the current-step button, the route and the primary button. *(Prototype review: the coloured 1–5 phase dots read as noise.)*
- **Minimal, labelled controls:** every rail item is a line icon with a short label underneath. Icon-only buttons are fine in the top bar when their meaning is universal (theme, search) and they have a tooltip and an accessible name.
- **Type:** Space Grotesk for planner and section names, numbers and map labels; system UI for body. Scale: 28 / 20 / 16 / 14 / 13 / 12.
- **Motion** (existing motion tokens, reduced-motion safe):
  - Atlas → planner: a 420 ms zoom into the region.
  - Fog dissolves when a section reaches "started".
  - Route segments draw when a step completes.
  - Sheets slide in 240 ms.
- **Mascots** (see MASCOT_PLAN) live in empty states and on the Atlas, never in forms.

### App layout (all screens)

```
┌────────────────────────────────────────────────────────────────────────────────────┐
│ ◆ Hands of Hubris │ Atlas / Combat / Enemies      (•)  ⌕ Jump to…  Guided|Studio  ● Saved  ☀ │ ← 56px
├──────┬───────────────────────────────────────────────────────────────────┬─────────┤
│  ◎   │  ENEMIES                       ◐ 4/11 filled   Table▾  ⋯           │   ! 3   │
│ Atlas│  ○─●─◐─[●]─○─○─○  ← section strip (mini map of this planner)        │   Guide │
│──────├───────────────────────────────────────────────────────────────────┤   AI    │
│  ✎   │                                                                   │         │
│Concept                  W O R K   S U R F A C E                          │ compan- │
│  ⋔   │          (table / form / diagram / map: ≥ 60% width)              │ ion     │
│Systems                                                                   │ tray    │
│  ▲   │                                                                   │         │
│Content                                                                   │         │
│  ⚒   │                                                                   │         │
│Product.                                                                  │         │
│  ◇   │                                                                   │         │
│Polish│                                                                   │         │
│  ⚙   │                                                                   │         │
│Settings                                                                  │         │
└──────┴───────────────────────────────────────────────────────────────────┴─────────┘
 phase compass (72px, labelled)                                          56px tray
 (•) = current-step button   ☀/☾ = theme toggle   (glyphs above stand in for line icons)
```

- **Command bar (56 px):**
  - **Project name:** always on one line (`white-space: nowrap; flex: none`). When space runs out, the breadcrumb shrinks instead.
  - **Breadcrumb with dropdowns:** each crumb lists its siblings.
  - **Current-step button:** a 36 px circle with a pulsing amber dot, the same size as the theme button. Its tooltip is the step's hint, its accessible name is "Current walkthrough step: …", and a click opens the step. It is visible on every screen and in both modes, so the walkthrough is never more than one click away.
  - ⌘K palette, the Guided/Studio switch and the save state.
  - **Theme toggle:** a sun/moon button that switches light and dark mode, labelled with the mode it switches to. Undo and redo stay as icon buttons.
- **Phase compass (72 px rail):**
  - Monochrome line icons, each with a short label under it: **Atlas** (compass), **Concept** (pencil), **Systems** (connected nodes), **Content** (landscape), **Production** (wrench), **Polish** (gem), and **Settings** (a gear, not a sun; the earlier icon read as a theme switch).
  - Each phase has a 2 px grey progress track under its label. Hovering shows "Systems planners · 10% explored".
  - The active item turns white with a 2 px marker on its left edge. No phase colours in the rail.
  - Hovering or focusing a phase opens a **flyout** of its planners, each with a fill ring and hint badge, lined up with the button. It replaces the flat 30-item list. Pinned planners, Glossary and Issues sit between the phases and Settings.
- **Section header (sticky, ≤ 120 px):**
  - title in the display font
  - fill ring
  - view switcher as a dropdown when there are more than 3 views
  - ⋯ overflow (Markdown, export, CSV, help)
  - ⓘ concept popover
  - below it, the **section strip**: this planner's system map flattened into a chain of nodes (○ ◐ ●). Click to go, hover for a preview, `M` opens the full planner map as an overlay.
- **Companion tray (56 px):** Hints (badge), Guide, AI. It opens as a 360 px overlay sheet. On ≥ 1440 px screens it can be pinned to dock.
- **Work surface:** borderless canvas; the section's content owns it.

**Layout budget** (enforced by the shell grid, tested):

| Viewport | Compass | Work surface | Companion | Inspector |
|---|---|---|---|---|
| ≥ 1440 | 72 | fills (≥ 900) | tray, or dock 360 if pinned | sheet 520 over the surface, or split 40% if pinned |
| 1024–1439 | 72 | fills (≥ 880) | tray (overlay) | sheet 480 (overlay) |
| 768–1023 | 72 | fills | tray | full-height sheet 90% |
| < 768 | bottom bar | full | bottom sheet | full-screen page |

### Screen 1: the Atlas (replaces the home page)

```
┌────────────────────────────── the Atlas ─────────────────────────────────────┐
│ GAME DESIGN ATLAS                                   ┌──┐  Wanderer            │
│ Hands of Hubris                                     │♞ │  ▬▭▭▭▭▭▭▭  [Map|List] │
│ Fog lifts as you fill planners in…                  └──┘  9% explored         │
│ ┌─ ● WALKTHROUGH · STEP 6 OF 33 · Vision & Concept › One-sentence pitch ───┐ │
│ │   Write the pitch                                                         │ │
│ │   One sentence: who the player is, what they do and why it is fun…        │ │
│ │                                          [Open step ▶]  [Mark done]       │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│  ╭─ 1 · CONCEPT ─╮        ╭──── 2 · SYSTEMS ────╮      ░░░ 4 · PRODUCTION ░░░  │
│  │ ● Vision ━━━━━━━━━━━━━━━▶ ◐ Core loop ━━━━━━━━┓   ░  (fog: not reached) ░  │
│  ╰───────────────╯        ╰─────────────────────╯ ┃   ░░░░░░░░░░░░░░░░░░░░░░  │
│      ▲ "You are here · Write the pitch" (follows the current step)          │
│  ━ route walked   ┅ route ahead   ─ planners feed each other   ○ ◐ ●        │
└──────────────────────────────────────────────────────────────────────────────┘
```
- **Current-step card** under the title: step number ("step 6 of 33"), where the step lives, its title and the full hint, plus **Open step** (primary) and **Mark done**. The same step drives the top-bar step button, the "You are here" marker and pulsing landmark on the map, the Next-step pill, and the banner inside the step's section, which also has Mark done. *(Prototype review: "the current walkthrough hint should be visible somewhere".)*
- **Design emblem** (replaces the plain "Explored %" ring): a small figure that is built up by your progress, one part per phase. It is deliberately minimal:
  - **Layout:** the figure at 72×84 with a soft amber glow; next to it the **rank** title (20 px), a 4 px amber progress line and "9% explored" in tabular numbers.
  - **The next part:** what to fill next appears only as a hover tooltip ("Fill Concept planners to forge the helmet. Next rank, Squire, at 10%.").
  - **Part states:** a dashed grey ghost (phase not started), an outline in the phase colour (started), filled in proportion to the phase's fill (done = solid). Polish adds an aura.
  - **Genre decides the figure.** It is set once in Settings from the project's genres; a mixed genre uses the first one picked. There is no genre switch on the Atlas.
    - **RPG knight:** helmet, armor, sword and shield, cape and boots, plume and aura.
    - **Survival camp:** tent, firewood, fire, forest, night sky.
    - **Strategy castle:** keep, walls, gate, towers, banner.
  - **Ranks** at 0 / 10 / 25 / 50 / 75 % explored:
    - RPG: Wanderer, Squire, Knight, Champion, Legend
    - Survival: Castaway, Scavenger, Settler, Pathfinder, Warden
    - Strategy: Outpost, Hamlet, Stronghold, Citadel, Empire
  - **Celebration:** completing a part shows a short toast ("Armor forged!"). Respects reduced motion.
  - *(Prototype review: the first version, with phase bars, a genre switch and a preview slider, was too busy and was cut back to figure, rank and progress.)*
- Planners are **regions** grouped by phase. Inside each, sections are **landmarks** (dots) with state glyphs.
- Arrows between regions come from the existing cross-document links in the system maps ("Other document" nodes).
- The **route** is the walkthrough path. The current step pulses, and **Continue ▶** is the single primary action on the page.
- **Fog:** regions whose planners haven't been started are desaturated and veiled; recommended ones (from genres) are veiled less. Fog is only visual: everything stays clickable.
- **Zoom in:** clicking a region zooms into the planner map (Screen 2). Scrolling or pinching zooms. The breadcrumb shows `Atlas`.
- **List ☰** gives the accessible equivalent: grouped planners with state, the same data. It is remembered per user.

### Screen 2: the planner map
The existing per-planner system map at full size. It's the landing screen when you open a planner, not a strip above section 1.
- Nodes show fill state, entry counts ("Enemies · 6"), hint badges and the walkthrough step marker.
- Hovering a node gives a peek card (first 3 entries or fields, last edit). Clicking it opens the section. Edges show "feeds" labels on hover.
- "Other document" nodes link out to the neighbouring planner, so the user can walk between regions without going back to the Atlas.

### Screen 3: the section (work surface)
- **Forms (e.g. Vision):** a single comfortable column (max 720 px) centred on the surface, with core fields first. Detail groups are collapsed chips ("+ Platform constraints", "+ Monetization detail"). Each field has an inline completion tick; the help line moves behind ⓘ once filled.
- **Collections (e.g. Enemies):** the table or cards keep the full width. Selecting a row opens the **record sheet**:
  - **header:** name (inline editable) · type chip · `‹ ›` to step through records · ⋯ · ×
  - **body:** tabs for the field groups (Identity · Stats · Behavior · Reward), each with a fill count
  - **core fields** on the Identity tab first
  - **"Used by"** and links as a footer tab
  - **Expand ⤢** turns the sheet into a full record page (deep-linkable)
- **Visual views and visual editors carry over unchanged.** v3 changes the frame around them, not the editors:
  - **Which views:** the Locations map editor, wireframe editor, threat curve, weaknesses, skill tree, quest flow and every other specialised view.
  - **Where they live:** a section's views sit in its view switcher, as Table / Cards / Threat curve do for Enemies in the prototype.
  - **Shared canvas pattern:** the Locations map editor's layout (redesigned 2026-11-19) becomes the pattern for every canvas-style view. That means a tool rail with single-key shortcuts, a canvas that fills the surface with zoom and pan, a tabbed side panel (Selection, Layers, Inputs …) and a full-screen button. Build it once as a shared `CanvasEditorFrame` in Phase 1, then move the map editor, wireframe editor and diagram views onto it.

### Screen 4: the companion
- **Hints:**
  - grouped *This section* → *This planner* → *Elsewhere*
  - grace period for new entries
  - each hint has one action: a "Fix ▸" link that jumps and highlights the field
- **Guide:** the concept card and walkthrough step for the current section, plus the examples gallery.
- **AI:** unchanged features, as a chat sheet that knows the current section.

### Navigation model (interactive and clear)
| Need | v3 answer |
|---|---|
| Where am I? | Breadcrumb `Atlas › Combat › Enemies › Ghoul`, phase colour, highlighted node in the section strip |
| Where can I go? | Section strip (siblings), breadcrumb dropdowns (siblings at every level), compass flyouts (all planners), map edges ("feeds" links) |
| Jump anywhere | **⌘K palette**: planners, sections, records ("ghoul"), actions ("add enemy", "export markdown", "toggle theme"), recent items |
| Step through | `J`/`K` previous/next section · `[` `]` previous/next record · `M` planner map · `A` Atlas · `.` companion · `Esc` closes the sheet |
| What next? | A floating **Next step pill** at the bottom centre (from the walkthrough), dismissible; `N` jumps to it |
| Go back | Browser back works at every zoom level (URL encodes `doc`, `s`, record id, view) |

### Newcomer vs expert: two modes, one UI
- **Guided** (default for new projects): Atlas fog on, only core fields, Companion opens on first visit to each planner, Next-step pill visible, example-first empty states.
- **Studio** (toggle in the palette or settings; offered after ~10 filled sections): no fog, every field tier, the companion stays in the tray, denser tables, all shortcuts in tooltips.
- Both are the same components with different defaults. Nothing is hidden from Studio users and nothing is lost in Guided.

---

## Implementation plan

Ship behind a setting `ui.version: 'v2' | 'v3'` (default v2 until Phase 2 lands), so every phase can merge without breaking the current UI or the tests that query it.

### Phase 0: foundations (≈ 1 week). **Done 2026-11-19**

> **What shipped:**
> - **The switch:** `core/uiVersion.ts` stores Classic vs Design Atlas as a per-browser preference under Settings › General › Interface (default Classic), and `ui/Shell.tsx` picks the shell from it.
> - **Layout budget:** `core/shellLayout.ts`, a pure function the shell uses directly.
> - **Search:** `core/palette.ts` indexes every planner, section and named entry, and `ui/v3/CommandPalette.tsx` searches it with Ctrl K and arrow keys. Entry results open the entry via `?e=`, which `CollectionEditor` now reads.
> - **Components:** `ui/v3/Sheet.tsx` and `ui/v3/AppShellV3.tsx`, the latter with a one-line command bar, theme toggle, labelled rail and companion tray.
> - **Shared code:** the save status, Save menu and global shortcuts became shared exports of `AppShell.tsx`.
> - **CSS:** v3 tokens and component styles at the end of `styles.css`.
> - **Text and tests:** `v3.*` strings in en/hu. `tests/v3Shell.test.ts` covers the index, ranking and layout budget; `tests/v3ShellUi.test.tsx` covers the Settings switch, palette jumps, theme and the Sheet's focus behaviour.
>
> **Not done yet:** existing pages render unchanged inside the new frame, and the companion tray holds only Hints. Phase 1 starts the real editor frame.
- Tokens v3: surface roles (`canvas`/`sheet`/`note`), 32 px control minimum, type scale, phase-accent variable `--accent-phase` set per planner, blueprint grid background utility.
- **Light and dark from tokens:** every v3 colour comes from the existing token sets (`:root` and `:root[data-theme=light]` in `src/styles.css`), and the top-bar theme toggle drives `data-theme`. The prototype's light mode inverts the dark palette (`filter: invert(1) hue-rotate(180deg)`); that is a stand-in only and must not ship. Phase colours need light-theme variants with ≥ 4.5:1 contrast for text such as region names and eyebrows.
- `AppShellV3` grid with the layout budget above (CSS grid + container queries). Panel state (compass flyout, companion docked or tray, inspector pinned) persisted in settings.
- `Sheet` component (overlay or split, focus trap, Esc, prev/next slots) to replace Inspector, ObjectPanel and the wireframe inspector shells.
- `CommandPalette` (⌘K) over the module registry, sections, entities (name index) and actions.
- **Tests:** a layout-budget test (work surface ≥ 60% at 1024/1440 in jsdom with mocked widths), palette search, sheet focus handling.

### Phase 1: the editor frame (≈ 1–2 weeks). **Part 1a done 2026-11-19**

> **Part 1a shipped (v3 preview only):**
> - **`EditorPageV3`** (picked by `EditorRoute`):
>   - **Header:** a compact sticky header with planner, title, state (○ ◐ ●, hint count) and an ⓘ about panel holding the description and concept. Insert example stays as a button; Markdown, export, import and help moved into a ⋯ menu.
>   - **Walkthrough step:** shown as before when this section is one.
>   - **Section strip:** a strip of all sections with state glyphs, pulled forward from Phase 2.
>   - **System map:** opens in a sheet.
>   - **Hints:** the classic sidebar, map strip and hint column are gone. Hints open from the companion tray as a sheet for the current planner.
> - **Record sheet:**
>   - entries open in a `Sheet` over the view, so the view keeps its width
>   - Name sits above the tabs
>   - field groups become tabs with fill counts, plus a Links tab (Used by, gate/item/combat links)
>   - ‹ › steps through entries in view order; Duplicate and Delete are in the footer
> - **Field tiers:** `FieldDef.tier` (schema metadata, nothing stored), with `coreFieldKeys` / `splitByTier` in `core/fieldTier.ts`. Required fields plus the first group's leading fields, up to 3, are core; fields marked core are added on top; empty detail fields become "+ field" chips that open and focus the field. First spot fix: enemy HP, damage and attack rate.
> - **Forms:** a centred 720 px column using the same tier rule.
> - **`sectionStates`** in `core/progress.ts`: the system map's empty/started/done rule, now shared.
>
> **Measured at 1024×768 (Combat › Enemies):**
> - Space above the data: 586 → **192 px**.
> - View width: 427 → **828 px**, and it stays that width with a record open (was 95 px).
> - A new enemy shows **3 inputs** (was 26).
>
> **Part 1b done 2026-11-19:**
> - **Collection tools in the header:**
>   - The views, the filter (a search button that expands), CSV and Add render into a slot in the section header (`ui/v3/sectionTools.ts`, React portal).
>   - The section state and entry count moved into the line above the title, which truncates and shows everything on hover.
>   - Insert example is an icon button.
>   - At 1024×768 the space above the data is now **128 px** (target ≤ 160).
> - **Walkthrough targets:**
>   - Spotlight now finds targets in the v3 page as well (`:is(.content, .editor3)`); before, tours found nothing there.
>   - A detail field hidden behind a chip passes its tour target to the chip.
> - **Hints grace period:** `useFreshEntries` and `withoutFresh` in `ui/hints/useHints.ts`. A new entry gets no hints until the user leaves it or 60 s pass. Opening it as a page doesn't count as leaving, and the section strip's badges follow the same rule.
> - **Expand to page:** `?r=<id>` shows the record full-width in place of the view (deep-linkable). ‹ › moves the page along, Collapse returns to the sheet, and Close goes back to the list.
> - **`CanvasEditorFrame`** (`ui/v3/CanvasEditorFrame.tsx`):
>   - the presentational bar, rail, canvas and tabbed side panel, with panel and full-screen buttons
>   - the editor keeps its own state
>   - the Locations map editor now uses it, all 188 location tests unchanged; its frame classes moved from `loc-*` to `cframe-*`
>
> **Still open:**
> - **Per-planner tier pass:** only enemies are marked so far; the default rule covers the rest.
> - **Wireframe editor:** moving it onto `CanvasEditorFrame` belongs with the Phase 3/4 canvas work.
- `SectionHeader` (sticky): title, fill ring, view dropdown, overflow, ⓘ concept popover, conditional walkthrough banner. Remove the per-section toolbar and the map thumbnail from the page flow.
- **Field tiers:** optional `tier?: 'core' | 'detail'` on `FieldDef` (default: `required` or first 3 fields of the first group → core). No data migration, since this is schema metadata only. Tiers are tagged per module in `src/modules/*` (a review pass for each of the ~30 planners, cheapest with a heuristic plus spot fixes).
- Collection Inspector → record sheet with group tabs, `‹ ›` stepping, Expand to page (route `?r=<id>`).
- Forms: centred 720 px column, collapsed detail chips.
- Hints: grace period and badge counts (store-level timestamp per entity).
- `CanvasEditorFrame`: extract the Locations map editor's layout (tool rail, zoomable canvas, tabbed side panel, full screen) into a shared component. Move the map editor onto it first, its tests unchanged, then the wireframe editor.
- **Target:** chrome above content ≤ 160 px at 1024×768 (now 586); table ≥ 640 px wide with a record open (now 95).

### Phase 2: navigation (≈ 1–2 weeks). **Done 2026-11-19**

> **Shipped (v3 preview only):**
> - **Phase compass** (`core/compass.ts`, `ui/v3/PhaseCompass.tsx`):
>   - Every planner sits in the phase of the first walkthrough step that opens it, else in its group's phase, so the compass follows the genre-tailored walkthrough.
>   - The rail has Atlas, then the five phases as labelled line icons with a thin fill track, then Issues and Settings.
>   - The phase of the planner on screen is marked.
>   - Each phase opens a flyout of its planners with fill rings and hint counts; it closes on Esc, a click outside or navigation.
> - **Breadcrumb** (`Breadcrumb.tsx`): Atlas / planner ▾ / section ▾ / entry. The planner menu lists the same phase's planners and the section menu the planner's sections; their accessible names say what is current.
> - **Current-step button and Next-step pill** (`NextStep.tsx`): the 36 px pulsing circle in the command bar, and a pill at the bottom. The pill hides on the step's own page and can be dismissed until the step changes.
> - **Shortcuts** (`shortcuts.ts`, pure `shortcutAction`):
>   - J / K sections, M section map, A Atlas, N next step, `.` hints, `/` search.
>   - They listen on `window` after page handlers, so the map editor's tool keys (K = Keep area) win there.
>   - They're off while typing, with modifiers, or with a modal open.
>   - They're listed in the palette footer.
> - **Tests:** `tests/v3Nav.test.ts` and `tests/v3NavUi.test.tsx`.
>
> **Default flipped (user decision):** the Design Atlas is now the default interface. No stored choice means v3, and Classic is stored explicitly (`hohplan:uiVersion = v2`), so people who never chose follow future defaults. Settings › General › Interface reads "Classic | Design Atlas" without "(preview)". The test setup (`tests/setup.ts`) starts each test in Classic, because most UI tests cover it and it stays available; the v3 tests choose v3, and `tests/v3ShellUi.test.tsx` checks that a fresh browser gets v3.
>
> **Not done:**
> - **The Guided/Studio switch:** waits for the modes (Phase 4).
> - **Section strip:** still in section order rather than the system map's topological order.
> - **Flyout hint counts:** they include "section is empty" hints, so untouched planners show large numbers. Consider counting only started planners, or only non-empty-section hints.
- Phase compass rail: monochrome labelled line icons (Atlas, Concept, Systems, Content, Production, Polish, Settings), 2 px progress tracks, an active marker, plus planner flyouts (fill rings from the existing progress code; hint badges from the hints engine).
- Command bar: one-line project name, the 36 px current-step button wired to the walkthrough (`useGuideUi` / guide progress), the theme toggle and the Guided/Studio switch.
- Section strip: flatten each guide's `map` into an ordered node chain (topological order of the system map, falling back to section order), with state glyphs and hover peek.
- Breadcrumb with sibling dropdowns; keyboard shortcuts; Next-step pill.
- Flip the default to `v3` for new projects at the end of this phase.

### Phase 3: the Atlas (≈ 2 weeks). **Done 2026-11-19, except the zoom transition polish and the part toast**

> **Shipped** (`core/atlas.ts`, `core/emblem.ts`, `ui/v3/Atlas.tsx`, `ui/v3/Emblem.tsx`; the home route is `HomeRoute` in `ui/Shell.tsx`):
> - **Layout:**
>   - Regions per phase in a fixed 1200 × 680 box, sized for the planner counts (Concept 3, Core systems 12, Content 5, Production 14, Polish & ship 4).
>   - Planners sit in a grid inside their region, ordered by when the walkthrough reaches them. This is a deterministic layout instead of a hand-tuned coordinate file, so new planners place themselves.
>   - The map has a 1120 px minimum width and scrolls sideways on smaller screens.
> - **Links:** taken from every system map's "other planner" nodes, each pair once, drawn faintly.
> - **Route:** the walkthrough's path through planners in first-visit order. It's solid up to the current step's planner and a marching dashed line after it, and that planner pulses with a "You are here" label.
> - **Fog:** a phase is fogged when none of its planners is started and the walkthrough hasn't reached it. Fog only dims; everything stays clickable.
> - **Step card:** the next walkthrough step with Open step, Mark done (one undo step) and Skip for optional steps. The Next-step pill is hidden on the Atlas, since the card replaces it.
> - **Emblem:** the minimal design from the prototype review, with the figure taken from the project's first genre (Settings › Genre).
> - **List view:** a list grouped by phase as the accessible equal of the map, remembered per browser.
> - **Kept from the classic home page:** the autosave-restore banner, and the full walkthrough with its Hints and AI tabs in a collapsed "The whole walkthrough, hints and AI" section.
> - **Zoom into a planner:** landmarks use React Router's `viewTransition`, and the CSS zooms the new page in where the View Transitions API exists (none under reduced motion).
>
> **Not done:**
> - The completion toast when a part of the emblem is finished.
> - Landmark positions inside planners taken from each planner's system map (planners are single landmarks for now).
> - A shared-element zoom from the landmark into the planner page; it's a cross-fade with a zoom for now.
- Atlas layout: regions per phase, planner positions from a hand-tuned layout file (stable, art-directed) rather than force layout. Landmarks inside are positioned from each planner's existing guide map coordinates, scaled down.
- Inter-planner edges from the guide maps' "other document" nodes. Route from the walkthrough order.
- Fog rendering (SVG mask plus blur filter, reduced-motion fallback to opacity), semantic zoom into the planner map (shared-element transition via the View Transitions API with a CSS fallback).
- List view as an equal alternative (`role="tree"`).
- Home becomes the Atlas, and the v2 GuideCenter content moves into the current-step card and the companion.
- Design emblem: three figure sets (RPG, Survival, Strategy) as SVG with one group per phase. A `genre → figure` mapping in Settings reads the project's genres, and other genres fall back to RPG until they get figures. Part state comes from the phase fill used by the compass, rank from the explored share, and a completion toast appears when a part reaches 100%.

### Phase 4: companion and empty states (≈ 1 week). **Done 2026-11-19**

> **Shipped:**
> - **Companion** (`ui/v3/Companion.tsx`):
>   - The classic hints panel already combined Hints, Guide and AI tabs (with "Explain with AI"), so it gained an `embedded` mode (no resize handle or collapse toggle) instead of a second implementation.
>   - The tray has Hints (with count), Guide and AI. Each opens the companion on that tab, and the tray marks the open tab.
>   - It's an overlay sheet that closes when you move to another page.
>   - At ≥ 1440 px it can be pinned. Pinned, it docks as a 360 px column through `shellLayout`, replacing the tray, and stays open across pages. The pin is remembered per browser.
> - **Hint links:** in v3, "Go" on a hint about one entry opens that entry's record sheet (`?e=`). Hints carry no field id, so the jump goes to the entry, not a single field.
> - **Guided / Studio** (`core/uiMode.ts`, per browser):
>   - The switch is in the command bar, and the palette can toggle it too.
>   - Guided (the default) keeps detail fields behind chips, fog on the Atlas, the Next-step pill and example-first empty states. Studio shows every field and drops the fog, the pill and the example-first order.
>   - Guided suggests Studio once, on the Atlas, after 10 finished walkthrough steps; "No thanks" is remembered.
>   - The trigger isn't the plan's "~10 filled sections": the sample project's seed data already fills 14, so every newcomer would have been offered Studio straight away.
> - **Empty states:** in v3 Guided, a section with examples offers "Start from an example" as the primary action and "Start blank" second. Tour targets stay on the same actions.
> - **Fixed along the way:** closing a record sheet drops `?e=` from the address, so following the same link to the entry opens it again.
> - **Tests:** `tests/v3CompanionUi.test.tsx`. The shared test setup also resets mode, pin and suggestion per test.
>
> **Not done:**
> - Opening the companion automatically on a planner's first visit in Guided.
> - Mascot art in the empty states beyond the existing Hubi aside.
- Merge Hints / Guide / AI into the Companion sheet with tray badges. "Fix ▸" deep links highlight the target field.
- Example-first empty states with mascot art; Guided vs Studio modes and the mode prompt.

### Phase 5: polish (ongoing)
- Motion pass (zoom, fog dissolve, route draw, sheet slide), light theme "parchment" variant of the Atlas, sound off by default.
- Accessibility audit (axe plus a keyboard-only run of: open planner → add record → fill core → next section), screen-reader labels for map nodes, 200% zoom check.
- Before/after screenshots into `design-critique/v3-after-*.jpg` at 1024/1440/375.

> **Shipped (Phase 5, first pass):**
> - **Motion:** fog dissolves (opacity, fill and filter transitions on regions and landmarks), walked route segments draw in (`pathLength=1` plus a dash animation), and the sheet slides in. All of it falls under the global reduced-motion rule. No sound was added.
> - **Parchment:** the light theme gives the Atlas a warm paper (`--atlas-paper`, `--atlas-dot`), an inset edge, and region labels cut out against the paper. A test holds every phase colour to 4.5:1 or better, both on the parchment and on the dark canvas.
> - **Accessibility audit:** `tests/v3A11y.test.tsx` runs a scripted check, not axe, using `dom-accessibility-api`, which is installed with Testing Library. It checks that every control has a name, that ids are unique, and that every ARIA reference resolves. It covers the Atlas (map, list and flyout), the record sheet, the record page, the section map, the companion tabs, the palette and a form section. It found and fixed these problems:
>   - Table cells had no names. Each cell is now labelled "Field: entry", for example "HP: Ghoul".
>   - The companion tabs pointed `aria-controls` at panels that weren't rendered.
>   - Focus was lost after J/K and after closing a sheet. The section heading now takes focus, and closing a sheet returns focus to its opener or, failing that, to the heading.
>   - The section strip and the record tabs each took one tab stop per item. Each is now a single roving tab stop moved with ←/→/Home/End.
> - **Keyboard-only run, in the browser:** search → section → J/K → "Start blank" → type a name → Biome and Role → Esc → J to the next section, all without a mouse. Fixed along the way: a new entry's placeholder name ("New enemy") is now selected when the sheet opens, so typing replaces it instead of appending.
> - **200% zoom (720×450) and phone (375):**
>   - The compact layout with the bottom phase bar holds at both sizes.
>   - The next-step pill now sits above the bottom bar instead of covering two phases.
>   - On phones the command bar hides the mode switch, redo and theme. All three stay in the palette and Settings. Before this the bar pushed the page to 515 px.
>   - The section strip uses `contain:paint`, because its scrolled-off pills widened the page in Chrome.
>   - On phones the pill shows only the step title.
> - **After screenshots:** `design-critique/v3-after-{1440,1024,375}-{atlas,record}.jpg` and `v3-after-zoom200.jpg`.
>
> **Not done:**
> - An axe run and a real screen-reader pass (NVDA or VoiceOver). The scripted audit doesn't replace either one.
> - On phones the breadcrumb clips to "Atl…", "Production" breaks across two lines in the bottom bar, and the record sheet leaves an empty band above its header.
> - Sound (off by default) is still only an idea.

### Success measures
| Measure | v2 today | v3 target |
|---|---|---|
| Chrome above content at 1024×768 | 586 px | ≤ 160 px |
| Work surface width with a record open, 1024 px | 95 px (table) | ≥ 640 px |
| Inputs visible on a new record | 26 | ≤ 6 (Guided) |
| Hint cards right after "Add" | 4 | 0 (until blur / 60 s) |
| Clicks from anywhere to any section | 2–4 (home → planner → section) | ≤ 2 (⌘K or compass flyout) |
| Primary buttons visible per screen | 3–5 | 1 |

### Risks and mitigations
- **Map navigation can be slower than a list for experts.** ⌘K, compass flyouts and the List view are always one key away, and Studio mode turns off fog.
- **Tests query today's DOM** (labels like "Map", "Delete", region names). The `ui.version` flag keeps v2 green; v3 components keep the same accessible names where they keep the same role.
- **Tiering 30 planners is content work.** The heuristic default plus per-module overrides lets tiers land incrementally, planner by planner.
- **Atlas performance** (30 regions × ≈ 10 landmarks): static SVG with memoised layout, under ~400 nodes. No canvas or WebGL needed.
- **Scope creep:** every phase ships on its own behind the flag; Phase 3 (Atlas) is the only large new surface.
- **Gamification can feel childish** to some teams. The emblem stays small and quiet (no pop-ups beyond the part toast), and Settings can turn it off.

---

## Prototype review decisions (2026-11-19)

Feedback left as comments on the [prototype canvas](https://claude.ai/artifact/PYVH5tzuBwk3oa8NTZjKHJ), and what changed in the prototype and in this plan:

| Feedback | Decision | Where in the plan |
|---|---|---|
| The current walkthrough hint should be visible somewhere | Current-step card on the Atlas; a current-step button in the top bar on every screen; the "You are here" marker and section banner follow the step | Command bar; Screen 1 |
| Build a gaming figure from the progress, maybe based on genre | Design emblem: one part per phase, genre picks the figure, rank titles | Screen 1 |
| The emblem should be more minimal | Cut to figure, rank, a thin progress line and the %; next hint as a tooltip; genre set in Settings, not on the Atlas | Screen 1 |
| The Settings icon looked like a light/dark switch, and a real one is needed | Gear icon for Settings; a separate sun/moon theme toggle in the top bar | App layout; Phase 0 |
| The 1–5 phase items say too little and are too colourful | Labelled monochrome line icons; colour only on the map and planner headers | Visual language; App layout |
| The project name should be one line | `nowrap`, no fixed size; the breadcrumb shrinks instead | Command bar |
| The step button should be a symmetrical circle | 36 px circle with a centred pulsing dot; text moved to tooltip and accessible name | Command bar |
| Will visual editors like the Locations map stay? | Yes, all of them; the map editor's layout becomes the shared canvas pattern | Screen 3; Phase 1 |
