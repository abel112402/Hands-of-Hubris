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

## UI design system (see `plans/WORKSPACE_LANDING_REDESIGN_PLAN.md`)
- Tokens live in the first `:root{}` of `src/styles.css`; `tests/tokens.test.ts` checks their contrast. Use tokens, not literals: surfaces `--surface-0…3` (`--bg/--panel/--panel2` are aliases), `--line`/`--line-strong`, `--radius-xs/sm/md/pill`, `--space-1…7`, `--fs-xs…4xl`, `--font-body`/`--font-display`, `--dur-fast`/`--ease-out`.
- Colour roles: `--accent` = links, focus, standard primary buttons. `--brand` (amber) is reserved for "you are here / next action" (`.here-dot`, the hero's Open planner, current step/phase); text on it uses `--on-brand`. Phases: put `data-phase="<PhaseId>"` on a container and use `var(--phase)`.
- Never show state by colour alone: pair it with shape (ring/pie/solid/dashed), a count, or sr-only text.
- One filled (`primary`) action per view or card; companions use `.ghost`. Mode switches use `.segmented` with `aria-pressed`, never `button.active`.
- Icons: `Icon` (line SVGs) for controls; `ModuleIcon id=…` for planners. Emoji stay only in module definitions (Markdown export).
- Headings and big numbers use the display font automatically (`h1`, `h2`, `.brand`, `.num`); metadata labels use `.eyebrow`.
- Motion: only via `--dur-fast`/`--ease-out` or the `hoh-*` keyframes; the global `prefers-reduced-motion` block in `styles.css` covers it, so don't add per-rule guards. Add `forced-colors` mappings for any new state-carrying fill.

## Tests
- Vitest. Logic: `tests/<domain>.test.ts`; UI: `tests/<domain>Ui.test.tsx` (RTL + jsdom). Editor-visible behaviour needs both; bug fixes need a regression test.
- Validate narrow-first: `npx vitest run tests/<file>` → `npm run typecheck` → `npm run lint`; `npm run build` for config changes.

## Don't touch
`node_modules`, `dist`, `tsconfig.tsbuildinfo`, `package-lock.json` (unless adding a dependency), unrelated files.
