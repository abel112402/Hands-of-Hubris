# Atlas (v3) layout-javítások – terv

Hatókör: a v3 („atlas design”) shell, a jobb oldali companion (Hints / Guide / AI), és a v3 editor fejléce
(szekció-tabok, section map, nézetváltó). Fájlok: `src/ui/v3/*`, `src/ui/hints/HintPanel.tsx`,
`src/ui/ai/AiPanel.tsx`, `src/ui/guides/GuideMap.tsx`, `src/ui/editors/CollectionEditor.tsx`, `src/styles.css`
(v3 blokk ~1578. sortól).

---

## 1. Nincs fő scrollbar, az oldal 100vh × 100vw-be fér

**Mért ok (dev szerver, 1024×768):** a `documentElement` `scrollWidth` 1015 > `clientWidth` 1014. A jobb oldali
tray Hints-számlálója (`.tray3-item .badge`, `position:absolute; right:-12px`) kilóg az ablak jobb szélén
(right = 1015.2px). Ez vízszintes fő scrollbart ad, ami 10px-et elvesz a magasságból, így a `height:100vh`-s
`.shell3` már függőlegesen is túlcsordul → mindkét fő scrollbar megjelenik. Szerkesztőoldalon ugyanez látszik.

**Teendők**
1. `styles.css`: a badge ne lógjon ki – tray-ben `right:-4px; top:-4px` (a rail badge maradhat, az a bal oldalon belül van).
   A `.tray3` kapjon `overflow:hidden` (vagy `overflow-x:clip`), hogy jövőbeli díszek se tolhassák ki.
2. A v3 shell rögzítése a viewporthoz, belső scroll megtartásával:
   - `.shell3{height:100dvh; width:100vw; max-width:100%; overflow:hidden}` (`100vh` fallback előtte, mobil URL-sáv miatt).
   - Csak v3 alatt: `html:has(.shell3), body:has(.shell3){overflow:hidden; height:100%}` – a classic (v2) és a landing oldal érintetlen marad.
   - `.body3` sorai/oszlopai `minmax(0,…)` – már így van; a `.surface3` (`.shell-body`) és a `.companion3-body`, `.sheet-body`, `.rail3` maradnak a belső scrollerek.
3. Bottom rail (compact, < 768px): `.shell3.compact` esetén is 100dvh, a bottom rail `flex:none`, ellenőrizni, hogy a NextStep pill nem okoz túlcsordulást.
4. Teszt: `tests/v3ShellUi.test.tsx` – ellenőrzés, hogy a `.shell3` gyökér megkapja a layout-osztályt; kézi mérés böngészőben 375 / 1024 / 1440 szélességen: `scrollWidth === clientWidth` és `scrollHeight === clientHeight` a `documentElement`-en, Atlas + editor + Settings + Issues oldalon.

---

## 2. Jobb oldali companion (Hints / Guide / AI)

**Jelenlegi viselkedés**
- `CompanionTray` (`Companion.tsx`): a főoldalon (nincs `docId`) csak a Hints gomb látszik, az is a Settingsbe navigál; a Guide és AI rejtve.
- Bármelyik gombra kattintva a `CompanionPanel` a teljes `HintPanel`-t rendereli **mindhárom tab-gombbal** („Companion” címmel), azaz mindig mindhárom tool látszik.
- Elrendezési hibák (képernyőképen): nagy üres sáv a cím és a tabok között (a `.hint-panel.embedded .hint-head` negatív margója `--surface-sheet`-re és `--space-4` paddingre épül, ami a docked/overlay változatban nem egyezik); az AI tartalom alatt felesleges vízszintes scrollbar; a generikus „Companion” cím.

**Teendők**
1. **Egy tool per kattintás.** `HintPanel` kapjon `only?: 'hints' | 'guide' | 'ai'` propot (vagy a Companion használjon külön komponenseket):
   - `only` esetén nincs `.tabs` sor; csak a kiválasztott tartalom renderelődik (`HintList`, `GuidePanel`, `AiPanel`).
   - A classic (v2) `HintPanel` változatlanul tabos marad.
   - Kiemelni a hint-lista részt egy `HintList` komponensbe, hogy a Companion közvetlenül használhassa.
2. **Cím és fejléc.** A Sheet / docked fejléc címe a választott tool neve ikonnal (`t('hints.panel')`, `t('guide.tab')`, „AI”), Hints esetén a darabszámmal. A tray-ben ugyanarra a gombra kattintás zárja a panelt (toggle), másikra kattintás átvált – a panel nem zár be/nyit újra (nincs animációs ugrás).
3. **AI a főoldalon is.**
   - `CompanionTray`: az AI gomb `docId` nélkül is látszik; a Hints főoldalon a projekt-szintű hinteket nyitja (nem a Settingsbe visz) – a `useHints()` total már elérhető. A Guide továbbra is csak planner oldalon.
   - `AiPanel`: `docId` legyen opcionális; `docId` nélkül az alapértelmezett és egyetlen engedett scope `project`, a section/doc-specifikus taskok (pl. rewrite egy mezőre) rejtve. `useFlavor` ctx fallback `'home'`.
   - `AppShellV3`: a `CompanionPanel` renderelésének feltétele `companionOpen && (docId || tab !== 'guide')`; a docked változat is működjön főoldalon. `shellLayout` hívásnál a `!!docId` feltétel helyett „van megjeleníthető tool”.
   - A `useShortcuts` `openHints` főoldalon is a companiont nyissa.
4. **Elrendezés javítása (CSS).**
   - A sticky `.hint-head` negatív-margó trükk megszűnik (tabsor nincs többé); a fejlécet a `Sheet` / `.companion3` header adja.
   - `.companion3-body`, `.sheet-body` tartalma: `min-width:0` a gyerekeken, AI-panel formmezők `width:100%; box-sizing:border-box`, így eltűnik a vízszintes scrollbar.
   - Docked panel szélessége maradjon `DOCK_WIDTH` (360), overlay 400px; egységes `--space-4` padding.
5. **Teszt:** `tests/v3CompanionUi.test.tsx` bővítése: (a) Hints kattintásra csak a hint-lista van a DOM-ban, nincs Guide/AI tab; (b) AI gomb a `/` útvonalon is megjelenik és megnyitja az AI panelt; (c) ugyanarra a gombra második kattintás zár. `tests/v3Shell.test.ts` a `shellLayout` változáshoz.

---

## 3. Editorok: szekció-tabok, section map, nézetváltó

### 3a. Szekció-tabok (`.sec3-strip` / `.step3`) – modernebb, letisztultabb
Jelenleg: pill alakú gombok, az aktív csak halvány háttérrel és kerettel különül el; a hint-szám narancs kör; a strip
jobb szélén a fade-maszk és a „Map” gomb összefolyik.

**Teendők** (`EditorPageV3.tsx` + CSS):
- Underline-tab stílus: a strip alatt 1px `--line` alapvonal; a tabok keret/háttér nélkül, az aktív alatt 2px
  `--brand` indikátor, ami a `Segmented` thumbhoz hasonlóan **csúszik** (CSS változók `--ind-x/--ind-w`, ugyanaz a
  `ResizeObserver`-es minta, mint `motion.tsx` `Segmented`-ben → kiemelni egy közös `useSlidingIndicator` hookba).
  `prefers-reduced-motion` alatt nincs animáció.
- Aktív tab: `--text` szín, 600-as súly; inaktív: `--muted`, hoverre `--text` + halvány háttér.
- Állapot-glyph (○ ◐ ●) marad, kisebb (8px); a hint-szám semleges kis „chip” (`--surface-3` háttér, `--muted` szöveg), csak az aktív tabon brand színű.
- Görgetés: a fade-maszk csak akkor legyen, ha tényleg túlcsordul (`data-overflow` attribútum ResizeObserverrel), az aktív tab szekcióváltáskor `scrollIntoView({inline:'nearest'})`.
- A „Section map” gomb kikerül a görgő stripből a strip jobb végére, fix helyre (nem görög el), ikon + rövid címke.
- A roving tabindex / nyíl-billentyű logika és az `aria-current` megmarad.

### 3b. Section map – a főoldali Atlas stílusában
Jelenleg a `GuideMap` egyszerű lekerekített téglalapokat rajzol SVG-ben (`.gm-node rect`), szaggatott keret = üres.
A főoldal térképe: `--atlas-paper` háttér pontráccsal (`bp-grid`), kör alakú „landmark” gyűrű progress-gyűrűvel
(`Ring`), ikon a gyűrűben, címke alatta, szaggatott/menetelő útvonal (`atlas3-route`), uppercase régiócímkék, jelmagyarázat.

**Teendők** (`GuideMap.tsx` + CSS):
- A térkép konténere `atlas3-map`-szerű: `--atlas-paper` háttér + `--grid-dot`, `--radius-md`, keret.
- Csomópontok: a `rect` helyett az Atlas landmark mintája (HTML-overlay abszolút pozícióval vagy SVG `circle` + `Ring`):
  44px gyűrű, a gyűrű kitöltése a szekció állapota (empty 0 / started ½ / done teljes), ikon = a szekció glyph-je
  vagy a modul ikonja; címke alatta 11.5px, 2 sorra vágva. Hover/focus: `scale(1.1)` + glow, mint `.atlas3-lm`.
- Az aktuális szekció: brand színű halo (`hoh-halo`) + „Itt vagy” címke (`.atlas3-here`), mint a főoldalon.
- Külső (más plannerre mutató) csomópont: halvány / „fogged” stílus (`.atlas3-lm.fogged`).
- Élek: `.atlas3-link` vékony, halvány vonal; a címkék `--atlas-paper` háttérrel. A nyílhegy marad, de halványabban.
- Hint-badge: ugyanaz a kis badge, mint az Atlas/rail-en.
- Jelmagyarázat (`.atlas3-legend` stílus): üres / elkezdett / kész / másik planner.
- Közös CSS-osztályok kiemelése (`.map-paper`, `.map-landmark`, `.map-ring`), hogy az Atlas és a GuideMap ugyanazt használja – ne duplikáljunk.
- A Sheet szélessége (760) marad; kis képernyőn a térkép `overflow:auto` konténerben.
- Teszt: meglévő GuideMap/editor tesztek (`tests/v3EditorUi.test.tsx`) – navigáció kattintásra, `current` jelölés, a11y címkék.

### 3c. Nézetváltó (TABLE / CARDS / …) – feltűnőbb, de letisztult
Jelenleg: a közös `Segmented`, halvány `--surface-0` háttér, csak szöveg, kis (26px) gombok – beleolvad a fejlécbe.

**Teendők** (`CollectionEditor.tsx` + CSS, `Segmented` változat):
- `Segmented` kapjon `variant="prominent"` módot (`.segmented.prominent`) – az Atlas Map/List váltó és a header mód-váltó változatlan marad.
- Prominent: magasság `--control-min` (≈32px), minden opció **ikon + címke** (Table → `table`/`list`, Cards → `grid`,
  Board → `columns`, Graph/Map ikon az `Icon` készletből; hiányzó ikon felvétele `Icon.tsx`-be).
- A csúszó thumb `--brand` tónusú: `color-mix(in srgb,var(--brand) 16%,var(--surface-3))` háttér + 1px brand keret, aktív szöveg `--brand-text`.
- Keskeny helyen (< 900px a sec3-tools sorban) csak ikon, `title`/`aria-label` megtartva.
- A `data-guide="view-…"` attribútumok és `aria-pressed` maradnak (Spotlight és a11y erre épít).

---

## Sorrend és ellenőrzés
1. Fő scrollbar (kicsi, független, azonnal látható) → böngészős mérés.
2. Companion: `HintList` kiemelés → `only` mód → AI főoldalon → CSS → tesztek.
3. Szekció-tabok + közös sliding-indicator hook.
4. Nézetváltó `prominent` változat.
5. Section map Atlas-stílusban (legnagyobb vizuális munka, közös map-osztályokkal).

Minden lépés után: `npx vitest run tests/v3*.test.ts*`, `npm run typecheck`, `npm run lint`; vizuális ellenőrzés
a dev szerveren világos és sötét témában, 375 / 1024 / 1440 px szélességen. A classic (v2) felületet nem érinti
(csak `.shell3` alatti szabályok, a `HintPanel` tabos módja alapértelmezett marad).
