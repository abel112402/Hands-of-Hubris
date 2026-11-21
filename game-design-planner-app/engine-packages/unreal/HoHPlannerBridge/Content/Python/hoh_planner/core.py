"""Game Design Planner bridge for Unreal: everything that does not need the editor.

Reads the export (hoh-engine v1 manifest, Meta/planner-types.json, Meta/classes.json), turns planner values into
plain instructions for the editor side (editor.py), validates records and builds the report (hoh-engine-report v1).
No `unreal` import here, so it runs and is tested with plain Python.
"""

import json
import math
import os
import re
from datetime import datetime, timezone

FORMAT = "hoh-engine"
FORMAT_VERSION = 1
TYPES_FORMAT = "hoh-unreal-types"
MANIFEST = "hoh-engine.json"
REPORT = "hoh-engine-report.json"
TODO = "// TODO"
#: Where the records' assets go, under /Game.
CONTENT_ROOT = "/Game/HoHPlanner"


class BundleError(Exception):
    """The export cannot be read; the message says why."""


def read_json(path):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return None
    except (OSError, ValueError) as e:
        raise BundleError(f"{path} is not readable JSON ({e}).") from e


def load_manifest(root):
    m = read_json(os.path.join(root, MANIFEST))
    if m is None:
        raise BundleError(f"No {MANIFEST} in {root}. Export the plan for Unreal Engine into that folder (Plugins/HoHPlanner).")
    if not isinstance(m, dict) or m.get("format") != FORMAT:
        raise BundleError(f"{MANIFEST} is not a planner export.")
    if m.get("v") != FORMAT_VERSION:
        raise BundleError(f"The export uses version {m.get('v')}; this plugin reads version {FORMAT_VERSION}. Update the plugin or the planner.")
    engine = (m.get("engine") or {}).get("id")
    if engine != "unreal":
        raise BundleError(f"The export was made for {engine}. Export it for Unreal Engine in the planner.")
    return m


def load_types(root):
    t = read_json(os.path.join(root, "Unreal", "Meta", "planner-types.json"))
    if not isinstance(t, dict) or t.get("format") != TYPES_FORMAT:
        raise BundleError("Unreal/Meta/planner-types.json is missing; export the plan for Unreal Engine again.")
    return t


def file_hash(manifest, path):
    for f in manifest.get("files", []):
        if f.get("path") == path:
            return f.get("hash", "")
    return ""


def native_records(root, manifest):
    """(schema entry of the manifest, record dict) for every record of a native-format schema, in a stable order."""
    out = []
    for s in manifest.get("schemas", []):
        if s.get("format") != "native":
            continue
        folder = os.path.join(root, s.get("data", "").rstrip("/"))
        if not os.path.isdir(folder):
            continue
        for name in sorted(os.listdir(folder)):
            if name.endswith(".json"):
                r = read_json(os.path.join(folder, name))
                if isinstance(r, dict) and r.get("plannerId"):
                    out.append((s, r))
    return out


def asset_name(key):
    """An Unreal asset name for a record key: item.iron_sword → item_iron_sword."""
    return re.sub(r"[^A-Za-z0-9_]", "_", key) or "Record"


def record_path(types, schema_id, key):
    folder = types["schemas"][schema_id]["folder"]
    return f"{CONTENT_ROOT}/Records/{folder}/{asset_name(key)}"


# ---- Values ----------------------------------------------------------------------------------------------------

KEEP = object()


def _srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def plan_value(value, t, types):
    """A planner value as an instruction for the editor side, or KEEP when the property should stay as it is.

    Returns (instruction, problem). Instructions: ("plain", v), ("color", (r, g, b, a)) in linear space,
    ("vector", (x, y[, z])), ("enum", (python enum name, member)), ("record", (schema id, key)),
    ("asset", path), ("class", path), ("list", [instructions]).
    """
    if value is None or value == "":
        return KEEP, None
    k = t.get("k")
    if k == "list":
        if not isinstance(value, list):
            return KEEP, "should be a list"
        items, problem = [], None
        for v in value:
            i, p = plan_value(v, t["of"], types)
            problem = problem or p
            if i is not KEEP:
                items.append(i)
        return ("list", items), problem
    if k in ("int", "float"):
        try:
            n = float(value)
        except (TypeError, ValueError):
            return KEEP, f"“{value}” is not a number"
        if not math.isfinite(n):
            return KEEP, f"“{value}” is not a number"
        return ("plain", int(n) if k == "int" else n), None
    if k == "bool":
        return ("plain", value if isinstance(value, bool) else str(value).strip().lower() in ("true", "1", "yes")), None
    if k == "color":
        m = re.fullmatch(r"#?([0-9a-fA-F]{6})([0-9a-fA-F]{2})?", str(value))
        if not m:
            return KEEP, f"“{value}” is not a colour like #aabbcc"
        ch = [int(m.group(1)[i:i + 2], 16) / 255 for i in (0, 2, 4)]
        a = int(m.group(2), 16) / 255 if m.group(2) else 1.0
        return ("color", tuple(round(_srgb_to_linear(c), 6) for c in ch) + (a,)), None
    if k in ("vec2", "vec3"):
        need = 2 if k == "vec2" else 3
        if not isinstance(value, list) or len(value) != need:
            return KEEP, f"needs {need} numbers"
        return ("vector", tuple(float(x) for x in value)), None
    if k == "enum":
        en = types.get("enums", {}).get(t.get("enum") or "")
        if not en or value not in en["members"]:
            return KEEP, f"“{value}” is not a value of the enum"
        return ("enum", (en["py"], en["members"][value])), None
    if k == "ref":
        if t.get("asAsset"):
            return ("record", (t["schema"], str(value))), None
        return ("plain", str(value)), None
    if k == "asset":
        text = str(value)
        if not text.startswith("/"):
            return KEEP, f"“{text}” is not an Unreal path (/Game/…); assign it in the editor"
        return ("class" if t.get("asset") in ("scene", "animator") else "asset", text), None
    if k == "curve":
        return KEEP, None
    return ("plain", value if isinstance(value, str) else json.dumps(value)), None


def plan_record(record, schema_types, types):
    """[(python property name, instruction)] and problems for one record."""
    sets, problems = [("planner_id", ("plain", record["plannerId"]))], []
    if "id" in record:
        sets.append(("id", ("plain", str(record["id"]))))
    fields = schema_types["fields"]
    for name, value in record.items():
        if name in ("id", "plannerId"):
            continue
        f = fields.get(name)
        if f is None:
            problems.append(f"{name}: no property for it; export the plan again")
            continue
        i, p = plan_value(value, f["type"], types)
        if p:
            problems.append(f"{name}: {p}")
        if i is not KEEP:
            sets.append((f["py"], i))
    return sets, problems


# ---- Validation and report ---------------------------------------------------------------------------------------

def is_empty(v):
    return v is None or v == "" or v == [] or v == "None"


PLACEHOLDERS = f"{CONTENT_ROOT}/Placeholders/"


def is_placeholder(v):
    """An asset the bridge made as a placeholder (it lives under /Game/HoHPlanner/Placeholders/)."""
    return isinstance(v, str) and PLACEHOLDERS in v


def validate(root, manifest, types, state):
    """state: {planner id: {"key", "schema", "path", "deprecated", "values": {python name: value or None}}} of the
    record assets found. Returns issues: {"level", "key", "path", "message"}."""
    issues = []
    for s, r in planned_native(root, manifest):
        pid, key = r["plannerId"], r["key"]
        a = state.get(pid)
        if a is None:
            issues.append({"level": "error", "key": key, "path": "", "message": f"{key}: no asset; run Import."})
            continue
        for planner, f in types["schemas"].get(s, {}).get("fields", {}).items():
            if f.get("optional"):
                continue
            v = a["values"].get(f["py"])
            if is_empty(v):
                # A texture or mesh is assigned in the editor, so a missing one is a warning; missing data is an error.
                level = "warning" if f["type"].get("k") in ("asset", "curve") else "error"
                issues.append({"level": level, "key": key, "path": a["path"], "message": f"{key}.{planner}: required, but empty."})
            elif is_placeholder(v):
                # A placeholder fills the gap in the game, but the real asset is still to be made.
                issues.append({"level": "warning", "key": key, "path": a["path"], "message": f"{key}.{planner}: still a placeholder."})
    return issues


def planned_native(root, manifest):
    """(schema id, {plannerId, key}) for every record of a native-format schema, from the export's ir/engine-ir.json."""
    ir = read_json(os.path.join(root, "ir", "engine-ir.json")) or {}
    native = {s["id"] for s in manifest.get("schemas", []) if s.get("format") == "native"}
    return [(r["schema"], {"plannerId": r["plannerId"], "key": r["key"]}) for r in ir.get("records", []) if r.get("schema") in native]


def class_states(root):
    """The report's classes: your .cpp there, its TODOs, and the methods of the plan it does not define yet."""
    index = read_json(os.path.join(root, "Unreal", "Meta", "classes.json"))
    out = []
    for c in index if isinstance(index, list) else []:
        own = c.get("own")
        file = os.path.join(root, own if own else c.get("generated", ""))
        methods = c.get("methods", [])
        status, todo = "implemented", 0
        if not os.path.isfile(file):
            status = "missing"
        elif own:
            with open(file, encoding="utf-8") as f:
                text = f.read()
            todo = text.count(TODO) + sum(1 for m in methods if m not in text)
            status = "stub" if todo else "implemented"
        out.append({"plannerId": c["plannerId"], "name": c.get("name", ""), "status": status, "file": (own or c.get("generated", "")), "todo": todo, "methods": len(methods)})
    return out


def metric_summaries(path):
    data = read_json(path) if path and os.path.isfile(path) else None
    out = []
    for m in sorted((data or {}).get("metrics", []), key=lambda m: str(m.get("key", ""))):
        n = int(m.get("samples", 0) or 0)
        if not m.get("key") or n <= 0:
            continue
        e = {"key": m["key"], "value": float(m.get("sum", 0)) / n, "samples": n, "min": float(m.get("min", 0)), "max": float(m.get("max", 0))}
        if m.get("build"):
            e["build"] = str(m["build"])
        out.append(e)
    return out


def build_report(root, manifest, types, state, engine_version="", metrics_path=None, issues=None):
    issues = validate(root, manifest, types, state) if issues is None else issues
    by_path = {}
    for i in issues:
        if i["path"]:
            head = i["message"].split(":", 1)[0]
            by_path.setdefault(i["path"], []).append(head.rsplit(".", 1)[-1] + i["message"][len(head):])
    records, listed = [], set()
    for pid, a in sorted(state.items(), key=lambda x: x[1]["key"]):
        status = "deprecated" if a.get("deprecated") else ("incomplete" if a["path"] in by_path else "implemented")
        e = {"plannerId": pid, "schema": a["schema"], "key": a["key"], "status": status, "assetPath": a["path"]}
        if a["path"] in by_path:
            e["issues"] = by_path[a["path"]][:20]
        records.append(e)
        listed.add(pid)
    for s, r in native_records(root, manifest):
        if r["plannerId"] not in listed:
            records.append({"plannerId": r["plannerId"], "schema": s["id"], "key": r.get("id", ""), "status": "missing", "issues": ["no asset: the import did not create it"]})
    for s in manifest.get("schemas", []):
        if s.get("format") == "native":
            continue
        table = types["schemas"].get(s["id"], {}).get("dataTable")
        rows = read_json(os.path.join(root, table)) if table else None
        for row in rows if isinstance(rows, list) else []:
            if row.get("PlannerId"):
                records.append({"plannerId": row["PlannerId"], "schema": s["id"], "key": row.get("Name", ""), "status": "implemented", "assetPath": f"{CONTENT_ROOT}/DataTables/DT_{types['schemas'][s['id']]['folder']}"})
    return {
        "format": "hoh-engine-report",
        "v": 1,
        "engine": "unreal",
        "engineVersion": engine_version,
        "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "project": {"name": (manifest.get("project") or {}).get("name", "")},
        "irHash": file_hash(manifest, "ir/engine-ir.json"),
        "records": records,
        "classes": class_states(root),
        "metrics": metric_summaries(metrics_path),
    }


def write_report(root, report):
    path = os.path.join(root, REPORT)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)
        f.write("\n")
    return path
