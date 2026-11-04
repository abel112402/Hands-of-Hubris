# Editor upgrade guide (for AI agents)

How to raise a planner module (editor) to "v2" with domain logic, checks and visual/interactive guides. Reference implementations: **Player Character** (`design.player`, editor plus full guide) and **NPC System** (`design.npc`, editor only). Copy their patterns; don't invent new ones.

## 0. Analyse first
1. Read the doc template `../docs/01_design/<name>.md` and the module in `src/modules/design.ts` (`mod('design', '<key>', …)`).
2. List these, then write a short plan before coding:
   - doc chapters with no section, or in the wrong order (export follows section order)
   - free-text fields that should be refs to other modules or catalogs
   - numbers a designer needs but can't see (pacing, budgets, balance)
   - questions the designer can't answer with the editor today
   - bugs, e.g. a view whose field meaning doesn't match its data

## 1. Schema v2 (`src/modules/design.ts`)
- Wrap the module as `{ ...mod(...), version: 2, migrate: migrate<Name> }` and put the sections in **doc-chapter order**.
- **Keep existing section ids and field keys.** Other modules may reference them (search for `section('<id>', '<docId>')`).
- Use refs and multirefs to sections of other modules (`section('items', 'design.items')`) and to catalogs (`catalog('…')`) instead of free text.
- Add `help`/`placeholder` to non-obvious fields. Use `group: '…'` to make collapsible inspector groups when an entity has 6+ fields.
- Map fields can take their range from a form: `f.map(key, label, src, undefined, { rangeFrom: { section, minField, maxField } })`.
- The `migrate(data)` function mutates v1 data in place:
  - Move moved fields.
  - Wrap single values into arrays.
  - Put free text that can't become a ref into `legacyNotes`, and add a `legacyNotes` field so it stays visible.
  - When converting graph nodes to entities, **keep their ids** so references keep resolving.
  - Follow `migratePlayer`, `migrateNpc` and `migrateFactions`.

## 2. Analysis core (`src/core/<name>.ts`)
- Pure functions over `Project` with no React. Export `<NAME>_DOC`, list helpers, scale or settings readers with defaults, and one function per question:
  - calculations: `timeToCritical`, `levelTable`, `needsBalance`, `treeAnalysis`, `buildState`
  - coverage: entries missing a rule, link or source
- Reuse what already exists:
  - `tryEvaluate` / `variablesOf` (`core/formula.ts`) for formulas; catalog ids map to variables via `statVar` in `core/npc.ts`
  - `analyzeRanges` (`core/diplomacy.ts`) for min/max levels
  - `estimateTown` (`core/town.ts`) and the Difficulty helpers (`core/difficulty.ts`) for cross-module numbers
- These are planning estimates, not simulations. Say so in the UI text.

## 3. Views
- Add the kind to `CollectionView` in `src/core/model/types.ts`, a helper in `v` in `src/modules/helpers.ts`, and a label and dispatch in `src/ui/editors/CollectionEditor.tsx`.
- Write the components in `src/ui/editors/<name>Views.tsx` (see `playerViews.tsx`, `npcViews.tsx`). They take `ViewProps`, read through `useProject()`, and use Recharts for charts or plain SVG for trees and maps.
- Patterns that worked:
  - a chart plus a table of the key numbers
  - a selector for the comparison axis (difficulty level, scenario, cast)
  - clickable rows and nodes that call `onSelect(id)` to open the inspector
  - an interactive "planner" view for testing the design (Build planner)
- Recharts with several lines: build **one shared data array** (see `depletionGrid`). Per-line `data` props render wrong.
- Styling: add classes to `src/styles.css` that use the CSS variables (`--panel`, `--line`, `--muted`, `--accent`, `--warn`, `--danger`, `--ok`). No hard-coded theme colours apart from the series palette.

## 4. Hints (`src/core/hints/rules/<name>.ts`)
- Copy the shape of `rules/player.ts`:
  - `hint()` helper
  - `active(id, evaluate)` gated on `docId === DOC && !isDocEmpty(...)`
  - one rule per question, built from the core functions
- Severity stays **`suggest` or below**, because design choices aren't errors.
- Give each hint a `goto` action, or `addEntity` with `init` when one click can fix it.
- Register it in `RULES` in `src/core/hints/engine.ts`. Add `hints.<key>.title/body` to **both** `src/core/i18n/en.json` and `hu.json`.
- Don't flag things that are legitimately absent, e.g. a stat that doesn't drain.

## 5. Help and export
- Rewrite `MODULE_HELP['<docId>']` in `src/ui/help.ts`: what the module is for, 5–7 concrete tips, and a pointer to the Guide tab.
- Add summaries to `src/core/export/markdown.ts` as a function keyed on the section's view kinds (see `playerSummaryMd`, `needsBalanceMd`): small tables of the key numbers, or Mermaid for trees and graphs.

## 6. Guide (visual and interactive)
Write content only; the framework already exists. Create `src/modules/guides/<name>.ts` exporting a `ModuleGuide` (`src/core/guides/types.ts`), and register it in `GUIDES` in `src/modules/guides/index.ts`. That alone turns on the system map, Guide tab, coach marks, example picker, concept cards and teaching empty states.
- **`map`:** nodes are this module's sections (`section`) plus neighbouring modules (`doc`), on a grid with **210px column spacing** (nodes are 140×44). Edges have a short verb label ("grants", "decay ×").
- **`steps`:** 8–10 ordered steps for a first setup.
  - `done(project)` predicate from the data. Omit it only when the step can't be detected; it's then ticked by hand.
  - `target` is a `data-guide` id to spotlight: `add`, `examples`, `view-<kind>` or `field-<key>`.
  - Optional `action`: `{ label, run }` for a direct fix, or `{ label, examples: '<sectionId>' }` to open the picker.
- **`examples`:** 2–4 per section where starting from blank is hard.
  - `apply(p, param?)` mutates the project; it's applied as one undo step.
  - `preview` picks how the result is drawn on a copy. To support a new kind, add a branch in `src/ui/guides/ExamplePicker.tsx` (`PreviewKind`).
  - Use `param` for a choice like "for which cast".
- **`concepts`:** one "How this works" card per hard section, with 2–3 sentences and a diagram id. To add a diagram, add a case in `src/ui/guides/concepts.tsx` (small inline SVG, `c-*` classes).
- **`empty`:** one sentence per collection section saying what it's for.
- When adding a control a step should point at, give it a `data-guide` attribute.

## 7. Tests and verification
- **`tests/<name>.test.ts`:**
  - migration (ids kept, text preserved)
  - export headings in doc order
  - each core function with hand-checked numbers
  - each hint with a positive and a negative case, staying quiet on an empty doc and in other editors, never `important`
- **`tests/guides.test.ts`** pattern:
  - every guide section and doc id exists
  - step predicates and actions work
  - an example's preview equals the inserted result, and undo removes it
  - map states follow the data
- **UI test** (`tests/<name>Ui.test.tsx`): load the project with `useStore.getState().loadProject(p, 'x')`, set `window.location.hash`, and query by role or label.
- Update existing tests only when the schema change requires it (e.g. the default first section changed). Note why in a comment.
- Run `npx tsc -b --noEmit`, `npx eslint .` and `npx vitest run`, then check the views in the browser with realistic data. jsdom lacks `scrollIntoView`: call it as `el.scrollIntoView?.(…)`.
- Lint: don't call `setState` synchronously inside an effect, and avoid `useMemo` over derived values the React compiler can't preserve.

## Checklist
- [ ] Analysis written; sections in doc order; ids kept; `version: 2` plus `migrate`
- [ ] `src/core/<name>.ts` with pure functions; existing helpers reused
- [ ] New views wired (types, helpers, CollectionEditor) and styled with CSS variables
- [ ] Hint rules registered; en and hu keys
- [ ] Help text and export summaries
- [ ] Guide content registered (map, steps, examples, concepts, empty)
- [ ] Tests added; typecheck, lint and tests green; checked in the browser
