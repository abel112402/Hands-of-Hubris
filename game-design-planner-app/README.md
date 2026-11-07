# Game Design Planner

Interactive visual editors for every planning document in `../docs` (Vite + React + TypeScript).

## Commands
- `npm install`, `npm run dev`, `npm run build`, `npm run preview`
- `npm run lint`, `npm run typecheck`, `npm test`

## Usage
- The menu lists all planners grouped like the docs folder. Pick one to open its visual editor.
- **Save / Open** use a single `*.hohplan.json` project file (File System Access API, download/upload fallback). Work is also autosaved to IndexedDB; snapshots are available from the `⋯` menu.
- **Export**: Markdown zip mirroring `docs/`, per-document `.md`, per-document JSON (importable), CSV per table.
- **Definitions**: add catalog items (stats, needs, resources…), custom fields and custom entity types — no code changes needed for game extensions.
- `Ctrl+K` search, `Ctrl+S` save, `Ctrl+Z/Y` undo/redo.

## Scrollbars and browser fallback
Scrollbars use a slim style and the app's dark palette where the browser supports standard scrollbar styling or WebKit scrollbar styling. Browsers without either feature retain their native scrollbars; forced-colors mode uses system colors and default sizing. Native scrolling remains unchanged. Styling support does not imply that the entire app supports every older browser.

## Architecture
Each docs file is a declarative `PlannerModule` in `src/modules/*` (sections of kind form, collection, matrix, graph, canvas, checklist, richtext, formulas). Generic editors in `src/ui/editors` render them. To add a planner, define a module and register it in `src/core/modules/registry.ts`.
Project format changes go through `MIGRATIONS` in `src/core/persistence/serialize.ts`.

## Deviations from IMPLEMENTATION_PLAN.md
Plain CSS and HTML5 drag-and-drop instead of Tailwind/Radix/dnd-kit/TanStack Table/Konva; custom layered graph layout instead of elkjs; i18n covers UI chrome only (en/hu); module and field labels are English.
Open questions use defaults: single project file, Markdown export only (no import), images not supported yet, browser-only.
