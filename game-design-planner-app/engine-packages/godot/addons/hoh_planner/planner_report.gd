@tool
extends RefCounted
## Writes <root>/hoh-engine-report.json (hoh-engine-report v1) for the planner: each record's state, each diagram
## class's state (your file, TODOs left) and the playtest metrics. Import it in the planner, or let the planner read it
## from the linked folder.

const Bundle := preload("planner_bundle.gd")
const Importer := preload("planner_importer.gd")
const Validator := preload("planner_validator.gd")
const Metrics := preload("planner_metrics.gd")
const Extras := preload("planner_extras.gd")

const TODO := "# TODO"


static func build(at: String) -> Dictionary:
	var manifest := Bundle.load_manifest(at)
	if manifest.has("error"):
		return {"error": manifest["error"]}
	return {
		"format": "hoh-engine-report",
		"v": 1,
		"engine": "godot",
		"engineVersion": str(Engine.get_version_info().get("string", "")),
		"generatedAt": Time.get_datetime_string_from_system(true) + "Z",
		"project": {"name": str(manifest.get("project", {}).get("name", ""))},
		"irHash": Bundle.file_hash(manifest, "ir/engine-ir.json"),
		"records": _records(at, manifest),
		"classes": _classes(at),
		"metrics": _metrics(),
	}


## PlannerMetrics samples, then the measured performance budgets and the telemetry log's metrics for the keys not
## recorded before.
static func _metrics() -> Array:
	var out := Metrics.summaries()
	var seen := {}
	for m in out:
		seen[m["key"]] = true
	for m in Metrics.summaries(Extras.BUDGETS) + Extras.telemetry_metrics():
		if not seen.has(m["key"]):
			out.append(m)
	out.sort_custom(func(a, b): return str(a["key"]) < str(b["key"]))
	return out


## Writes the report; returns the path, or "" with the reason in push_error.
static func write(at: String) -> String:
	var report := build(at)
	if report.has("error"):
		push_error("[Planner] " + str(report["error"]))
		return ""
	var path := at + "/" + Bundle.REPORT
	var f := FileAccess.open(path, FileAccess.WRITE)
	if f == null:
		push_error("[Planner] Could not write %s (%s)." % [path, error_string(FileAccess.get_open_error())])
		return ""
	f.store_string(JSON.stringify(report, "  ") + "\n")
	f.close()
	return path


static func _records(at: String, manifest: Dictionary) -> Array:
	var out: Array = []
	var issues := {}
	for i in Validator.run(at):
		if i["path"] != "":
			var msg: String = i["message"]
			# “item.plank.icon: required, but empty.” → “icon: required, but empty.”
			var head := msg.get_slice(":", 0)
			issues.get_or_add(i["path"], []).append(head.get_slice(".", head.get_slice_count(".") - 1) + msg.substr(head.length()))
	var resources := Importer.index(at)
	var listed := {}
	for pid in resources:
		var res: Resource = resources[pid]
		var status := "deprecated" if res.has_meta(Importer.DEPRECATED) else ("incomplete" if issues.has(res.resource_path) else "implemented")
		var entry := {"plannerId": pid, "schema": str(res.get_script().get_script_constant_map().get("SCHEMA_ID", "")), "key": str(res.get("id")), "status": status, "assetPath": res.resource_path}
		if issues.has(res.resource_path):
			entry["issues"] = issues[res.resource_path].slice(0, 20)
		out.append(entry)
		listed[pid] = true
	for s in manifest.get("schemas", []):
		var data := at + "/" + str(s.get("data"))
		if s.get("format") == "csv":
			# Data/X.csv: id, plannerId, …; quoted cells are read by Godot's CSV reader.
			var f := FileAccess.open(data, FileAccess.READ)
			if f == null:
				continue
			f.get_csv_line()
			while not f.eof_reached():
				var cells := f.get_csv_line()
				if cells.size() >= 2 and cells[1] != "":
					out.append({"plannerId": cells[1], "schema": str(s.get("id")), "key": cells[0], "status": "implemented", "assetPath": data})
			continue
		for file in Bundle.files_in(data.trim_suffix("/"), "json"):
			var record: Variant = Bundle.read_json(file)
			if not (record is Dictionary):
				continue
			var pid := str(record.get("plannerId", ""))
			if pid == "" or listed.has(pid):
				continue
			var native: bool = s.get("format") == "native"
			var entry := {"plannerId": pid, "schema": str(s.get("id")), "key": str(record.get("id", "")), "status": "missing" if native else "implemented", "assetPath": file}
			if native:
				entry["issues"] = ["no .tres: the import did not create it"]
			out.append(entry)
	return out


static func _classes(at: String) -> Array:
	var out: Array = []
	var index: Variant = Bundle.read_json(at + "/" + Bundle.GENERATED + "/classes.json")
	if not (index is Array):
		return out
	for c in index:
		var own: Variant = c.get("own")
		var file := at + "/" + str(own if own != null else c.get("generated"))
		var methods: Array = c.get("methods", [])
		var status := "implemented"
		var todo := 0
		if not FileAccess.file_exists(file):
			status = "missing"
		elif own != null:
			var text := FileAccess.get_file_as_string(file)
			todo = text.count(TODO)
			for m in methods:
				if not text.contains("func %s(" % m):
					todo += 1
			status = "stub" if todo > 0 else "implemented"
		out.append({"plannerId": str(c.get("plannerId")), "name": str(c.get("name")), "status": status, "file": file, "todo": todo, "methods": methods.size()})
	return out
