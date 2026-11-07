# Game Design Planner Instructions

Keep work scoped, evidence-based, and token-efficient. Prefer the smallest relevant file/test set; never reread unrelated architecture.

- Stack: Vite, React, strict TypeScript, Zustand/Immer, Zod, plain CSS, Vitest. Follow existing patterns.
- Extension points: `src/modules` definitions + `src/core/modules/registry.ts`.
- Edit project data only via `useStore.mutate` (undo/redo, dirty state, timestamps, persistence).
- Imported data is untrusted: keep Zod validation, migrations, warnings, stable IDs, export compatibility.
- Preserve production CSP and AI allowed-host restrictions.
- Don't edit `node_modules`, generated output, or unrelated files.
- Validate narrowest-first (`npx vitest run tests/<file>`, `npm run typecheck`, `npm run lint`) and report results.

Skills (in `.claude/skills/`, see `.claude/README.md`): `workspace-map` (layout, plans index), `coding-conventions`, `implement-task`, `game-planner-review` (diff / subsystem / full audit tiers; default to the cheapest). Copilot template: `.github/prompts/game-planner-task.prompt.md`.
