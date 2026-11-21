using System;
using System.Linq;
using System.Reflection;

namespace HoHPlanner.Bridge.Editor
{
    /// <summary>
    /// The planned scenes of a roadmap phase into the Build Settings. The generated PlannerScenes does the work
    /// (PlannerBuildSettings(phase)); the bridge finds it by name, so it needs no reference to the game's code.
    /// </summary>
    public static class PlannerBuildScenes
    {
        private const BindingFlags Static = BindingFlags.Public | BindingFlags.Static;

        /// <summary>The generated PlannerScenes type, or null before an export with scenes.</summary>
        public static Type ScenesType()
        {
            foreach (var assembly in AppDomain.CurrentDomain.GetAssemblies())
            {
                if (assembly.IsDynamic || assembly.GetName().Name.EndsWith(".Tests", StringComparison.Ordinal)) continue;
                Type[] types;
                try
                {
                    types = assembly.GetTypes();
                }
                catch (ReflectionTypeLoadException e)
                {
                    types = e.Types.Where(t => t != null).ToArray();
                }
                var found = types.FirstOrDefault(t => t.Name == "PlannerScenes" && t.GetMethod("PlannerBuildSettings", Static) != null);
                if (found != null) return found;
            }
            return null;
        }

        /// <summary>The roadmap phases, from the generated PlannerScenes; empty without one.</summary>
        public static string[] Phases() => ScenesType()?.GetField("Phases", Static)?.GetValue(null) as string[] ?? Array.Empty<string>();

        /// <summary>Sets the Build Settings for the phase (an index into Phases); returns the planned scenes with no scene asset yet.</summary>
        public static string[] Apply(int phase)
        {
            var type = ScenesType() ?? throw new PlannerImportException("No generated PlannerScenes: plan scenes in Technical Architecture › Scenes and import the export.");
            return (string[])type.GetMethod("PlannerBuildSettings", Static).Invoke(null, new object[] { phase });
        }
    }
}
