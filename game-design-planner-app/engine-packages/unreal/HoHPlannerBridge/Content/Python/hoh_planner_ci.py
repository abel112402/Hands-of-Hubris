"""Command line / CI: after building the editor target,

    UnrealEditor-Cmd.exe Game.uproject -run=pythonscript -script="hoh_planner_ci.py import"
    UnrealEditor-Cmd.exe Game.uproject -run=pythonscript -script="hoh_planner_ci.py validate"

prints one line “HOH_PLANNER_RESULT: ok | errors | unreadable” (the commandlet's own exit code does not carry it), and
writes the report. HOH_PLANNER_ROOT points at another export folder than Plugins/HoHPlanner.
"""

import sys

import unreal

from hoh_planner import core, editor


def main(args):
    command = args[0] if args else ""
    try:
        if command == "import":
            r = editor.import_records()
            for p in r["problems"]:
                unreal.log_warning(f"[Planner] {p}")
            unreal.log(f"[Planner] Import: {r['created']} created, {r['updated']} updated, {r['deprecated']} deprecated, {r['tables']} DataTable(s).")
            for line in editor.after_import():
                unreal.log(f"[Planner] {line}")
            editor.write_report()
            return "errors" if r["problems"] else "ok"
        if command == "validate":
            issues = editor.validate()
            for i in issues:
                unreal.log(f"[Planner] {i['level']}: {i['message']}")
            editor.write_report()
            return "errors" if any(i["level"] == "error" for i in issues) else "ok"
        if command == "report":
            editor.write_report()
            return "ok"
        if command == "greybox":
            levels = editor.build_greybox()
            unreal.log(f"[Planner] Greybox: {len(levels)} level(s): {', '.join(levels)}")
            return "ok" if levels else "errors"
    except core.BundleError as e:
        unreal.log_error(f"[Planner] {e}")
        return "unreadable"
    unreal.log_error("Usage: -run=pythonscript -script=\"hoh_planner_ci.py import | validate | report | greybox\"")
    return "unreadable"


print(f"HOH_PLANNER_RESULT: {main(sys.argv[1:])}")
