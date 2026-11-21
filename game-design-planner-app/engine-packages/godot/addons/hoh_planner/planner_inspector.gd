@tool
extends EditorInspectorPlugin
## A header on record resources from the planner: which record it is, that its planner fields come from the plan,
## and a link to the planner.

const Bundle := preload("planner_bundle.gd")
const Importer := preload("planner_importer.gd")


func _can_handle(object: Object) -> bool:
	return object is Resource and object.get_script() != null and "planner_id" in object and str(object.get("planner_id")) != ""


func _parse_begin(object: Object) -> void:
	var box := VBoxContainer.new()
	var label := Label.new()
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	var deprecated := (object as Resource).has_meta(Importer.DEPRECATED)
	label.text = "Game Design Planner record “%s”.%s Its planner fields are replaced on every import: change them in the planner. Textures, scenes and sounds you assign here are kept." % [object.get("id"), " Deprecated: the plan no longer has it." if deprecated else ""]
	box.add_child(label)
	var url := str(ProjectSettings.get_setting(Bundle.SETTING_PLANNER_URL, "")).strip_edges()
	if url != "":
		var button := Button.new()
		button.text = "Open in planner"
		button.pressed.connect(func(): OS.shell_open(url.trim_suffix("/") + "/#/doc/technical.dataDriven?s=schemas"))
		box.add_child(button)
	add_custom_control(box)
