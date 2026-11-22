# Unity: játszható játék generálása a plannerből

**Státusz:** javaslat, nem megvalósított terv; az alapvető technikai döntések rögzítve (1.1)  
**Dátum:** 2026-11-21  
**Kapcsolódó előzmény:** [UNITY_INTEGRATION_PLAN.md](UNITY_INTEGRATION_PLAN.md), [UNITY_MANUAL_TEST_PLAN.md](UNITY_MANUAL_TEST_PLAN.md)

## 1. Cél és keretek

A planner egy tervből **Unityben elindítható, játszható prototípust és továbbfejleszthető játékalapot** állítson elő. A cél hosszabb távon egy jó minőségű, tartalomban gazdag, közel kész alap: a tervezett és támogatott rendszerek lehetőleg működjenek együtt, a még nem automatizálható részek pedig kapjanak egyértelmű bővítési pontot és feladatlistát.

**Egyeztetett irány:**
- A planner általánosan bővíthető termék marad; egy konkrét játék csak referencia és tesztadat, nem az architektúra korlátja.
- Elsőként **3D Unity-játékok** támogatása; a 2D későbbi cél, amelyet az adatmodell és a modulhatárok ne zárjanak ki.
- A generálás a **projekt tényleges plannerértékein és választásain** alapuljon, ne egyetlen műfaj vagy a példajáték hardkódolt tartalmán.
- Hibrid megközelítés: kipróbált, konfigurálható modulok és determinisztikus generálás legyen az alap; az AI opcionálisan segíthet javaslatokkal, tartalommal és kóddal.
- AI, hálózat vagy külső szolgáltatás nélkül is működjön minden olyan prototípus, amelyhez az adatok és determinisztikus modulok elegendők.

### 1.1 Rögzített technikai döntések (2026-11-21)

| Téma | Döntés | Következmény |
|---|---|---|
| Render pipeline | Az első támogatási profil **URP**. | A generált prototípusscene, fény és placeholder-anyagok URP-re készülnek; hiányzó vagy nem konfigurált URP blokkoló diagnosztikát ad. Built-in és HDRP későbbi, külön profil. A runtime-csomag kódja ne függjön URP-től, csak a scene-/asset-összeállítás. |
| Unity-verzió | A runtime minimuma **2022.3 LTS** marad, mint a bridge-é; a referencia-környezet Unity 6. | Unity 6-only API csak feltételes fordítással vagy külön, opcionális profilban. A CI mindkét verzión legalább fordít; PlayMode és build legalább Unity 6-on fut. |
| Runtime csomagolása | **Külön UPM-csomag** (munkanév: `com.handsofhubris.planner-runtime`), saját verzióval, CHANGELOG-gal és EditMode/PlayMode tesztekkel. | Függési irány: generált kód → runtime; bridge (Editor) → runtime. A runtime soha nem hivatkozik a bridge-re vagy Editor API-ra. A bridge meglévő `Runtime` assemblyje (`PlannerIndex`, `PlannerMetrics`) a helyén marad; áthelyezése csak dokumentált migrációval. |
| Első perspektíva | **Third-person**, követő kamerával. | A first-person és a top-down/izometrikus későbbi kameramodul; a planner a választást explicit mezőként tárolja (1. fázis), a nem támogatott perspektíva diagnosztikát ad. |
| Input | Unity **Input System** package (a meglévő `.inputactions`-generálásra építve). | A régi Input Manager nem támogatott; a hiányzó package blokkoló diagnosztika. |
| UI | **UI Toolkit** (a meglévő UXML-képernyőkre és `PlannerScreenRouter`-re építve). | uGUI-támogatás nem cél az első profilban. |

**Nem ígéret:** tetszőleges, szabad szöveges játéktervből emberi közreműködés nélkül kiadásra kész játék. A végleges grafika, animáció, hang, egyedi mechanikák, pályadizájn, teljesítményhangolás, játékélmény és kiadási QA továbbra is fejlesztői feladat lehet. Az alap nem tekinthető késznek pusztán azért, mert fájlok keletkeztek vagy a projekt lefordul.

## 2. Kiindulási állapot

- A [`src/core/engine/`](../src/core/engine/) enginefüggetlen IR-t, exportot, manifestet, jelentést és három adaptert tartalmaz. A Unity-adapter generál többek között adattípusokat, ID-ket, képleteket, input-, UI-, állapotgép-, quest- és mentésvázat.
- A [Unity bridge](../engine-packages/unity/com.handsofhubris.planner-bridge/README.md) importál, ScriptableObjecteket és egyes kiegészítő asseteket készít, validál, jelentést ír, és kezeli a linked foldert, a live linket és a greyboxot. Az előző integrációs terv több Unity 6-os EditMode-ellenőrzést dokumentál; ezek nem bizonyítják a teljes generált játék PlayMode-beli működését.
- Meglévő, újrahasznosítandó építőelemek (az [integrációs terv](UNITY_INTEGRATION_PLAN.md) szerint, Engine IR v8): `.inputactions` kategóriánkénti action mappel és Keyboard&Mouse/Gamepad sémával; UXML-képernyők és `PlannerScreenRouter`; típusos állapotgépek; `PlannerStory` + `PlannerQuestLog` (csak a tervben megengedett questlépést fogadja el); `PlannerSave` (verzió, slotok, `IPlannerSaveable`, JSON/gzip, atomikus írás, migrációs lánc); `PlannerScenes` és build-scene beállítás; `PlannerCI` és a game-ci alapú [`plan-to-unity.yml`](../engine-packages/unity/ci/plan-to-unity.yml) példa. Ezeket kell bővíteni, nem párhuzamosan újraírni.
- A bridge tesztjei jelenleg **csak EditMode**-tesztek; PlayMode-teszt és tesztbuild még nincs. A CI-workflow maga GitHub Actionsben nem futott.
- Az osztálydiagram saját metódustörzsei jellemzően TODO-k; a questcélok szövegek; a UI-elemek elnevezése nem teljes adatbinding; a generált input jelenleg gombközpontú (nincs tengely/vektor akció és composite binding). Nem szabad ezeket kész játékmenetnek nevezni.
- A [`examples/cinderholm.hohplan.json`](../examples/cinderholm.hohplan.json) gazdag referencia, de nem garantáltan tartalmaz minden végrehajtható szabályt vagy assetet. A referencia kiegészítését külön tesztfixture-ben végezzük, ne csendesen írjuk át az eredeti példát.
- A jelenlegi exportokkal, saját kóddal, rekordokkal, `.meta` fájlokkal, riporttal, CLI-vel, valamint a Godot- és Unreal-adapterekkel fenn kell tartani a kompatibilitást, vagy dokumentált migrációt kell adni.

## 3. Alapelvek és szerződések

### 3.1 A tervből működés

Az egyes tervezett elemeknek legyen világos besorolása:

1. **Végrehajtható:** a támogatott, típusos szabály és minden függőség rendelkezésre áll.
2. **Konfigurálható sablon:** működő modul, amelynek megadott paraméterei a tervből érkeznek.
3. **Keret:** ismert interfész, esemény, adat és bekötési pont, de a működést fejlesztőnek kell megírnia.
4. **Nem támogatott vagy hiányos:** nincs biztonságos leképezés; a diagnosztika megmutatja, mi hiányzik és hol javítható.

A szabad szöveg leírás marad, amíg a felhasználó nem alakítja át jóváhagyott, strukturált szabállyá. A rendszer ne találjon ki fontos gameplay-döntést, és ne állítson késznek egy hiányzó implementációt.

### 3.2 Moduláris architektúra

- **Planner:** típusos szerkesztés, hivatkozások, ellenőrzés, képesség- és függőségfeloldás, előnézet.
- **Köztes modell és export:** verziózott, lehetőleg enginefüggetlen gameplay-szerződés; Unity-specifikus konfiguráció külön rétegben. A meglévő engine IR-t bővítsük, ne vezessünk be párhuzamos modellt bizonyított szükség nélkül.
- **Unity runtime:** újrahasználható, tesztelt komponensek és szolgáltatások. A generálás elsősorban ezeket konfigurálja; ne másoljon minden tervhez eltérő, nehezen frissíthető teljes rendszereket.
- **Unity editor bridge:** import, asset- és scene-összeállítás, referenciák, diff, ellenőrzés és riport; Editor API ne kerüljön a runtime buildbe.
- **Bővítés:** dokumentált interfészek, események és saját komponensek; a generátor által kezelt és a felhasználó által kezelt területek egyértelműen különüljenek el.

A modulok deklarálják a verziójukat, függőségeiket, szükséges adatokat, támogatott dimenziót és képességeket. Először a szükséges legkisebb megoldás készüljön el; a későbbi 2D ne követeljen meg egy rögtön kész 2D motort.

### 3.3 Biztonság és újraimport

- Stabil planner ID-k, verziózott adatok és mentések; névváltoztatás ne jelentsen új identitást. `.meta` és Unity-hivatkozások megőrzése.
- A generált és a saját tartalom világos tulajdonjoga. A meglévő felhasználói kód, prefab, scene és asset ne vesszen el csendesen. Gyárilag generált greybox továbbra is csak saját, egyértelműen jelölt területen cserélhető.
- Előnézeti diff, ütközéslista, biztonságos leállás és visszaállítási lehetőség az érintett változtatásokhoz. Hibás vagy hiányos import ne adjon sikeres státuszt.
- Üres, hibás és nem támogatott adat kezelése kifejezett diagnosztikával; minden alapértelmezés legyen látható és elfogadható. A prototípushoz szükséges kritikus információt ne pótolja észrevétlenül.
- Az AI-nak küldött tartalom mindig tudatos, tartalomspecifikus felhasználói jóváhagyáshoz kötött. Titkokat ne küldjön és ne tároljon a tervben; a javasolt kódot ne futtassa vagy írja be automatikusan. Az AI hiánya ne akadályozza a determinisztikus utat.

## 4. A cél mérhető meghatározása

### Első vertical slice

Készítsünk egy **kicsi, külön, strukturált 3D referencia-tervet**, amely a meglévő szerkesztők valós működésére épül és legalább az alábbiakat tartalmazza:

1. Egy bejárható URP-helyszín, kezdőpont, játékos és third-person követő kamera.
2. A játékos mozog és interakcióval felvesz legalább egy tárgyat; az inventory és a HUD ezt mutatja.
3. Egy típusos cél feltétele a tárgy megszerzése; teljesítéskor egy konfigurált jutalom jár, pontosan egyszer.
4. Mentés és betöltés után a pozíció, inventory és questállapot megmarad.
5. Ugyanazon terv újbóli importja nem duplikál, a saját referenciák megmaradnak; egy tervérték módosítása ellenőrizhetően frissül.

A szelet Unity 6-on PlayMode-tesztben és a referencia-terv célplatformjára készült standalone tesztbuildben fut, 2022.3 LTS-en legalább fordul (1.1). Ez **első kapu**, nem a végső teljes játékscope. A perspektívát, inputot, elemeket és szabályokat a referencia-terv kifejezetten választja meg; a generátor ne következtessen műfajt vagy kamerát pusztán a projekt nevéből. Ha a plannerből hiányzik a választás, kérje be.

### Bővített prototípus-kapu

A vertical slice után, a projekt által ténylegesen kiválasztott modulokkal: legalább egy crafting-recept, egy egyszerű harci találkozás, egy NPC-interakció, a kapcsolódó UI és mentés működjön végig. Az egyes mechanikák nem kötelezők minden játékban: a képességmátrix és a projektválasztás határozza meg őket.

### A „majdnem kész alap” elfogadása

Csak egy meghatározott támogatási profilra mondható ki: a kiválasztott rendszerek és tartalmak tényleg működnek; a hiányzó assetek és egyedi logikák láthatók; a prototípus szerkesztőben és célzott tesztbuildben fut; az újraimport, mentés és automatizált tesztek megbízhatók. Nem követelmény, hogy minden lehetséges terv vagy minden asset automatikusan kész legyen.

## 5. Fázisok

Minden fázis önálló, tesztelhető változásként szállítandó. A megadott függőségek a tényleges előfeltételek; az egymás mellett álló fázisok nem automatikusan függnek egymástól. A meglévő teszteket és csomagokat kell használni; új függőség csak indokolt szükség esetén kerüljön be.

### 0. Állapotfelmérés és referencia — függőség: nincs

- Rögzítsük a jelenlegi planner-, export- és Unity-bridge viselkedést, a pontos Unity 6 referencia-verziót (patch-szintig), az URP- és Input System-package verzióját, valamint a 2022.3-kompatibilitás jelenlegi vállalását. Állapítsuk meg, mely tesztek futtathatók ténylegesen, és mihez kell Unity-licenc vagy opcionális package.
- Készítsünk külön, kis 3D referencia-tervet a 4. fejezethez (third-person, URP); a helyét és nevét itt rögzítsük (pl. dedikált tesztfixture-mappa, nem az `examples/`). Dokumentáljuk az explicit adatokat és az ismert hiányokat. A Cinderholm marad gazdag regressziós és későbbi integrációs példa.
- **Kész, ha:** a reprodukálható kiindulási export és a jelenlegi teszteredmények rögzítve vannak; ami nem futott, nem szerepel sikeresként.

**Állapot (2026-11-21): kész.**

- **Referencia-terv:** [`tests/fixtures/referenceSlice3d.ts`](../tests/fixtures/referenceSlice3d.ts) építi kódból, determinisztikusan (rögzített ID-k, idő és térkép-seed); a kimenet [`tests/fixtures/reference-slice-3d.hohplan.json`](../tests/fixtures/reference-slice-3d.hohplan.json) (`UPDATE_REFERENCE_FIXTURES=1`-gyel frissül). Tartalom: „Keeper’s Yard” (Village, generált térkép), Brass Key és Coin item + Item séma, W/A/S/D/E/I/Escape vezérlés, HUD questkövetővel, „Find the brass key” quest, mentés (v1, 1 kézi slot; Player / Inventory / Quest log), egy modul és egy scene. A third-person választás ma csak szövegben (Player Character › Controls) fejezhető ki.
- **Ismert hiányok** a `KNOWN_GAPS` listában (dimenzió/perspektíva/pipeline/platform mező, vektoros mozgásakció, tárgy elhelyezése a térképen, típusos cél és jutalom, futásidejű kötések, kezdőpont és kameraparaméterek). A [`tests/referenceSlice3d.test.ts`](../tests/referenceSlice3d.test.ts) ezeket szándékosan rögzíti; amelyik fázis megszünteti, ott a tesztet és a listát együtt kell frissíteni.
- **TS-alapállapot:** a felmérés idején 1292 tesztből 11 bukott, mind a `examples/cinderholm.hohplan.json` miatt: a példa 2026-11-21-én módosult („Iron sword” → „Iron longsword”, `item.iron_longsword`, érték 1100, ami kívül esik az „Item value” ellenőrzés tartományán), és a fájl most tárolt motorbeállítást (`meta.engine.target`) és Unity-riportot (`meta.engine.report`) is tartalmaz. Döntés: a példa marad, a **tesztek frissültek** (új ID-k; az „Item value” ellenőrzés most a longswordot jelzi; a riport nélküli állapotot vizsgáló tesztek a betöltés után törlik a tárolt riportot; a célmotor-teszt előbb a beállítást, majd annak törlése után a stack-alapú választást ellenőrzi; a bridge `sample-manifest.json` fixture újragenerálva). Utána: 1292/1292 zöld, kivéve a `cloudUi.test.tsx` egy időzítésfüggő tesztjét, amely a teljes futásban egyszer bukott, önmagában háromszor zöld. `npm run typecheck` és a módosított tesztek lintje zöld.
- **Unity-környezet:** telepítve 2022.3.21f1, 6000.0.16f1, 6000.0.40f1; licenc batch módban működik. Referencia: **6000.0.40f1**, Input System 1.13.0, URP 17.0.4, Test Framework 1.4.6, Newtonsoft JSON 3.2.1. Tesztprojekt: `C:\UnityProjects\ReferenceSlice3D` (üres projekt + bridge `file:` hivatkozással, `testables`-ben), nem verziókezelt.
- **Unity-alapállapot (6000.0.40f1, batch):** CLI-export 32 fájl, 0 hiba/figyelmeztetés; a bridge projektnyitáskor importált (2 rekord, 2 placeholder ikon); `PlannerCI.Validate` 0 hiba, 2 figyelmeztetés (placeholder ikonok), kilépési kód 0. EditMode: 31 teszt, 30 zöld, 1 kihagyott (`PlannerStoryTests.TheLogRefusesWhatThePlanDoesNotAllow`, mert a tervben nincs döntés); fordítási hiba nincs. A `PlannerCI.Import` paraméter nélkül 2-vel lép ki (`-hohBundle` kell), ez elvárt.
- **Megfigyelt hiányok a Unity-oldalon:** az új projektben `activeInputHandler: 0` (csak a régi Input Manager aktív), és nincs URP pipeline asset beállítva — a package telepítése önmagában nem elég; ezt a 4. és 8. fázis diagnosztikájának kell kezelnie. PlayMode-teszt és build nem futott, mert még nincs mit futtatni. A 2022.3.21f1-es fordítás nem futott.

### 1. Képességmátrix és generálhatóság — függőség: 0

- Vezessük be, hogy a planner a projekt dimenzióját, kiválasztott perspektíváját, render pipeline-ját, moduljait és célplatformját explicit módon kezelje (meglévő modulmezőként, `useStore.mutate`-en át, migrációval). A 3D legyen az első implementált dimenzió, a 2D külön későbbi képesség.
- Modulonként és funkciónként jelenjen meg a támogatottság, előfeltétel, függőség és a 3.1 szerinti kategória. Ne következtessünk gameplay-t puszta címekből vagy szövegből.
- **Kész, ha:** egy hiányos vagy nem támogatott választásból konkrét, javítható diagnosztika keletkezik; nem lesz belőle félrevezető „játszható” export.

**Állapot (2026-11-21): kész.**

- **Planner-mező:** Technical Architecture › **Playable prototype** (új űrlapszakasz, [`src/modules/technical.ts`](../src/modules/technical.ts)): Dimension (3D/2D), Camera / perspective, Render pipeline, Target platform, és rendszerenként egy kapcsoló (mozgás és kamera, interakció, inventory, questek, mentés, crafting, harc, NPC-párbeszéd). Új szakasz, ezért nincs migráció: régi fájlban üres marad, a store betöltéskor kitölti; ismeretlen érték (pl. újabb fájlból) nem választottnak számít.
- **Képességmátrix:** [`src/core/engine/capabilities.ts`](../src/core/engine/capabilities.ts) — rendszerenként függőség (pl. inventory → interakció → mozgás), adat-előfeltétel helymegjelöléssel, és motoronként a 3.1 szerinti szint. Unityben ma: interakció és NPC-párbeszéd *unsupported*, a többi *frame* (a meglévő generált adat/keret alapján); Godot és Unreal: minden *unsupported*. Profil: Unityben csak 3D, Third-person, URP és Windows/macOS/Linux támogatott; más platform figyelmeztetés, a többi eltérés hiba.
- **Diagnosztika:** `prototypeReport()` kódjai: `proto.choiceMissing`, `proto.profileUnsupported`, `proto.noSystems`, `proto.requires`, `proto.dataMissing`, `proto.unsupported`, `proto.frameOnly`, `proto.verdict`. Az `EngineIssue` új, opcionális `where` mezője (doc, section, field) mutatja, hol javítható — a 6. fázis navigációja erre épülhet. A `buildBundle` a többi export-ellenőrzés közé teszi őket (Engine export nézet, CLI `--strict`), és a bundle README-je „Playable prototype” szakaszt kap a verdikttel és rendszerenkénti szinttel. A „játszható” verdikt csak akkor igaz, ha nincs hiba és minden választott rendszer *executable* vagy *template* — ma ez soha nem teljesül.
- **Nem kéri a prototípust** (egyik mező sincs kitöltve) → nincs új ellenőrzés és README-szakasz; a Cinderholm exportja változatlan. Az `exampleProject` teszt ezt a szakaszt kifejezett opt-in kivételként kezeli.
- **Referencia-terv:** a profil (3D, Third-person, URP, Windows) és az öt szelet-rendszer kitöltve; az exportja „Not playable yet”, egyetlen hibával (interakció nem támogatott) és négy *frame* figyelmeztetéssel. A `KNOWN_GAPS` frissült.
- **Ellenőrzés:** `tests/engineCapabilities.test.ts` (10 teszt: mező, profilolvasás, opt-in, hiányzó választás helye, nem támogatott profil, függőség és adat helye, rendszer nélkül, Godot, „soha nem játszható ma”, valamint a verdikt logikája ideiglenesen megemelt szintekkel); teljes kör 1302-ből 1301 zöld, a kivétel a `v3CompanionUi.test.tsx` időzítésfüggő tesztje (önmagában 3× zöld); typecheck és lint zöld. Böngészőben: az űrlap megjelenik (a platform a Guided nézetben is alapmező), és 2D választásnál az Engine export nézet a várt hibákat listázza; a próbaértékeket utána visszaállítottam.
- **Nem része:** a profil még nincs az engine IR-ben (3. fázis), és a hibákról nincs kattintható navigáció (6. fázis).

### 2. Strukturált játékmeneti adatmodell — függőség: 1

- Definiáljuk az első szelethez szükséges entitásokat, típusos eseményeket, feltételeket, akciókat, célokat, jutalmakat és azok stabil hivatkozásait. Új mezőket a meglévő planner-modulokba illesszünk, ne hozzunk létre párhuzamos item- vagy quest-adatbázist.
- Legyen jól meghatározott egység, számtartomány, sorrend és hiányzó adat viselkedése. A meglévő projektfájlokra és nem strukturálható szövegre dolgozzunk ki migrációt és külön diagnosztikát.
- **Kész, ha:** a referencia célja és jutalma névfelismerés és kézi kód nélkül, exportálásra alkalmasan reprezentálható; régi terv betöltése nem veszít adatot.

**Állapot (2026-11-21): kész.**

- **Típusos cél:** Story & Quests › Quests új mezője, **„Goal: hold these items”** (`collectItems`, `{ itemId: darab }`, a meglévő `map` mezőtípussal, az Objectives csoportban). A jutalom a már meglévő `rewardItems` mezőt használja; nincs párhuzamos quest- vagy itemadatbázis.
- **Elhelyezés:** a térképobjektumok meglévő `spawn` metaadata két új szerepet kapott: `player` (kezdőpont) és `item` (felvehető tárgy; `refId` = item ID, `count` = darab, alapból 1). A `hoh-location` térkép-export ezeket már most kiírja a `spawns` listában.
- **Modell és szabályok:** [`src/core/gameplay.ts`](../src/core/gameplay.ts), enginefüggetlen. Esemény `itemAcquired`, feltétel `holdItems` (ÉS-kapcsolat, a tárgyakat nem veszi el), akció `giveItems`. A feltételt a quest indulásakor és minden `itemAcquired` után kell vizsgálni, a jutalom pontosan egyszer jár, amikor először teljesül. Darabszám csak ≥ 1 egész lehet: a hibás érték hiba, nem kerekítjük és nem vágjuk le. Ismeretlen item hiba. A típusos cél nélküli quest szöveges marad, `gameplay.textOnlyGoal` infóval; szövegből vagy névből semmit nem találunk ki. A koordináták az adott helyszín térképegységében vannak (a méterskála a 8. fázisé). Több kezdőpont figyelmeztetés (az első érvényes).
- **Képességmátrix:** a mozgáshoz kezdőpont, az interakcióhoz elhelyezett tárgy, a questekhez típusos célú quest kell. A kiválasztott rendszerek hibás típusos adata `proto.dataInvalid` hiba. Az `EngineIssue.where` kapott egy `id`-t is (melyik bejegyzés).
- **Migráció:** nem kellett, mert minden új mező opcionális, és a régi értékek érintetlenek. A Cinderholm betöltés → mentés → betöltés után változatlan, a 9 questje szöveges célú.
- **Referencia-terv:** a cél 1 Brass Key, a jutalom 5 Coin (item, egyszer), a kezdőpont a kapunál, a kulcs a kútnál; a `KNOWN_GAPS` frissült.
- **Ellenőrzés:** [`tests/gameplay.test.ts`](../tests/gameplay.test.ts) (9 teszt) és a frissített referencia-/képességtesztek; teljes kör 1311/1311 zöld, typecheck és lint zöld. Böngészőben az új questmező az Objectives csoportban megjelenik és szerkeszthető; a próba-questet utána visszavontam.
- **Nyitott, későbbi fázisba tartozik:** a térképszerkesztőben nincs még felület a `spawn` szerep beállítására (kezdőpont, tárgy) — ma csak adatként adható meg (6./8. fázis). Az IR és az export még nem viszi tovább a típusos célt és jutalmat (3. fázis).

### 3. Gameplay IR és kompatibilitás — függőség: 2

- A [`src/core/engine/ir.ts`](../src/core/engine/ir.ts) (jelenleg `IR_VERSION = 8`) és megfelelő részmoduljai kezeljék a választott gameplay-adatokat, a forrásazonosítókat és a támogatási problémákat; az új rész saját részmodulba kerüljön (az `irContent.ts`/`irPolish.ts` mintájára). Az IR-, adapter- és manifestverzió-változásokat a fogyasztók képességeivel összehangolva tervezzük.
- A közös IR új mezői ne rontsák el a Godot/Unreal exportot: ami ott nincs implementálva, azt egyértelműen jelezzük. Legyenek migrációs és adapter-szerződéstesztek.
- **Kész, ha:** a referencia azonos bemenetből azonos tartalmú IR-t ad; régi projektek és meglévő engine-exportok regresszió nélkül működnek.

**Állapot (2026-11-21): kész.**

- **IR v9:** [`src/core/engine/irGameplay.ts`](../src/core/engine/irGameplay.ts) → `EngineIR.gameplay` (opcionális): `profile` (dimension, perspective, renderPipeline, platform), `systems`, `quests` (csak a típusos céllal vagy tárgyjutalommal rendelkezők: `completeWhen: holdItems`, `onComplete: giveItems`, pénz, XP) és `placements` (kezdőpont, felvehető tárgy, térképkoordinátával). A tárgyhivatkozás a planner-ID (`item`, sosem változik) és a rekordkulcs (`key`, pl. `item.brass_key`), ha a tárgynak van adatrekordja. Ha nincs, `gameplay.itemNoRecord` figyelmeztetés, és csak a planner-ID marad.
- **Csak akkor van jelen,** ha a terv kér prototípust. Más projekteknél (pl. Cinderholm) az IR-ben nincs `gameplay`; az egyetlen változás az IR-verzió (v8 → v9) a generált fájlok fejlécében, ahogy minden korábbi IR-emelésnél. A Unity/Godot/Unreal pillanatképekben csak ez a sor frissült.
- **Adapterek:** egyik sem használja még a `gameplay` részt; teszt igazolja, hogy a kimenetük ugyanaz vele és nélküle. Godotban és Unrealben a bundle minden választott rendszerre `proto.unsupported` hibát ad, és a README „Not playable yet”. A manifest formátuma és az adapterverziók nem változtak, mert nincs új fájl vagy fogyasztói szerződés; ezek a runtime-modulokkal (4. fázistól) emelkednek.
- **Ellenőrzés:** [`tests/engineGameplayIR.test.ts`](../tests/engineGameplayIR.test.ts) (7 teszt: tartalom, determinizmus a builderből és a mentett fixture-ből, rekord nélküli tárgy, Cinderholm `gameplay` nélkül, az adapterek érzéketlenek rá, Godot/Unreal jelzés, a régi questadat érintetlen); a bridge `sample-manifest.json` fixture és a referencia-fixture újragenerálva. Teljes kör 1318/1318 zöld, typecheck és lint zöld.
- **Unity (6000.0.40f1, batch):** a v9 referencia-export a tesztprojektbe 20 fájlt írt, 12 változatlan maradt. Újraimport: 0 létrehozott és 2 frissített rekord (nincs duplikáció); `PlannerCI.Validate` 0 hiba; EditMode 31 teszt: 30 zöld, 1 kihagyott (ugyanaz, mint a 0. fázisban). A CLI nem szigorú módban 1 hibát (interakció nem támogatott) és 4 *frame* figyelmeztetést jelez, a kilépési kód 0.

### 4. Runtime-modulváz és életciklus — függőség: 3

- Unity runtime és editor felelősségének szétválasztása; szolgáltatások, függőségek, inicializálás, események, hibajelzés és leállítás szerződése. Az Editor bridge maradjon editoroldali.
- Hozzuk létre a külön runtime UPM-csomagot (1.1): asmdef-ek (runtime, EditMode- és PlayMode-teszt), `"unity": "2022.3"`, `.meta`-fájlok a meglévő `make-meta.cjs` mintájára. Rögzítsük a generált kód, a bridge és a runtime közötti verzió-kompatibilitást (a manifest jelezze a szükséges runtime-verziót), valamint az Input System, URP és egyéb opcionális package-ek kezelését `versionDefines`-szal vagy diagnosztikával.
- Első PlayMode-tesztkör itt induljon (nem csak a 13. fázisban), hogy a 7–12. fázis mindegyike valódi Unity-futással igazolható legyen.
- **Kész, ha:** egy minimális konfiguráció üres Unity-projektben indul és leáll, a tesztbuildben nincs Editor-függőség, a hiányzó kötelező modul vagy package érthető hibát ad, és a csomag 2022.3-on és Unity 6-on is fordul.

**Állapot (2026-11-21): kész.**

- **Csomag:** [`engine-packages/unity/com.handsofhubris.planner-runtime`](../engine-packages/unity/com.handsofhubris.planner-runtime/README.md) 0.1.0, `"unity": "2022.3"`, függőség nélkül, determinisztikus `.meta`-fájlokkal. A runtime assembly (`HoHPlanner.Runtime`) nem hivatkozik semmire, és nincs benne `UnityEditor`. Az Input System és az URP jelenlétét `versionDefines` jelzi (`HOH_INPUT_SYSTEM`, `HOH_URP`), referencia nélkül.
- **Szerződés:**
  - `IPlannerService`: Id, DependsOn, Initialize, Shutdown.
  - `PlannerRuntime`: függőségi sorrendben indít, fordított sorrendben állít le. Indítás előtt minden hibát egyszerre jelent (hiányzó kötelező modul, ismeretlen függőség, duplikált id, kör). Ha egy szolgáltatás nem tud elindulni, a már elindítottakat visszagörgeti; leállításkor egy hibázó szolgáltatás után is folytatja, és az `Errors` listába írja.
  - `PlannerEvents`: típusos eseménybusz; egy hibázó kezelő nem állítja meg a többit.
  - `PlannerRuntimeHost`: a scene-komponens, a terv kötelező moduljaival; hiány esetén egyetlen, érthető hibát naplóz.
  - `PlannerEnvironment`: a telepített *és aktív* Input System és URP ellenőrzése, mindegyik hibánál a javítás helyével.
- **Verzió-összehangolás:** a manifest új, opcionális mezője, a `requires.runtime { package, version }`, csak akkor szerepel, ha a terv prototípust kér és a cél Unity. A bridge (`PlannerManifest.RuntimeProblem`/`RequireRuntime`) a ZIP-importot még írás előtt, a linked-folder rekordlépését pedig a rekordok előtt leállítja, ha a csomag hiányzik vagy régebbi, és megmondja, mit kell telepíteni vagy frissíteni. A bridge **nem** függ a runtime-tól, így prototípus nélküli projekteknek nem kell.
- **TS-ellenőrzés:** [`tests/unityRuntime.test.ts`](../tests/unityRuntime.test.ts) (7 teszt: név és verzió egyezése a package.json, a C# és a planner között; nincs `UnityEditor` a runtime-ban; `.meta` minden assethez; tesztassembly-k; a `requires` csak Unity + prototípus esetén szerepel; a bridge mindkét importútvonalon ellenőriz). Bridge-fixture újragenerálva; teljes kör 1325/1325, typecheck és lint zöld.
- **Unity 6000.0.40f1** (`C:\UnityProjects\ReferenceSlice3D`, runtime + bridge `testables`-ben): a v9 referencia-export importja a telepített runtime mellett átment (0 létrehozott, 2 frissített rekord), `Validate` 0 hiba. EditMode 40 teszt: 39 zöld (ebből 8 runtime és egy új bridge-teszt a runtime-követelményre), 1 kihagyott (a régi). PlayMode 2/2 zöld.
- **Unity 2022.3.21f1** (`C:\UnityProjects\Runtime2022`, csak a runtime, Input System és URP nélkül): EditMode 8/8, PlayMode 2/2 zöld.
- **Build:** Windows x64 standalone egy `PlannerRuntimeHost`-ot tartalmazó scene-nel (a tesztprojekt saját, nem csomagolt `Assets/Smoke` szkriptjeivel): a build sikeres, 0 hibával. A player batch módban elindította a runtime-ot („Running”, a szolgáltatás elindult), leállította („Stopped”), és 0-val lépett ki. A runtime a buildben is jelezte a két környezeti hiányt (Input System nem aktív, nincs URP pipeline asset).
- **Unity talált hibák:** CS1628 (`out` paraméter lokális függvényben, javítva); a „nincs telepítve” üzenetekből hiányzott a javítás helye (javítva, a 2022.3-as teszt fogta meg).
- **Nem futott:** a valódi elutasított import végig (hiányzó runtime mellett) — a döntési logikát EditMode-teszt fedi; a 2022.3-on Input System/URP telepítéssel; macOS/Linux build. A generált projektkód még nem hivatkozik a runtime-ra (az 5./7. fázistól).

### 5. Import-előnézet és védett újragenerálás — függőség: 3

- Legyen előnézet létrehozásról, módosításról, törlésről, ütközésről és nem támogatott elemről. Jelöljük a planner-, Unity- és felhasználó-tulajdonú tartalmat.
- Tervezzünk megszakítás- és újrapróbálás-kezelést a fordítás/domain reload körül, valamint konfliktus esetén biztonságos megállást. A ZIP- és linked-folder út következetesen tartsa be ugyanazokat a védelmi szabályokat.
- **Kész, ha:** kétszeri import idempotens; átnevezés, ütköző saját fájl, sikertelen import és helyreállítás tesztelt; asset GUID és saját munka nem vész el.

**Állapot (2026-11-21): kész.**

- **Közös tulajdonosi szabályok:** [`src/core/engine/ownership.ts`](../src/core/engine/ownership.ts) a plannerben és [`PlannerOwnership.cs`](../engine-packages/unity/com.handsofhubris.planner-bridge/Editor/PlannerOwnership.cs) a bridge-ben, azonos esetekkel. A közös [`ownership-cases.json`](../engine-packages/unity/com.handsofhubris.planner-bridge/Tests/Editor/Fixtures/ownership-cases.json) fixture-t a TS-teszt generálja, és a C# teszt futtatja; FNV-1a-hashek, köztük nem ASCII szöveg is.
  - **Saját fájl:** a „yours” előtag alatt; csak létrehozható.
  - **Planner-fájl:** a tartalma még az előző manifestben szereplő hash-re képződik (a sorvég nem számít, így a Git CRLF-je nem módosítás); szabadon frissíthető vagy törölhető.
  - **Ütközés:** amit az import felülírna, de kézzel módosult, vagy nem a planner írta; az import írás előtt megáll.
  - **Megtartott fájl:** a generált mappákban a planner által nem írt vagy azóta módosult fájlt soha nem töröljük, csak jelentjük („keptNotOurs”).
- **Előnézet:**
  - planner: *Preview changes*, illetve `previewExport`;
  - CLI: `--preview` (kilépési kód 3 ütközésnél);
  - Unity: *Tools ▸ Game Design Planner ▸ Preview import…* és `PlannerCI.Preview`.
  
  Mindegyik fájlonként listáz: új / változott / törölt / változatlan / saját / ütköző / megtartott.
- **Biztonságos megállás és felülírás:**
  - planner: „Stopped before writing”, majd *Overwrite them (keep a backup)*;
  - CLI: `--overwrite`;
  - Unity: dialógus *Overwrite (keep a backup)*, illetve `-hohOverwrite`; CI-ben a 3-as kilépési kód jelzi az ütközést.
- **Mentés, napló, visszaállítás:** minden felülírt vagy törölt fájl (a `.meta`/`.uid`/`.import` kísérőfájlokkal) írás előtt a `.hoh-backup/<idő>/` mappába kerül egy `journal.json`-nal. A napló formátuma mindkét oldalon azonos, így bármelyik oldal visszaállíthatja a másik írását; a Unity a pont kezdetű mappát nem importálja. Az utolsó 5 mentés marad meg.
  - Félbeszakadt írásnál automatikus visszagörgetés történik; ha az is elbukik, a hibaüzenet megnevezi a mentés helyét.
  - Visszaállítás: *Restore last write* (planner), `--restore` (CLI), *Restore last import* és `PlannerCI.RestoreLastImport` (Unity).
  - Be nem fejezett írásról figyelmeztetés kap a planner-panel és a Unity editor indulása is.
- **Domain reload:** a meglévő függő-import jelzőfájl a fájllépés után marad; a napló a fájllépést védi, a rekordlépés továbbra is a reload után fut.
- **Viselkedésváltozás:**
  - eddig a generált mappák minden ismeretlen fájlját töröltük, most csak azt, amit a planner írt és azóta nem változott;
  - a kézzel módosított generált fájl eddig csendben felülíródott, most megállítja az importot.
  
  Ezt a meglévő tesztek frissítése rögzíti (engineFolder, Godot/Unreal linked folder, bridge fájllépés és átnevezés).
- **TS-ellenőrzés:**
  - [`tests/engineOwnership.test.ts`](../tests/engineOwnership.test.ts), 18 teszt: előnézet, ütközés, első írás idegen fájllal, CRLF, felülírás mentéssel és visszaállítás, idempotencia mentés nélkül, visszagörgetés félbeszakadt írásnál, félbeszakadt napló, 5 mentés megtartása, közös esetek és a fixture;
  - UI-teszt: stop → előnézet → felülírás → visszaállítás;
  - a teljes kör 1344/1344 zöld, a typecheck és a lint is.
- **Unity 6000.0.40f1:** `C:\UnityProjects\ReferenceSlice3D-ci`, mert az eredeti tesztprojektet a felhasználó nyitva tartotta.
  - Kézi módosítás után a ZIP-import 3-as kóddal megállt, a módosítás megmaradt.
  - `-hohOverwrite`: 1 felülírt fájl, mentéssel.
  - `RestoreLastImport`: a kézi módosítás visszakerült.
  - Újra felülírás, majd változatlan újraimport: 0 írt fájl.
  - EditMode: 47 teszt, 46 zöld (7 új tulajdonosi teszt is), 1 kihagyott (a régi).
- **CLI a nyitott eredeti projekten:** ütközésnél 3-as kóddal megállt, majd `--overwrite` után a terv állapotára állt vissza; ott most van egy `.hoh-backup/` mappa.
- **Nem ellenőrizve:** a planner UI valódi böngészős linked-folder írása (File System Access API, csak jsdom-teszt); Godot- és Unreal-oldali visszaállítás (a napló formátuma közös, de a saját bridge-ük nem olvassa).

### 6. Planner-felület: prototípus-előkészítés — függőség: 1, 2

- Az Engine export nézetben legyen célprofil, modulválasztás, függőséglista, hiányzó adatokra mutató navigáció és előnézet. A felület különítse el a játszhatóságot akadályozó hibákat, a placeholdert és a fejlesztői keretet.
- Minden új szöveg kövesse az alkalmazás meglévő lokalizációs és hozzáférhetőségi mintáit; a jóváhagyások és változások legyenek visszavonhatók, ahol a planner állapota módosul.
- **Kész, ha:** a referencia és egy hiányos terv esetén a felhasználó megérti, mi fog ténylegesen működni, és hová kell mennie a hibák javításához.

**Állapot (2026-11-21): kész.**

- **Engine export › Playable prototype panel** ([`src/ui/editors/prototypePanel.tsx`](../src/ui/editors/prototypePanel.tsx)):
  - **Verdikt** (`role="status"`, ikon és szöveg, nem csak szín): „Playable” vagy „Not playable yet — N blocking problems, M systems only a frame”.
  - **Profil:** négy választó (dimenzió, perspektíva, pipeline, platform), „Not chosen” alapértékkel.
  - **Rendszertábla:**
    - jelölőnégyzet rendszerenként;
    - motorbeli szint jelvénnyel: *Works from the plan* / *Working module* / *Frame only: you write the behaviour* / *Not supported yet*, a megjegyzés tooltipben;
    - függőségek, és ha hiányoznak, „Choose …” gomb;
    - hiányzó adatok soronként.
  - **Csoportosított problémák:** *Blocks playing* (hibák), *Frames you finish in code* (keretek), *Also check* (egyéb figyelmeztetések), valamint egy külön sor a **placeholderekről**: ennyi rekordnak nincs még art a tervben, és ez nem akadálya a játéknak.
  - **Javítási hivatkozás:** minden hiányhoz és problémához tartozik egy „Fix in <tervező> › <szekció> (mező) →” link. A cél a `/doc/<doc>?s=<szekció>`, bejegyzésnél `&e=<id>`.
  - **Visszavonhatóság:** minden módosítás `useStore.mutate`-en át történik, egy-egy visszavonható lépésként, és ugyanazt az adatot írja, mint a Technical Architecture › Playable prototype űrlap.
  - **Prototípus nélküli terv:** a panel kimondja, hogy nincs kérve prototípus, és nem következtet semmire. Az első választással bekapcsol a prototípus-ellenőrzés.
- **Térképszerkesztő** ([`ObjectPanel.tsx`](../src/ui/editors/location/ObjectPanel.tsx)): új „Gameplay” mező a pont és doboz alakú objektumokhoz.
  - Választható: *Player start*, *Item to pick up* (tárgyválasztóval és 1–99 közötti darabszámmal), valamint a meglévő ellenség-, főellenség-, NPC- és kereskedőszerepek.
  - Ismeretlen tárgyhivatkozásnál „Unknown item (…)” jelenik meg.
  - Ezzel a 2. fázis nyitott pontja (a spawn-szerep szerkesztése) lezárult.
- **Szövegek:** az Engine export nézet mintáját követik (angol UI-szöveg, `countOf`-többes szám, képernyőolvasóknak `sr-only` „Missing:” előtag, jelvényben ikon és szöveg együtt).
- **Ellenőrzés:**
  - [`tests/prototypeUi.test.tsx`](../tests/prototypeUi.test.tsx), 5 teszt:
    - a referencia állapota (1 blokkoló, 4 keret, placeholderszám);
    - hiányos terv (kezdőpont és típusos cél nélkül), pontos javítási hivatkozásokkal;
    - profilváltás visszavonással; rendszer kivétele és a „Choose Interaction” gomb;
    - a Cinderholm-típusú, prototípus nélküli terv és a bekapcsolás;
    - a térképobjektum szerepének, tárgyának és darabszámának szerkesztése.
  - A teljes kör 1349/1349 zöld, a typecheck és a lint is.
  - Böngészőben a fejlesztői szerveren: a panel megjelenik; a bekapcsolás után a verdikt, a blokkoló lista és a „Fix in Story & Quests › Quests (collectItems)” link helyes. A próbaváltoztatásokat visszavontam (5 lépés), újratöltés után az oldal hibátlanul betölt.
- **Nem része:** a hivatkozás mezőszintű fókuszálása (a mező neve szövegben látszik), és a placeholderek rekordonkénti listája (az Engine status panel és a riport mutatja).

### 7. Input és 3D játékos — függőség: 1, 4

- A meglévő `.inputactions`-generálást bővítsük típusos tengely- és 2D vektorakciókkal, composite bindingokkal (pl. WASD → Move) és inputkontextusokkal (játék / UI). Az ismeretlen binding jelenjen meg hibaként vagy figyelmeztetésként.
- Készítsünk egyszerű 3D mozgásmodult (CharacterController alapon, konfigurálható sebesség, gravitáció, ugrás csak ha a terv kéri) és **third-person követő kamerát** (távolság, magasság, érzékenység a tervből). A Cinemachine használata nem előfeltétel; ha bevezetjük, opcionális package-ként kezeljük. Más perspektíva ebben a fázisban nem támogatott, és diagnosztikát ad.
- A perspektíva választása az 1. fázis mezőjéből jön; a 6. fázis navigációja kényelmi réteg, nem előfeltétel.
- **Kész, ha:** a referencia PlayMode tesztje szimulált bemenettel (Input System `InputTestFixture`) mozgatja a játékost, a kamera követi, és a hiányzó Input System package diagnosztizált.

**Állapot (2026-11-21): kész.**

- **Explicit tervadat, név alapján semmit nem találunk ki:**
  - UI / UX › Controls új „Runtime action” mezője (`drives`): Move forward/back/left/right, Interact.
  - Player Character › Controls and camera új számmezői: `moveSpeed` (m/s), `cameraDistance` és `cameraHeight` (m).
  - Ha egy beállítás üres, a látható alapértékek (4 m/s, 5 m, 2 m) lépnek életbe; az IR `player.defaulted` listája felsorolja őket, és `gameplay.default` infó, valamint a generált kód megjegyzése is jelzi.
  - Ha egy akcióhoz két control is tartozik, `gameplay.twoControls` figyelmeztetés jelzi, és az első érvényes.
- **IR:** a `gameplay.input` (a mozgást és az interakciót vezérlő controlok és billentyűik) és a `gameplay.player` (beállítások). A képességmátrix a mozgáshoz a négy Move-, az interakcióhoz az Interact-controlt kéri. A mozgás szintje Unityben *template* lett.
- **Unity-adapter (v8)**, csak ha a mozgás ki van választva:
  - Az `.inputactions` kap egy „Prototype” mapet (ha a tervben van ilyen nevű kategória, „Planner prototype” a neve). Benne: `Move` (Vector2, 2DVector composite a tervezett billentyűkből, gamepad esetén `<Gamepad>/leftStick` is) és `Interact`.
  - `Scripts/Generated/Gameplay/PlannerGameplay.cs`: a beállítások, a map és az akciók neve, valamint a tervezett billentyűk Input System-neve.
  - A generált asmdef hivatkozik a `HoHPlanner.Runtime`-ra.
  - **Generált PlayMode-teszt** (`Tests/PlayMode/PlannerPlayerTests.cs` + asmdef, `HOH_INPUT_SYSTEM` feltétellel): a projekt saját `.inputactions` assetjén át, virtuális billentyűzettel a tervezett előre-billentyűvel előre, a balra-billentyűvel balra sétáltatja a játékost. Ellenőrzi, hogy a sebesség nem haladja meg a tervezettet, és hogy a kamera a tervezett távolságban és magasságban, a játékos mögött van. Bemenet nélkül a játékos nem mozdul.
  - Az ismeretlen Move-billentyű `unity.moveKey` figyelmeztetést ad.
- **Runtime 0.2.0:**
  - `PlannerMovement` („movement” szolgáltatás): CharacterController, kamera-yaw-relatív mozgás, fordulás és gravitáció.
  - `PlannerThirdPersonCamera`: rögzített yaw, tervezett távolság és magasság.
  - `PlannerPlayer.Create(position, settings)` és `IPlannerMoveSource`.
  - Külön assemblyben a `PlannerInputSystemSource`; csak telepített Input Systemmel fordul (`versionDefines`).
  - A MonoBehaviourök saját, osztálynévvel azonos fájlban vannak, hogy a 8. fázis scene-jeibe menthetők legyenek.
  - A manifest a 0.2.0-t követeli meg.
- **Bridge Validate:** prototípust kérő exportnál hiba, ha az Input System nincs telepítve vagy nem aktív, és ha nincs telepítve URP; figyelmeztetés, ha az URP nem az aktív pipeline. Mindegyik üzenet megnevezi a javítás helyét.
- **TS-ellenőrzés:**
  - új [`tests/unityGameplay.test.ts`](../tests/unityGameplay.test.ts), 6 teszt: értékek a tervből; alapértékek jelezve; nincs találgatás névből, kettős control jelzése; gamepad-stick csak gamepaddel; ismeretlen billentyű és map-névütközés; mozgás nélkül nincs lejátszó-kód;
  - frissített referencia-, képesség-, IR- és UI-tesztek;
  - typecheck és lint zöld.
- **Unity 6000.0.40f1** (`ReferenceSlice3D-ci`):
  - `Validate` a régi Input Managerrel 1-es kóddal megállt („The Input System is installed but not active: … Active Input Handling …”); „Both” beállítással 0 hiba, és figyelmeztetés, hogy az URP nincs beállítva.
  - EditMode 47 teszt: 46 zöld, 1 kihagyott.
  - **PlayMode 9/9 zöld**: a generált játékosteszt 2/2, a runtime mozgás- és kamerateszt 3/3, a virtuális billentyűzetes teszt 2/2, a host-teszt 2/2.
- **Unity 2022.3.21f1** (csak runtime, Input System nélkül): EditMode 8/8, PlayMode 5/5 (az Input System-es assembly ott nem fordul, ahogy kell).
- **Unity talált hibák, javítva:**
  - a képkockaszám-alapú várakozás batch módban túl rövid volt, ezért a tesztek most idő alapján várnak;
  - batch módban nincs fókuszált Game view, így az Input System a billentyűzet-eseményeket eldobta; a tesztek ideiglenesen az „AllDeviceInputAlwaysGoesToGameView” beállítást használják, mint az `InputTestFixture`.
- **Nyitott:**
  - a játékos még nem a térkép kezdőpontján, generált scene-ben áll (8. fázis);
  - nincs egérrel forgatható kamera (a yaw rögzített);
  - a nyitott eredeti tesztprojektben (`ReferenceSlice3D`) közben valaki „Both”-ra állította az Active Input Handlinget.
- **Cinderholm-példa javítása (a felhasználó kérésére):** a fájl 2026-11-21 22:34-kor egy régebbi változatra állt vissza, emiatt 13 teszt bukott. A példát a tesztek által várt állapotra igazítottam, a teszteket nem módosítottam:
  - `meta.engine.target = "unity"`;
  - Save System: `version` 3, `manualSlots` 3, `autoSlots` 3, és az 5 mentett rész (Town, Villagers, Hero, Quest log v2-től, World clock v3-tól);
  - jelenetek roadmap-fázissal: Bootstrap Pre-production, Persistent systems / Main menu / World Prototype, HUD Vertical Slice;
  - az „Iron sword” tárgy és recept neve „Iron longsword”, értéke 1100. Ez szándékosan az Item value tartományon kívül esik, így a Balance-ellenőrzés jelzi.
  
  A tárolt Unity-riport nem került vissza; a tesztek riport nélküli állapotból indulnak. A javítás előtti fájl mentése a session scratchpadjában van. Ezután a generált C#-pillanatkép (csak az adapter v8 fejléce) és a bridge `sample-manifest.json` fixture frissült. **Teljes kör 1355/1355 zöld**, a typecheck és a lint is.

### 8. Scene, prefab és elhelyezés — függőség: 4, 5, 7

- A meglévő location-exportból és greyboxból készítsünk külön, generált prototípusscene-t: járható terület, kezdőpont, kamera, URP-fény és konfigurált objektumok, URP-kompatibilis placeholder-anyagokkal. A térkép szemantikáját és skáláját (1 planner-egység = ? méter) dokumentáljuk. A scene a meglévő `PlannerScenes`/build-scene lépésen át kerüljön a buildbe.
- Editor API-val generálható placeholder prefab és komponensösszeállítás, de az assetcsere és a saját prefab megőrzése legyen támogatott. A már meglévő greybox működése ne változzon észrevétlenül.
- **Kész, ha:** a generált scene Play módban elindul, a referenciában nincs hiányzó script vagy kötelező referencia, újraimport után nincs duplikáció.

**Állapot (2026-11-22): kész.**

- **Explicit tervadat:** Technical Architecture › Playable prototype két új, opcionális mezője (Scene csoport):
  - **Prototype scene** (`scene`, hivatkozás a Technical Architecture › Scenes egyik elemére): ebben a scene-ben játszható a prototípus. A Unity-scene fájlneve ennek a neve, így a meglévő `PlannerScenes`/Build Settings lépés megtalálja.
  - **Map scale (metres per map unit)** (`mapScale`). Üresen a greyboxszal azonos alapérték érvényes: a térkép egy walkability-cellája 1 m (a referencián 10 egység = 1 m, 0,1 m/egység). Ezt `gameplay.default` infó jelzi a javítási hellyel.
  - A helyszín nem választás: az **első player start** helyszíne. A képességmátrixban a mozgás új adat-előfeltétele a Prototype scene (`proto.dataMissing`, hivatkozással a mezőre). Ismeretlen scene-hivatkozás `gameplay.unknownScene`, nem pozitív skála `gameplay.badScale` hiba (`proto.dataInvalid`).
- **Térkép szemantikája és skálája** (dokumentálva a `hoh-location` formátum leírásában és a bridge README-ben): az origó a bal felső sarok, a térkép x keletre (+x), y délre (−z) mutat. Méter = térképegység × skála; a magasságok méterben vannak (a fal 2 m).
- **IR (v9, verzióemelés nélkül, ahogy a 7. fázisban):** `gameplay.scene` = { `scene` {id, name}, `location`, `locationName`, `map` (a bundle-beli `Maps/<id>.json`, közös `mapFile` segédfüggvénnyel), `metresPerUnit` vagy `cell` }.
- **Unity-adapter v9:**
  - `PlannerGameplay` új mezői: `Scene`, `SceneLabel`, `PlacedItems`.
  - Új generált PlayMode-teszt (`Tests/PlayMode/PlannerPrototypeSceneTests.cs`, csak választott scene esetén): betölti a felépített scene-t, és ellenőrzi:
    - nincs hiányzó script;
    - a runtime `Running`;
    - a játékos a kezdőponton áll, a padlón;
    - a mozgás- és kamerabeállítások a tervéi;
    - minden tervezett pickup a helyén van;
    - az előre-billentyű a scene-ben is mozgatja a játékost.
- **Runtime 0.3.0:** `PlannerPlacement` (szerep, a térképobjektum és a helyszín planner-ID-je, item-ID, rekordkulcs, darabszám) — a 9–10. fázis erre épül. A manifest a 0.3.0-t követeli meg.
- **Bridge:** új, opcionális `HoHPlanner.Bridge.Prototype` assembly. Csak `com.handsofhubris.planner-runtime` ≥ 0.3.0 mellett fordul (`versionDefines`), így a bridge prototípus nélküli projektben továbbra sem függ a runtime-tól.
  - **Indítás:** *Tools ▸ Game Design Planner ▸ Build prototype scene*, illetve `PlannerPrototypeScene.CI` (kilépési kód: 0 kész vagy naprakész, 1 hiba, 3 kézzel módosított scene, `-hohOverwrite`).
  - **Kimenet:** `<root>/Prototype/<tervezett név>.unity`, `PlannerPrototype` címkével.
  - **Tartalom:**
    - `PlannerRuntimeHost` a terv moduljaival;
    - szint (padló, fal, ajtó, zár/kulcs, a térkép fényei) a tervezett skálán;
    - nap (URP light data-val);
    - a játékos a kezdőponton, a tervezett sebességgel és a generált input mappel;
    - követő kamera (URP camera data-val);
    - `PlannerPlacement` a kezdőponton, minden pickupon (triggerrel) és a térkép többi spawnján.
  - **Anyagok:** URP Lit, ha az URP telepítve van; ha nincs, Standard, megjegyzéssel.
  - **Ellenőrzés építés előtt:** érthető hibát kap a hiányzó prototípus, mozgás, scene, player start, térkép, input asset és Input System, valamint a nem járható helyre tett kezdőpont.
- **Greybox:** a padló/fal/ajtó/zár-kulcs/fény kódja közös lett (`Geometry`, `Markers`, `Lights`, skálaparaméterrel). A greybox 1-es skálával, ugyanazokkal az anyagokkal, hierarchiával és mesh-mentéssel fut, mint eddig.
- **Tulajdon és újraimport:**
  - **A bridge-é:** a scene, a mesh-ek (`Prototype/Meshes`) és az anyagok (`Prototype/Materials`). Újraépítéskor helyben frissülnek, a GUID-juk marad.
  - **A felhasználóé:** a `Prototype/Player.prefab` és a pickupok `Prototype/Prefabs/<key>.prefab` fájljai. Egyszer készülnek, utána a bridge nem írja felül őket. Assetcsere: az item rekord prefabmezőjét kitöltve a pickup azt mutatja.
  - **Változatlan terv:** a `.prototype.json` ujjlenyomat (terv, térkép, prefab-útvonalak, input asset, shader, paletta) alapján nem épül újra semmi.
  - **Kézzel módosított scene:** megállítja az építést; felülírásnál másolat kerül a `.hoh-backup/<idő>/` mappába. A tervezett scene átnevezésekor a scene `MoveAsset`-tel átnevezi (a GUID marad).
  - **Import után:** a konzol figyelmeztet, ha a prototípus-scene hiányzik vagy elavult.
- **Build Settings:** a `PlannerCI.BuildScenes` eddig roadmap-fázis nélküli tervet nem fogadott el (a referencia ilyen). Most `-plannerPhase` nélkül minden tervezett scene-t felvesz.
- **TS-ellenőrzés:**
  - új [`tests/unityPrototypeScene.test.ts`](../tests/unityPrototypeScene.test.ts), 7 teszt: scene/helyszín/térkép/alapskála az IR-ben; tervezett és hibás skála; scene nélkül blokkoló hiba a javítás helyével, és nincs scene-teszt; ismeretlen scene; player start nélkül nincs scene; generált konstansok és teszt; runtime 0.3.0;
  - frissült: referencia-, IR-, képesség-, runtime-teszt, a Unity-pillanatkép (csak az adapter v9 fejléce) és a bridge `sample-manifest.json`;
  - teljes kör 1362/1362 zöld, a typecheck és a lint is.
- **Unity 6000.0.40f1** (`ReferenceSlice3D-ci`, a referencia CLI-exportja):
  - Import: 9 írt fájl, fordítási hiba nélkül. `Validate`: 0 hiba, 3 figyelmeztetés (az URP nem aktív pipeline, 2 placeholder ikon). Az import utáni figyelmeztetés jelezte, hogy a scene még nincs felépítve.
  - `PlannerPrototypeScene.CI`: felépült a `Keeper’s Yard.unity`. Második futás: „up to date”, a fájl bájtra azonos.
  - **EditMode: 53 teszt, 52 zöld, 1 kihagyott** (a régi). Ebből 6 új bridge-teszt:
    - felépítés és tartalom (skála, ID-k, kamera, input asset, padló és fény méretben);
    - változatlan terv → nincs építés; skálaváltás → újraépítés azonos scene- és mesh-GUID-dal, duplikáció nélkül;
    - kézzel módosított scene → megállás, majd felülírás mentéssel;
    - a módosított `Player.prefab` megmarad, és a scene használja;
    - hiányzó adatok üzenetei;
    - nem járható kezdőpont.
  - **PlayMode: 11/11 zöld**, köztük a generált `StartsWithNothingMissing` és `ThePlayerWalksWithThePlannedKeys` a valódi, felépített scene-ben.
  - **Újraimport ugyanabból a ZIP-ből:** 0 írt fájl. A scene a PlayMode-futás után is naprakész és bájtra azonos maradt.
  - **Build Settings:** `PlannerCI.BuildScenes` → `Assets/HoHPlanner/Prototype/Keeper’s Yard.unity`.
  - **Windows x64 standalone build** (a tesztprojekt saját, nem csomagolt `Assets/Smoke` szkriptjeivel): sikeres, 0 hiba. A player batch módban: runtime `Running`, a játékos a kezdőponton ((40; 0,05; −28) m = (400; 280) egység × 0,1) a padlón maradt, a main camera megvan, 1 pickup, 0 hiányzó script, kilépési kód 0.
- **Unity 2022.3.21f1** (csak runtime): a 0.3.0 fordul, EditMode 8/8 zöld.
- **Böngésző** (fejlesztői szerver, a megnyitott saját projekten, módosítás nélkül): a Playable prototype űrlapon megjelenik a „Prototype scene” és a „Map scale (metres per map unit)” mező; nincs konzolhiba.
- **Nem ellenőrizve, nyitott:**
  - a bridge prototípus-assemblyje 2022.3-on (a 2022-es tesztprojektben nincs bridge);
  - URP-vel mint *aktív* pipeline-nal a renderelés (a tesztprojektben az URP telepítve van, de nincs beállítva; az anyagok URP Lit shaderrel készültek);
  - macOS/Linux build;
  - NavMesh a prototípus-scene-ben (a greyboxé változatlan);
  - csak az első player start helyszíne épül, több helyszín vagy scene-váltás nincs;
  - a pickup még nem vehető fel (9. fázis), a nem tárgy-spawnok (pl. ellenség) csak jelölők.

### 9. Interakció és tárgyfelvétel — függőség: 7, 8

- Általános interakciós szerződés, célpontkeresés, távolság és visszajelzés; a referencia tárgya felvehető. A tárgy azonosítója és paraméterei a tervből jöjjenek.
- **Kész, ha:** érvényes interakció egyszer hajtódik végre; túl távoli vagy érvénytelen célpont nem ad tárgyat; a működés PlayMode teszttel igazolt.

**Állapot (2026-11-22): kész.**

- **Tervadat:**
  - Új mező: Player Character › Controls and camera › **Interaction range (m)** (`interactRange`). Ha üres, 2 m az alapérték; ezt `gameplay.default` infó jelzi, de csak akkor, ha a terv interakciót választott.
  - A tárgy azonosítója és darabszáma a térképobjektumból jön (2. fázis), a megjelenített neve a tárgy rekordjából.
  - A referencia-terv explicit 2 m-t ad meg.
- **Képességmátrix:** az interakció Unityben *unsupported* helyett *template*. Az adat-előfeltételek nem változtak (Interact control, elhelyezett tárgy). A referencia-exportban így **nincs blokkoló hiba**. A verdikt továbbra is „Not playable yet”, mert az inventory, a questek és a mentés még csak keret (3 figyelmeztetés).
- **IR (v9):** `gameplay.player.interactRange`.
- **Unity-adapter v10:**
  - `PlannerGameplay.InteractRange`, és `Pickups`: a scene tárgyai (planner item-ID, rekordkulcs, darab).
  - A generált `PlannerPrototypeSceneTests` interakció esetén két új tesztet kap:
    - `PicksUpThePlannedItemOnceWithTheInteractKey`: a tárgy mellé teszi a játékost, a tervezett Interact billentyűvel pontosan egy, a tervezett tárgyat és mennyiséget tartalmazó `PlannerItemAcquired` eseményt kap, a pickup eltűnik, és az újabb lenyomás nem ad semmit;
    - `GivesNothingFromTooFarAway`: a tervezett hatótávnál messzebbről nincs célpont és nincs tárgy.
- **Runtime 0.4.0:**
  - **`IPlannerInteractable`:** az általános interakciós szerződés (pozíció, prompt, `CanInteract`, `Interact`), a `PlannerInteractables` regiszterrel.
  - **`PlannerInteractor`** („interaction” szolgáltatás, a „movement” után):
    - a játékostól a talajsíkon mért hatótávon belül a legközelebbi használható célpontot választja ki;
    - az Interact lenyomására egyszer cselekszik; nyomva tartás nem jelent új lenyomást;
    - csak futó runtime mellett működik, így egy tárgy sosem vész el esemény nélkül;
    - a `TargetChanged` esemény szolgál a visszajelzéshez.
  - **`PlannerPickup`:** egyszer adja oda a tárgyat (`PlannerItemAcquired` a runtime eseménybuszán), majd eltűnik. Tárgy nélküli vagy 1 alatti darabszámú elhelyezés nem célpont, és figyelmeztetést ad.
  - **`PlannerInteractionPrompt`:** képernyőn megjelenő felirat, például „[E] Pick up Brass Key”. IMGUI-val készül, ezért nem kell hozzá UI-asset; a 10. fázis HUD-ja kiválthatja.
- **Bridge (scene-építő 2. verzió):** interakció esetén:
  - minden pickup kap egy `PlannerPickup` komponenst a rekord nevével;
  - a scene kap egy *Interaction* objektumot (`PlannerInteractor` a tervezett hatótávval, prompt a tervezett billentyűvel). Ez nem része a felhasználó `Player.prefab`-jának, így a meglévő saját prefab változatlan marad;
  - a host az „interaction” modult is megköveteli.
  
  Az asmdef a runtime 0.4.0-t követeli meg. A korábbi scene az import után „out of date” jelzést kapott, és újraépült.
- **TS-ellenőrzés:**
  - új [`tests/unityInteraction.test.ts`](../tests/unityInteraction.test.ts), 6 teszt: hatótáv a tervből; alapérték csak választott interakciónál; *template* szint, a referenciában nincs blokkoló; hiányzó Interact control helye; `Pickups` konstans; a generált pickup-tesztek csak interakció esetén;
  - frissült: referencia-, képesség-, UI-, IR-, runtime-teszt, pillanatkép (az adapter v10 fejléce) és bridge-fixture;
  - teljes kör 1368/1368 zöld, a typecheck és a lint is.
  - A `cloudUi.test.tsx` időzítésfüggő tesztje egy teljes futásban egyszer elbukott, önmagában 3× zöld (ismert, 0. fázis).
- **Unity 6000.0.40f1** (`ReferenceSlice3D-ci`):
  - Export: 0 hiba. Import: 9 írt fájl, fordítási hiba nélkül. `Validate`: 0 hiba.
  - **EditMode: 54 teszt, 53 zöld, 1 kihagyott** (a régi), köztük az új `AddsInteractionWhenThePlanChoseIt` (a komponensek és értékek, nincs hiányzó script, az interakció nem a prefab része).
  - **PlayMode: 19/19 zöld**, köztük:
    - 6 runtime-teszt: egyszeri felvétel; nyomva tartás; hatótávon kívül; érvénytelen pickup; legközelebbi célpont és prompt; leállított runtime;
    - a 2 generált teszt a felépített scene-ben.
  - **Windows x64 build** (saját `Assets/Smoke` szkripttel): sikeres. A player batch módban megjelenítette a „[E] Pick up Brass Key” promptot; az első interakció `item.brass_key ×1`-et adott, a második semmit; kilépési kód 0.
- **Unity 2022.3.21f1** (csak runtime): EditMode 8/8, PlayMode 11/11 zöld (az interakciós tesztekkel).
- **Böngésző:** a Controls and camera űrlapon megjelenik az „Interaction range (m)” mező; nincs konzolhiba. A saját projektet nem módosítottam.
- **Nem része, nyitott:**
  - a felvett tárgy még nem kerül inventoryba, és nem frissíti a HUD-ot (10. fázis), csak az esemény jön létre;
  - a felvétel ténye nincs mentve (12. fázis);
  - a prompt IMGUI, nem a terv HUD-ja;
  - nincs célpont-kiemelés és nincs látóirány-feltétel (csak távolság);
  - a buildben a felvételt kódhívás indította, nem szimulált billentyű (azt a PlayMode-teszt fedi);
  - URP mint aktív pipeline, macOS/Linux build és a bridge 2022.3-on továbbra sem ellenőrzött.

### 10. Inventory és UI-binding — függőség: 9

- Stabil itemazonosítóra épülő inventory, mennyiségek és a választott korlátok; HUD és minimális inventorynézet valódi futásidejű adatkötéssel. A meglévő UXML-router maradhat, ahol megfelelő.
- A terv által nem megadott stack- vagy kapacitásszabály ne legyen rejtett feltételezés: a referencia adja meg vagy a felület kérje be.
- **Kész, ha:** felvételkor a UI frissül, a mennyiség helyes, telítettség/érvénytelen item tesztelt, a UI nem csupán elnevezett placeholder.

**Állapot (2026-11-22): kész.**

- **Tervadat, rejtett feltevés nélkül** ([`inventoryRules`](../src/core/gameplay.ts)):
  - **Slotok:** Items & Crafting › Inventory › Inventory slots.
  - **Stackméret tárgyanként:** a tárgy saját *Max stack* értéke, ha nincs, az Item model *Default stack size* értéke. Ha egyik sincs, `gameplay.noStack` hiba keletkezik (a tárgyra mutat), a rendszer nem talál ki értéket. A nem egész vagy 1 alatti érték `gameplay.badStack` / `gameplay.badSlots` hiba.
  - **Minden tárgy elfoglal slotot**, a „Currency” típus sem kivétel; ilyen szabályt a terv nem mond ki.
  - **Súly:** a súlykorlátot (`weightLimit`) a runtime még nem kezeli.
- **Megjelenítés a HUD-on:** a meglévő UI-tervező strukturált kötéseiből jön: *Grid* az inventoryhoz kötve, *Counter* egy tárgyhoz kötve. A generált UXML-ben ezek `bind-inventory`, illetve `bind-item-<id>` nevű elemek. Ha egyik sincs, `gameplay.inventoryNotShown` figyelmeztetés jelzi.
- **Referencia-terv:** a HUD-ra egy 2×4-es inventory-grid (8 slot, egyezik a tervvel) és egy Coin-counter került. A `KNOWN_GAPS` frissült.
- **Képességmátrix:** az inventory Unityben *frame* helyett *template*. A referencia-exportban 0 hiba van, és 2 keret maradt (questek, mentés).
- **IR (v9):** `gameplay.inventory` = { `slots`, `items` [{item, key, name, stack}], `shown` {grid, counters} }.
- **Unity-adapter v11:**
  - `PlannerGameplay` új mezői: `InventorySlots`, `HudShowsInventory`, `HudItemCounters`.
  - Új generált teszt, `PickingUpFillsTheInventoryAndTheHud`. A tervezett slotszám mellett ellenőrzi, hogy a felvett tárgy a tervezett mennyiségben bekerül az inventoryba, megjelenik a HUD griden (slotonként egy cella), és a counterek az inventory értékét mutatják.
- **Runtime 0.5.0:**
  - **`PlannerInventory`** („inventory” szolgáltatás):
    - a tervezett slotokat kezeli, a tárgyakat planner-ID alapján azonosítja;
    - a stackméretig tölti a meglévő slotot, utána új slotot nyit;
    - a `TryAdd`/`TryRemove` minden-vagy-semmi: ismeretlen tárgy, 1 alatti darabszám vagy kevés hely esetén semmi sem változik;
    - változáskor a `Changed` és a `PlannerInventoryChanged` esemény fut.
  - **`IPlannerItemReceiver`:** a pickup csak akkor tűnik el és ad eseményt, ha az inventory mindent befogadott. Tele inventorynál a tárgy a helyén marad, a prompt: „Inventory full: …”.
  - **`PlannerHudBinding`:** a terv HUD-UXML-jét köti az inventoryhoz, és minden változásra frissít.
- **Bridge (scene-építő 3. verzió):**
  - *Inventory* objektum a tervezett slotokkal és tárgyakkal.
  - *HUD* objektum: `UIDocument` a tervezett HUD-képernyővel (a generált UXML, a HUD osztály alapján megtalálva) és a kötéssel. Hozzá tartozik a `Prototype/UI/PanelSettings.asset` (a Unity alapértelmezett runtime témájával, a terv felbontásával), amely egyszer készül el, utána a felhasználóé.
  - **Javított hiba, a valódi Unity-futás fogta meg:** a forráskeresés a `.hoh-backup/` mappát is bejárta. Az ott lévő régi `Hud.uxml` ordinális rendezésben előrébb került, így a scene `UIDocument`-je üres maradt. Ugyanez a hiba az `.inputactions`-keresést is érinthette. Most minden rejtett (pontos nevű) mappa kimarad, a be nem tölthető HUD-asset pedig hibát ad. A bridge-teszt egy backup-másolattal rögzíti a javítást.
- **TS-ellenőrzés:**
  - új [`tests/unityInventory.test.ts`](../tests/unityInventory.test.ts), 7 teszt: szabályok a tervből; Default stack és hiányzó stack hibája a helyével; hibás stack/slot; nincs HUD-kötés → figyelmeztetés; választás nélkül nincs ellenőrzés; IR; Unity-export és runtime 0.5.0;
  - frissült: referencia-, képesség-, UI-, verzió- és runtime-teszt, pillanatkép (az adapter v11 fejléce) és bridge-fixture;
  - **teljes kör 1375/1375 zöld**, a typecheck és a lint is.
- **Unity 6000.0.40f1** (`ReferenceSlice3D-ci`):
  - **Az első futás hibát talált:** a generált teszt nem fordult le, mert hiányzott a `using UnityEngine.UIElements`. Javítva.
  - **Mellékhatás:** ezután a hibásan generált fájl miatt a batch import már el sem indult. Ezt a javított fájl kézi helyre tételével oldottam fel (a tartalma azonos az exporttal, így az import változatlannak látta).
  - Ezután: import, `Validate` 0 hiba. A scene újraépült, a `UIDocument` a tervezett `Hud.uxml`-re mutat.
  - **EditMode: 55 teszt, 54 zöld, 1 kihagyott** (a régi). Köztük az új `AddsTheInventoryAndShowsItOnThePlannedHud`, a backup-másolatok kizárásával.
  - **PlayMode: 26/26 zöld:**
    - 6 új runtime-teszt: stackelés; tele inventory; ismeretlen tárgy és rossz darabszám; elvétel; pickup tele inventoryba; HUD-kötés;
    - a generált `PickingUpFillsTheInventoryAndTheHud` a felépített scene-ben.
  - **Windows x64 build:** sikeres. A playerben felvétel után az inventory tartalma `refItemKey×1` (8 slotból), a HUD griden „Brass Key” és 7 üres cella látszik, a counter „Coin: 0”; kilépési kód 0.
- **Unity 2022.3.21f1** (csak runtime): EditMode 8/8, PlayMode 17/17. Az első EditMode-napló egy `CS0246`-ot tartalmazott (a frissen hozzáadott `Inventory/` mappa előtti fordítás); a tiszta újrafuttatás 0 fordítási hibával zöld.
- **Nem ellenőrizve, nyitott:**
  - a HUD tényleges kirajzolása (a player `-nographics` módban futott, a tartalmat a vizuális fa adja; képernyőkép nem készült);
  - a súlykorlát és a hotbar;
  - külön inventory-képernyő és képernyőváltás (a tervezett HUD-gridet használjuk);
  - a quest-tracker kötése (11. fázis);
  - az inventory mentése (12. fázis);
  - a Coin csak a questjutalommal jönne (11. fázis).
- **Tanulság a CI-hez (13. fázis):** egy le nem forduló generált fájl után a batch import nem tud javítani, mert a Unity a fordítási hiba miatt a metódus előtt kilép. Ehhez helyreállítási út kell (pl. a fájllépés a fordítás előtt, vagy dokumentált kézi lépés).

### 11. Questcélok és jutalmak — függőség: 2, 9, 10

- A meglévő questgráfra és `PlannerQuestLog`-ra építve eseményekhez kötött, típusos célok és feltételek; elsőként item megszerzése. A jutalom megadása legyen tranzakciós szemléletű és ismétlésbiztos.
- A még csak szöveges cél jelenjen meg nem végrehajthatóként; meglévő gráf- és elérhetőségi tesztek maradjanak érvényesek.
- **Kész, ha:** a referencia célja csak a tényleges játékeseménytől teljesül, a jutalom pontosan egyszer jár, és tiltott/hiányzó hivatkozás nem indul el csendben.

**Állapot (2026-11-22): kész.**

- **A questgráf marad a tekintély:** a meglévő, generált `PlannerQuestLog` (requires, blocks, döntések) dönti el, mi indulhat és mi kész. Az adapter egy kis generált komponenst ad hozzá: a `Scripts/Generated/Story/PlannerQuestGraph.cs` ezt planner-ID szerint a runtime `IPlannerQuestGraph` felületén teszi elérhetővé. A runtime így soha nem indít a tervben nem engedett questet.
- **Típusos cél és jutalom** (a 2. fázis szabályai): a cél a „hold these items” (ÉS-kapcsolat, a tárgyakat nem veszi el), a jutalom tárgy, valamint pénz és XP.
  - A cél csak tényleges játékeseményből teljesülhet: a quest indulásakor és minden inventoryváltozás után ellenőrződik. Név vagy szöveg alapján soha.
  - A **jutalom tranzakciós és ismétlésbiztos**:
    - a több tárgyból álló jutalom egyben kerül be (`PlannerInventory.TryAddAll`), vagy semmi;
    - ha nem fér el, a quest vár (`PlannerQuestRewardWaiting`), és a következő helyet adó változáskor kapja meg;
    - pontosan egyszer jár;
    - egy olyan quest, amelyet a gráf már korábban késznek jelölt (pl. betöltött állás), nem kap újra jutalmat.
  - A pénz és az XP a `PlannerQuestCompleted` eseményben jelenik meg; pénztárca- vagy szintmodul még nincs, amely felhasználná.
- **Tiltott vagy hiányzó hivatkozás nem indul el csendben:** ha a gráf hiányzik, vagy egy szabály a gráf által nem ismert questet, illetve az inventory által nem ismert tárgyat nevez meg, a runtime indítása az összes okkal együtt meghiúsul. Exportoldalon az ismeretlen tárgy továbbra is `proto.dataInvalid` hiba.
- **Szöveges cél:** a típusos cél nélküli quest `proto.questTextOnly` figyelmeztetést kap („never completes by playing”), és nem kerül a runtime szabályai közé.
- **Képességmátrix:** a questek Unityben *frame* helyett *template*. A questek mostantól az inventoryt is megkövetelik (`proto.requires`), mert a cél „tartsd ezeket a tárgyakat”. A referencia-exportban 0 hiba van, és csak a mentés maradt keret.
- **Unity-adapter v12:**
  - `PlannerGameplay.Quests`: a típusos questek céllal és jutalommal.
  - `PlannerQuestGraph.cs`: csak választott questrendszer és tervezett questek esetén készül.
  - Új generált teszt, `TheQuestCompletesOnlyByPlayingAndRewardsOnce`: a quest a gráf szerint aktív, de játék előtt nem kész, és egy ellenőrzés sem teljesíti. A céltárgyak felvétele után kész, pontosan egy `PlannerQuestCompleted` jön, és a tervezett jutalom bekerül. Újabb ellenőrzésre és lenyomásra sincs második jutalom. A HUD questkövetője mutatja a questet.
- **Runtime 0.6.0:**
  - `PlannerQuests` („quests”, az „inventory” után), `IPlannerQuestGraph`, `PlannerQuestRule`/`PlannerItemAmount`;
  - események: `PlannerQuestStarted`, `PlannerQuestCompleted`, `PlannerQuestRewardWaiting`;
  - `PlannerInventory.TryAddAll`;
  - a `PlannerHudBinding` questkövetője (`bind-quest`, `bind-quest-<id>`): név és haladás (pl. „Brass Key 0/1”), illetve „— done”.
- **Bridge (scene-építő 4. verzió):**
  - *Quests* objektum a generált gráffal (interfész alapján keresi, nem hivatkozik a játék kódjára) és a típusos szabályokkal;
  - a host a „quests” modult is megköveteli, a HUD-kötés megkapja a questeket;
  - inventory nélküli questválasztásra okkal együtt megáll.
- **TS-ellenőrzés:**
  - új [`tests/unityQuests.test.ts`](../tests/unityQuests.test.ts), 7 teszt: *template* szint, és a referenciában csak a mentés keret; inventory nélkül `proto.requires`; szöveges quest figyelmeztetése a helyével; ismeretlen jutalomtárgy hibája; a generált gráf; a quest-konstansok és a generált teszt; questrendszer nélkül nincs gráf és nincs teszt;
  - frissült: referencia-, képesség-, UI-, IR-, verzió- és runtime-teszt, pillanatkép (az adapter v12 fejléce) és bridge-fixture;
  - **teljes kör 1382/1382 zöld**, a typecheck és a lint is.
- **Unity 6000.0.40f1** (`ReferenceSlice3D-ci`):
  - Az első import a runtime egy fordítási hibáján állt meg (CS0819: két, `var`-ral deklarált változó a `for` fejében). Javítva; ez csomagkód, ezért nem okozott import-holtpontot.
  - Ezután: import (9 írt fájl, a generált gráf lefordult), `Validate` 0 hiba, a scene újraépült.
  - **EditMode: 56 teszt, 55 zöld, 1 kihagyott** (a régi `PlannerStoryTests` eset), köztük az új `AddsTheQuestsWithThePlannedGraphAndRules`.
  - **PlayMode: 33/33 zöld:**
    - 6 új runtime-teszt: cél csak inventoryból és egyszeri jutalom; a tervezett gráf; tele inventory és egyben adott jutalom; korábban kész quest nem kap jutalmat; ismeretlen hivatkozás; hiányzó gráf;
    - a generált questteszt a felépített scene-ben.
  - **Windows x64 build:** sikeres. A playerben a kulcs felvétele után a „Find the brass key” kész és jutalmazott. Az inventory: Brass Key és Coin ×5, a HUD counter „Coin: 5”, a questkövető „Find the brass key — done”; kilépési kód 0.
- **Unity 2022.3.21f1** (csak runtime): EditMode 8/8, PlayMode 23/23. Az első EditMode-napló ugyanazt az átmeneti hibát mutatta, mint a 10. fázisban (az új `Quests/` mappa felismerése előtti fordítás); a tiszta újrafuttatás 0 hibával zöld.
- **Böngésző:** nem néztem; ebben a fázisban nincs új űrlapmező, a panel új figyelmeztetését UI- és képességtesztek fedik.
- **Nem része, nyitott:**
  - a questindítás automatikus, amint a gráf engedi (questadó NPC: 16. fázis);
  - döntések meghozatala játékból (a `PlannerQuestLog.Choose` megvan, de nincs hozzá játékmenet);
  - a pénz és az XP nem kerül pénztárcába vagy szintbe;
  - a quest- és jutalomállapot mentése (12. fázis);
  - a HUD tényleges kirajzolása (grafika nélküli player).

### 12. Menthető vertical slice — függőség: 8, 10, 11

- A meglévő `PlannerSave` kerethez (`IPlannerSaveable`, slotok, migrációs lánc) kapcsolódjon a játékos, inventory és questállapot; definiáljuk a részek stabil kulcsait, a mentési és betöltési sorrendet, és hogy a slot-/verzióbeállítás a Save System modul meglévő mezőiből jön.
- Sérült, hiányzó, régebbi és újabb mentés esetén legyen egyértelmű hiba vagy dokumentált migráció; ne vesszen el észrevétlenül adat.
- **Kész, ha:** a 4. fejezet első vertical slice-a PlayMode-ban és célzott buildben mentés/betöltés után végigjátszható, a tényleges teszteredmény rögzítve.

**Állapot (2026-11-22): kész — a 4. fejezet első vertical slice-a PlayMode-ban és Windows standalone buildben is végigjátszható, menthető és betölthető.**

- **Explicit kapcsolat a tervben:** a Save System › Saved parts új mezője a **Runtime state** (`state`: Player position / Inventory / Quests). Megmondja, melyik mentett rész melyik futásidejű állapotot tartja; a rész nevéből semmit nem találunk ki.
  - Két rész ugyanarra az állapotra: `gameplay.twoSaveParts` figyelmeztetés, az első érvényes.
  - Ha egy választott rendszer (mozgás, inventory, questek) állapotát egyik rész sem tartja, `proto.dataMissing` hiba („loading would lose it”) mutat a mezőre.
  - A **slot- és verzióbeállítás** a Save System meglévő mezőiből jön (version, manual/auto slots, compressed), a generált `PlannerSave`-en át, változatlanul.
  - A referencia-terv három része (Player / Inventory / Quest log) be van kötve. A `KNOWN_GAPS` frissült.
- **Stabil kulcsok és sorrend:**
  - A részek kulcsai a meglévő `PlannerSaveKeys` (`player`, `inventory`, `quest_log`).
  - A **betöltési sorrend** a terv sorrendje (`PlannerSaveKeys.Order`).
  - A betöltés előbb **minden részt ellenőriz**, és csak utána állít vissza bármit. Visszaállítás közben a questek szünetelnek, így a visszaállított inventory nem teljesít újra questet és nem ad újra jutalmat.
  - Az inventory-rész a térképről már felvett pickupokat is tartalmazza: a kettő együtt mozog, így a felvett tárgy nem jön vissza és nem duplázódik.
- **Hibás, régebbi és újabb mentés:** a generált `PlannerSave` új `PlannerSaveException` kivételt dob a következő esetekben, és ilyenkor semmi sem áll vissza:
  - sérült fájl (nem JSON vagy rossz gzip);
  - nem ennek a játéknak a mentése;
  - újabb verzió, mint a build;
  - elbukó migráció.
  
  A hiányzó migrációs lépést naplózza; ilyenkor a rész a mentett verziójával áll vissza.

  A rész tartalmának hibái a runtime `PlannerStateException` kivételét adják, ezek is az alkalmazás előtt:
  - sérült JSON;
  - ismeretlen tárgy vagy pickup;
  - stackméretnél nagyobb darabszám;
  - több kitöltött slot, mint a terv engedi.
  
  A tervből azóta kikerült questek figyelmeztetéssel kimaradnak. A nem tervezett részeket a fájl megtartja, a visszaállítás figyelmen kívül hagyja.
- **IR (v9):** `gameplay.save.parts` [{part, key, state}], terv szerinti sorrendben.
- **Képességmátrix:** a mentés Unityben *frame* helyett *template*. **A referencia verdiktje most először „Playable”**: minden választott rendszer működik, nincs blokkoló. A bundle README-je „**Playable.**”. Keretrendszer (pl. harc) választása visszavonja ezt (teszt rögzíti).
- **Unity-adapter v13:**
  - `PlannerSave` megerősítve (kivétel, napló, sorrend), és 3 új generált EditMode-teszttel: sérült mentés, újabb build, tervezett sorrend.
  - `PlannerQuestGraph.SaveState`/`LoadState` (a `PlannerQuestLog` JsonUtility-vel).
  - Új `Scripts/Generated/Save/PlannerSaveSlice.cs` (`IPlannerSaveSystem`): regisztrálja a bekötött részeket, és a betöltéskor ellenőriz, szüneteltet, a terv sorrendjében állít vissza.
  - Új generált PlayMode-teszt, `TheSliceIsTheSameAfterSavingAndLoadingIntoAFreshGame`:
    - játék: felvétel, quest kész és jutalmazva, séta, mentés;
    - **friss játék** (a scene újratöltése), majd betöltés: pozíció, darabszámok, felvett pickupok és a quest állapota visszaáll, és nincs második jutalom;
    - végül egy sérült mentés elutasítva, állapotváltozás nélkül.
- **Runtime 0.7.0:**
  - `PlannerGameState`: `Capture`/`Check`/`Restore` és `BeginRestore`/`EndRestore`;
  - `PlannerStateException`, `IPlannerSaveSystem`;
  - visszaállító metódusok: `PlannerInventory.Check`/`Restore`, `PlannerPickup.SetTaken`, `PlannerPlayer.Teleport`, `PlannerQuests` állapot és `Paused`;
  - a `IPlannerQuestGraph` mentési tagokat kapott.
- **Bridge (scene-építő 5. verzió):**
  - *Save* objektum a `PlannerGameState`-tel és a generált `PlannerSaveSlice`-szal (interfész alapján megtalálva).
  - Okkal együtt megáll, ha mentés van választva bekötött rész nélkül, vagy ha egy rész olyan rendszert tart, amely nincs választva.
- **TS-ellenőrzés:**
  - új [`tests/unitySave.test.ts`](../tests/unitySave.test.ts), 8 teszt: a mező; kapcsolatok sorrendben és kettős rész; nincs találgatás névből, és hiányzó kapcsolatnál hiba a helyével; a referencia „Playable”; IR; a megerősített `PlannerSave` és tesztjei; a slice és a generált teszt; mentés nélkül nincs slice;
  - frissült: képesség- (verdikt), UI- („Playable”), referencia-, IR-, verzió- és runtime-teszt, pillanatkép (az adapter v13 fejléce és a `PlannerSave`) és bridge-fixture;
  - **teljes kör 1390/1390 zöld**, a typecheck és a lint is. Egy teljes futásban a `v3CompanionUi.test.tsx` ismert időzítésfüggő tesztje egyszer elbukott; önmagában 3× zöld.
- **Unity 6000.0.40f1** (`ReferenceSlice3D-ci`):
  - **Az import elsőre holtpontra futott:** a frissített runtime új interfésztagjait az előző export generált kódja még nem implementálta, a projekt nem fordult, és a batch mód az `Import` előtt kilépett. A **`-ignorecompilererrors`** kapcsolóval a bridge (amely nem függ a játék kódjától) lefutott, és 12 fájlt írt. Ezután a `Validate` 0 hibával fordított. A helyreállítási út a bridge README CI-szakaszában dokumentálva.
  - A scene újraépült.
  - **EditMode: 60 teszt, 59 zöld, 1 kihagyott** (a régi `PlannerStoryTests` eset), köztük a 3 új generált mentésteszt és az új `AddsTheSaveWithThePartsLinkedToRuntimeState`.
  - **PlayMode: 39/39 zöld:**
    - 5 új runtime-teszt: friss játékba töltés jutalom nélkül; sérült rész az alkalmazás előtt; nem engedett inventory; ismeretlen pickup; nem pozíció;
    - a generált mentés–friss játék–betöltés teszt.
- **Windows x64 standalone build** (saját `Assets/Smoke` szkripttel), kilépési kód 0:
  - játék: a felvétel után a quest kész és jutalmazva, Coin ×5;
  - mentés: séta után a `smoke-1` slotba;
  - friss játék a scene újratöltésével (0 érme);
  - betöltés: a játékos a mentett helyen ((41; 0,08; −27) a mentett (41; 0,09; −27) helyett), az inventory Brass Key és Coin ×5, a quest kész és jutalmazva, a pickup felvéve, betöltés közben 0 jutalom;
  - sérült mentés: `PlannerSaveException: The save smoke-1 is damaged and was not loaded`, az állapot változatlan.
- **Unity 2022.3.21f1** (csak runtime): EditMode 8/8, PlayMode 28/28. Az első EditMode-futás most is az átmeneti, új mappa előtti fordítási hibát mutatta; a tiszta újrafuttatás 0 hibával zöld.
- **Böngésző:** a Saved parts oldal hibátlanul betölt. A mezőt nem nyitottam meg, mert a megnyitott saját projektben nincs mentett rész, és nem akartam adatot hozzáadni; a mezőt TS-teszt ellenőrzi.
- **Nem része, nyitott:**
  - nincs mentés/betöltés billentyű és menü (a terv nem tervez ilyen vezérlést; API és tesztek használják);
  - nincs autosave-időzítés;
  - részenként, verzióváltáskor nincs automatikus migráció, a játéknak kell `AddMigration`-t adnia;
  - a pénz és az XP nincs mentve (nincs modul, amely tárolná);
  - a quest-, inventory- és pozíciórészen kívül más állapot nem mentődik;
  - macOS/Linux build, aktív URP, a bridge 2022.3-on.
- **A 13. fázisnak:**
  - a CI-ben az `Import` lépés fusson `-ignorecompilererrors`-szal;
  - az újraimport/értékváltozás/mentés ellenőrzései ezen a referencián már lokálisan reprodukálhatók;
  - a vertical slice 5. pontja (újraimport duplikáció nélkül, értékváltozás frissül) a 3., 5. és 8. fázisban igazolva.

### 13. Keresztrendszeres teszt és CI-kapu — függőség: 12, 5

- A meglévő CLI-re (`npm run export:engine`), `PlannerCI`-ra és a game-ci alapú példaworkflow-ra építve automatizáljuk a referencia exportját, Unity-importját, fordítását, EditMode és PlayMode tesztjeit, valamint egy minimális standalone buildet a referencia célplatformjára. Mátrix: Unity 6 (teljes kör) és 2022.3 LTS (legalább import + fordítás). A CI írja ki a pontos Unity-verziót, csomagokat és eredményeket.
- Külön tesztelje a változatlan újraimportot, értékváltozást, assetmegtartást és mentés/betöltést. Ha Unity vagy licenc nem elérhető, a kapu legyen **blokkolt**, ne sikeresnek jelentett.
- **Kész, ha:** a teljes szelet reprodukálhatóan zöld, és egy szándékosan törött referencia legalább az érintett ellenőrzést elbuktatja.

**Állapot (2026-11-22): kész — lokálisan, valódi Unityvel reprodukálhatóan zöld; GitHub Actionsben még nem futott.**

- **Gate-futtató:** `npm run gate:unity` ([`scripts/unityGate.ts`](../scripts/unityGate.ts) és `unityGateMain.ts`). Az export CLI-hez hasonlóan Node-ra buildelt eszköz, amely ugyanazt a core-t használja.
  - **Bemenet:** a referencia-terv (`--plan`). Az exportot a meglévő CLI végzi (`--strict`).
  - **Mátrix:** Unity 6 *full* (`--editor`, `HOH_GATE_EDITOR`) és 2022.3 LTS *compile* (`--compile`, `HOH_GATE_COMPILE`). Alapérték a Hub 6000.0.40f1 és 2022.3.21f1 szerkesztője.
  - **Projekt:** szerkesztőnként egy Unity-projekt (`--work`, `--fresh`) ebből a repóból `file:` hivatkozású bridge-dzsel és runtime-mal, valamint a profil csomagjaival:
    - Unity 6: Input System 1.13.0, URP 17.0.4, Test Framework 1.4.6;
    - 2022.3: 1.7.0, 14.0.11, 1.1.33.
  - **Lépések, Unity 6:**
    - export, projekt, előkészítés (`PlannerCIProject.Prepare`), import (`-ignorecompilererrors`), fordítás és `Validate`, prototípus-scene, Build Settings;
    - EditMode- és PlayMode-tesztek (NUnit XML alapján);
    - player a terv platformjára (`PlannerCIProject.BuildPlayer`) és a **player önellenőrzése** (`-hohSelfTest`);
    - mentés és betöltés friss játékba (a generált PlayMode-teszt és a player együtt);
    - **változatlan újraimport** (0 írt fájl, a scene naprakész);
    - **értékváltozás** (járási sebesség +1 m/s): a kódba és a scene-be eljut, a saját fájl (`Unity/Scripts/Classes`) és a `Player.prefab` változatlan, a scene és a prefab GUID-ja marad, majd vissza az eredeti tervre.
  - **Lépések, 2022.3:** projekt, előkészítés, import, fordítás és `Validate`, EditMode.
  - **Jelentés:** `gate-report.json` és `.md`, benne a Unity-verzió, a csomagok verziói (a helyieké a `package.json`-ból), lépésenként az eredmény, a részletek és az idő.
  - **Kilépési kód:** 0 sikeres, 1 bukott, 2 **blokkolt**. Ha nincs Unity, nem indul, vagy licenchiba van a naplóban, az blokkolt, sosem sikeres; a függő lépések szintén blokkoltak.
  - **Szándékos törések** (`--break`): `quest-unreachable` (2 kulcsot kér a quest, a térképen 1 van), `no-interact` (nincs Interact-control), `missing-scene` (ismeretlen Prototype scene).
- **Bridge:** új `PlannerCIProject` CI-segéd, csak hívásra fut:
  - `Prepare`: Active Input Handling „Both”, és URP-asset rendererrel mint alapértelmezett pipeline (reflexióval, URP-referencia nélkül);
  - `BuildPlayer -hohBuildPath … -hohBuildTarget …`.
- **Runtime 0.8.0:** `PlannerSelfTest` a buildelt playerhez (`-hohSelfTest`, `-hohSelfTestReport`). Ellenőrzi:
  - a runtime fut, nincs hiányzó script;
  - minden pickup egyszer vehető fel;
  - a teljesült célú quest kész és jutalmazott;
  - a mentés friss játékba betöltve azonos, és nincs közben jutalom.
  
  Ez váltja ki a korábbi, csak lokális `Assets/Smoke` szkriptet. Új: `IPlannerSaveSystem.Delete`, Unity-adapter v14.
- **CI-workflow-k** (GitHubon nem futottak):
  - új [`ci/planner-gate.yml`](../engine-packages/unity/ci/planner-gate.yml) a planner repójához: self-hosted Windows runner aktivált Unityvel, mert licenc kell. Előbb a TS-tesztek, majd a gate; a jelentés job summary és artifact; blokkolt vagy bukott futásnál a job elbukik. Kézi indításkor törés is választható;
  - a `plan-to-unity.yml` (a játék repója) kapott egy game-ci `unity-test-runner` lépést (EditMode és PlayMode), és a PR szövege jelzi az eredményt.
- **Talált és javított hibák:**
  - Windows alatt az `npm run` a `cmd.exe`-n át `^` karakterekkel adta át az idézett szerkesztő-útvonalat. A gate ezt helyesen *blokkolt*-ként (exit 2) jelentette, és nem sikerként; ez véletlenül a blokkolt ágat is valódi futásban igazolta, a jelentés megmaradt. A futtató most eltávolítja a karakteres escape-et, és környezeti változóból is elfogadja a szerkesztőt.
  - A `file:` csomagok verziója a jelentésben útvonalként szerepelt; most a `package.json` verziója látszik.
- **TS-ellenőrzés:**
  - új [`tests/unityGate.test.ts`](../tests/unityGate.test.ts), 13 teszt: NUnit-olvasás; licenc → blokkolt, fordítási hiba → bukott; csomaglista; verdikt és kilépési kód; Markdown; manifest és Input System beállítás; törések (a két exporttörés hibát ad, a `quest-unreachable` exportja tiszta, így csak Unity foghatja meg); értékváltozás; `^`-escape;
  - frissült: verzió-tesztek, pillanatkép (az adapter v14 fejléce) és bridge-fixture;
  - **teljes kör 1403-ból 1402 zöld**; a kivétel az ismert, időzítésfüggő `v3CompanionUi` teszt (önmagában zöld). Egy Unityvel párhuzamos futásban a `locationUi` egy tesztje is túllépte az időt; önmagában zöld. A typecheck és a lint is zöld.
- **Valódi futások** (`C:\UnityProjects\hoh-gate`, a jelentések ott vannak):
  - **Friss projektekkel, mindkét szerkesztő: PASSED** (exit 0, `gate-report-pass.md`):
    - Unity 6000.0.40f1, mind a 14 lépés zöld: EditMode 59/60 (1 kihagyott, a régi), PlayMode 39/39, Windows player 94,6 MB, önellenőrzés 5/5, mentés/betöltés, újraimport 0 írással, értékváltozás 7/7 részellenőrzéssel;
    - Unity 2022.3.21f1: projekt, előkészítés, import (38 fájl), fordítás és `Validate` 0 hibával, EditMode 59/60.
  - **`--break quest-unreachable`: FAILED** (exit 1): az export tiszta, a **PlayMode 37/39**, a `TheQuestCompletesOnlyByPlayingAndRewardsOnce` és a questre épülő mentésteszt bukik. A mentés/betöltés lépés kimarad, a többi zöld.
  - **`--break no-interact`: FAILED** (exit 1): a **`--strict` export bukik** („Interaction … needs a control whose Runtime action is Interact”), a ráépülő Unity-lépések kimaradnak.
  - **Helyreállítás** ugyanabban a projektben: PASSED (exit 0).
  - **Blokkolt ág** (a fenti hibás útvonal): minden Unity-lépés blokkolt, exit 2 (`gate-report-blocked-no-unity.md`).
- **Korábbi nyitott pontok, most igazolva:**
  - URP mint **aktív** pipeline: a `Validate` csak a 2 placeholder-ikont jelzi, a player így épül és fut;
  - a bridge a prototípus-assemblyvel együtt **2022.3-on** fordul, és a tesztjei zöldek;
  - a Unity-verziók és csomagok jelentésben rögzítve.
- **Nem ellenőrizve, nyitott:**
  - a workflow-k GitHub Actionsben (licencelt runner kell);
  - Linux/macOS player (a gate `skipped`-et ad, ha a host nem futtathatja);
  - game-ci-s, GitHub által hosztolt változat;
  - PlayMode 2022.3-on a bridge-dzsel (a runtime PlayMode-tesztjei 2022.3-on korábban zöldek voltak);
  - a 2022-es projekt első létrehozása hálózatot igényel a csomagok letöltéséhez.

### 14. Crafting és erőforrások — függőség: 10, 12

- A meglévő item- és receptadatokat típusos bemenetre, kimenetre, mennyiségre és előfeltételre képezzük le. Kész runtime és UI kezelje a tranzakciót.
- **Kész, ha:** egy tervből érkező recept megfelelő alapanyag esetén pontos eredményt ad; hiányzó anyagnál nem fogyaszt részlegesen, mentés után is konzisztens.

**Állapot (2026-11-22): kész.**

- **Típusos receptek a meglévő adatból** ([`recipeRules`](../src/core/gameplay.ts), Items & Crafting › Recipes; nincs párhuzamos adatbázis):
  - **bemenet:** az *Ingredients* tárgyai × mennyiség (egész, ≥ 1);
  - **kimenet:** *Result* × *Output quantity*; üresen 1, ahogy a mező súgója mondja;
  - **előfeltétel:** az *Unlocked by* questjei, és mindegyiknek késznek kell lennie. Ha több quest szerepel, ezt `gameplay.recipeUnlocks` infó jelzi.
  
  Hibák: ismeretlen vagy hiányzó eredmény (`gameplay.recipeResult`), rossz mennyiség (`gameplay.badCount`), ismeretlen tárgy, összetevő nélküli recept (`gameplay.recipeNoInputs`).
  
  **A nem futtatott részek jelzést kapnak, nem utánzást:**
  - a nyersanyagot (*Raw resources*) igénylő recept kimarad (`gameplay.recipeResources` figyelmeztetés), mert a nyersanyag nem inventory-tárgy;
  - az állomás, a szükséges skill, a nem quest jellegű feloldás és a craft-idő nincs ellenőrizve (`gameplay.recipeUnchecked` infó; a crafting azonnali, és bárhol végezhető).
- **Új Runtime action:** *Open crafting* (UI / UX › Controls). Az `.inputactions` Prototype mapje kap egy *Crafting* akciót a tervezett billentyűvel és gamepad-gombbal.
- **Képességmátrix:**
  - a crafting Unityben *frame* helyett *template*;
  - új adatfeltételek: egy legyártható recept, és egy *Open crafting* control;
  - ha egy receptet quest old fel, a Quests rendszert is választani kell (`proto.requires`).
  
  A referencia „Playable” maradt: mind a 6 választott rendszer *template*.
- **Referencia-terv:**
  - új *Polished Key* tárgy;
  - *Recipe* séma (`Recipes — Items & Crafting`);
  - *Polished Key* recept (Brass Key ×1 + Coin ×2 → Polished Key ×1, a questtel oldható fel);
  - *Crafting* control a C billentyűn;
  - a crafting rendszer választva.
  
  Az export 41 fájl, 4 rekord, 0 hiba.
- **IR (v9):** `gameplay.crafting.recipes` [{recipe, key, name, inputs, output, unlockQuests}], rekordkulcsokkal.
- **Unity-adapter v15:**
  - a Crafting input-akció;
  - `PlannerGameplay.CraftingKey`, `PlannerGameplay.Recipes`;
  - új generált teszt, `CraftsExactlyAndNeverConsumesInPart`. A tervezett billentyű nyitja a panelt, receptenként egy sor van, a zárolt vagy hiányos recept semmit nem fogyaszt, a játék után minden legyártható recept pontosan a bemenetéért pontosan a kimenetét adja, és bemenet nélkül az újabb gyártás semmit nem változtat.
- **Runtime 0.9.0:**
  - **`PlannerCrafting`** („crafting”, az „inventory” után, és ha quest old fel, a „quests” után):
    - a `CanCraft` megmondja, miért nem gyártható (zárolt, melyik bemenet hiányzik, nincs hely);
    - a `TryCraft` egyetlen változásban veszi el a bemenetet és adja a kimenetet (`PlannerInventory.TryExchange`), vagy semmi sem változik;
    - események: `PlannerItemCrafted` és `PlannerItemAcquired`;
    - ismeretlen tárgy vagy quest esetén az indítás az összes okkal meghiúsul.
  - **`PlannerCraftingPanel`** (IMGUI, mint a prompt): a tervezett control nyitja (`IPlannerMenuSource`, az Input System-forrás Crafting-akciója); receptenként mutatja, mi van meg és mi kell, Craft gombbal, vagy az okot.
  - **Mentés:** a craftingnek nincs saját állapota, ezért **mentés után is konzisztens** (teszt rögzíti). Az önellenőrzés minden legyártható receptet legyárt, és a mentés/betöltés már ezt az állapotot ellenőrzi.
- **Bridge (scene-építő 6. verzió):** *Crafting* objektum a `PlannerCrafting`-gel és a panellel; a host megköveteli a „crafting” modult. Okkal megáll, ha a crafting inventory nélkül vagy questfeloldás Quests nélkül van választva.
- **TS-ellenőrzés:**
  - új [`tests/unityCrafting.test.ts`](../tests/unityCrafting.test.ts), 11 teszt: szabályok; üres és rossz kimeneti mennyiség; eredmény- és összetevőhibák; nyersanyagos recept kihagyva; a nem ellenőrzött részek és a több questes feloldás; *template* szint és „Playable”; hiányzó control és legyártható recept; Quests-függés; IR; billentyű, konstansok, generált teszt; crafting nélkül nincs semmi;
  - frissült: képesség-, IR-, UI-, referencia-, inventory-, verzió- és runtime-teszt, pillanatkép (az adapter v15 fejléce) és bridge-fixture;
  - **teljes kör 1414-ből 1411 zöld**. A 3 kivétel a már ismert, terhelésfüggő UI-tesztek (`v3CompanionUi` ×2, `locationUi` ×1); önmagukban kétszer is 11/11 zöldek, és ez a fázis nem érintette őket. A typecheck és a lint zöld.
- **Unity-gate** (`npm run gate:unity`, `gate-report-p14.md`): **PASSED** (exit 0), elsőre.
  - **Unity 6000.0.40f1:**
    - import (15 írt fájl) és `Validate` 0 hibával (3 placeholder-ikon figyelmeztetés);
    - EditMode 59/60 (1 kihagyott, a régi);
    - **PlayMode 47/47**, köztük 7 új runtime crafting-teszt és a generált `CraftsExactlyAndNeverConsumesInPart`;
    - a Windows player önellenőrzése: ✓ felvétel, ✓ quest, **✓ craft Polished Key**, ✓ mentés és betöltés friss játékba (már a legyártott állapottal);
    - újraimport 0 írással, értékváltozás 7/7.
  - **Unity 2022.3.21f1:** import, fordítás és `Validate` 0 hibával, EditMode 59/60.
- **Nem része, nyitott:**
  - nyersanyagok mint gyűjthető erőforrás;
  - állomás a térképen;
  - skill- és frakciófeltétel;
  - craft-idő;
  - a terv UI-tervezőjében nincs crafting-képernyőelem (a panel IMGUI);
  - a gamepad-gomb a crafting akcióhoz be van kötve, de nincs tesztelve.

### 15. Harc, életerő és ellenfél — függőség: 7, 8, 12

- Konfigurálható életerő, sebzés, egy egyszerű támadástípus, halál és jutalom/loot kapcsolódjon a meglévő Combat és Items adatokhoz. Az első támogatott harci modell és képletek legyenek explicit, ne általános harcrendszerként legyenek feltüntetve.
- **Kész, ha:** egy tervből konfigurált találkozás lejátszható, az értékek és következmények tesztelhetők, és a nem támogatott támadásmódot a rendszer jelzi.

**Állapot (2026-11-22): kész — az első támogatott harci modell: csak közelharc.**

- **A modell kimondva, nem általános harcrendszerként** ([`combatRules`](../src/core/gameplay.ts), a meglévő Combat-, Items- és Player-adatokból):
  - **Játékos:**
    - az életereje a Player Character › Survival stats › *Health* maximuma; ha nincs, 100, látható alapértékként;
    - fegyvere az új *Player weapon* mező (Technical Architecture › Playable prototype) tárgya, annak *Damage*, *Damage type* és *Attacks per second* értékével (ha nincs gyakoriság, 1/s, alapértékként);
    - a hatótáv az új *Attack range (m)* mező (Player Character › Controls and camera; alapérték 1,5 m, csak választott harcnál jelezve);
    - új Runtime action: *Attack*.
  - **Ellenfelek:**
    - a térképen *enemy* spawn szerepű objektumok; a térképszerkesztő új *Enemy* választóval köti őket a Combat › Enemies egyikéhez, és ismeretlen hivatkozásnál „Unknown enemy” jelenik meg;
    - értékek: a tervezett *HP*, *Damage per hit*, *Attacks per second*, *Armor*, *Resistances*, *Speed* (ha nincs, 2 m/s, alapértékként) és *Aggression*;
    - a *Passive* nem támad, a többi 8 m-en belül üldöz, és 1,5 m-en belül üt (ezt `gameplay.combatModel` infó mondja ki);
    - a HP, a sebzés és a gyakoriság hiánya `gameplay.enemyStat` hiba.
  - **Sebzés:** minden találat a terv sebzésképlete (Combat › Damage and defense model; ha üres, az alapképlet, ezt jelzi) a következő változókkal: attack, armor, resist (az ellenfél ellenállása a fegyver sebzéstípusára; a negatív érték gyengeség) és crit = 1. Más változó (`gameplay.damageFormulaVars`) vagy olvashatatlan képlet hiba. A játékosnak nincs páncélja és ellenállása.
  - **Következmény:**
    - a legyőzött ellenfél XP-je eseményben jelenik meg; szintmodul még nincs;
    - a *Loot tables* „Always drops” tárgyait magánál tartja, és interakcióval egyszer vehetők el;
    - a legyőzött játékos teljes életerővel visszakerül a kezdőpontra.
  - **Nem támogatott támadásmód:** a *Ranged*, *Caster* és *Support* szerepű, térképre tett ellenfél **blokkoló hibát** ad (`gameplay.attackUnsupported`). Infóként jelezve, nem futtatva: krit, státuszeffektek, nehézségi és éjszakai skálázás, súlyozott loot, támadásminta, gyengeséglista és éjszakai változat.
- **Képességmátrix:**
  - a harc Unityben *frame* helyett *template*;
  - új adatfeltételek: elhelyezett ellenfél, sebzéssel rendelkező Player weapon és Attack-control;
  - ha loot van, Interaction és Inventory is kell (`proto.requires`);
  - mentésnél kell egy *Combat* Runtime state-ű rész (új mentési állapot).
  
  A referencia „Playable” maradt: mind a 7 választott rendszer *template*.
- **Referencia-terv:**
  - *Yard Rat* (Swarm, Hunter, 20 HP, 3 sebzés, 1/s, 10 páncél, 2 m/s, 5 XP), a térkép járható részén, a kezdőponttól és a kulcstól 15–25 m-re, rácsból determinisztikusan választva, hogy ne zavarja a korábbi teszteket;
  - *Stick* fegyver (6 sebzés, 2/s);
  - 30 Health;
  - F billentyű az Attack-hez;
  - *Rat drop* loot tábla (mindig egy Coin);
  - HUD életerő-sáv;
  - *Combat* mentési rész.
  
  Az export 43 fájl, 5 rekord, 0 hiba.
- **IR (v9):** `gameplay.combat` (a játékos, a fegyver, a képlet, az elhelyezett ellenfelek a lootjukkal, az aggro- és ütéstáv), és az *enemy* szerepű placement.
- **Unity-adapter v16:**
  - **`PlannerDamageFormula`** (`Scripts/Generated/Combat/`): a terv képlete C#-ban, a meglévő formula-emitterrel;
  - `PlannerGameplay`: `AttackKey`, `PlayerHp`, `AttackRange`, `WeaponRate`, és `Enemies`. Az utóbbiban a **várt találatok a tervező saját képletkiértékelőjével számolva** (pl. 6·100/110 = 5,454545 a ratra, 3 a játékosra), így a teszt a generált C# képletet is ellenőrzi;
  - Attack input-akció;
  - **generált tesztek:**
    - `TheEncounterPlaysAsPlanned`: az F billentyűvel pontosan annyi találat, amennyit a terv számai kérnek; mindkét fél a képlet szerinti sebzést adja; egyszer jár XP, egyszer a loot;
    - `ADefeatedPlayerIsBackAtTheStart`;
    - `TheFightIsTheSameAfterSavingAndLoading`.
- **Runtime 0.10.0:**
  - `PlannerCombat` („combat”, a „movement” után), `PlannerHealth`, `PlannerEnemy`, `PlannerLoot`, `IPlannerDamageFormula`, `IPlannerCombatSource` (Attack-akció);
  - események: `PlannerHit`, `PlannerEnemyDefeated`, `PlannerPlayerDefeated`;
  - a `PlannerStateKind.Combat` mentési állapot, ellenőrzéssel (ismeretlen ellenfél, a maximumnál nagyobb életerő);
  - a HUD *Health* sávja (`bind-survivalStat-health`);
  - `PlannerInventory.CanAddAll`;
  - az önellenőrzés minden ellenféllel megvív, és elveszi a lootját.
- **Bridge (scene-építő 7. verzió):**
  - *Combat* objektum (a játékos életereje, `PlannerCombat`, a generált képlet interfész alapján, újraéledés a kezdőponton);
  - minden elhelyezett ellenfél a tervezett értékekkel és CharacterControllerrel; teste a `Prototype/Prefabs/<enemy>.prefab` (egyszer készül, utána a felhasználóé); a lootja;
  - a HUD és a mentés bekötése.
- **Gate:** új törés, `--break ranged-enemy`.
- **TS-ellenőrzés:**
  - új [`tests/unityCombat.test.ts`](../tests/unityCombat.test.ts), 13 teszt: szabályok; alapértékek; nem támogatott támadásmód, blokkolva a helyével; hiányzó értékek; képlethibák; a nem futtatott részek; *template*/„Playable”; adatfeltételek; loot- és mentésfüggés; IR; a generált képlet és a várt találatok; billentyű és generált tesztek; harc nélkül nincs semmi;
  - UI-teszt az *Enemy* választóra;
  - frissült: képesség-, IR-, gameplay-, UI-, referencia-, inventory-, mentés-, verzió- és gate-teszt, pillanatkép (az adapter v16 fejléce) és bridge-fixture;
  - **teljes kör 1428-ból 1427 zöld** (a kivétel az ismert `v3CompanionUi` időzítéses teszt). A typecheck és a lint zöld.
- **Unity-gate:** **PASSED** (exit 0), elsőre (`gate-report-p15.md`).
  - **Unity 6000.0.40f1:**
    - import (18 írt fájl), `Validate` 0 hibával;
    - EditMode 60/61 (1 régi kihagyott), köztük a bridge `AddsCombatWithThePlannedEnemiesAndFormula` tesztje;
    - **PlayMode 59/59**, köztük 9 új runtime harcteszt és a 3 generált scene-teszt;
    - a Windows player önellenőrzése: **✓ fight Yard Rat — 4 találat (a terv szerint 4), 5,455 találatonként, 5 XP**, ✓ loot. A mentés/betöltés friss játékba a teljes állapotot visszaadta: kulcs felvéve, Polished Key legyártva, 4 Coin, a rat legyőzve, quest kész; betöltéskor 0 jutalom;
    - újraimport 0 írással, értékváltozás 7/7.
  - **Unity 2022.3.21f1:** import, fordítás és `Validate` 0 hibával, EditMode 60/61.
  - **`--break ranged-enemy`:** FAILED (exit 1): a `--strict` export megáll („Yard Rat is a Ranged enemy: the prototype only runs melee attacks…”), a ráépülő lépések kimaradnak.
- **Böngésző:** a *Player weapon* és az *Attack range (m)* mező megjelenik; nincs konzolhiba. A saját projektet nem módosítottam. Az *Enemy* választót UI-teszt fedi.
- **Nem része, nyitott:**
  - távolsági és varázsló ellenfél;
  - főellenség és ostrom;
  - célzás, kitérés, blokk;
  - krit, státuszeffektek, nehézségi és éjszakai skálázás;
  - súlyozott loot;
  - páncél és ellenállás a játékoson;
  - XP és szintlépés;
  - NavMesh-alapú útkeresés (az ellenfél egyenesen közelít, a falakon a CharacterController állítja meg);
  - ellenfél-animáció és találatvisszajelzés;
  - gamepad Attack-gomb (bekötve, de tesztelés nélkül).

### 16. NPC és párbeszéd-alap — függőség: 9, 11, 12

- Elsőként interakcióra reagáló NPC, típusos párbeszédcsomópontok, választások és megengedett következmények. A meglévő párbeszédstílus-szöveg önmagában nem végrehajtható dialógus.
- Egyedi animációhoz, beszédhez és komplex viselkedéshez legyen bővítési pont; a tartalom strukturálásához planner UI és migráció is szükséges.
- **Kész, ha:** egy NPC-vel a terv szerinti választás meghozható, a következmény egyszer végrehajtódik és állapota menthető.

### 17. Bővített prototípus-kapu — függőség: 13, 14, 15, 16

- Állítsunk össze a referencia-tervből teljes, craftingot, harcot és NPC-t is tartalmazó 3D mintafolyamatot. A modulok továbbra is külön választhatók legyenek.
- **Kész, ha:** a 4. fejezet bővített kapuja automatikusan és kézi játékpróbával igazolt, célzott buildben is; dokumentálva van, mely elemek placeholderesek vagy kézi munkát igényelnek.

### 18. Világ, térképek és tartalomtöltés — függőség: 8, 17

- Több helyszín, átjárók, spawn- és objektumelhelyezés, asset-referencia és betöltési profil a ténylegesen modellezett tervadatok alapján. Kezeljük a hiányos térképet, blokkolt spawnokat és elérhetetlen átjárókat.
- **Kész, ha:** legalább két referenciahelyszín között működik az átjárás, visszatérés és mentés/betöltés; sem a generált, sem a saját scene nem sérül újraimportkor.

### 19. NPC-viselkedés és szimuláció — függőség: 15, 16, 18

- A tervből konfigurálható, korlátozott viselkedéssablonok: például járőrözés, érzékelés, üldözés, visszatérés; később munkarend és igények. A meglévő állapotgráf önmagában ne legyen végrehajtott AI-ként feltüntetve.
- **Kész, ha:** a támogatott sablon feladatát NavMesh- és függőségkezeléssel teszt igazolja; a nem támogatott viselkedés keretként látható.

### 20. Település, gazdaság, idő és fejlődés — függőség: 14, 17, 18

- Külön választható modulokként fokozatosan: egyszerű épületelhelyezés és termelés, kereskedés, időciklus, játékosfejlődés. Először mindegyikhez rögzítsük a minimálisan támogatott szabályokat és a meglévő planneradatok lefedettségét.
- **Kész, ha:** minden bekapcsolt modulhoz van önálló elfogadási forgatókönyv és mentés; egymás nélkül is kikapcsolhatók vagy a hiányzó függőség világosan látszik.

### 21. Asset- és prezentációs pipeline — függőség: 5, 8

- Planner-rekord ↔ Unity asset összerendelés, placeholder-jelzés, felhasználói prefabok/anyagok/animációk/hangok megőrzése. Rögzítsük a pipeline- és package-feltételeket, az assetek eredetét és licenceit.
- UI, audió, lokalizáció és akadálymentesség terén a prototípus világosan különítse el a működő kötést a végleges minőségtől.
- **Kész, ha:** egy placeholder valós assetre cserélhető, újraimport után megmarad, és a hiányzó vagy nem kompatibilis asset a riportban megjelenik.

### 22. Opcionális AI-asszisztencia — függőség: 2, 5, 6

- A meglévő AI-provider és jóváhagyási megoldások vizsgálata után: javaslat szöveges tervből strukturált szabályra, hiányzó tartalomra vagy egy bővítési pont implementációjára. A javaslat legyen előnézhető, szerkeszthető, külön elfogadandó és visszavonható.
- Külső szolgáltatóhoz csak előre megmutatott és jóváhagyott adat kerülhet. A generált kód nem fut automatikusan; elfogadás után is fordítás, teszt, függőség- és licencellenőrzés szükséges. A generálás eredete és ellenőrzöttsége legyen jelölve.
- **Kész, ha:** elutasítás, hibás vagy veszélyes javaslat, szolgáltatóhiba és offline eset kezelhető; az 1–17. fázis determinisztikus útja AI nélkül változatlanul működik.

### 23. Készültség, diagnosztika és kézi teendők — függőség: 6, 13

- A riport különböztesse meg: generált, összekötött, fordított, automatikusan tesztelt, ember által ellenőrzött; külön mutassa a placeholdert, keretet, hiányt és sikertelen tesztet.
- Plannerből nyitható teendőlista mutassa az érintett elem forrását, okát, javítását és az utolsó ellenőrzött verziót. A státusz ne írja át automatikusan a terv tartalmát.
- **Kész, ha:** egy szándékosan hiányos és egy teszten elbukó projekt nem kap játszható/kész jelzést; az elavult riport felismerhető.

### 24. Minőség, kompatibilitás és kiadható alap — függőség: 17, 21, 23

- Vizsgáljuk az eszközön futó buildet, teljesítményt, memóriahasználatot, inputot, UI-t és mentési kompatibilitást. Teljesítménycélok a terv célplatformján legyenek mérve, a meglévő `PlannerBudgets` mérésre és a riport büdzséire építve.
- Ellenőrizzük a támogatott Unity-verziókat és package-kombinációkat (2022.3 LTS és Unity 6, a hozzájuk tartozó URP és Input System verziókkal); a 2022.3 támogatást ne csökkentsük észrevétlenül. Ha egy új modul újabb verziót vagy más render pipeline-t igényel, azt explicit profilban és migrációs tájékoztatással kezeljük.
- **Kész, ha:** a választott támogatási profil teljesíti a 4. fejezet „majdnem kész alap” feltételeit, és megjelenik a fennmaradó kézi és ismert hibák listája.

### 25. 2D és további motorok előkészítése — függőség: 3, 17

- Ellenőrizzük, hogy a 3D-hez kötött runtime- és scene-kód nem szennyezte-e a semleges gameplay-szerződést. Készítsünk külön 2D képesség- és eltéréslistát; ne állítsunk 2D-támogatást elkészültnek.
- Godot/Unreal esetén külön terv és tényleges engine-en belüli futtatás szükséges; a Unity runtime nem automatikusan hordozható.
- **Kész, ha:** egy 2D irányú terv exportja támogatottsági diagnózist ad, és a 2D megvalósítás tényleges feltételei dokumentáltak.

## 6. Függőségek és mérföldkövek

```text
Fő út (M1–M2):
0 → 1 → 2 → 3 → 4 → 7 → 8 → 9 → 10 → 11 → 12 → 13
1 + 4 → 7          3 → 5 → 8          5 + 12 → 13
1 + 2 → 6          2 + 9 + 10 → 11    8 + 10 + 11 → 12

Bővítés (M3–M5):
10 + 12 → 14       7 + 8 + 12 → 15    9 + 11 + 12 → 16
13 + 14 + 15 + 16 → 17
8 + 17 → 18        15 + 16 + 18 → 19  14 + 17 + 18 → 20
5 + 8 → 21         2 + 5 + 6 → 22     6 + 13 → 23
17 + 21 + 23 → 24  3 + 17 → 25
```

Az ábra minden közvetlen függőséget felsorol; eltérés esetén a fázisok címében megadott függőség irányadó. A 6. fázis (planner-felület) párhuzamosan halad a 4–5. fázissal, és nem blokkolja a 7. fázist. A 14., 15. és 16. fázis a saját előfeltételeik elkészülte után részben párhuzamosítható. A 21. és 22. nem akadályozza az első vertical slice-ot.

**Mérföldkövek:** M1 = 0–6, a modell és biztonságos import alapjai; M2 = 7–13, játszható és menthető vertical slice; M3 = 14–17, bővített prototípus; M4 = 18–24, tartalomban gazdag és ellenőrzött támogatási profil; M5 = 25, 2D-folytatás megalapozása. Az AI-asszisztencia opcionális, nem előfeltétele a készültségnek.

## 7. A megvalósító agent munkamenete

1. Egy fázist vagy azon belül egy önálló, kis vertikális feladatot válasszon; előbb olvassa el az érintett jelenlegi modellt, exportot, bridge-et és teszteket. A régebbi tervek állapotjelzéseit ellenőrizze a tényleges kóddal.
2. Rögzítse, pontosan mit támogat a változtatás, mely plannermezőkből dolgozik, mi hiányzik, és milyen meglévő viselkedést kell megőrizni.
3. Planner-adatmodell → validáció/migráció → IR/export → Unity runtime/editor → felület/riport sorrendben csak az adott funkcióhoz szükséges rétegeket módosítsa.
4. Adjon célzott pozitív és negatív teszteket, majd futtassa a legkisebb releváns TypeScript- és Unity-tesztkört. Scene- és gameplay-változásnál valódi Unity PlayMode/build ellenőrzés szükséges; ha nem futtatható, azt jelölje blokkoltnak.
5. Frissítse a kapcsolódó dokumentációt és az aktuális fázis állapotát: elkészült, tesztelt környezet, még nem ellenőrzött részek, ismert korlátok. Ne jelöljön készként előre csak tervezett képességet.

## 8. Fontos kockázatok

| Kockázat | Kezelés |
|---|---|
| A terv szemantikája túl szabad vagy hiányos | Strukturált szabály, explicit választás, hiánylista; az AI csak javasolhat. |
| A generátor egyetlen játékra szűkül | Képességprofilok, választható modulok, több különböző referencia és nem kötelező mechanikák. |
| Az újraimport felülírja a munkát | Tulajdonosi határok, diff, GUID-tesztek, konfliktus és helyreállítás. |
| Mentések vagy régi projektfájlok sérülnek | Stabil ID, verziózott formátum, migráció, régi fixture-ek és explicit hibák. |
| A generált játék csak fordul, de nem játszható | Valódi PlayMode- és buildkapu, végigjátszási teszt és emberi ellenőrzés. |
| Unity package/verzió vagy licenc hiányzik | Követelményellenőrzés, világos blokk; nem hamis siker. |
| 2022.3 és Unity 6 közti API-/package-eltérés (URP, Input System) | Kétverziós CI-mátrix, `versionDefines`, Unity 6-only funkció csak külön profilban. |
| A runtime-csomag, a bridge és a generált kód verziója elcsúszik | A manifest rögzíti a szükséges runtime-verziót; eltérésnél az import blokkol és megmondja, mit kell frissíteni. |
| AI téves vagy nem biztonságos javaslatot ad | Opt-in adatküldés, diff és emberi jóváhagyás, ellenőrzés, nincs automatikus kódfuttatás. |
| A scope korlátlanul nő | Kis, lezárt vertical slice; modulonként explicit támogatási határ és elfogadási feltétel. |