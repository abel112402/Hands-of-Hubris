---
name: Review Game Design Planner
description: "Use when reviewing the game-design-planner-app architecture, current diff, persistence, state flow, tests, or coding conventions."
argument-hint: "Specify a narrow scope, files, or review concern."
agent: "agent"
---

Review the requested scope in the game-design-planner-app using the always-on project instructions.

Efficiency rules:
- Start with the current diff and directly related files.
- Inspect only the files needed to verify findings.
- Do not re-document unaffected architecture.
- Report only actionable, evidence-backed issues.
- Return at most 5 findings unless a full audit is explicitly requested.
- Use concise `path:line` references and omit praise.

Check only the requested concern. For state or persistence changes, verify store mutation flow, undo/redo, dirty tracking, timestamps, schema validation, migrations, exports, and regression tests as applicable.

Output:
1. One-sentence scope/result.
2. Findings table: severity, file:line, issue, impact, fix.
3. Tests/checks run and results.
4. At most three next steps.

User scope:
${input}
