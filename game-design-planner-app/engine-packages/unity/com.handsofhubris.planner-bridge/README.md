# Game Design Planner Bridge (Unity)

Imports the engine export of the Game Design Planner into a Unity project and keeps it in step with the plan.

## Install

Unity 2022.3 or later (Unity 6 included). In *Window ▸ Package Manager ▸ + ▸ Add package from git URL…*:

```
<repository URL>.git?path=/game-design-planner-app/engine-packages/unity/com.handsofhubris.planner-bridge
```

Or copy this folder into your project's `Packages/` folder. The package depends on `com.unity.nuget.newtonsoft-json`, which the Package Manager adds.

A plan that asks for a **playable prototype** (Technical Architecture › Playable prototype) also needs the [planner runtime](../com.handsofhubris.planner-runtime/README.md) (`?path=…/engine-packages/unity/com.handsofhubris.planner-runtime`). Its export names the runtime version it needs; without it, or with an older one, the import stops and says what to install.

## Use

1. In the planner: *Technical › Data-driven Design › Data schemas › Engine export*, target engine Unity, **Download .zip** (or *Save ▾ › Export for Unity*).
2. In Unity: *Tools ▸ Game Design Planner ▸ Import bundle (.zip)…* (or *Window ▸ Game Design Planner*).
3. The export lands in `Assets/HoHPlanner/` (change it in the window). When the C# changed, Unity compiles it and the import finishes by itself after the reload.
4. Change the plan, export again, *Tools ▸ Game Design Planner ▸ Reimport last*.

### Without the zip: a linked folder (Chrome, Edge)

In the planner's *Engine export* view, *Link engine folder…* and pick the Unity project's folder (the export goes to `Assets/HoHPlanner`). From then on every save in the planner (Ctrl+S) writes the export there: only changed files, your class files never, the manifest last. When Unity notices the new `hoh-engine.json` (as soon as you switch to it), the package finishes the import by itself, and the planner reads the new report when you switch back. Turn this off in *Window ▸ Game Design Planner ▸ Import when the planner writes*.

**Your changes are safe.** The zip import and the linked folder follow the same rules. A file the previous export wrote and nobody changed since is the planner's: it is replaced or removed freely; line endings do not count, so a Git checkout with CRLF is fine. A generated file you changed by hand, or a file the planner did not write, *stops* the import before anything is written. You then choose *Overwrite (keep a backup)*: in the planner, *Overwrite them*; in CI, `-hohOverwrite`. Otherwise, move your change out of the generated folders. Files in generated folders that the planner did not write are never deleted. Everything an import replaces or removes goes first to `.hoh-backup/<time>/` in the planner folder, with a journal, `.meta` files included. Unity skips that folder.
- A failed import is rolled back.
- *Tools ▸ Game Design Planner ▸ Restore last import* (or the planner's *Restore last write*) undoes the last write, whichever side made it.
- *Preview import…* lists what an import would do.
- An import that never finished is reported when the editor loads.

**Renaming a class** of the class diagram (or moving it to another module) moves your file with it: the zip import and the linked folder both compare the class index already in the project with the new one, move `Scripts/Classes/…/Old.cs` to the new name with the class name inside changed (whole words only) and take its `.meta` along, so the script keeps its GUID and every scene and prefab that uses it. A file you already made at the new name is left alone, and then the old one stays for you to merge.

## What it does

| Part of the export | In Unity |
|---|---|
| `Unity/Scripts/Generated/**` | Replaced on every import. Files the plan no longer has are deleted. |
| `Unity/Scripts/Classes/**` | **Yours.** Created once, when missing, and never overwritten: your method bodies live there. |
| `Data/<Schema>/*.json` of a native-format schema | One ScriptableObject per record in `Records/<Type>/<id>.asset`. The asset is found again by the record's planner ID, so a renamed record keeps its asset and every reference to it. |
| Planner values | Written into the asset on every import. A value the planner does not have (empty, or an asset such as a sprite or prefab) never clears what you set in the Inspector. |
| A record removed from the plan | Its asset is kept and marked “no longer in the plan”; *Validate* lists it and anything still pointing at it. |
| `Data/` of JSON and CSV schemas, `Localization/`, `Maps/`, `ir/` | Copied as text assets for your own loaders. |
| `PlannerIndex.asset` | Planner ID and record key → asset. At runtime: `index.TryGet<ItemDefinition>(Ids.Item.IronSword, out var sword)`. |

### Report back to the planner

After every import and validation the package writes `hoh-engine-report.json` next to the export (also *Tools ▸ Game Design Planner ▸ Write report for the planner*). It lists every record of the plan as done, incomplete (with the reason, e.g. “icon: required, but empty.”), missing or removed, and every class of the class diagram as written, with TODO method bodies left, or missing. In the planner: *Save ▾ › Import engine report…*. The planner then marks each entry, shows the state per schema in *Data schemas › Engine export*, the class state on the class diagram, and gives hints. The report never changes the plan itself.

*Tools ▸ Game Design Planner ▸ Validate* checks that every record has its asset, every required field is filled (most often: the icon or prefab still has to be assigned) and that nothing points at a removed record. The Inspector of a record shows which values come from the planner.

### Live link with the planner

*Window ▸ Game Design Planner ▸ Live link*: switch it on, copy the token, and paste it in the planner (*Data schemas › Engine export › Live link*; shown in the planner's dev server, or in a build made with `VITE_ENGINE_BRIDGE=1` — a normal production build's security policy blocks it). Then the planner can:

- **Show in the engine**: select and highlight a record's asset;
- **Push values to Play mode**: put the planner's current numbers into the record assets the running game uses, to try them without exporting. When Play mode ends they are restored; export and import to keep a change.

It listens on 127.0.0.1 only (default port 51701), answers only requests with this editor session's token, and only browser pages on localhost or the configured planner address may call it. It is off by default.

### Playtest measurements for the Balance plan

In the game, record what the planner's *QA › Balance plan* metrics name as their engine key:

```csharp
using HoHPlanner.Bridge;
PlannerMetrics.Record("combat.deaths_per_hour", deathsThisHour);
```

Samples add up across sessions in `<persistentDataPath>/hoh-planner-metrics.json` (saved when Play mode ends or the game quits; it works in builds too). The report for the planner carries the mean, the sample count, the spread and the build; the planner shows them next to each metric's target and acceptable range and gives a hint when one falls outside. *Tools ▸ Game Design Planner ▸ Playtest metrics*: **Merge metrics file…** adds a tester's file, **Clear metrics** starts over after a balance change.

### Addressables and Localization (when those packages are installed)

After every record import, with no extra step:

- **Addressables** (`com.unity.addressables`): one group per planned load group (*Data-driven Design › Loading and Addressables*), its schemas' records as entries addressed by their stable key (`item.iron_sword`), with the planned label. JSON records are added file by file, a CSV schema as its file. Entries are moved into their group; nothing is removed.
- **Localization** (`com.unity.localization`): `Localization/strings.csv` becomes the string table collection “Planner”, one table per language column, with locales created when missing. The collection belongs to the planner: keys the plan dropped are removed from it. Its assets live in `LocalizationTables/` next to the export.

These parts are separate assemblies that compile only when the package is there, so a project without them is not affected.

### Placeholders, data checks and the debug console

- **Placeholders for missing art** (on by default, in the window's settings): after each import, a record whose sprite or prefab field is empty gets a placeholder — a square sprite in the colour of its schema from the plan's palette (Art Direction), with the record's initials, or a primitive prefab (a block the size of a building's footprint, else a capsule). They go to `Placeholders/<Type>/<key>` with the label *PlannerPlaceholder*. Only empty fields are filled, so a real asset assigned in the Inspector or named in the plan always wins; the validator and the report still count a placeholder as missing art.
- **Data checks** (Balance plan › Data checks in the planner) become EditMode tests: `Unity/Tests/Editor/PlannerDataChecks.cs` checks every record asset, also after a value is tuned in the Inspector. Run them in *Window ▸ General ▸ Test Runner ▸ EditMode* or in CI. A check marked *Warning* logs and passes; an *Error* fails.
- **Debug console**: `PlannerConsole.Run("give item.iron_sword 5")` checks the command and its IDs against the plan (items, quests, seasons, weather, factions, difficulty presets) and calls your `IPlannerCheats`; set `PlannerConsole.Handler` at start-up. In the editor and in development builds the back-quote key (`) opens it in the game, with Tab completion. Define `HOH_NO_PLANNER_CONSOLE` to leave the overlay out.

### Greybox, channels and telemetry

- **Greybox scenes** (*Tools ▸ Game Design Planner ▸ Build greybox scenes*, or `-executeMethod HoHPlanner.Bridge.Editor.PlannerCI.Greybox`): one scene per location map of the plan (`Maps/*.json`) in `Greybox/`.
  - A floor where the map is walkable and 2 m walls around it, at one unit per nav cell.
  - Doors you can walk through (red when locked), lock and key markers, spawn points, the planned lights, a sun and a camera at the entrance.
  - With the AI Navigation package the NavMesh is baked too.
  - Building them again replaces them, so work in a copy.
- **Channels**: the Architecture's communication channels.
  - Event buses become `GameEvents.X` / `GameEvents.RaiseX(…)`.
  - Each ScriptableObject channel becomes its own type, and the bridge makes one asset of it under `Channels/` to reference in the Inspector.
- **Telemetry**: `Telemetry.EnemyKilled(enemy, seconds, biome)` and the like, one typed call per telemetry event of the Balance plan.
  - Each call appends a line to `<persistentDataPath>/hoh-telemetry.jsonl`.
  - The report adds the lines up into metrics: `<event>.count`, and the mean of each number parameter (e.g. `enemy_killed.seconds`), so a Balance plan metric with that key gets the measured value.
  - To use a tester's file: *Playtest metrics ▸ Merge telemetry file*.
  - Set `Telemetry.Enabled = false` in release builds.

### Input, screens and state machines

- **Input**: `Unity/Input/<Project>.inputactions` holds the plan's controls (UI/UX › Controls).
  - One action map per category, with keyboard, mouse and gamepad bindings, and a Keyboard&Mouse and a Gamepad scheme.
  - The Input System package reads it.
  - `PlannerInput.Movement.Jump` and the like name the actions in code.
  - Keys the export cannot bind are listed under Export checks in the planner.
- **Screens**: `Unity/UI/Screens/*.uxml` lays out each planned screen at its planned position, in percent of the planned resolution.
  - Buttons that open a screen are named `open-<ScreenId>`, and bound elements `bind-<source>-<id>`. `PlannerUI.uss` gives them the palette.
  - The bridge fills `Screens.asset` with the UXMLs after each import.
  - Put a `PlannerScreenRouter` on a UIDocument and give it that asset. It starts on the entry screen, wires the `open-…` buttons, has `Back()`, and warns when a move is not in the planned Screen flow.
- **State machines**: each state graph of the plan (Start / State / End nodes, e.g. NPC System › Life cycle) becomes a typed machine, e.g. `NpcLifecycleStates.Create()`.
  - `Go(state)` only follows a planned transition.
  - `Next` lists the planned transitions with their kind and cause, and `Changed` and `Ended` tell listeners.

### Performance budgets, audio events, pseudo-locale, architecture guard

- **Performance budgets** (Technical › Performance): `PlannerBudgets` measures the budgets while the game runs, in the editor and in development builds.
  - Frame time, memory, draw calls, batches and triangles are measured by themselves. For the others, the game calls `PlannerBudgets.Record(PlannerBudgets.Keys.SimulationTick, ms)`.
  - The mean, minimum and maximum go to `hoh-planner-budgets.json` when the game quits, then into the report. The planner warns when a budget is over its target.
  - A budget is measured whatever device it names, so a Steam Deck budget is only meaningful on the Deck.
- **Audio events** (Audio Direction): one `PlannerAudioEvent` asset per planned music track or sound under `Audio/`.
  - Volume, pitch variation, looping and 3D come from the plan; the clips are yours. `Play(source)` plays one of them.
- **Pseudo-locale**: with Unity Localization, the import adds a pseudo-locale once: accented, about a third longer, in brackets.
  - Pick it in the Game view to find cut-off text and text that bypasses the tables.
- **Architecture guard**: the EditMode test `PlannerArchitecture` fails when a planned module's assembly references a module its Depends on (Architecture › Modules) does not allow.

### Quests, saves, build scenes

- **Quest graph** (Story & Quests): `PlannerStory` holds the planned quests, choices and endings; `PlannerQuestLog` tracks the player through them and only allows what the plan allows.
  - A quest can start when the quests it requires are done, nothing has closed it, and (when choices lead to it) one of those choices was made. One choice per decision, after its quest.
  - The EditMode test `PlannerStoryTests` plays the graph once per combination of choices and fails when a quest or an ending cannot be reached.
- **Save system** (Technical › Save System): `PlannerSave` has the planned version, manual and autosave slots, and one key per saved part (`PlannerSaveKeys`, with `Order`, the planned order in which parts are restored).
  - A damaged save, one newer than the build, or a failing migration throws `PlannerSaveException` before anything is restored; versions without a migration step are logged.
  - Your systems implement `IPlannerSaveable` and `Register`. Saves are JSON (gzip when the plan says compressed), written to a temporary file first.
  - Older saves go through the migrations you add with `AddMigration(fromVersion, file => …)`; a part an old save does not have keeps its current state.
- **Build scenes** (Technical Architecture › Scenes, *In builds from*): the window's *Build scenes* section, or `PlannerCI.BuildScenes -plannerPhase "Vertical Slice"`, puts the scenes of a roadmap phase first in the Build Settings, in load order. A plan without roadmap phases takes no `-plannerPhase`: all its scenes go in.
  - Scenes are found by file name; the ones without a scene asset yet are listed. Scenes that are not in the plan stay after them.

### Prototype scene

With the [planner runtime](../com.handsofhubris.planner-runtime/README.md) 0.9.0 or later installed, *Tools ▸ Game Design Planner ▸ Build prototype scene* (or `-executeMethod HoHPlanner.Bridge.Editor.PlannerPrototypeScene.CI`) builds the playable prototype's scene for a plan that chose *Player movement and camera* and a *Prototype scene* (Technical Architecture › Playable prototype).

- **Where:** `<root>/Prototype/<planned scene name>.unity`, labelled `PlannerPrototype`. It has the planned scene's name, so the Build Settings step (*Build scenes*, `PlannerCI.BuildScenes`) puts it into builds.
- **From:** the IR's gameplay part (`ir/engine-ir.json`) and the map of the location with the player start (`Maps/*.json`).
- **Map scale:** map x goes east, map y south (−z). Map units become metres by *Map scale (metres per map unit)*; without one, one walkability cell of the map is one metre, as in the greybox (e.g. 0.1 m per unit on a village map with 10-unit cells). Heights are metres: walls are 2 m.
- **In it:** a `PlannerRuntimeHost` with the plan's modules; the level (floor, walls, doors, locks and keys, the map's lights); a sun; the player (an instance of `Prototype/Player.prefab`) at the player start with the planned speed and the generated input map; the follow camera at the planned distance and height; a `PlannerPlacement` on the start, on each item pickup (with a trigger) and on every other spawn of the map. With *Interaction* chosen, each pickup also gets a `PlannerPickup` (the item's name from its record) and the scene an *Interaction* object (not part of your Player.prefab) with a `PlannerInteractor` at the planned range and a prompt with the planned Interact key. With *Inventory* chosen, an *Inventory* object holds the planned slots and items with their stack sizes. The planned HUD screen (the generated UXML with the HUD class) is shown by a *HUD* object (`UIDocument` with `Prototype/UI/PanelSettings.asset` and Unity's default runtime theme; made once, then yours) and bound to the inventory. With *Quests* chosen (it needs *Inventory*), a *Quests* object holds the generated `PlannerQuestGraph` (found by its runtime interface) and `PlannerQuests` with the typed quest rules; the HUD's quest tracker follows it. With *Crafting* chosen (it needs *Inventory*, and *Quests* when a recipe is unlocked by one), a *Crafting* object holds `PlannerCrafting` with the typed recipes and the crafting panel, opened with the planned control (Runtime action *Open crafting*). With *Save and load* chosen, a *Save* object holds `PlannerGameState` (the player, inventory and quests, and the saved parts linked to a runtime state) and the generated `PlannerSaveSlice` (`Save(slot)`, `Load(slot)` over `PlannerSave`). Materials are URP Lit when URP is installed (else Standard, with a note). Import backups (`.hoh-backup/`) are never used as sources.
- **Yours and the bridge's:** the scene, its meshes (`Prototype/Meshes`) and materials (`Prototype/Materials`) are the bridge's; building again replaces them and keeps their GUIDs. `Prototype/Player.prefab` and the pickups' `Prototype/Prefabs/<key>.prefab` are made once and are then yours. To show a pickup with your own art, assign a prefab to the item record (its first prefab field) and build again.
- **Rebuilding:** an unchanged plan and map build nothing. A scene changed in Unity since the bridge built it stops the build (CI exit code 3); move your work into a scene of your own, then build with overwrite (the dialog, or `-hohOverwrite`), which keeps a copy under `.hoh-backup/`. When the planned scene is renamed, the bridge's scene is renamed with it. After each import the console says when the prototype scene is missing or out of date.
- **Checked:** the export's PlayMode test `PlannerPrototypeSceneTests` loads the scene and checks that no script is missing, the runtime runs, the player stands on the floor at the start with the planned settings, every pickup is placed, and the forward key walks the player; with interaction, that the Interact key next to a pickup gives the planned item and amount exactly once, and that nothing is given from farther than the planned range; with the inventory, that the planned slots are there and a pickup lands in the inventory and on the HUD (the Grid cell and the item Counters); with quests, that the quest is active but not done before playing, finishes once its goal items are picked up, gives its planned reward exactly once and shows on the quest tracker; with saving, that a game saved after playing loads into a fresh game (the scene again) with the player, inventory, pickups and quest as they were and no second reward, and that a damaged save is refused without changing anything; with crafting, that the planned key opens the panel, a locked or short recipe consumes nothing, and each recipe that can be crafted after playing gives exactly its output for exactly its inputs.

The greybox scenes are unchanged and separate.

### Set up the project from the plan

*Tools ▸ Game Design Planner ▸ Set up project* (or the window's buttons) uses what the planner wrote into `Unity/ProjectFiles/`:

- **Create planned folders and assemblies**: the folder tree from Coding Standards under `Assets/`, and in each module folder an assembly definition named after the Architecture module's assembly, referencing the generated code and the modules it depends on. Folders and assembly definitions that exist are left alone.
- **Install .editorconfig, .gitattributes, .gitignore** at the project root: code style and naming rules, Unity YAML merge and the Git LFS patterns, and Unity's ignore list with the planned extras. A file you already have is kept; the plan's version is written beside it as `*.planner` to compare.

## CI

`engine-packages/unity/ci/plan-to-unity.yml` (in the planner's repository) is a GitHub Actions workflow for the game's repository: when the plan file changes it exports it with the planner's CLI (`npm run export:engine`), lets Unity import and validate it and runs the generated EditMode and PlayMode tests (game-ci), and opens a pull request with the report's summary. The steps on their own:


```
Unity -batchmode -projectPath . -executeMethod HoHPlanner.Bridge.Editor.PlannerCI.Import -hohBundle export.zip
Unity -batchmode -projectPath . -executeMethod HoHPlanner.Bridge.Editor.PlannerCI.Validate
```

The first copies the files; the second opens the project (compiling the new code), finishes the import and validates. Exit code 0 = fine, 1 = validation errors, 2 = bad bundle or arguments. `PlannerCI.SetupProject` runs both set-up steps.

If the project no longer compiles before an import — typically after updating the planner runtime package, whose API the previous export's generated code does not match yet — Unity stops batch mode before `PlannerCI.Import` can write the new code. Run the import with `-ignorecompilererrors` (the bridge's own assemblies do not depend on the game's code), then `PlannerCI.Validate` without it.

### The planner's Unity gate

`npm run gate:unity` (in the planner's repository; `ci/planner-gate.yml` runs it on a self-hosted Windows runner with Unity) checks the planner, the bridge and the runtime together on the reference slice, per editor:

- **Unity 6 (all of it):** export (`--strict`); a Unity project with this repository's bridge and runtime (made once, or with `--fresh`); `PlannerCIProject.Prepare` (Active Input Handling “Both”, a URP asset as the default pipeline); import (`-ignorecompilererrors`); compile and validate; the prototype scene; Build Settings; EditMode and PlayMode tests; a player for the plan's platform (`PlannerCIProject.BuildPlayer`) and its self-test (`-hohSelfTest`); save and load into a fresh game; an unchanged re-import (nothing written, scene up to date); a changed value (walk speed) reaching the code and the scene while your files, `Player.prefab` and the GUIDs stay, and back.
- **2022.3 LTS:** project, prepare, import, compile and validate, EditMode tests.

It writes `gate-report.json` and `gate-report.md` (Unity version, packages, each step) under `--work`, and exits 0 passed, 1 failed, 2 blocked — no Unity or no licence is “blocked”, never a pass. `--break quest-unreachable | no-interact | missing-scene` breaks the reference on purpose, to see the check it concerns fail.

Pass the project's real path. On Windows a short 8.3 path (`C:\Users\ABC~1\…`) makes Unity unable to link the scripts under `Assets/` to their classes, and the record assets come out with a missing script.

## Limits

- Reads `hoh-engine` format version 1 (the planner writes it into `hoh-engine.json`); a newer bundle is refused with a message.
- Addressables and Localization steps need those packages; without them the files are still there for your own loaders.
- A bundle is untrusted input: paths that would leave the target folder are refused, and sizes are capped (20 MB a file, 200 MB in all).
