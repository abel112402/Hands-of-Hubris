using System.Collections.Generic;
using System.IO;
using System.Linq;
using HoHPlanner.Bridge.Editor;
using NUnit.Framework;
using UnityEditor;
using UnityEditor.AddressableAssets;

namespace HoHPlanner.Bridge.Tests
{
    public class PlannerAddressablesTests
    {
        private const string Root = "Assets/HoHPlannerAddressablesTest";
        private const string Group = "Planner Test Content";

        private static void Clean()
        {
            var settings = AddressableAssetSettingsDefaultObject.Settings;
            var g = settings != null ? settings.FindGroup(Group) : null;
            if (g != null) settings.RemoveGroup(g);
            AssetDatabase.DeleteAsset(Root);
        }

        [SetUp]
        public void SetUp() => Clean();

        [TearDown]
        public void TearDown() => Clean();

        private static void Write(string path, string text)
        {
            Directory.CreateDirectory(Path.GetDirectoryName($"{Root}/{path}"));
            File.WriteAllText($"{Root}/{path}", text);
        }

        [Test]
        public void PutsTheRecordsOfALoadGroupIntoItsAddressablesGroupWithTheirKeysAndLabel()
        {
            Write("hoh-engine.json", "{\"format\":\"hoh-engine\",\"v\":1,\"engine\":{\"id\":\"unity\",\"adapterVersion\":3},\"project\":{\"name\":\"T\"},\"schemas\":[" +
                "{\"id\":\"test-item\",\"name\":\"Item\",\"format\":\"native\",\"idPrefix\":\"item.\",\"version\":1,\"records\":2,\"data\":\"Data/Item/\",\"load\":{\"group\":\"" + Group + "\",\"strategy\":\"Preload at boot\",\"label\":\"content-items\"}}," +
                "{\"id\":\"q\",\"name\":\"Quest\",\"format\":\"json\",\"idPrefix\":\"quest.\",\"version\":1,\"records\":1,\"data\":\"Data/Quest/\",\"load\":{\"group\":\"" + Group + "\",\"strategy\":\"On demand\"}}],\"files\":[]}");
            Write("Data/Item/item.a.json", "{\"id\":\"item.a\",\"plannerId\":\"p1\",\"name\":\"A\"}");
            Write("Data/Item/item.b.json", "{\"id\":\"item.b\",\"plannerId\":\"p2\",\"name\":\"B\"}");
            Write("Data/Quest/quest.x.json", "{\"id\":\"quest.x\",\"plannerId\":\"p3\"}");
            AssetDatabase.Refresh();
            // The import runs the Addressables step itself (PlannerImporter.AfterRecords).
            var r = PlannerImporter.ImportRecords(Root, new Dictionary<string, System.Type> { ["test-item"] = typeof(TestItemDefinition) });
            CollectionAssert.IsEmpty(r.Problems);

            var settings = AddressableAssetSettingsDefaultObject.Settings;
            var group = settings.FindGroup(Group);
            Assert.IsNotNull(group);
            var byAddress = group.entries.ToDictionary(e => e.address, e => e);
            CollectionAssert.AreEquivalent(new[] { "item.a", "item.b", "quest.x" }, byAddress.Keys);
            Assert.AreEqual($"{Root}/Records/TestItemDefinition/item.a.asset", byAddress["item.a"].AssetPath);
            CollectionAssert.Contains(byAddress["item.a"].labels, "content-items");
            CollectionAssert.IsEmpty(byAddress["quest.x"].labels);

            // Again: same entries, no duplicates.
            var again = PlannerAddressables.Apply(Root, PlannerManifest.Parse(File.ReadAllText($"{Root}/hoh-engine.json")));
            Assert.AreEqual(0, again.Groups);
            Assert.AreEqual(3, again.Entries);
            Assert.AreEqual(3, settings.FindGroup(Group).entries.Count);
        }
    }
}
