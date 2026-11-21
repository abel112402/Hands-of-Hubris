using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.AddressableAssets;
using UnityEditor.AddressableAssets.Settings;
using UnityEditor.AddressableAssets.Settings.GroupSchemas;

namespace HoHPlanner.Bridge.Editor
{
    public sealed class AddressablesResult
    {
        public int Groups;
        public int Entries;
        public readonly List<string> Labels = new List<string>();

        public override string ToString() => $"{Groups} group(s), {Entries} entries" + (Labels.Count > 0 ? $", labels {string.Join(", ", Labels)}" : "");
    }

    /// <summary>
    /// Addressables from the plan (Data-driven Design › Loading and Addressables): one group per load group, the records of
    /// its schemas as entries addressed by their stable key, with the planned label. Compiled only when the Addressables
    /// package is installed; runs after every record import.
    /// </summary>
    [InitializeOnLoad]
    public static class PlannerAddressables
    {
        static PlannerAddressables()
        {
            PlannerImporter.AfterRecords += (root, manifest, result) =>
            {
                if (!manifest.Schemas.Any(s => s.Load != null)) return;
                var r = Apply(root, manifest);
                UnityEngine.Debug.Log($"[Planner bridge] Addressables: {r}.");
            };
        }

        /// <summary>Creates or updates the planned groups and their entries. Entries are moved into their group; nothing is removed.</summary>
        public static AddressablesResult Apply(string root, PlannerManifest manifest)
        {
            var result = new AddressablesResult();
            var planned = manifest.Schemas.Where(s => s.Load != null).ToList();
            if (planned.Count == 0) return result;
            var settings = AddressableAssetSettingsDefaultObject.GetSettings(true);
            var index = AssetDatabase.LoadAssetAtPath<PlannerIndex>($"{root}/{PlannerImporter.IndexFile}");
            var groups = new Dictionary<string, AddressableAssetGroup>();
            foreach (var schema in planned)
            {
                if (!groups.TryGetValue(schema.Load.Group, out var group))
                {
                    group = settings.FindGroup(schema.Load.Group);
                    if (group == null)
                    {
                        group = settings.CreateGroup(schema.Load.Group, false, false, false, null, typeof(BundledAssetGroupSchema), typeof(ContentUpdateGroupSchema));
                        result.Groups++;
                    }
                    groups[schema.Load.Group] = group;
                }
                if (schema.Load.Label != null && !settings.GetLabels().Contains(schema.Load.Label))
                {
                    settings.AddLabel(schema.Load.Label, false);
                    result.Labels.Add(schema.Load.Label);
                }
                foreach (var (path, address) in Assets(root, schema, index))
                {
                    var guid = AssetDatabase.AssetPathToGUID(path);
                    if (string.IsNullOrEmpty(guid)) continue;
                    var entry = settings.CreateOrMoveEntry(guid, group, false, false);
                    entry.address = address;
                    if (schema.Load.Label != null) entry.SetLabel(schema.Load.Label, true, true, false);
                    result.Entries++;
                }
            }
            settings.SetDirty(AddressableAssetSettings.ModificationEvent.BatchModification, null, true, true);
            AssetDatabase.SaveAssets();
            return result;
        }

        /// <summary>The assets that hold a schema's records: one asset per record (native), one JSON per record, or the CSV.</summary>
        private static IEnumerable<(string path, string address)> Assets(string root, ManifestSchema schema, PlannerIndex index)
        {
            if (schema.Format == "native")
            {
                if (index == null) yield break;
                foreach (var e in index.Entries.Where(e => e != null && e.schemaId == schema.Id && !e.deprecated && e.asset != null))
                    yield return (AssetDatabase.GetAssetPath(e.asset), e.key);
                yield break;
            }
            var data = $"{root}/{schema.Data.TrimEnd('/')}";
            if (schema.Format == "csv")
            {
                if (File.Exists(data)) yield return (data, Path.GetFileNameWithoutExtension(data));
                yield break;
            }
            if (!Directory.Exists(data)) yield break;
            foreach (var file in Directory.GetFiles(data, "*.json").OrderBy(f => f, StringComparer.Ordinal))
                yield return (file.Replace('\\', '/'), Path.GetFileNameWithoutExtension(file));
        }
    }
}
