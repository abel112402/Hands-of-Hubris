# Factions & Diplomacy editor: upgrade plan (v2, completed)

Module: `design.factions` in `src/modules/design.ts`. Doc: `docs/01_design/factions_diplomacy.md`. Follows `EDITOR_UPGRADE_GUIDE.md`.
Status: **implemented**. Focus: interactive, visual tabs that give an overall picture of factions, their relations and the player's reputation.
Scope chosen: Relations web, Reputation scale, Action simulator, Faction footprint, plus Guide, hints, help, export and tests.

## 0. Analysis (state before this upgrade)
| Guide step | State before | Now |
|---|---|---|
| 1 Schema v2 | Done: `version: 2`, `migrateFactions` (characters / unlocks as links, `spilloverDefault`), matrix with scale from the overview | Unchanged ids and keys; new views only |
| 2 Core | `core/diplomacy.ts`: `scaleOf`, `analyzeRanges`, `asymmetricPairs`, `graphDisagreements` | Pairs, standings, start value, level lookup, action effects, simulator, marker checks; new `core/diplomacyFootprint.ts` |
| 3 Views | Cards, table, plain number matrix, free graph, ranges bar | 4 new interactive / visual views |
| 4 Hints | 6 rules (profile, thresholds/ranges, asymmetry, graph, matrix, spillover) | 3 more |
| 5 Help / export | Help without Guide pointer; plain tables | Help rewritten; standings, footprint and start level in the export |
| 6 Guide | Missing | Added |
| 7 Tests | Hints in `hints.test.ts`, migration and checks in `core.test.ts` | `diplomacy.test.ts`, `diplomacyGuide.test.ts`, `diplomacyUi.test.tsx` |

Doc order (overview, faction sheet, matrix, actions, consequences, endings) already matched; the graph sits after the matrix.

Gaps found:
- **No overall picture:** relations were only numbers in a grid; nothing showed blocs, rivalries or one-sided feelings at a glance.
- **Levels hard to judge:** the ranges bar showed gaps, but the start value and the allied / hostile cut-offs were plain numbers elsewhere.
- **Unanswerable questions:** "If the player helps the Crown three times, where does everyone end up, and what does that unlock?", "Which factions exist only on paper?"
- **Small checks missing:** markers outside the scale; factions no action can move.

## 1. Schema
No shape change (still `version: 2`). Views added: Factions → **Relations web** (now the first tab), **Footprint**; Actions → **Simulator** (first tab); Relationship levels → **Scale** (first tab).

## 2. Core
`src/core/diplomacy.ts` (pure):
- `factionsOf`, `relationCells`, `relationOf`, `standingMarks` (ally / hostile cut-offs, default 50 / -50), `standingOf`.
- `relationPairs` → per unordered pair: both directions, mean, standing, `asymmetric` (> 10 apart), named graph kinds.
- `factionStandings` → allies, hostile, neutral, unset per faction (by pair mean) and the mean regard received.
- `levelsOf`, `actionsOf`, `startValue` (clamped; 0 or the scale middle when unset), `levelAt`.
- `actionEffect` (direct change for the action's faction, else per-faction spillover, else the default), `simulateActions` (sequence from the start value, clamped per step, level crossings; decay not modelled), `markProblems`.

`src/core/diplomacyFootprint.ts` (separate because `findUsages` walks the module registry):
- `factionFootprints` → actions, endings, characters, unlocks inside the module; references from other modules grouped by module.
- `unlinkedFactions` (only once some faction is referenced elsewhere).

## 3. Views (`src/ui/editors/diplomacyViews.tsx`)
- **Relations web:** factions on a circle; one line per pair coloured hostile (red) → neutral (grey) → allied (green) and thicker for stronger feelings; one-sided pairs as two arrows bowing to either side; unset pairs dashed; "!" where a graph relationship contradicts the numbers. Click / Enter on a line opens both directions as sliders (with Mirror and Clear); click a faction to list its allies, enemies, neutral and unset pairs. Counts of allied / hostile / neutral / unset / one-sided pairs.
- **Footprint:** table per faction (allies, hostile, characters, unlocks, actions, endings, one column per module that references factions, "none yet" warning) with heat shading, plus a stacked size bar per faction.
- **Scale:** levels as coloured segments on the reputation scale (gaps hatched, overlaps outlined); draggable boundaries between neighbouring levels (`role="slider"`, arrows / Shift / Home / End; moving a boundary sets the next level's minimum and, if set, the previous level's maximum); draggable start / allied / hostile markers that write the overview; level table with range and consequences.
- **Simulator:** add actions in order, remove or clear them, optional start override; line chart of every faction's reputation per step over the level bands and cut-off lines; table with start, end, change, level crossings and the consequences of the level reached. Nothing is saved.
Styles use CSS variables; the only fixed colours are the faction fallback palette and the hostile → allied ramp.

## 4. Hints (`src/core/hints/rules/diplomacy.ts`), all ≤ `suggest`
| Rule | Severity | Fires when |
|---|---|---|
| `diplomacy.marks` | info | starting value or a cut-off lies outside the scale, or allied ≤ hostile |
| `diplomacy.unlinked` | info | factions no other module references (only once one faction is referenced) |
| `diplomacy.untouched` | info | factions no action changes, directly or by spillover (only once actions have a faction) |

`hints.diplomacy{Marks,Unlinked,Untouched}` in `en.json` and `hu.json`.

## 5. Help and export
- `MODULE_HELP['design.factions']`: how to read and use each view, and a Guide pointer.
- Export: after the matrix, **Allied / Hostile / One-sided** pairs; after the factions, a **Faction footprint** table; after the relationship levels, the level a new game starts in.

## 6. Guide (`src/modules/guides/diplomacy.ts`)
- **Map:** Overview & scale, Factions → Relationship matrix, graph, Endings → Actions, Relationship levels → Story & Quests, Trade, World & Biomes.
- **Steps (10):** model · scale and markers · factions · relations · named relationships · levels on the scale · consequences · actions · footprint · endings.
- **Examples:** four rival factions (skips names that exist), two rival blocs (fills only empty matrix cells, scaled to the scale), five relationship levels (adds missing names, fills empty consequences), one "Aid" action per faction (spillover from the matrix). Preview kind `diplomacy`.
- **Concepts:** factions → `relationWeb`, thresholds → `repScale`.

## 7. Tests and verification
- `tests/diplomacy.test.ts`: pairs and standings, action effects, simulator (spillover, clamping, crossings), start value, marker checks, footprint grouping, export order and tables, each new hint positive / negative, quiet in other editors, never `important`.
- `tests/diplomacyGuide.test.ts`: ids, map spacing, the four examples build a full setup and tick their steps (one undo step each), kept cells, scale step, map states.
- `tests/diplomacyUi.test.tsx`: editing a pair from the web (slider and Mirror), keyboard on boundaries and markers, simulator rows without saving, footprint.
- Checked in the browser with screenshots: web (incl. one-sided arrows after a fix), pair editor, footprint, scale with a pointer drag of a boundary, simulator chart and table; no console errors. Test data was undone afterwards.

## Possible later work
- Decay over time in the simulator (needs a numeric decay rate; the overview keeps decay as text).
- Let the simulator save a sequence as a named "route" for playtesting notes.
