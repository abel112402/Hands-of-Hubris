using System;
using System.IO;
using System.Linq;
using System.Reflection;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEngine;
using UnityEngine.Rendering;

namespace HoHPlanner.Bridge.Editor
{
    /// <summary>
    /// CI helpers for a playable-prototype project (the planner's Unity gate, plans/UNITY_PLAYABLE_GAME_GENERATION_PLAN.md
    /// phase 13). They change project settings, so they only run when called; nothing calls them on its own.
    /// </summary>
    public static class PlannerCIProject
    {
        public const string SettingsFolder = "Assets/Settings/Planner";

        /// <summary>
        /// -executeMethod HoHPlanner.Bridge.Editor.PlannerCIProject.Prepare: sets Active Input Handling to “Both” (takes
        /// effect when Unity starts again) and, when no URP asset is the default render pipeline, makes one (with its
        /// renderer) under Assets/Settings/Planner and sets it. Exit code 0, 1 when the Input System or URP is not installed.
        /// </summary>
        public static void Prepare()
        {
            var problems = PrepareProject(out var notes);
            foreach (var n in notes) Debug.Log($"[Planner bridge] Prepare: {n}");
            foreach (var p in problems) Debug.LogError($"[Planner bridge] Prepare: {p}");
            EditorApplication.Exit(problems.Length > 0 ? 1 : 0);
        }

        public static string[] PrepareProject(out string[] notes)
        {
            var done = new System.Collections.Generic.List<string>();
            var problems = new System.Collections.Generic.List<string>();

            // Active Input Handling: 0 old Input Manager, 1 Input System, 2 both.
            if (Type.GetType("UnityEngine.InputSystem.InputSystem, Unity.InputSystem") == null) problems.Add("the Input System package is not installed (Window ▸ Package Manager ▸ Input System).");
            else
            {
                var player = Unsupported.GetSerializedAssetInterfaceSingleton("PlayerSettings");
                var so = new SerializedObject(player);
                var handler = so.FindProperty("activeInputHandler");
                if (handler == null) problems.Add("this Unity version has no Active Input Handling setting the bridge knows.");
                else if (handler.intValue != 2)
                {
                    handler.intValue = 2;
                    so.ApplyModifiedPropertiesWithoutUndo();
                    AssetDatabase.SaveAssets();
                    done.Add("Active Input Handling set to Both (Unity applies it when it starts again).");
                }
            }

            // URP as the default render pipeline.
            const string urp = "UnityEngine.Rendering.Universal.{0}, Unity.RenderPipelines.Universal.Runtime";
            var assetType = Type.GetType(string.Format(urp, "UniversalRenderPipelineAsset"));
            var rendererType = Type.GetType(string.Format(urp, "UniversalRendererData"));
            var baseRendererType = Type.GetType(string.Format(urp, "ScriptableRendererData"));
            var current = GraphicsSettings.defaultRenderPipeline;
            if (assetType == null || rendererType == null || baseRendererType == null) problems.Add("the Universal Render Pipeline package is not installed (Window ▸ Package Manager ▸ Universal RP).");
            else if (current == null || !assetType.IsInstanceOfType(current))
            {
                Directory.CreateDirectory(SettingsFolder);
                var rendererPath = $"{SettingsFolder}/PlannerURP_Renderer.asset";
                var assetPath = $"{SettingsFolder}/PlannerURP.asset";
                var renderer = AssetDatabase.LoadAssetAtPath(rendererPath, rendererType) ?? Create(rendererType, rendererPath);
                var asset = AssetDatabase.LoadAssetAtPath(assetPath, assetType) as RenderPipelineAsset;
                if (asset == null)
                {
                    var create = assetType.GetMethod("Create", BindingFlags.Public | BindingFlags.Static, null, new[] { baseRendererType }, null);
                    asset = create?.Invoke(null, new object[] { renderer }) as RenderPipelineAsset;
                    if (asset != null) AssetDatabase.CreateAsset(asset, assetPath);
                }
                if (asset == null) problems.Add("could not make a URP asset with this URP version; set one in Project Settings › Graphics.");
                else
                {
                    GraphicsSettings.defaultRenderPipeline = asset;
                    AssetDatabase.SaveAssets();
                    done.Add($"{assetPath} is the default render pipeline.");
                }
            }
            if (done.Count == 0 && problems.Count == 0) done.Add("already prepared.");
            notes = done.ToArray();
            return problems.ToArray();
        }

        private static UnityEngine.Object Create(Type type, string path)
        {
            var o = ScriptableObject.CreateInstance(type);
            AssetDatabase.CreateAsset(o, path);
            return o;
        }

        /// <summary>
        /// -executeMethod HoHPlanner.Bridge.Editor.PlannerCIProject.BuildPlayer -hohBuildPath path/Game.exe
        /// [-hohBuildTarget StandaloneWindows64]: builds the enabled Build Settings scenes (put the planned ones there
        /// with PlannerCI.BuildScenes). The target defaults to the editor's active one. Exit code 0 built, 1 the build
        /// failed, 2 bad arguments or no scenes.
        /// </summary>
        public static void BuildPlayer()
        {
            var path = Arg("-hohBuildPath");
            var targetName = Arg("-hohBuildTarget");
            var target = EditorUserBuildSettings.activeBuildTarget;
            if (string.IsNullOrEmpty(path) || (targetName != null && !Enum.TryParse(targetName, out target)))
            {
                Debug.LogError("[Planner bridge] BuildPlayer: -hohBuildPath <file> is needed, and -hohBuildTarget must be a BuildTarget name (e.g. StandaloneWindows64).");
                EditorApplication.Exit(2);
                return;
            }
            var scenes = EditorBuildSettings.scenes.Where(s => s.enabled).Select(s => s.path).ToArray();
            if (scenes.Length == 0)
            {
                Debug.LogError("[Planner bridge] BuildPlayer: no scene in the Build Settings; run PlannerCI.BuildScenes first.");
                EditorApplication.Exit(2);
                return;
            }
            var report = BuildPipeline.BuildPlayer(new BuildPlayerOptions { scenes = scenes, locationPathName = path, target = target, options = BuildOptions.None });
            Debug.Log($"[Planner bridge] BuildPlayer {target} ({string.Join(", ", scenes)}): {report.summary.result}, {report.summary.totalErrors} error(s), {report.summary.totalSize} bytes.");
            EditorApplication.Exit(report.summary.result == BuildResult.Succeeded ? 0 : 1);
        }

        private static string Arg(string name)
        {
            var args = Environment.GetCommandLineArgs();
            var i = Array.IndexOf(args, name);
            return i >= 0 && i + 1 < args.Length ? args[i + 1] : null;
        }
    }
}
