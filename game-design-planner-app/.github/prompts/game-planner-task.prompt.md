---
name: Implement Game Planner Task
description: "Use when implementing, debugging, refactoring, or testing a change in the game-design-planner-app."
argument-hint: "Describe the desired change, affected area, and acceptance criteria."
agent: "agent"
---

Implement the requested change in game-design-planner-app.

Work efficiently:
- Inspect the current diff and the smallest relevant dependency/test set first.
- Follow existing patterns; do not introduce a library or abstraction without evidence it is needed.
- Keep stable IDs, persisted formats, migrations, exports, CSP, and AI host restrictions compatible.
- Use the existing store mutation API for project edits.
- Make precise changes only; do not perform unrelated cleanup.
- Add or update focused tests for behavior changes.
- Run the narrowest relevant validation command and report its result.

Before editing, state a one-sentence implementation approach. After editing, summarize changed files, validation, and any remaining risk.

Task:
${input}
