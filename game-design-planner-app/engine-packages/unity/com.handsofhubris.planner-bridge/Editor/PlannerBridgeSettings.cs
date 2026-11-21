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

        [Tooltip("Let the planner (running locally) select records here and, in Play mode, push its values into the running game. Listens on 127.0.0.1 only, with a token.")]
        public bool liveLink;

        [Tooltip("Port of the live link on 127.0.0.1.")]
        public int liveLinkPort = 51701;

        [Tooltip("After each import, give records without a sprite or prefab a placeholder in the plan's palette, with the record's initials. The real asset always wins.")]
        public bool placeholders = true;

        [Tooltip("The bundle imported last, for “Reimport last”. A path on this machine.")]
        public string lastBundlePath = "";

        public string Root => string.IsNullOrWhiteSpace(rootFolder) ? "Assets/HoHPlanner" : rootFolder.Trim().TrimEnd('/', '\\').Replace('\\', '/');

        public void Save() => Save(true);
    }
}
