using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Text;

namespace HoHPlanner.Bridge.Editor
{
    /// <summary>Thrown when a bundle or its manifest cannot be used. The message is meant for the user.</summary>
    public sealed class PlannerImportException : Exception
    {
        public PlannerImportException(string message) : base(message) { }
    }

    /// <summary>
    /// The files of a planner engine export, read from the zip the planner downloads or from an unpacked folder.
    /// Paths are relative to the bundle root (“hoh-engine.json”, “Data/Item/item.plank.json”, “Unity/Scripts/…”).
    /// </summary>
    public sealed class PlannerBundle
    {
        /// <summary>Upper bounds, because a bundle is a file from outside the project.</summary>
        public const long MaxFileBytes = 20L * 1024 * 1024;
        public const long MaxTotalBytes = 200L * 1024 * 1024;
        public const int MaxFiles = 20000;

        public IReadOnlyDictionary<string, byte[]> Files { get; }

        public PlannerBundle(IReadOnlyDictionary<string, byte[]> files)
        {
            Files = files;
        }

        public bool Has(string path) => Files.ContainsKey(path);

        public string Text(string path) => Files.TryGetValue(path, out var b) ? Encoding.UTF8.GetString(b) : null;

        public PlannerManifest Manifest()
        {
            var text = Text("hoh-engine.json");
            if (text == null) throw new PlannerImportException("This is not a planner engine export: hoh-engine.json is missing.");
            return PlannerManifest.Parse(text);
        }

        /// <summary>Reads a .zip or a folder. The single top folder of a zip (HoHPlanner/) is dropped.</summary>
        public static PlannerBundle FromPath(string path)
        {
            if (string.IsNullOrEmpty(path)) throw new PlannerImportException("No bundle chosen.");
            if (Directory.Exists(path)) return FromFolder(path);
            if (File.Exists(path)) return FromZip(File.ReadAllBytes(path));
            throw new PlannerImportException($"Bundle not found: {path}");
        }

        public static PlannerBundle FromZip(byte[] zip)
        {
            var files = new Dictionary<string, byte[]>();
            long total = 0;
            using (var archive = new ZipArchive(new MemoryStream(zip), ZipArchiveMode.Read))
            {
                foreach (var entry in archive.Entries)
                {
                    if (string.IsNullOrEmpty(entry.Name)) continue; // folder
                    if (files.Count >= MaxFiles) throw new PlannerImportException($"The bundle has more than {MaxFiles} files.");
                    if (entry.Length > MaxFileBytes) throw new PlannerImportException($"{entry.FullName} is larger than {MaxFileBytes / (1024 * 1024)} MB.");
                    total += entry.Length;
                    if (total > MaxTotalBytes) throw new PlannerImportException($"The bundle is larger than {MaxTotalBytes / (1024 * 1024)} MB.");
                    using (var s = entry.Open())
                    using (var m = new MemoryStream())
                    {
                        s.CopyTo(m);
                        files[entry.FullName.Replace('\\', '/')] = m.ToArray();
                    }
                }
            }
            return new PlannerBundle(Normalize(files));
        }

        public static PlannerBundle FromFolder(string folder)
        {
            var root = Path.GetFullPath(folder);
            var files = new Dictionary<string, byte[]>();
            long total = 0;
            foreach (var file in Directory.EnumerateFiles(root, "*", SearchOption.AllDirectories))
            {
                if (file.EndsWith(".meta", StringComparison.OrdinalIgnoreCase)) continue;
                var info = new FileInfo(file);
                if (files.Count >= MaxFiles) throw new PlannerImportException($"The folder has more than {MaxFiles} files.");
                if (info.Length > MaxFileBytes) throw new PlannerImportException($"{file} is larger than {MaxFileBytes / (1024 * 1024)} MB.");
                total += info.Length;
                if (total > MaxTotalBytes) throw new PlannerImportException($"The folder is larger than {MaxTotalBytes / (1024 * 1024)} MB.");
                files[file.Substring(root.Length).TrimStart('/', '\\').Replace('\\', '/')] = File.ReadAllBytes(file);
            }
            return new PlannerBundle(Normalize(files));
        }

        /// <summary>A relative path with no “..”, drive or root, so writing it under the target folder stays inside it.</summary>
        public static bool IsSafeRelative(string p) =>
            !string.IsNullOrEmpty(p) && !p.StartsWith("/") && !p.Contains(":") && !p.Contains("\\") && p.Split('/').All(s => s.Length > 0 && s != "." && s != "..");

        /// <summary>Drops one shared top folder and refuses paths that would leave the target folder.</summary>
        private static Dictionary<string, byte[]> Normalize(Dictionary<string, byte[]> files)
        {
            var top = files.Keys.Select(k => k.Split('/')[0]).Distinct().ToList();
            var strip = top.Count == 1 && files.Keys.All(k => k.Contains('/')) && !files.ContainsKey("hoh-engine.json") ? top[0] + "/" : "";
            var output = new Dictionary<string, byte[]>();
            foreach (var kv in files)
            {
                var p = kv.Key.Substring(strip.Length);
                if (!IsSafeRelative(p)) throw new PlannerImportException($"Unsafe path in bundle: {kv.Key}");
                output[p] = kv.Value;
            }
            return output;
        }
    }
}
