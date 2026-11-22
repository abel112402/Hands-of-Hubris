using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using Newtonsoft.Json.Linq;
using UnityEditor;

namespace HoHPlanner.Bridge.Editor
{
    public enum IssueLevel
    {
        Error,
        Warning,
        Info,
    }

    public sealed class ValidationIssue
    {
        public IssueLevel Level;
        public string Message;
        public UnityEngine.Object Asset;

        public override string ToString() => $"{Level}: {Message}";
    }

    /// <summary>
    /// Checks the imported records against the plan: every record has its asset, every required field is filled
    /// (above all the sprites, prefabs and sounds that are set in Unity, not in the planner), and no record points
    /// at one that left the plan.
    /// </summary>
    public static class PlannerValidator
    {
        /// <summary>
        /// What a playable-prototype export (manifest requires.runtime) needs from the project: the Input System installed
        /// and active (the player cannot move otherwise), and URP installed and set as the render pipeline. Empty for any
        /// other export.
        /// </summary>
        public static List<ValidationIssue> PrototypeEnvironment(string root)
        {
            var found = new List<ValidationIssue>();
            var path = $"{root}/{PlannerImporter.ManifestFile}";
            if (!File.Exists(path)) return found;
            PlannerManifest manifest;
            try
            {
                manifest = PlannerManifest.Parse(File.ReadAllText(path));
            }
            catch (PlannerImportException)
            {
                return found;
            }
            if (manifest.RuntimePackage == null) return found;
            if (PackageVersion("com.unity.inputsystem") == null)
                found.Add(new ValidationIssue { Level = IssueLevel.Error, Message = "This plan asks for a playable prototype, but the Input System package is not installed: Window › Package Manager › Unity Registry › Input System. The player cannot move without it." });
            else if (!InputSystemActive())
                found.Add(new ValidationIssue { Level = IssueLevel.Error, Message = "The Input System is installed but not active: Project Settings › Player › Active Input Handling → Input System Package (or Both). The player cannot move until it is." });
            if (PackageVersion("com.unity.render-pipelines.universal") == null)
                found.Add(new ValidationIssue { Level = IssueLevel.Error, Message = "This plan's prototype uses URP, which is not installed: Window › Package Manager › Unity Registry › Universal RP." });
            else if (!UrpActive())
                found.Add(new ValidationIssue { Level = IssueLevel.Warning, Message = "URP is installed but not the render pipeline: Project Settings › Graphics › Default Render Pipeline → a URP asset. Materials show pink until it is." });
            return found;
        }

        static string PackageVersion(string name) => UnityEditor.PackageManager.PackageInfo.FindForAssetPath($"Packages/{name}/package.json")?.version;

        /// <summary>Player Settings › Active Input Handling: 0 = old Input Manager only, 1 = Input System, 2 = both.</summary>
        static bool InputSystemActive()
        {
            var settings = AssetDatabase.LoadAllAssetsAtPath("ProjectSettings/ProjectSettings.asset").FirstOrDefault();
            var handler = settings != null ? new SerializedObject(settings).FindProperty("activeInputHandler") : null;
            return handler == null || handler.intValue != 0;
        }

        static bool UrpActive()
        {
            var rp = UnityEngine.Rendering.GraphicsSettings.currentRenderPipeline;
            return rp != null && rp.GetType().Name == "UniversalRenderPipelineAsset";
        }

        public static List<ValidationIssue> Run(string root = null)
        {
            root = root ?? PlannerBridgeSettings.instance.Root;
            var issues = new List<ValidationIssue>();
            var index = AssetDatabase.LoadAssetAtPath<PlannerIndex>($"{root}/{PlannerImporter.IndexFile}");
            if (index == null)
            {
                issues.Add(new ValidationIssue { Level = IssueLevel.Info, Message = $"Nothing imported yet ({root}/{PlannerImporter.IndexFile} is missing)." });
                return issues;
            }
            issues.AddRange(PrototypeEnvironment(root));
            var required = RequiredFields(root);
            var deprecated = new HashSet<UnityEngine.Object>(index.Entries.Where(e => e.deprecated && e.asset != null).Select(e => e.asset));
            foreach (var e in index.Entries)
            {
                if (e.asset == null)
                {
                    issues.Add(new ValidationIssue { Level = IssueLevel.Error, Message = $"{e.key}: its asset was deleted. Reimport to create it again." });
                    continue;
                }
                if (e.deprecated)
                {
                    issues.Add(new ValidationIssue { Level = IssueLevel.Info, Asset = e.asset, Message = $"{e.key}: no longer in the plan; delete the asset when nothing uses it." });
                    continue;
                }
                var type = e.asset.GetType();
                var map = RecordValues.FieldMap(type);
                const BindingFlags flags = BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic;
                foreach (var planner in required.TryGetValue(e.schemaId, out var r) ? r : new List<string>())
                {
                    var field = type.GetField(map.TryGetValue(planner, out var m) ? m : planner, flags);
                    if (field == null) continue;
                    var v = field.GetValue(e.asset);
                    var empty = v == null || (v is UnityEngine.Object o && o == null) || (v is string s && s.Length == 0) || (v is System.Collections.ICollection c && c.Count == 0);
                    if (empty) issues.Add(new ValidationIssue { Level = typeof(UnityEngine.Object).IsAssignableFrom(field.FieldType) ? IssueLevel.Warning : IssueLevel.Error, Asset = e.asset, Message = $"{e.key}.{planner}: required, but empty." });
                    // A placeholder fills the gap in the game, but the real asset is still to be made.
                    else if (v is UnityEngine.Object placeholder && PlannerPlaceholders.IsPlaceholder(placeholder)) issues.Add(new ValidationIssue { Level = IssueLevel.Warning, Asset = e.asset, Message = $"{e.key}.{planner}: still a placeholder." });
                }
                foreach (var f in type.GetFields(flags))
                {
                    var v = f.GetValue(e.asset);
                    var refs = v is System.Collections.IEnumerable list && !(v is string) ? list.OfType<UnityEngine.Object>() : v is UnityEngine.Object one ? new[] { one } : Enumerable.Empty<UnityEngine.Object>();
                    foreach (var target in refs)
                        if (target != null && deprecated.Contains(target))
                            issues.Add(new ValidationIssue { Level = IssueLevel.Warning, Asset = e.asset, Message = $"{e.key}.{f.Name}: points at {target.name}, which is no longer in the plan." });
                }
            }
            return issues;
        }

        /// <summary>Required planner fields per schema, from ir/engine-ir.json.</summary>
        private static Dictionary<string, List<string>> RequiredFields(string root)
        {
            var map = new Dictionary<string, List<string>>();
            var path = $"{root}/ir/engine-ir.json";
            if (!File.Exists(path)) return map;
            try
            {
                var ir = JObject.Parse(File.ReadAllText(path));
                foreach (var s in ir["schemas"] as JArray ?? new JArray())
                    map[(string)s["id"]] = (s["fields"] as JArray ?? new JArray()).Where(f => !(bool?)f["optional"] ?? true).Select(f => (string)f["name"]).ToList();
            }
            catch (Newtonsoft.Json.JsonException)
            {
            }
            return map;
        }
    }
}
