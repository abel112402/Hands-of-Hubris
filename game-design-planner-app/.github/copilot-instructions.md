# Game Design Planner Guidelines

These are always-on rules. Keep responses and changes focused.

## Project

- This is a Vite + React + strict TypeScript planner for Hands of Hubris design data.
- `src/core` contains models, modules, store, persistence, exports, hints, AI, and services.
- `src/modules` contains declarative planner definitions.
- `src/ui` contains React pages and generic editors.
- `tests` contains Vitest and React Testing Library tests.
- Read `README.md` and the relevant plan only when needed; plans describe intent, not always the current implementation.

## Change rules

- Preserve stable module IDs, document IDs, schema versions, migrations, export ordering, and the production CSP/AI host restrictions.
- Use the existing store mutation API for project edits; do not mutate project state directly in UI code.
- Prefer declarative module definitions and shared extension points over planner-specific logic in generic editors.
- For persisted-shape changes, update types/schema, migration, import/export behavior, and regression tests.
- Follow existing strict TypeScript, React function-component, plain CSS, naming, and no-semicolon conventions.
- Avoid unrelated refactors, generated files, `node_modules`, and speculative dependencies.

## Validation

- Use the narrowest relevant check first: `npm run typecheck`, `npm run lint`, or focused `npm test`.
- Run `npm run build` for build/configuration changes.
- Report commands run and failures explicitly.

For a complete review workflow, use `.github/prompts/game-planner-review.prompt.md` or the Claude skill in `.claude/skills/game-planner-review/SKILL.md`.
