# Light mode: theme plan

**Status:** Implemented (see “Implementation notes” at the end) | **Date:** 2026-11-09 | **Area:** [src/styles.css](../src/styles.css), [index.html](../index.html), settings, chart/diagram views

## Goal

Add a **Light** theme next to today's dark theme (which stays the default look and gets no visual changes). The user picks **System / Light / Dark**. Light mode must:

- meet **WCAG 2.1 AA**: body text ≥ 4.5:1, large text and UI parts (borders of inputs, focus rings, chart marks, icons) ≥ 3:1
- look calm and warm rather than clinical: off-white canvas, white cards, soft cool-grey lines, the existing blue accent and amber brand kept but darkened enough to read
- cover the whole app: the shell, every editor, charts (Recharts), graphs (React Flow), Mermaid, the explainer diagrams and the landing page

## 1. Where things stand

- **Good:** almost everything goes through CSS custom properties in the first `:root` rule of `styles.css` (~775 `var(--…)` uses). Swapping that token set does most of the work.
- **The dark theme is fixed:** `color-scheme:dark` in `:root`, `<meta name="theme-color" content="#111316">`, `colorMode="dark"` in [GraphEditor.tsx:219](../src/ui/editors/GraphEditor.tsx), Mermaid `theme: 'dark'` in [mermaid.ts](../src/ui/markdown/mermaid.ts).
- **Hardcoded colours that will break on white** (need a token or a check):
  - `styles.css` outside `:root`: ~84 literals. `#fff` on `--accent-strong`/`--danger-strong` is fine in both themes. Problems: `#111` text on fixed pastel fills (`.tb-marker`, `.rs-seg`, `.wd-via`, `.npc-share`, `.npc-stage-label`) is fine; dark-only overlays and glows (`#0008`, `#0006`, `rgba(0,0,0,.45…)`, `0 40px 80px -40px #000`) are too heavy on light; tinted fills tuned for dark (`#5b9cff22`, `#e5b45533`, `#24432f`, `#22324a`, `#0d0f13`) look muddy on light.
  - TSX: ~300 literals in ~25 files. Biggest: [concepts.tsx](../src/ui/guides/concepts.tsx) (63), worldViews (21), npcViews (17), storyViews (15), [WorkspaceIllustration.tsx](../src/ui/cloud/WorkspaceIllustration.tsx) (15, a full copy of the dark palette), architecture/player/item/difficulty/combat views. The shared series palette `PALETTE` in [views.tsx:15](../src/ui/editors/views.tsx) is copied in several views.
  - Recharts: `CartesianGrid stroke="#334"`, default white-on-light `Tooltip`, `stroke="#aaa"` reference series.
  - [BrandMark.tsx](../src/ui/BrandMark.tsx): `#8a5a12` side face and a `#111316` outline.
  - Module guides (`src/modules/guides/*.ts`) have colour values in **seed/example data**. Those are project data, not UI: leave them alone.
- **Not affected:** the wireframe export in [core/ui.ts:599](../src/core/ui.ts) already draws on light (`#f4f5f7`); user-picked colours (`type=color`) are data.

## 2. Light palette (contrast checked)

Ratios are computed against `--panel` (#fff) / `--bg` / `--panel2` / `--surface-3`. Every text token stays ≥ 4.5:1 on all four surfaces unless marked.

| Token | Dark (today) | **Light** | Contrast in light |
|---|---|---|---|
| `--surface-0` / `--bg` | #111316 | **#f6f7f9** | canvas |
| `--surface-1` / `--panel` | #171a1f | **#ffffff** | cards, top bar, sidebar |
| `--surface-2` / `--panel2` | #1e2229 | **#eef0f4** | inputs, chips, hover |
| `--surface-3` | #262b34 | **#e3e6ec** | pressed / selected |
| `--line` | #30353f | **#d5d9e1** | decorative dividers (1.4:1, not used alone to mark controls) |
| `--line-strong` | #3d4350 | **#a9b0bd** | 2.2:1 |
| `--control-border` *(new)* | = `--line` | **#7f889b** | ≥ 3:1 on every surface, input/button outlines (AA non-text) |
| `--text` | #e6e8ee | **#1b1f27** | 16.5 / 15.4 / 14.5 / 13.2 |
| `--muted` | #8b93a5 | **#5a6275** | 6.1 / 5.7 / 5.4 / 4.9 |
| `--accent` | #5b9cff | **#1a5fcc** | 5.9 → 4.7 on surface-3 |
| `--accent-strong` | #2f6fd6 | **#1a56b8** | white on it 6.9 |
| `--danger` | #e5586b | **#c0283f** | 5.8 / 4.6 |
| `--danger-strong` | #c23a4e | **#b3233b** | white on it 6.5 |
| `--ok` | #4cc38a | **#11704a** | 6.1 / 4.9 |
| `--warn` | #e5b455 | **#8a5a00** | 5.9 / 4.7 |
| `--secondary` | #8b6cf0 | **#6a48d6** | 6.0 / 4.8 |
| `--secondary-strong` | #6b4fd8 | **#5a3bc4** | white on it 7.4 |
| `--brand` | #f2a541 | **#f2a541** (unchanged, fills only) | `--on-brand` text on it 8.0 |
| `--brand-strong` | #c97f17 | **#b56a06** | graphic 4.2 |
| `--brand-text` *(new)* | = `--brand` | **#9a5800** | 5.6 / 4.5, for any amber *text* |
| `--on-brand` | #111316 | **#1b1f27** | |
| `--phase-concept` | #b08cff | **#7a4fd6** | 5.4 |
| `--phase-systems` | #5b9cff | **#1a5fcc** | 5.9 |
| `--phase-content` | #3fc6a5 | **#0b7562** | 5.6 / 4.5 |
| `--phase-production` | #f2a541 | **#975800** | 5.7 / 4.5 |
| `--phase-polish` | #ff7a8a | **#c23652** | 5.3 |
| `--scrollbar-thumb` | #8999b2 | **#9aa3b5** | |
| `--overlay` *(new)* | #0008 | **#1b1f2766** | modal scrim |
| `--shadow-color` *(new)* | #000 | **#1b1f2726** | soft card/landing shadows |

Series palette for charts (new tokens `--series-1…7`, replaces `PALETTE`), each ≥ 3:1 on white for marks:
dark keeps `#4f9cf9 #f97b4f #53c28b #d86be0 #f2c94c #5ad1d1 #e5707e`; light uses **`#2f6fd6 #d0571f #178a57 #a83fb5 #a77a00 #0f8a8a #c43c50`** (3.9–5.2:1).

Translucent tints (`--accent-tint`, `--danger-tint`, `--warn-tint`, `--ok-tint`) are new tokens: in dark they keep today's `#5b9cff22`-style values; in light they become ~12% of the light hue over white (e.g. `#1a5fcc1f`) so selected rows and badges stay pastel instead of grey.

Feel: cool neutral greys with a hint of blue (matches the accent), pure-white cards lifted off a slightly darker canvas by a 1px line plus a very faint shadow, amber brand as the only warm note.

## 3. Mechanism

1. **Theme attribute.** `<html data-theme="light|dark">`. Dark values stay in `:root` (the default); light values go in `:root[data-theme="light"]{…; color-scheme:light}`. No other CSS rule should need to know the theme.
2. **Preference** `hohplan:theme` in `localStorage` = `system | light | dark` (same pattern as `hohplan:lang` in [core/i18n/index.ts](../src/core/i18n/index.ts)). New `src/core/theme.ts`: `getThemePref()`, `setThemePref()`, `resolveTheme()` (reads `matchMedia('(prefers-color-scheme: light)')` for `system`), `applyTheme()` sets the attribute and updates `meta[name=theme-color]`, and a listener re-applies when the OS setting changes while on `system`.
3. **No flash of the wrong theme.** The CSP has no `'unsafe-inline'` in `script-src`, so no inline script in `index.html`. Instead call `applyTheme()` as the **first line of [main.tsx](../src/main.tsx)**, before React renders (module scripts run before first paint of `#root` content). Keep the dark `theme-color` meta as the HTML default.
4. **React hook** `useTheme()` (via `useSyncExternalStore`) for components that must pass a colour to a library: React Flow `colorMode`, Mermaid theme, Recharts.
5. **UI control:** a `ThemeSwitch` built like [LanguageSwitch.tsx](../src/ui/LanguageSwitch.tsx) (`Segmented`, three buttons with sun / moon / monitor icons, `aria-pressed`), placed in Settings → General and in the top-bar overflow menu. Strings in both `en` and `hu`.

## 4. Work steps

1. **Tokens** – in `styles.css` add the light block (table above) and the new tokens (`--control-border`, `--brand-text`, `--overlay`, `--shadow-color`, tints, `--series-*`) with dark values that reproduce today's look exactly.
2. **Sweep `styles.css` literals** – replace the dark-only literals (scrims, shadows, `#…22`-style tints, `#24432f`/`#22324a`/`#0d0f13` backgrounds) with tokens. Leave `#fff` on strong fills and `#111` on fixed pastel fills; spot-check each against both themes.
3. **Theme core** – `src/core/theme.ts`, call in `main.tsx`, `useTheme()` hook.
4. **Libraries** – React Flow `colorMode={theme}`; Mermaid: initialise with `theme: 'default'` or `'dark'` from the resolved theme and **include the theme in the render cache key** (or clear the cache and re-init on change); Recharts: `CartesianGrid stroke="var(--line)"`, axis ticks `fill: var(--muted)`, `Tooltip` `contentStyle` on `--panel`/`--line`/`--text` (one shared props object in `views.tsx`).
5. **TSX literals** – swap `PALETTE` and the copies in world/npc/story/architecture/player/item/difficulty/combat/trade/diplomacy/timeWeather/coding/dataDriven views to `var(--series-n)` / semantic tokens (SVG `fill`/`stroke` accept `var()`). [concepts.tsx](../src/ui/guides/concepts.tsx) and [WorkspaceIllustration.tsx](../src/ui/cloud/WorkspaceIllustration.tsx) read from tokens instead of their own copies. BrandMark: side face → `var(--brand-strong)` darkened via a new `--brand-shade`, outline → `var(--text)`. Where a colour must be a real value in JS (e.g. canvas APIs), read it with `getComputedStyle` keyed on `useTheme()`.
6. **Theme switch UI** + i18n keys.
7. **Polish pass** – focus ring visible on white (`--accent` at 2px works, 5.9:1), selected/hover states distinguishable from `--panel2`, disabled opacity `.4` still readable enough on light (may need `.5`), landing page gradient grid and hero.

Steps 1–3 alone already give a usable light mode for most screens; 4–5 fix the visual editors.

## 5. Verification

- **Unit:** `tests/theme.test.ts` – pref parsing, `system` resolution with a mocked `matchMedia`, attribute + meta update, invalid stored values fall back to `system`.
- **Contrast guard:** a test that parses both token blocks from `styles.css` and asserts the ratios in §2 (text tokens ≥ 4.5 on `--bg/--panel/--panel2`, `--control-border`/series ≥ 3 on `--panel`, white on `*-strong` ≥ 4.5). This stops future palette edits from regressing.
- **No new literals:** a lint-style test that fails on new hex colours in `src/ui/**/*.tsx` outside an allow-list (data defaults, wireframe export).
- `npm run typecheck`, `npm run lint`, `npx vitest run`.
- **Browser check** in both themes: workspace landing, overview, one form editor, a collection with inspector, timeline, graph (React Flow), a Recharts view, a Markdown page with Mermaid, a guide with concept diagrams, settings, command palette overlay. Also `forced-colors` mode still works.

## 6. Out of scope / decisions

- **Decided (2026-11-09): the default preference is `system`.** First-time users get the theme their OS asks for; dark is used only when the OS reports no preference (so the `index.html` default `theme-color` stays dark). A missing or invalid stored value also resolves to `system`.
- No per-project theme; the theme is a device preference, not project data, so it is not exported or synced to the cloud.
- Colours inside user/seed data (guides, example projects, user colour fields) are not changed.

## Implementation notes (2026-11-09)

- **Tokens:** light block `:root[data-theme=light]` in `styles.css`. New tokens in both themes: `--control-border` (light #7f889b, so borders reach 3:1 on every surface), `--brand-text`, `--overlay`, `--shadow`, `--scrim`, `--label-halo` (renamed from the planned `--halo`, which an animation already uses locally), `--edge-on-color`, `--tint-ok`, `--tint-accent`, `--on-series`, and the series colours `--c-blue … --c-slate`. In light, the series colours are darker so white `--on-series` label text reaches 4.5:1 on them.
- **Not exactly as before in dark:** the box shadows were four slightly different blacks (`#0006`…`#000`) and now all use `--shadow` (#000c). Everything else in dark resolves to the same values as before.
- **Theme core:** [src/core/theme.ts](../src/core/theme.ts) (`initTheme` in `main.tsx`, `useTheme`, `useThemePref`, `setThemePref`). [ThemeSwitch.tsx](../src/ui/ThemeSwitch.tsx) appears in Settings → General, the More menu and the landing header. New `sun` icon.
- **Libraries:** React Flow `colorMode={theme}`. Mermaid is initialised per render with `default`/`dark` and cached by theme + source. The Recharts axis, tooltip and cursor are styled in CSS. Graph node kind colours are now `--kind-hue` + CSS, with a darker lightness in light.
- **Computed colours:** the world coverage `ramp`, diplomacy `relationColor` and the Grid2d heat are now `color-mix()` over tokens. The translucent `rgba()` heat cells (items/story/trade/simple/combat) stay as they are, because they read in both themes.
- **Not done:** no lint test that blocks new hex literals in TSX. `BrandMark.tsx` keeps its fixed logo colours.
- **Tests:** `tests/tokens.test.ts` checks both themes (text, filled controls, marks, series, label-on-series, light control borders); `tests/theme.test.ts` covers the preference, OS following and `<meta theme-color>`.
