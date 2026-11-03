# Game Design Planner – Implementációs terv

**Státusz:** Vázlat | **Utolsó módosítás:** 2026-11-03

## 0. Döntések (egyeztetve)

| Téma | Döntés |
|------|--------|
| Helye | `Hands-of-Hubris/game-design-planner-app/` |
| Stack | Vite + React + TypeScript |
| UI nyelv | Angol; az i18n-keretrendszer az elejétől bent van, később magyar és más nyelvek |
| Hatókör | A `docs/` összes tervtípusa: overview, design, technical, art/audio, production, QA |
| Mentés | JSON fájl letöltés/feltöltés + automatikus böngészőmentés (IndexedDB) |
| Export | Fájlmentés mellett Markdown export is, a `docs/` sablonjainak formátumában |

**Alapértelmezett feltevések (módosítható, ha nem jó):**
* A játékon dolgozó csapat kicsi, az app helyi (offline) eszköz, backend és bejelentkezés nincs.
* Egy **projektfájl** (`*.hohplan.json`) tartalmazza az összes tervet (dokumentumot) és a közös definíciókat. Egyes dokumentumok külön is exportálhatók/importálhatók.
* A cél: a `docs/` sablonjai kitölthetők legyenek vizuálisan, és az eredmény visszaírható Markdownba.

## 1. Célok és nem-célok

**Célok**
* A szöveges tervezés helyett interaktív, vizuális szerkesztők (gráf, mátrix, idővonal, fa, kanban, wireframe stb.).
* Minden tervtípus részletes tervezésre alkalmas, nem csak vázlatra.
* **Bővíthetőség:** új tervtípus, új mező, új entitástípus, új statisztika vagy igény felvehető **kódmódosítás nélkül** (felhasználói definíciókkal), és fejlesztőként plugin-szerű modulként is.
* Megbízható mentés/betöltés, verziózott formátummal és migrációval.

**Nem-célok (első körben)**
* Valós idejű többfelhasználós szerkesztés, felhőtárolás, Unity-integráció (később lehet: export Unity-barát JSON/ScriptableObject adatokhoz).
* A játék szimulálása (legfeljebb egyszerű képlet-előnézet).

## 2. Technológiai stack

| Terület | Választás | Indok |
|---------|-----------|-------|
| Build | Vite | Gyors fejlesztés, egyszerű konfig |
| UI | React 18+ + TypeScript (strict) | Kért stack |
| Állapotkezelés | Zustand + Immer | Egyszerű, nagy dokumentumra is jó, könnyű undo/redo |
| Validáció | Zod | Séma → TS típusok + betöltéskori validáció |
| Gráf szerkesztő | `@xyflow/react` (React Flow) | Csomópontos szerkesztők (core loop, quest, erőforrás-áramlás, screen flow, architektúra) |
| Auto layout | `elkjs` vagy `dagre` | Gráfok rendezése |
| Táblázat | TanStack Table + TanStack Virtual | Nagy adatbázis-táblák (itemek, tesztesetek) |
| Drag & drop | `@dnd-kit` | Kanban, rendezés |
| Diagramok | Recharts (radar, oszlop, vonal) | Statok, nehézség-összehasonlítás, gazdaság |
| Idővonal/Gantt | Saját komponens (SVG/CSS grid) vagy `gantt-task-react` | Roadmap, milestones |
| Wireframe vászon | `konva` + `react-konva` | UI/UX wireframe, térkép-vázlat |
| Markdown | `remark`/`unified` vagy saját template-generátor | Export; Markdown-előnézet |
| i18n | `react-i18next` | Angol, később magyar |
| Perzisztencia | `idb-keyval` (IndexedDB) + File System Access API (fallback: letöltés) | Autosave, fájl megnyitás/mentés |
| Stílus | Tailwind CSS + Radix UI primitívek (vagy shadcn/ui) | Gyors, egységes UI |
| Routing | React Router | Menü és szerkesztők nézetei |
| Tesztek | Vitest + React Testing Library + Playwright (e2e) | Séma, migráció, export, kulcs-UI folyamatok |
| Minőség | ESLint, Prettier, `tsc --noEmit`, GitHub Actions CI | |

## 3. Tervtípusok és vizuális szerkesztők

A főmenü a `docs/` mappaszerkezetét követi (csoportok: Overview, Design, Technical, Art & Audio, Production, QA). Minden tervtípus egy **modul** (lásd 5. fejezet), amelynek van sémája, szerkesztője és Markdown-exportja.

### 3.1 Újrahasznosítható szerkesztő-építőelemek

| Építőelem | Felhasználás |
|-----------|--------------|
| **Entity Card Grid + Detail Form** | Entitások (frakció, biom, ellenség…) listázása kártyákon, részletek sémavezérelt űrlapon |
| **Data Table** | Adatbázis jellegű szerkesztés (itemek, receptek, tesztesetek, backlog), oszlopok szűrése/rendezése, CSV import/export |
| **Node Graph** | Folyamat- és kapcsolati ábrák |
| **Tree Editor** | Skillfák, progressziós fák |
| **Matrix/Heatmap** | Frakcióviszonyok, kockázatmátrix, nehézség-paraméterek |
| **Timeline/Gantt** | Roadmap, mérföldkövek, napciklus |
| **Kanban** | Backlog, nyitott kérdések, asset státusz |
| **Charts** | Radar (statok), vonal/oszlop (gazdaság, szintgörbe) |
| **Wireframe Canvas** | UI képernyők, térképvázlat |
| **Checklist** | Kiadási ellenőrzőlista, elfogadási kritériumok |
| **Rich Text (Markdown)** | Szabad leírás mezők minden entitásnál |
| **Formula Editor** | Képletek (sebzés, ár, XP-görbe) változókkal és előnézeti értékkel |
| **Palette/Moodboard** | Színek, referenciaképek |

### 3.2 Modulok (docs fájlonként)

| Csoport | Docs fájl | Vizuális szerkesztő (fő nézet) | Részletesség |
|---------|-----------|-------------------------------|--------------|
| Overview | `vision.md` | Strukturált űrlap + **pillér kártyák** (drag & drop sorrend), scope három oszlopban (Benne / Később / Nincs) | USP, célközönség, referenciák |
| | `glossary.md` | Data Table + kereszthivatkozás-nézet (hol szerepel a fogalom) | Fogalom, kódnév, definíció, linkek |
| | `roadmap.md` | **Gantt/timeline** fázisokkal, mérföldkövekkel, függőségekkel, gate-ekkel + kritikus útvonal kiemelés | Fázis → feladat → feature link, kilépési feltétel checklist, hatókörcsökkentési sorrend |
| Design | `core_loop.md` | **Node Graph** (rövid/közép/hosszú táv hurkok, jutalom élek) | Ciklusok, rendszerek közti kapcsolatok |
| | `difficulty.md` | **Paraméter mátrix** (Easy/Medium/Hard) csúszkákkal + oszlopdiagram összehasonlítás | Szorzók, küszöbök, kategóriák szabadon bővíthetők |
| | `factions_diplomacy.md` | **Viszony-heatmap mátrix** + gráf nézet (barát/ellenség élek) + frakció lapok; tett→hatás szabálytábla | Főváros, karakterek, feloldható skillek, befejezések |
| | `world_biomes.md` | **Biom-térkép vászon** (zónák, kapcsolatok) + **progressziós gráf** (feloldási feltételek) + biom kártyák | Nyersanyagok, ellenségek, helyőrségek, POI-k |
| | `town_management.md` | **Erőforrás-áramlás gráf** (épület → nyersanyag → épület), épület adatbázis, gazdasági paraméterek, morál-küszöbök | Bemenet/kimenet, szintek, dolgozók, árrés |
| | `npc_system.md` | **Radar diagram** (statok), igény-tábla, **életciklus állapotgép**, esemény-tábla viszonyokhoz | Statok/igények **felhasználói definícióból** (bővíthető) |
| | `player_character.md` | **Skillfa szerkesztő** kasztonként, túlélési mutató tábla, XP-görbe (képlet+grafikon) | Kasztok, képességek, varázslatok |
| | `items_crafting.md` | **Item adatbázis tábla**, ritkaság/minőség szorzótábla, **recept-gráf** (alapanyag → termék), loot-táblák | Típusonként eltérő mezők (séma szerint) |
| | `combat_enemies.md` | Ellenség kártyák + statok, **boss fázis állapotgép/idővonal**, sebzésmodell képletek | Gyengeségek, drop, AI minta |
| | `time_weather_events.md` | **Napciklus idővonal** (kör/sáv), időjárás-tábla biomonként, event kártyák szabálymódosítókkal | Telihold, Vérhold, Ünnep |
| | `trade_economy.md` | Értékképlet-szerkesztő, kínálat-táblák, árrés görbe | Vándorkereskedő, piac, frakció kereskedelem |
| | `story_quests.md` | **Quest/dialog elágazó gráf** (feltétel → célok → jutalom → következmény), felvonás-idővonal, befejezés-fa | Karakterek, küldetéstípusok |
| | `ui_ux.md` | **Screen flow gráf** + **wireframe vászon** képernyőnként | HUD elemek, interakciók, állapotok |
| | `open_questions.md` | **Kanban** (Nyitott / Vita / Eldöntött) + döntési napló, linkelés az érintett tervekhez | Opciók, döntés, felelős, határidő |
| Technical | `architecture.md` | **Modul-függőségi gráf** (assembly-k, rétegek), bővítési pont lista | Publikus API, függőségek, szabályellenőrzés (körkörös függés jelzése) |
| | `data_driven_design.md` | **Séma-szerkesztő** (típus → mezők, kötelező, validáció), ID-konvenció | A játék adatmodelljének leírása, JSON Schema export |
| | `save_system.md`, `ai_systems.md`, `performance.md`, `tools_pipeline.md`, `coding_standards.md` | Strukturált űrlap + szekció-kártyák; teljesítmény: **költségvetés tábla + diagram**; AI: **viselkedésfa/állapotgép** (Node Graph) | Szabad szöveg + táblák + diagramok |
| | `adr/` | **ADR lista + űrlap** (státusz-folyamat: Javasolt → Elfogadott → Elavult), kapcsolatok más ADR-ekhez | Opciók, szempontok, következmények |
| Art & Audio | `art_direction.md` | **Moodboard + paletta szerkesztő**, frakció/biom stíluskártyák | Referenciaképek (beágyazva vagy URL) |
| | `audio_direction.md` | Zenei téma mátrix (biom × napszak × frakció), SFX kategória tábla | Adaptív zene szabályok |
| | `asset_pipeline.md` | **Kanban + Data Table** assetekre (státusz, felelős), formátum-szabály tábla | Licenc nyilvántartás |
| Production | `milestones.md` | **Timeline** + mérföldkő kártyák elfogadási kritériumokkal | Szállítandók, retrospektív |
| | `backlog.md` | **Kanban + tábla** (szűrés terület/prioritás/mérföldkő szerint), link specifikációkra | Becslés, státusz |
| | `risk_register.md` | **5×5 kockázati mátrix** (valószínűség × hatás), húzható kártyák | Megelőzés, vészterv |
| | `team_workflow.md` | Szerepkör tábla + folyamatábra (Node Graph) | DoD checklist |
| | `release_checklist.md` | **Checklist** szekciókkal, haladásjelző | |
| QA | `test_plan.md` | **Tesztesettábla**, lefedettség a rendszerekhez (mátrix) | Lépések, elvárt eredmény |
| | `balance_plan.md` | Balansz táblák + **változásnapló**, diagramok | Mérőszámok |
| | `bug_report_template.md` | Hibajelentés űrlap, lista, szűrés | |
| Templates | `feature_spec_template.md` | **Feature specifikáció űrlap** szekciónként; kapcsolható design/backlog/teszt elemekhez | Elfogadási kritériumok checklist |

> A technikai/produkciós modulok az első iterációban lehetnek egyszerűbbek (űrlap + tábla), a vizuális nézetek (gráf, mátrix, Gantt) a design modulokra és a roadmapre koncentrálnak. A lenti ütemezés ezt követi.

## 4. Bővíthetőség (kulcsfontosságú követelmény)

A játék bővíthető lesz, ezért a tervező app sem hardkódolhatja a típusokat. Négy bővítési szint:

1. **Felhasználói definíciók (Registry)** – a projekt `registry` szekciója tartalmazza a közös, szerkeszthető katalógusokat:
   * NPC statok (`Strength`, `Intelligence`… új hozzáadható), NPC igények, erőforrás-típusok, item típusok, ritkasági szintek, minőségi fokozatok, kasztok, frakciók, biomok, nehézségi szintek, sebzéstípusok, statuszhatások, szakmák, események kategóriái.
   * Egy szerkesztő-nézet („Definitions") kezeli őket; minden más modul **ezekre hivatkozik azonosítóval**, így egy új stat vagy igény azonnal megjelenik a radarban, az NPC-táblában és a nehézség-mátrixban.
2. **Egyedi mezők (Custom Fields)** – minden entitástípushoz felvehetők plusz mezők (szöveg, szám, enum, boolean, hivatkozás, lista, szín, képlet) a UI-ból; a séma a projektfájlban tárolódik.
3. **Új entitástípusok** – a Definitions nézetben létrehozható teljesen új típus (pl. „Pet", „Spell School"), amely automatikusan kap kártya/tábla szerkesztőt és Markdown exportot.
4. **Modul-plugin API (fejlesztőknek)** – új tervtípus kódból, egyetlen mappával és egy regisztrációs hívással (lásd 5.2).

**Szabályok:** minden hivatkozás ID alapú (`stat:strength`, `faction:crown`), nem név alapú; átnevezés nem töri el a kapcsolatokat. Törléskor figyelmeztetés a hivatkozásokról (referencia-ellenőrzés).

## 5. Architektúra

### 5.1 Mappastruktúra

```
game-design-planner-app/
├─ IMPLEMENTATION_PLAN.md
├─ package.json, tsconfig.json, vite.config.ts, eslint, prettier
├─ public/
├─ src/
│  ├─ main.tsx, App.tsx, router.tsx
│  ├─ core/
│  │  ├─ model/           # Project, Document, Entity, Registry típusok + Zod sémák
│  │  ├─ store/           # Zustand store, undo/redo, selectorok
│  │  ├─ persistence/     # fájl I/O, IndexedDB autosave, migrációk
│  │  ├─ references/      # ID-kezelés, hivatkozás index, integritás-ellenőrzés
│  │  ├─ modules/         # modul-regiszter és a PlannerModule interfész
│  │  ├─ export/          # Markdown/CSV/JSON export motor
│  │  ├─ validation/      # dokumentum- és projektszintű ellenőrzések
│  │  └─ i18n/            # nyelvi erőforrások (en.json, később hu.json)
│  ├─ ui/
│  │  ├─ layout/          # AppShell, sidebar, toolbar, command palette
│  │  ├─ components/      # alap komponensek (Button, Dialog, Field, ...)
│  │  └─ editors/         # újrahasznosítható építőelemek (3.1)
│  │     ├─ form/ table/ graph/ tree/ matrix/ timeline/ kanban/
│  │     ├─ chart/ canvas/ checklist/ richtext/ formula/ palette/
│  ├─ modules/            # tervtípusonként egy mappa (3.2)
│  │  ├─ overview/        { vision, glossary, roadmap }
│  │  ├─ design/          { coreLoop, difficulty, factions, world, town, npc, player, items, combat, timeWeather, trade, story, uiux, openQuestions }
│  │  ├─ technical/       { architecture, dataDriven, save, ai, performance, tools, coding, adr }
│  │  ├─ artAudio/        { artDirection, audioDirection, assetPipeline }
│  │  ├─ production/      { milestones, backlog, risks, team, release }
│  │  ├─ qa/              { testPlan, balance, bugs }
│  │  └─ templates/       { featureSpec }
│  ├─ pages/              # Főmenü (Home), Project settings, Definitions, Editor oldal
│  └─ styles/
├─ tests/                 # unit, integráció, e2e
└─ examples/              # példa projektfájl (a docs alapján feltöltve)
```

### 5.2 Modul interfész

Minden tervtípus ugyanazt a szerződést valósítja meg, így a főmenü, a mentés, az export és a keresés általános:

```ts
interface PlannerModule<TData> {
  id: string;                       // pl. "design.factions"
  group: 'overview' | 'design' | 'technical' | 'artAudio' | 'production' | 'qa' | 'templates';
  titleKey: string;                 // i18n kulcs
  icon: string;
  docsPath: string;                 // melyik docs/ fájlnak felel meg
  schema: ZodSchema<TData>;         // dokumentum séma
  createEmpty(registry): TData;     // új dokumentum alapértelmezéssel
  Editor: React.ComponentType<EditorProps<TData>>;
  toMarkdown(data: TData, ctx: ExportContext): string;
  migrate?(oldData: unknown, fromVersion: number): TData;
  references?(data: TData): Ref[];  // kimenő hivatkozások (kereszt-link, törlés védelem)
  validate?(data: TData, ctx): Issue[];
  version: number;
}
```

Új tervtípus = új mappa a `src/modules/` alatt + egy sor a regiszterben. A főmenü a regiszterből generálódik.

### 5.3 Adatmodell és fájlformátum

```jsonc
{
  "format": "hands-of-hubris-planner",
  "formatVersion": 1,
  "meta": { "name": "...", "createdAt": "...", "updatedAt": "...", "appVersion": "..." },
  "registry": {                       // közös, bővíthető definíciók (4. fejezet)
    "entityTypes": [ ... ],           // beleértve egyedi típusokat és custom field sémákat
    "catalogs": { "npcStats": [...], "needs": [...], "resources": [...], "rarities": [...], ... }
  },
  "documents": {
    "design.factions": { "moduleVersion": 1, "data": { ... } },
    "overview.roadmap": { "moduleVersion": 1, "data": { ... } }
  },
  "links": [ { "from": "ref", "to": "ref", "kind": "..." } ]   // dokumentumok közötti kapcsolatok
}
```

* Minden entitás stabil, rövid `id`-t kap (nanoid), plusz ember-olvasható `key`-t (pl. `faction:crown`).
* A `formatVersion` és a `moduleVersion` külön migrálható; betöltéskor Zod validáció, hibás részeknél **részleges betöltés + hibalista**, nem összeomlás.
* Ismeretlen mezők megőrzése (előre-kompatibilitás), hogy új verzióval mentett fájl ne veszítsen adatot.
* Képek: kis képek base64-ben, nagyok URL-ként vagy külön `assets` szekcióban.

### 5.4 Perzisztencia

* **Fájl:** „Open / Save / Save as" a File System Access API-val (Chromium); fallback: fájl-feltöltés és letöltés (Firefox/Safari).
* **Autosave:** debounce-olt mentés IndexedDB-be, „Restore last session" a főmenüben; a nem mentett változás jelzése.
* **Verziózás:** a lokális tárban az utolsó N pillanatkép (snapshot); kézi „named snapshot".
* **Import:** teljes projekt vagy egy dokumentum (egyesítés/felülírás választással), CSV import táblákhoz.
* **Biztonság:** minden betöltött fájl sémavalidáción és méretkorláton megy át; Markdown/HTML megjelenítés sanitizálva (XSS ellen).

### 5.5 Állapotkezelés

* Egyetlen projekt-store (Zustand + Immer), dokumentumonkénti szeletekkel.
* **Undo/redo** patch alapon (Immer patches) dokumentumonként és globálisan; Ctrl+Z / Ctrl+Y.
* Nagy gráfok/vásznak: helyi állapot a húzás alatt, commit a művelet végén (teljesítmény).

### 5.6 Export

* **Markdown:** modulonként `toMarkdown()`, a `docs/` sablonjainak fejezetszerkezetét követve; kimenet egy mappa (zip) a `docs/` felépítésével.
* **JSON:** teljes projekt, vagy dokumentum.
* **CSV:** táblák (itemek, tesztesetek, backlog).
* **Kép/SVG/PNG:** gráfok és diagramok exportja.
* **Később:** Unity-barát JSON (adatvezérelt tervezéshez) és Mermaid kimenet a diagramokhoz.

### 5.7 Általános UX

* **Főmenü (Home):** csoportos kártyák a tervtípusokról (a 3.2 tábla szerint), keresés, „Continue", „New / Open project", haladásjelző (kitöltöttség), legutóbbi projektek.
* **Editor oldal:** bal oldalon navigáció (dokumentumok és entitások fája), középen a vizuális szerkesztő, jobb oldalon Inspector (kiválasztott elem részletes űrlapja), felül toolbar (mentés, undo/redo, export, nézetváltás: vizuális / tábla / Markdown előnézet).
* **Command palette** (Ctrl+K): ugrás tervhez, entitáshoz, hivatkozáshoz.
* **Globális keresés** entitásokra és szövegekre.
* **Kereszthivatkozások:** bármely entitásmezőből másik terv entitására lehet hivatkozni (pl. quest → frakció → biom); „Used by" panel és ugrás.
* **Validációs panel:** hiányzó kötelező mezők, törött hivatkozások, körkörös függések, nyitott kérdések.
* Sötét/világos téma, billentyűzetbarát és akadálymentes vezérlők.

## 6. Megvalósítási fázisok

Minden fázis végén működő, tesztelt, használható állapot.

| # | Fázis | Tartalom | Elfogadási kritérium |
|---|-------|----------|----------------------|
| **F0** | Projekt alapok | Vite+React+TS, ESLint/Prettier, Tailwind, router, i18n váz, CI, mappastruktúra | `npm run dev/build/test/lint` zöld |
| **F1** | Core: modell és perzisztencia | Project/Registry/Document modellek, Zod sémák, store + undo/redo, fájl mentés/betöltés, IndexedDB autosave, migrációs keretrendszer | Projekt mentése fájlba és visszatöltése azonos adatot ad (unit + e2e) |
| **F2** | Shell és főmenü | AppShell, sidebar, Home (csoportos kártyák a modul-regiszterből), command palette, kereső váz | Minden modul megjelenik a menüben placeholder szerkesztővel |
| **F3** | Szerkesztő-építőelemek I. | Form (sémavezérelt + custom fields), Data Table, Entity Card Grid + Inspector, Rich Text, Checklist, Kanban | Új entitás felvétele, szerkesztése, rendezése, undo/redo |
| **F4** | Registry / Definitions | Katalógusok (statok, igények, erőforrások, ritkaságok…), egyedi entitástípusok és mezők, referencia-ellenőrzés | Új stat felvétele az NPC modulban megjelenik kód nélkül |
| **F5** | Szerkesztő-építőelemek II. | Node Graph, Tree Editor, Matrix/Heatmap, Timeline/Gantt, Charts, Formula Editor, Wireframe Canvas, Palette | Mindegyik építőelemhez storybook-jellegű demó oldal + tesztek |
| **F6** | **Roadmap + Overview modulok** (első teljes vertikális szelet) | `vision`, `glossary`, `roadmap` (Gantt, gate-ek, kritikus útvonal), Markdown export | Az aktuális `docs/00_overview/roadmap.md` tartalma betölthető/visszaexportálható |
| **F7** | Design modulok I. | `core_loop`, `difficulty`, `factions_diplomacy`, `world_biomes`, `open_questions` | A modulok kitölthetők, mentés/betöltés/export működik |
| **F8** | Design modulok II. | `town_management`, `npc_system`, `player_character`, `items_crafting`, `trade_economy` (a Registry-re épülő, legmélyebb modulok) | Erőforrás-gráf, radar, skillfa, recept-gráf működik, bővíthető katalógusokkal |
| **F9** | Design modulok III. | `combat_enemies`, `time_weather_events`, `story_quests`, `ui_ux` | Quest-gráf, boss fázis gép, wireframe vászon működik |
| **F10** | Technical, Art/Audio modulok | `architecture`, `data_driven_design` (séma-szerkesztő), `ai_systems`, `save_system`, `performance`, `tools`, `coding`, ADR, art/audio/asset | Séma-szerkesztő JSON Schema exportot ad |
| **F11** | Production és QA modulok | `milestones`, `backlog`, `risk_register`, `team_workflow`, `release_checklist`, `test_plan`, `balance_plan`, `bug_report`, `feature_spec` | Kockázati mátrix, backlog kanban, tesztmátrix működik |
| **F12** | Kereszthivatkozás, validáció, export | „Used by", törött link jelentés, teljes Markdown zip export a `docs/` szerkezetében, CSV/PNG export | Teljes példaprojekt exportja megegyezik az elvárt docs struktúrával |
| **F13** | Polírozás | Akadálymentesség, teljesítmény (nagy gráfok), onboarding/példa projekt, súgó, magyar fordítás (opcionális) | Teljesítmény: 1000 csomópontos gráf folyékony; Lighthouse a11y ≥ 90 |

**Ajánlott sorrend indoklása:** először a közös alapok és egy teljes, vertikális szelet (F6), ami bizonyítja az architektúrát; utána a design modulok, mert azok adják a legnagyobb értéket a játék tervezéséhez; a technikai és produkciós modulok lehetnek egyszerűbbek.

## 7. Tesztelési stratégia

* **Unit:** sémák, migrációk, referencia-ellenőrzés, Markdown generálás (snapshot tesztek), képletkiértékelés.
* **Komponens:** építőelemek (táblázat szerkesztés, gráf csomópont felvétel, kanban húzás).
* **Roundtrip teszt minden modulra:** `createEmpty → szerkesztés → mentés → betöltés → egyenlőség`.
* **Migrációs tesztek:** régi formátumú fixture-ök betöltése.
* **E2E (Playwright):** projekt létrehozása, szerkesztés, mentés fájlba, újratöltés, export letöltés.
* **Teljesítmény:** nagy projekt (pl. 5000 entitás) betöltési és szerkesztési idő.

## 8. Kockázatok és megoldások

| Kockázat | Hatás | Megelőzés |
|----------|-------|-----------|
| Túl általános (over-engineering) séma | Lassú fejlesztés | Először F6 vertikális szelet, a modul interfész csak a bizonyított igényekre bővül |
| Vizuális szerkesztők komplexitása (gráf, Gantt, vászon) | Csúszás | Kész könyvtárak (React Flow, Konva), saját csak ahol muszáj (Gantt) |
| Fájlformátum változása → adatvesztés | Elveszett munka | Verziózás, migráció, snapshotok, ismeretlen mezők megőrzése |
| Nagy projektfájl lassúsága | Rossz UX | Szeletelt store, virtualizált táblák, debounce-olt mentés |
| Markdown export eltér a docs sablonoktól | Inkonzisztens docs | Snapshot tesztek a sablon szerkezetére |
| Egyedi típusok/mezők miatt törékeny hivatkozások | Hibás tervek | ID alapú hivatkozások, referencia-ellenőrzés törléskor |
| File System Access API nem minden böngészőben | Mentési kényelem | Letöltés/feltöltés fallback, autosave IndexedDB |

## 9. Nyitott kérdések (a megvalósítás során egyeztetendő)

1. **Egy fájl vagy több?** Alapértelmezés: egy projektfájl; kell-e „mappa alapú" mentés (minden dokumentum külön fájl, Git-barát diffekhez)?
2. **Markdown visszaolvasás (import)?** Jelenleg csak export; kell-e a meglévő `docs/*.md` beolvasása (parser), vagy elég egy egyszeri példaprojekt?
3. **Képek kezelése:** beágyazás (base64) vagy külső fájlok/URL?
4. **Telepítés:** csak helyi `npm run dev`/statikus build, vagy kell csomagolás (pl. Tauri/Electron) is?
5. **Több nyelv:** csak az UI vagy a tartalom is nyelvenként (HU/EN mezők)?
6. **Unity-integráció:** kell-e később az adatok exportja Unity adatformátumba (ScriptableObject JSON)?

## 10. Első lépések (F0–F1 részletes feladatlista)

1. `npm create vite@latest . -- --template react-ts`; Tailwind, ESLint, Prettier, Vitest beállítása.
2. Mappastruktúra létrehozása (5.1), `core/model` Zod sémák: `Project`, `Registry`, `DocumentEnvelope`, `Ref`.
3. Zustand store + Immer patches alapú undo/redo, unit tesztek.
4. `persistence/`: `serialize/deserialize`, migrációs lánc, File System Access + fallback, IndexedDB autosave.
5. `PlannerModule` interfész és modul-regiszter; egy placeholder modul.
6. AppShell + Home oldal a regiszterből; „New / Open / Save" működik.
7. CI (lint, typecheck, test, build).

## 11. Szabályalapú tippmotor (Hints, nem AI)

**Cél:** a projekt állapotát és az aktuálisan megnyitott szerkesztőt figyelve automatikusan, determinisztikus szabályokkal tippeket adni (pl. „nincs még core loop”, „az itemeknek nincs ritkaságuk”, „a quest hivatkozik nem létező NPC-re”). Nincs hálózat, nincs modell: tiszta függvények a `Project` + `EditorContext` felett.

### 11.1 Elvek
* A meglévő `validateProject` (`core/references/refs.ts`) **hibákat** jelez („ez rossz”); a tippmotor **javaslatokat** ad („ez hiányzik / ezt érdemes”). Közös `Issue`-szerű alakot használnak, de külön szabályhalmaz és külön UI.
* Szabály = tiszta függvény, nincs mellékhatás, könnyen tesztelhető.
* Bővíthető: új szabály fájl hozzáadása elég (mint a modulregiszter), a modulok maguk is hozhatnak szabályokat (`PlannerModule.hints?`).
* Nem tolakodó: elvethető, némítható, nem blokkol.

### 11.2 Típusok (`core/hints/types.ts`)
```ts
type HintContext = {
  project: Project
  docId?: string; sectionId?: string      // aktuális szerkesztő (route + ?s=)
  selectedEntityId?: string               // kijelölt elem, ha van
  idleMs?: number; lastEditAt?: number    // aktivitás
}
type Hint = {
  id: string                    // stabil: ruleId + célpont (dismisshez)
  ruleId: string
  severity: 'info' | 'suggest' | 'important'
  scope: 'project' | 'document' | 'section' | 'entity'
  target: { docId: string; sectionId?: string; entityId?: string }
  titleKey: string; bodyKey: string; params?: Record<string, string|number>  // i18n (en/hu)
  action?: { kind: 'goto' | 'addEntity' | 'setField' | 'openHelp'; payload: unknown }
}
type HintRule = {
  id: string
  scope: Hint['scope']
  appliesTo?: (ctx: HintContext) => boolean   // gyors előszűrés (pl. csak ha docId==='items')
  evaluate: (ctx: HintContext) => Hint[]
}
```

### 11.3 Szabálykategóriák (kezdő készlet)
| Kategória | Példa szabályok |
|-----------|-----------------|
| Teljesség | üres dokumentum/szekció, kitöltetlen kulcsmezők, 0 elem egy kötelező gyűjteményben, Vision nélkül nincs Core Loop javaslat |
| Függőségi sorrend | Roadmap: ha nincs vision → először azt; Items előtt legyenek resource/skill katalógusok; QA tesztterv ha vannak már feature-ök |
| Konzisztencia | elem sehol sem használt (árva NPC/item/frakció), gráf elszigetelt csomópont, quest nem hivatkozik jutalomra, frakciópár hiányzik a mátrixból |
| Egyensúly | statisztikai heurisztikák: ritkaságonként 0 item, ár/érték kiugró (> 3σ vagy IQR), nehézség-radar szélsőérték, gazdasági forrás van, nyelő nincs |
| Képlet | formula változó nincs definiálva, osztás nullával lehetséges, tartományon kívüli előnézet |
| Folyamat | milestone dátum a múltban, backlog elem tulajdonos/becslés nélkül, release checklist üres kritikus pont |
| Szerkesztő-specifikus | gráf: nincs start/end csomópont, ciklus; kanban: egy oszlopban >N elem (WIP); timeline: átfedő lane |
| Onboarding | első megnyitás, üres projekt: javasolt következő 3 lépés a `docs/` sorrendje alapján (vision → core loop → player → ...) |

A szabályok a **séma meta-adatából** általánosan is generálhatók (pl. `required`, `ref` mezők), így az egyedi (felhasználói) mezők/típusok is kapnak alap tippeket kódmódosítás nélkül.

### 11.4 Motor (`core/hints/engine.ts`)
1. `collectRules()` – beépített (`core/hints/rules/*.ts`) + modulok `hints` + opcionális felhasználói szabályok (lásd 11.7).
2. `evaluateHints(ctx)`:
   * `appliesTo` szűrés → `evaluate` → egyesítés.
   * **Rangsor:** kontextus-relevancia (azonos doc/szekció/entitás előre) → severity → ritkaság; max. ~5 aktív tipp egyszerre.
   * **Szűrés:** elvetett (dismissed), némított szabály, snooze-olt tipp kiszűrve.
3. **Teljesítmény:** a projekt-szintű szabályok futnak debounce-olva (300–500 ms a store változás után), memoizálva a `documents[docId]` referencia-azonossága alapján (Immer miatt változatlan doc = ugyanaz a referencia). A szerkesztő-szintű szabályok csak az aktív doc-ra futnak. Nagy projektnél Web Workerbe emelhető (a szabályok tiszta függvények, szerializálható bemenet).

### 11.5 Állapot és perzisztencia
* `core/hints/hintStore.ts` (külön Zustand store): `dismissed: Record<hintId, true>`, `snoozedUntil: Record<hintId, number>`, `mutedRules: string[]`, `settings` (be/ki, gyakoriság, minimális severity).
* A felhasználói preferenciák a **projektfájlba** kerülnek (`project.meta.hints`, formátumverzió + migráció), hogy csapattal megosztva is konzisztensek legyenek; a „csak nálam” beállítások (be/ki) localStorage/IndexedDB.
* A dismissed állapot a stabil `hint.id` miatt túléli az újratöltést; ha a feltétel megszűnik, a bejegyzés automatikusan törlődik (GC).

### 11.6 UI
* **Hint panel** a `EditorPage` jobb oldalán (összecsukható) – az aktuális szekció tippjei, kártyán: cím, indoklás, akciógomb („Ugrás”, „Elem hozzáadása”), „Később”, „Elvet”, „Ne mutasd ezt a szabályt”.
* **Inline jelzők:** mezők/elemek mellett kis 💡 ikon (a `FieldInput`/`CollectionEditor` a `target` alapján).
* **AppShell badge** (mint az Issues-nál) a projekt-szintű tippek számával; **Home** oldalon „Következő lépések” blokk.
* **Hint-beállítások** oldal: ki/be, kategóriák, némított szabályok listája (visszaállítás), „összes elvetett visszaállítása”.
* Kontextus-követés: `useHintContext()` hook a router paramjaiból (`docId`, `?s=`), kijelölésből és az aktivitás-időzítőből; tippváltás ne villogjon (stabil rendezés, animáció nélküli csere gépelés közben).
* Hozzáférhetőség: `aria-live="polite"`, billentyűzettel kezelhető.
* A „tipp szövege” i18n kulcsokból (`hints.<ruleId>.title/body`), en + hu.

### 11.7 Bővíthetőség
* Szabály hozzáadása = új fájl `core/hints/rules/<téma>.ts` + export a tömbbe; a modulok `hints: HintRule[]` mezője opcionális.
* **Deklaratív szabályok** JSON-ban (kódmódosítás nélkül, a 4. fejezet szellemében): `{ when: { doc, section, condition }, hint }` – feltételek: `count`, `isEmpty`, `field op value`, `refMissing`, `unused`. Felhasználói definíciók a `registry`-ben (`registry.hintRules`).
* Egyszerű DSL a feltételekhez (nem `eval`!): a meglévő `core/formula.ts` biztonságos kiértékelőjét újrahasznosítva.

### 11.8 Fázisok
| Fázis | Tartalom | Kész, ha |
|-------|----------|----------|
| H0 | Típusok, motor, hintStore, `HintContext` hook, 3 minta szabály (üres doc, árva entitás, hiányzó vision) | Egységteszt zöld, panel megjelenik |
| H1 | Hint panel + badge + elvetés/halasztás/némítás, en/hu szövegek | UI teszt (`editing.test.tsx` mintájára) |
| H2 | Teljes kezdő szabálykészlet (11.3), séma-alapú általános szabályok | Szabályonként ≥1 pozitív és negatív teszt |
| H3 | Szerkesztő-specifikus (gráf, kanban, timeline, mátrix) és egyensúly-heurisztikák | Küszöbök konfigurálhatók |
| H4 | Deklaratív felhasználói szabályok, beállítás-oldal, perzisztencia-migráció | Régi projektfájl betölthető |
| H5 | Finomhangolás: relevancia-rangsor, teljesítmény mérés, Worker ha kell | 1000+ elemes projekten <50 ms/frissítés |

### 11.9 Tesztelés
* **Szabály-egységtesztek** (`tests/hints.test.ts`): minimális `Project` fixture → elvárt `Hint[]`; a `examples/seeded.hohplan.json` golden-snapshot.
* Motor: rangsor, limit, dismissed/snooze/mute, GC, determinizmus (azonos bemenet → azonos sorrend).
* UI: panel a route-nak megfelelő tippeket mutatja, akciógomb navigál/ad hozzá elemet.
* Teljesítmény: benchmark nagy generált projekttel.

### 11.10 Kockázatok
| Kockázat | Megoldás |
|----------|----------|
| Tipp-zaj, idegesítő | Max. 5 aktív, severity-küszöb, dismiss/mute, gépelés közben nem frissül (debounce + idle) |
| Hamis pozitívok | Szabályonként tesztek, „Ne mutasd” gomb, konzervatív küszöbök |
| Lassúság | Memoizálás doc-referencia szerint, aktív doc-ra szűkítés, Worker |
| Szabálysprawl | Kategóriák, egységes sablon és tesztelési minta |

### 11.11 Döntések és megvalósítási állapot
1. A dismissed/némított szabályok és a beállítások a projektfájlban (`meta.hints`) tárolódnak; a halasztás (snooze) csak munkamenetre szól.
2. Automatikus akciók (`addEntity`) csak megerősítés után futnak.
3. Az egyensúly-küszöbök projektenként állíthatók (Hints oldal).
4. Forrás-jelölés/`docs/` hivatkozás nem kell.

**Megvalósítva (H0–H4):** `src/core/hints/` (típusok, motor, szabályok, deklaratív szabályok), `src/ui/hints/` (panel, beállítások, hook), `/hints` útvonal, AppShell badge, Home „Next steps”, tesztek: `tests/hints.test.ts`, `tests/editing.test.tsx`.
**Hátra / későbbi:** az elavult dismissed bejegyzések automatikus törlése (GC), Web Worker (H5 mérés után).

## 12. Opcionális AI integráció (API kulccsal)

**Döntések (egyeztetve):**

| Téma | Döntés |
|------|--------|
| Szolgáltatók | OpenAI, Anthropic (Claude), Google Gemini |
| Kulcs tárolása | Csak a munkamenetben (memória); nem kerül sem a projektfájlba, sem localStorage/IndexedDB-be, sem autosave-be, sem exportba |
| Módosítások | Mindig diff + jóváhagyás; az AI soha nem ír közvetlenül a projektbe |
| Kontextus | A felhasználó választja ki kérésenként, mit kap az AI |
| Költség | Tokenbecslés küldés előtt + napi/havi limit a beállításokban |
| Funkciók | Chat, tartalomgenerálás, elem kibővítés/átírás/fordítás, konzisztencia- és egyensúly-review, hint-magyarázat és -kiegészítés, képlet/gazdasági javaslat, dokumentum-összefoglaló/Markdown, kérdések a `docs/` alapján |

### 12.1 Alapelvek
* **Teljesen opcionális:** kulcs nélkül az app és a szabályalapú tippmotor (11. fejezet) változatlanul működik; az AI UI-elemek rejtettek/letiltottak. A `core/ai/` modul lazy-loadolt, nincs hatása a bundle-re, ha nem használják.
* **Nincs saját backend:** a böngésző közvetlenül hívja a szolgáltatót (BYOK). Emiatt a kulcs a felhasználó gépén marad; ezt a beállítások oldalon egyértelműen jelezni kell.
* **Az AI csak javasol:** minden eredmény egy *javaslat* (`AiProposal`), amit a felhasználó diffben lát és hagy jóvá.
* **Adatvédelem:** csak az küldhető el, amit a felhasználó kijelölt; küldés előtt előnézet a pontos tartalomról és a tokenbecslésről.

### 12.2 Architektúra (`core/ai/`)
```
core/ai/
  types.ts            // AiProvider, ChatMessage, AiRequest, AiProposal, Usage
  providers/
    openai.ts         // /v1/chat/completions vagy /v1/responses, streaming (SSE)
    anthropic.ts      // /v1/messages, fejléc: anthropic-dangerous-direct-browser-access
    gemini.ts         // generativelanguage.googleapis.com, streamGenerateContent
    index.ts          // regisztráció (új szolgáltató = új fájl)
  session.ts          // memória-only kulcs- és beállításkezelés (Zustand, nem perzisztált)
  context.ts          // kontextus-építő a kijelölés alapján + méretkorlát
  tokens.ts           // tokenbecslés (karakter/4 heurisztika, szolgáltatónként kalibrálható)
  budget.ts           // napi/havi limit, használat-számláló
  tools.ts            // strukturált kimenet sémák (Zod) a javaslatokhoz
  prompts/            // rendszer-promptok funkciónként, en/hu
  proposals.ts        // AiProposal -> patch -> diff -> alkalmazás
  docsIndex.ts        // `docs/` keresés (lásd 12.6)
```
* **Provider interfész:** `stream(req, signal): AsyncIterable<Chunk>` + `complete(req)`; közös hibatérkép (401 érvénytelen kulcs, 429 rate limit, hálózat, CORS, megszakítás). Megszakítás `AbortController`-rel.
* **Modellválasztás:** szolgáltatónként a modelllista a beállításokban szerkeszthető (nem hardcode-olt), alapértelmezett modell előre kitöltve.
* **Strukturált kimenet:** módosító funkcióknál a modell JSON-t ad vissza, amit Zod sémával validálunk (a modul mezősémájából generálva: `FieldDef` → JSON Schema). Érvénytelen kimenet: egyszeri automatikus újrapróbálás hibaüzenettel, utána hiba a felhasználónak.

### 12.3 Kulcskezelés
* A kulcs csak a `session.ts` memóriaállapotában él; oldal-újratöltéskor elvész (újra be kell írni). Ez tudatos döntés.
* Soha nem kerül be: projektfájl, autosave/snapshot, Markdown export, hibajelentés, konzol-napló. Az `aiSettings` külön store, a `project` objektumon kívül; teszt ellenőrzi, hogy a szerializált projekt nem tartalmazza.
* Jelszókezelő-barát `type="password"` mező, „Kulcs törlése” gomb, „Kapcsolat tesztelése” (olcsó hívás).
* Szigorú CSP javaslat: `connect-src` csak a három szolgáltató domainjére; harmadik fél szkript nincs.
* Figyelmeztetés a beállításokban: a böngészőből hívott API kulcs XSS esetén kiszivároghat; ajánlott korlátozott jogosultságú, költséglimites kulcs.

### 12.4 Funkciók és UI
Közös UI: **AI panel** (a jobb oldali hint-panel mellett/alatt fül: „Hints | AI”), kontextus-választó, tokenbecslés-sáv, „Küldés” / „Megszakítás”, előzmények a munkamenetben (nem perzisztált).

| Funkció | Működés | Kimenet |
|---------|---------|---------|
| Chat asszisztens | Szabad beszélgetés a kijelölt kontextussal, streaming | Szöveg; „Javaslat készítése” gomb szövegből `AiProposal`-t |
| Tartalomgenerálás | A kollekció szekcióban „✨ Generate”: darabszám + irány megadása; a modul sémája alapján | N új elem javaslatként (diff: csupa hozzáadás) |
| Elem kibővítés/átírás/fordítás | Elem/mező menüjében: „Bővítés”, „Átírás (stílus)”, „Fordítás HU/EN” | Mező-szintű diff (régi → új) |
| Konzisztencia- és egyensúly-review | Kiválasztott dokumentumok/szekciók elemzése (hivatkozások, ellentmondások, kiugró értékek) | Strukturált találatlista (súlyosság, hely, indoklás), kattintásra ugrás; opcionálisan javított mezők javaslata |
| Hint-magyarázat és -kiegészítés | A hint kártyán „Magyarázd el”; a szabály-hint + érintett adatok alapján bővebb indoklás és javítási lépések | Szöveg + opcionális `AiProposal` a javításra; az AI-hint külön jelölt, soha nem keveredik a szabályalapúval |
| Képlet / gazdasági egyensúly | A képlet-szekcióban: bemenet a képletek, változók, releváns táblák; kérés: egyensúly-ellenőrzés, alternatív képlet, példaszámok | Képletjavaslat (`expr` + `vars`) diffben; a javasolt képletet a `core/formula.ts` kiértékelővel validáljuk, érvénytelen nem javasolható |
| Dokumentum összefoglaló / Markdown | Dokumentum vagy projekt összefoglalása, Markdown-szöveg generálás | Szöveg (másolás / „Beszúrás richtext szekcióba” diffen át) |
| Kérdések a `docs/` alapján | Természetes nyelvű kérdés a dokumentációra | Válasz forrás-hivatkozásokkal (fájl + szakasz) |

### 12.5 Javaslat → diff → jóváhagyás
* `AiProposal = { id, summary, ops: Op[] }`, ahol `Op = addEntity | updateField | removeEntity(nem engedélyezett az AI-nak) | setFormula | appendRichtext`. A törlés szándékosan kizárt.
* `proposals.ts` az opokat Immer-patchekké fordítja a *másolaton*; a UI a régi/új értéket mezőnként mutatja (zöld/piros), elemenként és mezőnként ki/be kapcsolható.
* Jóváhagyás után egyetlen `mutate` hívás → **egy undo lépés** (Ctrl+Z visszavonja az egész AI-módosítást).
* Alkalmazás előtt validáció: mezőtípusok, `ref` hivatkozások léteznek-e, enum értékek, `required`; hibás op automatikusan kihagyva, jelezve.
* Elavulás-védelem: ha a célelem a javaslat készítése óta változott, a diff újraszámolódik / figyelmeztet.

### 12.6 Kérdések a `docs/` alapján
A `docs/` a repóban Markdown, az app böngészőben fut, így a forrás kétféle lehet:
1. **A projekt saját Markdown exportja** (`core/export/markdown.ts`) – mindig elérhető, nincs extra lépés (alapértelmezett).
2. **Opcionális `docs/` mappa megnyitása** (File System Access API, fallback: fájlfeltöltés): a Markdown fájlok fejléc szerint darabolva, memóriában indexelve.
* Keresés AI nélkül: egyszerű kulcsszó/BM25-szerű pontozás a darabokon; a legjobb N darab kerül a promptba forrás-azonosítóval, a válasz hivatkozik rájuk. Nincs embedding/vektor-DB az első körben.

### 12.7 Kontextus-választó és adatvédelem
* Kérésenként választható: aktuális szekció / dokumentum / kijelölt elemek / több dokumentum / egész projekt, plusz „hivatkozott elemek is” kapcsoló.
* A panel mutatja a pontos elküldendő szöveget (összecsukható) és a tokenbecslést; méretkorlát felett figyelmeztet, és kérés nélkül nem vág le csendben.
* Alapértelmezés: az aktuális szekció; a választás nem perzisztált (kérésenként újra).

### 12.8 Költség és limitek
* Küldés előtt: becsült bemeneti token + várható kimenet (max_tokens beállítás) → becsült költség a beállítható árlista alapján (az árak a beállításokban szerkeszthetők, mert változnak).
* Napi/havi limit (token vagy összeg, a felhasználó választja) a beállításokban; a számláló a szolgáltató által visszaadott tényleges használatból frissül. Mivel a kulcs csak memóriában él, a limit-számláló és a limitértékek helyi (localStorage) beállítások, **kulcs nélkül**. Limit elérésekor a küldés blokkolt, felülbírálható megerősítéssel.
* Egy kérés kimeneti tokenkorlátja és időtúllépése konfigurálható; megszakítás után a már megkapott tokenek is elszámolódnak.

### 12.9 Hibakezelés és biztonság
* Hibák: érvénytelen kulcs, kvóta/429 (exponenciális backoff max. 2 próba), hálózat/CORS, tartalomszűrés, érvénytelen strukturált kimenet; mind érthető (en/hu) üzenettel.
* **Prompt injection:** a projekt tartalma adat, nem utasítás – a rendszerprompt ezt rögzíti; az AI nem hívhat eszközt, csak javaslatot adhat, az alkalmazás pedig csak az engedélyezett opokat hajtja végre, jóváhagyással.
* A modell kimenete soha nem kerül HTML-ként renderelésre (Markdown megjelenítés szanitizálva).
* i18n: UI en/hu; a prompt nyelve a projekt/UI nyelvéhez igazodik, felülbírálható.

### 12.10 Fázisok
| Fázis | Tartalom | Kész, ha |
|-------|----------|----------|
| A0 | `core/ai` váz, provider interfész, **Anthropic + OpenAI + Gemini** streaming, session-store, beállítás-oldal (kulcs, modell, kapcsolat-teszt) | Mock szerveres tesztek zöldek mindhárom providerre; kulcs nincs a szerializált projektben |
| A1 | AI panel, kontextus-választó, tokenbecslés, limitek, chat | Streaming, megszakítás, limit-blokkolás UI teszt |
| A2 | Javaslat → diff → jóváhagyás motor, egyetlen undo lépés | Op-ok validációja és alkalmazása tesztelt |
| A3 | Tartalomgenerálás, elem bővítés/átírás/fordítás | Séma-valid kimenet, diff UI |
| A4 | Hint-magyarázat/-kiegészítés, konzisztencia/egyensúly review, képlet-javaslat | Képlet-validáció, találatlista navigációval |
| A5 | Dokumentum-összefoglaló, `docs/` kérdezés (index + hivatkozások) | Forráshivatkozásos válasz teszt |
| A6 | Finomhangolás: promptok, hibaüzenetek, CSP, dokumentáció | Manuális átvizsgálás, README frissítve |

### 12.11 Tesztelés
* Provider-tesztek mock `fetch`/SSE folyammal (normál, hiba, megszakítás, részleges chunk).
* Kulcs-szivárgás tesztek: szerializált projekt, autosave, Markdown export, snapshot nem tartalmazza.
* Javaslat-motor: érvénytelen ref/enum kihagyása, undo = egy lépés, törlés op elutasítása.
* Költségszámítás és limitek; kontextus-építő méretkorlát.
* UI: kulcs nélkül minden AI elem rejtett/letiltott; hint „Magyarázd el” folyam mock providerrel.
* Valódi API-hívás csak kézi, opcionális smoke teszt (nincs a CI-ben).

### 12.12 Kockázatok
| Kockázat | Megoldás |
|----------|----------|
| CORS/böngészős hívás korlátai (pl. Anthropic külön fejléc) | Providerenként kezelve és dokumentálva; hibaüzenet útmutatással |
| Kulcs kiszivárgása | Csak memória, CSP, figyelmeztetés, nincs perzisztálás |
| Váratlan költség | Előzetes becslés, limitek, max_tokens |
| Rossz/halucinált tartalom | Mindig diff + jóváhagyás, séma- és ref-validáció, AI-tartalom jelölése |
| Provider API-változások | Vékony provider réteg, modell- és árlista szerkeszthető |

### 12.13 Nyitott kérdések
1. A `docs/` mappát az app csak a felhasználó által megnyitva olvassa (File System Access), vagy legyen a build része is egy beágyazott másolat?
2. Az AI-javaslatok kapjanak-e „AI” jelölést az elemeken (pl. kis ikon), hogy később is látszódjon, mi generált?
3. Szükség van-e promptsablonok szerkesztésére/mentésére a projektfájlban (a kulcs nélkül, csak a sablonok)?
4. Egyedi modellnevek/árak kézi megadása elég, vagy legyen modelllista-lekérés az API-ból?

### 12.14 Döntések és megvalósítási állapot

- Dokumentáció: beágyazott `docs/` másolat + opcionális mappa megnyitása (memóriában).
- AI által létrehozott/módosított elemek 🤖 jelölést kapnak (`_ai` mező).
- Prompt sablonok a projektfájlban (`meta.aiTemplates`).
- Modelllista a szolgáltatói API-ból (kézi megadás regex-validálással).
- Állapot: A0–A6 megvalósítva (`src/core/ai`, `src/ui/ai`, `/ai` beállítások, AI fül a jobb sávban), tesztek: `tests/ai.test.ts`.
- Ismert korlátok: a tipp-magyarázat csak szöveg; richtext hozzáfűzés nem kap `_ai` jelölést; a CSP és az élő szolgáltatói hívások böngészőben/valódi kulccsal nem lettek ellenőrizve.
