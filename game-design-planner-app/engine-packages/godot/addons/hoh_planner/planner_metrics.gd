extends Node
## Playtest measurements for the planner's Balance plan. The plugin adds this as the autoload “PlannerMetrics”; call
## PlannerMetrics.record("combat.ttk.greenhollow_brute", seconds_to_kill) from the game, with the key a Balance plan
## metric names. Samples add up across sessions in user://hoh-planner-metrics.json (saved when the game quits), and the
## planner addon puts them into the report. Works in exported builds too: copy that file from a tester's machine into
## this project's user:// folder.

const FILE := "user://hoh-planner-metrics.json"

var _data := {}
var _dirty := false


func _ready() -> void:
	_data = load_file()


func _notification(what: int) -> void:
	if what == NOTIFICATION_WM_CLOSE_REQUEST or what == NOTIFICATION_PREDELETE:
		save()


## Adds one sample under key.
func record(key: String, value: float) -> void:
	if key == "" or is_nan(value) or is_inf(value):
		return
	var m: Dictionary = _data.get_or_add(key, {"key": key, "samples": 0, "sum": 0.0, "min": value, "max": value})
	m["samples"] += 1
	m["sum"] += value
	m["min"] = minf(m["min"], value)
	m["max"] = maxf(m["max"], value)
	m["build"] = str(ProjectSettings.get_setting("application/config/version", ""))
	m["lastAt"] = Time.get_datetime_string_from_system(true) + "Z"
	_dirty = true


func save() -> void:
	if not _dirty:
		return
	var f := FileAccess.open(FILE, FileAccess.WRITE)
	if f != null:
		f.store_string(JSON.stringify({"metrics": _data.values()}, "  "))
		_dirty = false


static func load_file() -> Dictionary:
	var out := {}
	if not FileAccess.file_exists(FILE):
		return out
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(FILE))
	if parsed is Dictionary:
		for m in parsed.get("metrics", []):
			if m is Dictionary and str(m.get("key", "")) != "":
				out[str(m["key"])] = m
	return out


## The metrics as the report lists them: the mean of each key's samples.
static func summaries() -> Array:
	var out: Array = []
	var data := load_file()
	var keys := data.keys()
	keys.sort()
	for k in keys:
		var m: Dictionary = data[k]
		var n := int(m.get("samples", 0))
		if n <= 0:
			continue
		var entry := {"key": k, "value": float(m.get("sum", 0.0)) / n, "samples": n, "min": float(m.get("min", 0.0)), "max": float(m.get("max", 0.0))}
		if str(m.get("build", "")) != "":
			entry["build"] = str(m["build"])
		out.append(entry)
	return out
