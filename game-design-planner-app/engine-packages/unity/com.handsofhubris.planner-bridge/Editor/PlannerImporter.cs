using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEngine;

namespace HoHPlanner.Bridge.Editor
{
    /// <summary>What the file step did.</summary>
    public sealed class FileStepResult
    {
        public int Written;
        public int Unchanged;
        public int Deleted;
        /// <summary>Your own class files that already existed and were left alone.</summary>
        public int KeptYours;
        public bool CodeChanged;
        public PlannerManifest Manifest;
        public readonly List<string> Notes = new List<string>();
    }

    /// <summary>What the record step did.</summary>
    public sealed class RecordStepResult
    {
        public int Created;
        public int Updated;
        public int Renamed;
        public int Deprecated;
        public readonly List<string> Problems = new List<string>();

        public override string ToString() =>
            $"{Created} created, {Updated} updated, {Renamed} renamed, {Deprecated} no longer in the plan" + (Problems.Count > 0 ? $", {Problems.Count} problem(s)" : "");
    }

    /// <summary>
    /// Imports a planner engine export in two steps. (1) Files: the bundle is copied under the root folder; generated
    /// folders are replaced, your own class files under Unity/Scripts/Classes are only created when missing.
    /// (2) Records: after the generated C# compiled, every record of a native-format schema becomes (or updates) a
    /// ScriptableObject, matched by its planner ID, so renames keep the asset and every reference to it.
    /// Step 2 resumes by itself after the domain reload that new code causes (a marker file in Library/).
    /// </summary>
    public static class PlannerImporter
    {
        public const string IndexFile = "PlannerIndex.asset";
        public const string ManifestFile = "hoh-engine.json";
        public const string RecordsFolder = "Records";
        private const string PendingMarker = "Library/HoHPlannerPendingImport.txt";
        private const string YoursPrefix = "Unity/Scripts/Classes/";
        /// <summary>Folders and files the export owns completely; anything in them that the bundle no longer has is deleted.</summary>
        private static readonly string[] OwnedPrefixes = { "Unity/Scripts/Generated/", "Data/", "ir/", "Localization/", "Maps/" };

        public static event Action<RecordStepResult> RecordsImported;

        /// <summary>True while <see cref="Import"/> runs, so the folder watcher does not start a second record step.</summary>
        public static bool ImportInProgress { get; private set; }

        /// <summary>Asks for the record step: now if no code is compiling, else right after the domain reload.</summary>
        public static void MarkPending(string root)
        {
            File.WriteAllText(PendingMarker, root);
            EditorApplication.delayCall += () => ResumePendingNow();
        }

        /// <summary>The whole import: files now, records now or right after the code compiled.</summary>
        public static FileStepResult Import(string bundlePath)
        {
            var bundle = PlannerBundle.FromPath(bundlePath);
            var settings = PlannerBridgeSettings.instance;
            ImportInProgress = true;
            try
            {
                var result = WriteFiles(bundle, settings.Root);
                settings.lastBundlePath = bundlePath;
                settings.Save();
                File.WriteAllText(PendingMarker, settings.Root);
                AssetDatabase.Refresh(ImportAssetOptions.ForceUpdate);
                if (!EditorApplication.isCompiling && !result.CodeChanged) ResumePendingNow();
                return result;
            }
            finally
            {
                ImportInProgress = false;
            }
        }

        [InitializeOnLoadMethod]
        private static void ResumeAfterReload()
        {
            if (File.Exists(PendingMarker)) EditorApplication.delayCall += () => ResumePendingNow();
        }

        /// <summary>Runs the record step if an import is waiting for it. Returns null when nothing was waiting or the code is still compiling.</summary>
        public static RecordStepResult ResumePendingNow()
        {
            if (!File.Exists(PendingMarker) || EditorApplication.isCompiling) return null;
            var root = File.ReadAllText(PendingMarker).Trim();
            File.Delete(PendingMarker);
            try
            {
                var r = ImportRecords(root);
                Debug.Log($"[Planner bridge] Records: {r}.{(r.Problems.Count > 0 ? "\n" + string.Join("\n", r.Problems.Take(50)) : "")}");
                Debug.Log($"[Planner bridge] Report for the planner: {PlannerReport.Write(root)}");
                RecordsImported?.Invoke(r);
                return r;
            }
            catch (PlannerImportException e)
            {
                Debug.LogError($"[Planner bridge] {e.Message}");
                return null;
            }
        }

        // ---- Step 1: files ----

        /// <summary>Copies the bundle under <paramref name="root"/> (inside Assets/). Does not refresh the AssetDatabase.</summary>
        public static FileStepResult WriteFiles(PlannerBundle bundle, string root)
        {
            if (!root.StartsWith("Assets/") && root != "Assets") throw new PlannerImportException($"The planner folder must be inside Assets/ (now “{root}”).");
            var manifest = bundle.Manifest();
            var result = new FileStepResult { Manifest = manifest };
            if (!manifest.HasUnityCode) result.Notes.Add(manifest.Engine == "unity" ? "The bundle has no Unity code." : $"The bundle was exported for {manifest.Engine}; only its engine-neutral data is imported. Set the planner's target engine to Unity for C#.");
            foreach (var kv in bundle.Files)
            {
                var target = $"{root}/{kv.Key}";
                var yours = kv.Key.StartsWith(YoursPrefix);
                if (yours && File.Exists(target))
                {
                    result.KeptYours++;
                    continue;
                }
                if (File.Exists(target) && File.ReadAllBytes(target).SequenceEqual(kv.Value))
                {
                    result.Unchanged++;
                    continue;
                }
                Directory.CreateDirectory(Path.GetDirectoryName(target));
                File.WriteAllBytes(target, kv.Value);
                result.Written++;
                if (kv.Key.EndsWith(".cs") || kv.Key.EndsWith(".asmdef")) result.CodeChanged = true;
            }
            // Generated files the plan no longer has.
            foreach (var prefix in OwnedPrefixes)
            {
                var dir = $"{root}/{prefix}".TrimEnd('/');
                if (!Directory.Exists(dir)) continue;
                foreach (var file in Directory.EnumerateFiles(dir, "*", SearchOption.AllDirectories).ToList())
                {
                    if (file.EndsWith(".meta")) continue;
                    var rel = file.Replace('\\', '/').Substring(root.Length + 1);
                    if (bundle.Has(rel)) continue;
                    File.Delete(file);
                    if (File.Exists(file + ".meta")) File.Delete(file + ".meta");
                    result.Deleted++;
                    if (rel.EndsWith(".cs")) result.CodeChanged = true;
                }
            }
            return result;
        }

        // ---- Step 2: records ----

        /// <summary>The generated ScriptableObject type of each schema, found by its SchemaId constant.</summary>
        public static Dictionary<string, Type> SchemaTypes()
        {
            var map = new Dictionary<string, Type>();
            foreach (var t in TypeCache.GetTypesDerivedFrom<ScriptableObject>())
            {
                if (t.IsAbstract) continue;
                var id = RecordValues.SchemaIdOf(t);
                if (id != null) map[id] = t;
            }
            return map;
        }

        public static PlannerIndex LoadOrCreateIndex(string root)
        {
            var path = $"{root}/{IndexFile}";
            var index = AssetDatabase.LoadAssetAtPath<PlannerIndex>(path);
            if (index != null) return index;
            Directory.CreateDirectory(root);
            index = ScriptableObject.CreateInstance<PlannerIndex>();
            AssetDatabase.CreateAsset(index, path);
            return index;
        }

        private static string SafeFileName(string key)
        {
            var sb = new StringBuilder();
            foreach (var c in key) sb.Append(char.IsLetterOrDigit(c) || c == '.' || c == '_' || c == '-' ? c : '_');
            return sb.Length > 0 ? sb.ToString() : "record";
        }

        /// <summary>
        /// Creates or updates one asset per record of every native-format schema under <paramref name="root"/>.
        /// <paramref name="types"/> defaults to the compiled generated types (by SchemaId).
        /// </summary>
        public static RecordStepResult ImportRecords(string root, IReadOnlyDictionary<string, Type> types = null)
        {
            var manifestPath = $"{root}/hoh-engine.json";
            if (!File.Exists(manifestPath)) throw new PlannerImportException($"No planner export in {root} (hoh-engine.json is missing).");
            var manifest = PlannerManifest.Parse(File.ReadAllText(manifestPath));
            types = types ?? SchemaTypes();
            var result = new RecordStepResult();
            var index = LoadOrCreateIndex(root);
            var pending = new List<(ScriptableObject asset, JObject json, string key)>();
            var seen = new HashSet<string>();
            var nativeSchemas = manifest.Schemas.Where(s => s.Format == "native").ToList();

            foreach (var schema in nativeSchemas)
            {
                if (!types.TryGetValue(schema.Id, out var type))
                {
                    result.Problems.Add($"{schema.Name}: no compiled C# type with SchemaId “{schema.Id}”. Wait for the scripts to compile, or fix the compile errors, then use Reimport.");
                    continue;
                }
                var dir = $"{root}/{schema.Data.TrimEnd('/')}";
                if (!Directory.Exists(dir)) continue;
                var folder = $"{root}/{RecordsFolder}/{type.Name}";
                foreach (var file in Directory.GetFiles(dir, "*.json").OrderBy(f => f, StringComparer.Ordinal))
                {
                    JObject json;
                    try
                    {
                        json = JObject.Parse(File.ReadAllText(file));
                    }
                    catch (JsonException e)
                    {
                        result.Problems.Add($"{Path.GetFileName(file)}: not valid JSON ({e.Message}).");
                        continue;
                    }
                    var plannerId = (string)json["plannerId"];
                    var key = (string)json["id"];
                    if (string.IsNullOrEmpty(plannerId) || string.IsNullOrEmpty(key))
                    {
                        result.Problems.Add($"{Path.GetFileName(file)}: no id or plannerId.");
                        continue;
                    }
                    seen.Add(plannerId);
                    var entry = index.FindByPlannerId(plannerId);
                    var asset = entry?.asset as ScriptableObject;
                    if (asset != null && asset.GetType() != type) asset = null;
                    if (asset == null)
                    {
                        Directory.CreateDirectory(folder);
                        asset = ScriptableObject.CreateInstance(type);
                        asset.name = SafeFileName(key);
                        AssetDatabase.CreateAsset(asset, AssetDatabase.GenerateUniqueAssetPath($"{folder}/{SafeFileName(key)}.asset"));
                        result.Created++;
                    }
                    else
                    {
                        var path = AssetDatabase.GetAssetPath(asset);
                        if (entry.key != key && Path.GetFileNameWithoutExtension(path) != SafeFileName(key))
                        {
                            var error = AssetDatabase.RenameAsset(path, SafeFileName(key));
                            if (string.IsNullOrEmpty(error)) result.Renamed++;
                            else result.Problems.Add($"{key}: could not rename {path} ({error}).");
                        }
                        result.Updated++;
                    }
                    index.Set(new PlannerIndexEntry { plannerId = plannerId, schemaId = schema.Id, key = key, asset = asset, deprecated = false });
                    pending.Add((asset, json, key));
                }
            }

            // Values after every asset exists, so references between records resolve.
            UnityEngine.Object Resolve(string k, Type t)
            {
                var a = index.FindByKey(k)?.asset;
                return a != null && t.IsInstanceOfType(a) ? a : null;
            }
            foreach (var (asset, json, key) in pending)
            {
                Undo.RecordObject(asset, "Planner import");
                foreach (var p in RecordValues.Apply(asset, json, Resolve)) result.Problems.Add($"{key}.{p}");
                EditorUtility.SetDirty(asset);
            }

            // Records of native schemas that left the plan: keep the asset, mark it.
            var nativeIds = new HashSet<string>(nativeSchemas.Select(s => s.Id));
            foreach (var e in index.Entries)
            {
                if (!nativeIds.Contains(e.schemaId) || seen.Contains(e.plannerId) || e.deprecated) continue;
                e.deprecated = true;
                result.Deprecated++;
            }
            EditorUtility.SetDirty(index);
            AssetDatabase.SaveAssets();
            return result;
        }
    }
}
