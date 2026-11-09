# Workspace home and landing page: design critique and redesign plan

**Date:** 2026-11-09 | **Scope:** Home workspace (`/`, 3 panes: `EditorRail` · `GuideCenter` · `ProgressPanel`), landing and sign-in (`/welcome`, `Landing.tsx`, `SignInForm.tsx`), top bar (`AppShell.tsx`). Planner editors are **not** in scope.
**Method:** live preview at 1440×900 and 1024×768 (local mode, the "Hands of Hubris" sample), plus the source and `src/styles.css`.
**Builds on:** [DESIGN_CRITIQUE_FIX_PLAN.md](DESIGN_CRITIQUE_FIX_PLAN.md) (2026-11-07: contrast, focus, hint counts, top bar tidy). That plan fixed correctness and accessibility. This one covers **identity, hierarchy and flow**.

---

## Design critique: Workspace home (3 panes)

### Overall impression
It's capable, honest and accessible, but it looks like a generic dark admin template. Nothing says "game design". The biggest opportunity is focus: the page asks for one next action ("Write the pitch"), yet five blue filled controls, three progress readouts and a 33-row list all compete with it.

### Usability
| Finding | Severity | Recommendation |
|---|---|---|
| **At ≤1024 px the Progress pane drops below a ~2300 px walkthrough** (measured at y≈2383). On a laptop it is effectively gone. | 🔴 Critical | Below 1200 px, collapse Progress into a compact **progress strip** at the top of the center column (ring + phase track, one line), with the full panel as a drawer or popover. |
| Genres "Not set" is a prerequisite for the recommended rail and the walkthrough, but it shows as a slim row with an equally loud "Choose genres" button. | 🟡 Moderate | When no genre is set, make it **step 0 of the Next-step card** ("Pick your genre → tailors 30+ planners"). Once set, show it as a quiet chip next to the H1 ("RPG · Survival ✎"). |
| The Next-step card nests a "Tips for this step" card with its own primary **Go** button. The tip ("Write the vision first") points at the same planner as the step, so the user sees two routes to one place. | 🟡 Moderate | One primary per card. Show tips as an inline note without a button. If a tip targets the same doc as the step, merge it into the step text. |
| The Walkthrough / Hints / AI tabs sit halfway down the page, under the hero card. Hints count "3" also appears in the top bar and at the bottom of the Progress pane. | 🟡 Moderate | Move the tabs **above** the Next-step card (the card belongs to the Walkthrough tab), or turn Hints and AI into side sheets. Keep **one** hint count: the top bar's. |
| The walkthrough is 33 identical bordered rows (2334 px of scroll). Done, current and todo differ only by a small check icon. | 🟡 Moderate | Collapse finished phases and finished chapters into one summary line ("Concept · 4/6 ✓"). Make the current chapter open; future phases closed. Remove per-row borders: use a vertical **journey line** with nodes. |
| Phase dots in the Progress pane are all the same blue "active" state because every phase has *some* progress. The indicator carries no information. | 🟡 Moderate | Show state by shape and fill (○ todo, ◐ in progress, ● done) plus the % bar. Highlight only the phase that holds the current step. |
| The Progress pane shows two different measures, walkthrough % (ring, 15%) and planner fill % (coverage), with no explanation. "0 skipped" is noise. | 🟢 Minor | Label the ring "Walkthrough". Title the coverage block "Document fill". Hide counts that are 0. |
| Rail titles truncate at 248 px ("Town Management …", "Time, Weather & Eve…", "Combat, Enemies & …"). The 28 px fill meters can only be read through a tooltip. | 🟢 Minor | Rail 264–272 px. Allow two-line titles (`line-clamp:2`). Replace the meter with a 3-state glyph (empty / started / solid) or a thin underline bar across the full item width. |
| The rail doesn't show where the current walkthrough step lives. | 🟢 Minor | Put an accent dot on the rail item that owns the current step ("you are here"). |

### Visual hierarchy
- **What draws the eye first:** the blue **Choose genres** button (top right of the center column), then the blue-bordered Next-step card. ❌ The step title "Write the pitch" should come first.
- **Reading flow:** H1 → genres row → card → nested tip card → tabs → list. The eye zig-zags between left buttons and right buttons, and the generic H1 "What do you want to plan?" takes the top spot from the project.
- **Emphasis:** the accent blue is overloaded: primary buttons, active toggles (Guided), tab underline, links, current-step border, phase dots, focus rings and the Save button all share it. Nothing reads as special. Three panels with the same `--panel` background and 1px borders give the page no foreground or background.

### Consistency
| Element | Issue | Recommendation |
|---|---|---|
| Icons | Emoji in the rail (🌍🏰🗡️…) next to the line `Icon` set in the top bar and tabs. Emoji render differently on each OS and add colour noise. | One line icon per module (extend `Icon.tsx`; `module.icon` becomes an icon name, emoji kept as fallback). |
| Typography | `system-ui` only. Section labels are 11–12 px uppercase muted in the rail, the Progress pane and the card ("NEXT STEP · CONCEPT"), so headings and metadata look alike. | Add a display face for H1, H2 and numbers (see Identity). Use the uppercase eyebrow style for metadata only, not for section headings. |
| Radii and borders | Mix of 6 and 8 px radii. Every container has a border, including list rows inside bordered cards. | Tokens `--radius-sm:6px`, `--radius-md:10px`. Borders only on interactive or elevated surfaces. Separate the rest with spacing and surface tone. |
| Segmented controls | Guided/Checklist and the Visual/Markdown toggle reuse `button.active` (the primary fill). | A `.segmented` component: tinted track, raised selected chip, no primary fill. |
| Progress visuals | Ring (stroke accent), coverage bars (green 4 px), rail meters (green 4 px), phase dots (blue): four styles for one idea. | One progress language: phase colour plus a fill track, used in the rail, the Progress pane and the walkthrough. |

### Accessibility
- **Color contrast:** body and muted text pass (muted `#8b93a5` on `--panel` ≈ 5.2:1). The 11 px uppercase labels pass on ratio but are hard to read. Use a 12 px minimum with `letter-spacing:.06em`.
- **Color-only state:** phase dots and the rail meter. Add shape and text (see above).
- **Touch targets:** rail items are 30 px tall (fine for desktop). The "…" next to "Go" and the ring's links at the bottom ("0 issues 3 hints") are small inline links. Make them 28 px+ buttons.
- **Readability:** 14 px body with 1.45 line height is fine. Walkthrough step text is 13 px. Raise it to 14.

### What works well
- A clear mental model: plan (left) · do (center) · measure (right) matches how a planner works.
- The Next-step card with **Open planner / Ask AI / Mark done / Skip** is a good guided-workflow primitive. Keep it as the hero.
- Genre-aware rail ("recommended for…"), collapsible groups, filter and the drawer on narrow screens.
- The accessibility work so far is solid: focus rings, `aria-expanded`, labelled meters, reduced motion.

---

## Design critique: Landing and sign-in (`/welcome`)

### Overall impression
Clean and trustworthy, but anonymous. At 1440×900 the content fills the top ~45% of the screen and leaves the rest an empty black field. There is no visual of the product, no brand mark and no game-design flavour, so it could be the landing page for any SaaS.

### Usability
| Finding | Severity | Recommendation |
|---|---|---|
| No product visual. The best selling point, the guided 3-pane workspace, is never shown. | 🔴 Critical | A hero visual: a stylised (not literal) screenshot or illustration of the workspace with the journey line and phase colours. Static image/SVG in `public/`, CSP-safe. |
| The disabled **Send sign-in link** button is the most saturated element on the page, but at `opacity:.4` it reads as broken. | 🟡 Moderate | Keep it enabled-looking and validate on submit with an inline error, or use a neutral disabled style (outline, not a faded fill). |
| The two paths, *sign in* and *use without an account*, have no visible priority. Local mode is a real first-class path (offline, portable), yet it sits as a plain grey button under an `<hr>`. | 🟡 Moderate | Present them as two equal choices: **"Work with a team" (cloud)** and **"Start locally — no account"**, each with a one-line promise. Or set the default by audience: students and solo devs go local. |
| No privacy, terms or imprint link next to an e-mail collection form (EU audience, Hungarian locale). | 🟡 Moderate | Footer with Privacy, Terms, version, GitHub/contact, plus one line by the form: "We only use your e-mail to sign you in." |
| After "Check your e-mail" there is no resend timer and no "open Gmail/Outlook" shortcut. | 🟢 Minor | A resend button with a 60 s cooldown and the address shown in bold, with a "wrong address?" link (exists: `useOther`). |
| The language toggle shows only the *other* language ("Magyar"), which isn't clearly a language switcher. | 🟢 Minor | A globe icon plus "EN / HU" segmented control. |

### Visual hierarchy
- **What draws the eye first:** the faded blue button in the sign-in panel. ❌ It should be the headline and the hero visual.
- **Reading flow:** H1 → lead → four identical cards → (jump right) sign-in. The four feature cards have equal weight and no icons, so they read as a block of text.
- **Emphasis:** the H1 "Plan your game, together" is 32 px, about the same weight as the panel heading. It should dominate.

### Consistency
| Element | Issue | Recommendation |
|---|---|---|
| Brand | Text-only "Game Design Planner" in both the landing header and the top bar. No mark. | Wordmark plus a simple glyph (e.g. a die/blueprint hybrid), reused as the favicon and the top-bar home link. |
| Cards | Feature cards use the same `--panel` box as the app, so marketing and app look identical. | Give the landing its own richer surface: a blueprint grid background, a large display type scale, generous spacing. |

### Accessibility
- **Contrast:** lead and muted text pass. The "New here?…" small print is 12 px muted (passes). Raise it to 13 px.
- **Form:** label is linked, `autoComplete="email"`, `role="alert"` on error ✓. Add `aria-busy` on submit, and move focus to the "Check your e-mail" heading on success.
- **Targets:** "Magyar" is a `button.small` (24 px). Make it 32 px on the landing page.

### What works well
- Passwordless sign-in, plus "the same link creates your account": low friction and clearly explained.
- An honest local-mode promise ("Work in this browser only; save and open project files yourself").
- Safe `next` handling and a calm, readable layout that collapses well.

---

## Design direction: "The Design Bench"

The aim is a look that is **professional** (calm, dense, keyboard-first) and **unique** to game design. It should feel like a designer's blueprint and notebook, not a generic dashboard.

| Token / idea | Proposal |
|---|---|
| **Palette** | Stay dark, but warmer and with more depth: `--bg:#111316`, `--surface-1:#171a1f`, `--surface-2:#1e2229`, `--surface-3:#262b34`. Replace the generic blue identity accent with a **signature ember/amber** (`--brand:#f2a541`, strong `#c97f17` for filled with dark text, ≥4.5:1), used *only* for "you are here / next action". Keep a cool blue (`--accent`) for links and focus. |
| **Phase colours** (the unifying system) | Concept `#b08cff` · Core systems `#5b9cff` · Content `#3fc6a5` · Production `#f2a541` · Polish & ship `#ff7a8a`. Used in the rail group markers, the walkthrough journey line, the Progress phase track and coverage. Each one is paired with a label, so colour is never the only cue. |
| **Typography** | Self-hosted display face for headings and numerals (e.g. *Space Grotesk* or *Bricolage Grotesque*, served from `/fonts`, CSP-safe, `font-display:swap`), `system-ui` for body. Tabular numerals for all percentages. Scale: 12 / 13 / 14 / 16 / 20 / 28 / 40. |
| **Texture** | A faint blueprint grid (CSS `background-image` gradients, 24 px) on the landing hero and the empty center states only. |
| **Signature component** | **Journey line**: a vertical line in the phase colour with step nodes, replacing bordered rows in the walkthrough and mirrored as a horizontal phase track in Progress. |
| **Icons** | One consistent 1.5 px line icon set for all modules (replaces emoji). |
| **Motion** | 150 ms ease-out on hover and selection. The ring and bars animate on change. Everything is off under `prefers-reduced-motion`. |

---

## Implementation plan

Each phase ships on its own. Stack rules from `CLAUDE.md` apply: plain CSS, i18n (en + hu) for every string, narrowest checks first (`npx vitest run tests/render.test.tsx`, `npm run typecheck`, `npm run lint`). Before/after screenshots go in `plans/design-critique/`.

### Phase A — Foundations: tokens and identity (CSS, low risk) ✅ done 2026-11-09

Implementation notes:
- **Tokens:** `--surface-0…3` (`--bg`/`--panel`/`--panel2` now alias them), `--line-strong`, `--brand`/`--brand-strong`/`--on-brand`, `--phase-*`, `--radius-xs/sm/md/pill` (all literal 4/6/8/10/999 px radii in `styles.css` now use them; 8 → 10 px), `--space-6/7`, `--fs-2xl…4xl`, `--font-body`/`--font-display`, `--ease-out`/`--dur-fast`. The hard-coded `#14161a` ink became `var(--surface-0)`. Brand amber is defined but **not used on controls yet**: Phase B decides where "you are here" goes.
- **Font:** `@fontsource-variable/space-grotesk` (npm) is imported in `main.tsx`, not hand-copied into `public/fonts`. Vite bundles the woff2 files as same-origin assets (latin 22 kB, latin-ext 19 kB), so the production CSP (`default-src 'self'`) is unchanged. Applied to `h1`, `h2`, `.brand`, `.display`, `.num`, `.ring-text` (tabular numerals).
- **Brand:** `src/ui/BrandMark.tsx` (isometric block glyph) in the top bar, on the landing and projects pages, and as `public/favicon.svg`. Below 1100 px only the glyph shows; the name hides instead of the whole brand.
- **Icons:** 38 line icons in `Icon.tsx`. `src/ui/ModuleIcon.tsx` maps module id → icon (UI side, so module definitions and the Markdown export keep their emoji, which also serve as fallback). Used in the rail, the editor sidebar title and the Ctrl K palette.
- **`.segmented`:** Guided/Checklist and Visual/Markdown (state from `aria-pressed`, new i18n key `editor.viewLabel`).
- **Tests:** `tests/tokens.test.ts` (contrast of every token pair) and `tests/icons.test.ts` (every module has an existing icon).
1. **Token refresh** in `src/styles.css :root`: surfaces 1–3, `--brand`/`--brand-strong`, `--phase-*`, `--radius-sm/md`, type scale `--fs-2xl:20px --fs-3xl:28px --fs-4xl:40px`, `--font-display`. Map the old tokens onto the new ones so nothing breaks. **Done when:** a contrast script over token pairs passes 4.5:1 for text and 3:1 for UI.
2. **Display font:** add the woff2 files to `public/fonts/`, plus `@font-face` and a preload in `index.html`. Check that the production CSP `font-src 'self'` still holds.
3. **Brand mark:** an SVG wordmark and glyph in `public/`, used by `.brand` (AppShell, Landing) and as the favicon.
4. **Module icons:** extend `Icon.tsx` with about 30 line icons and add an `iconName` to module definitions (`src/modules/*.ts`, `registry.ts`). The rail renders `<Icon>` and falls back to the emoji. **Done when:** the rail, palette and editor sidebar show no emoji.
5. **`.segmented` component** for Guided/Checklist (and later Visual/Markdown), so it no longer reuses `button.active`.

### Phase B — Workspace home: focus and hierarchy ✅ done 2026-11-09

Implementation notes:
- **Header** (`Home.tsx`): eyebrow "Game design workspace", project name as H1, genre chip + "Edit genres" (when set), "Edited …" date, one-line goal. The H1 "What do you want to plan?" and the unused keys `home.title` and `workspace.progressLine` are gone.
- **Genres not set** → `GenreSummary` renders a dashed "Step 0 · Setup" card at the top of the Walkthrough tab, with a plain (not primary) "Choose genres" button.
- **Hero** (`GuideCenter.tsx` `CurrentStep`): phase-colour left edge and wash (`data-phase`), amber "you are here" dot in the eyebrow, 24 px display title. **Open planner is the one filled action, in brand amber**; Ask AI / Mark done / Skip are `.ghost`. Step tips are notes (`StepNote`) with no buttons. A note links out only when its hint points at a *different* planner; snooze/dismiss stay in the Hints tab.
- **Tabs** sit above the hero, with icons. The hint-count badge was removed from the tab and from the Progress pane (top bar only).
- **Journey line:** phases and chapters are `<details>` with `done/total` counts. The phase holding the current step is open; others are closed; finished chapters are closed. Hand toggles stick for the visit. Steps hang off a vertical line in the phase colour; done = filled phase-colour node, skipped = dashed, current = amber ring. Steps stay in the DOM when folded (tests and Ctrl F still find them). Sample center column: **2334 → 1323 px**. That misses the < 1200 px target by the height of the Step 0 card; with genres set it is shorter.
- **Rail:** 268 px, two-line titles, the 28 px bar replaced by a 12 px fill pie (`role="img"` with the % label), amber dot plus sr-only "Current step" on the planner that holds the current step. **Not done:** phase-colour group markers. Rail groups (Overview, Game Design, Technical…) don't map onto walkthrough phases, so colouring them would be misleading.
- **Progress pane:** phase dots show state by shape (ring / pie / solid / dashed) plus sr-only state text, and the current phase is marked. Values are `finished/total`. "Planner coverage" became "Document fill". "0 skipped" is hidden. The issues link shows only when there are issues.
- **≤1200 px:** `ProgressStrip` (mini ring, current phase, "x of y steps done", phase track, Details) sticks to the top of the center column. Details opens the pane as a right drawer (backdrop, Escape, focus to the close button and back).
- **Tests updated:** `render.test.tsx` and `cloudUi.test.tsx` now look for the new header eyebrow.
1. **Header:** replace the H1 "What do you want to plan?" with the project (name, genre chips, last edited) and a one-line goal. Genre "Not set" becomes step 0 in the Next-step card (`GuideCenter.tsx`, `GenreSummary`).
2. **Next-step card as the hero:** a phase-colour left edge, "Phase › Chapter" eyebrow, 20 px display title, one `primary` (Open planner) plus ghost buttons. The tips become an inline note with no Go button, and tips aimed at the same doc are merged (`GuideCenter.tsx`).
3. **Tabs above the card:** Walkthrough | Hints | AI move above the hero. Remove the hint count from the Progress pane bottom links.
4. **Journey-line walkthrough:** no per-row borders. Finished phases and chapters collapse into one summary line, the current chapter is open, future phases are closed (`GuideCenter.tsx`, CSS `.walk-*`). **Done when:** the Hands of Hubris sample's center column is under 1200 px tall by default.
5. **Rail:** 268 px, two-line titles, phase-colour group markers, a 3-state fill glyph, and a "current step" dot (`EditorRail.tsx`).
6. **Progress pane:** ring labelled "Walkthrough", a horizontal phase track with ○◐● states, "Document fill" coverage in phase colours, zero counts hidden (`ProgressPanel.tsx`).
7. **Responsive:** from 1200 px down, Progress becomes a sticky one-line **progress strip** at the top of the center column, with "Details" opening the full panel as a drawer that reuses the rail-drawer pattern. Keep the brand glyph visible at all widths. **Done when:** at 1024×768 the walkthrough % and the current phase are visible without scrolling.

### Phase C — Landing and sign-in ✅ done 2026-11-09

Implementation notes:
- **Layout** (`Landing.tsx`, CSS block `.landing*`): hero (amber eyebrow "For solo developers, students and small teams", 40 px display headline, lead, 3 icon bullets: planners, genres, portable data) next to the auth card. Below: `WorkspaceIllustration.tsx`, an inline SVG sketch of the 3-pane workspace in the app palette (no image request, CSP-safe; a sketch, not a screenshot). The page has a warm radial wash and a faded 24 px blueprint grid. Stacks to one column at ≤860 px with no horizontal overflow at 375 px.
- **Copy:** headline "From pitch to ship plan, one guided design doc" (hu: "A pitch-től a kiadási tervig, egy vezetett tervdokumentumban"). New lead and planners bullet. Not run through `/design:ux-copy`; worth a pass.
- **Two paths:** a segmented "Team · cloud" / "Local · no account" switch in the card, remembered in `hohplan:landingPath`. Only the chosen path shows, so each has exactly one primary button. Local: "Start locally" + primary "Use without an account" + "You can sign in later and upload the project." Signed-in users get "Go to your projects" plus a ghost local option.
- **Sign-in form:** the button is no longer disabled while the address is empty (the browser's `required`/`type=email` check explains instead), `aria-busy` while sending, and a privacy line under the button. On success, focus moves to "Check your e-mail", the address is bold (`<Trans>`, key `cloud.signIn.sentTo` now has `<0>` tags), and "Send again" has a 60 s countdown. With Turnstile enabled the resend button is hidden (tokens are single use), and "Use another address" returns to the form.
- **Language:** `LanguageSwitch.tsx`, a globe plus EN/HU segmented control, 32 px targets, each option named in its own language.
- **Footer:** app name, version (`APP_VERSION`), "Works offline", plus **Privacy / Terms links only when `VITE_PRIVACY_URL` / `VITE_TERMS_URL` are set** (absolute http/https only; added to `.env.example`). No legal pages were written. ⚠️ Set these before a public EU launch.
- **Tests:** `cloudUi.test.tsx` uses the new headline and the local segment, plus new tests for focus/bold address/resend cooldown and the remembered path.
1. **Layout:** full-height hero. On the left, a 40 px display headline, the lead, and 3 feature bullets with icons. On the right, the auth card. Below, the workspace illustration (SVG/WebP, lazy) on the blueprint grid, then a footer (Privacy · Terms · version · language).
2. **Two clear paths:** segmented "Team (cloud)" / "Local (no account)" choice cards in the auth card. The local path gets a primary-weight button.
3. **Sign-in form:** neutral disabled style or validate-on-submit, `aria-busy`, focus moves to the success heading, and resend with a 60 s cooldown (`SignInForm.tsx`).
4. **Language switch:** EN/HU segmented control with a globe icon. Targets ≥32 px.
5. **Copy:** a stronger headline, e.g. "From pitch to ship plan — one guided design doc." Run it through `/design:ux-copy` and update `en.json` and `hu.json`.

### Phase D — Polish and verification ✅ done 2026-11-09

Implementation notes:
- **Motion** (CSS block "Phase D: motion"): 150 ms colour/border/shadow transitions on interactive elements. Bars and fill pies animate (`@property --p` makes the conic fills tweenable). The hero card is keyed by step, so finishing a step brings the next one in with a short rise. Folded content fades in, drawers slide (progress from the right, rail from the left), and landing sections rise in. **One global `prefers-reduced-motion` block** neutralises all animations and transitions, including older ones.
- **Forced colours:** state-carrying fills (bars, phase track, rail pies, phase dots/nodes, step checks, here-dot, ring, hero edge and CTA, selected tab) map to `Highlight`/`CanvasText`/`Canvas`/`GrayText` so they don't vanish in Windows contrast themes. Checked by code review only; the preview can't emulate `forced-colors`.
- **Light OS:** checked with `prefers-color-scheme: light`. The app is dark-only by design (`color-scheme: dark`) and renders identically, form controls included.
- **Keyboard:** tabbed through the top bar → rail → center tabs → setup → hero actions → view switch → journey, and through the landing page (language → path → e-mail → send). Every stop shows a focus ring, the order follows the layout, and folded phases are skipped.
- **Found while checking:** "Edited …" showed the page-load time for a freshly seeded project (local mode starts from `createProject()`). It now shows only once `updatedAt` differs from `createdAt`.
- **Screenshots** in `plans/design-critique/`: `landing-before-1440`, `workspace-before-1440`, `workspace-before-1024` (taken at the start of the session, before Phase A) and `landing-after-1440/375`, `workspace-after-1440/1024/375`. There are no render snapshot tests in the repo, so these are the visual record.
- **Docs:** `.claude/skills/coding-conventions/SKILL.md` has a new "UI design system" section (tokens, colour roles, one primary per view, `.segmented`, icons, motion and forced-colour rules).

### Still open
- The center column is 1323 px with genres unset (target < 1200 px).
- The new landing copy (en + hu) hasn't had a `/design:ux-copy` review.
- Set `VITE_PRIVACY_URL` / `VITE_TERMS_URL` before a public launch.
- Not done: phase-colour markers on rail groups (no honest mapping from groups to phases).
1. Motion pass (hover, ring and bar transitions, drawer slide), all guarded by `prefers-reduced-motion`.
2. Forced-colours and light-OS checks. Keyboard pass through the rail, tabs, hero card and auth card.
3. Before/after screenshots at 1440, 1024 and 390 px into `plans/design-critique/`, and update `tests/render.test.tsx` snapshots.
4. Update `.claude/skills/coding-conventions` with the new tokens and the `.segmented` and journey-line components.

### Priority recommendations
1. **Make the next action the only loud thing** (B1–B3): one primary per view, the brand accent reserved for "you are here", tabs above the hero. This is the biggest gain in clarity for the least work.
2. **Fix the laptop layout** (B7): at ≤1200 px, progress is currently lost below the walkthrough.
3. **Give it an identity** (A1–A4, C1): signature accent, phase colours, display type, line icons and a hero visual turn a generic dark dashboard into a recognisable game-design tool.
