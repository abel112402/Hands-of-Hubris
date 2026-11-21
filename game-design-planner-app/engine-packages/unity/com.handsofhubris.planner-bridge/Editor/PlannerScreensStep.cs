using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using UnityEditor;
using UnityEngine;

namespace HoHPlanner.Bridge.Editor
{
    /// <summary>
    /// After every record import: the generated types that keep assets in step with the plan get their turn — the
    /// PlannerScreenSet (Screens.asset with every planned screen's UXML) and PlannerAudioEvent (one asset per planned
    /// sound under Audio/). Each has a static PlannerCreateOrUpdate(root); the bridge only calls it, so it needs no
    /// reference to the game's code.
    /// </summary>
    [InitializeOnLoad]
    public static class PlannerScreensStep
    {
        static PlannerScreensStep()
        {
            PlannerImporter.AfterRecords += (root, manifest, result) =>
            {
                foreach (var type in Apply(root)) Debug.Log($"[Planner bridge] {type.Name}: assets updated from the plan.");
            };
        }

        /// <summary>The generated types with a static PlannerCreateOrUpdate(string root) (test assemblies left out).</summary>
        public static IEnumerable<MethodInfo> Steps() =>
            TypeCache.GetTypesDerivedFrom<ScriptableObject>()
                .Where(t => !t.Assembly.GetName().Name.EndsWith(".Tests", StringComparison.Ordinal))
                .Select(t => t.GetMethod("PlannerCreateOrUpdate", BindingFlags.Public | BindingFlags.Static, null, new[] { typeof(string) }, null))
                .Where(m => m != null)
                .OrderBy(m => m.DeclaringType.FullName, StringComparer.Ordinal);

        /// <summary>Calls every step; returns the types that ran.</summary>
        public static List<Type> Apply(string root)
        {
            var ran = new List<Type>();
            foreach (var m in Steps())
            {
                m.Invoke(null, new object[] { root });
                ran.Add(m.DeclaringType);
            }
            return ran;
        }
    }
}
