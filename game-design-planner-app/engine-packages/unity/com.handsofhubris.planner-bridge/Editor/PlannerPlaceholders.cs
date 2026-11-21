using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;

namespace HoHPlanner.Bridge.Editor
{
    public sealed class PlaceholderResult
    {
        public int Created;
        public int Assigned;

        public override string ToString() => $"{Created} placeholder(s) made, {Assigned} field(s) filled";
    }

    /// <summary>
    /// Placeholder assets for records whose sprite or prefab is not made yet: a square sprite in a colour of the plan's
    /// palette (Art Direction) with the record's initials, and a primitive prefab in the same colour. They go to
    /// &lt;root&gt;/Placeholders/&lt;Type&gt;/&lt;key&gt; and carry the “PlannerPlaceholder” label. Only empty fields are filled, so
    /// the real asset — assigned in the Inspector or named in the plan — always wins; the placeholder files stay until
    /// you delete them. Runs after every record import (Settings: “Placeholders for missing art”).
    /// </summary>
    [InitializeOnLoad]
    public static class PlannerPlaceholders
    {
        public const string Label = "PlannerPlaceholder";
        public const string Folder = "Placeholders";
        private const int Size = 64;

        static PlannerPlaceholders()
        {
            PlannerImporter.AfterRecords += (root, manifest, result) =>
            {
                if (!PlannerBridgeSettings.instance.placeholders) return;
                var r = Apply(root);
                if (r.Created > 0 || r.Assigned > 0) Debug.Log($"[Planner bridge] Placeholders: {r}.");
            };
        }

        public static PlaceholderResult Apply(string root)
        {
            var result = new PlaceholderResult();
            var index = AssetDatabase.LoadAssetAtPath<PlannerIndex>($"{root}/{PlannerImporter.IndexFile}");
            if (index == null) return result;
            var palette = Palette(root);
            foreach (var e in index.Entries)
            {
                if (e == null || e.deprecated || e.asset == null) continue;
                var fields = e.asset.GetType().GetFields(BindingFlags.Instance | BindingFlags.Public).Where(f => f.FieldType == typeof(Sprite) || f.FieldType == typeof(GameObject)).ToList();
                if (fields.Count == 0) continue;
                var color = ColorFor(e, palette);
                var changed = false;
                foreach (var f in fields)
                {
                    if (f.GetValue(e.asset) is UnityEngine.Object o && o != null) continue;
                    var dir = $"{root}/{Folder}/{e.asset.GetType().Name}";
                    var made = f.FieldType == typeof(Sprite) ? (UnityEngine.Object)SpriteFor(dir, e, color, result) : PrefabFor(dir, e, color, e.asset, result);
                    if (made == null) continue;
                    f.SetValue(e.asset, made);
                    result.Assigned++;
                    changed = true;
                }
                if (changed) EditorUtility.SetDirty(e.asset);
            }
            AssetDatabase.SaveAssets();
            return result;
        }

        /// <summary>Whether an asset is one of the bridge's placeholders.</summary>
        public static bool IsPlaceholder(UnityEngine.Object asset)
        {
            if (asset == null) return false;
            // A sprite is a sub-asset of its texture; the label sits on the file's main asset.
            var path = AssetDatabase.GetAssetPath(asset);
            var main = string.IsNullOrEmpty(path) ? null : AssetDatabase.LoadMainAssetAtPath(path);
            return main != null && AssetDatabase.GetLabels(main).Contains(Label);
        }

        // ---- Colours ----

        /// <summary>The plan's palette from ir/engine-ir.json (art.palette), or none.</summary>
        public static List<Color> Palette(string root)
        {
            var colors = new List<Color>();
            var path = $"{root}/ir/engine-ir.json";
            if (!File.Exists(path)) return colors;
            try
            {
                var art = JObject.Parse(File.ReadAllText(path))["art"]?["palette"] as JArray;
                foreach (var c in art ?? new JArray())
                    if (ColorUtility.TryParseHtmlString((string)c, out var color)) colors.Add(color);
            }
            catch (Newtonsoft.Json.JsonException)
            {
                // A broken ir file leaves the colours to the hash below.
            }
            return colors;
        }

        /// <summary>One colour per schema from the palette, a little lighter or darker per record so neighbours differ.</summary>
        public static Color ColorFor(PlannerIndexEntry e, IReadOnlyList<Color> palette)
        {
            var schemaHash = Hash(e.schemaId ?? "");
            var keyHash = Hash(e.key ?? "");
            Color baseColor;
            if (palette.Count > 0) baseColor = palette[(int)(schemaHash % (uint)palette.Count)];
            else baseColor = Color.HSVToRGB(schemaHash % 360 / 360f, 0.55f, 0.8f);
            Color.RGBToHSV(baseColor, out var h, out var s, out var v);
            var shift = ((int)(keyHash % 7) - 3) * 0.06f;
            return Color.HSVToRGB(h, s, Mathf.Clamp(v + shift, 0.2f, 0.95f));
        }

        private static uint Hash(string s)
        {
            // FNV-1a: stable across runs and machines (string.GetHashCode is not).
            var h = 2166136261u;
            foreach (var ch in s)
            {
                h ^= ch;
                h *= 16777619u;
            }
            return h;
        }

        // ---- Sprites ----

        /// <summary>Up to two letters for a record key: item.iron_sword → IS, item.plank → PL.</summary>
        public static string Initials(string key)
        {
            var last = (key ?? "").Split('.').Last();
            var words = last.Split(new[] { '_', '-', ' ' }, StringSplitOptions.RemoveEmptyEntries);
            var text = words.Length >= 2 ? $"{words[0][0]}{words[1][0]}" : last.Length >= 2 ? last.Substring(0, 2) : last;
            return text.ToUpperInvariant();
        }

        private static Sprite SpriteFor(string dir, PlannerIndexEntry e, Color color, PlaceholderResult result)
        {
            var path = $"{dir}/{Safe(e.key)}.png";
            if (!File.Exists(path))
            {
                Directory.CreateDirectory(dir);
                File.WriteAllBytes(path, Texture(color, Initials(e.key)).EncodeToPNG());
                AssetDatabase.ImportAsset(path, ImportAssetOptions.ForceSynchronousImport);
                if (AssetImporter.GetAtPath(path) is TextureImporter importer)
                {
                    importer.textureType = TextureImporterType.Sprite;
                    importer.spriteImportMode = SpriteImportMode.Single;
                    importer.filterMode = FilterMode.Point;
                    importer.mipmapEnabled = false;
                    importer.SaveAndReimport();
                }
                Mark(path);
                result.Created++;
            }
            return AssetDatabase.LoadAssetAtPath<Sprite>(path);
        }

        /// <summary>A square in the colour, a darker border and the initials in black or white, whichever reads better.</summary>
        public static Texture2D Texture(Color color, string text)
        {
            var tex = new Texture2D(Size, Size, TextureFormat.RGBA32, false);
            var border = Color.Lerp(color, Color.black, 0.45f);
            var ink = color.r * 0.299f + color.g * 0.587f + color.b * 0.114f > 0.55f ? new Color(0.08f, 0.08f, 0.1f) : Color.white;
            var pixels = new Color[Size * Size];
            for (var y = 0; y < Size; y++)
                for (var x = 0; x < Size; x++)
                    pixels[y * Size + x] = x < 3 || y < 3 || x >= Size - 3 || y >= Size - 3 ? border : color;
            const int scale = 5;
            var width = text.Length * 4 * scale - scale;
            var left = (Size - width) / 2;
            var top = (Size + 5 * scale) / 2;
            for (var i = 0; i < text.Length; i++)
            {
                if (!Glyphs.TryGetValue(text[i], out var rows)) continue;
                for (var r = 0; r < 5; r++)
                    for (var c = 0; c < 3; c++)
                    {
                        if (rows[r][c] != '#') continue;
                        for (var dy = 0; dy < scale; dy++)
                            for (var dx = 0; dx < scale; dx++)
                            {
                                var x = left + (i * 4 + c) * scale + dx;
                                var y = top - r * scale - dy - 1;
                                if (x >= 0 && x < Size && y >= 0 && y < Size) pixels[y * Size + x] = ink;
                            }
                    }
            }
            tex.SetPixels(pixels);
            tex.Apply();
            return tex;
        }

        /// <summary>A 3×5 pixel font for the initials.</summary>
        private static readonly Dictionary<char, string[]> Glyphs = new Dictionary<char, string[]>
        {
            ['A'] = new[] { "###", "#.#", "###", "#.#", "#.#" }, ['B'] = new[] { "##.", "#.#", "##.", "#.#", "##." },
            ['C'] = new[] { "###", "#..", "#..", "#..", "###" }, ['D'] = new[] { "##.", "#.#", "#.#", "#.#", "##." },
            ['E'] = new[] { "###", "#..", "##.", "#..", "###" }, ['F'] = new[] { "###", "#..", "##.", "#..", "#.." },
            ['G'] = new[] { "###", "#..", "#.#", "#.#", "###" }, ['H'] = new[] { "#.#", "#.#", "###", "#.#", "#.#" },
            ['I'] = new[] { "###", ".#.", ".#.", ".#.", "###" }, ['J'] = new[] { "..#", "..#", "..#", "#.#", "###" },
            ['K'] = new[] { "#.#", "#.#", "##.", "#.#", "#.#" }, ['L'] = new[] { "#..", "#..", "#..", "#..", "###" },
            ['M'] = new[] { "#.#", "###", "###", "#.#", "#.#" }, ['N'] = new[] { "##.", "#.#", "#.#", "#.#", "#.#" },
            ['O'] = new[] { "###", "#.#", "#.#", "#.#", "###" }, ['P'] = new[] { "###", "#.#", "###", "#..", "#.." },
            ['Q'] = new[] { "###", "#.#", "#.#", "###", "..#" }, ['R'] = new[] { "##.", "#.#", "##.", "#.#", "#.#" },
            ['S'] = new[] { "###", "#..", "###", "..#", "###" }, ['T'] = new[] { "###", ".#.", ".#.", ".#.", ".#." },
            ['U'] = new[] { "#.#", "#.#", "#.#", "#.#", "###" }, ['V'] = new[] { "#.#", "#.#", "#.#", "#.#", ".#." },
            ['W'] = new[] { "#.#", "#.#", "###", "###", "#.#" }, ['X'] = new[] { "#.#", "#.#", ".#.", "#.#", "#.#" },
            ['Y'] = new[] { "#.#", "#.#", ".#.", ".#.", ".#." }, ['Z'] = new[] { "###", "..#", ".#.", "#..", "###" },
            ['0'] = new[] { "###", "#.#", "#.#", "#.#", "###" }, ['1'] = new[] { ".#.", "##.", ".#.", ".#.", "###" },
            ['2'] = new[] { "###", "..#", "###", "#..", "###" }, ['3'] = new[] { "###", "..#", "###", "..#", "###" },
            ['4'] = new[] { "#.#", "#.#", "###", "..#", "..#" }, ['5'] = new[] { "###", "#..", "###", "..#", "###" },
            ['6'] = new[] { "###", "#..", "###", "#.#", "###" }, ['7'] = new[] { "###", "..#", "..#", "..#", "..#" },
            ['8'] = new[] { "###", "#.#", "###", "#.#", "###" }, ['9'] = new[] { "###", "#.#", "###", "..#", "###" },
        };

        // ---- Prefabs ----

        private static GameObject PrefabFor(string dir, PlannerIndexEntry e, Color color, UnityEngine.Object record, PlaceholderResult result)
        {
            var path = $"{dir}/{Safe(e.key)}.prefab";
            var existing = AssetDatabase.LoadAssetAtPath<GameObject>(path);
            if (existing != null) return existing;
            Directory.CreateDirectory(dir);
            // A record with a footprint (buildings) is a block of that size; anything else a capsule, like a character.
            var footprint = record.GetType().GetFields(BindingFlags.Instance | BindingFlags.Public).FirstOrDefault(f => f.FieldType == typeof(Vector2) && f.Name.IndexOf("footprint", StringComparison.OrdinalIgnoreCase) >= 0);
            var size = footprint != null ? (Vector2)footprint.GetValue(record) : Vector2.zero;
            var go = GameObject.CreatePrimitive(footprint != null ? PrimitiveType.Cube : PrimitiveType.Capsule);
            go.name = e.key;
            if (footprint != null) go.transform.localScale = new Vector3(Mathf.Max(1, size.x), 1, Mathf.Max(1, size.y));
            var material = MaterialFor($"{dir}/{Safe(e.key)}.mat", color);
            if (material != null) go.GetComponent<Renderer>().sharedMaterial = material;
            var prefab = PrefabUtility.SaveAsPrefabAsset(go, path);
            UnityEngine.Object.DestroyImmediate(go);
            if (prefab == null) return null;
            Mark(path);
            result.Created++;
            return prefab;
        }

        internal static Material MaterialFor(string path, Color color, bool label = true)
        {
            var existing = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (existing != null) return existing;
            // The render pipeline's own default material (URP/HDRP Lit), else the built-in Standard shader.
            var pipeline = GraphicsSettings.currentRenderPipeline;
            var template = pipeline != null ? pipeline.defaultMaterial : null;
            var shader = template != null ? null : Shader.Find("Standard");
            if (template == null && shader == null) return null;
            var material = template != null ? new Material(template) : new Material(shader);
            material.color = color;
            AssetDatabase.CreateAsset(material, path);
            if (label) Mark(path);
            return material;
        }

        private static void Mark(string path)
        {
            var asset = AssetDatabase.LoadMainAssetAtPath(path);
            if (asset != null) AssetDatabase.SetLabels(asset, new[] { Label });
        }

        private static string Safe(string key) => string.Join("_", (key ?? "record").Split(Path.GetInvalidFileNameChars()));
    }
}
