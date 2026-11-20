# Changelog

## 0.1.0

- Import of the planner engine export (`hoh-engine` v1) from a zip or a folder, in two steps (files, then records after the code compiled).
- One ScriptableObject per record of a native-format schema, matched by planner ID; renames keep the asset; removed records are kept and marked.
- Your class files under `Unity/Scripts/Classes` are never overwritten.
- Validation (menu, window, CI), Inspector note on planner records, *Window ▸ Game Design Planner*.
- `hoh-engine-report.json` for the planner after every import and validation (records: done / incomplete with reasons / missing / removed; classes: written / TODOs left / missing), plus *Write report for the planner* in the menu and window.
- Linked folder support: when the planner writes the export into the folder itself, the import finishes as soon as Unity notices the new `hoh-engine.json` (setting *Import when the planner writes*).
