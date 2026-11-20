# Motorintegráció terve: Unity elsőként, Godot és Unreal később

Status: **5. fázis kész (összekapcsolt motor-mappa).** Tervező: `src/core/engine/folder.ts` — a csomag írása egy mappába a File System Access API kis interfészén át (`Folder`/`FolderFile`, amit a `FileSystemDirectoryHandle` teljesít, tesztben memóriamappa): változatlan fájlt nem ír újra, a saját `Unity/Scripts/Classes/**` fájlt csak hiányzáskor hozza létre, a manifestet írja utoljára (így a motor teljes exportot lát), és elavult generált fájlt (a `.meta`-jával együtt) csak akkor töröl, ha a mappában már volt export — rossz mappa választásakor semmi nem vész el; Unity-projekt gyökerét választva az `Assets/HoHPlanner`-be ír; `src/ui/engineLink.ts` — a mappa-handle ebben a böngészőben, IndexedDB-ben (`idb-keyval`), projektenként, sosem a projektfájlban; jogosultság-kérés; „Write the export on every save (Ctrl+S)” (alapból be): a fájlmentés és a felhős Ctrl+S után ír; a riport visszaolvasása gombra és ablakfókusz-visszatéréskor, ha újabb (egy visszavonható lépés); figyelmeztetés más projekt exportját vagy nem üres, export nélküli mappát választva; *Engine export* nézet „Engine folder” panel (Link / Write now / Read report / Unlink, utolsó írás eredménye); Firefox/Safari és IndexedDB nélküli környezet: magyarázat és ZIP. Unity: `PlannerFolderWatcher` (AssetPostprocessor) — ha a tervező mappájában a `hoh-engine.json` újraimportálódik a csomag saját importján kívül, `MarkPending` → a rekordlépés most vagy a fordítás utáni reload után fut, és riportot ír; beállítás: *Import when the planner writes*. Tesztek: `tests/engineFolder.test.ts`, `tests/engineFolderUi.test.tsx` (`tests/memoryFolder.ts`), Unity: `FinishesTheImportWhenThePlannerWroteTheFolder`. **Unity 6-ban ellenőrizve:** 14/14 EditMode-teszt zöld; a tervező mappaírója (Node fájlrendszer-adapterrel a böngésző handle helyett) a módosított Cinderholmot közvetlenül a Unity-projektbe írta (3 írt, 87 változatlan, 7 saját fájl megtartva), majd a Unity pusztán megnyitásra magától befejezte az importot (0 új, 51 frissített; a Plank értéke 2 → 3), a kézzel írt kód megmaradt. 5. fázis eltérések: a böngészős folder-picker és jogosultságkérés valódi Chrome-ban nem lett kipróbálva (a jsdom-teszt és a Node-adapter fedi a logikát); a link kulcsa a projekt létrehozási ideje + neve, így átnevezett projektnél újra kell linkelni.

4. fázis: **kész (Unity → tervező visszajelzés).** Formátum: `hoh-engine-report` v1 (`src/core/engine/report.ts`: Zod-séma, 20 MB korlát, rekordállapot `implemented` / `incomplete` (okokkal) / `missing` / `deprecated`, osztályállapot `implemented` / `stub` (TODO-k száma) / `missing`, `metrics` helye a 7. fázisnak, `irHash` = az export `ir/engine-ir.json`-jának hash-e). Unity-oldal: `PlannerReport` írja minden import és validálás után (`Assets/HoHPlanner/hoh-engine-report.json`, menü/ablak: *Write report for the planner*), a validátor találataiból; az osztályokat a Unity-adapter (4-es kimenet nélküli bővítés, v3 maradt) új `Scripts/Generated/classes.json` indexe köti a tervező-ID-hez, a TODO-kat a saját fájlban számolja. Tervező: *Save ▾ / Beállítások › Import engine report…* (egy visszavonható lépés; csak a tárolt riport változik, a terv soha), tárolás a `meta.engine.report`-ban tömören és olvasáskor újravalidálva (sérült riport figyelmen kívül), ismeretlen ID-k kihagyva figyelmeztetéssel, más projekt és régebbi export jelezve; `EngineBadge` minden tartalom-bejegyzés kártyáján és Inspector-fejlécében (ikon + szöveg, nem csak szín), *Engine export* nézet „Engine status” panel (összegzés, sémánkénti tábla: kész / hiányos / hiányzó / kivezetett / nincs a motorban, befejezendő rekordok okokkal, meg nem írt osztályok, elavult-jelzés), osztálydiagram-dobozokon állapotsor, hintek: `engine.incomplete`, `engine.stale`, `engine.classes` (en/hu); tesztek: `tests/engineReport.test.ts`, `tests/engineReportUi.test.tsx`, Unity: `WritesAReportOfRecordsAndClassesForThePlanner`. **Unity 6-ban ellenőrizve:** 13/13 EditMode-teszt zöld; a Cinderholm újraimportja után a valódi riport 75 rekordot (24 kész, 51 hiányos okokkal) és 10 osztályt (4 megírt, 6 TODO-val) jelent, és a tervező figyelmeztetés nélkül, nem elavultként olvassa be, a sémánkénti számok és a hintek egyeznek. 4. fázis eltérések: a tárolás a `meta.engine.report`-ban van (nem külön `project.engine`), `FORMAT_VERSION` emelés nélkül, mint a célmotor; a Pipeline readiness tábla és a Roadmap/milestone-készültség még nem használja a riportot (a 7b / P fázisba tartozik); a riport a `metrics` mezőt üresen küldi (gyűjtés a 7. fázisban).

3. fázis: **kész (Unity-oldali importáló).** `engine-packages/unity/com.handsofhubris.planner-bridge/` UPM-csomag (Unity 2022.3+, függőség: `com.unity.nuget.newtonsoft-json`): `Runtime/PlannerIndex` (plannerId / kulcs → asset, futásidőben `TryGet<T>(Ids.Item.IronSword, …)`); `Editor/`: `PlannerBundle` (zip vagy mappa, közös gyökérmappa levágva, `..`/meghajtó/abszolút út tiltva, méretkorlátok), `PlannerManifest` (`hoh-engine` v1, újabb verzió érthető hibával elutasítva, adat-only csomag felismerve), `PlannerImporter` (1. lépés: fájlok — generált mappák cseréje és elavult fájlok törlése, a saját `Unity/Scripts/Classes/**` fájl csak hiányzáskor jön létre; 2. lépés: rekordok — natív sémánként a `SchemaId` konstans alapján megtalált típusból ScriptableObject `Records/<Típus>/<kulcs>.asset`-ként, plannerId szerint újrahasználva, átnevezéskor az asset átnevezése, hivatkozások második körben, a tervből kikerült rekord megmarad „deprecated” jelzéssel; a 2. lépés a fordítás utáni domain reload után magától folytatódik a `Library/HoHPlannerPendingImport.txt` jelző alapján), `RecordValues` (szín, vektor, enum az `EnumIds` táblán át, lista, rekord-hivatkozás, asset-út; üres/null tervezői érték soha nem törli az Inspectorban beállítottat), `PlannerValidator` (hiányzó asset, üres kötelező mező — jellemzően ikon/prefab —, kivezetett rekordra mutató hivatkozás), `PlannerInspectorHeader` (megjegyzés minden tervező-rekord Inspectorja fölött, „Open in planner”), `PlannerWindow` (*Window ▸ Game Design Planner*: beállítások, import, újraimport, validálás, a kijelölt rekord tervezői JSON-ja; *Tools ▸ Game Design Planner* menü), `PlannerCI` (`Import -hohBundle …`, `Validate`, kilépési kódok 0/1/2), `PlannerBridgeSettings` (`ProjectSettings/HoHPlannerBridge.asset`); EditMode-tesztek (`Tests/Editor`: manifest, bundle, értékkonverzió, import/újraimport/átnevezés/kivezetés, fájllépés a saját fájlok védelmével, szerződés a fixture-ökkel); `Tests/Editor/Fixtures/hoh-engine.schema.json` és `sample-manifest.json`-t a tervező írja, `tests/unityBridge.test.ts` ellenőrzi, hogy frissek (újraírás: `UPDATE_BRIDGE_FIXTURES=1`), és hogy minden fájlnak és mappának van egyedi GUID-ú `.meta`-ja (`node engine-packages/unity/make-meta.cjs`). A Unity-adapter 3-as verziója minden adattípusba `SchemaId` konstanst és `PlannerFields` (tervező mezőnév → C# mezőnév) táblát ír, az `EnumIds` pedig teljesen minősített enumneveket használ — a Unity 6 DLL-jeivel lefordítva derült ki, hogy enélkül az `EnumIds` mezője eltakarta az azonos nevű enumot. Ellenőrzés: a csomag (Runtime + Editor + Tests) és a Cinderholm-export teljes generált C#-a hiba nélkül fordul a .NET SDK-val a Unity 6000.0.40f1 `UnityEngine`/`UnityEditor` moduljai, a Newtonsoft és az NUnit ellen; a bundle- és manifest-olvasó lefutott a valódi Cinderholm ZIP-en (96 fájl, minden rekord megvan, v2 manifest elutasítva). 3. fázis eltérések: Addressables-csoportok és Unity Localization-táblák még nem készülnek (a fájlok ott vannak); a helyszín-importáló (Tilemap) és a mappa-/asmdef-váz parancs a 9. fázisba került; a `.meta` fájlokat a `make-meta.cjs` írja, nem a Unity (a Unity változatlanul elfogadta őket). **Unity 6000.0.40f1-ben ellenőrizve** (ideiglenes projekt, beágyazott csomag, batchmode): a csomag 12 EditMode-tesztje mind zöld (az első futás két hibát talált: a rekord `plannerId` mezője nem íródott be az assetbe — javítva —, és egy teszt mentetlen sprite-ot használt — mentett sprite-assetre cserélve); a Cinderholm-export a CI-recepttel (`PlannerCI.Import`, majd `PlannerCI.Validate`) importálva: 96 fájl, a generált kód hibátlanul fordul, 51 rekord-asset (16 tárgy, 11 épület, 24 ellenség) helyes értékekkel és scripthivatkozással; újraimportnál a kézzel módosított saját osztályfájl megmaradt, 0 új / 51 frissített asset, változatlan GUID-okkal; a validálás 1-es kóddal zárul a Cinderholm valódi hiányai miatt (11 épületnél üres a kötelező `buildCost`, 40 rekordnál még nincs ikon/prefab). Tanulság: a Unity-projektet a valódi útvonalán kell megnyitni, nem Windows 8.3 rövid útvonalon (`C:\Users\ABC~1\…`), különben az `Assets/` alatti scriptekhez nem kapcsol osztályt (a csomag README-je jelzi).

K fázis: **kész.** Technical Architecture › **Classes (code structure)** szekció (fajta, modul, ős, interfészek, mezők `-max: float`, metódusok `+TakeDamage(amount: float): float`, szükséges komponensek, felelősség, státusz), **Class diagram** nézet (UML-dobozok, ősök felül, öröklés/megvalósítás/igény/használat/adatséma vonalak, ellenőrzések: öröklési kör, fajtánként tiltott öröklés, nem-interfész megvalósítása, nem-komponens igénylése, rétegszabály és hiányzó modulfüggőség), Mermaid `classDiagram` export (.mmd) és import (beillesztés, név szerinti összefésülés egy visszavonható lépésben, csak üres mezőket tölt); `src/core/classes.ts`, `src/ui/editors/classViews.tsx`; az Engine IR 2-es verziója `classes` listát kap (semleges típusok + `class` és `engine` típus); a Unity-adapter 2-es verziója osztályonként `Scripts/Generated/Classes/X.Generated.cs`-t (mezők `[SerializeField]`-del, `[RequireComponent]`, `[CreateAssetMenu]`, ős + interfészek, C# 9 partial metódus-aláírások; enum, interfész, struct, static, eseménycsatorna `Raise`-szel) és — komponens, actor, adat- és eseményasset, valamint metódusos osztály esetén — egyszer létrejövő saját `Scripts/Classes/<Modul>/X.cs`-t ír a metódustörzsekkel (`NotImplementedException` / `// TODO`); az `.asmdef` a `Scripts/` gyökerébe került, hogy a partial osztály mindkét fájlja egy assemblyben legyen; tesztek: `tests/classes.test.ts`, `tests/classesUi.test.tsx`. K fázis eltérések: a névtér a modul `assembly` mezője, ha az pontozott azonosító, különben `Projekt.Modul`; minden osztály egy assemblyben marad (modulonkénti `.asmdef` nem készül, mert a partial osztályok nem léphetik át az assembly-határt); a sémák csak akkor jelennek meg a diagramon, ha egy osztály használja őket; az „ezt a tervező-entitást valósítja meg” kapcsolat és a Unity-oldali reflexiós eltérés-jelentés még nincs meg (az utóbbi a riporttal, az 5. fázisban jön); a „saját” fájlokat a ZIP minden exportkor tartalmazza — hogy egy meglévőt ne írjon felül, azt a README írja elő, automatikusan a 3. fázis importálója fogja betartani; a generált rész csak a `System`, `System.Collections.Generic`, `UnityEngine` és a projekt névtereit importálja, ezért más névtérbeli motortípus (pl. `Image` a `UnityEngine.UI`-ból) teljes névvel írandó (`UnityEngine.UI.Image`) — modulonkénti/osztályonkénti `using`-lista későbbi bővítés. A Cinderholm példa tíz osztályt kapott, szabálysértés nélkül.

2. fázis: **kész.** Típusnevek motorfüggetlenül (`parseField` a Unity/C#, Godot és Unreal írásmódot is ismeri, pl. `int32`, `FVector`, `PackedScene`, `TSoftObjectPtr<UTexture2D>`, `Array[Item]`, `TArray<T>`; a `FieldSpec` új `primitive`/`asset` mezője hordozza a semleges típust, a Record tester és a mintarekord is ezt használja); a Data-driven Design modul 3-as verzió: az érintetlen Unity-s „ScriptableObject” formátum-seed „Native data asset” lesz (ha bárki átírta, marad), az „Edited in” listában új semleges és Godot/Unreal opciók, a régiek érvényesek maradnak; **célmotor** a `meta.engine.target`-ben (beállítás → Architecture stack „Engine” sora → Unity), az Engine export nézet választójával állítható, a Save ▾ menüpont a célmotor nevét mutatja; motor adapter nélkül (Godot, Unreal) a csomag a motorfüggetlen részt adja (`adapterVersion: 0`, README jelzi); **sémánkénti mezőhozzárendelés** (`fieldMap` lista a sémán, „health ← hp”, „—” = nincs) az Engine export nézet „Field mapping” táblájából állítható, minden mező mellett állapottal; a `{ itemId: db }` alakú értékek lista-hivatkozásként olvasódnak. 2. fázis eltérések: a célmotor a terv `project.engine` helyett a `meta.engine`-ben van, opcionális mezőként, `FORMAT_VERSION` emelés nélkül (mint a `meta.profile` és `meta.guide`), és szövegként tárolódik, így ismeretlen érték betöltéskor nem hiba, csak figyelmen kívül marad; a Coding Standards `MITIGATIONS` / `REVIEW_CATEGORIES` listái nem változtak (a Unity-s elemek érvényes választások maradnak, motorfüggő javaslatlista később); a rekordmezők automatikus párosítása szigorúbb lett (csak rövidebb tervezőkulcs, amivel a mezőnév kezdődik), ezért a Cinderholm `workers` mezője most üres, és a hozzárendeléssel kell megadni.

1. fázis: **kész** (E1–E9 a javasolt alapértékkel elfogadva). Megvalósítva: `src/core/engine/` — `ir.ts` (`buildIR`, semleges típusok, rekordok, enumok, formulák, lokalizációs kulcsok, ellenőrzések), `formulaAst.ts` (a `formula.ts` nyelvtanával azonos fa), `adapter.ts` (adapter-interfész), `adapters/unity.ts` + `adapters/index.ts` (`ENGINE_ADAPTERS`), `manifest.ts` (`hoh-engine` v1 Zod-séma, JSON Schema, FNV-1a hash), `bundle.ts` (fájlok + determinisztikus ZIP `HoHPlanner/` alatt); UI: Data schemas › **Engine export** nézet (`src/ui/editors/engineViews.tsx`: motorválasztó, ellenőrzések, fájllista, előnézet, letöltés) és **Save ▾ / Beállítások › Export for Unity (.zip)**; tesztek: `tests/engineIR.test.ts`, `tests/engineAdapters.test.ts` (adapter-szerződés + Unity-kimenet + snapshot + bundle), `tests/engineExportUi.test.tsx`. 1. fázis eltérések: a rekordmezők név szerint töltődnek a tartalom-tervezőből (pontos egyezés, `title`/`label` → `name`, vagy rövidebb entitáskulcs, amivel a mezőnév kezdődik: `stack` → `stackSize`); ahol a séma mezőneve eltér a tervezőétől (Cinderholm: `buildCost` ↔ `cost`, `output` ↔ `result`, `health` ↔ `hp`), a mező üres marad és figyelmeztetés jelzi — **sémánkénti mezőhozzárendelés** a 2. fázisba került; minden katalógus enum lesz, a `values` enum csak katalógus nélküli `enum` mezőhöz; natív formátumú sémák rekordjai is semleges JSON-ként kerülnek a csomagba (a ScriptableObject-assetet a 3. fázis importálója hozza létre); a lokalizációs CSV-ben csak `en` oszlop van; a `name` mező natív sémában `displayName` lesz (a ScriptableObject `name` tagja miatt); `Mathf.Round` a feleket párosra kerekíti, ezt a generált `Formulas` osztály kommentje jelzi; a Godot és az Unreal a motorválasztóban letiltott „later” opció.

## Cél

A tervező ma dokumentumot és néhány motorfüggetlen exportot ad (Markdown, projekt-JSON, CSV, helyszín-JSON `hoh-location` v1, Tiled `.tmj`, VTT). A cél: **a tervben leírt adat, kódváz és állapot lehetőleg kézi másolás nélkül jusson el a játékmotorba, és a motorból a megvalósítás állapota (mi készült el, mi hiányzik, mit mértek a játékban) jusson vissza a tervezőbe.** A tervező marad a tervezési adatok egyetlen forrása, a motor-projekt pedig a megvalósításé.

**Az első célmotor a Unity**, de az architektúra kezdettől **motorfüggetlen magra + motoronkénti adapterekre** épül, hogy a **Godot** és az **Unreal Engine** később új adapterként, a mag és a formátumok módosítása nélkül kerülhessen be.

```
Projekt (.hohplan.json)
   │
   ▼
Motorfüggetlen mag  ── src/core/engine/
   • Engine IR: sémák, mezők semleges típusokkal, rekordok, ID-k, enumok,
     formulák AST-ként, lokalizációs kulcsok, gráfok, térképek
   • ellenőrzések, manifest, csomagolás, riport-import
   │
   ├── adapters/unity   → C#, ScriptableObject, Addressables, Unity Localization
   ├── adapters/godot   → GDScript/C# Resource, .tres, translation CSV      (később)
   └── adapters/unreal  → C++ USTRUCT/UDataAsset, DataTable CSV/JSON, FText  (később)
   │
   ▼
Motoroldali csomagok ── engine-packages/
   • unity/com.handsofhubris.planner-bridge   (UPM, C# editor)
   • godot/addons/hoh_planner                 (EditorPlugin, GDScript)      (később)
   • unreal/HoHPlanner                        (Editor plugin, C++/Python)   (később)
   │
   ▼
hoh-engine-report.json (motorfüggetlen) ──► vissza a tervezőbe
```

Az integráció négy rétegben épül, mindegyik önmagában is hasznos, és mindegyik a korábbira épít:

| Réteg | Irány | Mit ad | Motoroldali kód kell? |
|---|---|---|---|
| **A. Motor-export csomag** | tervező → motor | Semleges adat (JSON/CSV) + az adapter által generált kód, enumok, ID-konstansok, lokalizáció, térképek egy `.zip`-ben | Nem (a B-vel kényelmes) |
| **B. Motoroldali editor-csomag** | tervező → motor | Importáló, ami a motor natív adatassetjeit létrehozza/frissíti stabil ID alapján, validál, megmutatja a tervet | Igen, motoronként |
| **C. Visszajelzés (report)** | motor → tervező | Megvalósítási állapot, asset-hozzárendelések, validációs hibák, játékteszt-mérések — **motorfüggetlen formátumban** | Igen (a B része) |
| **D. Élő kapcsolat** | kétirányú | Összekapcsolt mappa, localhost híd, élő hangolás játék közben, felhős/CI-szinkron | Igen |

## 0. Eldöntendő kérdések (javasolt alapértelmezés az első)

| # | Kérdés | Javaslat | Indok |
|---|---|---|---|
| E1 | Mag vagy közvetlen Unity-export? | **Motorfüggetlen mag (Engine IR) + adapterek**, az első és egyetlen megvalósított adapter a Unity | Godot/Unreal később csak egy adapter és egy motoroldali csomag; a formátum, az ellenőrzések, a riport és a UI közös. A többletmunka most kicsi (egy köztes réteg), később nagy a megtakarítás. |
| E2 | Hogyan kerüljön adat a motorba? | **Saját, verziózott köztes formátum (`hoh-engine` v1: semleges JSON + adapter által generált kód) + motoroldali importáló**; natív bináris/GUID-függő assetet (Unity `.asset`, Unreal `.uasset`) a böngésző nem ír | A Unity YAML GUID-okra épül, az Unreal `.uasset` bináris; a köztes formátum tesztelhető és CI-ban is futtatható. Kivétel: a Godot `.tres` egyszerű szöveg, azt az adapter közvetlenül is írhatja (opcionális). |
| E3 | Melyik rekordformátum futásidőben? | **A projekt saját döntését követi** (Data-driven Design › Formats, sémánként); a formátumnevek semlegesek („native data asset”, JSON, CSV), az adapter fordítja le (ScriptableObject / Resource / DataAsset vagy DataTable) | A tervező már sémánként rögzíti a formátumot; a jelenlegi „ScriptableObject” opció motorfüggő név, átnevezése migrációval megy (lásd 2.5). |
| E4 | Hol él a motoroldali kód? | **Ebben a repóban, `engine-packages/<motor>/` alatt**, motoronként a natív terjesztési formában (UPM git URL, Godot addon mappa, Unreal plugin mappa) | Egy helyen verziózódik az exporttal; formátumváltozás és importálók egy PR-ban mozdulnak. |
| E5 | Élő kapcsolat módja | **Először File System Access API „összekapcsolt mappa”** (nincs CSP-változás), localhost WebSocket csak opt-in fejlesztői buildben | A production CSP `connect-src` listáját meg kell őrizni (CLAUDE.md). A mappa-alapú út mindhárom motorral ugyanúgy működik. |
| E6 | Ki az ID-k gazdája? | **A tervező** (`Entity.id`) + a séma `idPrefix`-e adja a stabil kulcsot (`item.iron_sword`); a motor saját azonosítója (Unity GUID, Godot `uid://`, Unreal asset path) csak hozzárendelési táblában él | Átnevezés ne törjön hivatkozást; mindhárom motorban ugyanaz a kulcs. |
| E7 | Kétirányú szerkesztés? | **Nem: a motorból csak asset-hozzárendelések és mért értékek jönnek vissza**; tervezési mezők a tervezőben szerkeszthetők | Elkerüli az ütközéskezelést; mindhárom motornál ugyanígy működik. |
| E8 | Melyik motor a projekt célmotorja? | **Projektbeállítás `project.engine.target`** (`unity` / `godot` / `unreal` / `none`), alapértéke az Architecture › Stack „Engine” kategóriájú sorából kitalálva; az exportnál felülírható | A UI szövegei, típusjavaslatai és ellenőrzései ehhez igazodnak („Engine packs”, lásd `GUIDED_WORKSPACE_PLAN.md`). |
| E9 | Motorverziók | **Unity 6 LTS (6000.0)**; később Godot 4.x, Unreal 5.x | Az Architecture útmutató „Unity URP stack” példája is ezt használja. |

## 1. Mi van már meg, amire építünk

- **Data-driven Design** (`technical.dataDriven`, `src/core/dataDriven.ts`): sémák `name: type` mezőkkel, sémák közti referenciák, `idPrefix`, `source` (`CONTENT_SOURCES`), formátum, betöltési stratégia, validáció, rekordszám. **Ez az Engine IR gerince.** Ma a típusnevek Unity-szagúak (`ASSETS` = `sprite`, `prefab`, `audioclip`…) — ezt a mag semleges típusokra fordítja (2.2).
- **Coding Standards** (`src/core/coding.ts`): elnevezési szabályok, `toCasing`, névterek, mappaszerkezet, Git LFS, ágstratégia.
- **Architecture** (`technical.architecture`): rétegek, modulok, függőségek, stack.
- **Formulák** (`src/core/formula.ts`): kiértékelhető kifejezések változókkal.
- **Katalógusok** (`project.registry.catalogs`) → enumok.
- **Helyszínek**: `hoh-location` JSON (motorfüggetlen) és Tiled `.tmj` (Unity: SuperTiled2Unity, Godot: Tiled-importer; Unreal: nincs natív, lásd 3.3).
- **Projekt-ZIP és Markdown-export** (JSZip), mentés File System Access API-val (`src/core/persistence/file.ts`).

## 2. Motorfüggetlen mag (`src/core/engine/`)

### 2.1 Engine IR

```ts
// src/core/engine/ir.ts
export type NeutralType =
  | { k: 'string' | 'text' | 'int' | 'float' | 'bool' | 'color' | 'vec2' | 'vec3' | 'date' | 'curve' | 'localized' }
  | { k: 'enum'; name: string; values: string[] }
  | { k: 'asset'; asset: 'image' | 'scene' | 'audio' | 'material' | 'mesh' | 'animation' | 'animator' | 'data' }
  | { k: 'ref'; schema: string }
  | { k: 'list'; of: NeutralType }

export type IrField = { name: string; type: NeutralType; optional: boolean; doc?: string }
export type IrSchema = { id: string; name: string; idPrefix: string; version: number; format: 'native' | 'json' | 'csv';
                         load: string; fields: IrField[]; module?: string /* Architecture modul */ }
export type IrRecord = { plannerId: string; key: string; schema: string; values: Record<string, unknown> }
export type IrFormula = { id: string; name: string; params: string[]; ast: FormulaNode; source: string }
export type EngineIR = { v: 1; projectId: string; schemas: IrSchema[]; records: IrRecord[]; enums: …; formulas: IrFormula[];
                         strings: { key: string; values: Record<string, string> }[]; graphs: …; maps: … }
```

- `buildIR(project)` egyetlen tiszta függvény; minden adapter ebből dolgozik, a projektet közvetlenül nem olvassa.
- A `parseField` mai típusnevei (Unity-, Godot- és Unreal-nevek is, pl. `Texture2D`, `PackedScene`, `UTexture2D`, `FVector`) **aliasként** semleges típusra képződnek, így bármelyik motor nyelvén írt séma érvényes marad.

### 2.2 Típusleképezés adapterenként

| Semleges | Unity (C#) | Godot (GDScript) | Unreal (C++) |
|---|---|---|---|
| `int` / `float` / `bool` / `string` | `int` / `float` / `bool` / `string` | `int` / `float` / `bool` / `String` | `int32` / `float` / `bool` / `FString` |
| `vec2` / `vec3` / `color` | `Vector2` / `Vector3` / `Color` | `Vector2` / `Vector3` / `Color` | `FVector2D` / `FVector` / `FLinearColor` |
| `curve` | `AnimationCurve` | `Curve` | `UCurveFloat*` / `FRuntimeFloatCurve` |
| `localized` | `LocalizedString` | `StringName` (tr-kulcs) | `FText` (String Table) |
| `asset:image` | `Sprite` / Addressables-kulcs | `Texture2D` | `TSoftObjectPtr<UTexture2D>` |
| `asset:scene` (prefab) | `GameObject` | `PackedScene` | `TSoftClassPtr<AActor>` |
| `asset:audio` | `AudioClip` | `AudioStream` | `TSoftObjectPtr<USoundBase>` |
| `ref` | `XDefinition` vagy ID | `XDefinition` (Resource) vagy ID | `FDataTableRowHandle` / `TSoftObjectPtr<UXDataAsset>` |
| `list` | `List<T>` | `Array[T]` | `TArray<T>` |
| natív adatasset | `ScriptableObject` | `Resource` (`.tres`) | `UPrimaryDataAsset` vagy `FTableRowBase` + DataTable |

### 2.3 Adapter-interfész

```ts
// src/core/engine/adapter.ts
export interface EngineAdapter {
  id: 'unity' | 'godot' | 'unreal'
  label: string
  typeName(t: NeutralType, ctx: AdapterCtx): string          // táblázat fent
  reservedWords: string[]                                   // C#, GDScript, C++ kulcsszavak
  defaultCasing: { type: string; field: string; constant: string }
  emit(ir: EngineIR, opts: AdapterOptions): EmittedFile[]    // kód + natív rekordfájlok + projektfájlok
  checks(ir: EngineIR): EngineCheck[]                         // motorspecifikus ellenőrzések
  layout: { root: string; generated: string; data: string }  // pl. Assets/HoHPlanner, res://hoh_planner, Content/HoHPlanner
}
```

- Regisztrálás a modulregiszterhez hasonlóan: `src/core/engine/adapters/index.ts` (`ENGINE_ADAPTERS`). Új motor = új fájl + motoroldali csomag; a mag, a UI és a riport változatlan.
- **Szerződés-tesztek** (`tests/engineAdapters.test.ts`): minden regisztrált adapterre lefut ugyanaz a készlet — minden semleges típusra ad nevet, a Cinderholm példából determinisztikus kimenetet ad, nem ad ki foglalt szót azonosítónak, minden rekordhoz pontosan egy adatfájl/sor tartozik.

### 2.4 Csomag és manifest

```
HoHPlanner/                     ← a ZIP gyökere
  hoh-engine.json               ← manifest: formátumverzió, célmotor + adapterverzió, projekt-id, sémák, fájl-hash-ek
  ir/engine-ir.json             ← a teljes semleges IR (bármelyik motor importálója olvashatja)
  Data/<Schema>/<key>.json      ← semleges rekordok (rekordonként egy fájl, merge-barát)
  Data/<Schema>.csv             ← ha a séma formátuma CSV
  Localization/strings.csv      ← key, en, hu, … (mindhárom motor importálja)
  Maps/…                        ← meglévő helyszín-exportok
  <Engine>/…                    ← az adapter kimenete (kód, natív adatfájlok, projektfájlok)
  README.md
```

A semleges rész minden exportban ugyanaz; csak a `<Engine>/` mappa függ a célmotortól. Így egy csomagból később másik motorra is lehet váltani.

### 2.5 Motorsemlegesítés a meglévő tervezőben

- `technical.ts` `format-so` sor: név „Native data asset (ScriptableObject / Resource / DataAsset)”, `editedIn` „Engine editor” — **migrációval** (a meglévő `id` marad, csak a címkék változnak; `MIGRATIONS`, export-kompatibilitás).
- A `MITIGATIONS`, `REVIEW_CATEGORIES` Unity-specifikus elemei („UnityYAMLMerge”, „Unity assets”) a célmotor szerinti javaslatlistából jönnek; a meglévő értékek érvényesek maradnak.
- Útmutatók és példák (pl. `arch-unity-stack`) mellé Godot- és Unreal-példa, a célmotor szerint elöl.

### 2.6 Fájlok

- `src/core/engine/` — `ir.ts`, `buildIR.ts`, `adapter.ts`, `manifest.ts` (Zod + JSON Schema), `checks.ts`, `bundle.ts`, `report.ts` (C. réteg), `formulaAst.ts`.
- `src/core/engine/adapters/unity.ts` (1. fázis), `godot.ts`, `unreal.ts` (később).
- `src/ui/editors/dataDrivenViews.tsx` — **Engine export** nézet (célmotor-választó, fájlfa- és kódelőnézet, hibák).
- Tesztek: `tests/engineIR.test.ts`, `tests/engineAdapters.test.ts` (szerződés), `tests/unityAdapter.test.ts` (snapshot), `tests/engineExportUi.test.tsx`.

## 3. Adapterek

### 3.1 Unity (első, teljes)

- **Kód**: sémánként `<Schema>Definition.cs` (`ScriptableObject` vagy `[Serializable]` osztály), `Ids.cs`, katalógus-enumok, `Formulas.cs` (az AST-ből C# metódus, nem fordítható kifejezésnél `NotImplementedException` + figyelmeztetés), `.asmdef` az Architecture modulja szerint.
- **Elnevezés**: a Coding Standards szabályai (`toCasing`, `checkName`, `namespaceCheck`, `moduleFolders`), ha nincs szabály: Unity-konvenció.
- **Rekordok**: natív formátumnál a semleges JSON-ból a Unity-csomag hoz létre ScriptableObjectet (E2); JSON/CSV-nél a fájlok + Addressables-kulcs.
- **Lokalizáció**: Unity Localization String Table CSV.
- **Unity-csomag** (`engine-packages/unity/com.handsofhubris.planner-bridge`, telepítés: Package Manager → git URL `?path=/game-design-planner-app/engine-packages/unity/com.handsofhubris.planner-bridge`):
  1. **Importáló**: manifest-verzió ellenőrzés → generált C# bemásolása → `AssetDatabase.Refresh` → domain reload után folytatás (`SessionState`) → SO létrehozás/frissítés `plannerId` alapján (`PlannerIdIndex`), átnevezés nem új asset, törölt rekord `Deprecated` jelzést kap → Addressables-csoportok a betöltési stratégia szerint → Localization táblák.
  2. **Validáció**: `Tools ▸ HoH Planner ▸ Validate` és `-executeMethod HoHPlanner.CI.Validate`.
  3. **Planner ablak**: a kijelölt asset tervezői adatai, deep link a tervezőbe.
  4. **Custom Inspector fejléc**: tervezőből jövő mezők szürkék, asset-mezők szerkeszthetők (E7).
  5. **Mappa/asmdef-váz** a Coding Standards és Architecture alapján (csak a hiányzót pótolja).
  6. **Helyszín-importáló**: `hoh-location` → Tilemap + GameObjectek (spawn, light, door, key, link) prefab-táblával.
- Tesztek: Unity Test Framework EditMode, mintacsomag a repóban (`examples/cinderholm.hohengine.zip`, a TS-teszt ellenőrzi, hogy friss).

### 3.2 Godot (később)

- **Kód**: sémánként `class_name XDefinition extends Resource` GDScript (`@export` mezők, típusos tömbök); opcionálisan Godot .NET C# kimenet ugyanabból az IR-ből.
- **Rekordok**: a `.tres` egyszerű szöveges formátum, ezért az adapter **közvetlenül is írhatja** (E2 kivétel); az `uid://` azonosítót a Godot-addon tölti ki első importkor.
- **Lokalizáció**: Godot translation CSV (`keys,en,hu`) — ugyanaz, mint a semleges `strings.csv`, csak oszlopnév-igazítás.
- **Térképek**: Tiled-importeren át már ma működik; később `hoh-location` → `TileMapLayer` + `Node2D` jelenet.
- **Addon**: `engine-packages/godot/addons/hoh_planner/` (`EditorPlugin`, GDScript): import, `plannerId` index, validáció, dock-panel a tervezői adatokkal, riportírás.

### 3.3 Unreal Engine (később)

- **Kód**: sémánként `USTRUCT(BlueprintType) FXRow : public FTableRowBase` (DataTable-formátum) vagy `UCLASS UXDataAsset : public UPrimaryDataAsset` (natív formátum), `UENUM` a katalógusokból, `UPROPERTY(EditAnywhere, BlueprintReadOnly)` mezők, `UFUNCTION(BlueprintPure)` formulák egy `UBlueprintFunctionLibrary`-ben, modulonként `.Build.cs`.
- **Rekordok**: az Unreal **natívan importál CSV/JSON-t DataTable-be**, ezért az első Unreal-lépés plugin nélkül is működik (generált fejlécfájlok + CSV); a DataAsset-út és az automatikus újraimport az Editor pluginhoz kötött.
- **Lokalizáció**: String Table CSV (`Key,SourceString`) + a nyelvenkénti `.po` a Localization Dashboardhoz.
- **Térképek**: nincs Tiled-út; `hoh-location` JSON → Editor Utility / Python script, ami Paper2D tilemapet vagy szintblokkokat rak le.
- **Plugin**: `engine-packages/unreal/HoHPlanner/` (C++ Editor modul + opcionális Python editor-szkriptek): import, `plannerId` → asset path index, validáció (`UEditorValidatorBase`), riportírás.

## 4. C. réteg — visszajelzés a motorból (motorfüggetlen)

A motoroldali csomag egy **`hoh-engine-report.json`**-t ír (gombra vagy minden import/validálás után):

```jsonc
{
  "format": "hoh-engine-report", "v": 1, "engine": "unity", "engineVersion": "6000.0.x",
  "projectId": "…", "generatedAt": "…",
  "records": [{ "plannerId": "…", "schema": "Item", "assetPath": "Assets/…/IronSword.asset",
                "bindings": { "icon": "Assets/Art/Icons/iron_sword.png" },
                "status": "implemented" | "missingAssets" | "deprecated", "issues": ["icon missing"] }],
  "scenes": [{ "path": "…", "inBuild": true }],
  "validation": [{ "plannerId": "…", "rule": "…", "message": "…" }],
  "metrics": [{ "key": "combat.ttk.goblin", "value": 4.2, "samples": 37, "build": "0.3.1" }]
}
```

- **Bemenet nem megbízható**: Zod, méretkorlát, ismeretlen `plannerId` → figyelmeztetés; az útvonalak csak szövegek.
- Tárolás: új, opcionális `project.engine` mező (`target`, utolsó export hash-e, utolsó riport) — `FORMAT_VERSION` emelés + `MIGRATIONS`, módosítás csak `useStore.mutate`-en át.
- Megjelenítés: entitásjelvények (*kész* / *asset hiányzik* / *nincs a motorban*), Readiness valós állapottal, Roadmap-készültség, **mért értékek a Difficulty/Combat/Economy céltartományai mellett**.
- Hintek (en/hu): `engine.missingAssets`, `engine.deprecated`, `engine.metricOutOfRange`, `engine.reportStale`.

## 5. D. réteg — élő kapcsolat

- **Összekapcsolt motor-mappa** (E5): Beállítások → *Engine* → „Link engine project folder…” (`showDirectoryPicker`, handle az IndexedDB-ben). „Export on save”: csak a megváltozott fájlokat írja, a motor automatikusan újraimportál (Unity `AssetPostprocessor`, Godot fájlfigyelés, Unreal auto-reimport). A riportot ugyanonnan olvassa vissza. Csak Chromium; máshol ZIP.
- **Localhost-híd** (opt-in): a motoroldali csomag `127.0.0.1:<port>`-on, tokennel; ping (kijelölés), jelenet megnyitása, élő validáció. A `ws://127.0.0.1` csak `VITE_ENGINE_BRIDGE=1` buildben kerül a CSP-be, teszt rögzíti, hogy a production CSP változatlan. A híd protokollja (`hoh-bridge` v1, JSON üzenetek) motorfüggetlen.
- **Élő hangolás játék közben**: formula- és számértékek küldése a futó játéknak (Unity Play mode / Godot futó jelenet / Unreal PIE), csak fejlesztői buildben.
- **Node CLI + CI**: `npm run export:engine -- <projekt> <kimenet> --engine unity`; példa GitHub Action a játék repójába: design-változás → export → batch import → validáció → PR. Felhős projektnél a motoroldali csomag a Supabase-ből a felhasználó saját tokenjével tölt le.

## 6. Fázisok

| Fázis | Tartalom | Kész, ha |
|---|---|---|
| 1 | Engine IR + `buildIR`, adapter-interfész, `hoh-engine` v1 manifest (Zod + JSON Schema), **Unity-adapter**, ZIP, Engine export nézet, ellenőrzések, adapter-szerződéstesztek | A Cinderholm példából determinisztikus csomag készül; a szerződésteszt a Unity-adapterre zöld |
| 2 | Motorsemlegesítés a tervezőben (2.5): típus-aliasok, `format-so` címke migrációval, `project.engine.target`; **sémánkénti mezőhozzárendelés** (sémamező ← tervezőmező, pl. `health` ← `hp`) | Régi projektek változatlanul betöltődnek, a Unity-szövegek a célmotortól függenek |
| 3 | Unity-csomag: importáló, Inspector-fejléc, validáció, EditMode-tesztek | Kétszeri import nem duplikál, átnevezés nem tör hivatkozást |
| 4 | Formulák C#-ként, lokalizáció, Addressables, mappa/asmdef-váz, `.editorconfig`/`.gitattributes` | A generált Unity-projekt fordul |
| 5 | Visszajelzés: `hoh-engine-report`, `project.engine` migrációval, jelvények, hintek | Riportimport után a táblázatok a valós állapotot mutatják |
| 6 | Összekapcsolt mappa, Export on save | Mentés után a Unity magától újraimportál |
| 7 | Mért értékek a balansz-oldalakon | Mintariport metrikái a céltartományok mellett |
| 8 | Localhost-híd, élő hangolás, Node CLI, CI-példa | Production CSP változatlan; CI PR-t nyit |
| 9 | A 7. fejezet ötletei közül a kiválasztottak | ötletenként |
| K | **Osztálydiagram → motorkód** (7a. fejezet; a 3. fázis után bármikor) | A diagramból generált MonoBehaviour/osztály/interfész-vázak fordulnak Unityben, és a Unity-riport jelzi az eltérést |
| P | **Unity-progress → tervező** (7b. fejezet; az 5. fázisra épül) | Riportimport után a tervező javaslatokat ad a státuszokra, és elfogadás után egy visszavonható lépésben frissít |
| G | **Godot-adapter + addon** (bármikor az 5. fázis után) | Szerződésteszt zöld, minta-import Godot 4-ben |
| U | **Unreal-adapter + plugin** (bármikor az 5. fázis után) | Szerződésteszt zöld, DataTable-import Unreal 5-ben |

## 7. Integrációs ötletek, amelyek még nincsenek a tervezőben (Unity-fejlesztés gyorsítása)

Az alábbiak mind olyan tervezői adatból indulnak, ami **már megvan** a tervezőben, de ma csak dokumentáció lesz belőle. Mindegyik az Engine IR-re épül, tehát Unityben indul, de később Godot/Unreal adapterrel is működhet. A hatás/munka becslés: ★ kicsi … ★★★ nagy.

| # | Ötlet | Forrás a tervezőben | Mit generál Unityben | Hatás / munka |
|---|---|---|---|---|
| I1 | **Greybox-pálya generátor** | Locations (`hoh-location`), World/Biomes | Jelenet primitív kockákkal/tilemappel, NavMesh-sütés, spawn- és fénypontok, ajtók zárakkal — azonnal bejárható prototípus | ★★★ / ★★ |
| I2 | **Placeholder-assetek** | Items, Enemies, NPC-k, Asset pipeline, Art direction palettája | Névvel feliratozott színes sprite-ok/ikonok és primitív prefabok a paletta színeivel, az elnevezési szabály szerint; később a valódi asset ugyanarra a kulcsra cserélődik | ★★★ / ★ |
| I3 | **Eseménykatalógus → event channels** | Core loop, Time & Weather events, Quests, Architecture (kommunikáció) | `GameEvent` ScriptableObject-csatornák (vagy C# event bus) eseményenként, payload-típussal, és listázás, ki küldi/ki figyeli | ★★ / ★ |
| I4 | **Állapotgépek** | NPC System (rutinok, munkák), AI Systems, Combat (ellenség-viselkedés), Quest-állapotok | C# állapotgép-váz (enum + `IState` osztályok + átmenetek) vagy Animator Controller rétegek; quest-állapotgép a feltételekkel | ★★★ / ★★ |
| I5 | **Debug-konzol és cheatek** | Items, Quests, Time & Weather, Factions, Difficulty | Fejlesztői konzol parancsokkal: `give item.iron_sword 5`, `quest.start …`, `time.set 18:00`, `weather.set storm`, `faction.rep …`, `difficulty.set …` — automatikusan frissül a tartalommal | ★★★ / ★ |
| I6 | **Balansztesztek a tervből** | Difficulty, Combat, Trade/Economy formulák céltartományai, QA › Balance plan | NUnit/EditMode tesztek: a formulák és a valós SO-adatok a tervezett tartományban maradnak (pl. TTK 3–5 s, ár/haszon arány) — CI-ban jelzi, ha egy Inspector-módosítás elrontja a balanszot | ★★★ / ★ |
| I7 | **Quest-megoldhatósági teszt** | Story & Quests gráf, Items (kulcsok), Locations (zárak) | Teszt, ami a quest-gráfot és a pályák zár-kulcs logikáját (már létező `lockCheck`) együtt bejárja: elérhető-e minden quest vége | ★★ / ★★ |
| I8 | **UI-képernyők és navigáció** | UI/UX (képernyők, HUD-elemek, flow) | UI Toolkit UXML/USS váz képernyőnként, navigációs gráf (`ScreenId` + router), HUD-elemek bindolható mezőkkel | ★★ / ★★ |
| I9 | **Mentési rendszer váz** | Save System (mit ment, verzió, slotok) | `SaveData` DTO-k, verziószám és migrációs lánc-váz, `ISaveable` interfész a megjelölt rendszerekre | ★★ / ★ |
| I10 | **Teljesítménybüdzsé → automatikus mérés** | Performance (frame-, memória-, draw call-büdzsék rendszerenként) | `ProfilerMarker`-ek a rendszerekre, Performance Testing package tesztek a büdzsé küszöbökkel, eredmény vissza a riport `metrics`-ébe | ★★ / ★★ |
| I11 | **Telemetria/analitika események** | QA › Balance plan, Core loop mérőszámai, Difficulty | Generált `Analytics.Track(...)` hívások típusos paraméterekkel, helyi JSON-log; a játékteszt-adat visszamegy a riport `metrics`-ébe (zárja a kört a C. réteggel) | ★★★ / ★★ |
| I12 | **Hang-események** | Audio direction (események, keverőcsoportok) | AudioMixer-csoportok, `AudioEvent` SO-k vagy FMOD/Wwise eseményváz-lista; hiányzó hang a riportban | ★ / ★ |
| I13 | **Input-térkép** | UI/UX vezérlés, Player character képességei | `.inputactions` fájl (Input System) action mapekkel, billentyű/gamepad alapértelmezéssel | ★★ / ★ |
| I14 | **Feladatok és commitok összekötése** | Production › Backlog, Milestones, Roadmap | GitHub/GitLab issue-k entitás-linkkel (`plannerId`), commit-üzenet konvenció (`[item.iron_sword]`), amiből a riport „folyamatban” állapotot ad | ★★ / ★★ |
| I15 | **Lokalizációs pszeudo-nyelv** | Minden `localized` mező | Generált „pszeudo” nyelv (hosszított, ékezetes szöveg) a UI-törések korai észlelésére | ★ / ★ |
| I16 | **Párbeszéd-export** | Story & Quests, NPC dialógusok | Yarn Spinner / Ink fájlok vagy saját JSON-gráf + `DialogueId` konstansok | ★★ / ★★ |
| I17 | **Gazdasági/harci szimuláció a tervezőben** | Trade/Economy, Combat, Town formulák | Monte Carlo futtatás a böngészőben a Unity-build előtt (pl. 100 nap gazdaság, 1000 harc), az eredmény és a Unity-mért érték egymás mellett | ★★★ / ★★★ |
| I18 | **Architektúra-őr** | Architecture rétegek és függőségek | Roslyn-analizátor vagy editor-teszt, ami a valós `.asmdef` hivatkozásokat és `using`-okat összeveti a tervezett függőségekkel; sértés a riportba | ★★ / ★★ |
| I19 | **„Vertical slice” checklist → jelenetlista** | Roadmap fázisok, Milestones | Build Settings jelenetlista és Addressables-címkék fázisonként; milestone-készültség a riportból | ★ / ★ |
| I20 | **AI-scaffolding javaslatok** | AI-panel (`src/core/ai`) + generált Definition-osztályok | „Generate system code” sablon, ami a generált típusokra és az Architecture modulra épít, és javaslatként (proposals) jelenik meg | ★★ / ★ |

Javasolt első kör az 1–5. fázis után: **I2, I5, I6** (kicsi munka, azonnal gyorsít), majd **I1, I3, I11** (a legnagyobb tervezői érték: játszható greybox és mért adat vissza a tervezőbe).

## 7a. Osztálydiagram → motorkód (nem csak ScriptableObject)

**Cél:** a tervezőben UML-szerű osztálydiagramot lehessen rajzolni, és abból a motorba ne csak adatosztály (ScriptableObject), hanem a játék kódszerkezete kerüljön: komponensek, sima osztályok, interfészek, struktúrák, enumok, eseménycsatornák.

- **Hol él:** új szekció a Technical › Architecture tervezőben (`classes`), mert ott vannak a modulok, rétegek és függőségek; a Data-driven sémák automatikusan „adatosztályként” jelennek meg a diagramon (csak olvasható, a sémából jönnek), így egy kép mutatja a kódot és az adatot.
- **Osztály-entitás:** név, *fajta* (motorfüggetlenül: `component` = Unity MonoBehaviour / Godot Node / Unreal ActorComponent, `actor` = Unity prefab gyökér / Godot scene root / Unreal AActor, `data` = ScriptableObject / Resource / DataAsset, `class`, `struct`, `interface`, `enum`, `static`, `event`), modul (Architecture-hivatkozás → névtér, `.asmdef`), ősosztály, megvalósított interfészek, mezők (`név: típus`, láthatóság, `[SerializeField]`-szerű „Inspectorban szerkeszthető” jelző), metódusok (aláírás + rövid leírás), függőségek (`RequireComponent`, injektált szolgáltatások), és mely tervező-entitásokat valósítja meg (pl. Combat › Enemies → `EnemyBrain`).
- **Nézetek:** osztálydiagram (dobozok öröklés-, megvalósítás- és asszociációs nyilakkal, a Data model nézet mintájára), rétegsértés-jelzés (Core ne függjön Gameplaytől), Mermaid `classDiagram` export és import (a `mermaid` már függőség), a Coding Standards elnevezési szabályainak ellenőrzése.
- **IR:** az Engine IR 2-es verziója `classes` listát kap ugyanazzal a semleges típusrendszerrel; adapterenként:
  - Unity: `public partial class EnemyBrain : MonoBehaviour, IDamageable` `[RequireComponent]`-tel, `[SerializeField] private` mezőkkel, metódusvázakkal (`throw new NotImplementedException()` vagy üres `Update`), külön `*.Generated.cs` (felülírható) és egyszer létrejövő `*.cs` (a fejlesztőé, sosem írjuk felül) — így a diagram újragenerálása nem töri a megírt kódot;
  - Godot: `class_name EnemyBrain extends Node` + `@export` mezők;
  - Unreal: `UCLASS() class UEnemyBrain : public UActorComponent` fejléc + üres `.cpp`.
- **Vissza:** a Unity-csomag reflexióval listázza a projekt típusait, és a riportban jelzi: „a terv szerinti, de hiányzik”, „Unityben van, a tervben nincs”, „eltérő ős/mező”. A tervező ezt diff-ként mutatja a diagramon, és egy kattintással felveheti a Unityben talált osztályt a tervbe.
- **Korlát:** metódustörzset nem generálunk (csak vázat és TODO-t); az AI-scaffolding (I20) adhat javaslatot a törzsre, javaslatként.

## 7b. Unity-progress → tervező-progress (részleges, javaslat alapú)

**Igen, megvalósítható**, a C. réteg (`hoh-engine-report`) és az összekapcsolt mappa (5. fázis) erre épül. Az elv (E7): **a Unity nem írja felül a kézi státuszt, hanem javasol**, és a felhasználó egy kattintással, egyetlen visszavonható lépésben (`useStore.mutate`) fogadja el — ahogy az AI-javaslatoknál.

Amit a Unity-csomag automatikusan mérni tud, és ami a tervezőben frissülhet:

| Unityben mérhető | Tervezőben frissül |
|---|---|
| Rekord assetje létezik, minden kötelező asset-mező (ikon, prefab, hang) ki van töltve, validáció zöld | Entitásjelvény (*kész / asset hiányzik / nincs*), Data-driven „Pipeline readiness” valós oszlopa, a Content planner készültsége |
| Generált osztály (7a) törzse már nem `NotImplementedException`, van hozzá EditMode-teszt, és zöld | Architecture modul / rendszer státusza („implementált”, „tesztelt”) |
| Jelenet a Build Settingsben, Addressables-csoport épül | Roadmap-fázis és milestone készültség („Vertical Slice: 42/60 elem kész”) |
| Commit-üzenet vagy ág, ami `plannerId`-t vagy backlog-ID-t említ (I14) | Backlog-elem „folyamatban / kész” javaslat |
| Mért értékek (`metrics`) | Difficulty / Combat / Economy céltartomány mellett „mért” érték és hint |

- **Mi nem frissül automatikusan:** tervezési döntések, szövegek, prioritások; kézzel „kész”-re tett elemet a Unity nem állít vissza, csak figyelmeztet („a tervben kész, Unityben hiányzik az ikonja”).
- **Megjelenés:** a riport importja után egy „Unity-szinkron” panel listázza a javasolt státuszváltásokat (elfogad / elutasít / mindet), a Workspace progress-sávja külön jelöli a „Unity szerint” részt, a hintek közt `engine.statusSuggestion` jelenik meg.
- **Biztonság:** a riport nem megbízható bemenet (Zod, méretkorlát), csak ismert `plannerId`-ra és csak státusz-mezőkre hat.

## 8. Kockázatok

- **Séma-sodródás** a TS és a motoroldali kód között → egyetlen forrás: Zod → JSON Schema, szerződésteszt mindkét oldalon, főverzió-ellenőrzés.
- **Túl korai absztrakció** → csak az Engine IR és az adapter-interfész készül el most, Godot/Unreal-kód nem; az interfészt a Unity-adapter igényei alakítják, a szerződésteszt pedig garantálja, hogy egy második adapter is beférjen.
- **Domain reload** (Unity) / **újraindítás** (Unreal C++ modul) a generált kód után → kétlépcsős, idempotens import.
- **Merge-konfliktus** → rekordonként egy fájl, `<auto-generated>` jelölés, determinisztikus mezősorrend.
- **Biztonság**: a riport és minden motorból jövő adat nem megbízható (Zod, méretkorlát, nincs `eval`); a híd tokenes, csak `127.0.0.1`, csak fejlesztői buildben a CSP-ben; Supabase-token soha nem kerül a repóba vagy az exportba.
- **Böngészőkorlát**: a File System Access API csak Chromiumban; mindenhol marad a ZIP-út.
- **Karbantartási teher**: három motoroldali nyelv (C#, GDScript, C++) → motoronként külön CI-job, csak az `engine-packages/<motor>/**` változásakor.

## 9. Nyitott kérdések

1. Van-e már Unity-projekt a játékhoz, és hol (külön repó)?
2. Használja-e a projekt a Unity Localization és az Addressables csomagot?
3. Van-e Unity-licenc a CI-hoz (game-ci)? Ha nincs, a Unity-oldali tesztek csak helyben futnak.
4. Dialógushoz Yarn Spinner, Ink vagy saját rendszer (I16)?
5. A generált kód kommentjei angolul legyenek (javaslat) vagy magyarul?
6. Godot esetén GDScript vagy C# legyen az alapértelmezett kimenet? Unrealnél DataTable vagy DataAsset az alap?

## Nem része ennek a tervnek

Motorjelenetek vizuális szerkesztése a böngészőben, WebGL-build beágyazása a tervezőbe, natív bináris/GUID-függő assetek írása a böngészőből (E2), kétirányú tervezési mezőszerkesztés (E7), a Godot- és Unreal-adapter tényleges megvalósítása (G és U fázis külön jóváhagyással).
