# Core Loop editor: upgrade plan (v2, completed)

Module: `design.coreLoop` in `src/modules/design.ts`. Doc: `docs/01_design/core_loop.md`. Follows `EDITOR_UPGRADE_GUIDE.md`.
Status: **implemented** (all steps below are done). Scope chosen: Guide, tests, help and export, plus **loop pacing**, **pillar links** and **reward refs**.

## 0. Analysis (state before this upgrade)
| Guide step | State before | Now |
|---|---|---|
| 1 Schema v2 | Done: `version: 2`, `migrateCoreLoop` (`rewards` → `reward`), sections in doc order, help/placeholders | Three optional fields added, inspector groups |
| 2 Core (`src/core/coreLoop.ts`) | Missing; `hasFeedback` lived in the hint rules | Added; `hasFeedback` moved here |
| 3 Views | Cards, Progression, Board, Table | **Pacing** view added |
| 4 Hints | 7 rules (scales, reward, decision, progression, unlinked, isolated, feedback) | 4 more |
| 5 Help / export | Help without Guide pointer; export split by time scale | Help rewritten; pacing table + pillar coverage in the export |
| 6 Guide | Missing | Added |
| 7 Tests | Migration/export in `core.test.ts`, hints in `hints.test.ts` | `coreLoop.test.ts`, `coreLoopGuide.test.ts`, `coreLoopUi.test.tsx` |

Doc chapters: 1–4 are the loops split by time scale (`exportSplit`), 5 is `rewardsProgression`, 6 is `loopGraph`. Order was already right.

Gaps found:
- **Unchecked rule:** "Builds toward" help says "only link to a longer time scale", but nothing checked it.
- **Numbers the designer couldn't see:** how long one cycle takes, and how many short cycles fit into a longer loop (pacing). Time & Weather already has a day length to convert to in-game days.
- **Unanswerable questions:** "Does every Vision pillar have a loop the player repeats?" and "What exactly is this reward?" (free text only).

## 1. Schema (additive, still `version: 2`)
New optional fields on `loops` (no migration; v2 data loads unchanged, tested):
- `cycleMinutes`: `f.num`, "One cycle takes (real minutes)".
- `rewardRefs`: `f.multi` over `{ any: [catalog('resources'), section('buildings','design.town'), ITEMS] }` (same source as outpost rewards). The free-text `reward` stays.
- `pillars`: `f.multi` to `section('pillars','overview.vision')`.

Inspector groups: **The loop** (scale, cycle, action, reward, reward refs, next decision, choice shift) and **Links** (builds toward, pillars, diagram nodes). Ids and keys unchanged.

## 2. Core (`src/core/coreLoop.ts`)
Pure functions: `CORE_LOOP_DOC`, `SCALES`, `loopList`, `loopGraph`, `scaleIndex`, `hasFeedback`,
`wrongDirection` (links to the same or a shorter scale), `dayLength` (from Time & Weather),
`loopPacing` (per loop: minutes, in-game days, and for each "builds toward" target the ratio of cycles and an `inverted` flag when the target is not longer), `pillarLoops`, `formatMinutes`.
Rough planning aids from entered lengths; the UI says so.

## 3. View: Pacing (`src/ui/editors/coreLoopViews.tsx`, kind `loopPacing`)
Loops sorted by scale then length; log-scale bar of one cycle, in-game days when a day length is set, and "Target: ×N cycles" per link (warning colour when not longer). Rows open the inspector. Styles in `styles.css` (`.loop-pacing`).

## 4. Hints (`src/core/hints/rules/coreLoop.ts`), all ≤ `suggest`
| Rule | Severity | Fires when |
|---|---|---|
| `coreLoop.direction` | suggest | "Builds toward" points to the same or a shorter scale |
| `coreLoop.pacing` | info | by cycle lengths, a target is not longer than the loop |
| `coreLoop.pillars` | suggest | Vision pillars no loop serves (only once some loop is tagged) |
| `coreLoop.rewardRefs` | info | rewards described but not linked (only once some loop has links) |

`hints.coreLoop{Direction,Pacing,Pillars,RewardRefs}` in `en.json` and `hu.json`.

## 5. Help and export
- `MODULE_HELP['design.coreLoop']`: tips for cycle length/Pacing, pillar and reward links, and a Guide pointer.
- Export: under chapter 5 (Rewards and progression) a **Loop pacing** table and a **Pillars served by loops** line. The single-field form shortcut in `sectionMd` now appends module extras too.

## 6. Guide (`src/modules/guides/coreLoop.ts`)
- **Map:** Vision and Time & Weather → Loops → Loop diagram / Rewards & progression → Items & Crafting / Town (210 px columns).
- **Steps (9):** one loop per scale · action → reward → decision · cycle length · chain with "Builds toward" · check pacing · pillars · reward refs · diagram with feedback · rewards & progression text.
- **Examples:** survival-town loop set (4 chained loops), expedition loop set (3), gather–craft feedback diagram. Loop examples never duplicate names and only link loops they created. Preview kind `coreLoopList`.
- **Concepts:** loops → `nestedLoops`, loopGraph → `feedbackLoop` (in `ui/guides/concepts.tsx`).
- **Empty:** loops.

## 7. Tests and verification
- `tests/coreLoop.test.ts`: direction, pacing ratios and days, missing lengths, pillar coverage, feedback, formatting; v2 load unchanged; export headings in doc order with the chapter 5 summary; each new hint positive/negative, quiet on empty doc and other editors, never `important`.
- `tests/coreLoopGuide.test.ts`: ids exist, map spacing, step predicates, example preview = insert, one undo step, no duplicates or rewiring, diagram placement and feedback, map states.
- `tests/coreLoopUi.test.tsx`: Pacing view numbers; inspector groups from a pacing row.
- Existing `core.test.ts` / `hints.test.ts` core loop tests pass unchanged.

## Possible later work
- Mark a loop as the **core** one (the one the pitch is about) and check it is on the short scale.
- Use `cycleMinutes` against Player Character survival drain (`timeToCritical`): does one short loop finish before a stat runs out?
