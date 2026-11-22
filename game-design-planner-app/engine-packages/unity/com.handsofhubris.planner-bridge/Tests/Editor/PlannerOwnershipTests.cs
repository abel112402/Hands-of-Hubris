using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using HoHPlanner.Bridge.Editor;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using UnityEditor;

namespace HoHPlanner.Bridge.Tests
{
    /// <summary>
    /// Ownership, conflicts, backup, rollback and restore of the file step (plans/UNITY_PLAYABLE_GAME_GENERATION_PLAN.md,
    /// phase 5). The shared cases in Fixtures/ownership-cases.json are the planner's own (tests/engineOwnership.test.ts),
    /// so the zip import and the linked-folder writer follow the same rules.
    /// </summary>
    public class PlannerOwnershipTests
    {
        private const string Root = "Assets/HoHPlannerOwnershipTest";
        private const string Item = "Data/Item/item.a.json";

        [SetUp]
        public void SetUp() => Clean();

        [TearDown]
        public void TearDown() => Clean();

        private static void Clean()
        {
            AssetDatabase.DeleteAsset(Root);
            if (Directory.Exists(Root)) Directory.Delete(Root, true);
            if (File.Exists(Root + ".meta")) File.Delete(Root + ".meta");
        }

        /// <summary>A bundle whose manifest lists the hashes of its files, as the planner writes it.</summary>
        private static PlannerBundle Bundle(Dictionary<string, string> files)
        {
            var manifest = JObject.Parse(Fixture.Manifest());
            manifest["files"] = new JArray(files.Select(kv => new JObject { ["path"] = kv.Key, ["hash"] = PlannerOwnership.Fnv1a(kv.Value) }));
            var all = files.ToDictionary(kv => kv.Key, kv => Encoding.UTF8.GetBytes(kv.Value));
            all["hoh-engine.json"] = Encoding.UTF8.GetBytes(manifest.ToString());
            return new PlannerBundle(all);
        }

        [Test]
        public void FollowsTheSharedCases()
        {
            var fixture = JObject.Parse(File.ReadAllText(Path.Combine(Fixture.Folder, "ownership-cases.json")));
            foreach (var h in fixture["hashes"]) Assert.AreEqual((string)h["hash"], PlannerOwnership.Fnv1a((string)h["text"]), $"hash of “{h["text"]}”");
            foreach (var c in fixture["cases"])
            {
                var next = ((JObject)c["next"]).Properties().ToDictionary(p => p.Name, p => (string)p.Value);
                var disk = ((JObject)c["disk"]).Properties().ToDictionary(p => p.Name, p => (string)p.Value);
                var old = c["old"] is JObject o ? o.Properties().ToDictionary(p => p.Name, p => (string)p.Value) : null;
                var plan = PlannerOwnership.Plan(next, p => disk.TryGetValue(p, out var t) ? t : null, old, c["generatedOnDisk"].Select(x => (string)x), new[] { "Unity/Scripts/Classes/" }, new[] { "Unity/Scripts/Generated/", "Data/" }, "hoh-engine.json");
                var got = plan.Entries.ToDictionary(e => e.Path, e => char.ToLowerInvariant(e.Action.ToString()[0]) + e.Action.ToString().Substring(1));
                var expected = ((JObject)c["expected"]).Properties().ToDictionary(p => p.Name, p => (string)p.Value);
                CollectionAssert.AreEquivalent(expected, got, (string)c["name"]);
            }
        }

        [Test]
        public void StopsBeforeWritingWhenAGeneratedFileWasChangedByHand()
        {
            PlannerImporter.WriteFiles(Bundle(new Dictionary<string, string> { [Item] = "A1" }), Root);
            File.WriteAllText($"{Root}/{Item}", "mine");
            var e = Assert.Throws<PlannerConflictException>(() => PlannerImporter.WriteFiles(Bundle(new Dictionary<string, string> { [Item] = "A2", ["Data/Item/item.b.json"] = "B" }), Root));
            CollectionAssert.AreEqual(new[] { Item }, e.Conflicts);
            Assert.AreEqual("mine", File.ReadAllText($"{Root}/{Item}"));
            Assert.IsFalse(File.Exists($"{Root}/Data/Item/item.b.json"), "Nothing is written when it stops.");
        }

        [Test]
        public void OverwritesOnlyWhenAskedAfterABackupAndRestorePutsItBack()
        {
            PlannerImporter.WriteFiles(Bundle(new Dictionary<string, string> { [Item] = "A1" }), Root);
            File.WriteAllText($"{Root}/{Item}", "mine");
            var r = PlannerImporter.WriteFiles(Bundle(new Dictionary<string, string> { [Item] = "A2" }), Root, overwrite: true);
            Assert.AreEqual("A2", File.ReadAllText($"{Root}/{Item}"));
            CollectionAssert.AreEqual(new[] { Item }, r.Conflicts);
            Assert.AreEqual("mine", File.ReadAllText($"{r.Backup}/{Item}"));

            StringAssert.Contains("put back", PlannerOwnership.RestoreLast(Root));
            Assert.AreEqual("mine", File.ReadAllText($"{Root}/{Item}"));
        }

        [Test]
        public void IsIdempotentAndIgnoresLineEndings()
        {
            var bundle = Bundle(new Dictionary<string, string> { [Item] = "line\none" });
            PlannerImporter.WriteFiles(bundle, Root);
            var backups = PlannerOwnership.Journals(Root).Count;
            var again = PlannerImporter.WriteFiles(bundle, Root);
            Assert.AreEqual(0, again.Written);
            Assert.AreEqual(0, again.Deleted);
            Assert.AreEqual(backups, PlannerOwnership.Journals(Root).Count, "No backup for a write that changes nothing.");

            File.WriteAllText($"{Root}/{Item}", "line\r\none"); // a Git checkout with CRLF
            var r = PlannerImporter.WriteFiles(Bundle(new Dictionary<string, string> { [Item] = "line\ntwo" }), Root);
            Assert.AreEqual(0, r.Conflicts.Count);
            Assert.AreEqual("line\ntwo", File.ReadAllText($"{Root}/{Item}"));
        }

        [Test]
        public void RemovesWhatItWroteWithItsMetaKeepsTheRestAndRestoresTheGuid()
        {
            PlannerImporter.WriteFiles(Bundle(new Dictionary<string, string> { [Item] = "A", ["Data/Item/item.gone.json"] = "G" }), Root);
            File.WriteAllText($"{Root}/Data/Item/item.gone.json.meta", "guid: 0123456789abcdef");
            File.WriteAllText($"{Root}/Data/Item/item.mine.json", "mine");
            var r = PlannerImporter.WriteFiles(Bundle(new Dictionary<string, string> { [Item] = "A" }), Root);
            Assert.AreEqual(1, r.Deleted);
            Assert.IsFalse(File.Exists($"{Root}/Data/Item/item.gone.json.meta"));
            CollectionAssert.AreEqual(new[] { "Data/Item/item.mine.json" }, r.KeptNotOurs);
            Assert.AreEqual("mine", File.ReadAllText($"{Root}/Data/Item/item.mine.json"));

            PlannerOwnership.RestoreLast(Root);
            Assert.AreEqual("G", File.ReadAllText($"{Root}/Data/Item/item.gone.json"));
            Assert.AreEqual("guid: 0123456789abcdef", File.ReadAllText($"{Root}/Data/Item/item.gone.json.meta"), "The restored file keeps its GUID.");
        }

        [Test]
        public void ReportsAnInterruptedWriteAndKeepsFiveBackups()
        {
            PlannerImporter.WriteFiles(Bundle(new Dictionary<string, string> { [Item] = "A" }), Root);
            Assert.IsNull(PlannerOwnership.Interrupted(Root));
            PlannerOwnership.Save(Root, new WriteJournal { Stamp = "20991231-000000-000", By = "planner" });
            Assert.AreEqual("planner", PlannerOwnership.Interrupted(Root).By);

            for (var i = 0; i < 7; i++) PlannerOwnership.Save(Root, new WriteJournal { Stamp = $"2000010{i}-000000-000", State = "done" });
            PlannerOwnership.Prune(Root);
            Assert.AreEqual(PlannerOwnership.KeepBackups, PlannerOwnership.Journals(Root).Count);
            Assert.AreEqual("20991231-000000-000", PlannerOwnership.Journals(Root).First().Stamp);
        }

        [Test]
        public void PreviewWritesNothing()
        {
            PlannerImporter.WriteFiles(Bundle(new Dictionary<string, string> { [Item] = "A1" }), Root);
            File.WriteAllText($"{Root}/{Item}", "mine");
            var plan = PlannerImporter.Preview(Bundle(new Dictionary<string, string> { [Item] = "A2", ["Data/Item/item.b.json"] = "B" }), Root);
            Assert.AreEqual(1, plan.Count(PlanAction.Create));
            Assert.AreEqual("changed since the last export", plan.Conflicts.Single().Reason);
            StringAssert.Contains("1 conflict(s)", plan.Describe());
            Assert.IsFalse(File.Exists($"{Root}/Data/Item/item.b.json"));
        }
    }
}
