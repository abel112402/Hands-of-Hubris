---
name: coding-conventions
description: "Coding conventions and invariants for game-design-planner-app (TypeScript/React style, naming, IDs, state, persistence, tests). Load before writing or reviewing code."
---

# Coding conventions

Confirmed from config/source. If code disagrees, follow the code and report the inconsistency.

## Style
- Strict TS (`noUnusedLocals/Parameters`), ES modules, ES2022, bundler resolution, `isolatedModules`.
- Formatting per `.prettierrc` (single quotes, no semicolons, width 100); Prettier is not a dependency or script. ESLint (`npm run lint`) is the enforced gate; `any` is allowed but avoid it.
- React function components + hooks; plain CSS in `src/styles.css`; no utility-class or CSS-in-JS libraries.
- Naming: components/types PascalCase (component files too); domain/service files lowercase camelCase; functions/vars camelCase; UPPER_SNAKE for global config (`MODULES`, `ALLOWED_HOSTS`, `MIGRATIONS`).
- Module/section IDs are stable; never rename existing ones.
- No new dependency or abstraction without evidence the current stack can't do it.

## Architecture rules
- New planner = declarative `mod(...)` in `src/modules/*` + registration in `src/core/modules/registry.ts`. Domain logic in `src/core/<domain>.ts`; planner views in `src/ui/editors/<domain>Views.tsx`. No planner-specific branches in generic editors.
- All project edits go through `useStore.mutate`. Never mutate project state from UI code. Hint dismissals/preferences stay outside undoable history.
- Imported data is untrusted: Zod parse, run `MIGRATIONS`, surface warnings, preserve unknown data where promised.
- Persisted-shape change = types + Zod schema + migration + import/export + regression test, in the same change.
- Preserve stable IDs, schema/module versions, export ordering (= doc order), production CSP, `ALLOWED_HOSTS`.
- i18n covers UI chrome only; add keys to both `en.json` and `hu.json`.

## Tests
- Vitest. Logic: `tests/<domain>.test.ts`; UI: `tests/<domain>Ui.test.tsx` (RTL + jsdom). Editor-visible behaviour needs both; bug fixes need a regression test.
- Validate narrow-first: `npx vitest run tests/<file>` → `npm run typecheck` → `npm run lint`; `npm run build` for config changes.

## Don't touch
`node_modules`, `dist`, `tsconfig.tsbuildinfo`, `package-lock.json` (unless adding a dependency), unrelated files.
