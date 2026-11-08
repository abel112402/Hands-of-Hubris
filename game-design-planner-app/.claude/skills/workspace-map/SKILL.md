---
name: workspace-map
description: "Compact map of game-design-planner-app (stack, folders, extension points, commands, plan documents). Load before exploring the repo so you don't rediscover the architecture."
---

# Workspace map

Browser planner for the Hands of Hubris design docs (`../docs`). Vite 8 · React 19 · strict TS 6 · Zustand+Immer · Zod 4 · plain CSS · Vitest 5 + RTL/jsdom · i18next (UI chrome only, en/hu) · idb-keyval · @xyflow/react · Recharts · Mermaid · react-markdown · JSZip.

## Layout

| Path | Role |
|---|---|
| `src/modules/` | Declarative `PlannerModule` definitions: `design.ts` (design planners via `mod('design','<key>',…)`), `overview.ts`, `technical.ts` (technical, art/audio, production, QA, templates), `seeds.ts`, `guides/` (per-planner guides), `genres.ts` (genre catalog), `walkthroughs/` (base + genre walkthrough packs, `shared.ts`, `i18n/hu.ts`) |
| `src/core/modules/registry.ts` | `MODULES`, `GROUPS`, `getModule`, `getSections` (merges custom fields). **Register new planners here.** |
| `src/core/model/` | `types.ts`, `schema.ts` (Zod), `project.ts`, `catalogs.ts` |
| `src/core/store/store.ts` | Zustand store; `useStore.mutate(fn, key?)` is the write path (Immer history, undo/redo, dirty, timestamps) |
| `src/core/persistence/` | `serialize.ts` (`MIGRATIONS`), `file.ts` (`*.hohplan.json`), `autosave.ts` (IndexedDB) |
| `src/core/export/markdown.ts` | MD/CSV/JSON/ZIP export, ordered like the docs |
| `src/core/<domain>.ts` | Pure domain logic per planner (combat, items, npc, player, story, trade, timeWeather, town, world, ui, …) |
| `src/core/hints/`, `guides/`, `references/` | Hint engine + rules, guide types, cross-module refs |
| `src/core/walkthrough/` | Walkthrough engine: `types`, `schema` (Zod), `compose` (base + packs, localize), `evaluate` (done rules, progress, `meta.guide` edits), `project` (per-project walkthrough, content validation), `focus` (step hints, page steps, AI data) |
| `src/core/genre.ts`, `progress.ts` | Genre profile → `editorGroups`; planner fill and next milestone |
| `src/core/ai/` | AI workflow; `security.ts` holds `ALLOWED_HOSTS`; CSP injected in `vite.config.ts` |
| `src/ui/` | `AppShell`, `pages/` (`Home` = 3-pane workspace, `EditorPage`), `workspace/` (`EditorRail`, `GuideCenter`, `ProgressPanel`, `WalkthroughChip`), `settings/` (`/settings/:tab`), `editors/` (generic form/collection/graph/canvas + `<domain>Views.tsx`), `ai/`, `hints/`, `guides/`, `genres/`, `markdown/` |
| `tests/` | `<domain>.test.ts` (logic), `<domain>Guide.test.ts`, `<domain>Ui.test.tsx`, `core.test.ts`, `editing.test.tsx`, `render.test.tsx`, `ai.test.ts(x)` |
| `examples/` | sample `*.hohplan.json` projects |
| `plans/` | Design intent (index below); verify in source |
| `.claude/`, `.github/` | AI helpers (see `.claude/README.md`) |

Data flow: module def → registry → project creation → `SectionRenderer` → generic editor → `useStore.mutate` → autosave/serialize (Zod + migrations) → export.

## Commands (narrowest first)

`npx vitest run tests/<file>` · `npm test` · `npm run typecheck` · `npm run lint` · `npm run build` · `npm run dev` (port 5173; `.claude/launch.json` name `planner`)

## Plans index (read only the one you need; size ≈ cost)

| File | Status | Use for |
|---|---|---|
| `GUIDED_WORKSPACE_PLAN.md` | implemented | walkthrough engine, genre packs, 3-pane home, Settings |
| `EDITOR_UPGRADE_GUIDE.md` (8K) | guide | **Start here** for any v1→v2 planner upgrade |
| `MARKDOWN_PREVIEW_GUIDE.md` (15K) | guide | per-doc markdown preview work |
| `STORY_QUESTS_PLAN.md`, `TRADE_ECONOMY_PLAN.md`, `UI_UX_PLAN.md` | implemented | reference for finished v2 planners |
| `COMBAT_PLAN.md`, `ITEMS_CRAFTING_PLAN.md`, `PLAYER_CHARACTER_PLAN.md`, `TIME_WEATHER_PLAN.md`, `OPEN_QUESTIONS_UPGRADE_PLAN.md` | marked proposed (check source; may be partly done) | planner-specific upgrade work |
| `IMPLEMENTATION_PLAN.md` (48K, Hungarian, historical) | partly outdated | avoid; README "Deviations" summarises it |
| `AI_PROJECT_REVIEW_PROMPT.md`, `templates/` | review prompts | used by `game-planner-review` |
