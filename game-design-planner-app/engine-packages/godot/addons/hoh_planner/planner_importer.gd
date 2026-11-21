@tool
extends RefCounted
## Records of native-format schemas → one .tres each under <root>/Records/<Schema>/, found again by planner_id, so a
## renamed record keeps its resource and the references to it. A record the plan no longer has keeps its file and gets
## the “hoh_deprecated” meta. The generated scripts must already be known to Godot (the editor scans them first; in CI
## run `godot --headless --import` before).

const Bundle := preload("planner_bundle.gd")
const Values := preload("planner_values.gd")

const DEPRECATED := &"hoh_deprecated"


## Every record resource under <root>/Records by planner_id.
static func index(at: String) -> Dictionary:
	var out := {}
	for path in Bundle.files_in(at + "/" + Bundle.RECORDS, "tres"):
		var res := ResourceLoader.load(path, "", ResourceLoader.CACHE_MODE_REPLACE)
		if res != null and "planner_id" in res and str(res.get("planner_id")) != "":
			out[str(res.get("planner_id"))] = res
	return out


## Imports every native record. Returns { created, updated, unchanged, deprecated, problems: Array of String, error? }.
static func import_records(at: String) -> Dictionary:
	var result := {"created": 0, "updated": 0, "unchanged": 0, "deprecated": 0, "problems": []}
	var manifest := Bundle.load_manifest(at)
	if manifest.has("error"):
		result["error"] = manifest["error"]
		return result
	var gen := Bundle.generated(at)
	var existing := index(at)
	var seen := {}
	# key → resource per schema, filled first so records can point at each other in any order.
	var by_key := {}
	var pending: Array = []
	for s in manifest.get("schemas", []):
		if s.get("format") != "native":
			continue
		var sid := str(s.get("id"))
		if not gen["schemas"].has(sid):
			result["problems"].append("%s: no generated script with SCHEMA_ID %s; export the plan for Godot again." % [s.get("name"), sid])
			continue
		var script: Script = gen["schemas"][sid]
		var folder := str(s.get("data")).trim_suffix("/")
		var out_dir := "%s/%s/%s" % [at, Bundle.RECORDS, folder.get_file()]
		var fields: Dictionary = script.get_script_constant_map().get("PLANNER_FIELDS", {})
		by_key[sid] = {}
		for file in Bundle.files_in(at + "/" + folder, "json"):
			var record: Variant = Bundle.read_json(file)
			if not (record is Dictionary) or str(record.get("plannerId", "")) == "":
				result["problems"].append("%s: not a planner record." % file)
				continue
			var pid := str(record["plannerId"])
			var res: Resource = existing.get(pid)
			var is_new := res == null or res.get_script() != script
			if is_new:
				res = script.new()
				res.resource_path = "%s/%s.tres" % [out_dir, Bundle.safe_file_name(str(record.get("id", pid)))]
			seen[pid] = true
			by_key[sid][str(record.get("id", ""))] = res
			pending.append({"res": res, "record": record, "new": is_new, "fields": fields})
	var resolve := func(schema_id: String, key: String) -> Resource:
		return by_key.get(schema_id, {}).get(key)
	var ctx := {"enums": gen["enums"], "by_class": gen["by_class"], "resolve": resolve}
	for p in pending:
		var res: Resource = p["res"]
		var before := "" if p["new"] else var_to_str(_state(res))
		for problem in Values.apply(res, p["record"], p["fields"], ctx):
			result["problems"].append("%s.%s" % [p["record"].get("id", "?"), problem])
		var was_deprecated := res.has_meta(DEPRECATED)
		if was_deprecated:
			res.remove_meta(DEPRECATED)
		if not p["new"] and not was_deprecated and var_to_str(_state(res)) == before:
			result["unchanged"] += 1
			continue
		DirAccess.make_dir_recursive_absolute(res.resource_path.get_base_dir())
		var err := ResourceSaver.save(res, res.resource_path)
		if err != OK:
			result["problems"].append("%s: could not save (%s)." % [res.resource_path, error_string(err)])
			continue
		result["created" if p["new"] else "updated"] += 1
	for pid in existing:
		if seen.has(pid):
			continue
		var res: Resource = existing[pid]
		if res.has_meta(DEPRECATED):
			continue
		res.set_meta(DEPRECATED, true)
		ResourceSaver.save(res, res.resource_path)
		result["deprecated"] += 1
	return result


## The script variables of a resource, to tell whether an import changed anything.
static func _state(res: Resource) -> Dictionary:
	var out := {}
	for p in res.get_property_list():
		if p["usage"] & PROPERTY_USAGE_SCRIPT_VARIABLE:
			out[p["name"]] = _plain(res.get(p["name"]))
	return out


## Resources as their paths, so comparing does not walk into other records.
static func _plain(v: Variant) -> Variant:
	if v is Resource:
		return v.resource_path
	if v is Array:
		return v.map(func(x): return _plain(x))
	return v


## Adds the planner's imported translations (Godot makes <root>/Localization/strings.<lang>.translation from the CSV)
## to Project Settings ▸ Localization. Returns how many were added.
static func register_translations(at: String) -> int:
	var key := "internationalization/locale/translations"
	var list: PackedStringArray = ProjectSettings.get_setting(key, PackedStringArray())
	var added := 0
	for path in Bundle.files_in(at + "/Localization", "translation"):
		if not list.has(path):
			list.append(path)
			added += 1
	if added > 0:
		ProjectSettings.set_setting(key, list)
		ProjectSettings.save()
	return added


static func describe(r: Dictionary) -> String:
	if r.has("error"):
		return str(r["error"])
	return "%d created, %d updated, %d unchanged, %d deprecated, %d problem(s)" % [r["created"], r["updated"], r["unchanged"], r["deprecated"], r["problems"].size()]
