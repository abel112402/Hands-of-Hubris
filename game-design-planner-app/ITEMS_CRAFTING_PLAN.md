# Items & Crafting editor: analysis and v2 plan

**Status:** Proposed | **Date:** 2026-11-04 | **Module:** `design.items` ([src/modules/design.ts](src/modules/design.ts), `mod('design', 'items', …)`) | **Method:** [EDITOR_UPGRADE_GUIDE.md](EDITOR_UPGRADE_GUIDE.md)

## Context

Items & Crafting is still the **v1 generic module**: 6 sections, no analysis, no hints, no migration and a two-tip help entry. Many other modules point at it. Player (starting gear, restoring items), Trade (merchant goods), World (outpost rewards), Factions (unlocks) and Core Loop all reference `section('items', 'design.items')`, and Player references `section('recipes', 'design.items')`. That makes it the hub of the content economy, but today it can't answer the basic questions a designer has about items.

## 1. Analysis

### Coverage against `docs/01_design/items_crafting.md`

| Doc chapter | Today | Problem |
|---|---|---|
| 1. Item base model | `items` collection | Fine as a base, but stats and effects are free text and there's no durability, damage, armor or restore data |
| 2. Rarity and quality | `multipliers` matrix (rarity × quality value) | The doc's table (level, effect on properties, occurrence) has no home. Nothing ever multiplies a value |
| 3. Item types | only the `itemTypes` catalog | The doc wants fields, usage and examples per type. Every item shows every field, whatever its type |
| 4. Crafting | `recipes` collection + manual `recipeGraph` | Ingredients have **no quantities**, the station is free text, and there's no output amount, craft time or skill gate. The graph is drawn by hand and repeats the recipes |
| 5. Inventory and storage | one textarea | Slots, weight and stack limits can't be checked |
| 6. Loot | `loot` collection | The source is free text and the entries are text lines ("Iron, 20%"), so odds can't be computed or checked |
| 7. Item sheet | — | No per-item summary in the export |

### Questions the designer can't answer today
- What does a Rare / Excellent iron sword actually sell for?
- How many raw resources does a late-game item cost in total, and how deep is its crafting chain?
- Does crafting add value, or is it cheaper to sell the ingredients?
- What's the real chance of getting item X from a boss? How many kills does it take on average?
- Which items can never be obtained, and which are never used?
- Where are the gaps, such as no Epic armor or no Legendary tools?

### Usability and professionalism
- A flat 9-field inspector with irrelevant fields: a log shows damage and armor fields.
- A hand-drawn crafting graph that goes out of sync with the recipes.
- No guidance, no checks, and an export that's only partly structured.
- Cross-module links point *into* items, but nothing *uses* them to say where an item comes from or where it's used.

## 2. Target data model (module `version: 2`, `migrate: migrateItems`)

Sections in doc order. **Existing ids are kept** (`items`, `multipliers`, `recipes`, `recipeGraph`, `loot`, `inventory`), and so are the field keys `type`, `rarity`, `quality`, `weight`, `value`, `stack`, `description`, `result` and `tier`.

| # | Section (id) | Kind | Key content |
|---|---|---|---|
| 1 | Item model (`model`) | form (new) | currency unit, weight unit, default stack, durability model, `valueFormula` note (shows what the computed value means) |
| 2 | Rarity tiers (`rarityTiers`) | collection (new) | rarity (ref), `statMultiplier`, `dropWeight` (occurrence), color, effect on properties. Views: table, **Rarity curve** |
| 3 | Quality tiers (`qualityTiers`) | collection (new) | quality (ref), `statMultiplier`, how quality is obtained (craft skill, loot roll), effect |
| 4 | Value multiplier (`multipliers`) | matrix (kept) | rarity × quality, now read as a **× multiplier** on base value |
| 5 | Item types (`types`) | collection (new) | type (ref itemTypes), `groups` (multi of the field groups that apply: Combat, Use, Build, Tool), usage, examples. Seeded with one entry per default type and sensible groups |
| 6 | Items (`items`) | collection (kept) | Identity: type, rarity, default quality, `tags`. Common: weight, value, stack, durability. **Combat:** damage, damageType (ref), attackSpeed, armor, resistances (map damageTypes), equipSlot. **Use:** effect, `restores` (map → survivalStats), duration, cooldown. **Build:** `places` (ref Town building). **Tool:** `toolPower`, `harvests` (multi resources). Plus description and `notes` (old `stats` text). Views: table, cards, **Coverage**, **Value preview** |
| 7 | Crafting stations (`stations`) | collection (new) | `building` (ref Town buildings), tier, unlock, notes |
| 8 | Recipes (`recipes`) | collection (kept) | result, `outputQty`, `ingredients` → **map item → quantity**, `resources` (map → resources catalog), `station` → ref stations, tier, `craftTime`, `requiresSkill` (ref Player skills), `unlockedBy` (multi: quests, factions, skills), unlock notes. Views: table, **Crafting tree**, cards |
| 9 | Crafting sketch (`recipeGraph`) | graph (kept) | Retitled "Crafting sketch (free diagram)". The Crafting tree view replaces it as the source of truth |
| 10 | Inventory (`inventory`) | form (kept id) | `slots`, `weightLimit`, `hotbar`, `encumbrance` rule, storage notes (links to Town bases in the text), plus the old `slots` text |
| 11 | Loot tables (`loot`) | collection (kept) | `sources` (multi: enemies, bosses, biomes, outposts), `rolls`, `weights` (**map item → weight**), `guaranteed` (multi items), `rarityBias`, notes. Views: table, **Loot odds** |

### `migrateItems` (v1 → v2)
- `recipes[].ingredients`: an array of ids becomes a map with quantity 1 for each.
- `recipes[].station` (text) becomes a ref to a `stations` entry, created per distinct name. This is the `migrateTown` bases pattern.
- `loot[].source` (text) and `loot[].entries` (text lines):
  - Lines of the form `name, N%` whose name matches an item go into `weights` (N becomes the weight).
  - Anything that doesn't match, and the old source text, go into `legacyNotes`.
- `items[].stats` (free text) moves to `notes`, and `items[].sources` (text) goes into `legacyNotes`. Each item gets a `legacyNotes` field.
- `inventory.slots` text is kept as `inventory.notes`.
- `recipeGraph` data is untouched.

## 3. Analysis core: `src/core/items.ts`

Pure functions, the `core/player.ts` style:

- `finalValue(project, item, qualityId?)`: base × `multipliers[rarity|quality]`, with 1 when the cell is empty.
- `valueGrid(project, item)`: values for every quality, for the Value preview.
- `rawCost(project, itemId)`: recursive expansion through recipes into raw resources and uncraftable items. Returns quantities (with output quantities taken into account), crafting **depth**, the stations used and **cycles**.
- `valueAdded(project, recipe)`: result value × output quantity compared with the sum of ingredient values. Ratio and absolute difference.
- `itemSources(project, itemId)`: where an item comes from:
  - recipes, loot tables and Trade merchants
  - Player starting gear and items
  - World outpost rewards
  - for Resource items, Town building outputs (matched by resource id or name)
- `itemUses(project, itemId)`: what uses it:
  - recipe ingredients
  - Player restore items and starting gear
  - Faction unlocks
  - Combat/Use fields on itself
- `coverage(project)`: a type × rarity count grid, with the empty cells for types that are meant to have rarities.
- `lootOdds(project, table)`: per item, P(at least one) = 1 − (1 − w/W)^rolls, expected count per open, kills needed for a 50% / 90% chance, and the rarity mix.
- `tierChecks(project)`:
  - rarity tiers whose multipliers or drop weights aren't monotonic
  - matrix rows or columns that go down as quality rises

## 4. New views (`src/ui/editors/itemViews.tsx`)

| View | On | Shows |
|---|---|---|
| **Coverage** (`itemCoverage`) | items | A heatmap of type × rarity counts. Click a cell to filter the item list. Empty cells for types with rarities are outlined: the "where are the gaps" view |
| **Value preview** (`valuePreview`) | items | The selected item's value at every rarity and quality, plus a bar chart of all items' final values grouped by rarity, to spot outliers |
| **Crafting tree** (`craftTree`) | recipes | Pick an item and see its ingredient tree down to raw resources: quantities on the edges, stations on the nodes. Summary: total raw cost, depth, value added. A "Used in" strip goes upward. Built from recipe data, so it can't drift. Reuses the SVG layout approach of `TreeCanvas` |
| **Rarity curve** (`rarityCurve`) | rarityTiers | Drop weight (bars) and stat/value multiplier (line) per rarity, so the "rarer = stronger" shape can be checked at a glance |
| **Loot odds** (`lootOdds`) | loot | **Interactive.** Pick a table and set rolls and the number of kills or openings. Shows the chance per item, the rarity mix as a stacked bar, and kills needed for 50% / 90%. A "simulate N opens" button shows example results (seeded, deterministic) |

### Generic engine addition: type-dependent field groups
The inspector hides field groups that don't apply to the entity's type:
- A collection option `groupFilter: { field: 'type', profiles: { section: 'types', key: 'type', groupsField: 'groups' } }`.
- `CollectionEditor`'s `fieldGroups` drops groups not listed for that type. Hidden groups stay reachable under a collapsed "Other fields" block, so no data becomes invisible.
- It's data-driven: new item types added in Definitions just need a `types` entry, with no code change. Any other module can reuse it.

## 5. Hints (`src/core/hints/rules/items.ts`)

All at `suggest` or below:

| Rule | Fires when |
|---|---|
| `items.noSource` | an item comes from nowhere: no recipe, loot, merchant, starting gear, reward or Town output |
| `items.unused` | a Resource or Use item is never an ingredient, never restores anything and isn't sold (info) |
| `items.recipeShape` | a recipe has no result, no ingredients, or no station when stations exist; cycles; a recipe tier lower than an ingredient's recipe tier |
| `items.valueLoss` | crafting is worth less than its ingredients, or is worth more than 3× of them (threshold is a constant) |
| `items.coverage` | a type that should have rarities is missing one (info, max 5 listed) |
| `items.tiers` | rarity drop weights don't decrease, or multipliers don't increase, with rarity; or the multiplier matrix goes down as quality rises |
| `items.loot` | a loot table has no source, no weights, or zero rolls; a guaranteed item isn't in the table's weights or the item list |
| `items.typeFields` | an item has fields filled in a group its type doesn't use (e.g. damage on a Decoration) |
| `items.basics` | a Resource item has no stack size, or an equipment item has no weight or durability |

## 6. Help and export
- **Help** (`MODULE_HELP['design.items']`) covers: value = base × rarity/quality multiplier; quantities in recipes; reading the crafting tree; loot weights versus chance; and type profiles controlling which fields show.
- **Export** (`itemsSummaryMd`, keyed on view kinds), following the `playerSummaryMd` approach:
  - a coverage table (type × rarity)
  - per recipe, total raw cost and value added
  - per loot table, chance per item
  - a Mermaid crafting graph of recipes
  - an **item sheet** per item, following `templates/content_entry_template.md` (doc chapter 7)

## 7. Guide (`src/modules/guides/items.ts`, registered in `GUIDES`)

- **System map.** Sections: Rarity & quality tiers → Value multiplier → Items ← Item types, Items ⇄ Recipes ← Stations, Loot → Items, Inventory. Other modules:
  - Town: stations, resource outputs
  - Combat: loot sources
  - Trade: merchants, pricing
  - Player: gear, restore, skill gates
  - World: rewards
- **Steps (10):**
  1. Define rarity tiers. Action: *create one per rarity*.
  2. Define quality tiers. Action: *create one per quality*.
  3. Fill the value multiplier. Action: *pick a multiplier preset*.
  4. Set up type profiles. Action: *create defaults*.
  5. Add 10+ items across 3+ types (target `add`).
  6. Check the Coverage view for gaps (target `view-itemCoverage`; ticked when no type is missing a rarity, or by hand).
  7. Add stations linked to Town buildings.
  8. Write recipes with quantities. Action: *insert a starter chain*.
  9. Inspect a late item in the Crafting tree (ticked by hand).
  10. Create a loot table per enemy type and check Loot odds. Action: *insert loot preset*.
- **Examples:**
  - **Multiplier presets:** linear, steep, flat-quality. The preview shows the matrix and an example sword's values.
  - **Starter crafting chain**, with the material as a parameter (wood, stone, ore → metal). It adds items, a station and recipes, and the preview shows the Crafting tree.
  - **Loot presets**, with the source (enemy or boss) as a parameter: trash mob, elite, boss chest. Built from the existing items by rarity; the preview shows the odds table.
  - **Type profiles:** default groups per item type.
- **Concept cards** (new diagrams in `concepts.tsx`):
  - *value* (base × rarity × quality as a multiplying strip)
  - *craftChain* (raw → intermediate → product with quantities)
  - *lootRoll* (weights → chance → kills for 90%)
  - *typeProfile* (one item, different field groups by type)
- **Empty texts** for `items`, `rarityTiers`, `types`, `stations`, `recipes` and `loot`.

## 8. Tests
- **`tests/items.test.ts`:**
  - migration: ingredients become quantities, stations are created from text, loot lines are parsed with leftovers kept, notes are preserved
  - export order follows the doc
  - `finalValue`, `rawCost` (quantities, output quantities, depth, cycles), `valueAdded`, `itemSources` / `itemUses` across modules, `lootOdds` arithmetic, `coverage`
  - each hint with a positive and a negative case; quiet on an empty doc and in other editors; never `important`
- **`tests/guides.test.ts`** (extend):
  - every Items guide section and doc id exists
  - step predicates and actions work
  - example preview equals the inserted result, and undo removes it
- **`tests/itemsUi.test.tsx`:**
  - type profiles hide the Combat group for a Decoration
  - Crafting tree totals for a 2-level chain
  - Loot odds update when rolls change
- **Existing tests:** update only where the migration requires it.

## 9. Implementation order
1. Schema v2, `migrateItems`, and the generic `groupFilter` in the inspector.
2. `src/core/items.ts` and its unit tests.
3. Views: Coverage, Value preview, Crafting tree, Rarity curve, Loot odds.
4. Hint rules, i18n (en and hu), help.
5. Export summaries and the item sheet.
6. Guide content and the new concept diagrams and preview kinds (`multiplier`, `craftTree`, `lootOdds` in `ExamplePicker`).
7. Tests, then a browser check with the starter chain and a boss loot table.

**Out of scope (follow-up):** turning Combat `enemies[].drops` (text list) into links. Loot tables already point at enemies and bosses, so the loot data lives here.

## 10. Verification
- `npx tsc -b --noEmit`, `npx eslint .` and `npx vitest run` all pass.
- Load `examples/hands-of-hubris.hohplan.json`: it migrates silently, and the export headings follow `items_crafting.md`.
- Insert the starter chain (ore → metal). The Crafting tree shows quantities and the total raw ore. Raise an ingredient's value above the product's and `items.valueLoss` appears.
- Mark an item as Decoration: the Combat fields hide, and a filled damage value triggers `items.typeFields`.
- On a boss loot table with 3 rolls and a Legendary weight of 1/100, Loot odds shows ≈3% per kill and 76 kills for 90%.
- The Guide tab ticks the rarity and quality steps after their quick actions, and the system map boxes change colour.
