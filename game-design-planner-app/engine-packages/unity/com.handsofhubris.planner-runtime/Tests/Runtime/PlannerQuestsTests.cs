using System.Collections.Generic;
using System.Linq;
using NUnit.Framework;
using UnityEngine;

namespace HoHPlanner.Runtime.Tests
{
    /// <summary>The quest module with a stand-in quest graph: goals from real inventory changes, rewards once, all or nothing.</summary>
    public class PlannerQuestsTests
    {
        /// <summary>A stand-in for the generated PlannerQuestGraph: “second” requires “first”.</summary>
        public class GraphStub : MonoBehaviour, IPlannerQuestGraph
        {
            public readonly HashSet<string> Done = new HashSet<string>();
            public bool Knows(string id) => id == "first" || id == "second" || id == "talk";
            public bool CanStart(string id) => Knows(id) && !Done.Contains(id) && (id != "second" || Done.Contains("first"));
            public bool IsDone(string id) => Done.Contains(id);
            public bool Complete(string id) => CanStart(id) && Done.Add(id);
            public readonly HashSet<string> Chosen = new HashSet<string>();
            // Two choices of one decision (“offer”): help and refuse.
            public bool KnowsChoice(string id) => id == "help" || id == "refuse";
            public bool HasChosen(string id) => Chosen.Contains(id);
            public bool IsDecided(string id) => KnowsChoice(id) && Chosen.Count > 0;
            public bool CanChoose(string id) => KnowsChoice(id) && !IsDecided(id);
            public bool Choose(string id) => CanChoose(id) && Chosen.Add(id);
            public string SaveState() => "done:" + string.Join(",", Done.OrderBy(x => x)) + "|" + string.Join(",", Chosen.OrderBy(x => x));
            public void LoadState(string json)
            {
                if (json == null || !json.StartsWith("done:")) throw new System.ArgumentException("not a graph log");
                var parts = json.Substring(5).Split('|');
                Done.Clear();
                Chosen.Clear();
                foreach (var id in parts[0].Split(new[] { ',' }, System.StringSplitOptions.RemoveEmptyEntries)) Done.Add(id);
                if (parts.Length > 1) foreach (var id in parts[1].Split(new[] { ',' }, System.StringSplitOptions.RemoveEmptyEntries)) Chosen.Add(id);
            }
        }

        readonly List<GameObject> made = new List<GameObject>();
        readonly List<PlannerQuestCompleted> completed = new List<PlannerQuestCompleted>();
        readonly List<PlannerQuestRewardWaiting> waiting = new List<PlannerQuestRewardWaiting>();
        PlannerRuntime runtime;
        PlannerInventory inventory;
        PlannerQuests quests;
        GraphStub graph;

        static PlannerItemAmount A(string item, int count) => new PlannerItemAmount(item, count);

        void Make(int slots, params PlannerQuestRule[] rules)
        {
            var go = new GameObject("Quests");
            made.Add(go);
            inventory = go.AddComponent<PlannerInventory>();
            inventory.Slots = slots;
            inventory.Items = new List<PlannerItemDef>
            {
                new PlannerItemDef { ItemId = "key", Name = "Brass Key", Stack = 1 },
                new PlannerItemDef { ItemId = "coin", Name = "Coin", Stack = 99 },
                new PlannerItemDef { ItemId = "gem", Name = "Gem", Stack = 1 },
            };
            graph = go.AddComponent<GraphStub>();
            quests = go.AddComponent<PlannerQuests>();
            quests.Graph = graph;
            quests.Inventory = inventory;
            quests.Rules = rules.ToList();
            runtime = new PlannerRuntime().Register(inventory).Register(quests);
        }

        void Start()
        {
            runtime.Events.Subscribe<PlannerQuestCompleted>(completed.Add);
            runtime.Events.Subscribe<PlannerQuestRewardWaiting>(waiting.Add);
            runtime.Start(new[] { "quests" });
            Assert.AreEqual(PlannerRuntimeState.Running, runtime.State, string.Join(" ", runtime.Errors));
        }

        static PlannerQuestRule Rule(string id, PlannerItemAmount[] goal, params PlannerItemAmount[] reward) =>
            new PlannerQuestRule { QuestId = id, Name = id, Goal = goal.ToList(), Reward = reward.ToList(), Money = 3, Xp = 7 };

        [TearDown]
        public void TearDown()
        {
            runtime?.Stop();
            foreach (var go in made) Object.Destroy(go);
            made.Clear();
            completed.Clear();
            waiting.Clear();
        }

        [Test]
        public void TheGoalIsReachedOnlyByTheInventoryAndRewardsOnce()
        {
            Make(4, Rule("first", new[] { A("key", 1) }, A("coin", 5)));
            Start();
            Assert.IsTrue(quests.IsActive("first"));
            quests.Refresh();
            Assert.IsFalse(quests.IsDone("first"), "Nothing happened in the game yet");

            inventory.TryAdd("key", 1);
            Assert.IsTrue(quests.IsDone("first"));
            Assert.AreEqual(1, completed.Count);
            Assert.AreEqual((3, 7), (completed[0].Money, completed[0].Xp));
            Assert.AreEqual(5, inventory.CountOf("coin"));
            Assert.AreEqual(1, inventory.CountOf("key"), "Holding items does not take them");

            inventory.TryRemove("key", 1);
            inventory.TryAdd("key", 1);
            quests.Refresh();
            Assert.AreEqual(1, completed.Count, "Exactly once");
            Assert.AreEqual(5, inventory.CountOf("coin"));
        }

        [Test]
        public void FollowsThePlannedGraph()
        {
            Make(4, Rule("first", new[] { A("key", 1) }), Rule("second", new[] { A("coin", 10) }, A("gem", 1)));
            Start();
            Assert.IsFalse(quests.IsActive("second"), "The plan says it needs the first quest");
            inventory.TryAdd("coin", 10);
            Assert.IsFalse(quests.IsDone("second"), "Holding its goal does not finish a quest that has not started");
            inventory.TryAdd("key", 1);
            Assert.IsTrue(quests.IsDone("first"));
            Assert.IsTrue(quests.IsDone("second"), "It starts after the first, and the coins it needs are already held");
            CollectionAssert.AreEqual(new[] { "first", "second" }, completed.Select(c => c.QuestId).ToArray());
            Assert.AreEqual(1, inventory.CountOf("gem"));
        }

        [Test]
        public void AFullInventoryDelaysTheRewardWholeAndGivesItOnce()
        {
            // 3 slots: gem and key leave one, the reward needs two.
            Make(3, Rule("first", new[] { A("key", 1) }, A("coin", 5), A("gem", 1)));
            Start();
            inventory.TryAdd("gem", 1);
            inventory.TryAdd("key", 1);
            Assert.IsTrue(quests.IsDone("first"));
            Assert.IsTrue(quests.IsWaitingForRoom("first"));
            Assert.AreEqual(1, waiting.Count);
            Assert.AreEqual(0, completed.Count);
            Assert.AreEqual(0, inventory.CountOf("coin"), "No part of the reward");

            inventory.TryRemove("gem", 1);
            Assert.AreEqual(1, completed.Count, "Given when there is room");
            Assert.AreEqual(5, inventory.CountOf("coin"));
            Assert.AreEqual(1, inventory.CountOf("gem"));
            Assert.IsFalse(quests.IsWaitingForRoom("first"));
            inventory.TryRemove("coin", 5);
            Assert.AreEqual(1, completed.Count);
        }

        [Test]
        public void DoesNotRewardAQuestDoneBeforeItSawIt()
        {
            Make(4, Rule("first", new[] { A("key", 1) }, A("coin", 5)));
            graph.Done.Add("first");
            Start();
            inventory.TryAdd("key", 1);
            Assert.AreEqual(0, completed.Count);
            Assert.AreEqual(0, inventory.CountOf("coin"));
        }

        [Test]
        public void RefusesToStartWithReferencesThePlanDoesNotHave()
        {
            Make(4, Rule("nope", new[] { A("key", 1) }), Rule("first", new[] { A("sword", 1) }, A("coin", 0)));
            Assert.Throws<PlannerRuntimeException>(() => runtime.Start(new[] { "quests" }));
            Assert.AreEqual(PlannerRuntimeState.Failed, runtime.State);
            var all = string.Join(" ", runtime.Errors);
            StringAssert.Contains("(nope) is not in the plan's quest graph", all);
            StringAssert.Contains("“sword”", all);
            StringAssert.Contains("below 1", all);
        }

        [Test]
        public void RefusesToStartWithoutTheGraph()
        {
            Make(4, Rule("first", new[] { A("key", 1) }));
            quests.Graph = null;
            Assert.Throws<PlannerRuntimeException>(() => runtime.Start(new[] { "quests" }));
            Assert.AreEqual(PlannerRuntimeState.Failed, runtime.State);
            StringAssert.Contains("no quest graph", string.Join(" ", runtime.Errors));
        }
    }
}
