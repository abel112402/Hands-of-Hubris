# Design Critique Fix Plan

Implementation plan for every finding from the design critique of 2026-11-07 (home page, Core Loop editor, Roadmap editor, `src/styles.css`).
Work is split into 5 phases. Do them in order: each phase can ship on its own, and later phases assume earlier ones are done. Each task lists the files to change, what to do, and when it counts as done.

Stack rules from `CLAUDE.md` apply: plain CSS, project data edited only through `useStore.mutate`, i18n for UI text (en + hu), and checks run narrowest first.

---

## Phase 1 — Accessibility and contrast (CSS only, low risk)

### 1.1 Accent contrast on filled controls
**Problem:** White text on `--accent #5b9cff` is about 2.75:1. Affects `button.primary`, `button.active`, `.chip.chosen`, `.tl-bar`, `.g2-item`.
**Change (`src/styles.css`):**
- Add a token `--accent-strong:#2f6fd6` (about 5:1 with white). Keep `--accent` for borders, links, focus rings and strokes on dark backgrounds, where it already contrasts well with the background.
- Use `background:var(--accent-strong);border-color:var(--accent-strong)` for `button.primary`, `button.active`, `.chip.chosen`, `.chip.selected`, `.tl-bar` and `.g2-item`.
- Add a hover state: `button.primary:hover:not(:disabled){background:var(--accent)}` with dark text, or keep white text and lighten slightly. Check that contrast stays at 4.5:1 or above.
**Done when:** every white-on-accent text pair is at least 4.5:1, checked with a contrast tool or a short script over the tokens.

### 1.2 Badge contrast
**Problem:** White on `--danger #e5586b` is about 3.5:1, and the badge text is 11px.
**Change:** Add `--danger-strong:#c23a4e` and use it for `.badge` and `.tl-bar.critical`. Keep `--danger` for coloured text on dark backgrounds (`.pill.error`, `.bad`), which already passes.
**Done when:** the badge is 4.5:1 or above.

### 1.3 Visible keyboard focus
**Problem:** There is no general `:focus-visible` style. `.npc-stage`, `.npc-bond` and `.arch-node` set `outline:none` with no replacement.
**Change (`src/styles.css`):**
- Add `:where(button,a,input,select,textarea,summary,[tabindex]):focus-visible{outline:2px solid var(--accent);outline-offset:2px}`.
- `.npc-stage:focus` / `.npc-bond:focus` (line ~621) and `.arch-node:focus` (line ~663): switch to `:focus-visible` and give each a stroke or `box-shadow` replacement like the one `.st-node` / `.gm-node` already use.
- Under `@media (forced-colors:active)`, use `outline-color:Highlight`.
**Done when:** tabbing through the top bar, the editor toolbar, the hint panel, the System map and the NPC/architecture diagrams shows a visible focus mark on every stop.

### 1.4 Small click targets
**Problem:** `button.small` is about 20px tall, and the 🔕 hint button and the CSV button are tiny.
**Change:** Give `button.small` `min-height:24px;min-width:24px` and give `.hint-actions button` `min-height:26px`. (24×24 is the WCAG 2.2 AA minimum. This is a desktop tool, so 44px isn't required.)
**Done when:** no interactive control is under 24×24 CSS px. Spot-check with `getBoundingClientRect` in the preview.

### 1.5 Keyboard-operable hint panel resize
**Problem:** `.hint-resize` (`src/ui/hints/HintPanel.tsx:101`) is a `role="separator"` that only works with the pointer.
**Change:** Add `tabIndex={0}`, `aria-valuenow={width}`, `aria-valuemin`, `aria-valuemax` and `aria-label`, plus an `onKeyDown` handler: ←/→ change the width by 16px, Home/End jump to min/max. Keep the existing clamp and the `WIDTH_KEY` persistence.
**Done when:** the panel can be resized with the keyboard alone. Add a test in `tests/hints.test.ts` or a new `tests/hintPanel.test.tsx`.

### 1.6 Quieter screen-reader announcements
**Problem:** The whole `<aside class="hint-panel">` has `aria-live="polite"`, so screen readers announce every hint change after each edit.
**Change:** Remove `aria-live` from the aside. Add a visually hidden `<span role="status">` that announces only count changes ("3 hints for this page"), debounced like `useHints`. Add a `.sr-only` utility class to the CSS.
**Done when:** editing a field doesn't make the screen reader read whole hint cards.

**Phase 1 checks:** `npm run lint`, `npm run typecheck`, `npx vitest run tests/hints.test.ts tests/render.test.tsx`. Recheck contrast in the preview.

---

## Phase 2 — Hint system accuracy and noise (highest usability impact)

### 2.1 One consistent hint count
**Problem:** The top bar (`src/ui/AppShell.tsx:46`) calls `evaluateHints(makeContext(project))` with no snooze map and no document context. The panel (`HintPanel.tsx:74`) uses `useHints(docId, sectionId)`, which includes snooze and doc-scoped rules. The result is "Hints 4" next to a panel showing 8–9.
**Change:**
- `AppShell`: use `useHints()` instead of the direct call, so snoozing applies the same way and the 400 ms debounce is shared.
- Decide what each badge means and label it:
  - Top bar = **project-wide** count. Set `title`/`aria-label` to "N hints across the project".
  - Panel tab = **this page** count. Show "This page" next to the number.
- Add a helper in `src/core/hints/engine.ts`: `splitByScope(hints, ctx) → { here: Hint[]; elsewhere: Hint[] }`, based on the existing `relevance()` (relevance 0–2 = here, 3 = elsewhere). Export it for the panel and for tests.
**Done when:** the two numbers are labelled and add up correctly. For a snoozed hint, both numbers go down. Add unit tests for `splitByScope`.

### 2.2 Remove duplicate onboarding hints
**Problem:** When Vision is empty, `dependency.visionFirst` and `onboarding.next` (`src/core/hints/rules/project.ts`) both point at `overview.vision`, so the home page shows "Write the vision first" and "Next: Vision & Concept".
**Change:** In the `onboarding.next` evaluate, skip `overview.vision` when `dependency.visionFirst` fires (Vision empty and some design doc not empty). Simpler option: add a general step at the end of `collectHints` that drops hints sharing the same `action` target, keeping the higher severity. Prefer the general step so future rules benefit too.
**Done when:** a test project with an empty Vision and a non-empty Core Loop shows one Vision hint. Add a test in `tests/hints.test.ts`.

### 2.3 Calmer "Next steps" on the home page
**Problem:** Four full-width hint cards push the planner grid below the fold (`src/ui/pages/Home.tsx:43-48`).
**Change:**
- Show only the top hint as a single wide "Next step" card. Below it, add a "+N more suggestions" link (`<Link to="/hints">`).
- Move the filter input (`Home.tsx:49`) above the Next-step card, or into the same row, so users can search planners right away.
- Make the autosave-restore banner (`Home.tsx:39`) one line with a close (×) button.
**Done when:** at 1280×800 the first row of planner cards is visible without scrolling.

### 2.4 Show only this page's hints in the editor panel
**Problem:** The editor panel repeats project-wide hints ("Write the vision first") on every page.
**Change (`HintPanel.tsx`):** Using `splitByScope`, list `here` hints first. Put `elsewhere` hints in a collapsed `<details>` titled "Project-wide (N)", collapsed by default and remembered in `localStorage` (`hohplan:hintsElsewhereOpen`). If `here` is empty, show "Nothing to fix on this page 🎉" above the collapsed group.
**Done when:** on the Core Loop page, project-wide onboarding hints are collapsed by default.

### 2.5 One main button per hint card
**Problem:** Go / Later / Dismiss / 🔕 are four similar-looking buttons, and 🔕 has no text label (`HintCard`, `HintPanel.tsx:19-69`).
**Change:**
- Keep the main action visible (`Go` / `Create`, styled `primary`), plus `🤖 Explain` when AI is set up.
- Put `Later (30 min)`, `Dismiss this hint` and `Never show this kind of hint` in a `⋯` overflow menu. Use the same `details.menu` pattern as the top bar, and give it `aria-label="More actions"`.
- Rename the i18n keys and texts in `en.json` and `hu.json` (`hints.snooze`, `hints.dismiss`, `hints.mute`) so each one says exactly what it does.
- If a hint has no action, show the overflow menu only.
**Done when:** each card has at most two visible buttons, and every menu item has a text label. Update tests that query `hints.dismiss` / `hints.snooze` by text.

### 2.6 Fix the clipped Hide button in the panel header
**Problem:** In `.hint-head`, the tabs plus the Hide/Show button overflow at the default panel width. The right edge shows "H…".
**Change:** Replace the text button with an icon button (`⟩` / `⟨`, `aria-label` = `t('hints.hide')`/`t('hints.show')`, `aria-expanded`). Let `.hint-head .tabs` shrink (`min-width:0;flex-wrap:wrap`). Make the tab buttons shorter (`💡 Hints 8`, `🧭 Guide`, `🤖 AI`) without forcing two lines.
**Done when:** nothing is clipped at the minimum panel width (220px) or the default width.

### 2.7 One severity-to-colour mapping, with a legend
**Problem:** "Next: …" hints show a yellow border in one place and blue in another. The onboarding rule gives the first item `suggest` and the rest `info` (`project.ts`), and the icons don't match the severity (`ICON.info` = `ICON.suggest` = 💡).
**Change:**
- Use separate icons: `info: 'ℹ️'`, `suggest: '💡'`, `important: '❗'`.
- Give all onboarding hints `info`, so the order no longer changes their colour.
- Add a one-line legend on the `/hints` page (`src/ui/hints/HintsPage.tsx`): red = important, yellow = suggestion, blue = info.
**Done when:** the same hint has the same colour and icon on the home page, in the editor panel and on `/hints`.

**Phase 2 checks:** `npx vitest run tests/hints.test.ts tests/render.test.tsx tests/editing.test.tsx`, typecheck, lint. Check the home page, Core Loop and Roadmap in the preview.

---

## Phase 3 — Editor header, top bar and System map

### 3.1 Combine document actions into one menu
**Problem:** Visual editor | Markdown preview | ? | .md | Export document | Import document wraps onto two rows (`src/ui/pages/EditorPage.tsx:82-90`).
**Change:**
- Keep the view switch (Visual editor / Markdown preview) on the left and Help on the right.
- Replace `.md`, `Export document` and `Import document` with one `details.menu` titled "Document ▾" containing: "Download Markdown (.md)", "Export as JSON", "Import from JSON…".
- Add i18n keys `editor.docMenu`, `editor.downloadMd`, and reuse the existing export/import keys.
**Done when:** the toolbar fits on one row at 1280px with the hint panel open. `data-testid` values and any tests that click these buttons still work or are updated.

### 3.2 Tidy the top bar
**Problem:** The right side mixes filled buttons (New/Open/Save/Save as/↶/↷/⋯) with text links (Definitions/Issues/Hints/AI/🔍) and wraps into two rows. The centred brand title pulls focus away from both sides (`AppShell.tsx:85-111`).
**Change:**
- Layout: `[Project name · save status] [nav: Definitions · Issues · Hints · AI] ……… [Search ⌘K] [Undo Redo] [Save ▾]`.
  - Move the brand to the far left as a small logo/home link before the project name, and drop the large centred title.
  - Make the nav items one style (`.nav-link`: text button with an underline for the active route via `NavLink`).
  - Make `Save` the only filled main button. Put `New`, `Open…`, `Save as…`, the exports, snapshot and language under its `▾` split menu, or under the existing `⋯` menu.
  - Search becomes a wide field-like button labelled "Search… Ctrl+K", which also makes the shortcut easier to find.
- Change `.topbar` to `display:flex;flex-wrap:nowrap`. Below about 900px, collapse the nav into the `⋯` menu.
**Done when:** the top bar is one row at 1024px and above, and all actions are still reachable. Keyboard shortcuts (`Ctrl+S`, `Ctrl+K`, `Ctrl+Z/Y`) are unchanged.

### 3.3 Make the Help button match other controls
**Problem:** `.help-btn` is a purple circle while every other button is a blue-outlined rectangle.
**Change:** Make it a normal button with `?` plus the text "Help", sitting in the toolbar's right-hand group. Remove `--secondary` from it, unless `--secondary` becomes the colour for all learning features (Guide tab, concept cards). If so, apply it to those too and note the rule in a CSS comment.
**Done when:** the toolbar buttons have one shape.

### 3.4 Less vertical space for the System map
**Problem:** The map is open by default (`EditorPage.tsx:24-27`, the `MAP_KEY !== '0'` check) and pushes each section down by about 140px.
**Change:**
- Default to open only the first time a module is visited. Store visited modules per doc as `hohplan:systemMapSeen:<docId>`. After that, use the saved preference, defaulting to closed.
- When it's collapsed, show a short summary line, e.g. "🗺️ System map · 3 empty · 2 with tips", using the same counts as the legend.
**Done when:** on a second visit to a planner the section title is at most about 120px below the toolbar.

### 3.5 Prevent layout shift between sections
**Problem:** Header buttons move a few pixels when switching sections, because the scrollbar appears and disappears in `.content`.
**Change:** Add `scrollbar-gutter:stable` to `.content`, `.sidebar` and `.hint-panel`.
**Done when:** switching sections leaves the toolbar in place (compare screenshots).

### 3.6 Icons
**Problem:** Controls mix emoji (🔕 🤖 💡 🧭 🔍) with text glyphs (↶ ↷ ⋯), which look different on each operating system.
**Change:** Add a small `src/ui/Icon.tsx` with inline SVGs (undo, redo, more, search, bell-off, sparkle/AI, compass, bulb, chevron) at `1em` size using `currentColor`. Use it for **controls only**. Keep emoji for the planner-card icons, which are content. Icon-only buttons must have an `aria-label`.
**Done when:** no emoji remain in buttons or tabs, and every icon-only button has an accessible name.

**Phase 3 checks:** `npx vitest run tests/render.test.tsx tests/editing.test.tsx tests/*Ui.test.tsx`, typecheck, lint, and a preview pass at 1024, 1280 and 1600px widths.

---

## Phase 4 — Wording and empty states

### 4.1 Proper plurals
**Problem:** "1 entries", "7 phase(s)", "0 loop(s)", "referenced 2 time(s)".
**Change:**
- i18next already handles plurals with `_one` / `_other` keys when `count` is passed. In `en.json` and `hu.json`, split every `{{count}}` message that contains a plural word into `_one`/`_other`. Known keys: the incomplete/unused/isolated/overflow/outlier hints (~lines 97–117) and the open-questions and vision hints (~lines 137–197) that use "(s)".
- `src/ui/editors/CollectionEditor.tsx:171`: section singulars come from module definitions, which aren't translated. Add an optional `plural` to the section definition, defaulting to `singular + 's'` with a small English helper (`y→ies`, `s/x/ch/sh→es`). Render `{n} {n === 1 ? singular : plural}`. For irregular words, set `plural` explicitly in the module.
- `CollectionEditor.tsx:296`: "time(s)" → `time`/`times`.
- Add a test that runs every `en.json` string and fails if one contains `(s)`. This stops it coming back.
**Done when:** `grep -rn "(s)" src/core/i18n src/ui` returns nothing, and the test passes.

### 4.2 No duplicate Add button in empty collections
**Problem:** When a collection is empty, the toolbar's `+ Add <singular>` (`CollectionEditor.tsx:183`) and `GuideEmpty`'s add button (`:265`) both show.
**Change:** Render the toolbar Add button only when `items.length > 0`. Keep `data-guide="add"` on the empty-state button so the Spotlight guide still finds its target. Check `src/ui/guides/Spotlight.tsx`.
**Done when:** empty sections show one Add button and one "Insert example…" button, and the guide spotlight still lands on it.

### 4.3 Fill in "Insert example…" labels
**Problem:** There are two "Insert example…" entry points: a header button and the empty-state button.
**Change:** Keep the header button only when the section has items ("Insert another example"). The empty state keeps its own.
**Done when:** each state shows one example button.

**Phase 4 checks:** `npx vitest run tests/hints.test.ts tests/editing.test.tsx tests/guides.test.ts`, typecheck, lint.

---

## Phase 5 — Consistency pass and documentation

### 5.1 Spacing and type tokens
Add `--space-1..5` (4/8/12/16/24) and `--fs-xs/sm/md/lg` (11/12/14/18) to `:root`. Use them for the rules touched in phases 1–4 only. A full migration of `styles.css` is out of scope; record it in the "Out of scope" section below.

### 5.2 Visual regression snapshots
Take preview screenshots (home, Core Loop, Roadmap → Phases, `/hints`) at 1280×800 before Phase 1 and after Phase 5, and save them in `plans/design-critique/`. This is the before/after record.

### 5.3 Documentation
- `README.md`: mention the new "Document ▾" menu, the hint scopes (this page / project-wide) and the hint legend.
- `en.json`/`hu.json`: every new key exists in both files. A test (`tests/core.test.ts` or new) fails if the two key sets differ.

**Final checks:** `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` (the production CSP must still apply).

---

## Finding → task map

| Critique finding | Severity | Task |
|---|---|---|
| Two different hint counts | 🔴 | 2.1 |
| Home page leads with nagging / duplicate Vision hints | 🟡 | 2.2, 2.3 |
| Hints panel takes too much space, repeats project hints | 🟡 | 2.4 |
| Hide button clipped | 🟡 | 2.6 |
| Four buttons per hint, unlabeled 🔕 | 🟡 | 2.5 |
| Crowded editor header | 🟡 | 3.1 |
| Duplicate Add button | 🟢 | 4.2, 4.3 |
| "1 entries", "(s)" wording | 🟢 | 4.1 |
| Save competes / split top bar / centred title | Hierarchy | 3.2 |
| System map pushes content down | Hierarchy | 3.4 |
| Mixed buttons and links in nav | Consistency | 3.2 |
| Purple round Help button | Consistency | 3.3 |
| Unclear severity colours | Consistency | 2.7 |
| Layout shift between sections | Consistency | 3.5 |
| Emoji vs glyph icons | Consistency | 3.6 |
| White on accent fails contrast | A11y | 1.1 |
| Badge fails contrast | A11y | 1.2 |
| Missing focus styles | A11y | 1.3 |
| Small click targets | A11y | 1.4 |
| Resize handle not keyboard-operable | A11y | 1.5 |
| Live region too noisy | A11y | 1.6 |

## Out of scope (possible follow-ups)
- Moving all of `styles.css` to spacing and type tokens.
- Light theme or a high-contrast theme switch.
- A full WCAG 2.2 audit of every planner-specific view (timeline, wireframe, canvas editors).

## Rough effort
| Phase | Size | Risk |
|---|---|---|
| 1 Accessibility | S (≈½ day) | Low: mostly CSS |
| 2 Hints | M (≈1–1.5 days) | Medium: changes visible behaviour, tests need updating |
| 3 Header / top bar / map | M (≈1 day) | Medium: many tests click toolbar buttons |
| 4 Wording / empty states | S (≈½ day) | Low |
| 5 Consistency / docs | S (≈½ day) | Low |
