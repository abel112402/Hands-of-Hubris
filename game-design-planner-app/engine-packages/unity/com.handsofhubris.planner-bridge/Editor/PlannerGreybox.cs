using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.SceneManagement;

namespace HoHPlanner.Bridge.Editor
{
    public sealed class GreyboxResult
    {
        public readonly List<string> Scenes = new List<string>();
        public readonly List<string> Notes = new List<string>();

        public override string ToString() => $"{Scenes.Count} greybox scene(s)" + (Notes.Count > 0 ? ": " + string.Join(" ", Notes) : "");
    }

    /// <summary>
    /// A walkable prototype of every planned location (the export's Maps/*.json, format hoh-location): one scene per map
    /// in &lt;root&gt;/Greybox/ with a floor where the map is walkable, 2 m walls around it, doors (red when locked), keys,
    /// spawn points and lights, at one Unity unit per nav cell. With the AI Navigation package the NavMesh is baked too.
    /// The scenes are generated: building them again replaces them, so work in a copy.
    /// </summary>
    public static class PlannerGreybox
    {
        public const string Folder = "Greybox";
        public const string Format = "hoh-location";
        internal const float WallHeight = 2f;
        private const string Letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

        [MenuItem("Tools/Game Design Planner/Build greybox scenes", priority = 40)]
        public static void Menu()
        {
            var r = Build(PlannerBridgeSettings.instance.Root);
            Debug.Log($"[Planner bridge] Greybox: {r}");
            if (r.Scenes.Count > 0) EditorGUIUtility.PingObject(AssetDatabase.LoadAssetAtPath<SceneAsset>(r.Scenes[0]));
        }

        public static GreyboxResult Build(string root)
        {
            var result = new GreyboxResult();
            var maps = $"{root}/Maps";
            if (!Directory.Exists(maps))
            {
                result.Notes.Add("The export has no maps (Maps/): draw a location map in the planner and export again.");
                return result;
            }
            // Each scene is built on its own; the scenes open now come back afterwards (in the editor, unsaved changes are offered for saving first).
            var setup = EditorSceneManager.GetSceneManagerSetup();
            if (!Application.isBatchMode && !EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo())
            {
                result.Notes.Add("Cancelled: the open scenes have unsaved changes.");
                return result;
            }
            try
            {
                Each(root, maps, result);
            }
            finally
            {
                if (setup.Length > 0 && setup.All(s => !string.IsNullOrEmpty(s.path))) EditorSceneManager.RestoreSceneManagerSetup(setup);
                else EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            }
            AssetDatabase.SaveAssets();
            return result;
        }

        private static void Each(string root, string maps, GreyboxResult result)
        {
            foreach (var file in Directory.GetFiles(maps, "*.json").OrderBy(f => f, StringComparer.Ordinal))
            {
                JObject map;
                try
                {
                    map = JObject.Parse(File.ReadAllText(file));
                }
                catch (Newtonsoft.Json.JsonException)
                {
                    result.Notes.Add($"{Path.GetFileName(file)} is not valid JSON.");
                    continue;
                }
                if ((string)map["format"] != Format) continue;
                try
                {
                    result.Scenes.Add(BuildOne(root, map));
                }
                catch (Exception e) when (e is FormatException || e is InvalidDataException || e is ArgumentException)
                {
                    result.Notes.Add($"{(string)map["name"] ?? Path.GetFileName(file)}: {e.Message}");
                }
            }
        }

        /// <summary>Decodes a run-length encoded grid of the hoh-location format (a value is one letter A–z, a run its length then the letter).</summary>
        public static byte[] DecodeRle(string rle, int length)
        {
            var output = new byte[length];
            var at = 0;
            var count = 0;
            foreach (var ch in rle ?? "")
            {
                if (ch >= '0' && ch <= '9')
                {
                    count = count * 10 + (ch - '0');
                    continue;
                }
                var v = Letters.IndexOf(ch);
                if (v < 0) throw new InvalidDataException($"“{ch}” is not a grid value");
                var n = count > 0 ? count : 1;
                count = 0;
                if (at + n > length) throw new InvalidDataException("the grid is longer than its size");
                for (var i = 0; i < n; i++) output[at++] = (byte)v;
            }
            if (at != length) throw new InvalidDataException("the grid is shorter than its size");
            return output;
        }

        internal static string Safe(string s) => string.Join("_", (string.IsNullOrWhiteSpace(s) ? "Map" : s.Trim()).Split(Path.GetInvalidFileNameChars().Concat(new[] { ' ' }).ToArray(), StringSplitOptions.RemoveEmptyEntries));

        private static string BuildOne(string root, JObject map)
        {
            var name = Safe((string)map["name"]);
            var grid = Grid.Read(map);
            var cell = grid.Cell;
            Vector3 At(float x, float y, float height = 0) => new Vector3(x / cell, height, -y / cell);

            var dir = $"{root}/{Folder}";
            Directory.CreateDirectory(dir);
            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            {
                var top = new GameObject($"Greybox {map["name"]}");
                SceneManager.MoveGameObjectToScene(top, scene);
                var palette = PlannerPlaceholders.Palette(root);
                Color Pick(int i, Color fallback) => palette.Count > i ? palette[i] : fallback;
                var level = new LevelStyle
                {
                    Floor = Material(dir, "Floor", Pick(3, new Color(0.7f, 0.7f, 0.7f))),
                    Wall = Material(dir, "Wall", Pick(0, new Color(0.35f, 0.35f, 0.4f))),
                    Door = Material(dir, "Door", DoorColor),
                    LockedDoor = Material(dir, "LockedDoor", LockedColor),
                    Key = Material(dir, "Key", KeyColor),
                    SaveMesh = (mesh, part) =>
                    {
                        var assetPath = $"{dir}/{name}_{part}.asset";
                        AssetDatabase.DeleteAsset(assetPath);
                        AssetDatabase.CreateAsset(mesh, assetPath);
                        return mesh;
                    },
                };
                Geometry(top, grid, level, 1f);
                var markers = Markers(top, map, level, 1f / cell);
                var cols = grid.Cols;
                var rows = grid.Rows;
                var spawnMat = Material(dir, "Spawn", Pick(1, new Color(0.95f, 0.6f, 0.3f)));
                Vector3? entrance = null;
                foreach (var s in (map["spawns"] as JArray ?? new JArray()).OfType<JObject>())
                {
                    var role = (string)s["role"] ?? "spawn";
                    var label = (string)s["label"];
                    var pos = At((float)s["x"], (float)s["y"], 1f);
                    Primitive(PrimitiveType.Capsule, markers, $"Spawn: {role}" + (string.IsNullOrEmpty(label) ? "" : $" ({label})") + ((int?)s["count"] > 1 ? $" ×{(int)s["count"]}" : ""), pos, Vector3.one, spawnMat, false);
                    if (entrance == null || role == "entrance" || role == "player") entrance = pos;
                }

                Lights(top, map, 1f / cell, WallHeight * 1.25f);
                var sun = new GameObject("Sun");
                sun.transform.SetParent(top.transform, false);
                sun.transform.rotation = Quaternion.Euler(50, -30, 0);
                sun.AddComponent<Light>().type = LightType.Directional;
                var cam = new GameObject("Main Camera") { tag = "MainCamera" };
                cam.transform.SetParent(top.transform, false);
                var look = entrance ?? new Vector3(cols / 2f, 0, -rows / 2f);
                cam.transform.position = look + new Vector3(0, 12, -8);
                cam.transform.LookAt(look);
                cam.AddComponent<Camera>();

                BakeNavMesh(top, $"{dir}/{name}_NavMesh.asset");
                var path = $"{dir}/{name}.unity";
                if (!EditorSceneManager.SaveScene(scene, path)) throw new ArgumentException($"could not save {path}");
                return path;
            }
        }

        internal static readonly Color DoorColor = new Color(0.55f, 0.36f, 0.2f);
        internal static readonly Color LockedColor = new Color(0.8f, 0.15f, 0.15f);
        internal static readonly Color KeyColor = new Color(0.95f, 0.8f, 0.2f);

        /// <summary>The walkability grid of a hoh-location map.</summary>
        internal sealed class Grid
        {
            public float Cell;
            public int Cols, Rows;
            public byte[] Cost, Tags;

            public bool Walkable(int c, int r) => c >= 0 && r >= 0 && c < Cols && r < Rows && Cost[r * Cols + c] > 0;

            public static Grid Read(JObject map)
            {
                var nav = (JObject)map["nav"] ?? throw new InvalidDataException("no nav grid");
                var g = new Grid { Cell = (float)nav["cell"], Cols = (int)nav["cols"], Rows = (int)nav["rows"] };
                if (g.Cell <= 0 || g.Cols <= 0 || g.Rows <= 0) throw new InvalidDataException("empty nav grid");
                g.Cost = DecodeRle((string)nav["cost"], g.Cols * g.Rows);
                g.Tags = DecodeRle((string)nav["tags"], g.Cols * g.Rows);
                return g;
            }
        }

        /// <summary>Materials of a level, and how its meshes are saved (the mesh and the part's name in, the saved mesh out).</summary>
        internal sealed class LevelStyle
        {
            public Material Floor, Wall, Door, LockedDoor, Key;
            public Func<Mesh, string, Mesh> SaveMesh;
        }

        /// <summary>
        /// Floor (walkable cells), 2 m walls around it and doors (trigger frames you can walk through; red when locked), at
        /// <paramref name="metresPerCell"/> metres per nav cell: x east, map y south (−z). Heights stay in metres.
        /// </summary>
        internal static void Geometry(GameObject top, Grid g, LevelStyle style, float metresPerCell)
        {
            var s = metresPerCell;
            var floor = new MeshBuilder();
            var walls = new MeshBuilder();
            for (var r = 0; r < g.Rows; r++)
                for (var c = 0; c < g.Cols; c++)
                {
                    if (g.Walkable(c, r)) floor.Quad(new Vector3(c * s, 0, (-r - 1) * s), new Vector3((c + 1) * s, 0, -r * s));
                    else if (g.Walkable(c - 1, r) || g.Walkable(c + 1, r) || g.Walkable(c, r - 1) || g.Walkable(c, r + 1)) walls.Box(new Vector3(c * s, 0, (-r - 1) * s), new Vector3((c + 1) * s, WallHeight, -r * s));
                }
            AddMesh(top, "Floor", style.SaveMesh(floor.Build(), "Floor"), style.Floor);
            AddMesh(top, "Walls", style.SaveMesh(walls.Build(), "Walls"), style.Wall);

            var doors = Child(top, "Doors");
            for (var r = 0; r < g.Rows; r++)
                for (var c = 0; c < g.Cols; c++)
                {
                    var t = g.Tags[r * g.Cols + c];
                    if ((t & 2) == 0) continue;
                    var locked = (t & 4) != 0;
                    var door = Primitive(PrimitiveType.Cube, doors, locked ? "Locked door" : "Door", new Vector3((c + 0.5f) * s, WallHeight / 2, (-r - 0.5f) * s), new Vector3(s, WallHeight, s), locked ? style.LockedDoor : style.Door);
                    door.GetComponent<Collider>().isTrigger = true;
                }
        }

        /// <summary>A "Markers" object with the map's locks and keys (no colliders), at <paramref name="metresPerUnit"/>.</summary>
        internal static GameObject Markers(GameObject top, JObject map, LevelStyle style, float metresPerUnit)
        {
            Vector3 At(float x, float y, float height) => new Vector3(x * metresPerUnit, height, -y * metresPerUnit);
            var markers = Child(top, "Markers");
            foreach (var l in (map["locks"] as JArray ?? new JArray()).OfType<JObject>())
                Primitive(PrimitiveType.Cube, markers, $"Lock: {(string)l["lock"]}", At((float)l["x"], (float)l["y"], 0.5f), Vector3.one * 0.4f, style.LockedDoor, false);
            foreach (var k in (map["keys"] as JArray ?? new JArray()).OfType<JObject>())
                Primitive(PrimitiveType.Cube, markers, $"Key: {(string)k["key"]}", At((float)k["x"], (float)k["y"], 0.5f), Vector3.one * 0.4f, style.Key, false);
            return markers;
        }

        /// <summary>A point light for each light of the map, its radius in map units scaled to metres.</summary>
        internal static GameObject Lights(GameObject top, JObject map, float metresPerUnit, float height)
        {
            var lights = Child(top, "Lights");
            foreach (var l in (map["lights"] as JArray ?? new JArray()).OfType<JObject>())
            {
                var go = new GameObject("Light");
                go.transform.SetParent(lights.transform, false);
                go.transform.position = new Vector3((float)l["x"] * metresPerUnit, height, -(float)l["y"] * metresPerUnit);
                var light = go.AddComponent<Light>();
                light.type = LightType.Point;
                light.range = Mathf.Max(1f, (float?)l["radius"] * metresPerUnit ?? 4f);
                light.intensity = Mathf.Max(0.5f, (float?)l["intensity"] ?? 1f);
                if (ColorUtility.TryParseHtmlString((string)l["color"] ?? "", out var color)) light.color = color;
            }
            return lights;
        }

        internal static GameObject Child(GameObject parent, string name)
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent.transform, false);
            return go;
        }

        internal static GameObject Primitive(PrimitiveType type, GameObject parent, string name, Vector3 position, Vector3 scale, Material material, bool collider = true)
        {
            var go = GameObject.CreatePrimitive(type);
            go.name = name;
            go.transform.SetParent(parent.transform, false);
            go.transform.position = position;
            go.transform.localScale = scale;
            if (material != null) go.GetComponent<Renderer>().sharedMaterial = material;
            if (!collider) UnityEngine.Object.DestroyImmediate(go.GetComponent<Collider>());
            return go;
        }

        private static void AddMesh(GameObject parent, string name, Mesh mesh, Material material)
        {
            var go = Child(parent, name);
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            go.AddComponent<MeshRenderer>().sharedMaterial = material;
            go.AddComponent<MeshCollider>().sharedMesh = mesh;
            GameObjectUtility.SetStaticEditorFlags(go, StaticEditorFlags.NavigationStatic | StaticEditorFlags.BatchingStatic);
        }

        private static Material Material(string dir, string name, Color color) => PlannerPlaceholders.MaterialFor($"{dir}/Greybox_{name}.mat", color, label: false);

        /// <summary>With the AI Navigation package (com.unity.ai.navigation): a NavMeshSurface on the greybox, baked and saved.</summary>
        private static void BakeNavMesh(GameObject top, string assetPath)
        {
            var type = Type.GetType("Unity.AI.Navigation.NavMeshSurface, Unity.AI.Navigation");
            if (type == null) return;
            var surface = top.AddComponent(type);
            var collect = type.GetProperty("collectObjects");
            if (collect != null) collect.SetValue(surface, Enum.ToObject(collect.PropertyType, 2)); // Children: only the greybox
            type.GetMethod("BuildNavMesh", Type.EmptyTypes)?.Invoke(surface, null);
            if (type.GetProperty("navMeshData")?.GetValue(surface) is UnityEngine.Object data)
            {
                AssetDatabase.DeleteAsset(assetPath);
                AssetDatabase.CreateAsset(data, assetPath);
            }
        }

        /// <summary>Quads and boxes merged into one mesh (32-bit indices: big maps have many cells).</summary>
        internal sealed class MeshBuilder
        {
            private readonly List<Vector3> vertices = new List<Vector3>();
            private readonly List<Vector3> normals = new List<Vector3>();
            private readonly List<int> triangles = new List<int>();

            public void Quad(Vector3 min, Vector3 max) => Face(new Vector3(min.x, min.y, min.z), new Vector3(min.x, min.y, max.z), new Vector3(max.x, min.y, max.z), new Vector3(max.x, min.y, min.z), Vector3.up);

            public void Box(Vector3 a, Vector3 b)
            {
                Face(new Vector3(a.x, b.y, a.z), new Vector3(a.x, b.y, b.z), new Vector3(b.x, b.y, b.z), new Vector3(b.x, b.y, a.z), Vector3.up);
                Face(new Vector3(a.x, a.y, a.z), new Vector3(a.x, b.y, a.z), new Vector3(b.x, b.y, a.z), new Vector3(b.x, a.y, a.z), Vector3.back);
                Face(new Vector3(b.x, a.y, b.z), new Vector3(b.x, b.y, b.z), new Vector3(a.x, b.y, b.z), new Vector3(a.x, a.y, b.z), Vector3.forward);
                Face(new Vector3(a.x, a.y, b.z), new Vector3(a.x, b.y, b.z), new Vector3(a.x, b.y, a.z), new Vector3(a.x, a.y, a.z), Vector3.left);
                Face(new Vector3(b.x, a.y, a.z), new Vector3(b.x, b.y, a.z), new Vector3(b.x, b.y, b.z), new Vector3(b.x, a.y, b.z), Vector3.right);
            }

            private void Face(Vector3 v0, Vector3 v1, Vector3 v2, Vector3 v3, Vector3 normal)
            {
                var i = vertices.Count;
                vertices.AddRange(new[] { v0, v1, v2, v3 });
                normals.AddRange(new[] { normal, normal, normal, normal });
                triangles.AddRange(new[] { i, i + 1, i + 2, i, i + 2, i + 3 });
            }

            public Mesh Build()
            {
                var mesh = new Mesh { indexFormat = IndexFormat.UInt32 };
                mesh.SetVertices(vertices);
                mesh.SetNormals(normals);
                mesh.SetTriangles(triangles, 0);
                mesh.RecalculateBounds();
                return mesh;
            }
        }
    }
}
