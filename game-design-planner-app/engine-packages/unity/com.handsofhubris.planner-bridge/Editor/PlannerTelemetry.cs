using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace HoHPlanner.Bridge.Editor
{
    /// <summary>
    /// Adds up the generated Telemetry log (&lt;persistentDataPath&gt;/hoh-telemetry.jsonl, one JSON object per line) into
    /// metrics for the report: &lt;event&gt;.count (how many times it was logged) and &lt;event&gt;.&lt;parameter&gt; (the mean of each
    /// number parameter, with its count, spread and the last build). A line that is not valid JSON is skipped.
    /// </summary>
    public static class PlannerTelemetry
    {
        public const string FileName = "hoh-telemetry.jsonl";

        public static string DefaultPath => Path.Combine(Application.persistentDataPath, FileName);

        public static List<MetricSummary> Summaries(string path = null)
        {
            path = path ?? DefaultPath;
            var byKey = new Dictionary<string, MetricSummary>(StringComparer.Ordinal);
            if (!File.Exists(path)) return new List<MetricSummary>();
            void Add(string key, double value, string build, string at)
            {
                if (!byKey.TryGetValue(key, out var m)) byKey[key] = m = new MetricSummary { key = key, min = value, max = value };
                m.samples++;
                m.sum += value;
                m.min = Math.Min(m.min, value);
                m.max = Math.Max(m.max, value);
                if (!string.IsNullOrEmpty(build)) m.build = build;
                if (!string.IsNullOrEmpty(at)) m.lastAt = at;
            }
            foreach (var line in File.ReadLines(path))
            {
                if (string.IsNullOrWhiteSpace(line)) continue;
                JObject o;
                try
                {
                    o = JObject.Parse(line);
                }
                catch (Newtonsoft.Json.JsonException)
                {
                    continue;
                }
                var ev = (string)o["event"];
                if (string.IsNullOrEmpty(ev)) continue;
                var build = (string)o["build"];
                var at = o["t"]?.ToString();
                // A count is a sum, not a mean: every line adds a sample of 1, and the report shows samples as the count.
                Add($"{ev}.count", 1, build, at);
                foreach (var p in o.Properties())
                {
                    if (p.Name == "event" || p.Name == "t" || p.Name == "session" || p.Name == "build") continue;
                    if (p.Value.Type == JTokenType.Integer || p.Value.Type == JTokenType.Float) Add($"{ev}.{p.Name}", (double)p.Value, build, at);
                }
            }
            return byKey.Values.OrderBy(m => m.key, StringComparer.Ordinal).ToList();
        }

        /// <summary>Appends another machine's telemetry file to this one's (a tester sends theirs). Returns the lines added.</summary>
        public static int Merge(string other, string path = null)
        {
            path = path ?? DefaultPath;
            var lines = File.ReadAllLines(other).Where(l => !string.IsNullOrWhiteSpace(l)).ToList();
            Directory.CreateDirectory(Path.GetDirectoryName(path));
            File.AppendAllLines(path, lines);
            return lines.Count;
        }
    }
}
