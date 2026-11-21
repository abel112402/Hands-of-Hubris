# Game Design Planner addon for Godot

Imports the planner's engine export (`hoh-engine` v1, made with *Engine export* set to **Godot**, or `npm run export:engine -- plan.hohplan.json <folder> --engine godot`) into a Godot 4.3+ project.

> Status: written against the Godot 4.3–4.7 API and checked by the planner's tests (format versions, report fields, file references), but **not yet run inside Godot**. Report what breaks.

## Install

1. Copy `addons/hoh_planner` into the project's `res://addons/`.
2. *Project ▸ Project Settings ▸ Plugins*: enable **Game Design Planner**. It also adds the `PlannerMetrics` autoload.
3. Export the plan into `res://HoHPlanner` (unpack the zip there, or link the project folder in the planner: the folder with `project.godot`; the export goes to `res://HoHPlanner`). Another folder: *Project Settings ▸ hoh_planner/root*.

## What it does

- **Import** (*Project ▸ Tools ▸ Game Design Planner ▸ Import*; automatic when a new export lands, see *hoh_planner/auto_import*): waits for Godot to know the generated scripts, then makes one `.tres` per record of every native-format schema under `res://HoHPlanner/Records/<Schema>/`. Records are found again by `planner_id`, so a renamed record keeps its file and every reference to it. A planner value never clears a property: textures, scenes and sounds you assign in the Inspector stay. A record the plan dropped keeps its file and gets the `hoh_deprecated` meta. The imported translations (`Localization/strings.*.translation`) are added to *Project Settings ▸ Localization*.
- **Validate**: every native record has its `.tres`, every required field is filled (empty data is an error, an unassigned resource a warning), nothing points at a deprecated record.
- **Write report**: `res://HoHPlanner/hoh-engine-report.json` for the planner — each record's state, each class of the class diagram (your file there, `# TODO`s and missing methods left), and the playtest metrics. Also written after every import. The planner reads it from the linked folder, or import it on *Engine export*.
- **Set up project**: copies `.editorconfig`, `.gitattributes` and `.gitignore` from the plan to `res://` and creates the planned folders. Never overwrites a file.
- **Inspector header** on record resources: which record it is and an *Open in planner* button (*hoh_planner/planner_url*).

## Generated code

| File | What |
|---|---|
| `Godot/Scripts/Generated/<schema>_definition.gd` | `class_name XDefinition extends Resource` for native schemas, `@export` fields, `SCHEMA_ID`, `PLANNER_FIELDS` |
| `Godot/Scripts/Generated/<schema>_record.gd` | `class_name XRecord extends RefCounted` for JSON/CSV schemas, with `from_dict()` |
| `<project>_enums.gd`, `<project>_ids.gd`, `<project>_formulas.gd`, `<project>_values.gd` | catalogs as enums with their planner IDs, record IDs as constants, formulas as static functions (rounding as in the planner), value readers |
| `Generated/Classes/<class>_base.gd` | each class of the class diagram: fields, signals, method stubs; replaced on every export |
| `Scripts/Classes/<module>/<class>.gd` | **yours**: `class_name X extends XBase`, created once, never overwritten |

GDScript has no partial classes, namespaces or interfaces, so: your class extends its generated base; global names that could clash start with the project's name; an interface is a list of methods that the planner puts into the generated base of every class implementing it (`IDamageable.is_implemented_by(node)` checks at run time).

## Data checks, console, channels, telemetry, placeholders, greybox

- **Data checks** (Balance plan › Data checks): `<project>_data_checks.gd`; *Validate* runs them on every record resource and lists the records outside the range (errors, or warnings for checks marked Warning).
- **Debug console**: `<Project>Console.run("give item.iron_sword 5")` checks the command and its IDs against the plan and calls your handler.
  - Set `<Project>Console.handler` to an object with `give(item, count)`, `quest_start(quest)`, `time_set(hour, minute)`, …
  - The import adds the overlay as the autoload `PlannerConsole`; in debug builds the backtick key (`) opens it, with Tab completion.
- **Channels** (the Architecture's communication channels):
  - The event buses become the signals of the autoload `GameEvents`, added by the import (`GameEvents.need_changed.emit(…)`).
  - Each ScriptableObject-style channel becomes a `Resource` type with a `raised` signal, and the import makes one `.tres` of it under `Channels/`.
- **Telemetry** (Balance plan › Telemetry events): `<Project>Telemetry.enemy_killed(enemy, seconds, biome)` appends to `user://hoh-telemetry.jsonl`. The report adds it up into metrics: `<key>.count`, and the mean of each number parameter.
- **Placeholders** (*hoh_planner/placeholders*, on by default): after the import, an empty texture gets a square in the plan's palette with the record's initials, and an empty scene gets a box or capsule.
  - They go to `Placeholders/`. The real asset always wins, and Validate still counts a placeholder as missing art.
- **Greybox scenes** (*Project ▸ Tools ▸ Game Design Planner ▸ Build greybox scenes*, or `ci.gd -- greybox`): one scene per location map in `Greybox/`.
  - It has a floor, 2 m walls with collision, doors (red when locked), lock and key markers, spawns, the planned lights, a sun and a camera.
  - A NavigationRegion3D is there for you to bake.
  - Building again replaces the scenes.

## Input, screens and state machines

- **Input** (UI/UX › Controls): `<Project>Input` names each action (`<Project>Input.JUMP`) and lists its planned keys and buttons.
  - The import adds the actions Project Settings ▸ Input Map does not have yet. Your changes there are kept.
- **Screens** (UI/UX › Screens and Screen flow): `<Project>Screens.build(id)` makes a Control of a planned screen, laid out as planned in fractions of the screen.
  - Add `PlannerScreenRouter` (a CanvasLayer) to your main scene. It starts on the entry screen, buttons open their screen, and `back()` returns.
  - It warns when a move is not in the planned flow.
- **State machines**: each state graph of the plan becomes a class, e.g. `NpcLifecycleStates.create()`.
  - `go(state)` only follows a planned transition; `next()`, `changed` and `ended()` are there too.

## Budgets, audio, pseudolocalization, architecture

- **Performance budgets** (Technical › Performance): the import adds the autoload `PlannerBudgets`, which measures the budgets in debug builds and the editor.
  - Frame time, memory, draw calls and triangles are measured by themselves. For the others (batches too: Godot has no counter for them), the game calls `PlannerBudgets.record(PlannerBudgets.SIMULATION_TICK, ms)`.
  - The mean, minimum and maximum go to `user://hoh-planner-budgets.json` when the game quits, then into the report. The planner warns when a budget is over its target.
  - A budget is measured whatever device it names, so a Steam Deck budget is only meaningful on the Deck.
- **Audio events** (Audio Direction): one `<Project>AudioEvent` resource per planned music track or sound under `Audio/`, found again by planner ID.
  - Volume, pitch variation, looping and 3D come from the plan; the streams are yours. `play(player)` plays one of them on an AudioStreamPlayer (2D/3D).
- **Pseudolocalization**: when the plan has strings, the import sets up Godot's pseudolocalization once (accents, about a third longer, in brackets, placeholders kept).
  - Turn it on in Project Settings ▸ Internationalization ▸ Pseudolocalization to find cut-off text and text that is not translated.
- **Architecture guard**: Validate reports a script in one module's folders (`Scripts/Classes/<module>/` and the planned folders of the module) that uses a class of a module its Depends on (Architecture › Modules) does not allow, by class name or by a `res://` path.

## Playtest metrics

`PlannerMetrics.record("combat.ttk.greenhollow_brute", seconds)` from the game, with a key a Balance plan metric names. Samples add up in `user://hoh-planner-metrics.json` and go into the report.

## Command line / CI

```sh
godot --headless --path . --import                                   # registers the generated classes
godot --headless --path . -s res://addons/hoh_planner/ci.gd -- import    # records, translations, report
godot --headless --path . -s res://addons/hoh_planner/ci.gd -- validate  # exit 1 on errors
```

Exit codes: 0 done, 1 validation errors or import problems, 2 the export cannot be read.

Not yet in the Godot addon (the Unity bridge has them): the live link with the planner, Addressables-like loading groups.
