using System.IO;
using System.Linq;
using HoHPlanner.Bridge.Editor;
using NUnit.Framework;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace HoHPlanner.Bridge.Tests
{
    /// <summary>Shaped like a generated ScriptableObject channel (a ChannelId constant).</summary>
    public sealed class TestPlannerChannel : ScriptableObject
    {
        public const string ChannelId = "test-channel";
    }

    public class PlannerIdeasTests
    {
        private const string Root = "Assets/HoHPlannerIdeasTest";

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

        [Test]
        public void MakesOneAssetPerChannelTypeOnce()
        {
            Directory.CreateDirectory(Root);
            AssetDatabase.Refresh();
            CollectionAssert.DoesNotContain(PlannerChannels.ChannelTypes(), typeof(TestPlannerChannel), "a real import makes no assets for test types");
            Assert.Contains(typeof(TestPlannerChannel), PlannerChannels.ChannelTypes(includeTests: true));
            Assert.Greater(PlannerChannels.Apply(Root, includeTests: true), 0);
            Assert.IsNotNull(AssetDatabase.LoadAssetAtPath<TestPlannerChannel>($"{Root}/{PlannerChannels.Folder}/TestPlannerChannel.asset"));
            Assert.AreEqual(0, PlannerChannels.Apply(Root, includeTests: true), "an existing channel asset is kept");
        }

        [Test]
        public void AddsTelemetryUpIntoCountsAndMeans()
        {
            Directory.CreateDirectory(Root);
            var path = $"{Root}/telemetry.jsonl";
            File.WriteAllLines(path, new[]
            {
                "{\"event\":\"enemy_killed\",\"t\":\"2026-11-21T10:00:00Z\",\"session\":\"a\",\"build\":\"0.3\",\"enemy\":\"enemy.brute\",\"seconds\":4}",
                "{\"event\":\"enemy_killed\",\"t\":\"2026-11-21T10:01:00Z\",\"session\":\"a\",\"build\":\"0.3\",\"enemy\":null,\"seconds\":6.5}",
                "not json",
                "{\"event\":\"player_died\",\"day\":3}",
            });
            var m = PlannerTelemetry.Summaries(path).ToDictionary(x => x.key);
            CollectionAssert.AreEquivalent(new[] { "enemy_killed.count", "enemy_killed.seconds", "player_died.count", "player_died.day" }, m.Keys);
            Assert.AreEqual(2, m["enemy_killed.count"].samples);
            Assert.AreEqual(5.25, m["enemy_killed.seconds"].Mean, 1e-9);
            Assert.AreEqual(4, m["enemy_killed.seconds"].min);
            Assert.AreEqual(6.5, m["enemy_killed.seconds"].max);
            Assert.AreEqual("0.3", m["enemy_killed.seconds"].build);
        }

        [Test]
        public void DecodesTheMapGridFormat()
        {
            CollectionAssert.AreEqual(new byte[] { 0, 0, 0, 1, 27 }, PlannerGreybox.DecodeRle("3ABb", 5));
            Assert.Throws<InvalidDataException>(() => PlannerGreybox.DecodeRle("3A", 5));
            Assert.Throws<InvalidDataException>(() => PlannerGreybox.DecodeRle("6A", 5));
        }

        [Test]
        public void BuildsAWalkableGreyboxSceneFromAMap()
        {
            // 4×3 cells: a walkable middle row, a locked door cell, a key, a spawn and a light.
            Directory.CreateDirectory($"{Root}/Maps");
            File.WriteAllText($"{Root}/Maps/crypt.json", "{\"format\":\"hoh-location\",\"version\":1,\"name\":\"Test Crypt\",\"size\":{\"w\":40,\"h\":30}," +
                "\"spawns\":[{\"id\":\"s\",\"role\":\"entrance\",\"x\":5,\"y\":15}],\"lights\":[{\"id\":\"l\",\"x\":20,\"y\":15,\"radius\":30,\"color\":\"#ffaa00\",\"intensity\":1}]," +
                "\"locks\":[{\"id\":\"k1\",\"lock\":\"red\",\"x\":25,\"y\":15}],\"keys\":[{\"id\":\"k2\",\"key\":\"red\",\"x\":5,\"y\":15}]," +
                "\"nav\":{\"cell\":10,\"cols\":4,\"rows\":3,\"cost\":\"4A4B4A\",\"tags\":\"6AGA4A\"},\"light\":{\"cell\":10,\"cols\":4,\"rows\":3,\"level\":\"12K\"}}");
            AssetDatabase.Refresh();
            var r = PlannerGreybox.Build(Root);
            CollectionAssert.IsEmpty(r.Notes);
            Assert.AreEqual($"{Root}/{PlannerGreybox.Folder}/Test_Crypt.unity", r.Scenes.Single());
            var scene = EditorSceneManager.OpenScene(r.Scenes[0], OpenSceneMode.Single);
            {
                var all = scene.GetRootGameObjects().SelectMany(g => g.GetComponentsInChildren<Transform>(true)).Select(t => t.gameObject).ToList();
                var floor = all.Single(g => g.name == "Floor").GetComponent<MeshFilter>().sharedMesh;
                Assert.AreEqual(4 * 4, floor.vertexCount, "one quad per walkable cell");
                Assert.AreEqual(8 * 5 * 4, all.Single(g => g.name == "Walls").GetComponent<MeshFilter>().sharedMesh.vertexCount, "a 2 m block on every blocked cell next to the walkable row");
                Assert.IsTrue(all.Any(g => g.name == "Locked door" && g.GetComponent<Collider>().isTrigger));
                Assert.IsTrue(all.Any(g => g.name == "Key: red"));
                Assert.IsTrue(all.Any(g => g.name == "Lock: red"));
                Assert.IsTrue(all.Any(g => g.name == "Spawn: entrance"));
                var light = all.Single(g => g.name == "Light").GetComponent<Light>();
                Assert.AreEqual(3f, light.range);
                Assert.AreEqual(new Vector3(2, 2.5f, -1.5f), light.transform.position);
            }
            EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
        }
    }
}
