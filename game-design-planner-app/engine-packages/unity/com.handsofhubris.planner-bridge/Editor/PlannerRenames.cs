using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using Newtonsoft.Json.Linq;

namespace HoHPlanner.Bridge.Editor
{
    /// <summary>One of your class files to move with its renamed class: paths from the export's root, names to change.</summary>
    public sealed class OwnMove
    {
        public string PlannerId;
        public string From;
        public string To;
        public List<KeyValuePair<string, string>> Replace = new List<KeyValuePair<string, string>>();
    }

    /// <summary>
    /// Your class files follow a renamed class (the planner's core/engine/renames.ts, the same rules): the class index
    /// already in the folder and the new one are compared by planner ID; a class whose own file now has another path gets
    /// it moved there, with the class name inside changed as a whole word, and its .meta moved too, so the script keeps
    /// its GUID and every scene and prefab that uses it.
    /// </summary>
    public static class PlannerRenames
    {
        public const string ClassIndex = "Unity/Scripts/Generated/classes.json";

        private static (List<string> files, List<string> tokens) FilesOf(JObject e)
        {
            if (e["ownFiles"] is JArray files)
                return (files.Select(f => (string)f).Where(f => f != null).ToList(), (e["tokens"] as JArray)?.Select(t => (string)t).Where(t => t != null).ToList() ?? new List<string>());
            // An index written before ownFiles existed: one file named after the class.
            var own = (string)e["own"];
            if (own != null && own.StartsWith("Unity/") && own.EndsWith(".cs")) return (new List<string> { own }, new List<string> { Path.GetFileNameWithoutExtension(own) });
            return (new List<string>(), new List<string>());
        }

        private static bool Safe(string p) => !string.IsNullOrEmpty(p) && !p.StartsWith("/") && !p.Split('/').Contains("..") && !Path.IsPathRooted(p);

        public static List<OwnMove> Moves(JToken oldIndex, JToken newIndex)
        {
            var before = (oldIndex as JArray ?? new JArray()).OfType<JObject>().Where(e => e["plannerId"] != null).GroupBy(e => (string)e["plannerId"]).ToDictionary(g => g.Key, g => FilesOf(g.First()));
            var moves = new List<OwnMove>();
            foreach (var e in (newIndex as JArray ?? new JArray()).OfType<JObject>())
            {
                var id = (string)e["plannerId"];
                if (id == null || !before.TryGetValue(id, out var old)) continue;
                var now = FilesOf(e);
                if (old.files.Count != now.files.Count || now.files.Count == 0) continue;
                var replace = old.tokens.Count == now.tokens.Count
                    ? old.tokens.Zip(now.tokens, (a, b) => new KeyValuePair<string, string>(a, b)).Where(p => !string.IsNullOrEmpty(p.Key) && !string.IsNullOrEmpty(p.Value) && p.Key != p.Value).ToList()
                    : new List<KeyValuePair<string, string>>();
                for (var i = 0; i < now.files.Count; i++)
                    if (old.files[i] != now.files[i] && Safe(old.files[i]) && Safe(now.files[i]))
                        moves.Add(new OwnMove { PlannerId = id, From = old.files[i], To = now.files[i], Replace = replace });
            }
            return moves;
        }

        /// <summary>The text with every old name changed to the new one, as whole words, longest first.</summary>
        public static string RenameIn(string text, IEnumerable<KeyValuePair<string, string>> replace)
        {
            var pairs = replace.OrderByDescending(p => p.Key.Length).ToList();
            if (pairs.Count == 0) return text;
            var map = pairs.GroupBy(p => p.Key).ToDictionary(g => g.Key, g => g.First().Value);
            var pattern = "(?<![A-Za-z0-9_])(" + string.Join("|", pairs.Select(p => Regex.Escape(p.Key))) + ")(?![A-Za-z0-9_])";
            return Regex.Replace(text, pattern, m => map[m.Value]);
        }

        /// <summary>
        /// Moves your files of renamed classes under <paramref name="root"/>, before the new export is written. A class's
        /// files move together, and only when none of the new paths exists yet. Returns “old → new” per file.
        /// </summary>
        public static List<string> Apply(string root, byte[] newIndex)
        {
            var done = new List<string>();
            var oldPath = $"{root}/{ClassIndex}";
            if (newIndex == null || !File.Exists(oldPath)) return done;
            JToken oldIndex, next;
            try
            {
                oldIndex = JToken.Parse(File.ReadAllText(oldPath));
                next = JToken.Parse(Encoding.UTF8.GetString(newIndex));
            }
            catch (Newtonsoft.Json.JsonException)
            {
                return done;
            }
            foreach (var group in Moves(oldIndex, next).GroupBy(m => m.PlannerId))
            {
                var list = group.ToList();
                if (list.Any(m => !File.Exists($"{root}/{m.From}") || File.Exists($"{root}/{m.To}"))) continue;
                foreach (var m in list)
                {
                    var from = $"{root}/{m.From}";
                    var to = $"{root}/{m.To}";
                    Directory.CreateDirectory(Path.GetDirectoryName(to));
                    File.WriteAllText(to, RenameIn(File.ReadAllText(from), m.Replace));
                    File.Delete(from);
                    if (File.Exists(from + ".meta")) File.Move(from + ".meta", to + ".meta");
                    done.Add($"{m.From} → {m.To}");
                }
            }
            return done;
        }
    }
}
