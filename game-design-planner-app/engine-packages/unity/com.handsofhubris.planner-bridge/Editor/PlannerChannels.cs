using System;
using System.IO;
using System.Linq;
using System.Reflection;
using UnityEditor;
using UnityEngine;

namespace HoHPlanner.Bridge.Editor
{
    /// <summary>
    /// One asset per ScriptableObject channel of the Architecture (generated types with a ChannelId constant), in
    /// &lt;root&gt;/Channels/, so components can reference the channel in the Inspector. Made when missing, never replaced.
    /// Runs after every record import.
    /// </summary>
    [InitializeOnLoad]
    public static class PlannerChannels
    {
        public const string Folder = "Channels";

        static PlannerChannels()
        {
            PlannerImporter.AfterRecords += (root, manifest, result) =>
            {
                var made = Apply(root);
                if (made > 0) Debug.Log($"[Planner bridge] Channels: {made} channel asset(s) made.");
            };
        }

        /// <summary>The generated channel types: ScriptableObjects with a public const string ChannelId (test assemblies left out unless asked).</summary>
        public static Type[] ChannelTypes(bool includeTests = false) =>
            TypeCache.GetTypesDerivedFrom<ScriptableObject>()
                .Where(t => includeTests || !t.Assembly.GetName().Name.EndsWith(".Tests", StringComparison.Ordinal))
                .Where(t => !t.IsAbstract && t.GetField("ChannelId", BindingFlags.Public | BindingFlags.Static) is FieldInfo f && f.IsLiteral && f.FieldType == typeof(string))
                .OrderBy(t => t.FullName, StringComparer.Ordinal)
                .ToArray();

        public static int Apply(string root, bool includeTests = false)
        {
            var made = 0;
            foreach (var type in ChannelTypes(includeTests))
            {
                var path = $"{root}/{Folder}/{type.Name}.asset";
                if (AssetDatabase.LoadAssetAtPath<ScriptableObject>(path) != null) continue;
                Directory.CreateDirectory($"{root}/{Folder}");
                AssetDatabase.CreateAsset(ScriptableObject.CreateInstance(type), path);
                made++;
            }
            if (made > 0) AssetDatabase.SaveAssets();
            return made;
        }
    }
}
