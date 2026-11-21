# Kézi tesztterv: Cinderholm → Unity

Ez a terv végigvisz a tervező Unity-integrációjának minden funkcióján, a Cinderholm példaprojekttel, egy most létrehozott Unity-projektben. Minden lépésnél ott a **várt eredmény**; ami eltér, azt jegyezd fel a végén lévő sablon szerint.

- **Idő:** kb. 3–4 óra. A 0–3. rész kötelező (erre épül minden), utána a részek nagyjából bármilyen sorrendben mehetnek.
- **Jelölés:** `Planner ▸ …` a böngészőben futó tervező, `Unity ▸ …` a Unity Editor menüje. A felület feliratai angolul vannak, ahogy a képernyőn látod.
- **Ami nincs benne:** Godot és Unreal (azokhoz nincs telepített motor), és a 9. fázis I14, I16, I17, I20 ötletei (nincsenek megvalósítva).

---

## 0. Előkészületek

- [ ] **Unity 6** (6000.0.x, a gépen a 6000.0.40f1 van) a Unity Hubban, bejelentkezett licenccel.
- [ ] **Chrome vagy Edge** (a 7. rész, a „linked folder”, csak ezekben működik).
- [ ] **Node.js** (a tervező indításához).
- [ ] A repó a gépen: `Hands-of-Hubris/game-design-planner-app`.

### 0.1 A tervező indítása

```powershell
cd "game-design-planner-app"
npm install
npm run dev
```

- [ ] Nyisd meg a kiírt címet (alapból `http://localhost:5173`).
- [ ] A nyitóoldalon: **Local · no account** › **Use without an account**.

**Várt:** a tervező üres projekttel nyílik. A dev szervert ne állítsd le, a 8. rész (live link) csak vele megy.

### 0.2 A Cinderholm projekt megnyitása

- [ ] A felső sávban a **Save** gomb melletti **▾** › **Open…** › válaszd: `game-design-planner-app/examples/cinderholm.hohplan.json`.

**Várt:** a projekt neve „Cinderholm (example)”, a dokumentumok tele vannak (Story & Quests, Technical Architecture stb.).

---

## 1. Export a tervezőben

- [ ] `Planner ▸ Technical › Data-driven Design › Data schemas` szakasz, **Engine export** nézet.
- [ ] **Target engine:** válaszd a **Unity (C#)**-ot.

**Várt:**
- A gomb mellett: **6 schemas · 75 records · … enums · … formulas · … files**.
- Az **Export checks** listában figyelmeztetések, többek közt:
  - `Building.buildCost / workers / footprint: required, but 11 of 11 records have no matching value…`
  - `Recipe.inputs / output / seconds …`, `Quest.steps …`, `Item.stackSize: … 6 of 16 …`
  - Ezek a példa **ismert hiányai**, nem hibák az exportban.

- [ ] Kattints a **Download .zip**-re.

**Várt:** letöltődik egy `.zip`. Ha kicsomagolod, a gyökérben ott van a `hoh-engine.json`, a `README.md`, és a `Unity/`, `Data/`, `Maps/`, `Localization/`, `ir/` mappa.

- [ ] **Determinizmus:** töltsd le még egyszer, a két zip legyen bájtra azonos:

```powershell
Get-FileHash .\első.zip, .\második.zip
```

**Várt:** a két hash egyezik.

---

## 2. Unity-projekt létrehozása

- [ ] Unity Hub › **New project** › Unity 6 › sablon: **Universal 3D** (vagy **3D (Built-In Render Pipeline)**, mindkettő megy).
- [ ] **Hely:** OneDrive-on kívül, rövid, „normál” útvonal, pl. `C:\UnityProjects\CinderholmTest`. (Rövidített 8.3-as útvonallal, pl. `C:\Users\ABC~1\…`, a rekord-assetek „missing script”-tel jönnének létre.)

### 2.1 A bridge csomag telepítése

- [ ] `Unity ▸ Window ▸ Package Manager ▸ + ▸ Install package from disk…` › válaszd: `game-design-planner-app/engine-packages/unity/com.handsofhubris.planner-bridge/package.json`.

**Várt:** a csomaglistában megjelenik a **Game Design Planner Bridge**, a Newtonsoft JSON függőséggel együtt. A konzolban nincs piros fordítási hiba. Megjelenik a `Tools ▸ Game Design Planner` menü.

### 2.2 Opcionális csomagok (a teljes teszthez mind kell)

A `Package Manager ▸ Unity Registry` alól telepítsd ezeket:

| Csomag | Melyik részhez kell |
|---|---|
| **Input System** | 13. rész (`.inputactions` szerkesztő). Telepítéskor a Unity kéri az újraindítást; az „Active Input Handling” lehet **Both**. |
| **Localization** | 12. rész (string table, pszeudo-locale) |
| **Addressables** | 12. rész (csoportok) |
| **AI Navigation** | 14. rész (NavMesh a greybox jelenetekben) |
| **Test Framework** | 10. rész; a sablonokban általában már benne van |

---

## 3. Első import

- [ ] `Unity ▸ Tools ▸ Game Design Planner ▸ Import bundle (.zip)…` › válaszd az 1. részben letöltött zipet.

**Várt:**
- A Unity lefordítja a generált kódot (domain reload), az import pedig magától befejeződik.
- A konzolban `[Planner bridge] …` sorok:
  - `Records: 51 created, …`
  - `PlannerAudioEvent: assets updated from the plan.`
  - `PlannerScreenSet: assets updated from the plan.`
  - Ha telepítve van: `Addressables: … group(s) …` és `Localization: … added, … 1 new locale(s).`
- Nincs piros `error CS…`.

Ellenőrizd az `Assets/HoHPlanner/` tartalmát:

- [ ] `Unity/Scripts/Generated/`: `ItemDefinition.cs`, `BuildingDefinition.cs`, `EnemyDefinition.cs`, `NpcNeedDefinition.cs`, `Ids.cs`, `Enums.cs`, `Formulas.cs`, `Telemetry.cs`, `PlannerConsole.cs`, `PlannerScenes.cs`, valamint az `Audio/`, `Channels/`, `Input/`, `Perf/`, `Save/`, `StateMachines/`, `Story/`, `UI/`, `Classes/` mappa.
- [ ] `Unity/Scripts/Classes/`: **7 saját osztályfájl** modul-almappákban (pl. `GameplayPlayer/Health.cs`, `GameplayPlayer/CinderPlayerController.cs`).
- [ ] `Records/`: **51 asset** (`ItemDefinition/item.iron_sword.asset` stb.).
- [ ] `PlannerIndex.asset`, `Screens.asset`.
- [ ] `Audio/`: 6 asset (AxeChop, SteamVent, AetherHum, GreenhollowMorning, SaltgateMarket, NightWatch).
- [ ] `Channels/SaveRequestedChannel.asset`.
- [ ] `Placeholders/`: ikonok és prefabok a rekordok kezdőbetűivel.
- [ ] `Unity/Input/*.inputactions`, `Unity/UI/Screens/*.uxml`, `Unity/Tests/Editor/*.cs`.
- [ ] `hoh-engine-report.json` (az import után magától elkészül).

---

## 4. Rekordok, Inspector, PlannerIndex

- [ ] Jelöld ki: `Records/ItemDefinition/item.iron_sword.asset`.

**Várt:** az Inspector tetején egy fejléc jelzi, mely mezők jönnek a tervezőből. Az értékek (név, érték, ritkaság stb.) egyeznek a tervező `Design › Items` adataival. Az **icon** mezőben placeholder sprite van (szín és „IS” kezdőbetűk).

- [ ] Rendelj hozzá egy saját sprite-ot az `icon` mezőhöz, és írd át kézzel a `value` mezőt.
- [ ] `Tools ▸ Game Design Planner ▸ Reimport last`.

**Várt:**
- A **saját sprite megmarad**: a tervező nem ír felül asset-hivatkozást, a placeholder pedig csak üres mezőbe kerül.
- A `value` **visszaáll** a tervezett értékre: a tervezői értékek minden importnál felülírják az assetet.

---

## 5. Validálás és riport a tervezőnek

- [ ] `Window ▸ Game Design Planner` › **Validation** › **Validate records** (vagy `Tools ▸ Game Design Planner ▸ Validate`).

**Várt:**
- **11 hiba:** `bld.*.buildCost: required, but empty.` (a példa ismert hiánya).
- Figyelmeztetések: `item.*.icon: still a placeholder.`, `bld.*.prefab: still a placeholder.`
- A 4. részben kicserélt `item.iron_sword.icon` már **nincs** a listán.
- A **Select** gomb kijelöli az érintett assetet.

- [ ] **Write report for the planner**.
- [ ] A tervezőben: **Save ▾ › Import engine report…** › válaszd: `<Unity-projekt>/Assets/HoHPlanner/hoh-engine-report.json`.

**Várt:**
- Az **Engine export** nézetben schemánként látszik az állapot (kész, hiányos az okkal, hiányzó).
- `Technical Architecture › Classes` (osztálydiagram): az osztályokon látszik az állapot (megírva, TODO-k maradtak).
- Hintek jelennek meg a hiányos rekordokra.
- A riport importja **nem változtat a terven**: a visszavonás-lista nem nő, a projekt nem lesz „unsaved”.

---

## 6. Tervváltozás, átnevezés, törlés, saját fájlok

### 6.1 Értékváltozás

- [ ] A tervezőben: `Design › Items` › „Iron sword” értéke 40 → 55. Utána **Download .zip**, majd Unityben **Import bundle (.zip)…** ugyanazzal a fájlnévvel. (A **Reimport last** ugyanazt az útvonalat olvassa újra.)

**Várt:** az `item.iron_sword.asset` `value` mezője 55.

### 6.2 Rekord átnevezése (kulcs)

- [ ] A tervezőben nevezd át az „Iron sword”-ot „Iron longsword”-ra, exportálj, importálj.

**Várt:** **ugyanaz az asset** (azonos GUID) kapja az új kulcsot és nevet, a ráhivatkozó mezők (pl. receptek) nem törnek el. A `Records: … 1 renamed` sor megjelenik.

### 6.3 Rekord törlése

- [ ] Törölj egy itemet a tervezőből, exportálj, importálj.

**Várt:** az asset **megmarad**, „no longer in the plan” jelöléssel. A **Validate** listázza, és azt is, ami még hivatkozik rá. A konzolban: `… 1 no longer in the plan`.

### 6.4 Saját osztályfájl megmarad

- [ ] Nyisd meg a `Unity/Scripts/Classes/GameplayPlayer/Health.cs`-t, írj egy metódustörzsbe valamit (pl. `Debug.Log("mine");`), ments, majd **Reimport last**.

**Várt:** a változtatásod megmarad. A konzolban: `… 7 of your class files kept`.

### 6.5 Osztály átnevezése

- [ ] A tervezőben (`Technical Architecture › Classes`) nevezd át a **Health** osztályt **PlayerHealth**-re, exportálj, importálj.

**Várt:**
- A `Health.cs` **átkerül** `PlayerHealth.cs` néven, és benne az osztálynév is `PlayerHealth` (csak egész szavak cserélődnek).
- A 6.4-ben beírt sorod megvan.
- A `.meta` vele ment, így a GUID nem változott: ha egy jelenetben komponensként rajta volt, nem lesz „missing script”.
- Ellenpróba: ha előtte kézzel létrehozol egy `PlayerHealth.cs`-t, a régi fájl a helyén marad, hogy kézzel összefésüld.

> Utána nevezd vissza **Health**-re, vagy nyisd meg újra a példát, hogy a további lépések várt értékei stimmeljenek.

---

## 7. Linked folder (Chrome vagy Edge)

- [ ] **Engine export** nézet › **Link engine folder…** › válaszd a **Unity-projekt gyökerét**, és engedélyezd az írást.
- [ ] A tervezőben változtass meg egy értéket, és mentsd: **Ctrl+S**.
- [ ] Válts a Unityre.

**Várt:**
- Az export megjelenik az `Assets/HoHPlanner` alatt (csak a változott fájlok íródnak, a saját osztályfájlok soha). A Unity magától befejezi az importot.
- Visszaváltva a tervezőre, az **új riportot magától beolvassa**.
- A panelen a „Last write …” sor mutatja, mi történt.
- A **Write now** gomb kézzel is ír.
- Kikapcsolás: `Window ▸ Game Design Planner` › **Import when the planner writes** pipa ki. Ekkor a Unity nem importál magától.

---

## 8. Live link (a tervező dev szerverével)

- [ ] `Window ▸ Game Design Planner` › **Live link with the planner** › **On** › **Copy token**.

**Várt:** „Listening on 127.0.0.1:51701”.

- [ ] A tervezőben: **Engine export** nézet › **Live link** panel › port 51701, illeszd be a tokent.
- [ ] Válassz ki egy rekordot (pl. egy itemet) › **Show in the engine**.

**Várt:** a Unity kijelöli és kiemeli az assetet.

- [ ] Unityben indítsd a Play módot. A tervezőben írj át egy item értéket (ne exportálj) › **Push values to Play mode**.

**Várt:** a futó játékban az asset az új értéket mutatja. A Play mód végén **visszaáll** az eredetire.

- [ ] Ellenpróba: rossz tokennel a hívás elutasítva.

---

## 9. Projekt-előkészítés a tervből

- [ ] `Tools ▸ Game Design Planner ▸ Set up project ▸ Create planned folders and assemblies`.

**Várt:**
- Létrejön az `Assets/_Project/Scripts/Core.Events`, `Core.Data`, `Persistence.Save`, `Simulation.Town`, `Simulation.Npc`, `Gameplay.Player`, `UI.Hud`, `Tools.Debug` stb. mappa.
- A modulmappákban egy-egy `.asmdef` az Architecture assembly-nevével, a generált kódra és a megengedett modulokra hivatkozva.
- Másodszori futtatásra semmi nem változik.

- [ ] `… ▸ Install .editorconfig, .gitattributes, .gitignore`.

**Várt:** a három fájl a projekt gyökerében. Ha előtte már volt például `.gitignore`, az megmarad, és mellé kerül egy `.gitignore.planner` összehasonlításra.

---

## 10. Generált EditMode-tesztek (Test Runner)

- [ ] `Window ▸ General ▸ Test Runner ▸ EditMode` › **Run All**.

**Várt:** minden zöld, köztük:
- `PlannerDataChecks`: 3 ellenőrzés. A „Hits to kill with a 40-damage weapon” csak figyelmeztetés: a konzolba ír (pl. `enemy.warden = 50`), de átmegy.
- `PlannerArchitecture.AssembliesReferenceOnlyThePlannedModules`: a 9. rész után valódi asmdef-eken fut; előtte „Ignored”.
- `PlannerStoryTests` (2 teszt) és `PlannerSaveTests` (2 teszt).

### Negatív próbák (utána állítsd vissza)

- [ ] **Data check:** egy `Records/EnemyDefinition/*.asset` `health` mezőjét írd 5000-re › futtasd a teszteket.
  - **Várt:** az „Enemy toughness” teszt **elbukik**, és megnevezi a rekordot. Visszaállítás: **Reimport last**.
- [ ] **Architektúra-őr:** a `Core.Events` modul asmdef-jéhez adj hozzá referenciát a `Simulation.Npc` assemblyre.
  - **Várt:** a `PlannerArchitecture` elbukik `… → …` üzenettel.
- [ ] **Quest-gráf:** a tervezőben a `Story & Quests › Endings` alatt a „The beacon” befejezéshez adj hozzá még egy döntést: „Let it fall” (kizárja a „Relight it”-et). Exportálj, importálj, futtasd a teszteket.
  - **Várt:** `EveryQuestAndEndingCanBeReached` elbukik: „No path through the planned quest graph reaches these endings: The beacon”.

---

## 11. Játékidős funkciók egy füstteszt-szkripttel

Ezek csak akkor látszanak, ha a játék kódja meghívja őket. Hozd létre az `Assets/PlannerSmokeTest.cs`-t:

```csharp
using CinderholmExample;
using CinderholmExample.Data;
using HoHPlanner.Bridge;
using UnityEngine;

public class PlannerSmokeTest : MonoBehaviour, IPlannerCheats
{
    public PlannerIndex index;          // húzd be: Assets/HoHPlanner/PlannerIndex.asset
    public PlannerAudioEvent axeChop;   // húzd be: Assets/HoHPlanner/Audio/AxeChop.asset
    public AudioSource source;          // egy AudioSource ugyanezen a GameObjecten

    private sealed class HeroPart : IPlannerSaveable
    {
        public string State = "{\"hp\":100}";
        public string SaveKey => PlannerSaveKeys.Hero;
        public string CaptureState() => State;
        public void RestoreState(string json, int savedVersion) { State = json; Debug.Log($"[Smoke] Hero restored from v{savedVersion}: {json}"); }
    }

    private void Start()
    {
        // Rekord kikeresése stabil ID-vel
        Debug.Log($"[Smoke] Index: {(index.TryGet<ItemDefinition>(Ids.Item.IronSword, out var sword) ? sword.displayName : "not found")}");

        // Debug konzol: a ` billentyűvel nyílik; a parancsok ide futnak be
        PlannerConsole.Handler = this;
        Debug.Log("[Smoke] Console: " + PlannerConsole.Run("give item.iron_sword 5"));
        Debug.Log("[Smoke] Console (bad id): " + PlannerConsole.Run("give iron 1"));

        // Csatornák
        GameEvents.NeedChanged += (npc, need, v) => Debug.Log($"[Smoke] NeedChanged {npc} {need} {v}");
        GameEvents.RaiseNeedChanged("npc.anna", "need.hunger", 0.3f);

        // Telemetria, mérőszámok, büdzsé
        index.TryGet<EnemyDefinition>("enemy.warden", out var warden);
        Telemetry.EnemyKilled(warden, 4f, "Greenhollow");
        Telemetry.EnemyKilled(warden, 7f, "Greenhollow");
        PlannerMetrics.Record("combat.deaths_per_hour", 0.8);
        PlannerBudgets.Record(PlannerBudgets.Keys.SimulationTick, 9.0); // a cél 4 ms → a tervező figyelmeztet

        // Állapotgép
        var npcLife = NpcLifecycleStates.Create();
        Debug.Log($"[Smoke] Birth→Child: {npcLife.Go(NpcLifecycleStates.State.Child)}, Child→Death: {npcLife.Go(NpcLifecycleStates.State.Death)}");

        // Quest log
        var log = new PlannerQuestLog();
        Debug.Log($"[Smoke] Lighthouse first: {log.Complete(PlannerQuest.TheOldLighthouse)}, Washed ashore: {log.Complete(PlannerQuest.WashedAshore)}, Lighthouse: {log.Complete(PlannerQuest.TheOldLighthouse)}");

        // Mentés
        var hero = new HeroPart();
        PlannerSave.Register(hero);
        PlannerSave.Save(PlannerSave.ManualSlot(0));
        hero.State = "changed";
        PlannerSave.Load(PlannerSave.ManualSlot(0));
        Debug.Log($"[Smoke] Save folder: {PlannerSave.Folder}, version {PlannerSave.Version}");

        // Hangesemény (adj egy klipet az AxeChop asset Clips listájához, hogy halld is)
        axeChop.Play(source);
    }

    public void Give(string item, int count) => Debug.Log($"[Smoke] Give {item} x{count}");
    public void QuestStart(string quest) => Debug.Log($"[Smoke] QuestStart {quest}");
    public void QuestComplete(string quest) => Debug.Log($"[Smoke] QuestComplete {quest}");
    public void TimeSet(int hour, int minute) => Debug.Log($"[Smoke] TimeSet {hour}:{minute}");
    public void SeasonSet(string season) => Debug.Log($"[Smoke] SeasonSet {season}");
    public void WeatherSet(string weather) => Debug.Log($"[Smoke] WeatherSet {weather}");
    public void FactionRep(string faction, int value) => Debug.Log($"[Smoke] FactionRep {faction} {value}");
    public void DifficultySet(string preset) => Debug.Log($"[Smoke] DifficultySet {preset}");
}
```

- [ ] Új jelenet › üres GameObject › tedd rá a `PlannerSmokeTest`-et és egy `AudioSource`-ot › töltsd ki a mezőket › **Play**.

**Várt a konzolban:**
- `Index: Iron sword` (vagy az átnevezett név).
- `Give item.iron_sword x5`, majd `Console: OK: give item.iron_sword 5`.
- A rossz ID-re: `No item “iron” in the plan. Did you mean item.…?` (a tervben szereplő, hasonló ID-ket ajánlja); a `Give` **nem** fut le.
- `NeedChanged npc.anna need.hunger 0.3` (magyar területi beállítással `0,3`).
- `Birth→Child: True, Child→Death: False` (a Child→Death nincs a tervben). Ha az első is False, nézd meg a tervben a Life cycle átmeneteit.
- `Lighthouse first: False, Washed ashore: True, Lighthouse: True`.
- `Hero restored from v3: {"hp":100}`.
- Ha adtál klipet: hallod, a hangerő 0,7, a hangmagasság kicsit változik minden lejátszásnál.

**A Game nézetben:**
- [ ] Nyomd meg a <code>`</code> billentyűt: megnyílik a konzol. Írd: `give item.ir`, majd **Tab** → kiegészíti. **Enter** → lefut. **↑** → az előző parancs.

**Play leállítása után:**
- [ ] `%USERPROFILE%\AppData\LocalLow\<Company>\<Product>\` alatt megvan:
  - `hoh-telemetry.jsonl` (2 sor),
  - `hoh-planner-metrics.json`,
  - `hoh-planner-budgets.json` (frame time, memória és a `perf.simulation_tick`),
  - `saves\manual-1.sav` (gzip, mert a terv „Compressed JSON”).
- [ ] **Write report for the planner** → a tervezőben **Import engine report…**

**Várt a tervezőben:**
- `QA › Balance plan` metrikák:
  - a „Time to kill (mean)” (`enemy_killed.seconds`) mért értéke **5,5**;
  - a „Deaths per hour (Medium)” 0,8, a cél és a tűréshatár mellett.
- `Technical › Performance`: **engine.budgetOver** hint: „Simulation tick (9 / 4 ms)”. Ha a gép lassú, a frame time is megjelenhet benne.
- [ ] `Tools ▸ Game Design Planner ▸ Playtest metrics`:
  - **Merge metrics file…** egy másik `hoh-planner-metrics.json`-nal összeadja a mintákat;
  - **Clear metrics** és **Clear telemetry** után a következő riportban nincsenek ezek az értékek.

---

## 12. Lokalizáció, pszeudo-locale, Addressables

(Csak ha a 2.2-ben telepítetted a Localization és az Addressables csomagot. Ha utólag telepítetted, előbb **Reimport last**.)

- [ ] `Window ▸ Asset Management ▸ Localization Tables`.
  - **Várt:** a „Planner” string table collection, **en** táblával, 9 kulccsal. A táblák a `LocalizationTables/` alatt vannak.
- [ ] `Project Settings ▸ Localization`: van egy **pszeudo-locale**. Több újraimport után is **csak egy**.
  - A Game nézetben a locale-választóval válts rá: a szövegek ékezetesek, kb. harmadával hosszabbak, `[ ]` között.
- [ ] Töröld a tervezőből egy string kulcsát, exportálj, importálj. **Várt:** a kulcs kikerül a „Planner” collectionből.
- [ ] `Window ▸ Asset Management ▸ Addressables ▸ Groups`.
  - **Várt:** a tervezett load groupok csoportként, a rekordok a stabil kulcsukkal (pl. `item.iron_sword`) és a tervezett labellel.

---

## 13. Input, képernyők, jelenetlista

### 13.1 Input (Input System csomaggal)

- [ ] Nyisd meg: `Unity/Input/*.inputactions`.

**Várt:**
- Action mapek kategóriánként (Movement, Combat, Building, Menus …), Keyboard&Mouse és Gamepad sémával.
- Pl. Movement/**Jump** = Space és gamepad A (South); Combat/**Block** = jobb egérgomb és bal ravasz.
- A tervező **Export checks** listája felsorolja, ha egy billentyűt nem lehetett hozzárendelni.

### 13.2 Képernyők és router

- [ ] Új jelenet › `GameObject ▸ UI Toolkit ▸ UI Document` (kap egy Panel Settings-et) › tedd rá a `PlannerScreenRouter` komponenst › a **Screens** mezőbe húzd be az `Assets/HoHPlanner/Screens.asset`-et › **Play**.

**Várt:**
- A belépő képernyő, a **HUD** jelenik meg, a tervezett elrendezésben (százalékos pozíciók) és a terv palettájával.
- Egy `open-…` gomb a tervezett célképernyőt nyitja, a `Back()` visszalép.
- A tervben nem szereplő váltásra figyelmeztetés kerül a konzolba.

### 13.3 Jelenetek fázisonként (Build Settings)

- [ ] Hozz létre öt üres jelenetet pontosan ezekkel a nevekkel: `Bootstrap`, `Persistent systems`, `Main menu`, `World`, `HUD`. Csak a `Bootstrap`-et és a `World`-öt mentsd el most.
- [ ] `Window ▸ Game Design Planner` › **Build scenes** › **Roadmap phase:** *Prototype* › **Set Build Settings**.

**Várt:**
- A `File ▸ Build Profiles` / `Build Settings` jelenetlistájának elején: `Bootstrap`, `World`, betöltési sorrendben.
- Az üzenet felsorolja a hiányzókat: *Persistent systems, Main menu*.
- A HUD **nincs** benne: a terv szerint csak a *Vertical Slice* fázistól kerül a buildbe.
- Mentsd el a többi jelenetet, válaszd a *Vertical Slice*-t: most mind az öt bent van, a HUD az utolsó.
- A tervben nem szereplő, korábban felvett jelenetek a lista végén maradnak.

---

## 14. Greybox, csatornák, hangesemények

- [ ] `Tools ▸ Game Design Planner ▸ Build greybox scenes`.

**Várt:** a `Greybox/` alatt `Oakham.unity`, `The_Old_Crypt.unity`, `The_Known_Lands.unity`. Nyisd meg a `The_Old_Crypt`-et:
- padló és 2 m-es falak;
- ajtók, köztük egy **piros zárt ajtó**, kulcs- és zárjelölők, spawn pontok;
- a tervezett fények, nap, kamera a bejáratnál;
- AI Navigation csomaggal bake-elt NavMesh.

Újragenerálás felülírja a jeleneteket. Ha nyitott, nem mentett jelenet van, megszakítja ezzel az üzenettel: „Cancelled: the open scenes have unsaved changes.”

- [ ] `Channels/SaveRequestedChannel.asset` Inspectorban: az esemény-csatorna assetje, Inspectorból hivatkozható.
- [ ] `Audio/AxeChop.asset`: volume **0,7**, pitch variation **0,05**, loop ki, 3D ki. `SteamVent` loop be, `AetherHum` 3D be, a zenék loop be.
- [ ] Írd át kézzel az AxeChop volume-ját, adj hozzá egy klipet › **Reimport last** → a volume visszaáll 0,7-re, **a klip megmarad**.

---

## 15. Placeholderek

- [ ] `Window ▸ Game Design Planner` › **Placeholders for missing art** be van kapcsolva (alapértelmezés).
- [ ] Nézd meg: `Placeholders/ItemDefinition/` (szín a schema palettájából, kezdőbetűk), `Placeholders/BuildingDefinition/` (blokk a footprint méretével; méret nélkül kapszula). A label: *PlannerPlaceholder*.
- [ ] Kapcsold ki, töröld a placeholdereket, **Reimport last**. **Várt:** nem jönnek létre újra, az ikon mezők üresek, a Validate **figyelmeztet** rájuk (`icon: required, but empty.`; asset-mezőnél ez figyelmeztetés, nem hiba).

---

## 16. CI / parancssor (opcionális)

Zárd be a Unity Editort, majd futtasd:

```powershell
& "C:\Program Files\Unity\Hub\Editor\6000.0.40f1\Editor\Unity.exe" -batchmode -nographics -projectPath "C:\UnityProjects\CinderholmTest" -logFile ci.log -executeMethod HoHPlanner.Bridge.Editor.PlannerCI.Validate
```

**Várt:** a kilépési kód **1** (a 11 `buildCost` hiba miatt), a logban a `[Planner bridge]` sorok.

Ugyanígy `-executeMethod`-dal:
- [ ] `…PlannerCI.Import -hohBundle <zip>`: 0 (2 rossz zipre).
- [ ] `…PlannerCI.Greybox`: 0.
- [ ] `…PlannerCI.SetupProject`: 0.
- [ ] `…PlannerCI.BuildScenes -plannerPhase "Prototype"`:
  - 1, ha hiányzik jelenet-asset; 0, ha mind megvan;
  - 2 ismeretlen fázisnévre (`-plannerPhase Foo`).
- [ ] A tervező CLI-je:

  ```powershell
  npm run export:engine -- examples/cinderholm.hohplan.json C:\UnityProjects\CinderholmTest\Assets\HoHPlanner --engine unity
  ```

  - **Várt:** „… written, … unchanged, … 7 of your class files kept”. Másodszorra: „0 written”.

---

## 17. Biztonság és határok (opcionális)

- [ ] Egy kézzel módosított zipben egy `../../evil.txt` útvonal → az import elutasítja.
- [ ] Írd át a `hoh-engine.json`-ban a `"v"`-t 2-re → az import érthető üzenettel elutasítja.
- [ ] Live link: egy nem localhost-ról vagy nem a beállított tervezőcímről jövő hívás elutasítva.

---

## Hibajelentés sablon

| # | Rész / lépés | Mit csináltam | Várt | Kaptam | Konzol / képernyőkép |
|---|---|---|---|---|---|
| 1 | | | | | |

Csatold:
- a Unity konzol `[Planner bridge]` sorait;
- az `Assets/HoHPlanner/hoh-engine-report.json`-t;
- ha releváns, a `%USERPROFILE%\AppData\Local\Unity\Editor\Editor.log` végét.
