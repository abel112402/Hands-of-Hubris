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
    /// Import stops before writing when a file it would overwrite was changed by hand; -hohOverwrite overwrites it after a
    /// backup. Preview (-hohBundle) lists what an import would do; RestoreLastImport undoes the last one.
    /// Exit code: 0 ok, 1 errors, 2 bad arguments or bundle, 3 stopped on conflicts.
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
                var r = PlannerImporter.Import(path, Environment.GetCommandLineArgs().Contains("-hohOverwrite"));
                Debug.Log($"[Planner bridge] Files: {r}. Code changed: {r.CodeChanged}.");
                EditorApplication.Exit(0);
            }
            catch (PlannerConflictException e)
            {
                Debug.LogError($"[Planner bridge] {e.Message}\n{string.Join("\n", e.Conflicts)}");
                EditorApplication.Exit(3);
            }
            catch (PlannerImportException e)
            {
                Debug.LogError($"[Planner bridge] {e.Message}");
                EditorApplication.Exit(2);
            }
        }

        /// <summary>Lists what importing -hohBundle would do, writing nothing. Exit code 3 when it would stop on conflicts.</summary>
        public static void Preview()
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
                var plan = PlannerImporter.Preview(PlannerBundle.FromPath(path), PlannerBridgeSettings.instance.Root);
                Debug.Log($"[Planner bridge] Preview: {plan.Describe()}.\n{string.Join("\n", plan.Entries.Where(e => e.Action != PlanAction.Unchanged).Select(e => $"{e.Action,-11} {e.Path}{(e.Reason != null ? $" ({e.Reason})" : "")}"))}");
                EditorApplication.Exit(plan.Conflicts.Count > 0 ? 3 : 0);
            }
            catch (PlannerImportException e)
            {
                Debug.LogError($"[Planner bridge] {e.Message}");
                EditorApplication.Exit(2);
            }
        }

        /// <summary>Undoes the last write into the planner folder from its backup.</summary>
        public static void RestoreLastImport()
        {
            Debug.Log($"[Planner bridge] {PlannerImporter.RestoreLastImport()}");
            EditorApplication.Exit(0);
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

        /// <summary>
        /// -executeMethod HoHPlanner.Bridge.Editor.PlannerCI.BuildScenes -plannerPhase "Vertical Slice": the planned scenes
        /// of that roadmap phase (its name or index) into the Build Settings. Exit code 0, 1 when a planned scene has no
        /// scene asset, 2 when the phase is unknown or there is no generated PlannerScenes. A plan without roadmap
        /// phases takes no -plannerPhase: all its planned scenes go in.
        /// </summary>
        public static void BuildScenes()
        {
            try
            {
                var phases = PlannerBuildScenes.Phases();
                var arg = Arg("-plannerPhase") ?? "";
                var phase = int.TryParse(arg, out var i) ? i : Array.FindIndex(phases, p => string.Equals(p, arg, StringComparison.OrdinalIgnoreCase));
                // A plan without roadmap phases: every planned scene is in builds from the start.
                if (phases.Length == 0 && arg == "")
                {
                    var none = PlannerBuildScenes.Apply(0);
                    Debug.Log($"[Planner bridge] Build Settings (the plan has no roadmap phases): {string.Join(", ", EditorBuildSettings.scenes.Select(s => s.path))}.");
                    if (none.Length > 0) Debug.LogWarning($"[Planner bridge] No scene asset yet for: {string.Join(", ", none)}.");
                    EditorApplication.Exit(none.Length > 0 ? 1 : 0);
                    return;
                }
                if (phase < 0 || phase >= phases.Length)
                {
                    Debug.LogError($"[Planner bridge] -plannerPhase: “{arg}” is not one of {string.Join(", ", phases)}.");
                    EditorApplication.Exit(2);
                    return;
                }
                var missing = PlannerBuildScenes.Apply(phase);
                Debug.Log($"[Planner bridge] Build Settings for {phases[phase]}: {string.Join(", ", EditorBuildSettings.scenes.Select(s => s.path))}.");
                if (missing.Length > 0) Debug.LogWarning($"[Planner bridge] No scene asset yet for: {string.Join(", ", missing)}.");
                EditorApplication.Exit(missing.Length > 0 ? 1 : 0);
            }
            catch (PlannerImportException e)
            {
                Debug.LogError($"[Planner bridge] {e.Message}");
                EditorApplication.Exit(2);
            }
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
