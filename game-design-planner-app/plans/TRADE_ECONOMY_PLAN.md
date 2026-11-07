# Trade & Economy editor: analysis and v2 plan

**Status:** Implemented (see “Implementation notes” at the end) | **Date:** 2026-11-06 | **Module:** `design.trade` ([src/modules/design.ts](src/modules/design.ts), `mod('design', 'trade', …)`) | **Method:** [EDITOR_UPGRADE_GUIDE.md](EDITOR_UPGRADE_GUIDE.md)

## Context

Trade & Economy is still the **v1 generic module**: 5 sections, no analysis, no hints, no migration and a two-tip help entry. It sits at the end of the content chain. Items supplies base values, rarity and quality multipliers (`finalValue`). Factions supplies reputation levels (`thresholds`). Town has buildings and its own buy and sell margins. Difficulty has an "Economy price multiplier" parameter. Story has acts that describe progression. Trade uses **none** of these numbers today.

One module already reads Trade data: `core/items.ts` (`itemSources`, `itemUses`) reads `merchants[].goods`. So `merchants` and `goods` must keep their ids.

The example project (`examples/hands-of-hubris.hohplan.json`) has an empty Trade doc, so migration risk is low. The migration still has to be safe for user projects.

## 1. Analysis

### Coverage against `docs/01_design/trade_economy.md`

| Doc chapter | Today | Problem |
|---|---|---|
| 1. Currencies and value system | `currency` form, one textarea | No list of currencies, rates or weight. It duplicates Items' "Value unit" (`model.currency`). The value formula already lives in Items, and Trade doesn't show it |
| 2. Wandering merchant | `merchants` with `type = Wandering` and an `appearance` text | No spawn interval, chance, stay length, biomes or rarity mix, so you can't tell how often the player meets one |
| 3. Town market | `merchants` with `type = Town market`, `stock` text | Not linked to a Town building, no restock time, no progression gate (act) and no reputation effect |
| 4. Faction capital trade | `merchants` with `type = Faction capital`, `faction` ref | No required reputation level and no exclusive goods |
| 5. Pricing and margin | `pricing` formulas + `priceRules` (factor + text) | Rules have **no scope**: you can't tell if a factor applies to buying, selling, a faction or a difficulty, so it can't be computed. Formula variables aren't defined anywhere. Town also has `economy.buyMargin` and `sellMargin`, so the same thing is set in two places |
| 6. Economic balance and inflation | `balance` form, two textareas | Sources and sinks are prose. Nothing adds up the money coming in and going out |

Section order is already close to the doc, but chapters 2–4 share one collection. `priceRules` sits between merchants and balance, which is fine because it belongs to chapter 5.

### Questions the designer can't answer today
- What does a Rare iron sword cost to **buy** and **sell** at a market, at Hostile and at Allied reputation, on Hard?
- Is there a money loop? For example, buying at one merchant and selling to another for profit, or crafting from bought ingredients and selling for more than they cost.
- How often does the player meet the wandering merchant? What's the chance in a given week?
- Which valuable items no merchant sells or buys? Which merchants sell items above their rarity tier?
- Does money pile up over the acts, causing inflation, or do sinks keep it in check? How many days of income does a key purchase take in each act?

### Bugs and inconsistencies
- The price multiplier is defined twice (Town `economy.buyMargin` / `sellMargin` and Trade's free-text rules), and the two can disagree.
- `priceRules[].factor` has no target, so its meaning doesn't match its data.
- `appearance` is only meaningful for Wandering merchants, and `faction` mainly for capitals, but every merchant shows every field.

## 2. Target data model (module `version: 2`, `migrate: migrateTrade`)

Sections follow doc order. **Existing ids are kept** (`currency`, `pricing`, `merchants`, `priceRules`, `balance`), and so are the field keys `currencies`, `type`, `faction`, `appearance`, `stock`, `goods`, `factor`, `description`, `sinks` and `inflation`.

| # | Ch. | Section (id) | Kind | Key content |
|---|---|---|---|---|
| 1 | 1 | Currency (`currency`) | form (kept) | Read-only line showing the base unit from Items (`model.currency`) and the value formula (base × rarity × quality). Keeps `currencies` (relabelled "Currency notes"). New fields: `startingMoney` and `walletCap` (optional) |
| 2 | 1 | Currencies (`currencyTypes`) | collection (new) | `kind` (Coin, Barter good, Faction scrip, Token), `rate` (in base units), `weight`, `faction` (ref FACTIONS, for scrip), `item` (ref ITEMS, for a physical coin), notes. Table view |
| 3 | 2 | Wandering merchant (`wandering`) | form (new) | `interval` (days), `chance` (%), `stayDays`, `biomes` (multi BIOMES), `stockSize`, `rarityMix` (map rarities → weight), `restockOnVisit`, notes |
| 4 | 3 | Town market (`market`) | form (new) | `restockDays`, `building` (ref `section('buildings', 'design.town')`), `stockByAct` notes, `reputationEffect` notes |
| 5 | 4 | Faction capitals (`capital`) | form (new) | `minLevel` (ref `section('thresholds', 'design.factions')`), `exclusiveRule` notes |
| 6 | 2–4 | Merchants (`merchants`) | collection (kept) | **Identity:** type, faction. **Stock:** `goods` (kept), `buys` (multi `catalog('itemTypes')`), `rarityCap` (ref rarities), `stockSize`, `gold` (cash the merchant has for buying from the player). **Pricing:** `markup` (× on buy), `buyback` (× on sell). **Wandering:** `appearance` (kept), `chance` and `interval` overrides. **Market:** `building` (ref Town buildings), `unlockAct` (ref `section('acts', 'design.story')`), `restockDays`. **Capital:** `minLevel` (ref Factions thresholds), `exclusive` (multi ITEMS). Plus `stock` (kept, "Stock notes") and `legacyNotes`. Views: cards, kanban(type), table, **Stock coverage** |
| 7 | 5 | Price formulas (`pricing`) | formulas (kept) | The placeholder now lists the available variables: `base`, `rarityMult`, `qualityMult`, `markup`, `buyback`, `rep`, `difficulty`, `rule`. An empty formula falls back to the built-in price chain |
| 8 | 5 | Margins (`margins`) | form (new) | `buyMultiplier`, `sellMultiplier` (**Trade is the source of truth**; Town's values are a fallback), `byReputation` (map over Factions `thresholds` → ×), `difficultyParam` note (the Difficulty "Economy price multiplier" is read automatically) |
| 9 | 5 | Price rules (`priceRules`) | collection (kept) | `factor` and `description` kept. New: `side` (Buy, Sell, Both), `scope` (Global, Merchant type, Merchant, Faction, Reputation level, Item type, Rarity) with matching refs (`merchantType`, `merchant`, `faction`, `level`, `itemType`, `rarity`), and `active` (bool). Views: table, **Price ladder** |
| 10 | 6 | Economic balance (`balance`) | form (kept) | `sinks` and `inflation` kept as notes. New: `horizonDays`, `inflationTolerance` (%), `dailySellCap` (optional) |
| 11 | 6 | Money flows (`flows`) | collection (new) | `direction` (Source, Sink), `kind` (Selling loot, Quest reward, Wages/tax, Buying, Repair, Building cost, Upkeep, Fee, Other), `amount`, `per` (Day, Event), `perDay` (how often, for events), `fromAct` and `toAct` (ref Story acts), `links` (multi any of quests, merchants, Town buildings, loot tables). Views: table, **Money flow** |

### Generic engine addition: static group profiles
`groupFilter` today reads profiles from a data section. Add an optional static form `groupFilter: { field: 'type', static: { Wandering: ['Wandering'], 'Town market': ['Market'], 'Faction capital': ['Capital'] }, always: ['Identity', 'Stock', 'Pricing'] }` to `core/groupFilter.ts` and the type. This way merchants only show their own type's group, without adding a profile section to the doc. Hidden groups stay under "Other fields", as they do for Items.

### `migrateTrade` (v1 → v2)
- `merchants[]`: ids, `goods`, `appearance` and `stock` stay as they are. A `goods` value that's a single id is wrapped into an array.
- `priceRules[]`: `factor` and `description` are kept. `scope` is **left empty**, so nothing changes silently. The `trade.ruleScope` hint asks the designer to scope them.
- `currency.currencies` text is kept unchanged. It's not parsed.
- `balance.sinks` and `inflation` are kept. `flows` starts empty.
- New sections get their defaults from the module (empty forms and lists).
- Town margins aren't copied. `migrate(data)` only sees Trade's own data, so the core reads Town as a fallback instead (see §3).

## 3. Analysis core: `src/core/trade.ts`

Pure functions. The UI text says these are planning estimates.

- `TRADE_DOC`, `merchants(project)`, `marginsOf(project)` (Trade margins, falling back to Town `economy.buyMargin`/`sellMargin`, then 1), `difficultyPriceMult(project, levelId)` (finds the Economy price parameter through `core/difficulty.ts`).
- `priceOf(project, itemId, { side, merchantId?, quality?, levelId?, difficultyId? })` returns `{ price, steps[] }`, a breakdown in this order:
  1. base value
  2. × rarity and quality (`finalValue` from `core/items.ts`)
  3. × merchant markup or buyback
  4. × reputation (`byReputation`)
  5. × difficulty
  6. × matching active rules

  If a `pricing` formula is set, it's evaluated with `tryEvaluate` using the same variables, and `variablesOf` reports unknown names.
- `spread(project, itemId)`: buy versus sell per merchant.
- `arbitrage(project)`:
  - **trade loops**: buying item X at merchant A costs less than merchant B pays for it
  - **craft loops**: buying a recipe's ingredients (`rawCost`) costs less than selling the result
  - **inverse margin**: the sell multiplier is ≥ the buy multiplier
- `wanderingOdds(project, merchant?)`: expected visits per N days, average gap, and P(≥1 visit in 7 / 30 days), from interval × chance (1 − (1 − c)^(days/interval)).
- `stockCoverage(project)`:
  - per merchant, counts by rarity and item type
  - goods above `rarityCap`
  - capital goods not in `exclusive`
  - valuable items (value > 0, type Valuable or Resource) that no merchant sells or buys
- `moneyFlow(project, difficultyId?)`: per act (from Story `acts` start/duration, or per day when there are no acts), sources, sinks and net. Also cumulative wallet from `startingMoney`, and an inflation index (cumulative ÷ typical price of the act's goods).
- `affordability(project, itemId, actId)`: days of net income needed to buy the item in that act.

Reused helpers: `finalValue`, `rawCost` and `recipesFor` from `core/items.ts`; `tryEvaluate` and `variablesOf` from `core/formula.ts`; `analyzeRanges` from `core/diplomacy.ts` (to check that `byReputation` keys cover the reputation scale); `levelsOf`, `paramsOf` and `cellsOf` from `core/difficulty.ts`.

## 4. New views (`src/ui/editors/tradeViews.tsx`)

| View | On | Shows |
|---|---|---|
| **Price ladder** (`priceLadder`) | priceRules | **Interactive.** Pick an item, a merchant, a reputation level and a difficulty. A waterfall shows each multiplier step, for buy and sell side by side. Under it, a table of the item's buy and sell price at every reputation level. Arbitrage rows are flagged and clicking them opens the merchant |
| **Stock coverage** (`merchantStock`) | merchants | A heatmap of merchants × rarity (switchable to item type). Cells above the rarity cap are outlined `--warn`. Below it, a list of valuable items nobody trades. Clicking a row calls `onSelect` |
| **Wandering calendar** (`wanderingCalendar`) | merchants (Wandering) | A 60-day strip of expected visit windows, plus a chance table for 7 and 30 days. A "roll" button draws a seeded example season |
| **Money flow** (`moneyFlow`) | flows | **Planner.** A Recharts stacked area of sources and sinks per act or day, with net and wallet lines, built from **one shared data array**. Has a difficulty selector and an "afford" picker: pick an item and see days of income per act |

Wiring: add the kinds to `CollectionView` in `src/core/model/types.ts`, helpers in `v` (`src/modules/helpers.ts`), and labels and dispatch in `src/ui/editors/CollectionEditor.tsx`. Styles go in `src/styles.css`, using the CSS variables only.

## 5. Hints (`src/core/hints/rules/trade.ts`)

All at `suggest` or below. Each has a `goto` action, or `addEntity` where one click can fix it.

| Rule | Fires when |
|---|---|
| `trade.arbitrage` | a trade loop, craft loop or inverse margin exists (lists the first 3) |
| `trade.marginConflict` | both Trade margins and Town `economy` margins are set and differ (info) |
| `trade.ruleScope` | an active price rule has a factor but no scope or side |
| `trade.formulaVars` | the pricing formula uses a variable that isn't in the price chain |
| `trade.wanderingRule` | a Wandering merchant exists but neither the merchant nor the `wandering` form gives an interval or chance |
| `trade.capitalGate` | a Faction capital merchant has no faction or no required level |
| `trade.rarityCap` | goods are above the merchant's rarity cap |
| `trade.unsold` | a valuable item has no merchant that buys or sells it (info, max 5) |
| `trade.noSinks` | there are flows with sources but no sinks, or net income makes the inflation index rise above `inflationTolerance` across the acts |
| `trade.repCoverage` | `byReputation` misses some reputation levels (info) |

Rules that stay quiet: an empty doc, other editors, and a project with no merchants (for the stock rules). Register the rules in `RULES` (`src/core/hints/engine.ts`), and add `hints.trade.*.title/body` to both `en.json` and `hu.json`.

## 6. Help and export
- **Help** (`MODULE_HELP['design.trade']`): the price chain (Items value → markup → reputation → difficulty → rules); Trade owns margins and Town is a fallback; scoping rules; reading the arbitrage flags; wandering odds; flows in and out per act; and a pointer to the Guide tab.
- **Export** (`tradeSummaryMd`, keyed on view kinds):
  - merchants grouped by type **inside chapters 2–4**, so the export reads in doc order even though they share one collection
  - a price table for up to 10 key items (buy and sell at Neutral and Allied)
  - an arbitrage list
  - wandering odds
  - a source/sink table per act with the net amount
  - a Mermaid flowchart of money sources → wallet → sinks

## 7. Guide (`src/modules/guides/trade.ts`, registered in `GUIDES`)

- **System map** (210px column grid). Sections: Currency → Margins → Price rules → Merchants, Wandering / Market / Capital → Merchants, Flows → Balance. Neighbouring modules, with their edge labels:
  - Items: "value ×", "goods"
  - Factions: "rep ×", "gates"
  - Town: "hosts market", "margins fallback"
  - Difficulty: "price ×"
  - Story: "act timeline"
  - World: "wander biomes"
- **Steps (9):**
  1. Confirm the base unit and add currencies (target `field-currencies`).
  2. Set buy and sell margins. Action: *use Town's values*.
  3. Fill price by reputation. Action: *reputation ladder preset*.
  4. Add one merchant of each type. Action: opens the examples picker for `merchants`.
  5. Set the wandering rules and check the Wandering calendar (target `view-wanderingCalendar`).
  6. Give every market a Town building and an unlock act.
  7. Scope every price rule (done when `trade.ruleScope` is clear).
  8. Check the Price ladder for arbitrage (done when there are no loops).
  9. Add 3+ sources and 3+ sinks and check Money flow (target `view-moneyFlow`).
- **Examples:**
  - **Merchant archetypes**, with a faction parameter for the capital: peddler, market stall, capital trader. Preview: a merchant card.
  - **Reputation price ladders**: gentle and harsh (e.g. Hostile ×1.5 … Allied ×0.85). Preview: the price ladder for one item.
  - **Starter economy flows**: survival-lean and trader-friendly. Preview: the money-flow chart.

  These need new `PreviewKind`s in `ExamplePicker.tsx`: `priceLadder` and `moneyFlow`.
- **Concept cards** (new diagrams in `concepts.tsx`):
  - *priceChain*: a strip of multipliers
  - *spread*: buy above sell, and a loop when they cross
  - *sourceSink*: taps → wallet → drains
  - *wanderOdds*: interval × chance, shown as a calendar
- **Empty texts** for `currencyTypes`, `merchants`, `priceRules` and `flows`.

## 8. Tests
- **`tests/trade.test.ts`:**
  - migration: ids and text are preserved, a single `goods` value is wrapped, rules stay unscoped
  - export headings follow the doc order, with merchants under chapters 2–4
  - `priceOf` with hand-checked steps, including the formula override
  - the Town margin fallback
  - `arbitrage` (trade, craft and inverse cases), `wanderingOdds` arithmetic, `stockCoverage`, `moneyFlow` totals per act
  - each hint with a positive and a negative case; quiet on an empty doc and in other editors; never `important`
- **`tests/tradeGuide.test.ts`**, following the `guides.test.ts` pattern: sections and doc ids exist, step predicates and actions work, example preview equals the inserted result, undo removes it, and map states follow the data.
- **`tests/tradeUi.test.tsx`:**
  - a Wandering merchant hides the Capital group
  - the Price ladder updates when the reputation changes
  - Money flow shows a negative net when sinks are larger
- **Existing:** `tests/items.test.ts` (merchant `goods` → `itemSources`) has to keep passing unchanged.

## 9. Implementation order
1. Schema v2, `migrateTrade`, and the static `groupFilter` option.
2. `src/core/trade.ts` and its unit tests.
3. Views: Price ladder, Stock coverage, Wandering calendar, Money flow.
4. Hint rules, i18n (en and hu), help.
5. Export summary.
6. Guide content, concept diagrams and preview kinds.
7. Tests, typecheck and lint, then a browser check.

**Out of scope (follow-up):** moving Town's `buyMargin` and `sellMargin` out of Town (this needs a Town v2 migration), and per-NPC haggling or skill-based prices (a Player skill hook).

## 10. Verification
- `npx tsc -b --noEmit`, `npx eslint .` and `npx vitest run` all pass.
- Load `examples/hands-of-hubris.hohplan.json`: it migrates silently, and the export headings follow `trade_economy.md`.
- Insert the merchant archetypes and the gentle ladder. For a Rare iron sword, the Price ladder shows each step, and the buy price is above the sell price at every level.
- Set the sell multiplier above the buy multiplier: `trade.arbitrage` (inverse margin) appears. Set a market to sell an ingredient cheaper than its crafted product sells for: a craft loop is flagged.
- A wandering merchant with a 10-day interval and 50% chance shows about 3 visits per 60 days and P(≥1 in 30 days) ≈ 88%.
- Add flows with only sources: `trade.noSinks` appears, and the wallet line in Money flow climbs every act.

## Decisions to confirm before coding
1. **One `merchants` collection with type-based groups** (recommended; keeps `items.ts` working), or split it into three collections, one per doc chapter.
2. **Trade owns the buy and sell margins**, with Town as a read-only fallback, flagged when they differ.
3. Money flow uses **Story acts** as its time axis, falling back to days when there are no acts.

## Implementation notes (2026-11-06)

All three decisions above were taken as recommended. Where the build differs from the plan:

- **Price rules:** “active” became `paused` (a new rule applies by default). The scope target fields use the static `groupFilter` too, keyed on `scope`, so only the chosen target shows and a scoped rule doesn't count as incomplete.
- **Balance:** `inflationTolerance` became `keepTolerance` (the % of income a player may keep in the last period, default 50). `actDays` was added (Story act length × this = days).
- **Merchants:** no `legacyNotes` field, because the migration moves no text out of place.
- **Formulas:** a formula overrides one side when its name contains “buy” or “sell”. The variables are `value`, `base`, `mult`, `margin`, `markup`, `rep`, `difficulty` and `rule`.
- **Difficulty:** it applies to prices via `margins.difficultyParam`, or a parameter named like “price”. Buying is multiplied and selling divided. In Money flow it scales Buying and Repair sinks and Selling-loot sources.
- **Relationship ladder examples:** the level that contains 0 stays at ×1, and the factors step evenly towards hostile and allied.
- **Export:** the Wandering, Town market and Faction capital forms list their merchants, so chapters 2–4 read in doc order.
- **Known noise (app-wide rules, not changed here):** `consistency.orphan` flags merchants as unused because a price rule *can* point at a merchant. The outlier check compares per-event and per-day flow amounts.
