@tool
extends RefCounted
## After an import: the autoloads of the generated code (GameEvents for the event-bus channels, PlannerConsole for the
## debug console), one resource per Resource channel under <root>/Channels/, and the telemetry log added up into
## metrics for the report.

const Bundle := preload("planner_bundle.gd")
const Placeholders := preload("planner_placeholders.gd")

const TELEMETRY := "user://hoh-telemetry.jsonl"
const AUTOLOADS := { "GameEvents": "Channels/game_events.gd", "PlannerConsole": "planner_console_overlay.gd" }


## Everything that follows a record import. Returns lines for the log.
static func after_import(at: String) -> PackedStringArray:
	var lines := PackedStringArray()
	var autoloads := register_autoloads(at)
	if not autoloads.is_empty():
		lines.append("Autoloads added: %s (restart the editor to use them in tool scripts)." % ", ".join(autoloads))
	var actions := register_input(at)
	if actions > 0:
		lines.append("Input Map: %d planned action(s) added." % actions)
	var channels := make_channels(at)
	if channels > 0:
		lines.append("Channels: %d resource(s) made." % channels)
	if bool(ProjectSettings.get_setting(Bundle.SETTING_PLACEHOLDERS, true)):
		var p := Placeholders.apply(at)
		if p["made"] > 0 or p["filled"] > 0:
			lines.append("Placeholders: %d made, %d properties filled." % [p["made"], p["filled"]])
	return lines


## The plan's input actions (the generated *_input.gd) that Project Settings ▸ Input Map does not have yet.
static func register_input(at: String) -> int:
	for path in Bundle.files_in(at + "/" + Bundle.GENERATED, "gd"):
		if path.ends_with("_input.gd"):
			var script: Script = load(path)
			if script != null and script.has_method("register_project_settings"):
				return int(script.call("register_project_settings"))
	return 0


## Adds the generated autoloads that are missing. Returns their names.
static func register_autoloads(at: String) -> PackedStringArray:
	var added := PackedStringArray()
	for name in AUTOLOADS:
		var path: String = at + "/" + Bundle.GENERATED + "/" + AUTOLOADS[name]
		var key := "autoload/" + name
		if not FileAccess.file_exists(path) or ProjectSettings.has_setting(key):
			continue
		ProjectSettings.set_setting(key, "*" + path)
		added.append(name)
	if not added.is_empty():
		ProjectSettings.save()
	return added


## One resource per generated Resource channel (a script with CHANNEL_ID), made when missing. Returns how many.
static func make_channels(at: String) -> int:
	var made := 0
	var dir := at + "/" + Bundle.GENERATED + "/Channels"
	for path in Bundle.files_in(dir, "gd"):
		var script: Script = load(path)
		if script == null or not script.get_script_constant_map().has("CHANNEL_ID"):
			continue
		var target := "%s/Channels/%s.tres" % [at, script.get_global_name()]
		if FileAccess.file_exists(target):
			continue
		DirAccess.make_dir_recursive_absolute(target.get_base_dir())
		var res: Resource = script.new()
		if ResourceSaver.save(res, target) == OK:
			made += 1
	return made


## The telemetry log as metrics: <event>.count (how many lines) and <event>.<number parameter> (mean, count, spread).
static func telemetry_metrics(path: String = TELEMETRY) -> Array:
	var sums := {}
	if not FileAccess.file_exists(path):
		return []
	var f := FileAccess.open(path, FileAccess.READ)
	while not f.eof_reached():
		var line := f.get_line().strip_edges()
		if line == "":
			continue
		var o: Variant = JSON.parse_string(line)
		if not (o is Dictionary) or str(o.get("event", "")) == "":
			continue
		var build := str(o.get("build", ""))
		_add(sums, "%s.count" % o["event"], 1.0, build)
		for k in o:
			if k in ["event", "t", "session", "build"]:
				continue
			if o[k] is float or o[k] is int:
				_add(sums, "%s.%s" % [o["event"], k], float(o[k]), build)
	var out: Array = []
	var keys := sums.keys()
	keys.sort()
	for k in keys:
		var m: Dictionary = sums[k]
		var count: bool = str(k).ends_with(".count")
		var entry := { "key": k, "value": float(m["samples"]) if count else m["sum"] / m["samples"], "samples": m["samples"] }
		if not count:
			entry["min"] = m["min"]
			entry["max"] = m["max"]
		if m["build"] != "":
			entry["build"] = m["build"]
		out.append(entry)
	return out


static func _add(sums: Dictionary, key: String, v: float, build: String) -> void:
	var m: Dictionary = sums.get_or_add(key, { "samples": 0, "sum": 0.0, "min": v, "max": v, "build": "" })
	m["samples"] += 1
	m["sum"] += v
	m["min"] = minf(m["min"], v)
	m["max"] = maxf(m["max"], v)
	if build != "":
		m["build"] = build
