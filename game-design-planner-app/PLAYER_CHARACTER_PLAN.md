# Player Character editor: analysis and v2 plan

**Status:** Proposed | **Date:** 2026-11-04 | **Module:** `design.player` ([src/modules/design.ts](src/modules/design.ts), `mod('design', 'player', …)`)

## Context

The Player Character editor is still the **v1 generic module**: 7 sections built from the shared form, collection, graph and formulas editors. It has no analysis code, no hint rules, no migration and a two-line help entry. Difficulty, factions, world, town and (now) NPC already have a v2 with domain logic.

This plan does two things:

1. **Upgrades the editor** so it can actually plan the hero: survival pacing, levelling, casts, skill trees, abilities, controls, and death.
2. **Adds a guide framework** with visual guides (a system map, concept diagrams, live previews) and interactive guides (a guided setup, examples you preview before inserting, a build planner). Player Character is the first module to use it, and every other module can reuse it.

## 1. Analysis

### Coverage against `docs/01_design/player_character.md`

| Doc chapter | Today | Problem |
|---|---|---|
| 1. The hero | `hero` form (background, personality, start, **death**) | Death lives in the hero form; the starting state is free text with no links to items or stats |
| 2. Survival stats | `survival` collection | Max and decay only. No critical threshold or tiers, no link to Difficulty, restore items are free text |
| 3. XP and levelling | generic `xp` formulas section | No level cap, skill points per level or XP sources. The curve can't answer "how long does level 10 take?" |
| 4. Casts | `casts` collection | Duplicates the casts catalog. Starting abilities and gear are free-text lists. Faction affinity is a single faction |
| (4) Skill tree | generic `skillTree` graph | Nodes only have a label and a cast tag: no cost, tier, level requirement, effect or ability. No check of the point budget |
| 5. Abilities and spells | `abilities` collection | Mana cost but no resource pool or damage type. The formula evaluates with every variable = 1 |
| 6. Controls and camera | free-text form | Can't be reviewed action by action |
| 7. Death and respawn | one textarea in the hero form | Not its own chapter; no link to permadeath in Difficulty |

The export order (hero, survival, casts, tree, abilities, XP, controls) doesn't match the doc order (hero, survival, XP, casts, abilities, controls, death).

### Functional gaps

- **Pacing is invisible.** A designer can't see how long Hunger lasts on Hard, how many hours level 20 takes, or whether a cast's tree can be completed by the level cap.
- **No cross-module links.** Survival ignores the Difficulty decay parameters. Restore sources and starting gear ignore Items. Abilities ignore the damage-type catalog used by Combat. Factions' "Unlockable skills" points at graph nodes that have no data behind them.
- **The skill tree is a free-form graph.** That's fine for a sketch, but a skill needs structured data (cost, tier, requirements, the ability it grants) to be balanced and validated.

### Usability, UX and professionalism

- The only help is a static popup with two tips. Empty sections say "Nothing here yet", which teaches nothing.
- Nothing shows how the sections depend on each other. XP feeds skill points, points buy skills, skills grant abilities, and abilities cost a resource; today that chain lives only in the designer's head.
- The editor has no checks, migration or tests, and its export doesn't match the doc. It lags behind its sibling modules.

## 2. Target data model (module `version: 2`, `migrate: migratePlayer`)

Sections in doc order. `hero`, `survival`, `casts` and `abilities` keep their ids, and their v1 fields stay valid.

| # | Section (id) | Kind | Key content |
|---|---|---|---|
| 1 | The hero (`hero`) | form | background, personality, starting state, `startItems` (multi → Items), `fantasy` (one line: what playing the hero feels like) |
| 2 | Survival stats (`survival`) | collection | stat (ref survivalStats), max, decay, `decayUnit` (per real minute / per in-game hour), `criticalAt`, `tiers` (list: "≤30 slower, ≤10 damage"), lowEffect, restore, `restoreItems` (multi → Items), `difficultyParam` (ref → Difficulty parameters). Views: table, **Depletion** (new), cards |
| 3 | Levelling (`leveling`) | form (new) | `levelCap`, `xpFormula` (formula in `level`), `skillPointsPerLevel`, `statPointsPerLevel`, respec rules |
| 4 | XP sources (`xpSources`) | collection (new) | kind (Kill / Quest / Craft / Build / Explore / Gather / Trade), xp per action, `perHour` (expected rate), linked content (multi → enemies, quests, recipes). Views: **Level curve** (new), table |
| 5 | Casts (`casts`) | collection | cast (ref), playstyle, `primaryResource` (Mana / Stamina / None), `startAbilities` (multi → abilities), `startGear` (multi → Items), `affinity` (multi → factions), color |
| 6 | Skills (`skills`) | collection (new, **replaces the `skillTree` graph**) | cast, kind (Passive / Active / Spell), tier, cost (points), `requiredLevel`, `requires` (multi → skills), `grants` (ref → abilities), effect. Views: **Skill tree** (new), **Build planner** (new), table |
| 7 | Abilities and spells (`abilities`) | collection | cast, kind, resource cost (keeps `mana`), cooldown, `castTime`, `range`, `damageType` (ref damageTypes), formula, description |
| 8 | XP and balance formulas (`xp`) | formulas | kept for formulas that are not the XP curve (damage scaling, etc.) |
| 9 | Controls (`controls` form + `actions` collection) | form + collection | camera and scheme notes; per action: keyboard/mouse, gamepad, context, `rebindable` |
| 10 | Death and respawn (`death`) | form (new) | penalty, respawn point, item loss, corpse run, permadeath (refers to the Difficulty doc) |

`migratePlayer` does three things:
- Moves `hero.death` → `death.penalty`.
- Converts `skillTree` graph nodes into `skills` entries **with the same ids**, so the `unlocks` references in Factions keep resolving. A node's `refId` becomes `cast`, its kind maps to kind, and its notes to effect. A `requires` edge source→target adds the source to the target's `requires`. The graph is then dropped.
- Wraps `casts.affinity` into an array, and moves free-text `startAbilities` and `startGear` lists into `legacyNotes`, following the `migrateFactions` pattern.

Update `UNLOCKABLE` in `design.ts` to `section('skills', 'design.player')`, and update the factions test at `tests/core.test.ts:290`, which builds the v1 graph.

## 3. Analysis core: new `src/core/player.ts`

Pure functions in the style of `src/core/npc.ts` and `src/core/town.ts`:

- `timeToCritical(project, stat, difficultyLevelId?)`: minutes from full to `criticalAt`, with decay scaled by the linked Difficulty parameter's value for that level. The value comes from the `values` matrix key `${paramId}|${levelId}`.
- `depletionSeries(project)`: points for the Depletion chart, one line per stat per difficulty.
- `levelTable(project)`: XP per level and cumulative XP from `leveling.xpFormula`, evaluated with `tryEvaluate` up to `levelCap`. It flags errors and non-increasing steps.
- `hoursToLevel(project)`: cumulative XP ÷ Σ(`xp × perHour`) of the XP sources, as a rough pacing estimate.
- `pointsAt(project, level)` gives the skill points available at a level. `treeAnalysis(project)` returns, per cast: total cost, depth, skills locked behind a level higher than the cap, cycles, orphans (unreachable from a tier-1 skill), skills whose `grants` ability belongs to another cast, and **budget fit** (points at cap ÷ total tree cost).
- `buildState(project, castId, level, picked)`: what the build planner shows. Points spent and left, which skills can be learned (requirements met, level reached, enough points), and why a skill is locked.

## 4. New views

Collection views go in a new `src/ui/editors/playerViews.tsx`, dispatched from `CollectionEditor.tsx` the same way `npcViews.tsx` is.

| View | On | What it shows |
|---|---|---|
| **Depletion** (`depletion`) | survival | Recharts line chart of each stat from max down to 0 over time, with a critical band. A difficulty selector (Easy / Medium / Hard from the catalog) rescales the lines, and a "time to critical" table sits beside it |
| **Level curve** (`levelCurve`) | xpSources | XP per level (bars) and cumulative XP (line), with markers at the levels where each cast's tree becomes affordable. An hours-to-level axis appears when XP sources have rates |
| **Skill tree** (`skillTree`) | skills | One lane per cast and one row per tier, with `requires` arrows drawn in SVG (layout reuses the layered approach of `autoLayout` in `GraphEditor.tsx`). Nodes show cost, required level and the granted ability. Clicking a node selects it for the inspector. Shows the cast's total cost against its budget |
| **Build planner** (`buildPlanner`) | skills | **Interactive**: pick a cast and a level, then click skills to learn them in order. Locked skills explain why ("needs Parry", "level 8"). A points bar shows spent/left. Lets the designer *play* the tree to test it. Builds are kept per session; a "save as example build" option is optional |

## 5. Guide framework (visual and interactive guides)

This is generic infrastructure in `src/core/guides/` (data) and `src/ui/guides/` (UI). Each module opts in by giving a `guide` in its definition. Player Character is the first full guide; NPC and Town can follow with no new code.

```ts
// src/core/guides/types.ts
interface ModuleGuide {
  map: { nodes: { section: string; label?: string; x: number; y: number }[]; edges: { from: string; to: string; label: string }[] }
  steps: GuideStep[]                                   // guided setup
  examples?: Record<string /* sectionId */, GuideExample[]>
  concepts?: Record<string /* sectionId */, ConceptId> // which explainer diagram to show
}
interface GuideStep { id: string; title: string; body: string; section: string; done: (p: Project) => boolean; action?: HintAction | { kind: 'example'; section: string; example: string } }
interface GuideExample { id: string; title: string; description: string; build: (p: Project) => Record<string, any> /* section data patch */ }
```

### 5.1 System map (visual, clickable)
An SVG diagram at the top of the module, and in the Help popup, showing how the sections feed each other:

```
 [The hero] ──start gear──▶ (Items)
 [Survival] ◀──decay×── (Difficulty)        [Death] ◀── permadeath ── (Difficulty)
 [XP sources] ──xp/h──▶ [Levelling] ──points──▶ [Skills] ──grants──▶ [Abilities] ──cost──▶ [Casts: resource]
                                               ▲  unlocks
                                         (Factions)
```

- Each box is a section. Its colour shows its state: empty (grey), started (amber) or has no open hints (green). A small badge counts its hints.
- Clicking a box opens that section. Round boxes are other modules and link to them.
- It's built from `guide.map` plus `isSectionEmpty` (`src/core/hints/util.ts`) and `collectHints`, so it reflects live data.

### 5.2 Guided setup (interactive checklist)
A third tab, **Guide**, in the right panel next to Hints and AI (`HintPanel.tsx` already has the tabs). It's an ordered checklist with a progress bar. Each step's `done(project)` predicate ticks it automatically. The steps for Player Character:

1. Write the hero fantasy and starting state.
2. Add a survival entry per stat. Action: *create one per catalog stat*.
3. Link each stat to its Difficulty parameter, then check Depletion.
4. Set the level cap and XP curve. Action: *pick a curve example*.
5. Add 3+ XP sources with rates, then check Level curve.
6. Create one cast entry per catalog cast. Action: *create missing*.
7. Build a tier-1 → tier-3 path per cast. Action: *insert tree example*.
8. Give every active skill an ability with cost and cooldown.
9. Test a build at mid level in the Build planner.
10. Fill in controls and death.

Clicking a step jumps to its section and **spotlights** the relevant control. A coach mark is a small popover anchored to an element with a `data-guide="<id>"` attribute, with Next / Skip and Esc to close. Progress comes from the data, so there's no extra state. Whether the guide is hidden or collapsed is stored per viewer in `localStorage`, wrapped in try/catch.

### 5.3 Examples with preview (interactive)
An **"Insert example…"** button on supporting sections opens a picker. Each example shows a live preview *before* it's applied, and applying it is **one undo step** (a single `mutate` call, as AI proposals already do):

- **XP curve presets:** linear, polynomial (`100 * level ^ 1.5`), exponential, and plateau-then-steep. The level-curve chart previews each, and you can tune the cap and base inline.
- **Skill tree templates:** "3 branches × 3 tiers", "linear mastery", "hub-and-spoke". They're generated for the chosen cast with costs that fit the current point budget.
- **Survival presets:** "forgiving", "standard" and "harsh" decay sets, previewed on the Depletion chart.

### 5.4 Concept explainers (visual)
A collapsible **"How this works"** card under each section title. It holds a small static inline-SVG diagram plus 2–3 sentences:

- *Survival:* a decay curve with max, critical and empty marked; restore events as jumps.
- *Levelling:* the XP → level → points pipeline, and the shape of a curve (early fast, late slow).
- *Skills:* tiers and `requires` arrows, with a legend for passive, active and spell nodes.
- *Abilities:* cost, cooldown and cast time on one timeline strip.

The cards are React components in `src/ui/guides/concepts.tsx`, themed with the existing CSS variables, and appear in the Help popup too.

### 5.5 Teaching empty states
The generic "Nothing here yet" is replaced, where a guide exists, with what the section is for, one example sentence and the matching quick action (*create from catalog*, *insert example*). This is driven by `guide.steps` and `guide.examples`.

## 6. Hints: new `src/core/hints/rules/player.ts`

Same pattern as `rules/npc.ts`: gated on the Player doc being open and non-empty, severity at `suggest` or below, and i18n keys in `en.json` and `hu.json`.

| Rule | Fires when |
|---|---|
| `player.survivalRestore` | a survival stat has no restore source |
| `player.survivalPace` | time to critical is under 2 min or over 60 min on Medium (thresholds editable on the Hints page) |
| `player.survivalDifficulty` | a stat isn't linked to a Difficulty parameter while that doc has one for survival |
| `player.curve` | the XP formula fails, is non-increasing, or the level cap is missing |
| `player.xpSources` | there are no XP sources, or none have a rate |
| `player.castCoverage` | a catalog cast has no cast entry, no skills, or no abilities |
| `player.treeBudget` | a cast's tree cost exceeds the points at cap, or is under 50% of them |
| `player.treeShape` | there are cycles, orphan skills, or a required level above the cap |
| `player.abilities` | an active skill grants no ability; an ability has no cost or cooldown; an ability's cast differs from its skill's cast |
| `player.startGear` | a cast has no starting abilities or gear |

## 7. Help, export and tests

- **Help** (`src/ui/help.ts`): rewrite the `design.player` purpose and tips. The Help popup gains the system map and concept cards.
- **Export** (`src/core/export/markdown.ts`): sections already export in order. Add summaries the way `needsBalanceMd` does:
  - time to critical per difficulty after Survival
  - a level table (every 5 levels) after XP sources
  - per-cast cost/budget after Skills
  - a Mermaid graph of the skill tree, reusing `graphMd`'s Mermaid output style
- **Tests:**
  - `tests/player.test.ts`:
    - migration, including graph → skills with ids kept and faction unlocks still resolving
    - export order matches the doc
    - `timeToCritical` with difficulty scaling
    - `levelTable` and `hoursToLevel` arithmetic
    - `treeAnalysis` (cycles, orphans, budget)
    - `buildState` lock reasons
    - each hint fires on a positive case and stays quiet on a negative one
  - `tests/guides.test.ts`:
    - step `done` predicates
    - an inserted example is one undo step
    - the map node state reflects the data
  - `tests/playerUi.test.tsx`:
    - the build planner locks and unlocks skills
    - the Guide tab ticks a step after data is added
    - the example picker previews before inserting

## 8. Implementation order

1. **Data and migration:** v2 schema, `migratePlayer`, `UNLOCKABLE` change, and fixing the factions test.
2. **Core:** `src/core/player.ts` and its unit tests.
3. **Views:** Depletion, Level curve, Skill tree, Build planner.
4. **Hints:** player rules, i18n, help text.
5. **Guide framework:** types, Guide tab with steps and coach marks, system map, example picker, concept cards, empty states. Player content first.
6. **Export summaries and UI tests,** then a browser check.
7. *(Follow-up)* Add `guide` content for NPC System and Town using the same framework.

## 9. Verification

- `npm run typecheck`, `npm run lint`, `npm test` all pass.
- `npm run dev` → `/doc/design.player`:
  - Load `examples/hands-of-hubris.hohplan.json`: it migrates silently, and the Markdown preview headings follow `player_character.md`.
  - Guide tab: complete step 2 with its quick action, and the step and the map box both turn done. Esc closes a coach mark.
  - Insert the polynomial XP example: the preview matches the result, and Ctrl+Z removes it in one step.
  - Link Hunger to "Hunger / thirst decay rate", set Hard = 2×: the Depletion chart halves the Hard time to critical.
  - Insert a 3×3 tree for Warrior, then in the Build planner at level 5 the tier-3 skills show why they're locked. Raise the costs above the budget and `player.treeBudget` appears.
  - Factions: a faction unlock that pointed to a v1 skill node still resolves after migration.
