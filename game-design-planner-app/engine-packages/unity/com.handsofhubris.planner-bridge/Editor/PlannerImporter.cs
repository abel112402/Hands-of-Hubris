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
        /// <summary>Your class files moved with their renamed class, “old → new”.</summary>
        public readonly List<string> Moved = new List<string>();
        public bool CodeChanged;
        public PlannerManifest Manifest;
        public readonly List<string> Notes = new List<string>();
        /// <summary>Files in generated folders left alone because the planner did not write them (or they changed since).</summary>
        public readonly List<string> KeptNotOurs = new List<string>();
        /// <summary>Changed files overwritten because the import was asked to (their old text is in <see cref="Backup"/>).</summary>
        public readonly List<string> Conflicts = new List<string>();
        /// <summary>The backup folder of this import, when it replaced or removed anything.</summary>
        public string Backup;

        public override string ToString() =>
            $"{Written} written, {Unchanged} unchanged, {Deleted} removed, {KeptYours} of your class files kept"
            + (Moved.Count > 0 ? $", {Moved.Count} moved with their renamed class ({string.Join("; ", Moved)})" : "")
            + (KeptNotOurs.Count > 0 ? $", {KeptNotOurs.Count} file(s) the planner did not write kept ({string.Join(", ", KeptNotOurs.Take(3))}{(KeptNotOurs.Count > 3 ? ", …" : "")})" : "")
            + (Conflicts.Count > 0 ? $", {Conflicts.Count} conflict(s) overwritten (backup in {Backup})" : "");
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
        private static readonly string[] OwnedPrefixes = { "Unity/Scripts/Generated/", "Unity/ProjectFiles/", "Unity/Tests/", "Unity/Input/", "Unity/UI/", "Data/", "ir/", "Localization/", "Maps/" };

        public static event Action<RecordStepResult> RecordsImported;

        /// <summary>
        /// Runs after every record step, for optional steps that need other packages (Addressables groups, Localization
        /// tables; see Editor/Addressables and Editor/Localization). A step adds its own problems to the result.
        /// </summary>
        public static event Action<string, PlannerManifest, RecordStepResult> AfterRecords;

        /// <summary>True while <see cref="Import"/> runs, so the folder watcher does not start a second record step.</summary>
        public static bool ImportInProgress { get; private set; }

        /// <summary>Asks for the record step: now if no code is compiling, else right after the domain reload.</summary>
        public static void MarkPending(string root)
        {
            File.WriteAllText(PendingMarker, root);
            EditorApplication.delayCall += () => ResumePendingNow();
        }

        /// <summary>The whole import: files now, records now or right after the code compiled.</summary>
        public static FileStepResult Import(string bundlePath, bool overwrite = false)
        {
            var bundle = PlannerBundle.FromPath(bundlePath);
            var settings = PlannerBridgeSettings.instance;
            ImportInProgress = true;
            try
            {
                var result = WriteFiles(bundle, settings.Root, overwrite);
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
            // A write into the planner folder (this bridge's or the planner's) that never finished: say so, with the way back.
            var root = PlannerBridgeSettings.instance.Root;
            var broken = PlannerOwnership.Interrupted(root);
            if (broken != null) Debug.LogWarning($"[Planner bridge] A write into {root} ({(broken.By == "unity" ? "an import" : "by the planner")}, {broken.Stamp}) did not finish. Tools ▸ Game Design Planner ▸ Restore last import puts the folder back as it was before it; importing again also completes it.");
        }

        /// <summary>Undoes the last write into the planner folder from its backup, then refreshes the AssetDatabase.</summary>
        public static string RestoreLastImport()
        {
            var root = PlannerBridgeSettings.instance.Root;
            var message = PlannerOwnership.RestoreLast(root);
            AssetDatabase.Refresh(ImportAssetOptions.ForceUpdate);
            return message;
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

        /// <summary>
        /// What importing <paramref name="bundle"/> into <paramref name="root"/> would do, file by file, without writing
        /// (PlannerOwnership has the rules). Generated files are only considered for removal when the folder already
        /// holds an export.
        /// </summary>
        public static ImportPlan Preview(PlannerBundle bundle, string root)
        {
            var next = bundle.Files.ToDictionary(kv => kv.Key, kv => Encoding.UTF8.GetString(kv.Value));
            var old = PlannerOwnership.OldHashes(root);
            var generated = new List<string>();
            if (old != null)
                foreach (var prefix in OwnedPrefixes)
                {
                    var dir = $"{root}/{prefix}".TrimEnd('/');
                    if (!Directory.Exists(dir)) continue;
                    foreach (var file in Directory.EnumerateFiles(dir, "*", SearchOption.AllDirectories))
                        if (!file.EndsWith(".meta")) generated.Add(file.Replace('\\', '/').Substring(root.Length + 1));
                }
            string Disk(string rel) => File.Exists($"{root}/{rel}") ? File.ReadAllText($"{root}/{rel}") : null;
            return PlannerOwnership.Plan(next, Disk, old, generated, new[] { YoursPrefix }, OwnedPrefixes, ManifestFile);
        }

        /// <summary>
        /// Copies the bundle under <paramref name="root"/> (inside Assets/). Does not refresh the AssetDatabase.
        /// Stops with <see cref="PlannerConflictException"/> before writing anything when a file it would overwrite was
        /// changed by hand (or not written by the planner), unless <paramref name="overwrite"/>. Whatever it replaces or
        /// removes is backed up first under .hoh-backup/ with a journal; a failure half-way puts the folder back.
        /// </summary>
        public static FileStepResult WriteFiles(PlannerBundle bundle, string root, bool overwrite = false)
        {
            if (!root.StartsWith("Assets/") && root != "Assets") throw new PlannerImportException($"The planner folder must be inside Assets/ (now “{root}”).");
            var manifest = bundle.Manifest();
            // A playable-prototype export needs the runtime package: refuse before anything is written.
            manifest.RequireRuntime();
            var plan = Preview(bundle, root);
            if (plan.Conflicts.Count > 0 && !overwrite) throw new PlannerConflictException(plan.Conflicts.Select(c => c.Path).ToList());
            var result = new FileStepResult { Manifest = manifest };
            if (!manifest.HasUnityCode) result.Notes.Add(manifest.Engine == "unity" ? "The bundle has no Unity code." : $"The bundle was exported for {manifest.Engine}; only its engine-neutral data is imported. Set the planner's target engine to Unity for C#.");
            // Your files of renamed classes move to their new names first, so they are not left behind.
            result.Moved.AddRange(PlannerRenames.Apply(root, bundle.Files.TryGetValue(PlannerRenames.ClassIndex, out var index) ? index : null));
            if (result.Moved.Count > 0)
            {
                result.CodeChanged = true;
                plan = Preview(bundle, root);
            }
            result.Conflicts.AddRange(plan.Conflicts.Select(c => c.Path));
            result.KeptNotOurs.AddRange(plan.Entries.Where(e => e.Action == PlanAction.KeepNotOurs).Select(e => e.Path));
            result.KeptYours = plan.Count(PlanAction.KeepYours);
            result.Unchanged = plan.Count(PlanAction.Unchanged);

            var writes = plan.Entries.Where(e => e.Path != ManifestFile && (e.Action == PlanAction.Create || e.Action == PlanAction.Update || e.Action == PlanAction.Conflict)).ToList();
            var manifestEntry = plan.Entries.FirstOrDefault(e => e.Path == ManifestFile);
            var writeManifest = manifestEntry != null && manifestEntry.Action != PlanAction.Unchanged;
            var deletes = plan.Entries.Where(e => e.Action == PlanAction.Delete).Select(e => e.Path).ToList();
            if (writes.Count == 0 && deletes.Count == 0 && !writeManifest) return result;

            var journal = new WriteJournal { Stamp = PlannerOwnership.Stamp(DateTime.UtcNow) };
            journal.Created.AddRange(writes.Where(e => e.Action == PlanAction.Create).Select(e => e.Path));
            if (writeManifest && manifestEntry.Action == PlanAction.Create) journal.Created.Add(ManifestFile);
            journal.BackedUp.AddRange(writes.Where(e => e.Action != PlanAction.Create).Select(e => e.Path));
            if (writeManifest && manifestEntry.Action == PlanAction.Update) journal.BackedUp.Add(ManifestFile);
            // Removed files go with their .meta, so a restore brings back the same GUID and every reference to it.
            foreach (var d in deletes) journal.BackedUp.AddRange(new[] { d, d + ".meta" }.Where(p => File.Exists($"{root}/{p}")));
            PlannerOwnership.Begin(root, journal);
            result.Backup = $"{root}/{PlannerOwnership.BackupDir}/{journal.Stamp}";

            try
            {
                foreach (var e in writes)
                {
                    var target = $"{root}/{e.Path}";
                    Directory.CreateDirectory(Path.GetDirectoryName(target));
                    File.WriteAllBytes(target, bundle.Files[e.Path]);
                    result.Written++;
                    if (e.Path.EndsWith(".cs") || e.Path.EndsWith(".asmdef")) result.CodeChanged = true;
                }
                // The manifest last: a watcher sees a complete export.
                if (writeManifest)
                {
                    File.WriteAllBytes($"{root}/{ManifestFile}", bundle.Files[ManifestFile]);
                    result.Written++;
                }
                foreach (var d in deletes)
                {
                    File.Delete($"{root}/{d}");
                    if (File.Exists($"{root}/{d}.meta")) File.Delete($"{root}/{d}.meta");
                    result.Deleted++;
                    if (d.EndsWith(".cs")) result.CodeChanged = true;
                }
            }
            catch (Exception e) when (!(e is PlannerImportException))
            {
                try
                {
                    PlannerOwnership.Restore(root, journal);
                }
                catch (Exception again)
                {
                    throw new PlannerImportException($"The import failed ({e.Message}) and putting the folder back failed too ({again.Message}); the old files are in {result.Backup}. Tools ▸ Game Design Planner ▸ Restore last import tries again.");
                }
                throw new PlannerImportException($"The import failed ({e.Message}); the planner folder was put back as it was before.");
            }
            journal.State = "done";
            PlannerOwnership.Save(root, journal);
            PlannerOwnership.Prune(root);
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
            // A linked folder gets the files from the planner directly; the records wait until the runtime package is there.
            manifest.RequireRuntime();
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
            if (AfterRecords != null)
                foreach (Action<string, PlannerManifest, RecordStepResult> step in AfterRecords.GetInvocationList())
                {
                    try
                    {
                        step(root, manifest, result);
                    }
                    catch (Exception e)
                    {
                        result.Problems.Add($"{step.Method.DeclaringType?.Name}: {e.Message}");
                    }
                }
            AssetDatabase.SaveAssets();
            return result;
        }
    }
}
