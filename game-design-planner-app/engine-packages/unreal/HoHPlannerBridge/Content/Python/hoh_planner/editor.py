"""Game Design Planner bridge for Unreal: the editor side (needs the `unreal` module, i.e. the Unreal Editor's Python).

Import: one data asset per record of every native-format schema under /Game/HoHPlanner/Records/<Schema>/, found again by
PlannerId (a renamed record keeps its asset and every reference to it), and one DataTable per JSON/CSV schema under
/Game/HoHPlanner/DataTables/, filled from the export's DataTable JSON. A planner value never clears a property: textures
and meshes assigned in the editor stay. A record the plan dropped keeps its asset and gets the HoHDeprecated metadata tag.
The C++ module (PlannerGame) must be built first: the classes come from it.
"""

import os
import re

import unreal

from . import core, ideas

DEPRECATED_TAG = "HoHDeprecated"


def log(msg):
    unreal.log(f"[Planner] {msg}")


def default_root():
    """<project>/Plugins/HoHPlanner, or HOH_PLANNER_ROOT."""
    env = os.environ.get("HOH_PLANNER_ROOT")
    if env:
        return env
    plugins = unreal.Paths.convert_relative_path_to_full(unreal.Paths.project_plugins_dir())
    return os.path.join(plugins, "HoHPlanner")


def metrics_path():
    return os.path.join(unreal.Paths.convert_relative_path_to_full(unreal.Paths.project_saved_dir()), "hoh-planner-metrics.json")


def _asset_tools():
    return unreal.AssetToolsHelpers.get_asset_tools()


def _get(asset, name):
    try:
        return asset.get_editor_property(name)
    except Exception:  # noqa: BLE001 — Unreal raises a plain Exception for an unknown property
        return None


def index():
    """Record assets under /Game/HoHPlanner/Records by PlannerId."""
    out = {}
    folder = f"{core.CONTENT_ROOT}/Records"
    if not unreal.EditorAssetLibrary.does_directory_exist(folder):
        return out
    for path in unreal.EditorAssetLibrary.list_assets(folder, recursive=True, include_folder=False):
        asset = unreal.EditorAssetLibrary.load_asset(path)
        pid = _get(asset, "planner_id") if asset else None
        if pid:
            out[str(pid)] = asset
    return out


def _to_unreal(instr, by_key):
    kind, v = instr
    if kind == "plain":
        return v
    if kind == "color":
        return unreal.LinearColor(*v)
    if kind == "vector":
        return unreal.Vector2D(*v) if len(v) == 2 else unreal.Vector(*v)
    if kind == "enum":
        return getattr(getattr(unreal, v[0]), v[1])
    if kind == "record":
        return by_key.get(v[0], {}).get(v[1])
    if kind == "asset":
        return unreal.EditorAssetLibrary.load_asset(v) if unreal.EditorAssetLibrary.does_asset_exist(v) else None
    if kind == "class":
        return unreal.EditorAssetLibrary.load_blueprint_class(v) if unreal.EditorAssetLibrary.does_asset_exist(v) else None
    if kind == "list":
        items = [_to_unreal(i, by_key) for i in v]
        return [i for i in items if i is not None]
    return None


def import_records(root=None):
    """Returns {created, updated, deprecated, tables, problems}."""
    root = root or default_root()
    manifest = core.load_manifest(root)
    types = core.load_types(root)
    result = {"created": 0, "updated": 0, "deprecated": 0, "tables": 0, "problems": []}
    existing = index()
    seen, by_key, pending = set(), {}, []
    for s, record in core.native_records(root, manifest):
        st = types["schemas"].get(s["id"])
        cls = unreal.load_class(None, st["path"]) if st else None
        if cls is None:
            result["problems"].append(f"{s['name']}: no class {st['path'] if st else '?'}; build the project (the PlannerGame module) and import again.")
            continue
        pid = record["plannerId"]
        asset = existing.get(pid)
        created = False
        if asset is None or asset.get_class() != cls:
            path = core.record_path(types, s["id"], str(record.get("id", pid)))
            folder, name = path.rsplit("/", 1)
            factory = unreal.DataAssetFactory()
            factory.set_editor_property("data_asset_class", cls)
            asset = _asset_tools().create_asset(name, folder, cls, factory)
            if asset is None:
                result["problems"].append(f"{path}: could not create the asset.")
                continue
            created = True
        seen.add(pid)
        by_key.setdefault(s["id"], {})[str(record.get("id", ""))] = asset
        pending.append((asset, record, st, created))
    for asset, record, st, created in pending:
        sets, problems = core.plan_record(record, st, types)
        result["problems"] += [f"{record.get('id', '?')}.{p}" for p in problems]
        for prop, instr in sets:
            value = _to_unreal(instr, by_key)
            if value is None:
                continue
            try:
                asset.set_editor_property(prop, value)
            except Exception as e:  # noqa: BLE001
                result["problems"].append(f"{record.get('id', '?')}.{prop}: {e}")
        if unreal.EditorAssetLibrary.get_metadata_tag(asset, DEPRECATED_TAG):
            unreal.EditorAssetLibrary.remove_metadata_tag(asset, DEPRECATED_TAG)
        unreal.EditorAssetLibrary.save_loaded_asset(asset, False)
        result["created" if created else "updated"] += 1
    for pid, asset in existing.items():
        if pid not in seen and not unreal.EditorAssetLibrary.get_metadata_tag(asset, DEPRECATED_TAG):
            unreal.EditorAssetLibrary.set_metadata_tag(asset, DEPRECATED_TAG, "true")
            unreal.EditorAssetLibrary.save_loaded_asset(asset, False)
            result["deprecated"] += 1
    result["tables"] = import_tables(root, manifest, types, result["problems"])
    return result


def import_tables(root, manifest, types, problems):
    """One DataTable per JSON/CSV schema, filled from Unreal/DataTables/<Schema>.json. Returns how many."""
    done = 0
    for s in manifest.get("schemas", []):
        st = types["schemas"].get(s["id"])
        if s.get("format") == "native" or not st or not st.get("dataTable"):
            continue
        struct = unreal.load_object(None, st["path"])
        if struct is None:
            problems.append(f"{s['name']}: no row struct {st['path']}; build the project and import again.")
            continue
        folder, name = f"{core.CONTENT_ROOT}/DataTables", f"DT_{st['folder']}"
        path = f"{folder}/{name}"
        table = unreal.EditorAssetLibrary.load_asset(path) if unreal.EditorAssetLibrary.does_asset_exist(path) else None
        if table is None:
            factory = unreal.DataTableFactory()
            factory.set_editor_property("struct", struct)
            table = _asset_tools().create_asset(name, folder, unreal.DataTable, factory)
        if table is None or not unreal.DataTableFunctionLibrary.fill_data_table_from_json_file(table, os.path.join(root, st["dataTable"])):
            problems.append(f"{path}: could not fill it from {st['dataTable']}.")
            continue
        unreal.EditorAssetLibrary.save_loaded_asset(table, False)
        done += 1
    return done


def _plain(v):
    if v is None:
        return None
    if isinstance(v, (list, tuple)) or type(v).__name__ == "Array":
        return [x for x in v]
    if isinstance(v, (str, int, float, bool)):
        return v
    text = str(v)
    return None if text in ("", "None") else text


def state(root, types):
    """The record assets as core.validate wants them."""
    out = {}
    for pid, asset in index().items():
        schema = next((sid for sid, st in types["schemas"].items() if st.get("format") == "native" and asset.get_class() == unreal.load_class(None, st["path"])), "")
        fields = types["schemas"].get(schema, {}).get("fields", {})
        out[pid] = {
            "key": str(_get(asset, "id") or ""),
            "schema": schema,
            "path": asset.get_path_name().split(".")[0],
            "deprecated": bool(unreal.EditorAssetLibrary.get_metadata_tag(asset, DEPRECATED_TAG)),
            "values": {f["py"]: _plain(_get(asset, f["py"])) for f in fields.values()},
        }
    return out


def validate(root=None):
    root = root or default_root()
    manifest, types = core.load_manifest(root), core.load_types(root)
    now = state(root, types)
    return core.validate(root, manifest, types, now) + ideas.run_checks(root, types, now)


def telemetry_path():
    return os.path.join(unreal.Paths.convert_relative_path_to_full(unreal.Paths.project_saved_dir()), "hoh-telemetry.jsonl")


def write_report(root=None):
    root = root or default_root()
    manifest, types = core.load_manifest(root), core.load_types(root)
    now = state(root, types)
    issues = core.validate(root, manifest, types, now) + ideas.run_checks(root, types, now)
    report = core.build_report(root, manifest, types, now, unreal.SystemLibrary.get_engine_version(), metrics_path(), issues=issues)
    report["metrics"] = ideas.merge_metrics(report["metrics"], ideas.telemetry_metrics(telemetry_path()))
    return core.write_report(root, report)


# ---- After an import: channel assets and placeholders ---------------------------------------------------------------

def make_channels(root=None):
    """One data asset per channel class of the plan (/Game/HoHPlanner/Channels), made when missing. Returns how many."""
    types = core.load_types(root or default_root())
    made = 0
    for c in types.get("channels", []):
        cls = unreal.load_class(None, c["path"])
        name = c["path"].rsplit(".", 1)[-1]
        folder = f"{core.CONTENT_ROOT}/Channels"
        if cls is None or unreal.EditorAssetLibrary.does_asset_exist(f"{folder}/{name}"):
            continue
        factory = unreal.DataAssetFactory()
        factory.set_editor_property("data_asset_class", cls)
        if _asset_tools().create_asset(name, folder, cls, factory) is not None:
            made += 1
    return made


def make_input(root=None):
    """The plan's controls as Enhanced Input assets under /Game/HoHPlanner/Input: an Input Action per control and an
    Input Mapping Context per category, with the planned keys. Existing assets are kept as they are (your remapping
    stays); only new actions are mapped. Returns how many assets were made."""
    types = core.load_types(root or default_root())
    folder = f"{core.CONTENT_ROOT}/Input"
    made = 0
    for ctx in types.get("input", []):
        ctx_path = f"{folder}/{ctx['context']}"
        if unreal.EditorAssetLibrary.does_asset_exist(ctx_path):
            context = unreal.EditorAssetLibrary.load_asset(ctx_path)
        else:
            context = _asset_tools().create_asset(ctx["context"], folder, unreal.InputMappingContext, unreal.InputMappingContext_Factory())
            made += 1
        if context is None:
            continue
        for a in ctx.get("actions", []):
            path = f"{folder}/{a['asset']}"
            if unreal.EditorAssetLibrary.does_asset_exist(path):
                continue
            action = _asset_tools().create_asset(a["asset"], folder, unreal.InputAction, unreal.InputAction_Factory())
            if action is None:
                continue
            made += 1
            for key in a.get("keys", []):
                context.map_key(action, unreal.Key(key_name=key))
            unreal.EditorAssetLibrary.save_loaded_asset(action, False)
        unreal.EditorAssetLibrary.save_loaded_asset(context, False)
    return made


def make_placeholders(root=None):
    """Empty texture fields get a PNG in the plan's palette with the record's initials (imported under
    /Game/HoHPlanner/Placeholders/<Type>/), empty mesh fields the engine's cube. Returns {made, filled}."""
    import tempfile

    root = root or default_root()
    types = core.load_types(root)
    colors = ideas.palette(root)
    result = {"made": 0, "filled": 0}
    for pid, asset in index().items():
        if unreal.EditorAssetLibrary.get_metadata_tag(asset, DEPRECATED_TAG):
            continue
        schema_id = next((sid for sid, st in types["schemas"].items() if st.get("format") == "native" and asset.get_class() == unreal.load_class(None, st["path"])), None)
        if schema_id is None:
            continue
        st = types["schemas"][schema_id]
        key = str(_get(asset, "id") or pid)
        changed = False
        for f in st["fields"].values():
            t = f["type"]
            if t.get("k") != "asset" or _plain(_get(asset, f["py"])) is not None:
                continue
            value = None
            if t.get("asset") == "image":
                folder = f"{core.CONTENT_ROOT}/Placeholders/{st['folder']}"
                name = core.asset_name(key)
                path = f"{folder}/{name}"
                if not unreal.EditorAssetLibrary.does_asset_exist(path):
                    with tempfile.TemporaryDirectory() as tmp:
                        png = os.path.join(tmp, f"{name}.png")
                        with open(png, "wb") as out:
                            out.write(ideas.png(ideas.color_for(schema_id, key, colors), ideas.initials(key)))
                        task = unreal.AssetImportTask()
                        task.set_editor_property("filename", png)
                        task.set_editor_property("destination_path", folder)
                        task.set_editor_property("automated", True)
                        task.set_editor_property("save", True)
                        task.set_editor_property("replace_existing", True)
                        _asset_tools().import_asset_tasks([task])
                    result["made"] += 1
                value = unreal.EditorAssetLibrary.load_asset(path)
            elif t.get("asset") == "mesh":
                value = unreal.EditorAssetLibrary.load_asset("/Engine/BasicShapes/Cube")
            if value is None:
                continue
            try:
                asset.set_editor_property(f["py"], value)
                result["filled"] += 1
                changed = True
            except Exception as e:  # noqa: BLE001
                log(f"Placeholder for {key}.{f['py']}: {e}")
        if changed:
            unreal.EditorAssetLibrary.save_loaded_asset(asset, False)
    return result


# ---- Greybox levels ---------------------------------------------------------------------------------------------

CM = 100.0  # one cell = 1 m = 100 Unreal units
WALL = 2.0


def _color_material(name, rgb):
    """A material instance of the engine's basic shape material, in a colour (shared by every greybox)."""
    path = f"{core.CONTENT_ROOT}/Greybox/Materials/MI_{name}"
    if unreal.EditorAssetLibrary.does_asset_exist(path):
        return unreal.EditorAssetLibrary.load_asset(path)
    folder, asset_name = path.rsplit("/", 1)
    mi = _asset_tools().create_asset(asset_name, folder, unreal.MaterialInstanceConstant, unreal.MaterialInstanceConstantFactoryNew())
    mi.set_editor_property("parent", unreal.EditorAssetLibrary.load_asset("/Engine/BasicShapes/BasicShapeMaterial"))
    unreal.MaterialEditingLibrary.set_material_instance_vector_parameter_value(mi, "Color", unreal.LinearColor(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, 1))
    unreal.EditorAssetLibrary.save_loaded_asset(mi, False)
    return mi


def _at(col, row, z):
    """Map cells (column right, row down) as an Unreal location: rows go along -X, so the top view is not mirrored."""
    return unreal.Vector(-row * CM, col * CM, z * CM)


def _block(actors, cube, material, row, col, z, sx, sy, sz, label, collision=True):
    """An engine cube (100 units, pivot in the middle) centred on a cell position, sx along rows, sy along columns."""
    actor = actors.spawn_actor_from_class(unreal.StaticMeshActor, _at(col, row, z))
    comp = actor.static_mesh_component
    comp.set_static_mesh(cube)
    comp.set_material(0, material)
    actor.set_actor_scale3d(unreal.Vector(sx, sy, sz))
    actor.set_actor_label(label)
    if not collision:
        comp.set_collision_enabled(unreal.CollisionEnabled.NO_COLLISION)
    return actor


def build_greybox(root=None):
    """One level per location map (Maps/*.json) under /Game/HoHPlanner/Greybox/: floor and 2 m walls (one block per
    run of cells), doors (red when locked, no collision), lock and key markers, spawn points, the planned lights, a
    sun and a NavMeshBoundsVolume over it (build paths to bake). Building again replaces the level. Returns paths."""
    root = root or default_root()
    levels = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
    actors = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
    cube = unreal.EditorAssetLibrary.load_asset("/Engine/BasicShapes/Cube")
    colors = ideas.palette(root)
    pick = lambda i, rgb: colors[i] if len(colors) > i else rgb  # noqa: E731
    floor_m = _color_material("Floor", pick(3, (180, 180, 180)))
    wall_m = _color_material("Wall", pick(0, (90, 90, 102)))
    door_m = _color_material("Door", (140, 92, 51))
    locked_m = _color_material("LockedDoor", (204, 38, 38))
    key_m = _color_material("Key", (242, 204, 51))
    spawn_m = _color_material("Spawn", pick(1, (242, 153, 77)))
    built = []
    maps = os.path.join(root, "Maps")
    for name in sorted(os.listdir(maps)) if os.path.isdir(maps) else []:
        loc = core.read_json(os.path.join(maps, name))
        if not isinstance(loc, dict) or loc.get("format") != "hoh-location":
            continue
        try:
            plan = ideas.greybox_plan(loc)
        except ValueError as e:
            unreal.log_warning(f"[Planner] {loc.get('name', name)}: {e}")
            continue
        path = f"{core.CONTENT_ROOT}/Greybox/{core.asset_name(plan['name'])}"
        if unreal.EditorAssetLibrary.does_asset_exist(path):
            unreal.EditorAssetLibrary.delete_asset(path)
        if not levels.new_level(path):
            unreal.log_warning(f"[Planner] Could not make the level {path}.")
            continue
        for r, c, n in plan["floor"]:
            _block(actors, cube, floor_m, r + 0.5, c + n / 2, -0.05, 1, n, 0.1, f"Floor {r}:{c}")
        for r, c, n in plan["walls"]:
            _block(actors, cube, wall_m, r + 0.5, c + n / 2, WALL / 2, 1, n, WALL, f"Wall {r}:{c}")
        for d in plan["doors"]:
            _block(actors, cube, locked_m if d["locked"] else door_m, d["y"], d["x"], WALL / 2, 1, 1, WALL, "Locked door" if d["locked"] else "Door", collision=False)
        for m in plan["locks"]:
            _block(actors, cube, locked_m, m["xy"][1], m["xy"][0], 0.3, 0.4, 0.4, 0.4, f"Lock: {m['name']}", collision=False)
        for m in plan["keys"]:
            _block(actors, cube, key_m, m["xy"][1], m["xy"][0], 0.3, 0.4, 0.4, 0.4, f"Key: {m['name']}", collision=False)
        for s in plan["spawns"]:
            point = actors.spawn_actor_from_class(unreal.TargetPoint, _at(s["xy"][0], s["xy"][1], 1))
            point.set_actor_label(f"Spawn: {s['role']}" + (f" ({s['label']})" if s["label"] else "") + (f" x{s['count']}" if s["count"] > 1 else ""))
            _block(actors, cube, spawn_m, s["xy"][1], s["xy"][0], 0.9, 0.5, 0.5, 1.8, f"Spawn marker: {s['role']}", collision=False)
        for l in plan["lights"]:
            light = actors.spawn_actor_from_class(unreal.PointLight, _at(l["xy"][0], l["xy"][1], WALL * 1.25))
            comp = light.point_light_component
            comp.set_attenuation_radius(l["radius"] * CM)
            m = re.fullmatch(r"#?([0-9a-fA-F]{6})", l["color"])
            if m:
                comp.set_light_color(unreal.LinearColor(*(int(m.group(1)[i:i + 2], 16) / 255 for i in (0, 2, 4)), 1))
        actors.spawn_actor_from_class(unreal.DirectionalLight, unreal.Vector(0, 0, 1000)).set_actor_rotation(unreal.Rotator(0, -50, -30), False)
        bounds = actors.spawn_actor_from_class(unreal.NavMeshBoundsVolume, _at(plan["cols"] / 2, plan["rows"] / 2, 0))
        bounds.set_actor_scale3d(unreal.Vector(plan["rows"] * CM / 200, plan["cols"] * CM / 200, WALL * CM / 100))
        levels.save_current_level()
        built.append(path)
    return built


def setup_project(root=None):
    """Copies .editorconfig, .gitattributes and .gitignore from the plan to the project folder when missing."""
    import shutil

    root = root or default_root()
    project = unreal.Paths.convert_relative_path_to_full(unreal.Paths.project_dir())
    done = []
    for name in (".editorconfig", ".gitattributes", ".gitignore"):
        src, dst = os.path.join(root, "Unreal", "ProjectFiles", name), os.path.join(project, name)
        if os.path.isfile(src) and not os.path.exists(dst):
            shutil.copyfile(src, dst)
            done.append(f"Created {name}.")
        elif os.path.exists(dst):
            done.append(f"{name} is there already; kept.")
    setup = core.read_json(os.path.join(root, "Unreal", "ProjectFiles", "setup.json")) or {}
    for f in setup.get("folders", []):
        path = f.get("path", "")
        if path.startswith("/Game/") and ".." not in path and not unreal.EditorAssetLibrary.does_directory_exist(path):
            unreal.EditorAssetLibrary.make_directory(path)
            done.append(f"Created {path}.")
    return done


# ---- Menu actions --------------------------------------------------------------------------------------------------

def _run(action):
    try:
        action()
    except core.BundleError as e:
        unreal.log_error(f"[Planner] {e}")


def after_import(root=None):
    lines = []
    inputs = make_input(root)
    if inputs:
        lines.append(f"Input: {inputs} Enhanced Input asset(s) made.")
    made = make_channels(root)
    if made:
        lines.append(f"Channels: {made} asset(s) made.")
    p = make_placeholders(root)
    if p["made"] or p["filled"]:
        lines.append(f"Placeholders: {p['made']} made, {p['filled']} field(s) filled.")
    return lines


def import_bundle():
    def go():
        r = import_records()
        for p in r["problems"]:
            unreal.log_warning(f"[Planner] {p}")
        log(f"Import: {r['created']} created, {r['updated']} updated, {r['deprecated']} deprecated, {r['tables']} DataTable(s), {len(r['problems'])} problem(s).")
        for line in after_import():
            log(line)
        log(f"Report: {write_report()}")
    _run(go)


def greybox_bundle():
    _run(lambda: log(f"Greybox: {', '.join(build_greybox()) or 'no maps in the export'}."))


def validate_bundle():
    def go():
        issues = validate()
        for i in issues:
            (unreal.log_error if i["level"] == "error" else unreal.log_warning)(f"[Planner] {i['message']}")
        log(f"Validate: {sum(1 for i in issues if i['level'] == 'error')} error(s), {sum(1 for i in issues if i['level'] != 'error')} warning(s).")
    _run(go)


def report_bundle():
    _run(lambda: log(f"Report written to {write_report()}. The planner reads it from the linked folder, or import it there."))


def setup_bundle():
    _run(lambda: [log(line) for line in setup_project()])
