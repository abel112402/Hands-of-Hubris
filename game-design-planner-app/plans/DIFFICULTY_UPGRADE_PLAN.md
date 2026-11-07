# Difficulty Levels editor: upgrade plan (v2, completed)

Module: `design.difficulty` in `src/modules/design.ts`. Doc: `docs/01_design/difficulty.md`. Follows `EDITOR_UPGRADE_GUIDE.md`.
Status: **implemented**. Focus: interactive, visual tabs that give an overall picture of the difficulty design.
Scope chosen: Tuning board, Pressure overview, Impact preview, Custom-setting simulator, plus Guide, hints, help, export and tests.

## 0. Analysis (state before this upgrade)
| Guide step | State before | Now |
|---|---|---|
| 1 Schema v2 | Done: `version: 2`, `migrateDifficulty`, seeded parameters with unit, direction and range; values matrix with row metadata | Unchanged ids and keys; new views; custom-setting min/max now documented as ×multipliers |
| 2 Core | `core/difficulty.ts`: `pressure`, `analyzeDifficulty` (missing, out of range, reversals, no context) | Pressure profile, level steps, spread, custom settings, step/snap; new `core/difficultyImpact.ts` |
| 3 Views | Parameters: table, cards, radar Compare; values only in the matrix | 4 new interactive / visual views |
| 4 Hints | 5 rules (missing, range, reversal, context, intent) | 3 more |
| 5 Help / export | Help without Guide pointer; matrix export only | Help rewritten; pressure and impact tables |
| 6 Guide | Missing | Added |
| 7 Tests | Hints in `hints.test.ts`; used by player/combat/trade tests | `difficulty.test.ts`, `difficultyGuide.test.ts`, `difficultyUi.test.tsx` |

Doc order (principles, parameter table, switching, data storage) already matched.

Gaps found:
- **No overall picture:** values were only editable as numbers in a matrix; the radar showed shape but not how far apart levels are or where their difficulty comes from.
- **Numbers the designer couldn't see:** an overall score per level and the step between levels; what a level does in Player, Combat and Trade; which parameters no system reads.
- **Unanswerable questions:** "Do my levels actually feel different?", "What does Hard do to survival time?", "Where would a player's custom mix land?"
- **Small check missing:** a baseline outside its own range.

## 1. Schema
No shape change (still `version: 2`). Views added: Parameters → **Tuning board** (now the first tab); Presets → **Pressure**, **Impact**; Custom settings → **Simulator**. `CATEGORIES` moved to `core/difficulty.ts` so the module and the views share it.

## 2. Core
`src/core/difficulty.ts` (pure):
- `pressureProfile(project, valueOf)` → overall 0–1 (mean pressure of parameters with a range and a harder/easier direction) and per-category mean and share (shares add up to the overall).
- `levelPressure`, `levelSteps` (delta to the previous level; `tooClose` under `MIN_STEP` = 0.05, `inverted` below 0).
- `baselineOutOfRange`, `stepOf` / `snap` (editing steps), `spreadValues(project, spread)` (even spread around the baseline in pressure terms).
- `customSettings`, `customRange` (×0.5–×2 default), `customValues` (settings multiply the base level, stack, clamp to range), `customPressure`.

`src/core/difficultyImpact.ts` (separate to avoid an import cycle with Player/Combat/Trade):
- `paramUsage` (Player survival `difficultyParam`, Combat `hpParam`/`damageParam`, Trade price parameter), `unusedParams`.
- `difficultyImpact`: per level, survival time to critical, enemy HP / damage ×, buy price ×.

## 3. Views (`src/ui/editors/difficultyViews.tsx`)
- **Tuning board:** one track per parameter, grouped by category; every track runs easy → hard left to right ("higher = easier" drawn flipped), baseline line, one coloured marker per level. Drag markers (pointer capture) or use the keyboard (`role="slider"`: arrows, Shift/PageUp/PageDown ×10, Home/End). Out-of-range markers are dashed, reversals glow; "+ Level" buttons place missing values at the baseline. Shows which system reads each parameter. Edits write the values matrix; one drag is one undo step.
- **Pressure:** per level a 0–100 score with a bar split by category, the step to the previous level (flagged when too close or inverted), and a category × level heat map. Rows open the matching preset.
- **Impact:** table of survival time, enemy multipliers and prices per level, with a bar per cell; list of which system reads each parameter.
- **Simulator:** pick a base preset, move each custom setting's slider, compare the custom score with the presets ("between Medium and Hard") and see the changed values. Nothing is saved.
Styles use CSS variables; the only fixed colours are the level and category series palettes.

## 4. Hints (`src/core/hints/rules/difficulty.ts`), all ≤ `suggest`
| Rule | Severity | Fires when |
|---|---|---|
| `difficulty.spacing` | suggest | neighbouring levels are under 5 points apart or the harder one scores lower |
| `difficulty.baseline` | info | a baseline lies outside Range min–max |
| `difficulty.unused` | info | parameters no system reads (only once some parameter is read) |

`hints.difficulty{Spacing,Baseline,Unused}` in `en.json` and `hu.json`.

## 5. Help and export
- `MODULE_HELP['design.difficulty']`: how to read and use each view, and a Guide pointer.
- Export, after the values matrix: **Pressure per level** (overall, step, per category) and **Impact on other systems**.

## 6. Guide (`src/modules/guides/difficulty.ts`)
- **Map:** Principles, Presets → Parameters, Custom settings → Values per level → Player, Combat, Trade.
- **Steps (10):** principles · preset intents · direction and range · place every level · keep tracks in order · check spacing · connect to systems · custom settings · switching · data storage.
- **Examples:** gentle (±20%) and wide (±40%) value spread (fills only empty cells), easy/standard/punishing intents (fills empty fields), three accessibility sliders linked by parameter name. Preview kind `difficultyPressure`.
- **Concepts:** parameters → `tuningTrack`, presets → `pressureBars`.

## 7. Tests and verification
- `tests/difficulty.test.ts`: pressure profile (flip, shares, clamping), steps, step/snap, spread, baseline, custom values (stacking, clamping, defaults), usage and impact numbers, export order and tables, each new hint positive/negative, quiet without parameters and in other editors, never `important`.
- `tests/difficultyGuide.test.ts`: ids, map spacing, spread ticks steps and is one undo step, keeps tuned cells, intents and custom examples, impact step, map states.
- `tests/difficultyUi.test.tsx`: keyboard tuning (incl. flipped parameter and "+ Level"), pressure view and preset selection, simulator placement without saving.
- Checked in the browser: spread preview, board positions (flipped morale), keyboard and pointer drag, pressure/heat map/impact numbers, simulator.

## Possible later work
- Combat time-to-kill per level in the Impact view (needs a chosen loadout and enemy).
- Let the simulator save a custom mix as a new preset.
