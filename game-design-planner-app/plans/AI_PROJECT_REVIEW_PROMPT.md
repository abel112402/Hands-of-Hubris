# AI Project Review Prompt

Use this prompt when asking an AI model to review the `game-design-planner-app` project.

## Role

You are reviewing a browser-based visual planning tool for the Hands of Hubris game-design documents. The application turns the repository's Markdown-oriented design structure into interactive planners and supports project-file persistence, autosave, imports, exports, guides, hints, and AI-assisted workflows.

Your review must distinguish between:

- **Current implementation** — behavior and technology confirmed by the source files.
- **Documented intent** — plans or guides describing desired or historical behavior.
- **Observed risk or gap** — a concrete inconsistency, defect, missing test, or maintainability concern supported by evidence.

Do not assume that a plan document accurately describes the current implementation. Confirm claims in the source, configuration, tests, and package manifest.

## Review scope

Review the complete `game-design-planner-app` folder, excluding `node_modules`, generated build output, caches, and other generated artifacts unless they are directly relevant to the finding.

At minimum, inspect:

- `package.json` and `package-lock.json`
- `tsconfig.json`, `vite.config.ts`, and `eslint.config.js`
- `README.md`
- `plans/` and `examples/`
- `src/core/`
- `src/modules/`
- `src/ui/`
- `tests/`

Trace representative behavior across the application rather than reading files in isolation. Follow the path from declarative module definitions through registry resolution, project creation, store mutations, editor rendering, persistence, migrations, and exports.

## Technology baseline to verify

Verify the actual versions and usage of the technologies declared in the project, including:

- Vite, React, TypeScript, and React Router
- Zustand and Immer
- Zod
- `idb-keyval`
- `@xyflow/react`
- Recharts and Mermaid
- `react-markdown` and `remark-gfm`
- `i18next` and `react-i18next`
- JSZip and Nanoid
- Vitest, JSDOM, and React Testing Library
- ESLint and its TypeScript/React Hooks integrations

Also identify technologies described in plans but intentionally not used by the current implementation. Do not recommend replacing the current stack merely because an older plan mentions another library.

## Architecture questions

Answer these questions with file and symbol references:

1. What is the application’s purpose and primary user workflow?
2. What responsibilities belong to `src/core`, `src/modules`, and `src/ui`?
3. Where are planner modules declared, registered, initialized, migrated, and rendered?
4. What is the project data model and how are stable IDs, versions, documents, and sections represented?
5. How do store mutations, Immer patches, undo/redo, dirty tracking, timestamps, and lazy document creation work?
6. How are imported files parsed, validated, migrated, warned about, and rejected?
7. How do Markdown, CSV, JSON, and ZIP exports obtain their data and preserve ordering or identifiers?
8. How are AI features isolated, restricted by allowed hosts/CSP, and surfaced to the UI?
9. How are localization, hints, guides, graphs, matrices, forms, canvases, and other generic editors integrated?
10. Which behaviors are covered by domain tests, persistence tests, export tests, and UI tests, and where are the meaningful gaps?

## Coding conventions to identify and preserve

Confirm the conventions from the code rather than treating this list as absolute:

- Strict TypeScript with ES modules, ES2022 output, and bundler module resolution.
- PascalCase filenames and exported functions for React components; lowercase descriptive names for domain and service files.
- PascalCase types/interfaces, camelCase functions and variables, and uppercase names for global/configuration constants where appropriate.
- Lowercase dotted IDs for modules and sections, such as `design.player_character`.
- Function components and hooks for React UI.
- Plain CSS rather than utility-class styling.
- Existing formatting style: single quotes, no semicolons, trailing commas, and the local JSX style.
- ESLint is the enforced quality tool. `.prettierrc` exists (single quotes, no semicolons, width 100) but Prettier is not a dependency or script.
- Use the existing store mutation API for editable project data. Never mutate project state directly from UI code.
- Keep hint/preferences state separate from undoable document mutations when matching existing behavior.
- Preserve stable IDs, module versions, document IDs, export ordering, migrations, and file-format compatibility.

When a convention is inconsistent, report the inconsistency with examples instead of inventing a new rule.

## Safety and compatibility checks

Pay special attention to:

- Untrusted imported JSON and the Zod validation boundary.
- Migration behavior for older and newer project formats.
- Preservation of unknown data where the implementation promises it.
- IndexedDB/local-storage failures and non-fatal browser-storage handling.
- CSP behavior in production versus development.
- AI allowed-host restrictions and dedicated AI error handling.
- Missing planners, documents, or sections and their fallback behavior.
- Accidental direct mutation that bypasses undo/redo, dirty state, timestamps, or persistence.
- Breaking changes to identifiers, schema shapes, module versions, or export formats.

Do not label a theoretical concern as a vulnerability or defect without tracing a realistic execution path and citing the relevant code.

## Required review process

1. Build a concise project inventory and dependency summary.
2. Read configuration and package scripts before evaluating code style or test commands.
3. Trace one representative planner from module definition to rendered editor and exported output.
4. Trace one representative persisted project through creation, mutation, serialization, validation, migration, and reload.
5. Inspect representative tests and compare them with the important runtime paths.
6. Run the smallest relevant validation commands when execution is available:
   - `npm run typecheck`
   - `npm run lint`
   - `npm test`
   - `npm run build` for build or configuration findings
7. Separate confirmed findings from recommendations and unknowns.

## Required output format

Return the review in this order:

### 1. Executive summary

State the project’s purpose, current stack, architectural shape, and overall condition in a few paragraphs.

### 2. Project structure

Use a table with columns:

| Area | Responsibility | Important files/symbols |
|---|---|---|

### 3. Technology and scripts

List verified technologies, their roles, and the relevant npm scripts. Call out planned-but-unused technologies separately.

### 4. Architecture and data flow

Describe module registration, project creation, state changes, rendering, persistence, migrations, and exports. Include links or `path:line` references when available.

### 5. Coding conventions

List confirmed conventions for TypeScript, React, CSS, IDs, state updates, errors, tests, and file organization. Mention deviations or inconsistencies.

### 6. Findings

Rank only evidence-backed issues using this table:

| # | Severity | File/symbol | Evidence | Impact | Recommended action |
|---|---|---|---|---|---|

Use `Critical`, `High`, `Medium`, `Low`, or `Informational`. If there are no issues, say so explicitly. Do not inflate style preferences into defects.

### 7. Test and validation assessment

Summarize existing coverage, missing coverage, commands run, and their results. Distinguish tests that passed from checks that were not run.

### 8. Safe next steps

Give a short, prioritized list of improvements that preserve the existing architecture and file-format compatibility.

## Change guidance for follow-up implementation

If the review leads to code changes:

- Read the relevant model/schema, module definition, registry, generic editor, persistence code, and tests before editing.
- Extend declarative module definitions and shared extension points instead of hardcoding planner-specific behavior into generic UI components.
- For every persisted shape change, update the TypeScript model/schema, add a migration, review import/export behavior, and add regression tests.
- Use `useStore.mutate` for project edits so Immer history, dirty state, timestamps, and undo/redo remain correct.
- Preserve production CSP and AI host restrictions.
- Add both domain and UI tests for behavior visible through the editor.
- Avoid unrelated refactors, generated files, `node_modules`, and changes to documented identifiers.
- Re-run the narrowest relevant checks, then the full configured checks when practical.
