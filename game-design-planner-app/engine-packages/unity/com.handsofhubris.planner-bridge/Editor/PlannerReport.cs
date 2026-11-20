using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEngine;

namespace HoHPlanner.Bridge.Editor
{
    /// <summary>
    /// Writes hoh-engine-report.json next to the import: the state of every record and class of the plan in this
    /// project, for the planner (Save ▾ › Import engine report…). The planner only reads it; it never changes the plan.
    /// </summary>
    public static class PlannerReport
    {
        public const string FileName = "hoh-engine-report.json";

        /// <summary>Builds and writes the report. Returns its path.</summary>
        public static string Write(string root = null)
        {
            root = root ?? PlannerBridgeSettings.instance.Root;
            var path = $"{root}/{FileName}";
            File.WriteAllText(path, Build(root).ToString(Formatting.Indented));
            AssetDatabase.ImportAsset(path);
            return path;
        }

        public static JObject Build(string root)
        {
            var manifestPath = $"{root}/hoh-engine.json";
            if (!File.Exists(manifestPath)) throw new PlannerImportException($"No planner export in {root} (hoh-engine.json is missing).");
            var manifest = PlannerManifest.Parse(File.ReadAllText(manifestPath));
            manifest.FileHashes.TryGetValue("ir/engine-ir.json", out var irHash);
            return new JObject
            {
                ["format"] = "hoh-engine-report",
                ["v"] = 1,
                ["engine"] = "unity",
                ["engineVersion"] = Application.unityVersion,
                ["generatedAt"] = DateTime.UtcNow.ToString("o"),
                ["project"] = new JObject { ["name"] = manifest.ProjectName },
                ["irHash"] = irHash ?? "",
                ["records"] = Records(root, manifest),
                ["classes"] = Classes(root),
                ["metrics"] = new JArray(),
            };
        }

        private static JObject Record(string plannerId, string schema, string key, string status, string assetPath = null, IEnumerable<string> issues = null)
        {
            var o = new JObject { ["plannerId"] = plannerId, ["schema"] = schema, ["key"] = key, ["status"] = status };
            if (!string.IsNullOrEmpty(assetPath)) o["assetPath"] = assetPath;
            var list = issues?.Take(20).ToList();
            if (list != null && list.Count > 0) o["issues"] = new JArray(list);
            return o;
        }

        private static JArray Records(string root, PlannerManifest manifest)
        {
            var output = new JArray();
            var index = AssetDatabase.LoadAssetAtPath<PlannerIndex>($"{root}/{PlannerImporter.IndexFile}");
            var issues = PlannerValidator.Run(root).Where(i => i.Asset != null && i.Level != IssueLevel.Info).GroupBy(i => i.Asset).ToDictionary(g => g.Key, g => g.Select(i => StripKey(i.Message)).ToList());
            var inIndex = new HashSet<string>();
            if (index != null)
                foreach (var e in index.Entries)
                {
                    if (e == null || string.IsNullOrEmpty(e.plannerId)) continue;
                    inIndex.Add(e.plannerId);
                    var status = e.deprecated ? "deprecated" : e.asset == null ? "missing" : issues.ContainsKey(e.asset) ? "incomplete" : "implemented";
                    output.Add(Record(e.plannerId, e.schemaId, e.key, status, e.asset != null ? AssetDatabase.GetAssetPath(e.asset) : null, e.asset != null && issues.TryGetValue(e.asset, out var l) ? l : null));
                }
            foreach (var s in manifest.Schemas)
            {
                var data = $"{root}/{s.Data.TrimEnd('/')}";
                if (s.Format == "csv")
                {
                    if (!File.Exists(data)) continue;
                    foreach (var line in File.ReadLines(data).Skip(1))
                    {
                        var cells = line.Split(',');
                        if (cells.Length >= 2 && cells[1].Length > 0) output.Add(Record(cells[1], s.Id, cells[0], "implemented", data));
                    }
                    continue;
                }
                if (!Directory.Exists(data)) continue;
                foreach (var file in Directory.GetFiles(data, "*.json").OrderBy(f => f, StringComparer.Ordinal))
                {
                    JObject json;
                    try
                    {
                        json = JObject.Parse(File.ReadAllText(file));
                    }
                    catch (JsonException)
                    {
                        continue;
                    }
                    var id = (string)json["plannerId"];
                    if (string.IsNullOrEmpty(id) || inIndex.Contains(id)) continue;
                    // A native record without an asset was not imported (no compiled type); JSON records are used as files.
                    output.Add(Record(id, s.Id, (string)json["id"] ?? "", s.Format == "native" ? "missing" : "implemented", file.Replace('\\', '/'), s.Format == "native" ? new[] { "no asset: the import did not create it" } : null));
                }
            }
            return output;
        }

        /// <summary>“item.plank.icon: required, but empty.” → “icon: required, but empty.”</summary>
        private static string StripKey(string message)
        {
            var colon = message.IndexOf(':');
            var head = colon > 0 ? message.Substring(0, colon) : "";
            var dot = head.LastIndexOf('.');
            return dot > 0 ? message.Substring(dot + 1) : message;
        }

        private static JArray Classes(string root)
        {
            var output = new JArray();
            var indexPath = $"{root}/Unity/Scripts/Generated/classes.json";
            if (!File.Exists(indexPath)) return output;
            JArray index;
            try
            {
                index = JArray.Parse(File.ReadAllText(indexPath));
            }
            catch (JsonException)
            {
                return output;
            }
            foreach (var c in index)
            {
                var own = (string)c["own"];
                var methods = c["methods"]?.Type == JTokenType.Integer ? (int)c["methods"] : 0;
                var file = own != null ? $"{root}/{own}" : $"{root}/{(string)c["generated"]}";
                string status;
                var todo = 0;
                if (!File.Exists(file)) status = "missing";
                else if (own == null) status = "implemented";
                else
                {
                    var text = File.ReadAllText(file);
                    todo = Count(text, "throw new NotImplementedException();") + Count(text, "// TODO");
                    status = todo > 0 ? "stub" : "implemented";
                }
                output.Add(new JObject { ["plannerId"] = (string)c["plannerId"], ["name"] = (string)c["name"], ["status"] = status, ["file"] = file, ["todo"] = todo, ["methods"] = methods });
            }
            return output;
        }

        private static int Count(string text, string what)
        {
            var n = 0;
            for (var i = text.IndexOf(what, StringComparison.Ordinal); i >= 0; i = text.IndexOf(what, i + what.Length, StringComparison.Ordinal)) n++;
            return n;
        }
    }
}
