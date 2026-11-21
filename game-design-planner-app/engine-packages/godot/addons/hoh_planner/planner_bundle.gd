@tool
extends RefCounted
## Settings and the export's manifest (hoh-engine v1). Shared by the editor plugin and the CI entry point.

const FORMAT := "hoh-engine"
const FORMAT_VERSION := 1
const MANIFEST := "hoh-engine.json"
const REPORT := "hoh-engine-report.json"
const RECORDS := "Records"
const GENERATED := "Godot/Scripts/Generated"

const SETTING_ROOT := "hoh_planner/root"
const SETTING_PLANNER_URL := "hoh_planner/planner_url"
const SETTING_AUTO_IMPORT := "hoh_planner/auto_import"
const SETTING_PLACEHOLDERS := "hoh_planner/placeholders"


static func register_settings() -> void:
	_setting(SETTING_ROOT, "res://HoHPlanner", TYPE_STRING, PROPERTY_HINT_DIR, "")
	_setting(SETTING_PLANNER_URL, "", TYPE_STRING, PROPERTY_HINT_NONE, "")
	_setting(SETTING_AUTO_IMPORT, true, TYPE_BOOL, PROPERTY_HINT_NONE, "")
	_setting(SETTING_PLACEHOLDERS, true, TYPE_BOOL, PROPERTY_HINT_NONE, "")


static func _setting(name: String, value: Variant, type: int, hint: int, hint_string: String) -> void:
	if not ProjectSettings.has_setting(name):
		ProjectSettings.set_setting(name, value)
	ProjectSettings.set_initial_value(name, value)
	ProjectSettings.add_property_info({"name": name, "type": type, "hint": hint, "hint_string": hint_string})


static func root() -> String:
	return str(ProjectSettings.get_setting(SETTING_ROOT, "res://HoHPlanner")).trim_suffix("/")


static func read_json(path: String) -> Variant:
	if not FileAccess.file_exists(path):
		return null
	return JSON.parse_string(FileAccess.get_file_as_string(path))


## The manifest, or a Dictionary with "error" when it is missing or not one this addon reads.
static func load_manifest(at: String) -> Dictionary:
	var m: Variant = read_json(at + "/" + MANIFEST)
	if m == null:
		return {"error": "No readable %s in %s. Export the plan for Godot into that folder." % [MANIFEST, at]}
	if not (m is Dictionary) or m.get("format") != FORMAT:
		return {"error": "%s is not a planner export." % MANIFEST}
	if int(m.get("v", 0)) != FORMAT_VERSION:
		return {"error": "The export uses version %s; this addon reads version %d. Update the addon or the planner." % [str(m.get("v")), FORMAT_VERSION]}
	var engine: Dictionary = m.get("engine", {})
	if engine.get("id") != "godot":
		return {"error": "The export was made for %s. Export it for Godot in the planner." % str(engine.get("id"))}
	return m


## Hash of one file of the export, as the manifest lists it.
static func file_hash(manifest: Dictionary, path: String) -> String:
	for f in manifest.get("files", []):
		if f.get("path") == path:
			return str(f.get("hash", ""))
	return ""


## Every file under a folder, recursively, with the given extension.
static func files_in(dir: String, ext: String, out: PackedStringArray = PackedStringArray()) -> PackedStringArray:
	if not DirAccess.dir_exists_absolute(dir):
		return out
	for f in DirAccess.get_files_at(dir):
		if f.get_extension() == ext:
			out.append(dir + "/" + f)
	for d in DirAccess.get_directories_at(dir):
		if not d.begins_with("."):
			files_in(dir + "/" + d, ext, out)
	return out


## Generated record scripts by planner schema ID, and the planner-ID → enum tables of the Enums script.
static func generated(at: String) -> Dictionary:
	var schemas := {}
	var by_class := {}
	var enums := {}
	for path in files_in(at + "/" + GENERATED, "gd"):
		if path.contains("/Classes/"):
			continue
		var script: Script = load(path)
		if script == null:
			continue
		var consts := script.get_script_constant_map()
		if consts.has("SCHEMA_ID"):
			schemas[str(consts["SCHEMA_ID"])] = script
			by_class[script.get_global_name()] = str(consts["SCHEMA_ID"])
		else:
			for k in consts:
				if str(k).ends_with("_IDS") and consts[k] is Dictionary:
					enums[str(k)] = consts[k]
	return {"schemas": schemas, "by_class": by_class, "enums": enums}


static func safe_file_name(key: String) -> String:
	var out := ""
	for c in key:
		out += c if (c.is_valid_identifier() or c.is_valid_int() or c == "." or c == "-") else "_"
	return out
