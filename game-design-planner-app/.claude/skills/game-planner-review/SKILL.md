---
name: game-planner-review
description: "Cost-efficient review of game-design-planner-app: current diff, one subsystem (store, persistence, exports, AI, editors, a planner module) or a full audit. Use for 'review', 'audit', 'check my changes', 'is this safe to merge'. Pick the cheapest tier that answers the question."
---

# Game Planner Review

Ask first (or infer): **what scope?** Pick the cheapest tier that covers it. Never default to Tier 3.

| Tier | Trigger | Budget | Reads |
|---|---|---|---|
| 1 Diff | "review my changes", pre-commit | ≤5 findings, no architecture recap | changed files + direct imports + covering tests |
| 2 Subsystem | names an area (store, persistence, export, AI, one planner) | ≤5 findings | only the files in [scopes.md](scopes.md) for that area |
| 3 Full audit | user explicitly says "full/complete audit" | ≤10 findings, <1500 words | follow [deep-audit.md](deep-audit.md) |

## Method (all tiers)

1. Load the `workspace-map` and `coding-conventions` skills only if you lack that context; do not re-explore the tree.
2. Tier 1: `git diff` (or `git diff --stat`, then per file). Without git, ask for the changed paths.
3. Tier 2/3: use the file list in `scopes.md`; Grep for symbols before reading whole files; read by line range.
4. Plans in `plans/` are intent, not truth. Read one only if a finding depends on it, and verify in source.
5. Report only what you can trace to a concrete execution path and `path:line`. No theoretical vulnerabilities; no style preferences as defects.
6. Run only the narrowest check: `npx vitest run tests/<file>` → `npm run typecheck` → `npm run lint`. `npm run build` only for config/build findings. State plainly what was not run.
7. Stop when the scope is covered.

## Output (strict)

1. One sentence: scope + overall verdict.
2. Table: `# | Severity (Critical/High/Medium/Low) | path:line | Issue | Impact | Fix`, capped per tier. "No issues found" is a valid result.
3. Checks run + result (pass / fail / not run).
4. ≤3 next steps. No praise, no description of unaffected code.
