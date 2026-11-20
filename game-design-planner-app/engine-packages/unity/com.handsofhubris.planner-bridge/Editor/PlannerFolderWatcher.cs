using System;
using System.Linq;
using UnityEditor;

namespace HoHPlanner.Bridge.Editor
{
    /// <summary>
    /// The planner can write the export straight into the folder (a linked engine folder in Chrome or Edge). When Unity
    /// imports a changed hoh-engine.json there, this finishes the import: records are created or updated, after the new
    /// code compiled when the export changed code. The planner writes the manifest last, so the export is complete by then.
    /// </summary>
    public sealed class PlannerFolderWatcher : AssetPostprocessor
    {
        private static void OnPostprocessAllAssets(string[] imported, string[] deleted, string[] moved, string[] movedFrom)
        {
            var settings = PlannerBridgeSettings.instance;
            if (ShouldImport(imported, settings.Root, settings.autoImport, PlannerImporter.ImportInProgress)) PlannerImporter.MarkPending(settings.Root);
        }

        /// <summary>True when the manifest of the planner folder was (re)imported outside the bridge's own import.</summary>
        public static bool ShouldImport(string[] imported, string root, bool enabled, bool importing) =>
            enabled && !importing && imported.Any(p => string.Equals(p, $"{root}/{PlannerImporter.ManifestFile}", StringComparison.Ordinal));
    }
}
