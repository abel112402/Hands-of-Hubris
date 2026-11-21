# Game Design Planner bridge for Unreal Engine

Two parts:

- **The export** (*Engine export* set to **Unreal Engine**, or `npm run export:engine -- plan.hohplan.json <folder> --engine unreal`) is itself a project plugin. Put it in `<project>/Plugins/HoHPlanner` (link the project folder in the planner and it goes there). Unreal finds `Unreal/PlannerGame.uplugin` and builds its C++ module **PlannerGame** with the game. Add `"PlannerGame"` to your game module's `PublicDependencyModuleNames` to use its types.
- **The bridge** (`HoHPlannerBridge/` here; copy it to `<project>/Plugins/`) is editor Python, with nothing to build. It needs the *Python Editor Script Plugin* and *Editor Scripting Utilities*, which it enables itself.

> Status: the generated C++ and the bridge are written against the Unreal 5.3–5.5 API. The planner's tests check the parts that run without Unreal: the generated code's shape and formulas, and the bridge's value conversion, validation and report, against a real export. **Nothing has been compiled or run in Unreal yet.** Report what breaks.

## What the export holds

| Path | What |
|---|---|
| `Unreal/Source/PlannerGame/Generated/XDefinition.h` | `UXDefinition : UPrimaryDataAsset` for each native-format schema: `UPROPERTY`s, `SchemaId`, `PlannerId`. |
| `Unreal/Source/PlannerGame/Generated/XRow.h` | `FXRow : FTableRowBase` for each JSON/CSV schema. |
| `Unreal/DataTables/X.json` | The rows of each JSON/CSV schema, in the format Unreal's DataTable import reads. Enums are written as member names, colours in linear space, references as row names. |
| `<Project>Enums.h`, `<Project>EnumIds.h`, `<Project>Ids.h`, `<Project>Formulas.h` | Catalogs as UENUMs, the planner ID of each value, record IDs as constants, formulas as Blueprint-pure functions (rounding as in the planner). |
| `PlannerMetrics.h/.cpp` | `UPlannerMetrics::Record(Key, Value)` (also a Blueprint node). Samples for the Balance plan go to `Saved/hoh-planner-metrics.json`. |
| `Generated/Classes/XBase.h` | Each class of the class diagram: properties, and its methods as pure virtuals (`PURE_VIRTUAL`). Replaced on every export. |
| `Source/PlannerGame/Classes/<Module>/X.h/.cpp` | **Yours**: `UX : UXBase` with the overrides to write. Created once, never overwritten. The module's `PlannerGame.Build.cs` and `PlannerGame.cpp` are also yours. |
| `Unreal/Meta/` | What the bridge needs: property names in C++ and Python, enum members, and the class index. |

Interfaces become a `UINTERFACE` with pure virtual methods. Events become a data asset with a dynamic multicast delegate (`OnRaised`, `Raise`). Structs become `USTRUCT`s, whose methods you write in their `.cpp`.

Unreal ignores the U/A/F prefix when it matches names. A class of the plan named like an engine type (e.g. `PlayerController`) therefore does not compile. The export reports this as an error.

## The bridge: Tools ▸ Game Design Planner

- **Import**: one data asset per record of every native-format schema under `/Game/HoHPlanner/Records/<Schema>/`.
  - Assets are found again by `PlannerId`, so a renamed record keeps its asset and every reference to it.
  - A planner value never clears a property: textures and meshes you assign in the editor stay.
  - A record the plan dropped keeps its asset and gets the `HoHDeprecated` metadata tag.
  - It also makes one DataTable per JSON/CSV schema (`/Game/HoHPlanner/DataTables/DT_<Schema>`), filled from the export, then writes the report.
  - Build the project first (the classes come from the PlannerGame module).
- **Validate**: every native record has its asset and every required field is filled. Empty data is an error; an unassigned asset is a warning.
- **Write report**: `Plugins/HoHPlanner/hoh-engine-report.json` for the planner.
  - Each record's state.
  - Each diagram class: is your `.cpp` there, how many `// TODO`s it has, which methods of the plan it does not define yet.
  - The playtest metrics.
- **Set up project**: copies `.editorconfig`, `.gitattributes` and `.gitignore` from the plan to the project folder, and creates the planned `/Game` folders. It never overwrites anything.

## Data checks, console, channels, telemetry, placeholders, greybox

- **Data checks** (Balance plan › Data checks): *Validate* runs them in Python on every record asset (from the expression in `ir/engine-ir.json`), and the report counts them.
- **Debug console**: in the game's console (`), `planner give item.iron_sword 5`. In C++, `PlannerConsole::Run(…)`.
  - Commands and IDs are checked against the plan.
  - Implement `IPlannerCheats` and call `PlannerConsole::SetHandler` at start-up.
  - Not compiled into shipping builds.
- **Channels**:
  - The event buses become native multicast delegates: `FPlannerGameEvents::NeedChanged.AddUObject(…)` / `.Broadcast(…)`.
  - Each ScriptableObject-style channel becomes a `UDataAsset` with a Blueprint-assignable `OnRaised`. The import makes one asset of each under `/Game/HoHPlanner/Channels`.
- **Telemetry**: `U<Project>Telemetry::EnemyKilled(Enemy, Seconds, Biome)` (C++ and Blueprint) appends to `Saved/hoh-telemetry.jsonl`. The report adds it up into metrics: `<key>.count`, and the mean of each number parameter.
- **Placeholders**: after the import, an empty texture field gets a PNG in the plan's palette with the record's initials (imported under `/Game/HoHPlanner/Placeholders`), and an empty mesh field gets the engine cube. Validate still counts them as missing art.
- **Greybox levels** (*Tools ▸ Game Design Planner ▸ Build greybox levels*, or `hoh_planner_ci.py greybox`): one level per location map under `/Game/HoHPlanner/Greybox`.
  - Floor and wall blocks (one per run of cells), doors (red when locked, no collision), lock and key markers, spawn points, point lights and a sun.
  - A NavMeshBoundsVolume over the map: build paths to bake.

## Input, screens and state machines

- **Enhanced Input**: the import makes one Input Action per planned control and one Input Mapping Context per category under `/Game/HoHPlanner/Input`, with the planned keys.
  - Assets that are there already are kept, so your remapping stays.
  - `PlannerInput::Movement::Jump` gives the asset paths in C++.
- **Screens**: `UPlannerScreenWidget` builds a planned screen at run time (UMG, no widget blueprint), laid out as planned.
  - `UPlannerScreenRouter::Create(PlayerController)` shows the entry screen, buttons open their screen, and `Back()` returns.
  - It warns when a move is not in the planned flow. Keep the router in a UPROPERTY.
  - The module's Build.cs reads `Generated/Dependencies.txt` (UMG, Slate, SlateCore).
- **State machines**: each state graph of the plan becomes a struct, e.g. `FNpcLifecycleStates::Create()`, on `TPlannerStateMachine`.
  - `Go(State)` only follows a planned transition; `Next()`, `OnChanged` and `IsEnded()` are there too.

## Command line / CI

Build the editor target first, then:

```sh
UnrealEditor-Cmd.exe Game.uproject -run=pythonscript -script="hoh_planner_ci.py import"
UnrealEditor-Cmd.exe Game.uproject -run=pythonscript -script="hoh_planner_ci.py validate"
```

Each prints `HOH_PLANNER_RESULT: ok | errors | unreadable` (the commandlet's exit code does not carry the result) and writes the report. Use `HOH_PLANNER_ROOT` for an export folder other than `Plugins/HoHPlanner`.

## Not yet

These are in the Unity bridge but not here:

- the live link with the planner;
- string tables from `Localization/strings.csv` (localized fields hold their key);
- Asset Manager / loading-group settings.
