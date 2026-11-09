# Motion Plan: minimal, eye-catching animation

Status: proposal · 2026-11-09 · builds on "Phase D: motion" in `src/styles.css` (≈ line 1174)

## 1. Where we are

The app already has a solid motion foundation:

- **Tokens:** `--ease-out` and `--dur-fast` (150 ms).
- **Keyframes:** `hoh-rise`, `hoh-fade`, `hoh-in-left` and `hoh-in-right`.
- **Tweening:** `@property --p` so the conic progress pies can tween.
- **Reduced motion:** one global `prefers-reduced-motion` kill switch.

What it lacks is **moments**. Every animation is ambient: hover colours, drawers and the landing rise. Nothing rewards the user for progress, which is the app's core loop (do a step, then see the plan grow). The guiding idea of this plan is:

> **Motion marks progress.** Quiet everywhere, and expressive for half a second when the user finishes something.

## 2. Principles (the rules every change must follow)

1. **Animate only `transform`, `opacity`, `clip-path`, stroke offsets and `--p`.** Never animate `width`, `height` or `top` directly. The existing `.mini-bar` width tween is the only exception and stays as it is.
2. **Three durations, two curves.** Add these tokens:
   - `--dur-med: 240ms` and `--dur-slow: 420ms`
   - `--ease-spring: cubic-bezier(.34,1.56,.64,1)`, for pops only
   - `--ease-in-out: cubic-bezier(.65,0,.35,1)`, for draws and sweeps

   No ad-hoc `.15s` or `.3s` literals in new rules.
3. **One signature moment per view at a time.** If a step completion is playing, nothing else on screen celebrates.
4. **Animate on change, never on mount.** Opening a page full of done steps must not set off 30 check pops. Changes are detected with a small hook (see §5).
5. **No infinite loops.** "Look here" cues run at most 3 times, and run again only when their subject changes.
6. **Brand colour is reserved for progress.** Amber (`--brand`) glows and bursts mean "you advanced". Accent blue is for navigation and focus.
7. **The global reduced-motion guard stays the single source of truth.** New rules need no per-rule media query. Content must already be in its final state without animation, which means using `both` fill and starting from a visible end state.

## 3. The work, in priority order

### P1: Progress moments (the eye-catchers)

| # | Moment | Where | What it does | Duration |
|---|---|---|---|---|
| 1.1 | **Step check pop** | `.walk-check` in `GuideCenter.tsx` `StepRow` | On `open → done` the circle scales .6 → 1.12 → 1 (spring) and fills with the phase colour. The ✓ is swapped for an inline SVG path that draws in with `stroke-dashoffset`. | 420 ms |
| 1.2 | **Hero hand-off** | `.step-hero` (`CurrentStep`) | It is already keyed by step and rises in. Add an exit: keep the old hero for 180 ms with `.leaving` (fade plus 6 px up), then mount the new one. The new hero's left border sweeps in with a `clip-path` from top to bottom. | 180 + 280 ms |
| 1.3 | **Ring count-up** | `ProgressRing` in `ProgressPanel.tsx` and the 15 % ring in the strip | The stroke already tweens. Add a number count-up from the old to the new % with `requestAnimationFrame` (about 400 ms, eased) so the digits and the arc move together. | 420 ms |
| 1.4 | **Phase-track sweep** | `.phase-track li>span` (coloured strip in the header) | When a segment's share grows, a 1-shot highlight (a white 0 → 30 % → 0 gradient) slides across that segment only. | 600 ms |
| 1.5 | **Phase complete** | `.walk-phase-node` / `.walk-phase.complete` | When a whole phase finishes, the node fills, then 6 small brand-coloured dots burst outward and fade. These are CSS-only pseudo-elements and `box-shadow` stacks, with no confetti library. This is the one "big" moment in the app. | 700 ms |
| 1.6 | **Rail pie fill** | `.rail-fill` in `EditorRail.tsx` | It already tweens `--p`. When it reaches 100 % it gets a single soft ring pulse (`box-shadow` 0 → 6 px → 0) in `--ok`. | 500 ms |

### P2: Feedback and state changes

| # | Item | Where | What it does |
|---|---|---|---|
| 2.1 | **Save status** | `.status` in `AppShell.tsx:113` | Crossfade "Unsaved" ↔ "All changes saved" by keying the span by state with `hoh-fade`. On save, a tiny check draws in before the text. Warn → ok colour already transitions. |
| 2.2 | **Badge bump** | `.badge` (Issues, Hints, hint panel) | Key the badge by its count. When the count increases, run a `hoh-pop` (scale 1 → 1.25 → 1, spring, 300 ms). When it decreases, do nothing. |
| 2.3 | **`.here-dot` breathe** | crumb and rail | The halo grows 3 px → 6 px and fades out, 3 iterations, re-run when the current step id changes (key). This tells the eye where "now" is without nagging. |
| 2.4 | **Hint cards stagger** | `.hint-group` children in `HintPanel.tsx` | `hoh-rise` with `animation-delay: calc(var(--i) * 40ms)`, capped at 6 items. Dismissing a hint fades it out and collapses it (`grid-template-rows: 1fr → 0fr`). |
| 2.5 | **Sticky progress strip** | `.progress-strip` (`styles.css:1122`) | It currently has no edge, so the hero text scrolls visibly through the gap above it (seen at 800 px). Add a background and a shadow that fade in once it is stuck, using `animation-timeline: scroll()` inside `@supports`. Browsers without it get a static shadow. |
| 2.6 | **Segmented thumb** | `.segmented` (Landing, LanguageSwitch, EditorPage, GuideCenter view toggle) | Replace the per-button background with one sliding thumb. A `<Segmented>` wrapper measures the pressed button and sets `--x`/`--w`, and `::before` translates in 240 ms. Most visible on the landing "Team · cloud / Local" switch. |
| 2.7 | **Landing panel resize** | `.landing-panel` | Switching cloud ↔ local currently jumps the card's height and vertical position. Crossfade the inner content (`key` by path) and let the panel height follow with `interpolate-size: allow-keywords` inside `@supports`. Elsewhere it snaps as it does today. |

### P3: Surfaces (enter and exit for things that pop over)

| # | Item | What it does |
|---|---|---|
| 3.1 | **Overlay plus palette / HelpPopup / ExamplePicker** | Backdrop `hoh-fade` 160 ms. The panel uses a new `hoh-zoom` (opacity 0 → 1, scale .97 → 1, translateY 4 px → 0), 200 ms. |
| 3.2 | **`<details>` menus** (`.menu>div`, `.split-menu`, `.doc-menu`) | `hoh-zoom` with `transform-origin: top right` (or left, matching the anchor). Open only, so the close stays instant. |
| 3.3 | **Collapsibles** (`.walk-phase`, `.walk-chapter`, `.hint-elsewhere`) | Smooth height via `::details-content` plus `interpolate-size` where supported. The current fade stays as the fallback. The chevron already rotates. |
| 3.4 | **Inspector** (`.inspector` in Collection, Graph and Canvas editors) | Selecting an item slides the inspector content in (8 px from the right, fade) keyed by the selected id, so switching items reads as a change. |
| 3.5 | **Editor section switch** | `.content` children keyed by section: `hoh-fade` 160 ms. No slide, because this is a work tool and switching must feel instant. |

### P4: Micro-interactions (cheap polish)

- **Press:** `button:active:not(:disabled){transform:scale(.97)}` with a 90 ms transition. Skip `.icon-btn` inside dense toolbars if it jitters.
- **Primary CTA:** the amber "Open planner" and the landing CTA lift 1 px on hover, and their shadow grows. On the landing CTA only, a single sheen passes across on first view (a diagonal highlight via `background-position`, run once).
- **Kanban / timeline drag:** `.small-card` and `.tl-bar` get, while dragging, `scale(1.02) rotate(-1deg)` plus a stronger shadow. The drop settles with a spring.
- **Graph nodes (xyflow):** a newly added node uses `hoh-zoom`. This needs a `data-new` flag cleared after 400 ms.
- **Landing illustration** (`WorkspaceIllustration.tsx`): animate the SVG once when it scrolls into view (IntersectionObserver). The ring draws to its value, the bars fill and the amber dot appears. This is a "living screenshot" that tells the product story in one second.

## 4. Explicitly out of scope

- Route-level page transitions on every navigation, which slow down a tool used many times a minute.
- Parallax, scroll-jacking, a cursor follower, particle backgrounds, and anything always moving.
- Motion libraries (Framer Motion and similar). Everything here is CSS plus about 40 lines of hooks. No new dependency and no CSP impact.
- Animating text inputs or the markdown preview.

## 5. Implementation notes

**New CSS** (append a "Phase E: moments" block after Phase D in `src/styles.css`):

```css
:root{--dur-med:240ms;--dur-slow:420ms;--ease-spring:cubic-bezier(.34,1.56,.64,1);--ease-in-out:cubic-bezier(.65,0,.35,1)}
@keyframes hoh-pop{0%{transform:scale(.6)}60%{transform:scale(1.12)}100%{transform:none}}
@keyframes hoh-bump{50%{transform:scale(1.25)}}
@keyframes hoh-zoom{from{opacity:0;transform:translateY(4px) scale(.97)}to{opacity:1;transform:none}}
@keyframes hoh-draw{from{stroke-dashoffset:var(--len,24)}to{stroke-dashoffset:0}}
@keyframes hoh-halo{from{box-shadow:0 0 0 0 color-mix(in srgb,var(--halo,var(--brand)) 55%,transparent)}to{box-shadow:0 0 0 8px transparent}}
@keyframes hoh-sweep{from{background-position:-100% 0}to{background-position:200% 0}}
@keyframes hoh-leave{to{opacity:0;transform:translateY(-6px)}}
.just-done .walk-check{animation:hoh-pop var(--dur-slow) var(--ease-spring) both}
.just-done .walk-check path{stroke-dasharray:24;animation:hoh-draw var(--dur-med) var(--ease-in-out) .12s both}
```

**New hook** in `src/ui/hooks.ts`:

```ts
/** True for `ms` after `value` changes, and false on first render, so mount never animates. */
export function useJustChanged<T>(value: T, ms = 600, when: (prev: T, next: T) => boolean = () => true): boolean
```

The hook drives `.just-done` on `StepRow` (when status goes `open` → `done`), `.bump` on badges (when the count increases), `.complete-burst` on a phase (when it was not complete and now is), and `.ring-pulse` on the rail fill.

**`useCountUp(n)`** gives the ring numbers a rAF tween and returns the final value immediately when `matchMedia('(prefers-reduced-motion: reduce)')` matches.

**Exit animation for the hero (1.2):** keep a `leaving` copy of the previous step in local state for 180 ms. Do not delay the store update, because undo/redo and persistence must stay immediate (CLAUDE.md: mutations only via `useStore.mutate`, and animation is view-only).

**Forced colours:** bursts, halos and sweeps are decorative. Set them to `display:none` or `animation:none` inside the existing `@media (forced-colors:active)` block.

## 6. Rollout

1. **PR 1 (tokens, hook, P1.1–1.3). Done 2026-11-09:** `useJustChanged` and `useCountUp` are in `src/ui/hooks.ts`, the CSS is in "Phase E: moments", and the tests are in `tests/motion.test.tsx`. This delivers the biggest perceived win with the smallest diff: check pop, hero hand-off and ring count-up.
2. **PR 2 (P1.4–1.6, P2.1–2.3). Done 2026-11-09:** `useNewlyAdded` is in `src/ui/hooks.ts`, and `Tick` and `CountBadge` are in `src/ui/motion.tsx`. Progress glow, save status, badges and the here-dot.
3. **PR 3 (P2.5–2.7, P3). Done 2026-11-09:** `useStuck` is in `src/ui/hooks.ts`, and `Segmented` and `AutoHeight` are in `src/ui/motion.tsx`. The landing panel uses a measured height (ResizeObserver) because `interpolate-size` cannot animate from one `auto` height to another. The sticky strip now pins flush to the top (`top: -padding`). Surfaces, the segmented thumb and the landing panel.
4. **PR 4 (P4). Done 2026-11-09:** `dragCue` is in `src/ui/motion.tsx`, and `useRevealOnce` is in `src/ui/hooks.ts`. Native drag-and-drop (kanban, 2D grid) uses an outline left behind, because the browser draws the drag image itself. Pointer drag (timeline) uses a lift. Graph nodes use the `scale` property because xyflow positions nodes with `transform`. Micro-interactions and the landing illustration.

## 7. Acceptance and checks

- **Tests:** a Vitest test for `useJustChanged`: false on mount, true after a change, false after `ms`, and the predicate is respected. A `StepRow` render test checks that `.just-done` is absent on mount and present after the status prop changes.
- **Manual:** mark 3 steps done in a row, and check the pops do not stack or jank. Complete a phase and check the burst plays exactly once. Reload with all steps done and check nothing animates.
- **Reduced motion:** with the OS setting on, every final state is correct and nothing moves (DevTools → Rendering → emulate).
- **Performance:** a DevTools Performance recording of a step completion shows no layout or paint storms, only composite layers. No long tasks over 50 ms are introduced.
- **Budget:** no single moment is longer than 700 ms, and interactive feedback (press, hover, menus) is 200 ms or less.
- `npm run typecheck`, `npm run lint` and `npx vitest run tests/<touched>` pass.
