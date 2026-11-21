@tool
extends RefCounted
## Checks the imported records against the plan: every native record has its .tres, every required field is filled,
## no record points at a deprecated one. Required fields come from ir/engine-ir.json.

const Bundle := preload("planner_bundle.gd")
const Importer := preload("planner_importer.gd")
const Placeholders := preload("planner_placeholders.gd")

## Each issue: { "level": "error" | "warning", "key": record key, "path": .tres path or "", "message": String }.
static func run(at: String) -> Array[Dictionary]:
	var issues: Array[Dictionary] = []
	var manifest := Bundle.load_manifest(at)
	if manifest.has("error"):
		issues.append({"level": "error", "key": "", "path": "", "message": manifest["error"]})
		return issues
	var ir: Variant = Bundle.read_json(at + "/ir/engine-ir.json")
	if not (ir is Dictionary):
		issues.append({"level": "error", "key": "", "path": "", "message": "ir/engine-ir.json is missing; export the plan again."})
		return issues
	var required := {}
	for s in ir.get("schemas", []):
		var names: Array = []
		for f in s.get("fields", []):
			if not f.get("optional", false):
				names.append(str(f.get("name")))
		required[str(s.get("id"))] = names
	var native := {}
	for s in manifest.get("schemas", []):
		if s.get("format") == "native":
			native[str(s.get("id"))] = true
	var resources := Importer.index(at)
	for r in ir.get("records", []):
		var sid := str(r.get("schema"))
		if not native.has(sid):
			continue
		var key := str(r.get("key"))
		var res: Resource = resources.get(str(r.get("plannerId")))
		if res == null:
			issues.append({"level": "error", "key": key, "path": "", "message": "%s: no .tres; run Import." % key})
			continue
		var fields: Dictionary = res.get_script().get_script_constant_map().get("PLANNER_FIELDS", {})
		for planner in required.get(sid, []):
			var prop := str(fields.get(planner, ""))
			if prop == "":
				continue
			var v: Variant = res.get(prop)
			var empty: bool = v == null or (v is String and v == "") or (v is Array and v.is_empty())
			if empty:
				# A texture or scene is assigned in the Inspector, so a missing one is a warning; missing data is an error.
				var level := "warning" if (v == null) else "error"
				issues.append({"level": level, "key": key, "path": res.resource_path, "message": "%s.%s: required, but empty." % [key, planner]})
			elif Placeholders.is_placeholder(v):
				# A placeholder fills the gap in the game, but the real asset is still to be made.
				issues.append({"level": "warning", "key": key, "path": res.resource_path, "message": "%s.%s: still a placeholder." % [key, planner]})
			elif v is Resource and v.has_meta(Importer.DEPRECATED):
				issues.append({"level": "warning", "key": key, "path": res.resource_path, "message": "%s.%s: points at a deprecated record." % [key, planner]})
	issues.append_array(data_checks(at, resources))
	return issues


## The Balance plan's data checks (the generated *_data_checks.gd) on every record resource of their schema.
static func data_checks(at: String, resources: Dictionary) -> Array[Dictionary]:
	var out: Array[Dictionary] = []
	var script: Script = null
	for path in Bundle.files_in(at + "/" + Bundle.GENERATED, "gd"):
		if path.ends_with("_data_checks.gd"):
			script = load(path)
	if script == null:
		return out
	var checks: Array = script.get_script_constant_map().get("CHECKS", [])
	for i in checks.size():
		var c: Dictionary = checks[i]
		var outside: PackedStringArray = []
		for pid in resources:
			var res: Resource = resources[pid]
			if res.has_meta(Importer.DEPRECATED) or str(res.get_script().get_script_constant_map().get("SCHEMA_ID", "")) != c["schema"]:
				continue
			var v: float = script.call("value", i, res)
			if is_nan(v) or is_inf(v) or (c.has("min") and v < float(c["min"])) or (c.has("max") and v > float(c["max"])):
				outside.append("%s = %s" % [res.get("id"), v])
		if not outside.is_empty():
			var span := "%s–%s" % [c.get("min", "−∞"), c.get("max", "∞")]
			out.append({"level": c["level"], "key": "", "path": "", "message": "%s (%s) outside %s: %s" % [c["name"], c["expr"], span, ", ".join(outside)]})
	return out


static func describe(issues: Array[Dictionary]) -> String:
	var errors := issues.filter(func(i): return i["level"] == "error").size()
	return "%d error(s), %d warning(s)" % [errors, issues.size() - errors]
