# .claude: AI helpers for game-design-planner-app

Goal: quality results at minimal token cost. Skills load on demand; `CLAUDE.md` (always loaded) stays tiny.

| Skill | Use when | Cost |
|---|---|---|
| `game-planner-review` | any review: diff (default), subsystem, or explicit full audit; scope→files in `scopes.md` | low → high by tier |
| `workspace-map` | you need layout, extension points, commands, or which plan to read | very low |
| `coding-conventions` | writing or reviewing code | very low |
| `implement-task` | feature/fix/refactor/planner upgrade, with checklists | low |

Tips: name the scope in your prompt ("review the diff", "review persistence"); a full audit must be requested explicitly. `plans/` (~225 KB) is intent, not truth; read one file at a time. `.github/` holds the Copilot equivalents; keep their rules in sync with these skills. `plans/templates/` are paste-in prompt snippets.

Files: `launch.json` (dev server `planner`, port 5173), `skills/*/SKILL.md`.
