using System.Collections;
using System.Collections.Generic;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.TestTools;

namespace HoHPlanner.Runtime.Tests
{
    /// <summary>Quick save and quick load while playing: the planned actions, the slot, what is reported.</summary>
    public class PlannerQuickSaveTests
    {
        public sealed class Keys : MonoBehaviour, IPlannerSaveSource
        {
            public bool Save, Load;
            public bool QuickSavePressed => Save;
            public bool QuickLoadPressed => Load;
        }

        public sealed class SaveStub : MonoBehaviour, IPlannerSaveSystem
        {
            public readonly Dictionary<string, Vector3> Slots = new Dictionary<string, Vector3>();
            public Transform Player;
            public bool Broken;

            public void Save(string slot) => Slots[slot] = Player.position;

            public bool Load(string slot)
            {
                if (Broken) throw new PlannerStateException("damaged");
                if (!Slots.TryGetValue(slot, out var at)) return false;
                Player.position = at;
                return true;
            }

            public void Delete(string slot) => Slots.Remove(slot);
        }

        readonly List<GameObject> made = new List<GameObject>();
        Keys keys;
        SaveStub stub;
        PlannerQuickSave quick;

        [SetUp]
        public void SetUp()
        {
            var player = new GameObject("Player");
            made.Add(player);
            keys = player.AddComponent<Keys>();
            var go = new GameObject("Save");
            made.Add(go);
            stub = go.AddComponent<SaveStub>();
            stub.Player = player.transform;
            quick = go.AddComponent<PlannerQuickSave>();
            quick.SaveSystem = stub;
            quick.Player = player.transform;
        }

        [TearDown]
        public void TearDown()
        {
            foreach (var go in made) if (go != null) Object.DestroyImmediate(go);
            made.Clear();
        }

        IEnumerator Press(bool save)
        {
            if (save) keys.Save = true;
            else keys.Load = true;
            yield return null;
            keys.Save = keys.Load = false;
            yield return null;
        }

        [UnityTest]
        public IEnumerator TheActionsSaveAndLoadTheSlot()
        {
            var player = quick.Player;
            yield return Press(false);
            Assert.AreEqual(PlannerQuickSaveResult.NothingToLoad, quick.Last, "Nothing saved yet");
            player.position = new Vector3(3f, 0f, 1f);
            yield return Press(true);
            Assert.AreEqual(PlannerQuickSaveResult.Saved, quick.Last);
            Assert.IsTrue(stub.Slots.ContainsKey("manual-1"), "The first manual slot");
            player.position = Vector3.zero;
            yield return Press(false);
            Assert.AreEqual(PlannerQuickSaveResult.Loaded, quick.Last);
            Assert.AreEqual(new Vector3(3f, 0f, 1f), player.position);
        }

        [Test]
        public void ASaveThatCannotBeLoadedIsReportedAndChangesNothing()
        {
            quick.Player.position = new Vector3(1f, 0f, 1f);
            quick.Save();
            stub.Broken = true;
            quick.Player.position = Vector3.zero;
            LogAssert.Expect(LogType.Error, new System.Text.RegularExpressions.Regex("Quick load failed: damaged"));
            Assert.AreEqual(PlannerQuickSaveResult.Failed, quick.Load());
            StringAssert.Contains("damaged", quick.Message);
            Assert.AreEqual(Vector3.zero, quick.Player.position);
        }

        [Test]
        public void WithoutASaveSystemItSaysSo()
        {
            quick.SaveSystem = null;
            LogAssert.Expect(LogType.Error, new System.Text.RegularExpressions.Regex("no save system"));
            Assert.AreEqual(PlannerQuickSaveResult.Failed, quick.Save());
        }
    }
}
