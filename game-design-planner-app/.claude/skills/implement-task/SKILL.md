---
name: implement-task
description: "Cost-efficient workflow for implementing, fixing, refactoring or testing a change in game-design-planner-app, including v1→v2 planner upgrades and persisted-shape changes."
---

# Implement a task

1. **Scope**: restate the task in one sentence with acceptance criteria. For a planner upgrade read `plans/EDITOR_UPGRADE_GUIDE.md` and only that planner's plan.
2. **Locate**: Grep for symbols; use `workspace-map` instead of listing directories. Read the smallest set: target file, direct imports, its test file.
3. **Approach**: state a one-sentence plan before editing. Reuse existing patterns (copy structure from the `story` / `trade` / `ui` v2 planners).
4. **Edit** per `coding-conventions`. No unrelated cleanup.
5. **Persisted-shape change**: types → Zod schema → `MIGRATIONS` entry + version bump → import/export → `examples/*.hohplan.json` still load → regression test.
6. **New planner**: `mod(...)` in `src/modules/*` → registry → `src/core/<domain>.ts` → `src/ui/pages/<domain>.ts` → views → hints/guide → i18n en+hu → tests (logic, guide, UI).
7. **Validate** narrow-first (`npx vitest run tests/<file>`, then `npm run typecheck`, `npm run lint`). Report commands and failures briefly.
8. **Summary**: changed files, validation, remaining risk. To review the result use `game-planner-review` Tier 1.
