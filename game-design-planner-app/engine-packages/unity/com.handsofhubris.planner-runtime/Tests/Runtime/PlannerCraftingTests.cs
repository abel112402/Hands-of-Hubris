using System.Collections.Generic;
using System.Linq;
using NUnit.Framework;
using UnityEngine;

namespace HoHPlanner.Runtime.Tests
{
    /// <summary>The crafting module: exact results, nothing consumed in part, unlocking quests, the panel, and a save.</summary>
    public class PlannerCraftingTests
    {
        readonly List<GameObject> made = new List<GameObject>();
        readonly List<PlannerItemCrafted> crafted = new List<PlannerItemCrafted>();
        PlannerRuntime runtime;
        PlannerInventory inventory;
        PlannerQuests quests;
        PlannerQuestsTests.GraphStub graph;
        PlannerCrafting crafting;

        static PlannerItemAmount A(string item, int count) => new PlannerItemAmount(item, count);

        void Make(int slots, bool locked = false)
        {
            var go = new GameObject("Crafting");
            made.Add(go);
            inventory = go.AddComponent<PlannerInventory>();
            inventory.Slots = slots;
            inventory.Items = new List<PlannerItemDef>
            {
                new PlannerItemDef { ItemId = "key", Name = "Brass Key", Stack = 1 },
                new PlannerItemDef { ItemId = "coin", Name = "Coin", Stack = 99 },
                new PlannerItemDef { ItemId = "polished", Name = "Polished Key", Stack = 1 },
            };
            graph = go.AddComponent<PlannerQuestsTests.GraphStub>();
            quests = go.AddComponent<PlannerQuests>();
            quests.Graph = graph;
            quests.Inventory = inventory;
            crafting = go.AddComponent<PlannerCrafting>();
            crafting.Inventory = inventory;
            crafting.Quests = quests;
            crafting.Recipes = new List<PlannerRecipe>
            {
                new PlannerRecipe { RecipeId = "r1", Name = "Polished Key", Inputs = { A("key", 1), A("coin", 2) }, Output = A("polished", 1), UnlockQuests = locked ? new List<string> { "first" } : new List<string>() },
                new PlannerRecipe { RecipeId = "r2", Name = "Coin polish", Inputs = { A("coin", 1) }, Output = A("polished", 1) },
            };
            runtime = new PlannerRuntime().Register(inventory).Register(quests).Register(crafting);
            runtime.Start(new[] { "crafting" });
            runtime.Events.Subscribe<PlannerItemCrafted>(crafted.Add);
        }

        [TearDown]
        public void TearDown()
        {
            runtime?.Stop();
            foreach (var go in made) Object.Destroy(go);
            made.Clear();
            crafted.Clear();
        }

        [Test]
        public void GivesExactlyTheOutputForExactlyTheInputs()
        {
            Make(4);
            inventory.TryAdd("key", 1);
            inventory.TryAdd("coin", 5);
            Assert.IsTrue(crafting.CanCraft("r1", out var reason), reason);
            Assert.IsTrue(crafting.TryCraft("r1"));
            Assert.AreEqual((0, 3, 1), (inventory.CountOf("key"), inventory.CountOf("coin"), inventory.CountOf("polished")));
            Assert.AreEqual(1, crafted.Count);
        }

        [Test]
        public void ConsumesNothingWhenAnInputIsMissing()
        {
            Make(4);
            inventory.TryAdd("key", 1);
            inventory.TryAdd("coin", 1);
            Assert.IsFalse(crafting.CanCraft("r1", out var reason));
            StringAssert.Contains("needs 2 × Coin (have 1)", reason);
            Assert.IsFalse(crafting.TryCraft("r1"));
            Assert.AreEqual((1, 1, 0), (inventory.CountOf("key"), inventory.CountOf("coin"), inventory.CountOf("polished")), "Not consumed in part");
            Assert.AreEqual(0, crafted.Count);
        }

        [Test]
        public void ConsumesNothingWhenTheOutputDoesNotFit()
        {
            Make(2);
            inventory.TryAdd("key", 1);
            inventory.TryAdd("coin", 5);
            // 1 coin of 5 frees no slot, and both slots are taken: no room for the output.
            Assert.IsFalse(crafting.CanCraft("r2", out var reason));
            StringAssert.Contains("no room for Polished Key", reason);
            Assert.IsFalse(crafting.TryCraft("r2"));
            Assert.AreEqual((1, 5, 0), (inventory.CountOf("key"), inventory.CountOf("coin"), inventory.CountOf("polished")));
            // The key recipe frees the key's slot, so its output fits.
            Assert.IsTrue(crafting.TryCraft("r1"));
            Assert.AreEqual((0, 3, 1), (inventory.CountOf("key"), inventory.CountOf("coin"), inventory.CountOf("polished")));
        }

        [Test]
        public void WaitsForItsUnlockingQuest()
        {
            Make(4, locked: true);
            inventory.TryAdd("key", 1);
            inventory.TryAdd("coin", 5);
            Assert.IsFalse(crafting.CanCraft("r1", out var reason));
            StringAssert.StartsWith("locked: finish", reason);
            Assert.IsFalse(crafting.TryCraft("r1"));
            Assert.AreEqual(5, inventory.CountOf("coin"));
            graph.Done.Add("first");
            Assert.IsTrue(crafting.TryCraft("r1"));
        }

        [Test]
        public void RefusesToStartWithUnknownItemsOrQuests()
        {
            var go = new GameObject("Bad");
            made.Add(go);
            var inv = go.AddComponent<PlannerInventory>();
            inv.Slots = 1;
            var c = go.AddComponent<PlannerCrafting>();
            c.Inventory = inv;
            c.Recipes = new List<PlannerRecipe> { new PlannerRecipe { RecipeId = "r", Name = "Sword", Inputs = { A("iron", 1) }, Output = A("sword", 1), UnlockQuests = { "q" } } };
            var rt = new PlannerRuntime().Register(inv).Register(c);
            Assert.Throws<PlannerRuntimeException>(() => rt.Start(new[] { "crafting" }));
            var all = string.Join(" ", rt.Errors);
            StringAssert.Contains("“iron”", all);
            StringAssert.Contains("no quest module", all);
        }

        [Test]
        public void ThePanelSaysWhatEachRecipeNeeds()
        {
            Make(4, locked: true);
            var panel = made[0].AddComponent<PlannerCraftingPanel>();
            panel.Crafting = crafting;
            inventory.TryAdd("coin", 1);
            Assert.AreEqual("Polished Key: Polished Key ← Brass Key 0/1, Coin 1/2 — locked: finish first", panel.Lines[0]);
            Assert.AreEqual("Coin polish: Polished Key ← Coin 1/1", panel.Lines[1]);
            Assert.IsFalse(panel.IsOpen);
            panel.Toggle();
            Assert.IsTrue(panel.IsOpen);
        }

        [Test]
        public void ACraftedStateSavesAndLoadsAsItWas()
        {
            Make(4);
            inventory.TryAdd("key", 1);
            inventory.TryAdd("coin", 5);
            crafting.TryCraft("r1");
            var state = made[0].AddComponent<PlannerGameState>();
            state.Inventory = inventory;
            var json = state.Capture(PlannerStateKind.Inventory);
            inventory.Restore(new PlannerInventory.Slot[0]);
            state.Restore(PlannerStateKind.Inventory, json);
            Assert.AreEqual((0, 3, 1), (inventory.CountOf("key"), inventory.CountOf("coin"), inventory.CountOf("polished")));
            Assert.IsFalse(crafting.TryCraft("r1"), "The inputs are gone after loading too");
        }
    }
}
