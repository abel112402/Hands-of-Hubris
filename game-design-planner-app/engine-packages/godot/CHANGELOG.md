# Changelog

## 0.1.0

- First version for the planner's Godot adapter v1: import of native records as `.tres` (by `planner_id`, deprecation, references between records, enums by planner ID), translations, validation, report (records, classes, metrics), project set-up, Inspector header, `PlannerMetrics` autoload, command-line entry point `ci.gd`.
- Not yet run inside Godot.

## 0.2.0

- Godot adapter v2: data checks, debug console with overlay, the Architecture's channels (GameEvents autoload, Resource channels), typed telemetry.
- Addon: autoloads and channel resources after the import, data checks in Validate, telemetry metrics in the report, placeholders (textures with initials, box/capsule scenes), greybox scenes from the location maps.
- Still not run inside Godot.

## 0.3.0

- Godot adapter v3: input actions (registered in the Input Map by the import), the planned screens built at run time with PlannerScreenRouter, typed state machines.
- Still not run inside Godot.
