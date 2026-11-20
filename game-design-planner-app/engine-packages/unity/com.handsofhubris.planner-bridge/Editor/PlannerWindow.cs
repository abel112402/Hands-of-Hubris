using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEngine;

namespace HoHPlanner.Bridge.Editor
{
    /// <summary>Window ▸ Game Design Planner: settings, import, validation and the planner data of the selected record.</summary>
    public sealed class PlannerWindow : EditorWindow
    {
        private Vector2 scroll;
        private string status = "";
        private List<ValidationIssue> issues;

        [MenuItem("Window/Game Design Planner")]
        public static void Open() => GetWindow<PlannerWindow>("Game Design Planner");

        [MenuItem("Tools/Game Design Planner/Import bundle (.zip)…", priority = 1)]
        public static void ImportZip()
        {
            var path = EditorUtility.OpenFilePanel("Planner engine export", "", "zip");
            if (!string.IsNullOrEmpty(path)) RunImport(path);
        }

        [MenuItem("Tools/Game Design Planner/Import folder…", priority = 2)]
        public static void ImportFolder()
        {
            var path = EditorUtility.OpenFolderPanel("Unpacked planner engine export", "", "");
            if (!string.IsNullOrEmpty(path)) RunImport(path);
        }

        [MenuItem("Tools/Game Design Planner/Reimport last", priority = 3)]
        public static void Reimport()
        {
            var path = PlannerBridgeSettings.instance.lastBundlePath;
            if (string.IsNullOrEmpty(path)) EditorUtility.DisplayDialog("Game Design Planner", "Nothing imported yet.", "OK");
            else RunImport(path);
        }

        [MenuItem("Tools/Game Design Planner/Reimport last", true)]
        private static bool CanReimport() => !string.IsNullOrEmpty(PlannerBridgeSettings.instance.lastBundlePath);

        [MenuItem("Tools/Game Design Planner/Write report for the planner", priority = 21)]
        public static void WriteReport()
        {
            try
            {
                var path = PlannerReport.Write();
                EditorUtility.RevealInFinder(path);
                Debug.Log($"[Planner bridge] Report written: {path}. In the planner: Save ▾ › Import engine report…");
            }
            catch (PlannerImportException e)
            {
                EditorUtility.DisplayDialog("Game Design Planner", e.Message, "OK");
            }
        }

        [MenuItem("Tools/Game Design Planner/Validate", priority = 20)]
        public static void ValidateMenu()
        {
            var found = PlannerValidator.Run();
            foreach (var i in found)
            {
                if (i.Level == IssueLevel.Error) Debug.LogError($"[Planner bridge] {i.Message}", i.Asset);
                else if (i.Level == IssueLevel.Warning) Debug.LogWarning($"[Planner bridge] {i.Message}", i.Asset);
                else Debug.Log($"[Planner bridge] {i.Message}", i.Asset);
            }
            if (HasOpenInstances<PlannerWindow>()) GetWindow<PlannerWindow>().issues = found;
            Debug.Log($"[Planner bridge] Validation: {found.Count(i => i.Level == IssueLevel.Error)} error(s), {found.Count(i => i.Level == IssueLevel.Warning)} warning(s).");
        }

        private static void RunImport(string path)
        {
            try
            {
                var r = PlannerImporter.Import(path);
                var msg = $"Files: {r.Written} written, {r.Unchanged} unchanged, {r.Deleted} removed, {r.KeptYours} of your class files kept." + (r.Notes.Count > 0 ? " " + string.Join(" ", r.Notes) : "") + (r.CodeChanged ? " Records follow once the scripts compiled." : "");
                Debug.Log($"[Planner bridge] {msg}");
                if (HasOpenInstances<PlannerWindow>()) GetWindow<PlannerWindow>().status = msg;
            }
            catch (PlannerImportException e)
            {
                EditorUtility.DisplayDialog("Planner import", e.Message, "OK");
            }
        }

        private void OnEnable()
        {
            PlannerImporter.RecordsImported += OnRecords;
            Selection.selectionChanged += Repaint;
        }

        private void OnDisable()
        {
            PlannerImporter.RecordsImported -= OnRecords;
            Selection.selectionChanged -= Repaint;
        }

        private void OnRecords(RecordStepResult r)
        {
            status = $"Records: {r}.";
            Repaint();
        }

        private void OnGUI()
        {
            var settings = PlannerBridgeSettings.instance;
            scroll = EditorGUILayout.BeginScrollView(scroll);
            EditorGUILayout.LabelField("Settings", EditorStyles.boldLabel);
            EditorGUI.BeginChangeCheck();
            settings.rootFolder = EditorGUILayout.TextField(new GUIContent("Folder", "Where the export goes, inside Assets/."), settings.rootFolder);
            settings.plannerUrl = EditorGUILayout.TextField(new GUIContent("Planner address", "For “Open in planner”. Optional."), settings.plannerUrl);
            settings.autoImport = EditorGUILayout.Toggle(new GUIContent("Import when the planner writes", "For a linked engine folder: the planner writes the export into the folder on save; Unity finishes the import when it notices."), settings.autoImport);
            if (EditorGUI.EndChangeCheck()) settings.Save();

            EditorGUILayout.Space();
            EditorGUILayout.LabelField("Import", EditorStyles.boldLabel);
            using (new EditorGUILayout.HorizontalScope())
            {
                if (GUILayout.Button("Import .zip…")) ImportZip();
                if (GUILayout.Button("Import folder…")) ImportFolder();
                using (new EditorGUI.DisabledScope(string.IsNullOrEmpty(settings.lastBundlePath)))
                    if (GUILayout.Button("Reimport last")) Reimport();
            }
            if (!string.IsNullOrEmpty(settings.lastBundlePath)) EditorGUILayout.LabelField("Last", Path.GetFileName(settings.lastBundlePath), EditorStyles.miniLabel);
            if (!string.IsNullOrEmpty(status)) EditorGUILayout.HelpBox(status, MessageType.None);

            EditorGUILayout.Space();
            EditorGUILayout.LabelField("Validation", EditorStyles.boldLabel);
            using (new EditorGUILayout.HorizontalScope())
            {
                if (GUILayout.Button("Validate records")) issues = PlannerValidator.Run();
                if (GUILayout.Button("Write report for the planner")) WriteReport();
            }
            if (issues != null)
            {
                if (issues.Count == 0) EditorGUILayout.HelpBox("No findings.", MessageType.Info);
                foreach (var i in issues.Take(200))
                    using (new EditorGUILayout.HorizontalScope())
                    {
                        EditorGUILayout.HelpBox(i.Message, i.Level == IssueLevel.Error ? MessageType.Error : i.Level == IssueLevel.Warning ? MessageType.Warning : MessageType.Info);
                        if (i.Asset != null && GUILayout.Button("Select", GUILayout.Width(60))) Selection.activeObject = i.Asset;
                    }
            }

            EditorGUILayout.Space();
            EditorGUILayout.LabelField("Selected record", EditorStyles.boldLabel);
            DrawSelected(settings);
            EditorGUILayout.EndScrollView();
        }

        /// <summary>The planner's JSON of the selected record, read from the imported Data/ folder.</summary>
        private static void DrawSelected(PlannerBridgeSettings settings)
        {
            var index = AssetDatabase.LoadAssetAtPath<PlannerIndex>($"{settings.Root}/{PlannerImporter.IndexFile}");
            var entry = index?.Entries.FirstOrDefault(e => e.asset != null && e.asset == Selection.activeObject);
            if (entry == null)
            {
                EditorGUILayout.LabelField("Select a planner record asset.", EditorStyles.miniLabel);
                return;
            }
            EditorGUILayout.LabelField("Key", entry.key);
            EditorGUILayout.LabelField("Planner ID", entry.plannerId);
            var file = Directory.Exists($"{settings.Root}/Data") ? Directory.GetFiles($"{settings.Root}/Data", "*.json", SearchOption.AllDirectories).FirstOrDefault(f => Path.GetFileNameWithoutExtension(f) == entry.key) : null;
            if (file != null) EditorGUILayout.TextArea(File.ReadAllText(file), EditorStyles.helpBox);
        }
    }
}
