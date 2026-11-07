# Vision & Concept (`overview.vision`) upgrade plan

Follows `EDITOR_UPGRADE_GUIDE.md`. Scope chosen: **Lean + pillar refs on scope items and USPs**.

## 0. Analysis (current state)
| Guide step | State |
|---|---|
| 1 Schema v2 (`src/modules/overview.ts`) | **Mostly done**: `version: 2`, `migrateVision` (concept form split), sections in doc order (pitch, references, audience, USPs, pillars, tone, scope, platform, monetization), help/placeholder present. |
| 2 Core (`src/core/vision.ts`) | Missing |
| 3 Views | Missing (only cards/table/kanban) |
| 4 Hints | Partial: `rules/vision.ts` (pitch, pillar count, decision test, USP benefit, scope bucket/MVP) |
| 5 Help / export | Help exists (`MODULE_HELP['overview.vision']`, check it mentions the Guide); no export summaries |
| 6 Guide | Missing (not in `GUIDES`) |
| 7 Tests | Only incidental coverage (`hints.test.ts`, `core.test.ts`, `editing.test.tsx`); no `vision.test.ts` |

Gaps found:
- Scope items, USPs and pillars are unrelated, so the designer can't see which pillar a feature serves or which pillar has nothing behind it.
- Pitch is a free sentence with no check that it names genre, player and goal.
- Platform, monetization and audience are single long-text blocks (acceptable; the doc template is prose there, so leave them).
- `hints.vision*` i18n keys: verify that en and hu have all keys used (only `visionPitch` was confirmed).
- Fix: `vision.pillarCount` / `vision.scopeBucket` / `vision.scopeMvp` rule ids are returned from rules with other ids; check that `hintId` and the tests agree.

## 1. Schema (small change, no id changes)
- `scope` items: add `f.multi('pillars', 'Serves pillars', section('pillars'))` and `f.multi('usps', 'Delivers USPs', section('usps'))`.
- `usps`: add `f.multi('pillars', 'Backed by pillars', section('pillars'))`.
- `pillars`: add `group` for the rationale/test/example fields only if >6 fields (currently 5, skip).
- Bump nothing if the new fields are optional and absent in v1 data; if bumping to `version: 3`, `migrateVision` must stay idempotent. Prefer **staying on 2** (additive fields need no migration). Note this in a code comment.
- Keep ids `pitch, references, audience, usps, pillars, tone, scope, platform, monetization`.

## 2. Core: `src/core/vision.ts` (pure)
- `VISION_DOC`, `PILLAR_RANGE`.
- `pillarCoverage(project)` -> per pillar: scope items (by bucket), USPs, count; flags `unused` (no scope/USP) and `mvpBacked` (at least one In MVP item).
- `scopeCoverage(project)` -> scope items with no pillar (`orphans`), items serving several pillars, counts per bucket.
- `pitchCheck(text)` -> simple heuristics (length 8-40 words, one sentence, contains a player/goal clause); returns a list of missing parts. Planning estimate only; say so in the UI.
- `visionReadiness(project)` -> checklist of 9 doc chapters filled yes/no (feeds Guide steps, hints and export).

## 3. Views (`src/ui/editors/visionViews.tsx`)
- Add `pillarMatrix` and `visionReadiness` to `CollectionView` (`core/model/types.ts`), helpers in `v` (`modules/helpers.ts`), labels/dispatch in `CollectionEditor.tsx`.
- **Pillar matrix** (on `pillars` and `scope`): rows = scope items grouped by bucket, columns = pillars; filled cell if linked; footer counts per pillar; clickable rows/columns call `onSelect(id)`. Orphan rows and unused columns highlighted with `--warn`.
- **Readiness** (on `pillars`, or as a header strip on the first section): 9-chapter checklist with goto links, plus the pitch-check result.
- Styles in `src/styles.css` using CSS variables only.

## 4. Hints (extend `rules/vision.ts`)
- `vision.scopeNoPillar` (suggest): MVP item serves no pillar; action `goto`.
- `vision.pillarUnused` (info): pillar with no scope item or USP.
- `vision.pillarNotInMvp` (info): pillar with nothing in MVP.
- `vision.pitchShape` (info): pitch too long/short or missing parts.
- `vision.uspPillar` (info): USP with no pillar.
- Keep everything `suggest` or below; stay quiet on an empty doc and in other editors. Add `hints.<key>.title/body` to **en.json and hu.json**; verify existing keys.
- Registered already in `RULES`.

## 5. Help and export
- Rewrite `MODULE_HELP['overview.vision']` (`src/ui/help.ts`): purpose, 5-7 tips (pitch last, 3-5 pillars with decision tests, tag scope items with pillars...), pointer to Guide tab.
- `src/core/export/markdown.ts`: `pillarMatrixMd` (table pillar x scope item) and a readiness line; headings stay in doc order.

## 6. Guide (`src/modules/guides/vision.ts`, register `'overview.vision'` in `GUIDES`)
- **map:** nodes = pitch, references, audience, usps, pillars, scope + neighbour docs (`overview.roadmap`, `design.coreLoop`), 210px grid; edges "guide", "backs", "limits".
- **steps (8-10):** draft pitch; name references; audience; 3-5 pillars; decision test per pillar; USPs with benefit; tag USPs with pillars; scope items by bucket; every MVP item has a pillar; refine the pitch. `done()` from data; `target` ids `add`, `view-pillarMatrix`, `field-decisionTest`.
- **examples:** pillars (2-3 sets, e.g. industry/magic contrast, cozy management), scope (MVP starter list with `param` for pillar tagging), USPs.
- **concepts:** "What is a pillar" and "Scope buckets" cards; add diagram cases in `ui/guides/concepts.tsx`.
- **empty:** one sentence each for usps, pillars, scope.

## 7. Tests
- `tests/vision.test.ts`: v1 `concept` migration (ids and text kept), export headings in doc order, `pillarCoverage`, `scopeCoverage`, `pitchCheck`, `visionReadiness` with hand-checked numbers, each new hint positive/negative, quiet on empty doc and other editors, never `important`.
- `tests/visionGuide.test.ts` (pattern from `itemsGuide.test.ts`): section/doc ids exist, step predicates and actions, example preview equals the inserted result and undo removes it, map states.
- `tests/visionUi.test.tsx`: load a project, set the hash `#/doc/overview.vision`, check matrix and readiness render and rows select.
- Existing tests to revisit: `hints.test.ts` (vision block), `core.test.ts`, `editing.test.tsx` only if ids or defaults change (they should not).
- Run narrowest first: `npx vitest run tests/vision*.test.ts*`, then `npm run typecheck`, `npm run lint`, full `npx vitest run`; check the views in the browser with `examples/hands-of-hubris.hohplan.json`.

## Order of work
1. Schema fields -> 2. `core/vision.ts` + `vision.test.ts` -> 3. hints + i18n -> 4. views + CSS + UI test -> 5. help + export -> 6. guide + guide test -> 7. full verification.
