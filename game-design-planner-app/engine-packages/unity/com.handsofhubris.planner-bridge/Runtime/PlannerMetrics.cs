using System;
using System.Collections.Generic;
using System.IO;
using UnityEngine;

namespace HoHPlanner.Bridge
{
    /// <summary>One measured value, summed up over every sample recorded under its key.</summary>
    [Serializable]
    public sealed class MetricSummary
    {
        public string key;
        public int samples;
        public double sum;
        public double min;
        public double max;
        /// <summary>Application.version of the last sample.</summary>
        public string build;
        public string lastAt;

        public double Mean => samples > 0 ? sum / samples : 0;
    }

    /// <summary>
    /// Playtest measurements for the planner's Balance plan. Call <see cref="Record"/> from the game, e.g.
    /// <c>PlannerMetrics.Record("combat.ttk.greenhollow_brute", secondsToKill)</c>; the key is the one a Balance plan
    /// metric names. Samples add up across sessions in &lt;persistentDataPath&gt;/hoh-planner-metrics.json (saved when the
    /// game quits or Play mode ends), and the planner bridge puts them into the report for the planner.
    /// Works in builds too: copy that file from a tester's machine and use Tools ▸ Game Design Planner ▸ Merge metrics file.
    /// </summary>
    public static class PlannerMetrics
    {
        public const string FileName = "hoh-planner-metrics.json";

        [Serializable]
        private sealed class Store
        {
            public List<MetricSummary> metrics = new List<MetricSummary>();
        }

        private static Dictionary<string, MetricSummary> data;
        private static bool dirty;

        /// <summary>The metrics file. Tests may point it elsewhere.</summary>
        public static string FilePath { get; set; }

        private static string PathNow => FilePath ?? Path.Combine(Application.persistentDataPath, FileName);

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        private static void Init()
        {
            data = null;
            dirty = false;
            Application.quitting -= Save;
            Application.quitting += Save;
        }

        private static Dictionary<string, MetricSummary> Data()
        {
            if (data != null) return data;
            data = new Dictionary<string, MetricSummary>();
            foreach (var m in Load()) data[m.key] = m;
            return data;
        }

        /// <summary>Adds one sample. NaN and infinities are ignored; an empty key is ignored.</summary>
        public static void Record(string key, double value)
        {
            if (string.IsNullOrWhiteSpace(key) || double.IsNaN(value) || double.IsInfinity(value)) return;
            var d = Data();
            if (!d.TryGetValue(key, out var m))
            {
                m = new MetricSummary { key = key, min = value, max = value };
                d[key] = m;
            }
            m.samples++;
            m.sum += value;
            m.min = Math.Min(m.min, value);
            m.max = Math.Max(m.max, value);
            m.build = Application.version;
            m.lastAt = DateTime.UtcNow.ToString("o");
            dirty = true;
        }

        /// <summary>Writes the samples recorded since the last save. Called on quit and at the end of Play mode.</summary>
        public static void Save()
        {
            if (!dirty || data == null) return;
            var store = new Store();
            store.metrics.AddRange(data.Values);
            Directory.CreateDirectory(Path.GetDirectoryName(PathNow));
            File.WriteAllText(PathNow, JsonUtility.ToJson(store, true));
            dirty = false;
        }

        /// <summary>The saved metrics, plus anything recorded and not saved yet.</summary>
        public static List<MetricSummary> Load(string path = null)
        {
            path = path ?? PathNow;
            var list = new List<MetricSummary>();
            if (path == PathNow && data != null)
            {
                list.AddRange(data.Values);
                return list;
            }
            if (!File.Exists(path)) return list;
            try
            {
                var store = JsonUtility.FromJson<Store>(File.ReadAllText(path));
                if (store?.metrics != null)
                    foreach (var m in store.metrics)
                        if (m != null && !string.IsNullOrWhiteSpace(m.key) && m.samples > 0) list.Add(m);
            }
            catch (ArgumentException)
            {
                Debug.LogWarning($"[Planner bridge] {path} is not a metrics file; ignored.");
            }
            return list;
        }

        /// <summary>Adds another metrics file (e.g. from a tester's build) to this one. Returns how many keys it had.</summary>
        public static int Merge(string otherPath)
        {
            var other = Load(otherPath);
            var d = Data();
            foreach (var o in other)
            {
                if (d.TryGetValue(o.key, out var m))
                {
                    m.samples += o.samples;
                    m.sum += o.sum;
                    m.min = Math.Min(m.min, o.min);
                    m.max = Math.Max(m.max, o.max);
                    if (string.CompareOrdinal(o.lastAt ?? "", m.lastAt ?? "") > 0)
                    {
                        m.build = o.build;
                        m.lastAt = o.lastAt;
                    }
                }
                else d[o.key] = o;
            }
            dirty = other.Count > 0 || dirty;
            Save();
            return other.Count;
        }

        /// <summary>Forgets every sample (e.g. after a balance change, to measure the new numbers only).</summary>
        public static void Clear()
        {
            data = new Dictionary<string, MetricSummary>();
            dirty = false;
            if (File.Exists(PathNow)) File.Delete(PathNow);
        }
    }
}
