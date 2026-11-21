"""Tests of the Unreal bridge's plain-Python core against a real export. Run by tests/unrealAdapter.test.ts:

    python tests/unrealBridgeCore.py <export folder> <report out path>

Exits 0 when every check passes; writes a report built from a made-up editor state for the TS side to parse.
"""

import json
import os
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "engine-packages", "unreal", "HoHPlannerBridge", "Content", "Python"))

from hoh_planner import core  # noqa: E402

ROOT = sys.argv[1] if len(sys.argv) > 1 else ""
REPORT_OUT = sys.argv[2] if len(sys.argv) > 2 else ""


class Core(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.manifest = core.load_manifest(ROOT)
        cls.types = core.load_types(ROOT)
        cls.item = next(sid for sid, s in cls.types["schemas"].items() if s["cppType"] == "UItemDefinition")

    def test_manifest_and_types(self):
        self.assertEqual(self.manifest["engine"]["id"], "unreal")
        s = self.types["schemas"][self.item]
        self.assertEqual(s["path"], "/Script/PlannerGame.ItemDefinition")
        self.assertEqual(s["fields"]["stackSize"], {"prop": "StackSize", "py": "stack_size", "optional": False, "type": {"k": "int"}})
        self.assertEqual(s["fields"]["name"]["py"], "display_name")
        self.assertEqual(self.types["enums"]["Rarity"]["members"]["common"], "COMMON")
        movement = next(c for c in self.types["input"] if c["category"] == "Movement")
        self.assertEqual(movement["context"], "IMC_Movement")
        jump = next(a for a in movement["actions"] if a["name"] == "Jump")
        self.assertEqual(jump, {"name": "Jump", "asset": "IA_Jump", "keys": ["SpaceBar", "Gamepad_FaceButton_Bottom"]})

    def test_wrong_engine_is_refused(self):
        with tempfile.TemporaryDirectory() as d:
            m = dict(self.manifest, engine={"id": "unity", "adapterVersion": 3})
            with open(os.path.join(d, core.MANIFEST), "w", encoding="utf-8") as f:
                json.dump(m, f)
            with self.assertRaisesRegex(core.BundleError, "made for unity"):
                core.load_manifest(d)

    def test_record_values(self):
        records = core.native_records(ROOT, self.manifest)
        plank = next(r for s, r in records if r.get("id") == "item.plank")
        sets, problems = core.plan_record(plank, self.types["schemas"][self.item], self.types)
        d = dict(sets)
        self.assertEqual(d["planner_id"], ("plain", plank["plannerId"]))
        self.assertEqual(d["id"], ("plain", "item.plank"))
        self.assertEqual(d["display_name"], ("plain", "Plank"))
        self.assertEqual(d["rarity"][0], "enum")
        self.assertEqual(d["rarity"][1][0], "Rarity")
        self.assertEqual(problems, [])

    def test_value_conversions(self):
        t = self.types
        self.assertEqual(core.plan_value("#ffffff", {"k": "color"}, t), (("color", (1.0, 1.0, 1.0, 1.0)), None))
        self.assertAlmostEqual(core.plan_value("#808080", {"k": "color"}, t)[0][1][0], 0.215861, places=5)
        self.assertEqual(core.plan_value([1, 2], {"k": "vec2"}, t), (("vector", (1.0, 2.0)), None))
        self.assertIs(core.plan_value([1], {"k": "vec3"}, t)[0], core.KEEP)
        self.assertIs(core.plan_value("icons/plank.png", {"k": "asset", "asset": "image"}, t)[0], core.KEEP)
        self.assertEqual(core.plan_value("/Game/Art/Plank", {"k": "asset", "asset": "image"}, t)[0], ("asset", "/Game/Art/Plank"))
        self.assertEqual(core.plan_value("/Game/BP_Door", {"k": "asset", "asset": "scene"}, t)[0], ("class", "/Game/BP_Door"))
        self.assertEqual(core.plan_value(None, {"k": "int"}, t), (core.KEEP, None))
        self.assertEqual(core.plan_value("3", {"k": "int"}, t), (("plain", 3), None))
        self.assertEqual(core.plan_value("nope", {"k": "enum", "enum": "Rarity"}, t)[1], "“nope” is not a value of the enum")
        self.assertEqual(core.plan_value(["item.plank"], {"k": "list", "of": {"k": "ref", "schema": self.item, "asAsset": True}}, t)[0], ("list", [("record", (self.item, "item.plank"))]))
        self.assertEqual(core.asset_name("item.iron_sword"), "item_iron_sword")

    def test_validate_and_report(self):
        planned = core.planned_native(ROOT, self.manifest)
        self.assertGreater(len(planned), 0)
        self.assertEqual(len([i for i in core.validate(ROOT, self.manifest, self.types, {}) if "no asset" in i["message"]]), len(planned))
        # One asset made, with an empty required field; one deprecated.
        sid, r = planned[0]
        fields = self.types["schemas"][sid]["fields"]
        values = {f["py"]: (None if i == 0 else "x") for i, f in enumerate(fields.values())}
        state = {
            r["plannerId"]: {"key": r["key"], "schema": sid, "path": "/Game/HoHPlanner/Records/X/a", "deprecated": False, "values": values},
            "gone": {"key": "item.gone", "schema": sid, "path": "/Game/HoHPlanner/Records/X/gone", "deprecated": True, "values": {}},
        }
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as f:
            json.dump({"metrics": [{"key": "combat.deaths_per_hour", "samples": 4, "sum": 2.0, "min": 0.2, "max": 0.9, "build": "0.3"}]}, f)
            metrics = f.name
        report = core.build_report(ROOT, self.manifest, self.types, state, "5.5.1-0+UE5", metrics)
        os.unlink(metrics)
        by = {x["plannerId"]: x for x in report["records"]}
        first = by[r["plannerId"]]
        self.assertEqual(first["status"], "incomplete" if not list(fields.values())[0]["optional"] else first["status"])
        self.assertEqual(by["gone"]["status"], "deprecated")
        self.assertEqual(by[planned[1][1]["plannerId"]]["status"], "missing")
        self.assertTrue(any(x["assetPath"].startswith("/Game/HoHPlanner/DataTables/DT_") for x in report["records"] if "assetPath" in x))
        self.assertEqual(report["metrics"], [{"key": "combat.deaths_per_hour", "value": 0.5, "samples": 4, "min": 0.2, "max": 0.9, "build": "0.3"}])
        health = next(c for c in report["classes"] if c["name"] == "Health")
        self.assertEqual(health["status"], "stub")
        self.assertEqual(health["methods"], 2)
        self.assertEqual(next(c for c in report["classes"] if c["name"] == "IDamageable")["status"], "implemented")
        if REPORT_OUT:
            with open(REPORT_OUT, "w", encoding="utf-8") as f:
                json.dump(report, f)


class Ideas(unittest.TestCase):
    """The ideas of § 7 on Unreal, without the editor: data checks, telemetry, placeholder PNGs, the greybox plan."""

    @classmethod
    def setUpClass(cls):
        from hoh_planner import ideas

        cls.ideas = ideas
        cls.types = core.load_types(ROOT)
        cls.enemy = next(sid for sid, s in cls.types["schemas"].items() if s["cppType"] == "UEnemyDefinition")

    def test_evaluates_formulas_like_the_planner(self):
        ev = self.ideas.evaluate
        node = {"k": "call", "fn": "ceil", "args": [{"k": "bin", "op": "/", "a": {"k": "var", "name": "health"}, "b": {"k": "num", "v": 40}}]}
        self.assertEqual(ev(node, {"health": 1229}), 31)
        self.assertIsNone(ev(node, {"health": None}))
        self.assertEqual(ev({"k": "call", "fn": "round", "args": [{"k": "num", "v": -2.5}]}, {}), -2)
        self.assertEqual(ev({"k": "bin", "op": "/", "a": {"k": "num", "v": 1}, "b": {"k": "num", "v": 0}}, {}), float("inf"))

    def test_runs_the_balance_plan_checks_on_assets(self):
        state = {
            "p1": {"key": "enemy.brute", "schema": self.enemy, "path": "/Game/x", "deprecated": False, "values": {"health": 150, "damage": 15}},
            "p2": {"key": "enemy.warden", "schema": self.enemy, "path": "/Game/y", "deprecated": False, "values": {"health": 1966, "damage": 131}},
            "p3": {"key": "enemy.glass", "schema": self.enemy, "path": "/Game/z", "deprecated": False, "values": {"health": 10, "damage": 10}},
        }
        issues = self.ideas.run_checks(ROOT, self.types, state)
        by = {i["message"].split(" (")[0]: i for i in issues}
        self.assertEqual(by["Enemy toughness"]["level"], "error")
        self.assertIn("enemy.glass = 1", by["Enemy toughness"]["message"])
        self.assertNotIn("enemy.brute", by["Enemy toughness"]["message"])
        self.assertEqual(by["Hits to kill with a 40-damage weapon"]["level"], "warning")
        self.assertIn("enemy.warden = 50", by["Hits to kill with a 40-damage weapon"]["message"])

    def test_adds_telemetry_up(self):
        with tempfile.NamedTemporaryFile("w", suffix=".jsonl", delete=False, encoding="utf-8") as f:
            f.write('{"event":"enemy_killed","build":"0.3","seconds":4,"enemy":"e"}\n{"event":"enemy_killed","seconds":6.5}\nbroken\n{"event":"player_died","day":3,"ok":true}\n')
            path = f.name
        m = {x["key"]: x for x in self.ideas.telemetry_metrics(path)}
        os.unlink(path)
        self.assertEqual(sorted(m), ["enemy_killed.count", "enemy_killed.seconds", "player_died.count", "player_died.day"])
        self.assertEqual(m["enemy_killed.count"]["value"], 2)
        self.assertEqual(m["enemy_killed.seconds"]["value"], 5.25)
        self.assertEqual(m["enemy_killed.seconds"]["build"], "0.3")
        merged = self.ideas.merge_metrics([{"key": "enemy_killed.count", "value": 99}], list(m.values()))
        self.assertEqual(next(x for x in merged if x["key"] == "enemy_killed.count")["value"], 99)

    def test_draws_a_valid_png_with_initials(self):
        import struct
        import zlib

        self.assertEqual(self.ideas.initials("item.iron_sword"), "IS")
        self.assertEqual(self.ideas.initials("item.plank"), "PL")
        data = self.ideas.png((40, 40, 80), "IS")
        self.assertEqual(data[:8], b"\x89PNG\r\n\x1a\n")
        width, height = struct.unpack(">II", data[16:24])
        self.assertEqual((width, height), (64, 64))
        length = struct.unpack(">I", data[33:37])[0]
        self.assertEqual(data[37:41], b"IDAT")
        raw = zlib.decompress(data[41:41 + length])
        self.assertEqual(len(raw), 64 * (1 + 64 * 3))
        self.assertIn(b"\xff\xff\xff", raw, "white initials on a dark colour")
        self.assertEqual(self.ideas.palette(ROOT)[0], (0x2B, 0x21, 0x35))

    def test_plans_a_greybox_from_a_map(self):
        self.assertEqual(self.ideas.decode_rle("3ABb", 5), [0, 0, 0, 1, 27])
        with self.assertRaises(ValueError):
            self.ideas.decode_rle("3A", 5)
        crypt = next(core.read_json(os.path.join(ROOT, "Maps", f)) for f in sorted(os.listdir(os.path.join(ROOT, "Maps"))) if core.read_json(os.path.join(ROOT, "Maps", f))["name"] == "The Old Crypt")
        plan = self.ideas.greybox_plan(crypt)
        self.assertGreater(len(plan["floor"]), 0)
        self.assertGreater(len(plan["walls"]), 0)
        self.assertTrue(all(n >= 1 for _, _, n in plan["floor"]))
        self.assertTrue(any(d["locked"] for d in plan["doors"]))
        self.assertEqual(len(plan["lights"]), 21)
        self.assertEqual(plan["spawns"][0]["role"], "boss")


if __name__ == "__main__":
    result = unittest.main(argv=[sys.argv[0]], exit=False, verbosity=1).result
    sys.exit(0 if result.wasSuccessful() else 1)
