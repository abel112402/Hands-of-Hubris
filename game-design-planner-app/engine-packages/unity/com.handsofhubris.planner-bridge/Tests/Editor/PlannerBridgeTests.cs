using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Text;
using HoHPlanner.Bridge.Editor;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using UnityEditor;
using UnityEngine;

namespace HoHPlanner.Bridge.Tests
{
    internal static class Fixture
    {
        public static string Folder => Path.Combine(UnityEditor.PackageManager.PackageInfo.FindForAssembly(typeof(Fixture).Assembly).resolvedPath, "Tests", "Editor", "Fixtures");

        public static string Manifest(string schemaFormat = "native", int v = 1, string engine = "unity", int adapter = 3) =>
            new JObject
            {
                ["format"] = "hoh-engine",
                ["v"] = v,
                ["engine"] = new JObject { ["id"] = engine, ["adapterVersion"] = adapter },
                ["generator"] = new JObject { ["app"] = "Game Design Planner", ["version"] = "0.1.0" },
                ["project"] = new JObject { ["name"] = "Test" },
                ["exportedAt"] = "T",
                ["schemas"] = new JArray(new JObject { ["id"] = "test-item", ["name"] = "Item", ["format"] = schemaFormat, ["idPrefix"] = "item.", ["version"] = 1, ["records"] = 2, ["data"] = "Data/Item/" }),
                ["counts"] = new JObject { ["records"] = 2, ["enums"] = 0, ["formulas"] = 0, ["strings"] = 0, ["maps"] = 0 },
                ["files"] = new JArray(),
            }.ToString();

        public static string Record(string plannerId, string key, string name, object extra = null)
        {
            var o = new JObject { ["id"] = key, ["plannerId"] = plannerId, ["name"] = name, ["icon"] = null, ["value"] = 5, ["rarity"] = "rare", ["tint"] = "#ff0000", ["size"] = new JArray(2, 3), ["parts"] = new JArray(), ["tags"] = new JArray("a", "b") };
            if (extra != null) o.Merge(JObject.FromObject(extra));
            return o.ToString();
        }

        public static byte[] Zip(Dictionary<string, string> files)
        {
            var m = new MemoryStream();
            using (var z = new ZipArchive(m, ZipArchiveMode.Create, true))
                foreach (var kv in files)
                    using (var w = new StreamWriter(z.CreateEntry(kv.Key).Open(), new UTF8Encoding(false)))
                        w.Write(kv.Value);
            return m.ToArray();
        }
    }

    public class ManifestTests
    {
        [Test]
        public void NeedsTheRuntimePackageOnlyWhenTheExportAsksForIt()
        {
            var plain = PlannerManifest.Parse(Fixture.Manifest());
            Assert.IsNull(plain.RuntimePackage);
            Assert.IsNull(plain.RuntimeProblem(null));

            var o = JObject.Parse(Fixture.Manifest());
            o["requires"] = new JObject { ["runtime"] = new JObject { ["package"] = PlannerManifest.RuntimePackageName, ["version"] = "0.2.0" } };
            var m = PlannerManifest.Parse(o.ToString());
            StringAssert.Contains("install com.handsofhubris.planner-runtime 0.2.0", m.RuntimeProblem(null));
            StringAssert.Contains("the project has 0.1.9", m.RuntimeProblem("0.1.9"));
            Assert.IsNull(m.RuntimeProblem("0.2.0"));
            Assert.IsNull(m.RuntimeProblem("0.10.0"));
            Assert.IsNull(m.RuntimeProblem("1.0.0-pre.1"));

            o["requires"]["runtime"]["package"] = "com.example.other";
            StringAssert.Contains("does not know", PlannerManifest.Parse(o.ToString()).RuntimeProblem("9.9.9"));
        }

        [Test]
        public void ReadsAValidManifest()
        {
            var m = PlannerManifest.Parse(Fixture.Manifest());
            Assert.AreEqual("unity", m.Engine);
            Assert.IsTrue(m.HasUnityCode);
            Assert.AreEqual("Data/Item/", m.Schemas.Single().Data);
        }

        [Test]
        public void RefusesOtherFormatsVersionsAndUnsafePaths()
        {
            Assert.Throws<PlannerImportException>(() => PlannerManifest.Parse("{"));
            Assert.Throws<PlannerImportException>(() => PlannerManifest.Parse("{\"format\":\"other\",\"v\":1}"));
            var e = Assert.Throws<PlannerImportException>(() => PlannerManifest.Parse(Fixture.Manifest(v: 2)));
            StringAssert.Contains("version 2", e.Message);
            Assert.Throws<PlannerImportException>(() => PlannerManifest.Parse(Fixture.Manifest().Replace("Data/Item/", "../../Evil/")));
        }

        [Test]
        public void KnowsADataOnlyBundle()
        {
            Assert.IsFalse(PlannerManifest.Parse(Fixture.Manifest(engine: "godot", adapter: 0)).HasUnityCode);
        }

        /// <summary>The planner writes these fixtures (tests/unityBridge.test.ts checks they are current).</summary>
        [Test]
        public void MatchesThePlannerContract()
        {
            var schema = JObject.Parse(File.ReadAllText(Path.Combine(Fixture.Folder, "hoh-engine.schema.json")));
            var required = schema["required"].Select(x => (string)x).ToList();
            foreach (var k in new[] { "format", "v", "engine", "project", "schemas", "files" }) CollectionAssert.Contains(required, k);
            var sample = PlannerManifest.Parse(File.ReadAllText(Path.Combine(Fixture.Folder, "sample-manifest.json")));
            Assert.AreEqual(PlannerManifest.SupportedVersion, sample.Version);
            Assert.IsTrue(sample.Schemas.Count > 0);
        }
    }

    public class BundleTests
    {
        [Test]
        public void ReadsAZipAndDropsItsTopFolder()
        {
            var b = PlannerBundle.FromZip(Fixture.Zip(new Dictionary<string, string> { ["HoHPlanner/hoh-engine.json"] = Fixture.Manifest(), ["HoHPlanner/Data/Item/item.a.json"] = "{}" }));
            Assert.IsTrue(b.Has("hoh-engine.json"));
            Assert.IsTrue(b.Has("Data/Item/item.a.json"));
        }

        [Test]
        public void RefusesPathsThatLeaveTheFolder()
        {
            Assert.Throws<PlannerImportException>(() => PlannerBundle.FromZip(Fixture.Zip(new Dictionary<string, string> { ["hoh-engine.json"] = "{}", ["../evil.cs"] = "x" })));
            Assert.IsFalse(PlannerBundle.IsSafeRelative("a/../b"));
            Assert.IsFalse(PlannerBundle.IsSafeRelative("C:/x"));
            Assert.IsTrue(PlannerBundle.IsSafeRelative("Data/Item/item.tinker_s_wrench.json"));
        }
    }

    public class RecordValuesTests
    {
        private static object Convert(JToken t, System.Type type) => RecordValues.Convert(t, type, null, out _);

        [Test]
        public void ConvertsPlannerValues()
        {
            Assert.AreEqual(Color.red, Convert("#ff0000", typeof(Color)));
            Assert.AreEqual(new Vector3(1, 2, 3), Convert(new JArray(1, 2, 3), typeof(Vector3)));
            Assert.AreEqual(TestRarity.Rare, Convert("rare", typeof(TestRarity)));
            Assert.AreEqual(7, Convert(7, typeof(int)));
            CollectionAssert.AreEqual(new List<string> { "a", "b" }, (List<string>)Convert(new JArray("a", "b"), typeof(List<string>)));
        }

        [Test]
        public void NeverClearsAFieldWithAMissingValue()
        {
            Assert.AreSame(RecordValues.Keep, Convert(JValue.CreateNull(), typeof(Sprite)));
            Assert.AreSame(RecordValues.Keep, Convert(JValue.CreateNull(), typeof(int)));
            Assert.AreSame(RecordValues.Keep, Convert(new JArray(), typeof(List<Sprite>)));
            RecordValues.Convert("nope", typeof(TestRarity), null, out var problem);
            StringAssert.Contains("not a value", problem);
        }
    }

    public class ImportTests
    {
        private const string Root = "Assets/HoHPlannerBridgeTest";

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

        private static void Write(string path, string text)
        {
            Directory.CreateDirectory(Path.GetDirectoryName($"{Root}/{path}"));
            File.WriteAllText($"{Root}/{path}", text);
        }

        private static RecordStepResult Run()
        {
            AssetDatabase.Refresh();
            return PlannerImporter.ImportRecords(Root, new Dictionary<string, System.Type> { ["test-item"] = typeof(TestItemDefinition) });
        }

        private static TestItemDefinition Asset(string key)
        {
            AssetDatabase.LoadAssetAtPath<PlannerIndex>($"{Root}/{PlannerImporter.IndexFile}").TryGet<TestItemDefinition>(key, out var a);
            return a;
        }

        [Test]
        public void CreatesOneAssetPerRecordWithItsValuesAndReferences()
        {
            Write("hoh-engine.json", Fixture.Manifest());
            Write("Data/Item/item.blade.json", Fixture.Record("p1", "item.blade", "Blade"));
            Write("Data/Item/item.sword.json", Fixture.Record("p2", "item.sword", "Sword", new { parts = new[] { "item.blade" } }));
            var r = Run();
            Assert.AreEqual(2, r.Created, string.Join("\n", r.Problems));
            CollectionAssert.IsEmpty(r.Problems);
            var sword = Asset("item.sword");
            Assert.AreEqual("Sword", sword.displayName);
            Assert.AreEqual("p2", sword.plannerId);
            Assert.AreEqual(5, sword.value);
            Assert.AreEqual(TestRarity.Rare, sword.rarity);
            Assert.AreEqual(Color.red, sword.tint);
            Assert.AreEqual(new Vector2(2, 3), sword.size);
            Assert.AreSame(Asset("item.blade"), sword.parts.Single());
            Assert.AreEqual($"{Root}/{PlannerImporter.RecordsFolder}/TestItemDefinition/item.sword.asset", AssetDatabase.GetAssetPath(sword));
        }

        [Test]
        public void ReimportUpdatesInPlaceKeepsHandSetAssetsRenamesAndMarksRemoved()
        {
            Write("hoh-engine.json", Fixture.Manifest());
            Write("Data/Item/item.blade.json", Fixture.Record("p1", "item.blade", "Blade"));
            Write("Data/Item/item.sword.json", Fixture.Record("p2", "item.sword", "Sword"));
            Run();
            var sword = Asset("item.sword");
            // A designer assigns a saved sprite asset in the Inspector.
            var texture = new Texture2D(4, 4);
            AssetDatabase.CreateAsset(texture, $"{Root}/icon.asset");
            var sprite = Sprite.Create(texture, new Rect(0, 0, 4, 4), Vector2.zero);
            sprite.name = "icon";
            AssetDatabase.AddObjectToAsset(sprite, texture);
            sword.icon = sprite;
            sword.tags = new List<string> { "kept?" };
            EditorUtility.SetDirty(sword);
            AssetDatabase.SaveAssets();

            File.Delete($"{Root}/Data/Item/item.sword.json");
            File.Delete($"{Root}/Data/Item/item.blade.json");
            Write("Data/Item/item.long_sword.json", Fixture.Record("p2", "item.long_sword", "Long sword", new { value = 9 }));
            var r = Run();

            Assert.AreEqual(0, r.Created);
            Assert.AreEqual(1, r.Renamed);
            Assert.AreEqual(1, r.Deprecated);
            var again = Asset("item.long_sword");
            Assert.AreSame(sword, again, "same asset, so references to it survive the rename");
            Assert.AreEqual(9, again.value);
            Assert.AreSame(sprite, again.icon, "a null planner value keeps the sprite set in Unity");
            CollectionAssert.AreEqual(new List<string> { "a", "b" }, again.tags, "values the planner has are overwritten");
            Assert.AreEqual($"{Root}/{PlannerImporter.RecordsFolder}/TestItemDefinition/item.long_sword.asset", AssetDatabase.GetAssetPath(again));
            var index = AssetDatabase.LoadAssetAtPath<PlannerIndex>($"{Root}/{PlannerImporter.IndexFile}");
            Assert.IsTrue(index.FindByPlannerId("p1").deprecated);
            Assert.IsNotNull(index.FindByPlannerId("p1").asset, "a removed record keeps its asset");
        }

        [Test]
        public void WritesAReportOfRecordsAndClassesForThePlanner()
        {
            Write("hoh-engine.json", Fixture.Manifest());
            Write("ir/engine-ir.json", "{\"schemas\":[{\"id\":\"test-item\",\"fields\":[{\"name\":\"icon\",\"optional\":false},{\"name\":\"tags\",\"optional\":true}]}]}");
            Write("Data/Item/item.blade.json", Fixture.Record("p1", "item.blade", "Blade"));
            Write("Unity/Scripts/Generated/classes.json", "[{\"plannerId\":\"c1\",\"name\":\"Health\",\"own\":\"Unity/Scripts/Classes/Health.cs.txt\",\"methods\":2},{\"plannerId\":\"c2\",\"name\":\"Brain\",\"own\":\"Unity/Scripts/Classes/Brain.cs.txt\",\"methods\":1},{\"plannerId\":\"c3\",\"name\":\"IHit\",\"own\":null,\"generated\":\"Unity/Scripts/Generated/IHit.cs.txt\",\"methods\":1}]");
            Write("Unity/Scripts/Classes/Health.cs.txt", "float A() { return 1; }\nvoid B()\n{\n    // TODO\n}");
            Write("Unity/Scripts/Generated/IHit.cs.txt", "interface IHit {}");
            Run();
            var report = PlannerReport.Build(Root);
            Assert.AreEqual("hoh-engine-report", (string)report["format"]);
            var blade = report["records"].Single(r => (string)r["plannerId"] == "p1");
            Assert.AreEqual("incomplete", (string)blade["status"]);
            // The import gave the blade a placeholder icon; the report still counts it as missing art.
            CollectionAssert.AreEqual(new[] { "icon: still a placeholder." }, blade["issues"].Select(x => (string)x));
            var classes = report["classes"].ToDictionary(c => (string)c["plannerId"], c => c);
            Assert.AreEqual("stub", (string)classes["c1"]["status"]);
            Assert.AreEqual(1, (int)classes["c1"]["todo"]);
            Assert.AreEqual("missing", (string)classes["c2"]["status"]);
            Assert.AreEqual("implemented", (string)classes["c3"]["status"]);
            Assert.IsTrue(File.Exists(PlannerReport.Write(Root)));
        }

        [Test]
        public void FinishesTheImportWhenThePlannerWroteTheFolder()
        {
            Assert.IsTrue(PlannerFolderWatcher.ShouldImport(new[] { $"{Root}/hoh-engine.json" }, Root, true, false));
            Assert.IsFalse(PlannerFolderWatcher.ShouldImport(new[] { $"{Root}/hoh-engine.json" }, Root, false, false), "switched off");
            Assert.IsFalse(PlannerFolderWatcher.ShouldImport(new[] { $"{Root}/hoh-engine.json" }, Root, true, true), "during the bridge's own import");
            Assert.IsFalse(PlannerFolderWatcher.ShouldImport(new[] { $"{Root}/Data/Item/item.a.json" }, Root, true, false));

            // What the planner writes into a linked folder, then the record step the watcher asks for.
            Write("Data/Item/item.blade.json", Fixture.Record("p1", "item.blade", "Blade"));
            Write("hoh-engine.json", Fixture.Manifest());
            AssetDatabase.Refresh();
            PlannerImporter.MarkPending(Root);
            var r = PlannerImporter.ResumePendingNow();
            Assert.IsNotNull(r);
            Assert.AreEqual(1, r.Created, string.Join("\n", r.Problems));
            Assert.AreEqual("Blade", Asset("item.blade").displayName);
            Assert.IsTrue(File.Exists($"{Root}/{PlannerReport.FileName}"), "the report for the planner is written too");
            Assert.IsNull(PlannerImporter.ResumePendingNow(), "nothing left waiting");
        }

        [Test]
        public void SetsUpPlannedFoldersAssembliesAndProjectFilesWithoutOverwriting()
        {
            Write("Unity/ProjectFiles/.editorconfig", "root = true\n");
            Write("Unity/ProjectFiles/.gitattributes", "*.png filter=lfs\n");
            Write("Unity/ProjectFiles/.gitignore", "/Library/\n");
            Write("Unity/ProjectFiles/setup.json", $"{{\"generatedAssembly\":\"Gen\",\"folders\":[{{\"path\":\"{Root}/Planned\"}},{{\"path\":\"{Root}/Planned/Core\",\"asmdef\":{{\"name\":\"My.Core\",\"rootNamespace\":\"My.Core\",\"references\":[\"Gen\"]}}}},{{\"path\":\"{Root}/Planned/Kept\",\"asmdef\":{{\"name\":\"My.Kept\",\"references\":[]}}}},{{\"path\":\"../Outside\"}}]}}");
            // A folder that already has its own assembly definition keeps it.
            Directory.CreateDirectory($"{Root}/Planned/Kept");
            File.WriteAllText($"{Root}/Planned/Kept/Mine.asmdef", "{\"name\":\"Mine\"}");

            var folders = PlannerSetup.CreateFolders(Root);
            File.Delete($"{Root}/Planned/Kept/Mine.asmdef"); // removed again before anything refreshes and compiles it
            Assert.AreEqual(1, folders.Created);
            Assert.AreEqual(2, folders.Unchanged);
            Assert.AreEqual(1, folders.Assemblies);
            Assert.IsFalse(File.Exists($"{Root}/Planned/Kept/My.Kept.asmdef"));
            var asm = JObject.Parse(File.ReadAllText($"{Root}/Planned/Core/My.Core.asmdef"));
            File.Delete($"{Root}/Planned/Core/My.Core.asmdef");
            Assert.AreEqual("My.Core", (string)asm["name"]);
            CollectionAssert.AreEqual(new[] { "Gen" }, asm["references"].Select(x => (string)x));
            Assert.IsFalse(Directory.Exists("Outside"), "paths outside Assets/ are ignored");

            var project = Path.Combine(Path.GetTempPath(), "hoh-setup-" + System.Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(project);
            try
            {
                File.WriteAllText(Path.Combine(project, ".gitignore"), "# mine\n");
                File.WriteAllText(Path.Combine(project, ".gitattributes"), "*.png filter=lfs\r\n");
                var files = PlannerSetup.InstallProjectFiles(Root, project);
                Assert.AreEqual(1, files.Created);
                Assert.AreEqual(1, files.Unchanged, "line endings do not count as a difference");
                CollectionAssert.AreEqual(new[] { ".gitignore" }, files.Differs);
                Assert.AreEqual("# mine\n", File.ReadAllText(Path.Combine(project, ".gitignore")), "yours is kept");
                Assert.AreEqual("/Library/\n", File.ReadAllText(Path.Combine(project, ".gitignore.planner")));
                Assert.AreEqual("root = true\n", File.ReadAllText(Path.Combine(project, ".editorconfig")));
            }
            finally
            {
                Directory.Delete(project, true);
            }
        }

        [Test]
        public void ReportsAMissingTypeInsteadOfFailing()
        {
            Write("hoh-engine.json", Fixture.Manifest());
            Write("Data/Item/item.a.json", Fixture.Record("p1", "item.a", "A"));
            AssetDatabase.Refresh();
            var r = PlannerImporter.ImportRecords(Root, new Dictionary<string, System.Type>());
            Assert.AreEqual(0, r.Created);
            StringAssert.Contains("no compiled C# type", r.Problems.Single());
        }

        [Test]
        public void FileStepReplacesGeneratedFilesButNeverYourClassFiles()
        {
            Write("Unity/Scripts/Classes/Combat/Health.cs", "// mine");
            Write("Unity/Scripts/Generated/Old.Generated.cs.txt", "old");
            Write("Data/Item/item.gone.json", "{}");
            var bundle = new PlannerBundle(new Dictionary<string, byte[]>
            {
                ["hoh-engine.json"] = Encoding.UTF8.GetBytes(Fixture.Manifest()),
                ["Unity/Scripts/Classes/Combat/Health.cs"] = Encoding.UTF8.GetBytes("// generated stub"),
                ["Unity/Scripts/Classes/Combat/NewOne.cs.txt"] = Encoding.UTF8.GetBytes("// new stub"),
                ["Data/Item/item.a.json"] = Encoding.UTF8.GetBytes("{}"),
            });
            var r = PlannerImporter.WriteFiles(bundle, Root);
            Assert.AreEqual("// mine", File.ReadAllText($"{Root}/Unity/Scripts/Classes/Combat/Health.cs"));
            Assert.AreEqual("// new stub", File.ReadAllText($"{Root}/Unity/Scripts/Classes/Combat/NewOne.cs.txt"));
            Assert.AreEqual(1, r.KeptYours);
            // No export was there before: files the planner did not write are never deleted (PlannerOwnershipTests covers removal).
            Assert.IsTrue(File.Exists($"{Root}/Unity/Scripts/Generated/Old.Generated.cs.txt"));
            Assert.IsTrue(File.Exists($"{Root}/Data/Item/item.gone.json"));
            Assert.AreEqual(0, r.Deleted);
            Assert.Throws<PlannerImportException>(() => PlannerImporter.WriteFiles(bundle, "Packages/elsewhere"));
        }
    }
}

namespace HoHPlanner.Bridge.Tests
{
    public class RenameTests
    {
        private const string Root = "Assets/HoHPlannerRenameTest";

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

        private static string Index(string path, string name) => "[{\"plannerId\":\"c1\",\"own\":\"" + path + "\",\"ownFiles\":[\"" + path + "\"],\"tokens\":[\"" + name + "\"]}]";

        [Test]
        public void ChangesWholeNamesOnly()
        {
            var replace = new[] { new KeyValuePair<string, string>("Health", "Vitality") };
            Assert.AreEqual("partial class Vitality : HealthBar // Vitality", PlannerRenames.RenameIn("partial class Health : HealthBar // Health", replace));
        }

        [Test]
        public void MovesYourFileAndItsMetaWithTheRenamedClass()
        {
            const string oldPath = "Unity/Scripts/Classes/Player/PlayerController.cs";
            const string newPath = "Unity/Scripts/Classes/Player/IslandPlayer.cs";
            Directory.CreateDirectory($"{Root}/Unity/Scripts/Generated");
            Directory.CreateDirectory($"{Root}/Unity/Scripts/Classes/Player");
            File.WriteAllText($"{Root}/{PlannerRenames.ClassIndex}", Index(oldPath, "PlayerController"));
            // The earlier export's manifest lists the index it wrote, so the new export may replace it.
            var earlier = JObject.Parse(Fixture.Manifest());
            earlier["files"] = new JArray(new JObject { ["path"] = PlannerRenames.ClassIndex, ["hash"] = PlannerOwnership.Fnv1a(Index(oldPath, "PlayerController")) });
            File.WriteAllText($"{Root}/hoh-engine.json", earlier.ToString());
            File.WriteAllText($"{Root}/{oldPath}", "public partial class PlayerController { void Jump() { /* mine */ } }");
            File.WriteAllText($"{Root}/{oldPath}.meta", "guid: 0123456789abcdef");
            var bundle = new PlannerBundle(new Dictionary<string, byte[]>
            {
                ["hoh-engine.json"] = Encoding.UTF8.GetBytes(Fixture.Manifest()),
                [PlannerRenames.ClassIndex] = Encoding.UTF8.GetBytes(Index(newPath, "IslandPlayer")),
                [newPath] = Encoding.UTF8.GetBytes("public partial class IslandPlayer { }"),
            });
            var r = PlannerImporter.WriteFiles(bundle, Root);
            CollectionAssert.AreEqual(new[] { $"{oldPath} → {newPath}" }, r.Moved);
            Assert.IsFalse(File.Exists($"{Root}/{oldPath}"));
            Assert.AreEqual("public partial class IslandPlayer { void Jump() { /* mine */ } }", File.ReadAllText($"{Root}/{newPath}"), "your code, with the new name; the export's empty file is not written over it");
            Assert.AreEqual("guid: 0123456789abcdef", File.ReadAllText($"{Root}/{newPath}.meta"), "same GUID, so scenes keep the script");
            Assert.AreEqual(1, r.KeptYours);
        }
    }

    public class PlaceholderTests
    {
        private const string Root = "Assets/HoHPlannerPlaceholderTest";

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

        private static void Write(string path, string text)
        {
            Directory.CreateDirectory(Path.GetDirectoryName($"{Root}/{path}"));
            File.WriteAllText($"{Root}/{path}", text);
        }

        [Test]
        public void DrawsInitialsInAContrastingColour()
        {
            Assert.AreEqual("IS", PlannerPlaceholders.Initials("item.iron_sword"));
            Assert.AreEqual("PL", PlannerPlaceholders.Initials("item.plank"));
            var tex = PlannerPlaceholders.Texture(new Color(0.1f, 0.1f, 0.3f), "IS");
            Assert.AreEqual(64, tex.width);
            var pixels = tex.GetPixels();
            Assert.IsTrue(pixels.Any(p => p == Color.white), "light ink on a dark colour");
            Assert.IsTrue(pixels.Any(p => Mathf.Abs(p.b - 0.3f) < 0.01f), "the colour itself (8 bits per channel)");
        }

        [Test]
        public void FillsOnlyEmptyArtWithLabelledPlaceholdersInThePalette()
        {
            Write("hoh-engine.json", Fixture.Manifest());
            Write("ir/engine-ir.json", "{\"art\":{\"palette\":[\"#2b2135\",\"#f2a65a\"]}}");
            Write("Data/Item/item.blade.json", Fixture.Record("p1", "item.blade", "Blade"));
            Write("Data/Item/item.sword.json", Fixture.Record("p2", "item.sword", "Sword"));
            AssetDatabase.Refresh();
            PlannerImporter.ImportRecords(Root, new Dictionary<string, System.Type> { ["test-item"] = typeof(TestItemDefinition) });
            var index = AssetDatabase.LoadAssetAtPath<PlannerIndex>($"{Root}/{PlannerImporter.IndexFile}");
            index.TryGet<TestItemDefinition>("item.blade", out var blade);
            index.TryGet<TestItemDefinition>("item.sword", out var sword);
            Assert.IsNotNull(blade.icon, "the import made a placeholder");
            Assert.IsTrue(PlannerPlaceholders.IsPlaceholder(blade.icon.texture));
            Assert.AreEqual($"{Root}/{PlannerPlaceholders.Folder}/TestItemDefinition/item.blade.png", AssetDatabase.GetAssetPath(blade.icon));
            var palette = PlannerPlaceholders.Palette(Root);
            Assert.AreEqual(2, palette.Count);

            // A real sprite set by hand is never replaced; running again makes nothing new.
            var texture = new Texture2D(4, 4);
            AssetDatabase.CreateAsset(texture, $"{Root}/real.asset");
            var real = Sprite.Create(texture, new Rect(0, 0, 4, 4), Vector2.zero);
            real.name = "real";
            AssetDatabase.AddObjectToAsset(real, texture);
            sword.icon = real;
            EditorUtility.SetDirty(sword);
            var again = PlannerPlaceholders.Apply(Root);
            Assert.AreEqual(0, again.Created);
            Assert.AreEqual(0, again.Assigned);
            Assert.AreSame(real, sword.icon);
        }
    }

    public class MetricsTests
    {
        private string dir;

        [SetUp]
        public void SetUp()
        {
            dir = Path.Combine(Path.GetTempPath(), "hoh-metrics-" + System.Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(dir);
            PlannerMetrics.FilePath = Path.Combine(dir, PlannerMetrics.FileName);
            PlannerMetrics.Clear();
        }

        [TearDown]
        public void TearDown()
        {
            PlannerMetrics.Clear();
            PlannerMetrics.FilePath = null;
            Directory.Delete(dir, true);
        }

        [Test]
        public void SumsSamplesSavesThemAndMergesAnotherFile()
        {
            PlannerMetrics.Record("combat.ttk", 4);
            PlannerMetrics.Record("combat.ttk", 6);
            PlannerMetrics.Record("combat.ttk", double.NaN);
            PlannerMetrics.Record("", 1);
            PlannerMetrics.Save();
            var saved = PlannerMetrics.Load(PlannerMetrics.FilePath).Single();
            Assert.AreEqual("combat.ttk", saved.key);
            Assert.AreEqual(2, saved.samples);
            Assert.AreEqual(5, saved.Mean, 1e-9);
            Assert.AreEqual(4, saved.min);
            Assert.AreEqual(6, saved.max);

            var other = Path.Combine(dir, "tester.json");
            File.WriteAllText(other, "{\"metrics\":[{\"key\":\"combat.ttk\",\"samples\":2,\"sum\":20,\"min\":9,\"max\":11,\"build\":\"0.3.1\",\"lastAt\":\"2999-01-01T00:00:00Z\"},{\"key\":\"progress.act1_hours\",\"samples\":1,\"sum\":4.5,\"min\":4.5,\"max\":4.5}]}");
            Assert.AreEqual(2, PlannerMetrics.Merge(other));
            var merged = PlannerMetrics.Load(PlannerMetrics.FilePath).ToDictionary(m => m.key);
            Assert.AreEqual(4, merged["combat.ttk"].samples);
            Assert.AreEqual(7.5, merged["combat.ttk"].Mean, 1e-9);
            Assert.AreEqual(11, merged["combat.ttk"].max);
            Assert.AreEqual("0.3.1", merged["combat.ttk"].build, "the newest sample's build");
            Assert.AreEqual(4.5, merged["progress.act1_hours"].Mean, 1e-9);
            File.WriteAllText(other, "not json");
            Assert.AreEqual(0, PlannerMetrics.Load(other).Count);
        }
    }
}

namespace HoHPlanner.Bridge.Tests
{
    public class LiveLinkTests
    {
        [Test]
        public void AllowsLocalPagesAndThePlannerAddressOnly()
        {
            Assert.IsTrue(PlannerLiveLink.AllowedOrigin("http://localhost:5173", ""));
            Assert.IsTrue(PlannerLiveLink.AllowedOrigin("http://127.0.0.1:4173", ""));
            Assert.IsTrue(PlannerLiveLink.AllowedOrigin("https://planner.example.org", "https://planner.example.org/"));
            Assert.IsFalse(PlannerLiveLink.AllowedOrigin("https://evil.example.com", "https://planner.example.org"));
            Assert.IsFalse(PlannerLiveLink.AllowedOrigin("https://planner.example.org:8443", "https://planner.example.org"));
            Assert.IsFalse(PlannerLiveLink.AllowedOrigin("file://", ""));
            Assert.IsTrue(PlannerLiveLink.AllowedOrigin(null, ""), "non-browser clients send no Origin");
        }

        [Test]
        public void AnswersStatusAndRefusesValuesOutsidePlayMode()
        {
            var (status, reply) = PlannerLiveLink.Answer("GET", "/status", "");
            Assert.AreEqual(200, status);
            Assert.AreEqual("unity", (string)reply["engine"]);
            Assert.IsFalse((bool)reply["playing"]);
            Assert.AreEqual(409, PlannerLiveLink.Answer("POST", "/values", "{\"records\":[]}").status);
            Assert.AreEqual(404, PlannerLiveLink.Answer("POST", "/ping", "{\"plannerId\":\"nope\"}").status);
            Assert.AreEqual(400, PlannerLiveLink.Answer("POST", "/ping", "{bad").status);
            Assert.AreEqual(404, PlannerLiveLink.Answer("GET", "/secrets", "").status);
        }

        [Test]
        public void ChecksTokenAndOriginOverHttp()
        {
            const int port = 51799;
            PlannerLiveLink.Start(port);
            try
            {
                Assert.IsTrue(PlannerLiveLink.Running);
                int Send(string method, string token, string origin)
                {
                    var req = (System.Net.HttpWebRequest)System.Net.WebRequest.Create($"http://127.0.0.1:{port}/status");
                    req.Method = method;
                    req.Timeout = 5000;
                    if (token != null) req.Headers["X-HoH-Token"] = token;
                    if (origin != null) req.Headers["Origin"] = origin;
                    try
                    {
                        using (var res = (System.Net.HttpWebResponse)req.GetResponse()) return (int)res.StatusCode;
                    }
                    catch (System.Net.WebException e) when (e.Response is System.Net.HttpWebResponse r)
                    {
                        return (int)r.StatusCode;
                    }
                }
                Assert.AreEqual(401, Send("GET", null, null), "no token");
                Assert.AreEqual(401, Send("GET", "wrong", "http://localhost:5173"));
                Assert.AreEqual(403, Send("GET", PlannerLiveLink.Token, "https://evil.example.com"));
                Assert.AreEqual(204, Send("OPTIONS", null, "http://localhost:5173"), "CORS preflight");
            }
            finally
            {
                PlannerLiveLink.Stop();
            }
            Assert.IsFalse(PlannerLiveLink.Running);
        }
    }
}
