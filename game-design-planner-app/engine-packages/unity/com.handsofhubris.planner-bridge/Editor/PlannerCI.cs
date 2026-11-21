using System;
using System.Linq;
using UnityEditor;
using UnityEngine;

namespace HoHPlanner.Bridge.Editor
{
    /// <summary>
    /// Batch-mode entry points, for CI:
    ///   Unity -batchmode -projectPath P -executeMethod HoHPlanner.Bridge.Editor.PlannerCI.Import -hohBundle path/to/export.zip
    ///   Unity -batchmode -projectPath P -executeMethod HoHPlanner.Bridge.Editor.PlannerCI.Validate
    /// Import copies the files; when that changed code, the records are made when Unity next opens the project
    /// (run Validate as the second step: it opens the project, finishes the import and checks it).
    /// Exit code: 0 ok, 1 errors, 2 bad arguments or bundle.
    /// </summary>
    public static class PlannerCI
    {
        public static void Import()
        {
            var path = Arg("-hohBundle");
            if (path == null)
            {
                Debug.LogError("[Planner bridge] Pass -hohBundle <zip or folder>.");
                EditorApplication.Exit(2);
                return;
            }
            try
            {
                var r = PlannerImporter.Import(path);
                Debug.Log($"[Planner bridge] Files: {r.Written} written, {r.Unchanged} unchanged, {r.Deleted} removed, {r.KeptYours} of your class files kept{(r.Moved.Count > 0 ? $", {r.Moved.Count} moved with their renamed class ({string.Join("; ", r.Moved)})" : "")}. Code changed: {r.CodeChanged}.");
                EditorApplication.Exit(0);
            }
            catch (PlannerImportException e)
            {
                Debug.LogError($"[Planner bridge] {e.Message}");
                EditorApplication.Exit(2);
            }
        }

        public static void Validate()
        {
            var records = PlannerImporter.ResumePendingNow();
            if (records != null && records.Problems.Count > 0) foreach (var p in records.Problems) Debug.LogWarning($"[Planner bridge] {p}");
            var issues = PlannerValidator.Run();
            try
            {
                Debug.Log($"[Planner bridge] Report for the planner: {PlannerReport.Write()}");
            }
            catch (PlannerImportException e)
            {
                Debug.LogWarning($"[Planner bridge] No report: {e.Message}");
            }
            foreach (var i in issues) Debug.Log($"[Planner bridge] {i}");
            var errors = issues.Count(i => i.Level == IssueLevel.Error);
            Debug.Log($"[Planner bridge] Validation: {errors} error(s), {issues.Count(i => i.Level == IssueLevel.Warning)} warning(s).");
            EditorApplication.Exit(errors > 0 ? 1 : 0);
        }

        /// <summary>-executeMethod HoHPlanner.Bridge.Editor.PlannerCI.Greybox: a walkable greybox scene per location map (Greybox/). Exit code 0, or 1 when a map could not be built.</summary>
        public static void Greybox()
        {
            var r = PlannerGreybox.Build(PlannerBridgeSettings.instance.Root);
            Debug.Log($"[Planner bridge] Greybox: {r}");
            foreach (var s in r.Scenes) Debug.Log($"[Planner bridge]   {s}");
            EditorApplication.Exit(r.Notes.Any(n => !n.StartsWith("The export has no maps")) ? 1 : 0);
        }

        /// <summary>-executeMethod HoHPlanner.Bridge.Editor.PlannerCI.SetupProject: planned folders, assemblies and project files (never overwrites).</summary>
        public static void SetupProject()
        {
            try
            {
                Debug.Log($"[Planner bridge] Folders: {PlannerSetup.CreateFolders()}.");
                Debug.Log($"[Planner bridge] Project files: {PlannerSetup.InstallProjectFiles()}.");
                AssetDatabase.Refresh();
                EditorApplication.Exit(0);
            }
            catch (PlannerImportException e)
            {
                Debug.LogError($"[Planner bridge] {e.Message}");
                EditorApplication.Exit(2);
            }
        }

        private static string Arg(string name)
        {
            var args = Environment.GetCommandLineArgs();
            var i = Array.IndexOf(args, name);
            return i >= 0 && i + 1 < args.Length ? args[i + 1] : null;
        }
    }
}
