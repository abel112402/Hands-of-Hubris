using System.Collections.Generic;
using System.IO;
using System.Linq;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEngine;

namespace HoHPlanner.Bridge.Editor
{
    public sealed class SetupResult
    {
        public int Created;
        public int Unchanged;
        /// <summary>Files that exist with other content: the planner's version is written next to them as *.planner.</summary>
        public readonly List<string> Differs = new List<string>();
        public int Assemblies;

        public override string ToString() =>
            $"{Created} created, {Unchanged} already as planned" + (Assemblies > 0 ? $", {Assemblies} assembly definitions" : "") + (Differs.Count > 0 ? $"; differ from the plan (see the .planner copy): {string.Join(", ", Differs)}" : "");
    }

    /// <summary>
    /// Project set-up from the plan (Coding Standards, Architecture): .editorconfig, .gitattributes and .gitignore at the
    /// project root, and the planned folders with one assembly definition per module. Never overwrites anything.
    /// </summary>
    public static class PlannerSetup
    {
        public static readonly string[] ProjectFiles = { ".editorconfig", ".gitattributes", ".gitignore" };

        public static string ProjectRoot => Path.GetFullPath(Path.Combine(Application.dataPath, ".."));

        /// <summary>Copies the planned project files to <paramref name="projectRoot"/>; an existing different file is kept and the plan's version is written beside it.</summary>
        public static SetupResult InstallProjectFiles(string root = null, string projectRoot = null)
        {
            root = root ?? PlannerBridgeSettings.instance.Root;
            projectRoot = projectRoot ?? ProjectRoot;
            var result = new SetupResult();
            foreach (var name in ProjectFiles)
            {
                var source = $"{root}/Unity/ProjectFiles/{name}";
                if (!File.Exists(source)) throw new PlannerImportException($"{source} is missing: import a planner export made for Unity first.");
                var text = File.ReadAllText(source);
                var target = Path.Combine(projectRoot, name);
                if (!File.Exists(target))
                {
                    File.WriteAllText(target, text);
                    result.Created++;
                }
                else if (File.ReadAllText(target).Replace("\r\n", "\n") == text.Replace("\r\n", "\n")) result.Unchanged++;
                else
                {
                    File.WriteAllText(target + ".planner", text);
                    result.Differs.Add(name);
                }
            }
            return result;
        }

        /// <summary>Creates the planned folders under Assets/ and each module folder's assembly definition when the folder has none. Does not refresh.</summary>
        public static SetupResult CreateFolders(string root = null, string projectRoot = null)
        {
            root = root ?? PlannerBridgeSettings.instance.Root;
            projectRoot = projectRoot ?? ProjectRoot;
            var path = $"{root}/Unity/ProjectFiles/setup.json";
            if (!File.Exists(path)) throw new PlannerImportException($"{path} is missing: import a planner export made for Unity first.");
            JObject setup;
            try
            {
                setup = JObject.Parse(File.ReadAllText(path));
            }
            catch (JsonException e)
            {
                throw new PlannerImportException($"setup.json is not valid JSON: {e.Message}");
            }
            var result = new SetupResult();
            foreach (var f in setup["folders"] as JArray ?? new JArray())
            {
                var rel = (string)f["path"];
                if (string.IsNullOrEmpty(rel) || !rel.StartsWith("Assets/") || !PlannerBundle.IsSafeRelative(rel)) continue;
                var dir = Path.Combine(projectRoot, rel);
                if (Directory.Exists(dir)) result.Unchanged++;
                else
                {
                    Directory.CreateDirectory(dir);
                    result.Created++;
                }
                if (!(f["asmdef"] is JObject asm) || Directory.GetFiles(dir, "*.asmdef").Length > 0) continue;
                var name = (string)asm["name"];
                if (string.IsNullOrEmpty(name) || name.IndexOfAny(Path.GetInvalidFileNameChars()) >= 0) continue;
                var json = new JObject
                {
                    ["name"] = name,
                    ["rootNamespace"] = (string)asm["rootNamespace"] ?? name,
                    ["references"] = new JArray((asm["references"] as JArray ?? new JArray()).Select(x => (string)x).Where(x => !string.IsNullOrEmpty(x))),
                    ["autoReferenced"] = true,
                };
                File.WriteAllText(Path.Combine(dir, name + ".asmdef"), json.ToString(Formatting.Indented) + "\n");
                result.Assemblies++;
            }
            return result;
        }

        [MenuItem("Tools/Game Design Planner/Set up project/Create planned folders and assemblies", priority = 40)]
        public static void CreateFoldersMenu()
        {
            try
            {
                var r = CreateFolders();
                AssetDatabase.Refresh();
                Debug.Log($"[Planner bridge] Folders: {r}.");
            }
            catch (PlannerImportException e)
            {
                EditorUtility.DisplayDialog("Game Design Planner", e.Message, "OK");
            }
        }

        [MenuItem("Tools/Game Design Planner/Set up project/Install .editorconfig, .gitattributes, .gitignore", priority = 41)]
        public static void InstallFilesMenu()
        {
            try
            {
                Debug.Log($"[Planner bridge] Project files: {InstallProjectFiles()}.");
            }
            catch (PlannerImportException e)
            {
                EditorUtility.DisplayDialog("Game Design Planner", e.Message, "OK");
            }
        }
    }
}
