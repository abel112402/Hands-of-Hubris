# Changelog

## 0.1.0

- First version for the planner's Unreal adapter v1.
- Import as data assets (found by `PlannerId`, deprecation tag, references between records, enums by planner ID).
- DataTables from the export's JSON.
- Validation; a report covering records, classes and metrics; project set-up.
- *Tools ▸ Game Design Planner* menu.
- Command-line entry point `hoh_planner_ci.py`.
- Nothing has been compiled or run in Unreal yet.

## 0.2.0

- Unreal adapter v2: the Architecture's channels (native delegates, channel data assets), typed telemetry, the console command “planner”.
- Bridge: data checks in Validate, telemetry metrics in the report, channel assets and placeholders after the import, greybox levels from the location maps.
- Still not compiled or run inside Unreal; the Python core parts (checks, telemetry, PNG, greybox plan) are tested.

## 0.3.0

- Unreal adapter v3: input constants and Enhanced Input assets (made by the bridge), the planned screens as UMG widgets built at run time with UPlannerScreenRouter, typed state machines; Build.cs reads Generated/Dependencies.txt.
- Bridge: Enhanced Input assets after the import (needs the EnhancedInput plugin).
- Still not compiled or run inside Unreal.
