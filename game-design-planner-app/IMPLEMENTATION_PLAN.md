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
