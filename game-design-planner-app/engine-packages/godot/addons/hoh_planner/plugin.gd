@tool
extends EditorPlugin
## Game Design Planner addon: Project ▸ Tools ▸ Game Design Planner ▸ Import / Validate / Write report / Set up project,
## automatic import when a new export lands in the folder, a header on record resources, and the PlannerMetrics autoload.

const Bundle := preload("planner_bundle.gd")
const Importer := preload("planner_importer.gd")
const Validator := preload("planner_validator.gd")
const Report := preload("planner_report.gd")
const Setup := preload("planner_setup.gd")
const Inspector := preload("planner_inspector.gd")
const Extras := preload("planner_extras.gd")
const Greybox := preload("planner_greybox.gd")

const MENU := "Game Design Planner"
const AUTOLOAD := "PlannerMetrics"
## The manifest hash last imported, kept in the project's .godot folder (not in version control).
const STAMP := "res://.godot/hoh_planner_imported.txt"

var _inspector: EditorInspectorPlugin
var _timer: Timer
var _busy := false


func _enter_tree() -> void:
	Bundle.register_settings()
	var menu := PopupMenu.new()
	menu.add_item("Import", 0)
	menu.add_item("Validate", 1)
	menu.add_item("Write report", 2)
	menu.add_separator()
	menu.add_item("Set up project", 3)
	menu.add_item("Build greybox scenes", 4)
	menu.id_pressed.connect(_on_menu)
	add_tool_submenu_item(MENU, menu)
	_inspector = Inspector.new()
	add_inspector_plugin(_inspector)
	_timer = Timer.new()
	_timer.wait_time = 2.0
	_timer.timeout.connect(_check_for_export)
	add_child(_timer)
	_timer.start()


func _exit_tree() -> void:
	remove_tool_menu_item(MENU)
	remove_inspector_plugin(_inspector)
	_timer.queue_free()


func _enable_plugin() -> void:
	add_autoload_singleton(AUTOLOAD, "res://addons/hoh_planner/planner_metrics.gd")


func _disable_plugin() -> void:
	remove_autoload_singleton(AUTOLOAD)


func _on_menu(id: int) -> void:
	match id:
		0:
			import_now()
		1:
			var issues := Validator.run(Bundle.root())
			for x in issues:
				if x["level"] == "error":
					push_error("[Planner] " + x["message"])
				else:
					push_warning("[Planner] " + x["message"])
			print("[Planner] Validate: ", Validator.describe(issues))
		2:
			var path := Report.write(Bundle.root())
			if path != "":
				print("[Planner] Report written to ", path, ". The planner reads it from the linked folder, or import it there.")
		3:
			for line in Setup.apply(Bundle.root()):
				print("[Planner] ", line)
			EditorInterface.get_resource_filesystem().scan()
		4:
			var r := Greybox.build(Bundle.root())
			for n in r["notes"]:
				push_warning("[Planner] " + n)
			print("[Planner] Greybox: ", r["scenes"].size(), " scene(s): ", ", ".join(r["scenes"]))
			EditorInterface.get_resource_filesystem().scan()


## Waits for Godot to know the generated scripts, then imports the records and writes the report.
func import_now() -> void:
	if _busy:
		return
	_busy = true
	var at := Bundle.root()
	var fs := EditorInterface.get_resource_filesystem()
	fs.scan()
	await get_tree().process_frame
	while fs.is_scanning():
		await get_tree().process_frame
	var r := Importer.import_records(at)
	if r.has("error"):
		push_error("[Planner] " + str(r["error"]))
	else:
		for p in r["problems"]:
			push_warning("[Planner] " + p)
		print("[Planner] Import: ", Importer.describe(r))
		Importer.register_translations(at)
		for line in Extras.after_import(at):
			print("[Planner] ", line)
		Report.write(at)
		_write_stamp(_manifest_hash(at))
	fs.scan()
	_busy = false


func _check_for_export() -> void:
	if _busy or not bool(ProjectSettings.get_setting(Bundle.SETTING_AUTO_IMPORT, true)):
		return
	var h := _manifest_hash(Bundle.root())
	if h != "" and h != _read_stamp():
		print("[Planner] A new export arrived; importing.")
		import_now()


func _manifest_hash(at: String) -> String:
	var path := at + "/" + Bundle.MANIFEST
	return FileAccess.get_md5(path) if FileAccess.file_exists(path) else ""


func _read_stamp() -> String:
	return FileAccess.get_file_as_string(STAMP).strip_edges() if FileAccess.file_exists(STAMP) else ""


func _write_stamp(h: String) -> void:
	var f := FileAccess.open(STAMP, FileAccess.WRITE)
	if f != null:
		f.store_string(h)
