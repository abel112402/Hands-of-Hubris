"""Runs when the editor starts (Unreal runs every init_unreal.py on its Python path): adds Tools ▸ Game Design Planner."""

import unreal

ACTIONS = [
    ("Import", "Import", "Import the planner export: data assets, DataTables, report", "import_bundle"),
    ("Validate", "Validate", "Check the imported records against the plan", "validate_bundle"),
    ("WriteReport", "Write report", "Write hoh-engine-report.json for the planner", "report_bundle"),
    ("BuildGreybox", "Build greybox levels", "A level per location map of the plan, with floor, walls, doors, keys, spawns and lights", "greybox_bundle"),
    ("SetUpProject", "Set up project", "Copy .editorconfig, .gitattributes, .gitignore and create the planned folders (never overwrites)", "setup_bundle"),
]


def _register():
    menus = unreal.ToolMenus.get()
    tools = menus.find_menu("LevelEditor.MainMenu.Tools")
    if tools is None:
        return
    sub = tools.add_sub_menu("HoHPlanner", "Tools", "GameDesignPlanner", "Game Design Planner", "Game Design Planner bridge")
    for name, label, tip, fn in ACTIONS:
        entry = unreal.ToolMenuEntry(name=f"HoHPlanner{name}", type=unreal.MultiBlockType.MENU_ENTRY)
        entry.set_label(label)
        entry.set_tool_tip(tip)
        entry.set_string_command(unreal.ToolMenuStringCommandType.PYTHON, "", f"import hoh_planner.editor as e; e.{fn}()")
        sub.add_menu_entry("Planner", entry)
    menus.refresh_all_widgets()


_register()
