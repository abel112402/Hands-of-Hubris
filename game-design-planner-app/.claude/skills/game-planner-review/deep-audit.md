# Deep audit (Tier 3 only)

Only when the user explicitly requests a full audit. The long-form prompt is `plans/AI_PROJECT_REVIEW_PROMPT.md` (use its output sections); this file is the cost-controlled procedure.

1. Inventory from `package.json`, `README.md` and the `workspace-map` skill. Do not list the tree again.
2. Trace **one** planner end to end (module definition → `registry.ts` → project creation → editor render → export). Use `design.story` or `design.trade` (already v2, tests exist).
3. Trace **one** project through create → `useStore.mutate` → serialize → validate → migrate → reload.
4. Sample tests: one `*.test.ts`, one `*Ui.test.tsx`, `core.test.ts`. Compare with the traced paths and list gaps.
5. Run in order, stopping at the first failure worth reporting: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.
6. Separate **confirmed finding** / **recommendation** / **unknown**. Cap 10 findings, <1500 words.

Safety checklist: untrusted import JSON; migration for older/newer formats; unknown-data preservation; storage failures; production CSP; AI host allowlist; mutation bypassing undo/dirty/timestamps; ID/schema/export-order breakage.

Verify, don't assume: `.prettierrc` exists but Prettier is not a dependency or script (ESLint is the only enforced tool). Plans mention Tailwind/Radix/dnd-kit/elkjs, intentionally unused (README "Deviations").
