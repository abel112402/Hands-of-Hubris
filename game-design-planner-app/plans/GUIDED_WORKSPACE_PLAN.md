# Guided Workspace Plan — genre walkthroughs, 3-pane home, settings

Status: **implemented** — M1–M8 done (2026-11-08). Layout: `src/ui/workspace/`. Engine: `src/core/walkthrough/`, content: `src/modules/walkthroughs/` (Hungarian in `i18n/hu.ts`). Supersedes the "Tailored guide" part of `ACCOUNTS_COLLABORATION_GENRE_PLAN.md` §6 (the profile model stays).

## 1. Goals

1. **Core editors always visible.** Technical, Art & Audio, Production, QA, Templates and Custom are shown for every genre. Genres only shape the *Game Design* (and Overview) part.
2. **Genres select a walkthrough, not just a filter.** Each genre gets a full, teaching walkthrough: how to design *that kind of game*, step by step, from pitch to shippable plan.
3. **One Settings page** that holds every project setting (today they are spread over Home, the Save menu, `/ai`, `/project`, `/hints`).
4. **3-pane main page** (like the GitHub dashboard): left = editors (compact, professional buttons); center = walkthrough + AI + hints (the focus); right = visual planning progress.
5. **Extensible guide system**: adding a genre, a step or a whole new guide is a content change, not a code change.

## 2. Current state (what exists)

| Piece | Where | What it does |
|---|---|---|
| Genre catalog | `src/modules/genres.ts` | 8 genres, each = ordered editor list + reasons; `FOUNDATION_EDITORS`, `GENERAL_ORDER` |
| Project guide steps | `PROJECT_GUIDE_STEPS` in the same file | ~30 flat steps tagged with genres; 4–6 steps per genre + 3 foundation |
| Guide logic | `src/core/genre.ts` | `defaultRecommendations`, `recommendEditors`, `composeProjectGuide` (dedupe by id, sort by priority, done = section non-empty) |
| Project guide UI | `src/ui/genres/ProjectGuide.tsx` | `<details>` on Home, shows the next 3 open steps |
| Module guides | `src/modules/guides/*.ts` (19 of 37 modules) | Per-editor map, steps with `done` predicates, examples, concepts |
| Module guide UI | `GuidePanel` inside the right-hand `HintPanel` tabs (Hints / Guide / AI) on `EditorPage` | |
| Hints | `src/core/hints/` engine + rules; `/hints` page; "Next steps" on Home | |
| AI | `AiPanel` tab, `/ai` settings route | |
| Settings today | Save-menu (language, export, snapshots), Home (genre panel, snapshots, autosave restore), `/ai`, `/project` (cloud members), `/hints`, `/definitions` | |

## 3. Critique of the guide system

### What is good (keep)
- Pure, deterministic core functions; IDs are stable and saved; unknown genres round-trip.
- Completion is *derived from project data*, so it survives genre changes and needs no extra state.
- Module guides are rich (concept cards, system map, examples with previews, one-click actions, spotlight).

### Problems

1. **It does not teach — it is a to-do list.** A genre adds 4–6 steps like "Define the factions → open Factions". There is no *why*, no genre knowledge (e.g. a roguelike's run/meta split, a survival game's pressure curve, an RPG's power curve), no "good vs bad" examples, no exit criteria. Action, Strategy, Simulation, Adventure, Sandbox each get **4** steps.
2. **Three disconnected guidance layers.** Project guide (Home), module guides (right tab inside an editor) and hints (separate page/panel) don't know about each other. The project step "Define survival pressures" doesn't reuse the Player guide's own steps/done-checks; the user sees two different checklists for the same thing.
3. **No guide without a genre.** `composeProjectGuide` returns `[]` when no catalog genre is chosen; "Other" custom genres add nothing. New users with no genre get no walkthrough at all.
4. **Weak completion.** "Section is non-empty" = done. One placeholder entry ticks "Build the enemy roster". Module guides have proper `done` predicates, the project guide ignores them.
5. **No structure over time.** Steps are a flat priority list; there are no phases (concept → core systems → content → production → ship), so there is nothing meaningful to visualise as "planning progress".
6. **Guide is visually de-prioritised.** Home intentionally collapses it to 3 steps "so the planner grid stays above the fold" — the opposite of the new goal.
7. **Genre hides core editors.** The Recommended view shows only genre editors; Technical/Production/QA disappear unless a genre happens to list one.
8. **Manual ticks are fragile.** Stored in `localStorage` keyed by **project name** (`hohplan:guide:<name>:<doc>`): renaming loses them, two projects with the same name share them, cloud teammates never see them.
9. **Content is hard-coded TS + English only.** Guide strings bypass i18n ("Show me", "mark done", all step text), so HU users get mixed languages; content can't be loaded, versioned or authored outside code.
10. **AI and hints are not step-aware.** The AI panel doesn't know which step the user is on; hints are not filtered/prioritised by the current step.
11. **Multi-genre merge is naive.** Dedupe by step id only; overlapping topics (RPG + Roguelike progression) appear as two separate steps with different wording instead of one merged step with genre-specific notes.

## 4. Recommended guide architecture ("Walkthrough")

### 4.1 Model (pure data, Zod-validated)

```
Walkthrough            = base walkthrough + genre packs, composed per project
  Phase                (Concept → Core systems → Content → Production → Polish & ship)
    Chapter            (e.g. "The core loop", "Progression", "Economy")
      Step             (one thing to learn/decide/do)
```

```ts
// src/core/walkthrough/types.ts
type StepKind = 'learn' | 'decide' | 'build' | 'review' | 'milestone'

type DoneRule =                                  // declarative → serialisable, testable, loadable from JSON
  | { kind: 'sectionFilled'; docId: string; section: string; min?: number }   // min entries for collections
  | { kind: 'moduleStep'; docId: string; stepId: string }                     // reuse a ModuleGuide step's done()
  | { kind: 'hintsClear'; ruleIds: string[] }                                 // quality gate: these hint rules no longer fire
  | { kind: 'all' | 'any'; rules: DoneRule[] }
  | { kind: 'manual' }

type WalkStep = {
  id: string                 // stable, saved
  kind: StepKind
  phase: PhaseId
  chapter: string
  title: I18nText            // { key } or { en, hu }
  body: I18nText             // teaching text (markdown), the "why"
  tips?: I18nText[]          // genre-specific do/don't
  examples?: { docId: string; exampleId: string }[]   // links into existing ModuleGuide examples
  target?: { docId: string; section?: string; moduleStep?: string }  // where "Open" / "Show me" goes
  done: DoneRule
  optional?: boolean
  aiPrompt?: I18nText        // pre-filled "Ask AI about this step"
}

type WalkPack = {            // one per genre (and one 'base')
  id: string; version: number
  extends?: 'base'
  insert?: { after: string; steps: WalkStep[] }[]     // anchor-based insertion into base
  replace?: Record<string, Partial<WalkStep>>         // override wording/done rule of a base step
  notes?: Record<string, I18nText[]>                  // genre tips attached to shared steps (merge, not duplicate)
  remove?: string[]                                   // base steps that make no sense for this genre
}
```

### 4.2 Composition (`src/core/walkthrough/compose.ts`)
- **Base walkthrough always exists** (general game design path ≈ 25 steps). No genre / custom genre → base only. Fixes problem 3.
- Each selected genre pack applies `insert` / `replace` / `notes` / `remove` on top, in genre selection order; same step id from two packs = **one step with merged notes** (fixes 11).
- Result is cached per `(profile, packVersions)`; progress is computed separately from project data (`evaluate(step, project)`), keeping today's "derived completion" principle.
- `nextStep(project)`, `phaseProgress(project)`, `chapterProgress(project)` feed the center and right panes.

### 4.3 Persistence
- Add optional `meta.guide` to the project (Zod, migration, export round-trip):
  `{ version: 1, manual: string[], skipped: string[], current?: string }` — shared with teammates, survives rename. Migrate old `localStorage` ticks once, then delete the key.
- Personal UI state (collapsed chapters, last tab) stays in `localStorage`, keyed by project **id**, not name.

### 4.4 Content & i18n
- Content lives in `src/modules/walkthroughs/` (`base.ts`, `survival.ts`, `rpg.ts`, …), one file per pack, validated by a Zod schema in tests.
- All text via `I18nText`; HU can lag behind (fallback to EN with a small "EN" marker) but UI chrome ("Show me", "mark done") moves to `en.json`/`hu.json` now.
- Module guides remain the *deep* layer. Walkthrough steps point into them (`moduleStep`, `examples`) instead of duplicating (fixes 2, 4).

### 4.5 Integration
- **AI**: "Ask AI about this step" button sends step title/body/target + relevant project context; AI panel shows the current step as context chip. Later: "draft this step" proposals through the existing proposal/diff flow.
- **Hints**: hint engine gets a `focus` input; hints for the current step's module/section are listed first under the step. `review` steps use `hintsClear` as quality gates.
- **Module guide** (`GuidePanel`): shows a header "Part of walkthrough › Chapter › Step" with Back-to-walkthrough.

### 4.6 Future-proofing (enabled by the above, not built now)
- User-authored / imported packs (same Zod schema; JSON import like `.hohplan.json`).
- AI-drafted packs for custom "Other" genres, reviewed by the user before use.
- Engine packs (Unity / Godot / Unreal), team-role views (designer / programmer / artist), community pack gallery for the cloud version.
- Pack versioning: `version` per pack + stable step IDs → completion survives content updates.

## 5. Editors: always-default groups

- `src/modules/genres.ts`: add `ALWAYS_SHOWN_GROUPS = ['technical','artAudio','production','qa','templates','custom']`.
- `defaultRecommendations` / the left rail: genre logic decides only `design` (and ordering/★ inside `overview`). Always-shown groups are listed for every profile; genre editors inside them (e.g. `technical.ai` for Strategy) still get a ★ and a reason.
- **Recommendation:** also keep **Overview** always shown (Vision, Roadmap, Glossary apply to every game).
- The "Customize editors" override list only applies to the genre-driven groups.
- `Custom` currently has no modules; the rail shows it as an entry to Definitions (custom entity types/fields) — verify against `Definitions.tsx` while implementing.
- Update `tests/genre*.test.ts` expectations.

## 6. Settings page

New route `/settings/:tab` with a gear icon in the top bar; old routes redirect (`/ai` → `/settings/ai`, `/project` → `/settings/sharing`, `/hints` settings part → `/settings/hints`).

| Tab | Content (moved from) |
|---|---|
| General | Project name, language (Save menu), created/updated info |
| Genre & editors | `GenrePicker` + Customize editors (Home `GenreProfilePanel`) |
| Walkthrough | Show completed/skipped, reset manual ticks, pack versions, show HU fallback marker |
| Hints | enabled, min severity, muted rules, thresholds (`meta.hints`, from `/hints`) |
| AI | existing `AiSettings` |
| Definitions | link/embed of `/definitions` (it edits project data, so it may stay its own page) |
| Sharing (cloud) | existing `ProjectSettings` (members, invites, revisions) |
| Data & backups | export MD/JSON, snapshots list, autosave restore (Save menu + Home) |

Implementation: `src/ui/settings/SettingsPage.tsx` (vertical tab list + panel), each tab a small component reusing existing ones. All writes keep going through `useStore.mutate`.

## 7. 3-pane main page

```
┌──────────────── top bar: brand · project · search · undo/redo · Save ▾ · ⚙ ────────────────┐
│ LEFT 240px        │ CENTER (flex, max ~760px)                │ RIGHT 300px                   │
│ Genre chip ✎      │ "Good evening — next step"               │ Planning progress             │
│ ── Game Design ★  │ ┌ Current step card ───────────────────┐ │  ◯ 42% overall ring           │
│  ▸ Core Loop  ●●○ │ │ Phase › Chapter                      │ │  Phase track (vertical)       │
│  ▸ Player     ●○○ │ │ Title, why (markdown), genre tips    │ │   ✓ Concept        100%       │
│ ── Overview       │ │ [Open editor] [Show example] [Ask AI]│ │   ● Core systems    60%       │
│ ── Technical      │ │ [Mark done] [Skip]                   │ │   ○ Content         10%       │
│ ── Art & Audio    │ └──────────────────────────────────────┘ │   ○ Production       0%       │
│ ── Production     │ Ask AI ……………………………………… (inline box)    │  Editor coverage bars/group   │
│ ── QA             │ Tabs: Walkthrough | Hints (n) | AI chat  │  Next milestone (production)  │
│ ── Templates      │  Walkthrough = phases → chapters → steps │  Issues · hints counters      │
│ ── Custom         │  (collapsible, done steps dimmed)        │                               │
└───────────────────┴──────────────────────────────────────────┴───────────────────────────────┘
```

- **Left `EditorRail`** (`src/ui/workspace/EditorRail.tsx`): compact 32px rows, icon + title + tiny 3-dot/slim progress, collapsible groups, ★ for genre-relevant, filter box at top, active state; keyboard navigable. Reusable on `EditorPage` (collapsed to icons) for consistent navigation.
- **Center `GuideCenter`**: current-step hero card (the "Ask anything" box equivalent), inline AI prompt pre-filled from `aiPrompt`, tabs Walkthrough / Hints / AI. No genre yet → onboarding card "What are you making?" with the picker inline, base walkthrough below it.
- **Right `ProgressPanel`**: overall ring, phase track, per-group coverage bars, next milestone (from `production.milestones`), issues/hints counts. Plain SVG/CSS (Recharts optional); colours from existing CSS tokens; dark/light.
- Layout: CSS grid `240px minmax(0,1fr) 300px`; ≤1200px right pane moves under center; ≤800px left rail becomes a drawer button. Snapshots/autosave banners move to Settings › Data (banner stays as a one-line notice in center).
- Replaces the card grid on `Home.tsx`; "All editors" grid can stay reachable via the rail filter.
- **Decision to confirm:** keep the existing editor layout (section sidebar + HintPanel with Guide/AI) on `EditorPage`, only adding the collapsible rail — recommended, to avoid three side panels.

## 8. Delivery milestones (each shippable, narrow tests first)

| # | Scope | Main files | Tests |
|---|---|---|---|
| M1 | Always-shown groups; Overview always; ★ reasons kept | `modules/genres.ts`, `core/genre.ts`, `ui/pages/Home.tsx` | `genre.test.ts` |
| M2 | Settings page + redirects; move genre panel, language, snapshots, hints prefs, AI, sharing | `ui/settings/*`, `App.tsx`, `AppShell.tsx` | `render.test.tsx`, settings UI test |
| M3 | 3-pane workspace shell (rail + center placeholder using current ProjectGuide + progress panel from doc progress) | `ui/workspace/*`, `styles.css` | render + responsive snapshot |
| M4 | Walkthrough engine: types, Zod schema, compose, evaluate, `meta.guide` persistence + migration of localStorage ticks | `core/walkthrough/*`, `core/model/{types,schema}.ts`, `persistence/serialize.ts` | `walkthrough.test.ts`, `core.test.ts` round-trip |
| M5 | Base walkthrough content (~25 steps, 5 phases) wired into center + right panes; i18n chrome keys | `modules/walkthroughs/base.ts`, i18n | content schema test |
| M6 | Genre packs, one PR each: Survival, RPG, Action, Strategy, Simulation, Adventure, Roguelike, Sandbox (~10–20 steps each, notes on shared steps) | `modules/walkthroughs/<genre>.ts` | per-pack compose test |
| M7 | AI "ask about this step", step-focused hints, module-guide back-link | `ui/ai/*`, `core/hints/engine.ts`, `GuidePanel.tsx` | `ai.test.tsx`, hints test |
| M8 | HU translations of content, a11y pass, remove old `PROJECT_GUIDE_STEPS`/`ProjectGuide` | | full `npm test`, typecheck, lint, build |

Suggested order: M1 → M2 → M4 → M3 → M5 → M6 → M7 → M8 (the engine before the layout means the center/right panes are built on real data once).

## 9. Open decisions
1. Overview always shown too? (recommended: yes) <- Yes
2. 3-pane layout on the home page only, editors keep their own layout + collapsible rail? (recommended) <- Yes
3. Walkthrough progress (manual ticks/skips) shared in the project file vs personal? (recommended: shared) <- shared
4. Depth per genre pack: ~10–20 steps on top of the ~25-step base? Who reviews genre content?
5. Do we keep a "flat checklist" view for experienced users who don't want the teaching text? <- Yes
