using System.Collections.Generic;
using System.Linq;
using NUnit.Framework;
using UnityEngine;

namespace HoHPlanner.Runtime.Tests
{
    /// <summary>Saving and restoring the prototype's state: player, inventory with the pickups taken, quests.</summary>
    public class PlannerGameStateTests
    {
        readonly List<GameObject> made = new List<GameObject>();
        readonly List<PlannerQuestCompleted> completed = new List<PlannerQuestCompleted>();
        PlannerRuntime runtime;
        PlannerGameState state;
        PlannerPlayer player;
        PlannerInventory inventory;
        PlannerQuests quests;
        PlannerQuestsTests.GraphStub graph;
        PlannerPickup keyPickup;

        [SetUp]
        public void SetUp()
        {
            player = PlannerPlayer.Create(new Vector3(1f, 0f, 2f), new PlannerPlayerSettings(4f, 4f, 2f));
            made.Add(player.gameObject);
            var go = new GameObject("State");
            made.Add(go);
            inventory = go.AddComponent<PlannerInventory>();
            inventory.Slots = 3;
            inventory.Items = new List<PlannerItemDef>
            {
                new PlannerItemDef { ItemId = "key", Name = "Brass Key", Stack = 1 },
                new PlannerItemDef { ItemId = "coin", Name = "Coin", Stack = 99 },
            };
            graph = go.AddComponent<PlannerQuestsTests.GraphStub>();
            quests = go.AddComponent<PlannerQuests>();
            quests.Graph = graph;
            quests.Inventory = inventory;
            quests.Rules = new List<PlannerQuestRule>
            {
                new PlannerQuestRule { QuestId = "first", Name = "first", Goal = { new PlannerItemAmount("key", 1) }, Reward = { new PlannerItemAmount("coin", 5) } },
            };
            var pickupGo = new GameObject("Key pickup");
            made.Add(pickupGo);
            var placement = pickupGo.AddComponent<PlannerPlacement>();
            placement.Role = PlannerPlacement.ItemRole;
            placement.ItemId = "key";
            placement.ObjectId = "obj-key";
            keyPickup = pickupGo.AddComponent<PlannerPickup>();
            state = go.AddComponent<PlannerGameState>();
            state.Player = player;
            state.Inventory = inventory;
            state.Quests = quests;
            runtime = new PlannerRuntime().Register(inventory).Register(quests);
            runtime.Start(new[] { "quests" });
            runtime.Events.Subscribe<PlannerQuestCompleted>(completed.Add);
        }

        [TearDown]
        public void TearDown()
        {
            runtime.Stop();
            foreach (var go in made) Object.Destroy(go);
            made.Clear();
            completed.Clear();
        }

        /// <summary>Plays the slice: the key is picked up (pickup taken, item added), the quest completes, the player walks.</summary>
        void Play()
        {
            Assert.IsTrue(inventory.TryAdd("key", 1));
            keyPickup.SetTaken(true);
            player.Teleport(new Vector3(5f, 0f, -3f), 90f);
            Assert.AreEqual(1, completed.Count);
        }

        Dictionary<PlannerStateKind, string> Capture() =>
            new[] { PlannerStateKind.PlayerPosition, PlannerStateKind.Inventory, PlannerStateKind.Quests }.ToDictionary(k => k, state.Capture);

        void Load(Dictionary<PlannerStateKind, string> save)
        {
            state.BeginRestore();
            try
            {
                foreach (var part in save) state.Check(part.Key, part.Value);
                foreach (var part in save) state.Restore(part.Key, part.Value);
            }
            finally
            {
                state.EndRestore();
            }
        }

        [Test]
        public void AFreshGameLoadsWhereThePlayerLeftItWithoutASecondReward()
        {
            Play();
            var save = Capture();

            // A fresh game: nothing picked up, the quest not done, the player at the start.
            inventory.Restore(new PlannerInventory.Slot[0]);
            keyPickup.SetTaken(false);
            graph.Done.Clear();
            quests.RestoreState(new PlannerQuests.State { Graph = graph.SaveState() });
            player.Teleport(new Vector3(1f, 0f, 2f), 0f);
            completed.Clear();

            Load(save);
            Assert.AreEqual(new Vector3(5f, 0f, -3f), player.transform.position);
            Assert.AreEqual(90f, player.transform.eulerAngles.y, 0.01f);
            Assert.AreEqual(1, inventory.CountOf("key"));
            Assert.AreEqual(5, inventory.CountOf("coin"));
            Assert.IsTrue(keyPickup.Taken);
            Assert.IsFalse(keyPickup.gameObject.activeSelf, "A taken pickup does not come back");
            Assert.IsTrue(quests.IsDone("first"));
            Assert.IsTrue(quests.IsRewarded("first"));
            Assert.AreEqual(0, completed.Count, "Loading gives no reward");
            Assert.AreEqual(5, inventory.CountOf("coin"));
        }

        [Test]
        public void ADamagedPartIsRefusedBeforeAnythingChanges()
        {
            Play();
            var save = Capture();
            save[PlannerStateKind.Quests] = "{ not json";
            inventory.TryRemove("coin", 5);
            player.Teleport(Vector3.zero, 0f);
            var e = Assert.Throws<PlannerStateException>(() => Load(save));
            StringAssert.Contains("Quests is damaged", e.Message);
            Assert.AreEqual(Vector3.zero, player.transform.position, "The player part, checked first, was not applied either");
            Assert.AreEqual(0, inventory.CountOf("coin"));
        }

        [Test]
        public void RefusesAnInventoryThePlanDoesNotAllow()
        {
            Assert.Throws<PlannerStateException>(() => inventory.Check(new[] { new PlannerInventory.Slot { ItemId = "sword", Count = 1 } }));
            Assert.Throws<PlannerStateException>(() => inventory.Check(new[] { new PlannerInventory.Slot { ItemId = "key", Count = 2 } }), "Over the stack");
            var tooMany = Enumerable.Range(0, 4).Select(_ => new PlannerInventory.Slot { ItemId = "coin", Count = 1 }).ToArray();
            var e = Assert.Throws<PlannerStateException>(() => inventory.Check(tooMany));
            StringAssert.Contains("the plan has 3 slots", e.Message);
            Assert.DoesNotThrow(() => inventory.Check(new[] { new PlannerInventory.Slot { ItemId = "coin", Count = 3 }, default, default, default }), "Empty slots past the end are fine");
        }

        [Test]
        public void RefusesPickupsThatAreNotOnTheMap()
        {
            var e = Assert.Throws<PlannerStateException>(() => state.Check(PlannerStateKind.Inventory, "{\"slots\":[],\"taken\":[\"obj-gone\"]}"));
            StringAssert.Contains("obj-gone", e.Message);
        }

        [Test]
        public void RefusesAPositionThatIsNotOne()
        {
            Assert.Throws<PlannerStateException>(() => state.Check(PlannerStateKind.PlayerPosition, "x"));
            Assert.Throws<PlannerStateException>(() => state.Check(PlannerStateKind.PlayerPosition, ""));
        }
    }
}
