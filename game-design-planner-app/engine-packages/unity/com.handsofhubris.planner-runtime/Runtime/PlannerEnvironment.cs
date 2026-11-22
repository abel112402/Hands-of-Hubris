using System.Collections.Generic;
using UnityEngine.Rendering;

namespace HoHPlanner.Runtime
{
    /// <summary>
    /// What the project around the runtime provides, for the first support profile (3D, URP, Input System). The
    /// answers come from compile-time defines (package installed, input handling active) and the active render
    /// pipeline, so they hold in builds as well as in the editor.
    /// </summary>
    public static class PlannerEnvironment
    {
#if HOH_INPUT_SYSTEM
        public static bool InputSystemInstalled => true;
#else
        public static bool InputSystemInstalled => false;
#endif

#if ENABLE_INPUT_SYSTEM
        /// <summary>Player Settings › Active Input Handling includes the Input System.</summary>
        public static bool InputSystemActive => true;
#else
        public static bool InputSystemActive => false;
#endif

#if HOH_URP
        public static bool UrpInstalled => true;
#else
        public static bool UrpInstalled => false;
#endif

        /// <summary>The active render pipeline asset is URP's (by type name, so the runtime needs no URP reference).</summary>
        public static bool UrpActive
        {
            get
            {
                var rp = GraphicsSettings.currentRenderPipeline;
                return rp != null && rp.GetType().Name == "UniversalRenderPipelineAsset";
            }
        }

        /// <summary>Readable problems for the URP + Input System profile; empty when it is complete.</summary>
        public static List<string> ProblemsForUrpInputProfile()
        {
            var problems = new List<string>();
            if (!InputSystemInstalled) problems.Add("The Input System package (com.unity.inputsystem 1.7 or later) is not installed: Window › Package Manager › Unity Registry › Input System.");
            else if (!InputSystemActive) problems.Add("The Input System is installed but not active: Project Settings › Player › Active Input Handling → Input System Package (or Both).");
            if (!UrpInstalled) problems.Add("The Universal Render Pipeline package (com.unity.render-pipelines.universal 14 or later) is not installed: Window › Package Manager › Unity Registry › Universal RP.");
            else if (!UrpActive) problems.Add("URP is installed but not the active render pipeline: Project Settings › Graphics › Default Render Pipeline → a URP asset.");
            return problems;
        }
    }
}
