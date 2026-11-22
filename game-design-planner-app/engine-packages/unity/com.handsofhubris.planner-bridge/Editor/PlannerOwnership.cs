using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace HoHPlanner.Bridge.Editor
{
    public enum PlanAction { Create, Update, Unchanged, KeepYours, Conflict, Delete, KeepNotOurs }

    public sealed class PlanEntry
    {
        public string Path;
        public PlanAction Action;
        public string Reason;
    }

    /// <summary>What an import would do, file by file. <see cref="PlannerOwnership.Plan"/> makes it.</summary>
    public sealed class ImportPlan
    {
        public readonly List<PlanEntry> Entries = new List<PlanEntry>();
        public List<PlanEntry> Conflicts => Entries.Where(e => e.Action == PlanAction.Conflict).ToList();
        public int Count(PlanAction a) => Entries.Count(e => e.Action == a);

        public string Describe()
        {
            var parts = new List<string> { $"{Count(PlanAction.Create)} new", $"{Count(PlanAction.Update)} changed", $"{Count(PlanAction.Delete)} removed", $"{Count(PlanAction.Unchanged)} unchanged", $"{Count(PlanAction.KeepYours)} of your class files kept" };
            if (Count(PlanAction.KeepNotOurs) > 0) parts.Add($"{Count(PlanAction.KeepNotOurs)} file(s) in generated folders kept because the planner did not write them");
            var c = Conflicts;
            if (c.Count > 0) parts.Add($"{c.Count} conflict(s): {string.Join("; ", c.Take(5).Select(x => $"{x.Path} ({x.Reason})"))}{(c.Count > 5 ? "; …" : "")}");
            return string.Join(", ", parts);
        }
    }

    /// <summary>The import would overwrite files changed by hand (or not written by the planner); nothing was written.</summary>
    public sealed class PlannerConflictException : PlannerImportException
    {
        public readonly List<string> Conflicts;
        public PlannerConflictException(List<string> conflicts)
            : base($"Stopped before writing: {conflicts.Count} file(s) changed since the last export or not written by the planner ({string.Join(", ", conflicts.Take(3))}{(conflicts.Count > 3 ? ", …" : "")}). Overwrite them (a backup is kept) or move your changes out of the generated folders.")
        {
            Conflicts = conflicts;
        }
    }

    /// <summary>A write's journal, the same format the planner's linked-folder writer keeps (core/engine/ownership.ts).</summary>
    public sealed class WriteJournal
    {
        [JsonProperty("format")] public string Format = "hoh-write-journal";
        [JsonProperty("v")] public int V = 1;
        [JsonProperty("stamp")] public string Stamp;
        [JsonProperty("by")] public string By = "unity";
        [JsonProperty("state")] public string State = "writing";
        [JsonProperty("created")] public List<string> Created = new List<string>();
        [JsonProperty("backedUp")] public List<string> BackedUp = new List<string>();
    }

    /// <summary>
    /// Who owns each file of the planner folder, and what an import may do to it — the same rules as the planner's
    /// linked-folder writer (src/core/engine/ownership.ts; Tests/Editor/Fixtures/ownership-cases.json holds the shared cases).
    /// Yours: only created. The planner's: a file whose text still hashes to what the previous manifest lists (line endings
    /// ignored); updated or deleted freely. Anything else the import would overwrite is a conflict that stops it unless
    /// the user chose to overwrite (after a backup); anything else it would delete is kept and reported.
    /// Backups and the journal go to .hoh-backup/&lt;time&gt;/ in the planner folder (Unity skips folders starting with a dot).
    /// </summary>
    public static class PlannerOwnership
    {
        public const string BackupDir = ".hoh-backup";
        public const string JournalFile = "journal.json";
        public const int KeepBackups = 5;

        /// <summary>32-bit FNV-1a over UTF-16 code units as 8 hex digits, as the planner's manifest hashes.</summary>
        public static string Fnv1a(string text)
        {
            unchecked
            {
                var h = 0x811c9dc5u;
                foreach (var c in text)
                {
                    h ^= c;
                    h *= 0x01000193u;
                }
                return h.ToString("x8");
            }
        }

        public static bool Unmodified(string text, string hash) => hash != null && (Fnv1a(text) == hash || Fnv1a(text.Replace("\r\n", "\n")) == hash);

        public static ImportPlan Plan(IReadOnlyDictionary<string, string> next, Func<string, string> disk, IReadOnlyDictionary<string, string> oldHashes, IEnumerable<string> generatedOnDisk, string[] yoursPrefixes, string[] ownedPrefixes, string manifestPath)
        {
            var old = oldHashes ?? new Dictionary<string, string>();
            var plan = new ImportPlan();
            string Reason(string p) => old.ContainsKey(p) ? "changed since the last export" : "not written by the planner";
            foreach (var kv in next)
            {
                var path = kv.Key;
                var now = disk(path);
                var yours = yoursPrefixes.Any(p => path.StartsWith(p, StringComparison.Ordinal)) && !ownedPrefixes.Any(p => path.StartsWith(p, StringComparison.Ordinal));
                PlanAction a;
                if (path == manifestPath) a = now == kv.Value ? PlanAction.Unchanged : now == null ? PlanAction.Create : PlanAction.Update;
                else if (yours) a = now == null ? PlanAction.Create : PlanAction.KeepYours;
                else if (now == null) a = PlanAction.Create;
                else if (now == kv.Value) a = PlanAction.Unchanged;
                else if (Unmodified(now, old.TryGetValue(path, out var h) ? h : null)) a = PlanAction.Update;
                else a = PlanAction.Conflict;
                plan.Entries.Add(new PlanEntry { Path = path, Action = a, Reason = a == PlanAction.Conflict ? Reason(path) : null });
            }
            foreach (var path in generatedOnDisk)
            {
                if (next.ContainsKey(path)) continue;
                var now = disk(path);
                if (now == null) continue;
                var delete = Unmodified(now, old.TryGetValue(path, out var h) ? h : null);
                plan.Entries.Add(new PlanEntry { Path = path, Action = delete ? PlanAction.Delete : PlanAction.KeepNotOurs, Reason = delete ? null : Reason(path) });
            }
            return plan;
        }

        public static string Stamp(DateTime utc) => utc.ToString("yyyyMMdd-HHmmss-fff");

        public static string JournalPath(string root, string stamp) => $"{root}/{BackupDir}/{stamp}/{JournalFile}";

        public static void Save(string root, WriteJournal j)
        {
            var path = JournalPath(root, j.Stamp);
            Directory.CreateDirectory(Path.GetDirectoryName(path));
            File.WriteAllText(path, JsonConvert.SerializeObject(j, Formatting.Indented));
        }

        /// <summary>Copies the files the write will replace or remove into the backup, then saves the journal (state “writing”).</summary>
        public static void Begin(string root, WriteJournal j)
        {
            foreach (var p in j.BackedUp)
            {
                var from = $"{root}/{p}";
                var to = $"{root}/{BackupDir}/{j.Stamp}/{p}";
                Directory.CreateDirectory(Path.GetDirectoryName(to));
                if (File.Exists(from)) File.Copy(from, to, true);
            }
            Save(root, j);
        }

        /// <summary>Every readable journal, newest first.</summary>
        public static List<WriteJournal> Journals(string root)
        {
            var dir = $"{root}/{BackupDir}";
            var found = new List<WriteJournal>();
            if (!Directory.Exists(dir)) return found;
            foreach (var d in Directory.GetDirectories(dir))
            {
                var path = Path.Combine(d, JournalFile);
                if (!File.Exists(path)) continue;
                try
                {
                    var j = JsonConvert.DeserializeObject<WriteJournal>(File.ReadAllText(path));
                    if (j?.Format == "hoh-write-journal") found.Add(j);
                }
                catch (JsonException)
                {
                    // An unreadable journal is skipped.
                }
            }
            return found.OrderByDescending(j => j.Stamp, StringComparer.Ordinal).ToList();
        }

        /// <summary>Puts the folder back as it was before the write of <paramref name="j"/>.</summary>
        public static (int restored, int removed) Restore(string root, WriteJournal j)
        {
            var removed = 0;
            foreach (var p in j.Created)
            {
                var f = $"{root}/{p}";
                if (!File.Exists(f)) continue;
                File.Delete(f);
                removed++;
            }
            foreach (var p in j.BackedUp)
            {
                var from = $"{root}/{BackupDir}/{j.Stamp}/{p}";
                if (!File.Exists(from)) continue;
                var to = $"{root}/{p}";
                Directory.CreateDirectory(Path.GetDirectoryName(to));
                File.Copy(from, to, true);
            }
            j.State = "restored";
            Save(root, j);
            return (j.BackedUp.Count, removed);
        }

        /// <summary>Undoes the last write (by this bridge or by the planner's linked folder). Returns a message.</summary>
        public static string RestoreLast(string root)
        {
            var last = Journals(root).FirstOrDefault(j => j.State != "restored");
            if (last == null) return "There is no import to undo.";
            var (restored, removed) = Restore(root, last);
            return $"Restored the planner folder as it was before the write of {last.Stamp}: {restored} file(s) put back, {removed} new file(s) removed.";
        }

        /// <summary>A write that started and never finished, or null.</summary>
        public static WriteJournal Interrupted(string root)
        {
            var last = Journals(root).FirstOrDefault();
            return last?.State == "writing" ? last : null;
        }

        public static void Prune(string root)
        {
            foreach (var j in Journals(root).Skip(KeepBackups))
            {
                var d = $"{root}/{BackupDir}/{j.Stamp}";
                if (Directory.Exists(d)) Directory.Delete(d, true);
            }
        }

        /// <summary>The previous manifest's file hashes in <paramref name="root"/>, or null when there is none (or it is unreadable).</summary>
        public static Dictionary<string, string> OldHashes(string root)
        {
            var path = $"{root}/{PlannerImporter.ManifestFile}";
            if (!File.Exists(path)) return null;
            try
            {
                var o = JObject.Parse(File.ReadAllText(path));
                var map = new Dictionary<string, string>();
                if (o["files"] is JArray files)
                    foreach (var f in files)
                        if ((string)f["path"] is string p && (string)f["hash"] is string h) map[p] = h;
                return map;
            }
            catch (JsonException)
            {
                return new Dictionary<string, string>();
            }
        }
    }
}
