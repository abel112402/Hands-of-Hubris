# Changelog

## 0.1.0

- Import of the planner engine export (`hoh-engine` v1) from a zip or a folder, in two steps (files, then records after the code compiled).
- One ScriptableObject per record of a native-format schema, matched by planner ID; renames keep the asset; removed records are kept and marked.
- Your class files under `Unity/Scripts/Classes` are never overwritten.
- Validation (menu, window, CI), Inspector note on planner records, *Window ▸ Game Design Planner*.
- `hoh-engine-report.json` for the planner after every import and validation (records: done / incomplete with reasons / missing / removed; classes: written / TODOs left / missing), plus *Write report for the planner* in the menu and window.
- Linked folder support: when the planner writes the export into the folder itself, the import finishes as soon as Unity notices the new `hoh-engine.json` (setting *Import when the planner writes*).
- *Set up project*: planned folders with one assembly definition per module, and `.editorconfig`, `.gitattributes`, `.gitignore` at the project root from the plan; never overwrites (a different existing file gets a `*.planner` copy beside it).
- Addressables groups (one per planned load group, records addressed by key, planned labels) and a Unity Localization string table collection “Planner” from `strings.csv`, each in its own assembly that compiles only when that package is installed.
- `PlannerMetrics.Record(key, value)` (runtime, builds too): playtest samples for the Balance plan, summed across sessions; the report carries mean, count, spread and build. *Playtest metrics › Merge metrics file / Clear metrics*.
- Live link (off by default; 127.0.0.1, token, origin check): the planner can select a record and push its values into Play mode, restored when Play mode ends.
- Placeholders for missing art (sprites with initials in the plan’s palette, primitive prefabs), counted as missing art by the validator. Unity adapter v4 adds data-check EditMode tests and the debug console.
- Renamed classes: your class file moves to the new name with the class name inside changed and its .meta (GUID) kept, on zip import and from a linked folder.
- Greybox scenes from the location maps (floor, walls, doors, keys, spawns, lights, NavMesh with AI Navigation); channel assets for the Architecture's ScriptableObject channels; the generated Telemetry log added up into the report's metrics.
- Screens.asset filled with the planned screens' UXML after each import; the zip import also owns Unity/Tests, Unity/Input and Unity/UI (stale files there are removed).
