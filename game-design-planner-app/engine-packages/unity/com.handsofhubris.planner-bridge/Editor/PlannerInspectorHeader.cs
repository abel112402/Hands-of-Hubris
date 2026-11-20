using UnityEditor;
using UnityEngine;

namespace HoHPlanner.Bridge.Editor
{
    /// <summary>A note above the Inspector of every planner record: which fields the planner owns and which are yours.</summary>
    [InitializeOnLoad]
    internal static class PlannerInspectorHeader
    {
        static PlannerInspectorHeader()
        {
            UnityEditor.Editor.finishedDefaultHeaderGUI += Draw;
        }

        private static void Draw(UnityEditor.Editor editor)
        {
            if (editor.targets.Length != 1 || !(editor.target is ScriptableObject so)) return;
            var schemaId = RecordValues.SchemaIdOf(so.GetType());
            if (schemaId == null) return;
            var settings = PlannerBridgeSettings.instance;
            var index = AssetDatabase.LoadAssetAtPath<PlannerIndex>($"{settings.Root}/{PlannerImporter.IndexFile}");
            PlannerIndexEntry entry = null;
            if (index != null)
                foreach (var e in index.Entries)
                    if (e.asset == so)
                    {
                        entry = e;
                        break;
                    }
            var text = entry == null
                ? "A planner type. Records made by hand are not updated by the importer."
                : $"Planner record {entry.key}. The next import overwrites the values the planner has; sprites, prefabs, sounds and other asset fields you set here are kept."
                  + (entry.deprecated ? "\nNo longer in the plan: delete it when nothing uses it." : "");
            EditorGUILayout.HelpBox(text, entry != null && entry.deprecated ? MessageType.Warning : MessageType.Info);
            if (!string.IsNullOrWhiteSpace(settings.plannerUrl) && GUILayout.Button("Open in planner"))
                Application.OpenURL(settings.plannerUrl.TrimEnd('/') + "/#/doc/technical.dataDriven?s=schemas");
        }
    }
}
