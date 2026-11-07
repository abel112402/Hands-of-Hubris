# Time, Weather & Events editor: analysis and v2 plan

**Status:** Proposed | **Date:** 2026-11-04 | **Module:** `design.timeWeather` ([src/modules/design.ts](src/modules/design.ts), `mod('design', 'timeWeather', …)`) | **Method:** [EDITOR_UPGRADE_GUIDE.md](EDITOR_UPGRADE_GUIDE.md)

## Context

Time, Weather & Events is still the **v1 generic module**: 4 sections, no analysis, no hints, no migration, and a two-tip help entry. It sets the conditions the rest of the game runs under, and other modules already depend on it:
- **Combat:** night monster strength (`dayPhases.monsterStrength`) and variant conditions (`variants.when` → day phases and events)
- **NPC:** the daily routine matrix uses the "Times of day" catalog
- **Audio:** music themes per time of day

Its own data is mostly free text, so none of these links can say what actually changes at night, in a storm or during the Blood moon.

## 1. Analysis

### Coverage against `docs/01_design/time_weather_events.md`

| Doc chapter | Today | Problem |
|---|---|---|
| 1. Time system | `time` form: day length + calendar text | No seasons, year length or day/night ratio. The calendar is free text |
| 2. Day / night effects | `dayPhases` collection (start, duration, visibility, monster strength, notes) | Effects beyond visibility and monster strength are free text (survival decay, NPC routine, spawn rates). Phases aren't linked to the "Times of day" catalog NPC and Audio use. Nothing checks that phases cover 24 h; the timeline can't show a phase crossing midnight |
| 3. Weather | `weather` collection (biomes, effects text, frequency %) | No duration, no season dependence, no structured effects. Frequencies per biome can add up past 100%, and nothing shows the weather mix of a biome |
| 4. Special events | `events` collection (trigger text, duration, rules text, rewards text), seeded with Full moon / Blood moon / Holiday | No schedule a tool can read (every N days, moon cycle, chance, season, story trigger). No structured rule changes, rewards or links to the Combat variants they spawn |
| 5. Event system | — | No home for priority, stacking and how events combine with weather and night |

### Questions the designer can't answer today
- What exactly is different at night in a storm during the Blood moon? (Visibility, monster strength, hunger rate, spawn rate, all combined.)
- How often does the Blood moon happen per in-game year, and can it coincide with the Holiday?
- What weather does the Marsh get, and how often is it clear?
- Do the day phases cover the whole day, and how many real minutes does a night last?
- Which Combat variants appear during which event?

### Usability and professionalism
- Numbers are spread over free-text notes, so phases, weather and events can't be compared.
- The only visual is the generic timeline, which can't wrap around midnight.
- No checks, no guidance, no migration, thin help.

## 2. Target data model (module `version: 2`, `migrate: migrateTimeWeather`)

Sections in doc order. **Existing ids and keys are kept:** `time` (`dayLength`, `calendar`), `dayPhases` (`start`, `duration`, `visibility`, `monsterStrength`, `color`, `notes`), `weather` (`biomes`, `effects`, `frequency`) and `events` (`trigger`, `duration`, `rules`, `rewards`, plus the seeds).

**Shared modifier model.** A new registry catalog, **"World modifiers"** (`worldModifiers`), holds: Monster spawn rate, Hunger / thirst decay, Movement speed, Crop growth, NPC morale, Loot rarity, Corruption growth. Day phases, weather and events each get a `modifiers` **map** (catalog → × multiplier), so new effects are added in Definitions with no code change. The existing `visibility` and `monsterStrength` fields stay as dedicated fields, because Combat already reads `monsterStrength`.

| # | Section (id) | Kind | Key content |
|---|---|---|---|
| 1 | Time system (`time`) | form (kept) | `dayLength` (real minutes per in-game day), `daysPerYear`, `moonCycle` (days), `startSeason`, calendar notes |
| 2 | Seasons (`seasons`) | collection (new) | `days`, `order`, color, `modifiers` map, notes. View: table + **Year strip** |
| 3 | Day phases (`dayPhases`) | collection (kept) | start, duration, `timeOfDay` (ref "Times of day" catalog, linking NPC routine and Audio), visibility, monsterStrength, `modifiers`, color, notes. Views: **Day clock** (new, replaces the timeline as the first view), table |
| 4 | Weather (`weather`) | collection (kept) | biomes, frequency (% of time in those biomes), `seasons` (multi, empty = all), `duration` (in-game hours), visibility, `modifiers`, effects text. Views: table, **Weather by biome**, cards |
| 5 | Special events (`events`) | collection (kept) | `schedule` (Every N days, Moon cycle, Random chance per day, Season, Story trigger), `interval`, `chance`, `season` (ref), `storyTrigger` (ref Story quests), duration, `priority`, `stacks` (bool), `modifiers`, rules (text), `rewardItems` (multi Items), rewards (text), trigger (text kept). Views: cards, **Year strip**, table |
| 6 | Event system (`eventSystem`) | form (new) | priority rules, stacking, combination with weather and night, technical notes (link to Technical) |

### `migrateTimeWeather` (v1 → v2)
- Links day phases to the "Times of day" catalog by name (Dawn, Day, Dusk, Night) when it matches, so NPC routine and Audio connect at once.
- Events named "Full moon" or "Blood moon" with no schedule get `schedule: 'Moon cycle'`.
- Every other v1 field stays valid, so no text needs to move.

### Generic engine change: default catalogs on load
Projects saved before a catalog existed don't have it, because catalogs live in the project file. `deserializeProject` (`src/core/persistence/serialize.ts`) will **add missing default catalogs** from `defaultCatalogs()` and never touch existing ones. Old projects get `worldModifiers` on load, and any later module can add a catalog the same way. This needs a unit test.

## 3. Analysis core: `src/core/timeWeather.ts`

Pure functions:
- **`dayCoverage(project)`:** day phases on a 24 h circle, wrapping across midnight. Returns gaps and overlaps, plus real minutes per phase (`duration / 24 × dayLength`).
- **`phaseAt(project, hour)` / `nightPhase(project)`:**
  - the phase at an hour
  - the "night" phase: the one linked to the Night catalog entry, else the lowest-visibility phase
- **`biomeWeather(project)`:** for each World biome, its weather list with frequencies and the remaining "clear" share. Flags biomes whose total is over 100%.
- **`eventCalendar(project, years = 1)`:** day numbers on which each event occurs.
  - Every N days and moon cycles are deterministic.
  - Random-chance events get an expected count, with example days from a seeded generator (same idea as `simulateLoot`).
  - Season events are placed in their season.
  - Also returns **coincidences**: days where two or more events overlap, given their durations.
- **`seasonYear(project)`:** season ranges over `daysPerYear`, and whether they add up to it.
- **`conditions(project, { phase?, weather?, event?, season? })`:**
  - the combined multipliers: visibility (lowest), monster strength (product), and every World modifier (product)
  - which source contributed each factor
  - the core of the interactive simulator below
- **`variantsFor(project, phaseOrEventId)`:** Combat variants that appear during it, read through `variants.when`.

## 4. New views (`src/ui/editors/timeWeatherViews.tsx`)

| View | On | Shows |
|---|---|---|
| **Day clock** (`dayClock`) | dayPhases | A 24 h dial (SVG) with each phase as a coloured arc, wrapping across midnight. Gaps are hatched and overlaps red. The centre shows the real length of the day, and each arc lists its real minutes, visibility and monster strength. Clicking an arc selects the phase |
| **Weather by biome** (`biomeWeather`) | weather | A stacked bar per biome showing its weather mix plus the "clear" remainder. Biomes over 100% are flagged. Click a segment to open that weather |
| **Year strip** (`yearStrip`) | seasons, events | One in-game year as a strip: season bands, with event occurrences as ticks or blocks (duration). Coinciding events are outlined. A "years" selector shows several years. Random events show expected counts and an example placement |
| **Conditions simulator** (`conditions`) | events | **Interactive.** Pick a day phase, a weather, an event and a season, and see the combined effect table: visibility, monster strength and each World modifier with the source of each factor. Also lists the Combat variants that appear under those conditions. Lets the designer test "night + storm + Blood moon" |

## 5. Hints (`src/core/hints/rules/timeWeather.ts`)

All at `suggest` or below:

| Rule | Fires when |
|---|---|
| `time.dayCoverage` | day phases leave gaps or overlap within 24 h |
| `time.basics` | there's no day length; a phase has no start or duration; a phase has no time-of-day link while the catalog has entries (info) |
| `time.nightHarder` | the night phase's monster strength isn't above the day's, or its visibility isn't below it (info; the game design says nights are more dangerous) |
| `time.weatherShare` | a biome's weather frequencies add up past 100%; a World biome has no weather at all (info) |
| `time.events` | an event has no schedule or duration, or no modifiers and no rule text |
| `time.coincide` | two events can coincide (from `eventCalendar`) and neither has a priority or stacking rule (info) |
| `time.seasons` | season days don't add up to `daysPerYear` |
| `time.extremes` | a modifier is ×0 or above ×5 (info, to catch typos) |

## 6. Help and export
- **Help:**
  - explain the modifier model and the "World modifiers" catalog
  - the day clock and wrap-around
  - weather frequency meaning (% of time, remainder = clear)
  - event schedules
  - the simulator, and that Combat and NPC read from here
- **Export** (`timeWeatherSummaryMd`, keyed on view kinds):
  - a day-phase table with real minutes
  - weather mix per biome
  - each event's yearly occurrences and coincidences
  - a conditions table for the worst case: night + the harshest weather + each event

## 7. Guide (`src/modules/guides/timeWeather.ts`, registered in `GUIDES`)

- **System map.**
  - Sections: Time system → Seasons, Day phases, Weather, Special events → Event system.
  - Other modules: Combat (night strength, variants), NPC (routine by time of day), World (biomes), Player (survival decay), Items (event rewards), Story (story triggers).
- **Steps (10):**
  1. Set day length and year.
  2. Add day phases covering 24 h. Action: *day/night preset*.
  3. Link phases to the times of day. Action: *link by name*.
  4. Make night harder (visibility and monster strength).
  5. Add seasons. Action: *four-season preset*.
  6. Add weather for every biome. Action: *weather set*.
  7. Check Weather by biome (ticked when no biome is over 100% or without weather).
  8. Give events schedules and modifiers. Action: *moon events*.
  9. Try the Conditions simulator (ticked by hand).
  10. Write the event priority and stacking rules.
- **Examples:**
  - **Day presets** (the preview is the Day clock):
    - 4 phases: dawn, day, dusk, night
    - long night: 40% of the day
    - 2 phases: day and night
  - **Seasons:** four seasons, or wet/dry. The preview is the Year strip.
  - **Weather set per biome,** with the biome as a parameter: clear, rain, fog, storm with frequencies and modifiers. The preview is the biome's weather bar.
  - **Moon events:** Full moon every moon cycle, Blood moon every 3rd cycle with monster strength ×1.5, Holiday once a year. The preview is the Year strip with coincidences.
- **Concept cards** (new diagrams):
  - *dayClock*: a 24 h dial with arcs
  - *modifierStack*: phase × weather × event = combined
  - *weatherMix*: a biome bar with a clear remainder
  - *eventCalendar*: a year with periodic ticks and one coincidence
- **Empty texts** for seasons, dayPhases, weather and events.

## 8. Tests
- **`tests/timeWeather.test.ts`:**
  - migration: time-of-day links by name, moon schedules, nothing else lost
  - export order follows the doc
  - `dayCoverage` with a phase crossing midnight
  - `biomeWeather` remainder and the over-100% case
  - `eventCalendar`:
    - every N days, moon cycle and season placement
    - coincidences
    - a seeded random event returns the same result each run
  - `conditions` products and their sources
  - `variantsFor`
  - each hint with a positive and a negative case; quiet on an empty doc and in other editors; never `important`
- **`tests/serialize`** (extend `core.test.ts`): an old project without `worldModifiers` gets it on load, and an edited catalog is kept.
- **`tests/timeWeatherGuide.test.ts`:** sections and docs exist; step predicates and actions; example preview equals the inserted result, and undo removes it.
- **`tests/timeWeatherUi.test.tsx`:**
  - the Day clock marks a gap
  - the simulator updates when weather changes
  - the Year strip outlines a coincidence

## 9. Implementation order
1. Default catalogs on load, plus the `worldModifiers` catalog.
2. Schema v2 and `migrateTimeWeather`.
3. `src/core/timeWeather.ts` and its unit tests.
4. Views: Day clock, Weather by biome, Year strip, Conditions simulator.
5. Hint rules, i18n (en and hu), help.
6. Export summaries.
7. Guide content, the new concept diagrams and preview kinds.
8. Tests, then a browser check with the 4-phase day, a Marsh weather set and the moon events.

**Out of scope (follow-up):** feeding the active conditions into other editors. Examples are a "condition" selector in Player › Depletion (hunger decay ×) and in Combat's sandbox (beyond the night toggle). The `conditions()` function is built so they can call it later.

## 10. Verification
- `npx tsc -b --noEmit`, `npx eslint .` and `npx vitest run` all pass.
- Load `examples/hands-of-hubris.hohplan.json`:
  - it migrates silently
  - the "World modifiers" catalog appears in Definitions
  - export headings follow `time_weather_events.md`
- A night phase from 21:00 lasting 9 h wraps to 06:00 on the Day clock with no gap. Shortening it to 8 h shows a hatched 05:00–06:00 gap and the `time.dayCoverage` tip.
- With a moon cycle of 28 days and a Blood moon every 3rd cycle, the Year strip shows the Blood moon on days 84, 168, … and outlines a coincidence with a Holiday on day 168.
- In the simulator, Night (monster ×1.3) + Storm (×1.2) + Blood moon (×1.5) shows ×2.34 monster strength, with each source listed, and the Combat variants tied to the Blood moon.
