# Story & Quests editor: analysis and v2 plan

**Status:** Implemented (see “Implementation notes” at the end) | **Date:** 2026-11-06 | **Module:** `design.story` ([src/modules/design.ts](src/modules/design.ts), `mod('design', 'story', …)`) | **Method:** [EDITOR_UPGRADE_GUIDE.md](EDITOR_UPGRADE_GUIDE.md)

## Context

Story & Quests is still the **v1 generic module**: 5 sections, no analysis, no hints, no migration and a two-tip help entry. Yet many modules point into it, so its ids must be kept:

| Referenced section | From |
|---|---|
| `quests` | Core Loop systems, World biome `entryQuests` and the progression graph's `edgeSource`, Player XP-source `content`, Items recipe `unlockedBy`, Time & Weather event `storyTrigger`, Trade money-flow `links` |
| `characters` | Factions `characters` (key characters) |
| `acts` | Trade merchant `unlockAct` and flow `fromAct` / `toAct`; `core/trade.ts` reads `start` and `duration` as the money-flow time axis |

Both example projects have an empty Story doc, so migration risk is low. The migration still has to be safe for user projects.

## 1. Analysis

### Coverage against `docs/01_design/story_quests.md`

| Doc chapter | Today | Problem |
|---|---|---|
| 1. Story overview | `overview` form (background, conflict, secret, **tone**) | Fine, but "Narrative style" (`tone`) belongs to chapter 7 |
| 2. Structure and acts | `acts` (start, length, biome, summary) + timeline | The doc table's **key events** column has no home. The length unit is "step", undefined, yet Trade reads it as days. No player level range per act, so pacing can't be checked |
| 3. Main characters | `characters` (faction, role text, bio) | The `content_entry_template.md` NPC sheet wants relationships, stats and needs, and dialogues and quests. There's no link to NPC archetypes, no "introduced in" act, no importance, and nothing saying whether they can die |
| 4. Quest types | only the `type` enum on quests | The chapter has no section. Nothing says what each type is for, whether it repeats, how random tavern quests are generated, or how big its rewards should be |
| 5. Quest sheet | `quests` (type, giver, faction, act, conditions, objectives, rewards, consequences) | Conditions, rewards and consequences are **free text**, so prerequisites, XP, money, items and reputation can't be added up or checked. An 8-field flat inspector with no groups |
| 6. Branches and endings | `questGraph` (Quest / Dialog / Choice / Event / Ending nodes) | Choices and endings exist only as graph boxes with no data. Quest order lives in two places (the graph and the conditions text). No way to tell which endings can be reached |
| 7. Dialogue system and style | — | No section at all |

### Free text that should be references
- Quest `conditions` → prerequisite quests, player level, faction + relationship level (Factions `thresholds`).
- Quest `rewards` → XP, money, items × quantity (Items), reputation per faction, unlocks (Player skills, Items recipes).
- Quest `consequences` → reputation changes (map over Factions) and quests it blocks or opens.
- Act key events → quests, Combat bosses and Time & Weather events.
- Ending conditions → required quests and choice options.

### Numbers the designer needs but can't see
- Play time per act (the sum of quest estimates) against the act's planned length.
- XP per act from quest rewards, and the **player level** that implies (Player's level curve) against the act's intended level range.
- Money, item value and **reputation per faction** gained per act, and whether reputation reaches the levels other modules require (capital merchants, biome entry).
- Length of the main questline's critical path, and how many quests each act, character and faction has.

### Questions the designer can't answer today
- In what order do the main quests run? Is every quest reachable? Is there a requirement loop?
- Which endings can a player actually reach, and which choice locks them out?
- How long is each act, and what level should the player be by its end?
- How much does each act give in XP, money and reputation? Can the player ever become Allied with faction X through quests?
- Which characters and factions have no quests? Which main quests have no giver, objectives or reward?
- Does a biome require a quest that only happens in a **later** act than the biome's own act?

### Bugs and inconsistencies
- `overview.tone` ("Narrative style") is in chapter 1 but belongs to chapter 7.
- Act `start` / `duration` have no defined unit (timeline unit "step"), but `core/trade.ts` treats them as in-game days.
- `questGraph` takes quests as nodes, while quest order is also in the `conditions` text. The two drift apart and nothing compares them. `Ending` and `Choice` nodes have no entity behind them.
- World `entryQuests` can point at a quest from a later act than the biome. Nothing checks this.
- Factions already has an `endings` collection (involved factions, conditions text) that overlaps chapter 6 (see the decisions at the end).

## 2. Target data model (module `version: 2`, `migrate: migrateStory`)

Sections follow doc order. **Existing ids are kept** (`overview`, `acts`, `characters`, `quests`, `questGraph`), and so are the field keys `background`, `conflict`, `secret`, `tone` (moved), `start`, `duration`, `biome`, `summary`, `faction`, `role`, `bio`, `type`, `giver`, `act`, `conditions`, `objectives`, `rewards` and `consequences`.

| # | Ch. | Section (id) | Kind | Key content |
|---|---|---|---|---|
| 1 | 1 | Story overview (`overview`) | form (kept) | `background`, `conflict`, `secret`, plus `premise` (one-line pitch) and `themes` (list) |
| 2 | 2 | Structure (`structure`) | form (new) | `actUnit` (In-game days / Play hours; default days, matching Trade), `hoursPerDay` (play hours per in-game day, to convert), `pacingNotes` |
| 3 | 2 | Acts (`acts`) | collection (kept) | `start`, `duration` and `biome` kept. New: `goal`, `keyEvents` (multi: quests, Combat bosses, Time & Weather events), `extraBiomes` (multi), `levelMin` / `levelMax` (intended player level), `summary`. Views: timeline, cards, **Act pacing** |
| 4 | 3 | Characters (`characters`) | collection (kept) | **Identity:** faction, `role` (kept text), `importance` (Main, Supporting, Minor), `archetype` (ref NPC `archetypes`). **Story:** `bio`, `introducedIn` (ref acts), `location` (ref biomes), `essential` (can't die), `fate`. **Relations:** `relations` (map characters → affinity, using the NPC affinity scale). **Voice:** `voice`, `sampleLine`. Views: cards, table, **Cast coverage** |
| 5 | 4 | Quest types (`questTypes`) | collection (new) | `type` (the quest-type enum), `purpose`, `repeatable`, `maxActive`, `rewardScale` (× of the act's reward budget), `generator` (how random ones are made). Seeded with Main, Faction, Tavern random and Event |
| 6 | 5 | Quests (`quests`) | collection (kept) | **Identity:** type, giver, faction, act, `estMinutes`, `missable`. **Requirements:** `requires` (multi quests), `minLevel`, `repFaction` + `repLevel` (ref Factions `thresholds`), `conditions` (kept, "Condition notes"). **Objectives:** `objectives` (kept checklist), `locations` (multi biomes), `targets` (multi: Combat enemies and bosses, Items). **Rewards:** `rewardXp`, `rewardMoney`, `rewardItems` (map items → qty), `rewardRep` (map factions → change), `unlocks` (multi: Player skills, Items recipes), `rewards` (kept, "Reward notes"). **Consequences:** `blocks` (multi quests), `consequences` (kept). Views: cards, kanban(type), table, **Quest flow**, **Reward budget** |
| 7 | 6 | Choices (`choices`) | collection (new) | One entry per **option**: `decision` (text that groups the options of one decision), `quest` (where it's made), `leadsTo` (multi quests), `blocks` (multi quests), `repEffects` (map factions), notes. Options of the same decision exclude each other |
| 8 | 6 | Endings (`endings`) | collection (new) | `kind` (Main, Faction, Secret, Bad), `requiresQuests`, `requiresChoices` (multi choices), `requiresRep` (faction + level), `factionEndings` (multi Factions `endings`), `description`. Views: cards, **Ending paths** |
| 9 | 6 | Dialog and branching sketch (`questGraph`) | graph (kept) | Retitled. `nodeSource` widens to quests, choices and endings, so Choice and Ending boxes can link to real entries. Quest flow (built from data) becomes the source of truth for order; the graph stays a free sketch |
| 10 | 7 | Dialogue and narrative style (`dialogue`) | form (new) | `tone` (moved from overview), `format` (Linear, Branching tree, Hub, Barks), `lineLimit` (characters), `voiceRules`, `localization`, `vo` (voice-over plan) |

### `migrateStory` (v1 → v2)
- `overview.tone` moves to `dialogue.tone`, and the old key is deleted.
- `quests[]`: `conditions`, `rewards` and `consequences` text stay under their keys (relabelled as notes). A single `objectives` string becomes a checklist item. Nothing is parsed into numbers, so no data is guessed.
- `questGraph` nodes of kind `Ending` or `Choice` without a `refId` become `endings` / `choices` entries **with the node id as the entity id**, and the node gets `refId = id`, so the graph keeps working.
- `acts` data is unchanged. `structure.actUnit` stays empty, which is read as in-game days, the same as Trade's current reading, so money-flow numbers don't move.
- `questTypes` is filled from the seed only for new docs. Older projects get a one-click guide action ("Create the four quest types").

## 3. Analysis core: `src/core/story.ts`

Pure functions. The UI text says they are planning estimates.

- `STORY_DOC`, `storyList`, and `actsInOrder` (**moved here from `core/trade.ts`**, which then imports it). `actDays(project, act)` and `actHours(project, act)` use `structure.actUnit` and `hoursPerDay`.
- `questDeps(project)`: edges from `requires`, choice `leadsTo` and quest `blocks`. Returns:
  - topological order, depth and the main critical path (Main quests)
  - **cycles**
  - quests requiring a missing or always-blocked quest (**unreachable**)
  - **act inversions** (a quest requires one from a later act)
- `endingReachability(project)`: per ending, the required quests and options. An ending is unreachable when it needs two options of the same decision, or a quest that a required option blocks. Also returns the shortest set of quests that reaches it.
- `simulatePath(project, pickedOptions)`: quests and endings still open or now blocked after the given choices. This drives the Ending paths planner.
- `actPacing(project)`: per act:
  - quest count and quest minutes against the act's length in play hours
  - XP from quest rewards, plus Player XP sources × act hours (`levelTable` / XP-source rate from `core/player.ts`)
  - the level the player reaches by the act's end, against `levelMin` / `levelMax`
- `rewardsByAct(project)`: XP, money, item value (`finalValue` from `core/items.ts` × qty) and reputation per faction per act. Reputation is cumulative from Factions `overview.startValue`, mapped to the relationship level reached (scale from `scaleOf` in `core/diplomacy.ts`).
- `castCoverage(project)`: a characters × acts count of the quests each gives, characters with no quests, and factions with no Faction-type quest.
- `biomeGateOrder(project)`: World biomes whose `entryQuests` belong to an act after the first act that uses the biome.
- `questBasicsMissing(project)`: Main and Faction quests without a giver, objectives, act or any structured reward.
- `graphDisagreements(project)`: `questGraph` edges between two quest-linked nodes that `requires` / `leadsTo` don't reflect (the World `graphDisagreements` pattern).

## 4. New views (`src/ui/editors/storyViews.tsx`)

| View | On | Shows |
|---|---|---|
| **Quest flow** (`questFlow`) | quests | Drawn from data as a plain SVG of layered columns, one column per act. Quests are coloured by type; arrows show `requires` and `leadsTo`. The main critical path is highlighted, and cycles and unreachable quests are marked `--danger`. Has a type filter. Clicking a node opens the quest. It reuses the `TreeCanvas` layout approach |
| **Act pacing** (`actPacing`) | acts | Recharts on **one shared data array**: bars for quest hours against act hours, and a line for the player level at the act's end over a band of `levelMin`–`levelMax`. Below it, a table of the key numbers |
| **Reward budget** (`rewardBudget`) | quests | Stacked XP, money and item value per act, plus a faction selector showing cumulative reputation, with the Factions relationship levels as reference lines |
| **Ending paths** (`endingPaths`) | endings | **Planner.** Pick an option for each decision and see which endings stay reachable, which quests get blocked, and what each ending requires. Unreachable endings are listed with the reason |
| **Cast coverage** (`castCoverage`) | characters | A heatmap of characters × acts (quests given), with empty rows outlined and an importance column. Clicking a row opens the character |

Wiring: add the kinds to `CollectionView` (`types.ts`), the `v` helpers (`helpers.ts`) and the labels and dispatch in `CollectionEditor.tsx`. Styles go in `styles.css`, using the CSS variables only.

## 5. Hints (`src/core/hints/rules/story.ts`)

All at `suggest` or below. Each has a `goto`, or an `addEntity` with `init` where one click helps.

| Rule | Fires when |
|---|---|
| `story.questCycle` | quest requirements form a loop |
| `story.unreachable` | a quest needs a missing quest, or one that's always blocked |
| `story.actOrder` | a quest requires a quest from a later act, or a World biome needs a quest from a later act than the biome's act |
| `story.endings` | an ending is unreachable (conflicting options or a blocked quest), or has no requirements at all (info) |
| `story.pacing` | the expected level at an act's end is outside its level range, or quest hours are under 50 % or over 150 % of the act length (constants) |
| `story.questBasics` | Main or Faction quests lack a giver, objectives, an act or any reward (info, max 5) |
| `story.cast` | Main characters give no quests, or a faction has no Faction quest (info) |
| `story.reputation` | quest rewards never let a faction reach the relationship level a capital merchant or a biome entry requires (info) |
| `story.graphSync` | a sketch edge between two quests isn't in the quest data (info) |

Quiet on an empty doc and in other editors. Register them in `RULES`, and add `hints.story*.title/body` to both `en.json` and `hu.json`.

## 6. Help and export
- **Help** (`MODULE_HELP['design.story']`):
  - acts carry an in-game length and a level range
  - quests take structured requirements and rewards
  - Quest flow is built from the data; the graph is a sketch
  - choices are options of a decision
  - Ending paths shows what is reachable
  - Act pacing and Reward budget are estimates
  - a pointer to the Guide tab
- **Export** (`storySummaryMd`, keyed on view kinds):
  - an act table matching doc chapter 2 (act, content, biome, key events, levels, quest hours)
  - per quest, the **quest sheet** from `content_entry_template.md` (ID/name/giver, conditions, objectives, rewards, consequences) in chapter 5
  - a Mermaid quest-flow graph and a Mermaid decision tree for chapter 6, plus reachable endings
  - a reward-per-act table

## 7. Guide (`src/modules/guides/story.ts`, registered in `GUIDES`)

- **System map** (210 px column grid). Sections: Overview → Structure → Acts → Quests ← Quest types, Characters → Quests, Quests → Choices → Endings, Dialogue. Neighbouring modules, with their edge labels:
  - World: "biome gates"
  - Player: "XP"
  - Items: "reward items"
  - Factions: "reputation", "faction endings"
  - Combat: "targets"
  - Time & Weather: "story triggers"
  - Trade: "act timeline"
  - NPC: "archetypes"
- **Steps (10):**
  1. Write the premise, conflict and secret.
  2. Lay out the acts with lengths. Action: *act structure preset*.
  3. Give each act a biome and level range.
  4. Add the main cast. Action: opens the cast examples.
  5. Create the quest types. Action: *create the four types*.
  6. Write the main questline with requirements. Action: opens the questline example.
  7. Check Quest flow for loops and unreachable quests (done when `story.questCycle` and `story.unreachable` are clear).
  8. Add structured rewards and check Act pacing (target `view-actPacing`).
  9. Add choices and endings, then check Ending paths (done when every ending is reachable).
  10. Set the dialogue format and tone (target `field-format`).
- **Examples:**
  - **Act structures:** three-act; five-act island arc. Preview: the act timeline with level bands.
  - **Starter cast**, with a faction parameter: mentor, rival, faction leader and merchant contact. Preview: cast cards.
  - **Main questline** in the chosen act, with `requires`, XP and money rewards. Preview: Quest flow.
  - **Branching decision:** one decision, two options, two endings. Preview: Ending paths.
  - **Tavern quest templates:** three repeatable quest types. Preview: a quest table.

  These need new `PreviewKind`s in `ExamplePicker.tsx`: `actTimeline`, `cast`, `questFlow` and `endingPaths`.
- **Concept cards** (new diagrams in `concepts.tsx`):
  - *actPacing*: quest hours versus act length, and a level band
  - *questChain*: requires arrows and a critical path
  - *choiceBranch*: one decision, options that lock each other out, endings
  - *rewardBudget*: XP, money and reputation stacked per act
- **Empty texts** for `acts`, `characters`, `questTypes`, `quests`, `choices` and `endings`.

## 8. Tests
- **`tests/story.test.ts`:**
  - migration: `tone` moves; text is preserved; Ending and Choice nodes become entities **with their node ids** and the graph keeps `refId`; act data is untouched
  - Trade money flow still gives the same numbers after `actsInOrder` moves
  - export headings follow doc order, with the quest sheet and Mermaid present
  - `questDeps` (order, depth, cycle, unreachable, act inversion), `endingReachability` (conflicting options, blocked quest), `simulatePath`, `actPacing` (hand-checked level from a known XP curve), `rewardsByAct` (reputation reaching a level), `castCoverage`, `biomeGateOrder`
  - each hint with a positive and a negative case; quiet on an empty doc and in other editors; never `important`
- **`tests/storyGuide.test.ts`:** sections and doc ids exist, step predicates and actions work, example preview equals the inserted result, undo removes it, map states follow the data.
- **`tests/storyUi.test.tsx`:**
  - Quest flow marks a cycle
  - picking an option in Ending paths blocks the other ending
  - Act pacing shows the expected level for a seeded XP curve
- **Existing:** World, Trade, Player, Items and Time & Weather tests that touch Story ids must pass unchanged.

## 9. Implementation order
1. Schema v2 and `migrateStory`; move `actsOf` → `actsInOrder` into `core/story.ts`.
2. `src/core/story.ts` and its unit tests.
3. Views: Quest flow, Act pacing, Reward budget, Ending paths, Cast coverage.
4. Hint rules, i18n (en and hu), help.
5. Export summary and quest sheets.
6. Guide content, concept diagrams and preview kinds.
7. Tests, typecheck and lint, then a browser check with the questline and branching examples.

**Out of scope (follow-ups):**
- Trade's Money flow reading quest `rewardMoney` per act as a built-in source.
- Player's "Quest" XP source reading quest `rewardXp` instead of a hand-entered rate.
- Per-line dialogue authoring (a dialogue tree editor).

## 10. Verification
- `npx tsc -b --noEmit`, `npx eslint .` and `npx vitest run` all pass.
- Load `examples/hands-of-hubris.hohplan.json`: it migrates silently, the export headings follow `story_quests.md`, and Trade money-flow numbers are unchanged.
- Insert the three-act structure and the main questline: Quest flow shows one chain across three columns. Make quest 1 require quest 3: `story.questCycle` appears and both are marked.
- Insert the branching decision: Ending paths shows both endings reachable. Pick option A and ending B turns blocked. Make ending A require both options: `story.endings` fires.
- With a flat Player XP formula of `100` (100 XP per level, no XP sources) and 300 quest XP in Act 1, Act pacing shows level 4 by the end of Act 1. Set the act's `levelMax` to 3 and `story.pacing` appears.

## Decisions to confirm before coding
1. **Endings live in Story** (a new `endings` collection linking to Factions' faction endings) rather than reusing Factions `endings` only. Recommended: Story is the doc chapter for endings, and Factions' entries stay faction outcomes.
2. **Act length is in in-game days** by default (what Trade already assumes), with `hoursPerDay` to convert to play time. Play hours as an option.
3. **Choices are entities, one per option**, grouped by a decision name, rather than living only as graph boxes. This is what makes reachability computable.
4. **Quest order comes from the data** (`requires` / `leadsTo` / `blocks`), and the graph is a sketch with disagreement hints. This is the same pattern as the Items crafting tree and the World progression graph.

## Implementation notes (2026-11-06)

All four decisions above were taken as recommended. Where the build differs from the plan:

- **Quest sheets in the export:** the generic collection export already writes one block per quest with its conditions, objectives, rewards and consequences, so no second copy was added. The summary adds the act table (chapter 2), the main questline, a Mermaid quest-flow graph, rewards per act, ending reachability and a Mermaid decision tree.
- **Hint ids:** empty endings report as `story.endingsEmpty` and factions without quests as `story.factionQuests`, so each can be muted on its own.
- **Act presets:** they append after the existing acts rather than replacing them, because Trade merchants and flows may already point at acts. Hours per day defaults from the Time & Weather day length (30 real minutes → 0.5 h), else 0.5.
- **Quest flow:** a requirement inside the same act loops along the left side. Only a requirement pointing back to an earlier act's column is drawn red.
- **Known noise (app-wide rules, not changed here):** `completeness.sparseEntities` flags quests and characters because they have many optional fields (about 20 on a quest). `consistency.orphan` flags quests and characters that nothing references, such as tavern jobs.
