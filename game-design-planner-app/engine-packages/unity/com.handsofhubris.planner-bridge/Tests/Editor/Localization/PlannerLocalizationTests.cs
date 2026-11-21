using System.IO;
using HoHPlanner.Bridge.Editor;
using NUnit.Framework;
using UnityEditor;
using UnityEditor.Localization;
using UnityEngine.Localization.Tables;

namespace HoHPlanner.Bridge.Tests
{
    public class PlannerLocalizationTests
    {
        private const string Root = "Assets/HoHPlannerLocalizationTest";
        /// <summary>Its own collection, so a project that already has the planner's “Planner” table is not touched.</summary>
        private const string Collection = "PlannerBridgeTest";

        [SetUp]
        public void SetUp() => AssetDatabase.DeleteAsset(Root);

        /// <summary>The collection, its tables and the locales live under Root, so deleting it removes them.</summary>
        [TearDown]
        public void TearDown() => AssetDatabase.DeleteAsset(Root);

        private static void Csv(string text)
        {
            Directory.CreateDirectory($"{Root}/Localization");
            File.WriteAllText($"{Root}/Localization/strings.csv", text);
        }

        [Test]
        public void ReadsQuotedCsv()
        {
            var rows = PlannerLocalization.ParseCsv("key,en\na.title,\"Hello, \"\"world\"\"\"\nb.text,\"two\nlines\"\n");
            Assert.AreEqual(3, rows.Count);
            Assert.AreEqual("Hello, \"world\"", rows[1][1]);
            Assert.AreEqual("two\nlines", rows[2][1]);
        }

        [Test]
        public void KeepsThePlannerStringTableInStepWithThePlan()
        {
            Csv("key,en,hu\nquest.a.title,Washed ashore,Partra vetve\nquest.b.title,\"Rats, again\",Megint patkányok\n");
            var first = PlannerLocalization.Apply(Root, Collection);
            Assert.AreEqual(2, first.Added);
            var collection = LocalizationEditorSettings.GetStringTableCollection(Collection);
            Assert.IsNotNull(collection);
            var en = (StringTable)collection.GetTable("en");
            var hu = (StringTable)collection.GetTable("hu");
            Assert.AreEqual("Rats, again", en.GetEntry("quest.b.title").Value);
            Assert.AreEqual("Partra vetve", hu.GetEntry("quest.a.title").Value);

            Csv("key,en,hu\nquest.a.title,Washed ashore!,Partra vetve!\nquest.c.title,New,Új\n");
            var second = PlannerLocalization.Apply(Root, Collection);
            Assert.AreEqual(1, second.Added);
            Assert.AreEqual(1, second.Updated);
            Assert.AreEqual(1, second.Removed);
            Assert.AreEqual(0, second.Locales);
            Assert.AreEqual("Washed ashore!", ((StringTable)collection.GetTable("en")).GetEntry("quest.a.title").Value);
            Assert.IsNull(collection.SharedData.GetEntry("quest.b.title"));
        }
    }
}
