extends SceneTree
## Command line / CI entry point. First let Godot import the project (it registers the generated classes), then run:
##
##   godot --headless --path . --import
##   godot --headless --path . -s res://addons/hoh_planner/ci.gd -- import [--root res://HoHPlanner]
##   godot --headless --path . -s res://addons/hoh_planner/ci.gd -- validate
##   godot --headless --path . -s res://addons/hoh_planner/ci.gd -- report
##   godot --headless --path . -s res://addons/hoh_planner/ci.gd -- greybox
##
## Exit code 0 when it worked, 1 on validation errors or import problems, 2 when the export cannot be read.

const Bundle := preload("planner_bundle.gd")
const Importer := preload("planner_importer.gd")
const Validator := preload("planner_validator.gd")
const Report := preload("planner_report.gd")
const Extras := preload("planner_extras.gd")
const Greybox := preload("planner_greybox.gd")


func _init() -> void:
	var args := OS.get_cmdline_user_args()
	var at := Bundle.root()
	var i := args.find("--root")
	if i >= 0 and i + 1 < args.size():
		at = args[i + 1].trim_suffix("/")
	var command := args[0] if args.size() > 0 else ""
	quit(_run(command, at))


func _run(command: String, at: String) -> int:
	match command:
		"import":
			var r := Importer.import_records(at)
			print("[Planner] Import: ", Importer.describe(r))
			for p in r["problems"]:
				print("  ", p)
			if r.has("error"):
				return 2
			Importer.register_translations(at)
			for line in Extras.after_import(at):
				print("[Planner] ", line)
			var path := Report.write(at)
			if path != "":
				print("[Planner] Report: ", path)
			return 1 if r["problems"].size() > 0 else 0
		"validate":
			var issues := Validator.run(at)
			for x in issues:
				print("  %s: %s" % [x["level"], x["message"]])
			print("[Planner] Validate: ", Validator.describe(issues))
			Report.write(at)
			return 1 if issues.any(func(x): return x["level"] == "error") else 0
		"report":
			return 0 if Report.write(at) != "" else 2
		"greybox":
			var g := Greybox.build(at)
			for n in g["notes"]:
				print("  ", n)
			print("[Planner] Greybox: ", g["scenes"].size(), " scene(s)")
			return 0 if g["notes"].is_empty() else 1
	printerr("Usage: godot --headless --path . -s res://addons/hoh_planner/ci.gd -- import | validate | report | greybox [--root res://HoHPlanner]")
	return 2
