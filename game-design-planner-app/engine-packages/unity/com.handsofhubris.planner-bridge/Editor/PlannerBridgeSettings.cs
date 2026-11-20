using UnityEditor;
using UnityEngine;

namespace HoHPlanner.Bridge.Editor
{
    /// <summary>Project settings of the planner bridge, saved in ProjectSettings/ so the whole team shares them.</summary>
    [FilePath("ProjectSettings/HoHPlannerBridge.asset", FilePathAttribute.Location.ProjectFolder)]
    public sealed class PlannerBridgeSettings : ScriptableSingleton<PlannerBridgeSettings>
    {
        [Tooltip("Where the export goes. Must be inside Assets/.")]
        public string rootFolder = "Assets/HoHPlanner";

        [Tooltip("Address of your planner (for “Open in planner”). Leave empty to hide the button.")]
        public string plannerUrl = "";

        [Tooltip("When the planner writes the export into the folder itself (linked engine folder), finish the import as soon as Unity sees the change.")]
        public bool autoImport = true;

        [Tooltip("The bundle imported last, for “Reimport last”. A path on this machine.")]
        public string lastBundlePath = "";

        public string Root => string.IsNullOrWhiteSpace(rootFolder) ? "Assets/HoHPlanner" : rootFolder.Trim().TrimEnd('/', '\\').Replace('\\', '/');

        public void Save() => Save(true);
    }
}
