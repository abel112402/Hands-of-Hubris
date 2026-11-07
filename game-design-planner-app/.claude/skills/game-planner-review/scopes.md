# Review scopes → files and checks

Read only the row that matches. Tests live in `tests/`.

| Scope | Read | Check for | Tests / command |
|---|---|---|---|
| State & undo | `src/core/store/store.ts`, `src/ui/hooks.ts`, `src/ui/editors/SectionRenderer.tsx` | mutation outside `useStore.mutate`; undo/redo, dirty flag, `updatedAt`, lazy doc creation; hint/pref state wrongly inside undo history | `tests/core.test.ts`, `tests/editing.test.tsx` |
| Persistence & migration | `src/core/persistence/{serialize,file,autosave}.ts`, `src/core/model/{schema,project,types}.ts` | Zod at the import boundary; a `MIGRATIONS` entry per version bump; unknown-data preservation; IndexedDB failure non-fatal; older and newer files | `tests/core.test.ts` |
| Exports | `src/core/export/markdown.ts`, `src/core/persistence/serialize.ts` | section order = doc order; stable IDs; CSV/JSON/ZIP parity; unresolved refs | `tests/core.test.ts`, `tests/markdownView.test.tsx` |
| AI | `src/core/ai/security.ts`, `run.ts`, `providers/`, `src/ui/ai/*`, CSP in `vite.config.ts` | `ALLOWED_HOSTS` (https, no creds/port); CSP prod vs dev; dedicated AI errors; key handling; budget | `tests/ai.test.ts`, `tests/ai.test.tsx` |
| Generic editors | `src/ui/editors/{SectionRenderer,CollectionEditor,GraphEditor,CanvasEditor,simple,views}.tsx`, `src/ui/FieldInput.tsx` | planner-specific logic leaking into generic editors; missing-data fallbacks | `tests/render.test.tsx`, `tests/editing.test.tsx` |
| One planner (e.g. combat) | its block in `src/modules/design.ts` (grep `mod('design', '<key>'`), `src/core/<key>.ts`, `src/ui/pages/<key>.ts`, `src/ui/editors/<key>Views.tsx`, `src/core/hints/rules/`, matching plan | module version + migration; refs into other modules; hints/guide wiring; i18n keys | `tests/<key>*.test.ts(x)` |
| Hints & guides | `src/core/hints/`, `src/core/guides/types.ts`, `src/ui/hints/`, `src/ui/guides/` | rule determinism; dismissal state separate from undo | `tests/hints.test.ts`, `tests/guides.test.ts` |
| i18n | `src/core/i18n/{en,hu}.json`, `index.ts` | en/hu key parity; only UI chrome translated | `npm run typecheck` |
| Build/config | `package.json`, `vite.config.ts`, `tsconfig.json`, `eslint.config.js` | script/CSP/config drift | `npm run build` |
