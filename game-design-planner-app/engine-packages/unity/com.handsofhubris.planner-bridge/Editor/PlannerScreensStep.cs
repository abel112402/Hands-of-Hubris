using System;
using System.Linq;
using System.Reflection;
using UnityEditor;
using UnityEngine;

namespace HoHPlanner.Bridge.Editor
{
    /// <summary>
    /// After every record import: the generated PlannerScreenSet (UI/UX › Screens) gets the UXML of every planned screen,
    /// in &lt;root&gt;/Screens.asset, so a PlannerScreenRouter only needs that one asset. The generated type does the work
    /// (its PlannerCreateOrUpdate); the bridge only calls it, so it needs no reference to the game's code.
    /// </summary>
    [InitializeOnLoad]
    public static class PlannerScreensStep
    {
        static PlannerScreensStep()
        {
            PlannerImporter.AfterRecords += (root, manifest, result) =>
            {
                if (Apply(root) is UnityEngine.Object set) Debug.Log($"[Planner bridge] Screens: {AssetDatabase.GetAssetPath(set)} updated.");
            };
        }

        /// <summary>Calls the generated PlannerCreateOrUpdate(root); null when the export has no screens.</summary>
        public static object Apply(string root)
        {
            var method = TypeCache.GetTypesDerivedFrom<ScriptableObject>()
                .Where(t => !t.Assembly.GetName().Name.EndsWith(".Tests", StringComparison.Ordinal))
                .Select(t => t.GetMethod("PlannerCreateOrUpdate", BindingFlags.Public | BindingFlags.Static, null, new[] { typeof(string) }, null))
                .FirstOrDefault(m => m != null);
            return method?.Invoke(null, new object[] { root });
        }
    }
}
