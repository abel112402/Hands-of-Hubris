# Markdown preview upgrade guide (for AI agents)

How to make the **Markdown preview** of every document show what the exported `.md` file really looks like when it's rendered, as GitHub renders it. The docs live in `abel112402/Hands-of-Hubris`, so GitHub-Flavoured Markdown (GFM) plus Mermaid is the target.

The work has two parts:
- **Part 1** is a one-time upgrade of the shared renderer. Do it first, once.
- **Part 2** is a procedure you repeat **per document** (38 modules), tracked in the table in Part 3. One document per session or PR is a good size.

## Context: what the preview does today (2026-11-06)

- `EditorPage` shows `MarkdownPreview text={moduleToMarkdown(project, mod)}` (`src/ui/editors/simple.tsx`). The **input** is right: it is exactly the text the export writes.
- `RichTextEditor` (richtext sections) uses the same component.
- The **renderer** is a ~20-line line-by-line function:
  - It handles `#`–`####` headings, `-`/`*` list lines, `**bold**` and `` `code` ``.
  - Each other line becomes its own `<p>`, and a blank line becomes `<br>`.
- What that means in practice:

| Export construct | Used in `markdown.ts` | Preview today |
|---|---|---|
| GFM tables | 12 builders (every collection with a table view, matrices, formulas, canvases, most summaries) | raw `\| a \| b \|` text, one paragraph per row |
| Mermaid code blocks | 7 builders (all graph sections, Story, Trade, UI flow) | raw source, one paragraph per line, fences visible |
| Images | UI wireframes `![…](ui_wireframes/<id>.svg)` | raw text; the file only exists inside the export zip |
| `_italic_` notes | ~10 places (`_No data._`, summaries) | literal underscores |
| Task lists `- [x]` | checklists | a list item with literal `[x]` |
| Numbered lists, blockquotes, links, nested lists | summaries, module header `> summary` | literal text |
| Escaped `\|` in cells | 21 escapes | the backslash shows |

**Answer to "can the preview show the actual Markdown?"** Yes. Replace the renderer with a real GFM renderer, add Mermaid rendering, and resolve export assets (images) from the same source the zip uses. The input stays `moduleToMarkdown`, so the preview can't drift from the file.

## Part 1: shared renderer (do once, before any per-document work)

> **Status: done (2026-11-06).** It's in `src/ui/markdown/MarkdownView.tsx`, `src/ui/markdown/mermaid.ts` and `exportAssets` in `src/core/export/markdown.ts`, with tests in `tests/markdownView.test.tsx`. Packages are pinned: `react-markdown@10.1.0`, `remark-gfm@4.0.1` and `mermaid@12.2.0` (12.3.0 was only 3 days old). Differences from the text below:
> - Raw HTML is **dropped** (`skipHtml`), not shown as text.
> - Mermaid diagrams render as soon as the preview opens. There's no scroll-into-view laziness, because IntersectionObserver doesn't fire in hidden or background tabs. Mermaid itself still loads only when a diagram is present.
> - In the production build, the renderer is a separate 168 kB chunk and Mermaid's core another 85 kB chunk, plus a chunk per diagram type. Neither is in the main bundle.
> - Start Part 2 with row 16 (UI / UX).

### 1.1 Renderer
- Use **`react-markdown` + `remark-gfm`**. They produce React elements (no `dangerouslySetInnerHTML`), skip raw HTML by default (this keeps today's "no raw HTML is ever injected" guarantee), and support tables, task lists, strikethrough and autolinks.
  - Alternative: `marked` + DOMPurify. It's smaller, but it needs `innerHTML` and sanitising.
- Pin exact versions in `package.json`. Lazy-load the preview chunk with `React.lazy`, so the editor bundle doesn't grow.
- New file `src/ui/markdown/MarkdownView.tsx` exports `MarkdownView({ text, assets?, docId? })`. `MarkdownPreview` becomes a thin wrapper, so `EditorPage` and `RichTextEditor` keep working unchanged.
- Component overrides:
  - `table` is wrapped in `.table-wrap` for horizontal scroll.
  - `code` with `language-mermaid` uses the Mermaid component (1.2).
  - `img` uses the asset resolver (1.3).
  - `a` turns relative `.md` links into in-app routes (1.4) and opens external links in a new tab with `rel="noreferrer"`.
  - `input[type=checkbox]` (task lists) is rendered disabled.
  - Headings get GitHub-style slug ids, so `#anchor` links work.

### 1.2 Mermaid
- Use **`mermaid`**, loaded with a dynamic `import()` only when a ` ```mermaid ` block is present, because it's large.
- `mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: <dark or default to match the app> })`. Render each block with `mermaid.render(id, source)` into a container. Cache by source text, and render in an effect that resolves async (no `setState` synchronously inside the effect).
- **On a parse error**, do what GitHub does: show the error message and the source in a `<pre>`, outlined with `--warn`. Never fail the whole preview.
- In tests (jsdom), `vi.mock('mermaid')` with a stub that returns `<svg data-mermaid>`. `mermaid.parse` is used by the per-document validity check (Part 2, step 4).

### 1.3 Export assets: one source for the zip and the preview
- Add `exportAssets(project, mod): { path: string; mime: string; content: string }[]` to `src/core/export/markdown.ts`. Today the only asset is UI wireframes (`layoutSvg`, path from `wireframePath`).
- Refactor `exportZip` to write **these** assets, and pass the same list to the preview. The preview then resolves `![…](path)` to a `data:` URL from the list. Anything the preview can show is therefore in the zip, and the reverse.
- A missing asset renders as a visible broken-image box that names the path. Never hide it silently.

### 1.4 Links between documents
- `exportPath(mod)` (e.g. `01_design/ui_ux.md`) gives every document's file path. Map a relative link like `../00_overview/vision.md#goals` to `#/doc/overview.vision`, plus the heading anchor if there is one. Unknown targets stay as plain links with a ⚠ title.

### 1.5 Look and controls
- Use GitHub-like typography in `.md`, styled only with CSS variables:
  - bordered, zebra-striped tables
  - `pre` and code blocks
  - blockquotes with a left rule
  - images with `max-width:100%` on a light background (wireframes are light)
  - Mermaid centred, with `overflow:auto`
- A **Rendered / Source** toggle above the preview (Source = a read-only `<pre>` of the exact text), plus **Copy Markdown**. The existing **.md** button already downloads the file.
- Large documents: memoise the parsed tree by text. Mermaid blocks below the fold render when they scroll into view (IntersectionObserver, with a fallback that renders immediately).

### 1.6 Tests for Part 1 (`tests/markdownView.test.tsx`)
- Tables become `<table>` with the right row and column counts, and escaped `\|` shows as `|`.
- A task list becomes disabled checkboxes; `_italic_` becomes `<em>`; `> quote` becomes `<blockquote>`.
- ` ```mermaid ` uses the (mocked) Mermaid component; a forced parse error shows the source and the error, not a crash.
- An image resolves from `assets`; a missing one shows the broken-image box with the path.
- Raw `<script>` / `<img onerror>` in text renders as text, never as HTML.
- Relative `.md` links become `#/doc/<id>`, and heading anchors exist.
- `RichTextEditor` preview and `EditorPage` preview both render through the new component.
- Run `npx tsc -b --noEmit`, `npx eslint .` and `npx vitest run`. Then check in the browser, using a project built from the guide examples, that a table, a Mermaid diagram and a UI wireframe image render.

## Part 2: per-document procedure (repeat for each row of Part 3)

The preview now shows the file faithfully, so **every remaining problem is in the export**. Fix it in `src/core/export/markdown.ts` (or the module's summary function), **never** in the preview.

**0. Pick the document.** Take the next unchecked row in Part 3, and read its module in `src/modules/*.ts` and its doc template under `../docs/`.

**1. Build realistic data.** Use the module's guide examples (`src/modules/guides/<name>.ts`) or its test fixture (`tests/<name>.test.ts`). With no guide, write a small fixture covering every section kind the module has: form, collection, matrix, graph, canvas, checklist, richtext, formulas.

**2. Dump the export.** Write `moduleToMarkdown(project, mod)` to a scratch file, plus `exportAssets` if there are any.

**3. List the constructs.** Note tables, Mermaid blocks, images, task lists, nested lists and links, and open the in-app preview for the same data.

**4. Check correctness.** These patterns break on GitHub too:

| Check | Rule |
|---|---|
| Tables | blank line before the table; header and every row have the **same column count**; cell text goes through `esc()` (`\|` escaped, newlines removed); no empty header cells |
| Lists | blank line before a list that follows a paragraph; nested items indented 2 spaces; numbered lists continue (`1.` `2.` …) |
| Emphasis | `_italic_` only around whole words (identifiers like `rule_id` inside `_…_` break it), and never empty |
| Headings | `#` title, then `## n. Section`, `### Entry`, `#### Detail`; no skipped levels; headings unique within the document (anchors) |
| Mermaid | node ids prefixed and sanitised to `[A-Za-z0-9_]`; labels in `["…"]` with `"` replaced; edge labels without `\|`; no bare reserved words (`end`, `graph`, `subgraph`) as ids; `mermaid.parse(src)` succeeds |
| Images and links | every image path is in `exportAssets`; every relative link points at an existing `exportPath` |
| Empty data | an empty section shows one consistent line (`_No data._`, `_No entries yet._`, `_Diagram is empty._`); no stray headings without content |
| Doc order | headings follow the doc template's chapter order (most modules already have a test for this) |

**5. Fix the export.** Make the smallest change in the builder that produced the problem. When the same bug appears in a shared builder (`collectionMd`, `matrixMd`, `graphMd`, `valueToText`), fix it there **once**, mark the other affected rows in Part 3 as "shared fix", and re-check them.

**6. Add tests** in `tests/<name>Markdown.test.ts`. Render the export through `MarkdownView` (`renderToStaticMarkup`) and assert:
- number of `<table>` = number of table blocks in the text, and each table's rows have equal cell counts
- every Mermaid block passes `mermaid.parse` (the real package's parser, or a light validator if it can't run in jsdom: ids match `/^[A-Za-z_]\w*$/`, quotes balanced)
- every `<img>` resolved (no broken-image box)
- the heading outline (snapshot of `h2`/`h3` texts) matches the doc order

**7. Check in the browser.** Open the document's Markdown preview with the realistic data and compare it with the same `.md` rendered by GitHub (or VS Code's preview with Mermaid support), side by side. Tables, diagrams, images and emphasis should look the same.

**8. Record it.** Tick the row in Part 3 with the constructs found and the fixes made, in one line.

### Rules
- The preview's input is always `moduleToMarkdown`. There's no preview-only text, and no hiding of export bugs in the renderer.
- Don't add raw HTML to exports: the renderer drops it, and so do many Markdown viewers.
- Keep summaries as tables or lists of key numbers, and diagrams as Mermaid (the editor upgrade guide's rule).
- If a module has no export problems, still add the step 6 test, so regressions are caught.

## Part 3: tracking table

`Sum.` marks a module with its own summary function in `markdown.ts`. ✓ in a construct column means the export uses it.

| # | Document (module id) | Sum. | Tables | Mermaid | Images | Status | Notes |
|---|---|---|---|---|---|---|---|
| 1 | Vision (`overview.vision`) |  | ✓ |  |  | ☐ | richtext preview also uses the renderer |
| 2 | Glossary (`overview.glossary`) |  | ✓ |  |  | ☐ |  |
| 3 | Roadmap (`overview.roadmap`) | ✓ | ✓ |  |  | ☐ | schedule summary (dates) |
| 4 | Core Loop (`design.coreLoop`) |  | ✓ | ✓ |  | ☐ | graph |
| 5 | Difficulty (`design.difficulty`) |  | ✓ |  |  | ☐ | matrix |
| 6 | Factions (`design.factions`) |  | ✓ | ✓ |  | ☐ | matrix + graph |
| 7 | World & Biomes (`design.world`) |  | ✓ | ✓ |  | ☐ | graph + canvas table |
| 8 | Town (`design.town`) |  | ✓ | ✓ |  | ☐ | graph |
| 9 | NPC System (`design.npc`) | ✓ | ✓ |  |  | ☐ | needs balance, matrix |
| 10 | Player Character (`design.player`) | ✓ | ✓ |  |  | ☐ | level table |
| 11 | Items & Crafting (`design.items`) | ✓ | ✓ | ✓ |  | ☐ | crafting Mermaid, loot tables |
| 12 | Combat (`design.combat`) | ✓ | ✓ |  |  | ☐ |  |
| 13 | Time & Weather (`design.timeWeather`) | ✓ | ✓ |  |  | ☐ |  |
| 14 | Trade & Economy (`design.trade`) | ✓ | ✓ | ✓ |  | ☐ | money-flow Mermaid |
| 15 | Story & Quests (`design.story`) | ✓ | ✓ | ✓ |  | ☐ | quest flow + decision Mermaid; quest ids go raw into node ids, so check sanitising |
| 16 | UI / UX (`design.ui`) | ✓ | ✓ | ✓ | ✓ | ☐ | wireframe SVGs: first user of `exportAssets` |
| 17 | Open Questions (`design.openQuestions`) |  | ✓ |  |  | ☐ |  |
| 18–25 | Technical (`technical.*`: architecture, coding, dataDriven, save, ai, performance, tools, adr) |  | ✓ | some |  | ☐ | check each for graphs and canvases |
| 26–28 | Art & Audio (`artAudio.art`, `.audio`, `.assets`) |  | ✓ |  |  | ☐ |  |
| 29–33 | Production (`production.milestones`, `.backlog`, `.risks`, `.team`, `.release`) | some | ✓ |  |  | ☐ | checklists (task lists) in release |
| 34–36 | QA (`qa.testPlan`, `.balance`, `.bugs`) |  | ✓ |  |  | ☐ | checklists |
| 37 | Feature spec template (`templates.featureSpec`) |  | ✓ |  |  | ☐ |  |
| 38 | Custom entities (`custom.entities`) |  | ✓ |  |  | ☐ | user-defined fields |

Suggested order:
1. Part 1.
2. **UI / UX** (it exercises tables, Mermaid and images, and proves `exportAssets`).
3. **Story**, **Items** and **Trade** (the most Mermaid).
4. One graph-only module (Core Loop), which validates the shared `graphMd`.
5. The rest in any order; most only need the shared-builder fixes and the step 6 test.

## Decisions to confirm before Part 1
1. **`react-markdown` + `remark-gfm`** (React elements, no `innerHTML`) rather than `marked` + DOMPurify.
2. **Mermaid in the app**, lazy-loaded: about 1 MB, downloaded only when a preview contains a diagram. The alternative is showing Mermaid as highlighted source with a "rendered on GitHub" note.
3. **Raw HTML is never rendered.** GitHub allows a safe subset, but the exports don't use HTML, and keeping it out keeps the preview safe.
4. **Export bugs are fixed in the export, not hidden in the preview.** This is the core rule of Part 2.
