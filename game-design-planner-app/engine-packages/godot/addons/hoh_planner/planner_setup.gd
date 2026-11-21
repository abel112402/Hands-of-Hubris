@tool
extends RefCounted
## Project set-up from the plan (<root>/Godot/ProjectFiles): .editorconfig, .gitattributes and .gitignore at res://,
## and the planned folders. Only creates what is missing; never overwrites a file that is there.

const Bundle := preload("planner_bundle.gd")


## Returns the lines of what it did.
static func apply(at: String) -> PackedStringArray:
	var done := PackedStringArray()
	var files := at + "/Godot/ProjectFiles"
	if not DirAccess.dir_exists_absolute(files):
		done.append("No Godot/ProjectFiles in %s; export the plan for Godot first." % at)
		return done
	for name in [".editorconfig", ".gitattributes", ".gitignore"]:
		var target := "res://" + name
		if FileAccess.file_exists(target):
			done.append("%s is there already; kept (the plan's version is %s/%s)." % [name, files, name])
			continue
		if DirAccess.copy_absolute(files + "/" + name, target) == OK:
			done.append("Created %s." % name)
	var setup: Variant = Bundle.read_json(files + "/setup.json")
	if setup is Dictionary:
		for f in setup.get("folders", []):
			var path := str(f.get("path", ""))
			if path.begins_with("res://") and not path.contains("..") and not DirAccess.dir_exists_absolute(path):
				DirAccess.make_dir_recursive_absolute(path)
				done.append("Created %s." % path)
	return done
