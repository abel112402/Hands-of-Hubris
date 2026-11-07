# Open Questions editor: light v2 upgrade plan

Module: `design.openQuestions` in `src/modules/design.ts`. Doc: `docs/01_design/open_questions.md`.
Scope: a **light** upgrade. No new view kinds, no new core analysis module beyond a few helpers, no charts.

## 0. Analysis (what's wrong today)
- **Doc order:** the doc has a single table with these columns: # · Question · Area · Options · Decision · Status · Owner · Due. The editor has one `questions` collection, which is fine. The doc's closing rule ("link the decision to the affected design doc") has no field.
- **Free text that should be a ref or enum:**
  - `owner` is free text, but Team & Workflow (`production.team`, section `members`) already lists the roles. It should be a ref.
  - `area` is free text (Economy / NPC / Logistics…). It should be an enum so the kanban, table and hints group the same way.
- **Numbers the designer can't see:** how many questions are open or overdue, and how many decided ones aren't written back into a doc.
- **Unanswerable today:** "Which decisions haven't been written into their design doc yet?" and "What's past its due date?"
- **Bug:** `due` is `f.text`, so it can't be compared or sorted. It should be `f.date`.
- **Status mismatch:** the doc says Open/Decided, and the editor adds Discussion. Keep all three (Discussion is useful) and export Discussion as "Open".

## 1. Schema v2 (`src/modules/design.ts`)
Wrap it as `{ ...mod(...), version: 2, migrate: migrateOpenQuestions }`. Keep the section id `questions` and all existing field keys.

| key | v1 | v2 |
|---|---|---|
| `area` | text | `f.enm` with `['Economy','NPC','Logistics','Combat','World','Story','Items','UI','Technical','Other']` |
| `options` | long | unchanged, plus a placeholder: "A: … / B: …" |
| `decision` | long | unchanged, plus help: "Fill in when the status is Decided." |
| `status` | enum | unchanged |
| `owner` | text | `f.ref('owner', 'Owner', section('members', 'production.team'))` |
| `due` | text | `f.date` |
| **new** `affects` | – | `f.list('affects', 'Updated in docs', { help: 'Doc or module where the decision was written back.' })` |
| **new** `legacyNotes` | – | `f.long` (only filled by the migration) |

`migrateOpenQuestions(data)`:
- `area`: match case-insensitively against the enum. If nothing matches, set it to `Other` and append the original text to `legacyNotes`.
- `owner`: match against `production.team` member names. If nothing matches, clear the field and move the text to `legacyNotes`.
- `due`: keep it if it parses as an ISO date. Otherwise move it to `legacyNotes`.
- Keep entity ids. Follow the shape of `migrateFactions`.

## 2. Small helpers (`src/core/openQuestions.ts`)
Pure functions, no React:
- `OPEN_QUESTIONS_DOC = 'design.openQuestions'`
- `questionStats(p, today)` → `{ open, discussion, decided, overdue }`
- `overdue(p, today)`: not Decided and `due < today`
- `decidedNotWrittenBack(p)`: Decided with an empty `affects`
- `decidedWithoutDecision(p)`: Decided with an empty `decision`

## 3. Views
No new view kinds. Keep `v.kanban('status')` and `v.table()`. Add a column list to the table: `v.table(['area','status','owner','due'])`.

## 4. Hints (`src/core/hints/rules/openQuestions.ts`)
Copy the shape of `rules/player.ts`. Severity is `suggest`, and each hint has a `goto` action to the entity.
1. `oq.decidedNoText`: the status is Decided but `decision` is empty.
2. `oq.notWrittenBack`: Decided, but `affects` is empty (the doc's own rule).
3. `oq.overdue`: past its due date and still open.

Register them in `RULES` and add `hints.oq.*.title/body` to both `en.json` and `hu.json`. Stay quiet on an empty doc.

## 5. Help and export
- `MODULE_HELP['design.openQuestions']` in `src/ui/help.ts`: purpose, 5 tips (one question per row; list the options before deciding; set an owner and due date; write the decision back and fill "Updated in docs"; review at every gate), and a pointer to the Guide tab.
- `src/core/export/markdown.ts`: export the table in doc column order (#, Question, Area, Options, Decision, Status, Owner, Due). Add a one-line summary above it: "Open: X · Decided: Y · Overdue: Z".

## 6. Guide (`src/modules/guides/openQuestions.ts`), kept minimal
- `map`: the `questions` node plus `doc` nodes for `production.team` ("owned by") and `overview.gates`/Roadmap ("reviewed at"), if that id exists. Otherwise skip it.
- `steps` (5, which is fewer than the guide's 8–10 on purpose because this module is simple): add a question → set area → list options → set owner and due date → decide and fill "Updated in docs".
- `examples`: one set, "Hands of Hubris starter questions" (the current 5 seeds).
- `concepts`: none. `empty`: one sentence for `questions`.
- Register it in `GUIDES`.

## 7. Tests (`tests/openQuestions.test.ts`)
- The migration keeps ids, maps a known area or owner to the enum or ref, and moves unknown text into `legacyNotes`.
- Export columns follow the doc order.
- `questionStats`, `overdue` and `decidedNotWrittenBack` on hand-made data.
- Each hint has a positive and a negative case, is quiet on an empty doc, and is never `important`.
- Add the guide to the existing `tests/guides.test.ts` checks: ids exist and step predicates work.
- Run `npx tsc -b --noEmit`, `npx eslint .` and `npx vitest run`, then look at the kanban, table and hints in the browser.

## Out of scope (deliberately)
New charts or views, priority scoring, dependency graphs between questions, and automatic linking to other modules' entities.
