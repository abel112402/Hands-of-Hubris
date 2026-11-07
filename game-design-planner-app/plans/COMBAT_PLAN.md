# Combat, Enemies & Bosses editor: analysis and v2 plan

**Status:** Proposed | **Date:** 2026-11-04 | **Module:** `design.combat` ([src/modules/design.ts](src/modules/design.ts), `mod('design', 'combat', …)`) | **Method:** [EDITOR_UPGRADE_GUIDE.md](EDITOR_UPGRADE_GUIDE.md)

## Context

Combat, Enemies & Bosses is still the **v1 generic module**: 6 sections, no analysis, no hints, no migration. Its help even mentions a radar view that doesn't exist. Other modules depend on it:
- **World:** biome enemies and bosses, boss entry conditions, the progression graph, outpost defenders
- **Items:** loot table sources
- **Player:** XP source content
- **Core Loop:** system nodes

The numbers that decide whether combat works live in neighbouring modules:
- **Items:** weapon damage, armor, resistances
- **Player:** abilities, health
- **Difficulty:** enemy HP and damage multipliers
- **Time & Weather:** night monster strength

Nothing combines them.

## 1. Analysis

### Coverage against `docs/01_design/combat_enemies.md`

| Doc chapter | Today | Problem |
|---|---|---|
| 1. Combat system | `system` form: 2 text boxes | Status effects are one text box: no duration, ticks, stacking or cleanse |
| 2. Damage and defense | generic `damage` formulas section | The formula isn't tied to any enemy or weapon, so it can't be applied to real data |
| 3. Enemy sheet | `enemies` collection | HP, damage and speed only: no attack rate, armor, resistances, role, tier, XP or aggression. **Drops is a free-text list** that ignores Items' loot tables. Behavior is free text |
| 4. Boss fights | `bosses` collection + one global `bossPhases` graph | Unlocks, phases and reward are free text, so World's boss gates can't be checked from here. The phase graph isn't tied to a boss. No HP, damage or arena biome |
| 5. Night and event monsters | — | No home. Time & Weather has a `monsterStrength` per day phase and Full moon / Blood moon events, but nothing uses them |
| 6. NPC combat and sieges | one textarea | Can't be connected to World outposts and their defenders |

### Questions the designer can't answer today
- How many seconds does it take a starting Warrior to kill a Marsh brute, on Normal and on Hard?
- How long does the player survive against it?
- Does enemy threat rise from the starter biome to the final one, or does a late enemy come out weaker than an early one?
- Is some enemy immune to every damage type the player can deal?
- Do a boss's phases cover 100% → 0% HP without gaps?
- Which bosses actually gate progress?
- Which enemies drop nothing?

### Usability and professionalism
- The enemy sheet is a flat list mixing combat numbers, AI text and drops, and nothing can be compared. Cards and table are the only views.
- No checks, no guidance, no migration, and stale help.

## 2. Target data model (module `version: 2`, `migrate: migrateCombat`)

Sections in doc order. **Existing ids and keys are kept:** `system`, `damage`, `enemies`, `bosses`, `bossPhases`, `siege`, and the enemy fields `biome`, `hp`, `damage`, `speed`, `weaknesses`, `nightVariant`, `behavior`.

| # | Section (id) | Kind | Key content |
|---|---|---|---|
| 1 | Combat system (`system`) | form (kept) | model, aim/dodge/block, `statusNotes` (old `status` text) |
| 2 | Status effects (`statusEffects`) | collection (new) | damage type, `tickDamage`, `tickInterval`, `duration`, `maxStacks`, `slow` (%), cleansed by (multi Items), notes |
| 3 | Damage model (`damageModel`) | form (new) | `damageFormula`, variables `attack, armor, resist, crit`. A preset sets the default `attack * 100 / (100 + armor) * (1 - resist / 100)`; an empty formula uses the same expression. Also `critChance`, `critMultiplier`, `hpParam` and `damageParam` (refs to **Difficulty** parameters), `useNightStrength` |
| 4 | Other formulas (`damage`) | formulas (kept) | Retitled. Kept for scaling formulas that aren't *the* damage formula |
| 5 | Enemies (`enemies`) | collection (kept) | Identity: biome, `role` (Swarm, Brute, Ranged, Caster, Elite, Support), `tier`. **Stats:** hp, damage, `attackRate`, speed, `armor`, `damageType` (ref), `resistances` (map damageTypes, %; negative = weakness), weaknesses (kept). **Behavior:** `aggression` (Passive, Territorial, Hunter), `pattern` (text), behavior notes, nightVariant. **Reward:** `xp`, `legacyNotes` (old drops). Views: table, **Threat curve**, **Weakness matrix**, cards |
| 6 | Night and event variants (`variants`) | collection (new) | `base` (ref enemy), `when` (any: day phases and special events from Time & Weather), `hpMult`, `damageMult`, extra behavior. Doc chapter 5 |
| 7 | Bosses (`bosses`) | collection (kept) | biome, `hp`, `damage`, `attackRate`, `armor`, `resistances`, arena, `unlockRefs` (multi: biomes, skills, items), `rewardItems` (multi Items), `xp`, and the old text as `unlockNotes`, `rewardNotes`, `phaseNotes`. Views: cards, table, **Phase bars** |
| 8 | Boss phases (`phases`) | collection (new) | `boss` (ref), `hpFrom` and `hpTo` (%), mechanics, `attacks` (list), `adds` (multi enemies), `damageMult`, transition. Views: **Phase bars**, table |
| 9 | Boss phase sketch (`bossPhases`) | graph (kept) | Retitled "Boss phase sketch (free diagram)" |
| 10 | Test loadouts (`loadouts`) | collection (new) | Player offense and defense profiles for the sandbox: `cast` (ref Player casts), `level`, `weapon` (ref Items), `abilities` (multi Player abilities), `armorItems` (multi Items), `hp` (empty = Player Health max). View: **Combat sandbox** |
| 11 | NPC combat and sieges (`siege`) | form (kept id) | defenders (multi NPC archetypes and enemies), `waves`, `waveSize`, mercenary rules, notes |

### `migrateCombat` (v1 → v2)
- `enemies[].drops` (text list) → `legacyNotes` ("Drops: …"). Loot now lives in Items loot tables, which point at enemies.
- `bosses[].unlocks` / `reward` / `phases` (text) → `unlockNotes` / `rewardNotes` / `phaseNotes`. This frees the keys for structured fields.
- `system.status` → `system.statusNotes`.
- `damage` formulas, `bossPhases` and `siege.notes` are untouched.

## 3. Analysis core: `src/core/combat.ts`

Pure functions. They reuse:
- `tryEvaluate` (formula)
- `difficultyMultiplier` and `comparedLevels` (`core/player.ts`)
- `analyzeRanges` (`core/diplomacy.ts`)
- `finalValue` / `lootOdds` (`core/items.ts`) for reward views

Functions:
- `damagePerHit(project, attacker, defender, damageType)`: evaluates the damage formula with the defender's armor and resistance to that type.
- `dps(project, attacker, defender)`: damage per hit × attack rate.
- `timeToKill(project, loadout, enemy, levelId?)`: enemy HP × the Difficulty HP multiplier at that level, divided by loadout DPS against that enemy (best of weapon and abilities, abilities limited by cooldown). Returns seconds and hits.
- `timeToDie(project, loadout, enemy, levelId?)`: player HP ÷ (enemy DPS × the Difficulty damage multiplier × night strength when asked).
- `threat(project, enemy)`: DPS × effective HP as one comparable score, and a `threatRamp` ordered by World biome role (Starter → Final).
- `weaknessMatrix(project)`: enemies × damage types → resistance %, plus the damage types the player can deal (from Player abilities and Items weapons).
- `immuneEnemies`: enemies that resist ≥ 100% of every damage type the player can deal.
- `phaseCoverage(project, bossId)`: gaps and overlaps in the 100 → 0 HP range.
- `bossGates(project, bossId)`: what a boss unlocks, gathered from its `unlockRefs`, World biome `entryBosses` and World progression edges.
- `enemiesWithoutLoot`: no Items loot table lists them as a source.

## 4. New views (`src/ui/editors/combatViews.tsx`)

| View | On | Shows |
|---|---|---|
| **Combat sandbox** (`combatSandbox`) | loadouts | **Interactive.** A matrix of loadouts × enemies and bosses with two numbers per cell: seconds to kill and seconds to die. Coloured green when the player wins comfortably, red when they lose. Has a difficulty selector, a night toggle, and a biome filter. Clicking a cell shows the breakdown (damage per hit after armor and resistance, hits, DPS on both sides) |
| **Threat curve** (`threatCurve`) | enemies | Enemies ordered by biome role. Bars for threat, plus a line per biome's median, so a late enemy weaker than an early one stands out. Click a bar to select the enemy |
| **Weakness matrix** (`weaknessMatrix`) | enemies | Enemies × damage types, coloured resistance % (green = weak, red = resistant). The bottom row shows which types the player can deal; "no answer" columns are outlined |
| **Phase bars** (`phaseBars`) | bosses, phases | One horizontal HP bar per boss from 100% → 0%, cut into phases with their mechanics. Gaps are hatched and overlaps red. Click a segment to open that phase |

## 5. Hints (`src/core/hints/rules/combat.ts`)

All at `suggest` or below:

| Rule | Fires when |
|---|---|
| `combat.enemyBasics` | an enemy has no biome, HP or damage, or no attack rate when it has damage |
| `combat.ttk` | with the first loadout on the middle difficulty, an enemy takes more than 60 s or under 1 s to kill, or kills the player in under 3 s (thresholds are constants) |
| `combat.threatRamp` | an enemy in a later biome has less threat than the median of an earlier biome (info) |
| `combat.immune` | an enemy resists every damage type the player can deal |
| `combat.noLoot` | an enemy or boss isn't a source in any Items loot table (info) |
| `combat.phases` | a boss has no phases; phases leave gaps or overlap; a phase has no mechanics |
| `combat.bossGates` | a boss gates nothing (no unlocks, World entry or progression edge) (info) |
| `combat.variants` | a variant has no base enemy or condition, or no multiplier |
| `combat.status` | a status effect has no duration, or tick damage without an interval |
| `combat.formula` | the damage formula doesn't evaluate with `attack, armor, resist, crit` |

## 6. Help and export
- **Help:**
  - Replace the stale radar tip.
  - Explain the damage flow (attack → armor → resistance), the loadouts behind the sandbox, the Difficulty and night multipliers, and that loot lives in Items.
- **Export** (`combatSummaryMd`, keyed on view kinds):
  - the damage formula with one worked example
  - a time-to-kill / time-to-die table (loadouts × enemies, middle difficulty)
  - the threat ramp per biome
  - per boss, its phase list with HP ranges and what it gates
  - an **enemy sheet** per enemy, following `templates/content_entry_template.md` ("Ellenség"): biome, stats, behavior, weaknesses, drops from the loot tables

## 7. Guide (`src/modules/guides/combat.ts`, registered in `GUIDES`)

- **System map.**
  - Sections: Combat system, Damage model → Enemies → Variants, Bosses → Boss phases, Status effects, Test loadouts → Combat sandbox, Sieges.
  - Other modules:
    - Items: weapons, armor, loot
    - Player: abilities, health
    - Difficulty: HP and damage ×
    - World: biomes, gates, outposts
    - Time & Weather: night
    - Technical AI: behavior
- **Steps (10):**
  1. Describe the combat model.
  2. Pick a damage formula. Action: *formula preset*.
  3. Link the Difficulty HP and damage parameters.
  4. Add status effects. Action: *starter set*.
  5. Add 6+ enemies across 2+ biomes with HP, damage and attack rate. Action: *enemy roster*.
  6. Check the Weakness matrix, ticked when no enemy is immune.
  7. Create a test loadout. Action: *from Player casts*.
  8. Read the Combat sandbox, ticked by hand.
  9. Give each boss phases covering 100 → 0%. Action: *phase template*.
  10. Link enemies to loot (opens Items › Loot tables).
- **Examples:**
  - **Damage formula presets:** armor with diminishing returns (recommended), flat subtraction, percentage reduction. The preview shows one hit at several armor values.
  - **Enemy roster,** with a biome as the parameter: swarm, brute, ranged and elite, with numbers scaled by the biome's role. The preview shows the threat curve.
  - **Boss phase templates,** with a boss as the parameter: three phases (100–60–30–0), an enrage at 20%, or adds waves. The preview shows the phase bar.
  - **Status starter set:** burn, poison, bleed, stun.
  - **Loadouts from Player casts:** one per cast at levels 1 and mid, using its starting gear.
- **Concept cards** (new diagrams):
  - *damageFlow*: attack → armor → resistance → damage
  - *ttk*: hits × interval, kill time against death time
  - *threatRamp*: rising threat across biomes
  - *phaseBar*: HP bar cut into phases
- **Empty texts** for enemies, variants, bosses, phases, statusEffects and loadouts.

## 8. Tests
- **`tests/combat.test.ts`:**
  - migration: drops, boss texts and status text are preserved
  - export order follows the doc
  - `damagePerHit` with armor and resistance
  - `timeToKill` / `timeToDie` with Difficulty and night multipliers
  - `threatRamp` ordering
  - `immuneEnemies`
  - `phaseCoverage` gaps and overlaps
  - `bossGates` through World
  - each hint with a positive and a negative case; quiet on an empty doc and in other editors; never `important`
- **`tests/combatGuide.test.ts`:** sections and docs exist; step predicates and actions; example preview equals the inserted result, and undo removes it.
- **`tests/combatUi.test.tsx`:**
  - a sandbox cell shows kill and death times, and the difficulty switch changes them
  - phase bars mark a gap
  - the weakness matrix outlines an immune enemy

## 9. Implementation order
1. Schema v2 and `migrateCombat`.
2. `src/core/combat.ts` and its unit tests.
3. Views: Combat sandbox, Threat curve, Weakness matrix, Phase bars.
4. Hint rules, i18n (en and hu), help.
5. Export summaries and enemy sheets.
6. Guide content, the new concept diagrams and preview kinds.
7. Tests, then a browser check with the enemy roster, one loadout and a three-phase boss.

**Out of scope (follow-up):** structured enemy behavior trees belong to Technical › AI Systems. Here, behavior stays as a pattern plus notes.

## 10. Verification
- `npx tsc -b --noEmit`, `npx eslint .` and `npx vitest run` all pass.
- Load `examples/hands-of-hubris.hohplan.json`: it migrates silently, and the export headings follow `combat_enemies.md`.
- Use the default damage formula with a 20-damage weapon at 1 hit/s against an enemy with 100 HP and 100 armor. The sandbox shows 10 hits and 10 s. Set Hard to enemy HP ×2 and it shows 20 s.
- Set a Marsh enemy weaker than every Starter enemy and `combat.threatRamp` appears.
- A boss with phases 100–60 and 50–0 gets a hatched gap on the Phase bar and the `combat.phases` tip.
- The Guide tab ticks steps after their quick actions, and the system map colours update.
