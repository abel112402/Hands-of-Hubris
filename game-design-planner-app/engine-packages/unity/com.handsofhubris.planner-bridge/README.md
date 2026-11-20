# Game Design Planner Bridge (Unity)

Imports the engine export of the Game Design Planner into a Unity project and keeps it in step with the plan.

## Install

Unity 2022.3 or later (Unity 6 included). In *Window ▸ Package Manager ▸ + ▸ Add package from git URL…*:

```
<repository URL>.git?path=/game-design-planner-app/engine-packages/unity/com.handsofhubris.planner-bridge
```

Or copy this folder into your project's `Packages/` folder. The package depends on `com.unity.nuget.newtonsoft-json`, which the Package Manager adds.

## Use

1. In the planner: *Technical › Data-driven Design › Data schemas › Engine export*, target engine Unity, **Download .zip** (or *Save ▾ › Export for Unity*).
2. In Unity: *Tools ▸ Game Design Planner ▸ Import bundle (.zip)…* (or *Window ▸ Game Design Planner*).
3. The export lands in `Assets/HoHPlanner/` (change it in the window). When the C# changed, Unity compiles it and the import finishes by itself after the reload.
4. Change the plan, export again, *Tools ▸ Game Design Planner ▸ Reimport last*.

### Without the zip: a linked folder (Chrome, Edge)

In the planner's *Engine export* view, *Link engine folder…* and pick the Unity project's folder (the export goes to `Assets/HoHPlanner`). From then on every save in the planner (Ctrl+S) writes the export there: only changed files, your class files never, the manifest last. When Unity notices the new `hoh-engine.json` (as soon as you switch to it), the package finishes the import by itself, and the planner reads the new report when you switch back. Turn this off in *Window ▸ Game Design Planner ▸ Import when the planner writes*.

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

## CI

```
Unity -batchmode -projectPath . -executeMethod HoHPlanner.Bridge.Editor.PlannerCI.Import -hohBundle export.zip
Unity -batchmode -projectPath . -executeMethod HoHPlanner.Bridge.Editor.PlannerCI.Validate
```

The first copies the files; the second opens the project (compiling the new code), finishes the import and validates. Exit code 0 = fine, 1 = validation errors, 2 = bad bundle or arguments.

Pass the project's real path. On Windows a short 8.3 path (`C:\Users\ABC~1\…`) makes Unity unable to link the scripts under `Assets/` to their classes, and the record assets come out with a missing script.

## Limits

- Reads `hoh-engine` format version 1 (the planner writes it into `hoh-engine.json`); a newer bundle is refused with a message.
- Addressables groups and Unity Localization tables are not created yet; the files are there for you to import.
- A bundle is untrusted input: paths that would leave the target folder are refused, and sizes are capped (20 MB a file, 200 MB in all).
