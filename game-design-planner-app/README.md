# Game Design Planner

Interactive visual editors for every planning document in `../docs` (Vite + React + TypeScript).

## Commands
- `npm install`, `npm run dev`, `npm run build`, `npm run preview`
- `npm run lint`, `npm run typecheck`, `npm test`

## Usage
- The menu lists all planners grouped like the docs folder. Pick one to open its visual editor.
- **Save / Open** use a single `*.hohplan.json` project file (File System Access API, download/upload fallback). **Save** is the blue button in the top bar; its `▾` menu holds New, Open…, Save as…, the project exports, snapshots and the language switch. Work is also autosaved to IndexedDB.
- **Export**: Markdown zip mirroring `docs/` and project JSON (Save `▾` menu); per document, the editor's **Document ▾** menu offers Download Markdown (.md), Export as JSON (importable) and Import from JSON…; CSV per table from each collection.
- **Definitions**: add catalog items (stats, needs, resources…), custom fields and custom entity types — no code changes needed for game extensions.
- **System map**: opens on your first visit to a planner; after that it remembers whether you closed it and shows a one-line progress summary when closed.
- `Ctrl+K` search, `Ctrl+S` save, `Ctrl+Z/Y` undo/redo. On windows narrower than 900px the top-bar links move into the Save `▾` menu.

## Hints
- The **top bar** badge counts project-wide hints. In an editor, the hint panel lists **This page** first and collapses hints about **Other planners**.
- Each hint has one main action (Go / Create). The `⋯` menu holds *Remind me later (30 min)*, *Dismiss this hint* and *Never show this kind of hint*.
- Colours: red = important, yellow = suggestion, blue = info (legend on the Hints settings page).
- The hint panel can be resized by dragging its left edge, or with the keyboard: focus the edge, then ←/→, Home/End.

## Accessibility and styling
- Filled buttons and badges use the darker `--accent-strong`, `--danger-strong` and `--secondary-strong` tokens so white text keeps at least 4.5:1 contrast; `--accent` stays for borders, links and focus rings.
- Every focusable control shows a focus ring (`:focus-visible`); controls are at least 24×24px.
- Icons for controls come from `src/ui/Icon.tsx` (inline SVG, `currentColor`); an icon-only button needs an `aria-label`. Planner cards keep their emoji.
- Dropdowns use `src/ui/Menu.tsx` (closes on item click, Escape and outside click).
- Spacing and type tokens (`--space-1…5`, `--fs-xs…xl`) are defined in `:root`; use them for new rules.

## Wording
- Translated UI text uses i18next plural keys (`key_one` / `key_other`, bare `key` kept as the plural fallback). Never write `item(s)`; `tests/wording.test.tsx` fails on it.
- Text outside i18n (module labels, Markdown export, view captions) uses `countOf(n, 'phase')` from `src/core/text.ts`; collection sections take an optional `plural` for irregular nouns.
- `en.json` and `hu.json` must define the same keys (checked by the same test).

## Scrollbars and browser fallback
Scrollbars use a slim style and the app's dark palette where the browser supports standard scrollbar styling or WebKit scrollbar styling. Browsers without either feature retain their native scrollbars; forced-colors mode uses system colors and default sizing. Native scrolling remains unchanged. Styling support does not imply that the entire app supports every older browser.

## Architecture
Each docs file is a declarative `PlannerModule` in `src/modules/*` (sections of kind form, collection, matrix, graph, canvas, checklist, richtext, formulas). Generic editors in `src/ui/editors` render them. To add a planner, define a module and register it in `src/core/modules/registry.ts`.
Project format changes go through `MIGRATIONS` in `src/core/persistence/serialize.ts`.

## Deviations from IMPLEMENTATION_PLAN.md
Plain CSS and HTML5 drag-and-drop instead of Tailwind/Radix/dnd-kit/TanStack Table/Konva; custom layered graph layout instead of elkjs; i18n covers UI chrome only (en/hu); module and field labels are English.
Open questions use defaults: single project file, Markdown export only (no import), images not supported yet, browser-only.
