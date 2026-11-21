"""The integration ideas of the planner's engine plan (§ 7) for Unreal, the parts that need no editor: the Balance plan's
data checks, the telemetry log added up into metrics, placeholder textures (PNG with the record's initials) and the
plan of a greybox level from a location map. editor.py turns them into assets and actors. Plain Python, tested so.
"""

import json
import math
import os
import re
import struct
import zlib

from . import core

# ---- Data checks ----------------------------------------------------------------------------------------------

_FUNCS = {
    "min": min,
    "max": max,
    "sqrt": math.sqrt,
    "abs": abs,
    "floor": math.floor,
    "ceil": math.ceil,
    # The planner rounds halves up (2.5 → 3, -2.5 → -2).
    "round": lambda x: math.floor(x + 0.5),
    "pow": pow,
    "log": math.log,
}


def evaluate(node, values):
    """A formula tree of the engine IR (formulaAst) with the record's numbers; None when a value is missing."""
    k = node.get("k")
    if k == "num":
        return float(node["v"])
    if k == "var":
        v = values.get(node["name"])
        return float(v) if isinstance(v, (int, float)) and not isinstance(v, bool) else None
    if k == "neg":
        a = evaluate(node["a"], values)
        return None if a is None else -a
    if k == "call":
        args = [evaluate(a, values) for a in node["args"]]
        if any(a is None for a in args) or node["fn"] not in _FUNCS:
            return None
        try:
            return float(_FUNCS[node["fn"]](*args))
        except (ValueError, OverflowError):
            return math.nan
    if k == "bin":
        a, b = evaluate(node["a"], values), evaluate(node["b"], values)
        if a is None or b is None:
            return None
        op = node["op"]
        try:
            return a + b if op == "+" else a - b if op == "-" else a * b if op == "*" else a / b if op == "/" else a ** b
        except ZeroDivisionError:
            return math.inf if a != 0 else math.nan
        except OverflowError:
            return math.inf
    return None


def run_checks(root, types, state):
    """The Balance plan's data checks (ir/engine-ir.json) on the record assets. state as core.validate gets it, with
    each asset's values by Python property name. Returns issues like core.validate's."""
    ir = core.read_json(os.path.join(root, "ir", "engine-ir.json")) or {}
    issues = []
    for c in ir.get("checks", []):
        if c.get("error") or not c.get("ast"):
            continue
        fields = types["schemas"].get(c.get("schema"), {}).get("fields", {})
        if types["schemas"].get(c.get("schema"), {}).get("format") != "native":
            continue
        outside = []
        for a in state.values():
            if a.get("schema") != c["schema"] or a.get("deprecated"):
                continue
            values = {planner: a["values"].get(f["py"]) for planner, f in fields.items()}
            v = evaluate(c["ast"], values)
            if v is None:
                continue
            if math.isnan(v) or math.isinf(v) or ("min" in c and v < c["min"]) or ("max" in c and v > c["max"]):
                outside.append(f"{a['key']} = {round(v, 4):g}")
        if outside:
            span = f"{c.get('min', '−∞')}–{c.get('max', '∞')}"
            issues.append({"level": c.get("level", "error"), "key": "", "path": "", "message": f"{c['name']} ({c['expr']}) outside {span}: {', '.join(outside)}"})
    return issues


# ---- Telemetry --------------------------------------------------------------------------------------------------

def telemetry_metrics(path):
    """Saved/hoh-telemetry.jsonl as report metrics: <event>.count (how many lines) and the mean of each number parameter."""
    sums = {}
    if not path or not os.path.isfile(path):
        return []

    def add(key, v, build):
        m = sums.setdefault(key, {"samples": 0, "sum": 0.0, "min": v, "max": v, "build": ""})
        m["samples"] += 1
        m["sum"] += v
        m["min"] = min(m["min"], v)
        m["max"] = max(m["max"], v)
        if build:
            m["build"] = build

    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                o = json.loads(line)
            except ValueError:
                continue
            ev = o.get("event") if isinstance(o, dict) else None
            if not ev:
                continue
            build = str(o.get("build") or "")
            add(f"{ev}.count", 1.0, build)
            for k, v in o.items():
                if k in ("event", "t", "session", "build") or isinstance(v, bool) or not isinstance(v, (int, float)):
                    continue
                add(f"{ev}.{k}", float(v), build)
    out = []
    for key in sorted(sums):
        m = sums[key]
        count = key.endswith(".count")
        e = {"key": key, "value": float(m["samples"]) if count else m["sum"] / m["samples"], "samples": m["samples"]}
        if not count:
            e["min"], e["max"] = m["min"], m["max"]
        if m["build"]:
            e["build"] = m["build"]
        out.append(e)
    return out


def merge_metrics(planner_metrics, telemetry):
    """PlannerMetrics-style metrics first; telemetry only for keys they do not have."""
    seen = {m["key"] for m in planner_metrics}
    return sorted(planner_metrics + [m for m in telemetry if m["key"] not in seen], key=lambda m: m["key"])


# ---- Placeholders -----------------------------------------------------------------------------------------------

GLYPHS = {
    "A": ["###", "#.#", "###", "#.#", "#.#"], "B": ["##.", "#.#", "##.", "#.#", "##."], "C": ["###", "#..", "#..", "#..", "###"],
    "D": ["##.", "#.#", "#.#", "#.#", "##."], "E": ["###", "#..", "##.", "#..", "###"], "F": ["###", "#..", "##.", "#..", "#.."],
    "G": ["###", "#..", "#.#", "#.#", "###"], "H": ["#.#", "#.#", "###", "#.#", "#.#"], "I": ["###", ".#.", ".#.", ".#.", "###"],
    "J": ["..#", "..#", "..#", "#.#", "###"], "K": ["#.#", "#.#", "##.", "#.#", "#.#"], "L": ["#..", "#..", "#..", "#..", "###"],
    "M": ["#.#", "###", "###", "#.#", "#.#"], "N": ["##.", "#.#", "#.#", "#.#", "#.#"], "O": ["###", "#.#", "#.#", "#.#", "###"],
    "P": ["###", "#.#", "###", "#..", "#.."], "Q": ["###", "#.#", "#.#", "###", "..#"], "R": ["##.", "#.#", "##.", "#.#", "#.#"],
    "S": ["###", "#..", "###", "..#", "###"], "T": ["###", ".#.", ".#.", ".#.", ".#."], "U": ["#.#", "#.#", "#.#", "#.#", "###"],
    "V": ["#.#", "#.#", "#.#", "#.#", ".#."], "W": ["#.#", "#.#", "###", "###", "#.#"], "X": ["#.#", "#.#", ".#.", "#.#", "#.#"],
    "Y": ["#.#", "#.#", ".#.", ".#.", ".#."], "Z": ["###", "..#", ".#.", "#..", "###"], "0": ["###", "#.#", "#.#", "#.#", "###"],
    "1": [".#.", "##.", ".#.", ".#.", "###"], "2": ["###", "..#", "###", "#..", "###"], "3": ["###", "..#", "###", "..#", "###"],
    "4": ["#.#", "#.#", "###", "..#", "..#"], "5": ["###", "#..", "###", "..#", "###"], "6": ["###", "#..", "###", "#.#", "###"],
    "7": ["###", "..#", "..#", "..#", "..#"], "8": ["###", "#.#", "###", "#.#", "###"], "9": ["###", "#.#", "###", "..#", "###"],
}


def initials(key):
    """item.iron_sword → IS, item.plank → PL."""
    last = key.split(".")[-1]
    words = [w for w in re.split(r"[_\- ]", last) if w]
    return (words[0][0] + words[1][0] if len(words) >= 2 else last[:2]).upper()


def _fnv(s):
    h = 2166136261
    for b in s.encode("utf-8"):
        h = ((h ^ b) * 16777619) & 0xFFFFFFFF
    return h


def palette(root):
    ir = core.read_json(os.path.join(root, "ir", "engine-ir.json")) or {}
    out = []
    for c in (ir.get("art") or {}).get("palette", []):
        m = re.fullmatch(r"#?([0-9a-fA-F]{6})", str(c))
        if m:
            out.append(tuple(int(m.group(1)[i:i + 2], 16) for i in (0, 2, 4)))
    return out


def color_for(schema, key, colors):
    """A palette colour per schema (8-bit RGB), a little lighter or darker per record."""
    import colorsys

    if colors:
        r, g, b = colors[_fnv(schema) % len(colors)]
        h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
    else:
        h, s, v = (_fnv(schema) % 360) / 360, 0.55, 0.8
    v = min(0.95, max(0.2, v + ((_fnv(key) % 7) - 3) * 0.06))
    return tuple(round(c * 255) for c in colorsys.hsv_to_rgb(h, s, v))


def png(color, text, size=64):
    """A square PNG: the colour, a darker border and the initials in black or white, whichever reads better."""
    border = tuple(round(c * 0.55) for c in color)
    ink = (20, 20, 26) if (0.299 * color[0] + 0.587 * color[1] + 0.114 * color[2]) / 255 > 0.55 else (255, 255, 255)
    px = [[border if x < 3 or y < 3 or x >= size - 3 or y >= size - 3 else color for x in range(size)] for y in range(size)]
    scale = 5
    left = (size - (len(text) * 4 * scale - scale)) // 2
    top = (size - 5 * scale) // 2
    for i, ch in enumerate(text):
        for r, row in enumerate(GLYPHS.get(ch, [])):
            for c, cell in enumerate(row):
                if cell != "#":
                    continue
                for dy in range(scale):
                    for dx in range(scale):
                        x, y = left + (i * 4 + c) * scale + dx, top + r * scale + dy
                        if 0 <= x < size and 0 <= y < size:
                            px[y][x] = ink
    raw = b"".join(b"\x00" + bytes(v for p in row for v in p) for row in px)

    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)

    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")


# ---- Greybox ----------------------------------------------------------------------------------------------------

LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"


def decode_rle(rle, length):
    """The hoh-location grid format: a value is one letter A–z, a run its length then the letter."""
    out, count = [], ""
    for ch in rle or "":
        if ch.isdigit():
            count += ch
            continue
        v = LETTERS.find(ch)
        if v < 0:
            raise ValueError(f"“{ch}” is not a grid value")
        out.extend([v] * (int(count) if count else 1))
        count = ""
        if len(out) > length:
            raise ValueError("the grid is longer than its size")
    if len(out) != length:
        raise ValueError("the grid is shorter than its size")
    return out


def _runs(cells, cols, rows):
    """Cells as horizontal runs (row, first column, length), so a level needs one block per run, not per cell."""
    runs = []
    for r in range(rows):
        c = 0
        while c < cols:
            if (c, r) in cells:
                start = c
                while c < cols and (c, r) in cells:
                    c += 1
                runs.append((r, start, c - start))
            else:
                c += 1
    return runs


def greybox_plan(location):
    """What a greybox of a hoh-location map holds, in cells (1 cell = 1 m): floor and wall runs, door cells (locked
    or not), lock and key markers, spawns and lights at cell coordinates (x right, y down)."""
    nav = location.get("nav") or {}
    cell, cols, rows = float(nav.get("cell") or 0), int(nav.get("cols") or 0), int(nav.get("rows") or 0)
    if cell <= 0 or cols <= 0 or rows <= 0:
        raise ValueError("no nav grid")
    cost = decode_rle(nav.get("cost"), cols * rows)
    tags = decode_rle(nav.get("tags"), cols * rows)

    def walkable(c, r):
        return 0 <= c < cols and 0 <= r < rows and cost[r * cols + c] > 0

    floor, walls = set(), set()
    for r in range(rows):
        for c in range(cols):
            if walkable(c, r):
                floor.add((c, r))
            elif walkable(c - 1, r) or walkable(c + 1, r) or walkable(c, r - 1) or walkable(c, r + 1):
                walls.add((c, r))
    doors = [{"x": c + 0.5, "y": r + 0.5, "locked": bool(tags[r * cols + c] & 4)} for r in range(rows) for c in range(cols) if tags[r * cols + c] & 2]

    def at(o):
        return float(o.get("x", 0)) / cell, float(o.get("y", 0)) / cell

    return {
        "name": str(location.get("name") or "Map"),
        "cols": cols,
        "rows": rows,
        "floor": _runs(floor, cols, rows),
        "walls": _runs(walls, cols, rows),
        "doors": doors,
        "locks": [{"name": str(l.get("lock", "")), "xy": at(l)} for l in location.get("locks", [])],
        "keys": [{"name": str(k.get("key", "")), "xy": at(k)} for k in location.get("keys", [])],
        "spawns": [{"role": str(s.get("role", "spawn")), "label": str(s.get("label") or ""), "count": int(s.get("count") or 1), "xy": at(s)} for s in location.get("spawns", [])],
        "lights": [{"xy": at(l), "radius": max(1.0, float(l.get("radius") or cell * 4) / cell), "color": str(l.get("color") or "#ffffff"), "intensity": float(l.get("intensity") or 1)} for l in location.get("lights", [])],
    }


# ---- Architecture guard -----------------------------------------------------------------------------------------

_INCLUDE = re.compile(r'^\s*#\s*include\s*[<"]([^">]+)[">]', re.M)


def check_architecture(root):
    """Unreal/ProjectFiles/architecture.json: a header or source file in one module's class folder may not include a class
    header of a planned module its Depends on (Architecture › Modules) does not allow. Returns issues like
    core.validate's."""
    code = os.path.join(root, "Unreal")
    plan = core.read_json(os.path.join(code, "ProjectFiles", "architecture.json")) or {}
    modules = plan.get("modules", [])
    issues = []
    for m in modules:
        allowed = set(m.get("allows", []))
        others = [o for o in modules if o["name"] != m["name"] and o["name"] not in allowed]
        for folder in m.get("folders", []):
            base = os.path.join(code, folder)
            for dirpath, _dirs, files in os.walk(base):
                for name in sorted(files):
                    if not name.endswith((".h", ".hpp", ".cpp", ".inl")):
                        continue
                    path = os.path.join(dirpath, name)
                    with open(path, encoding="utf-8", errors="replace") as f:
                        includes = [i.replace("\\", "/") for i in _INCLUDE.findall(f.read())]
                    used = []
                    for o in others:
                        tokens = set(o.get("tokens", []))
                        hit = next((i for i in includes if i.rsplit("/", 1)[-1] in tokens), None)
                        if hit:
                            used.append(f"{o['name']} ({hit})")
                    if used:
                        rel = os.path.relpath(path, code).replace("\\", "/")
                        issues.append({"level": "error", "key": "", "path": rel, "message": f"{name} (module {m['name']}) includes {', '.join(used)}, which its Depends on does not allow. Change the code, or the module's Depends on in the plan."})
    return issues
