using System.Collections;
using System.Collections.Generic;
using System.Linq;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.TestTools;
using UnityEngine.UIElements;

namespace HoHPlanner.Runtime.Tests
{
    /// <summary>The inventory module, pickups into it, and the HUD binding.</summary>
    public class PlannerInventoryTests
    {
        readonly List<Object> made = new List<Object>();

        T Make<T>(string name) where T : Component
        {
            var go = new GameObject(name);
            made.Add(go);
            return go.AddComponent<T>();
        }

        PlannerInventory Inventory(int slots)
        {
            var inv = Make<PlannerInventory>("Inventory");
            inv.Slots = slots;
            inv.Items = new List<PlannerItemDef>
            {
                new PlannerItemDef { ItemId = "key", Key = "item.key", Name = "Brass Key", Stack = 1 },
                new PlannerItemDef { ItemId = "coin", Key = "item.coin", Name = "Coin", Stack = 10 },
            };
            return inv;
        }

        [TearDown]
        public void TearDown()
        {
            foreach (var o in made) Object.Destroy(o);
            made.Clear();
        }

        [Test]
        public void StacksUpToThePlannedSizeThenUsesNewSlots()
        {
            var inv = Inventory(3);
            Assert.IsTrue(inv.TryAdd("coin", 4));
            Assert.IsTrue(inv.TryAdd("coin", 8));
            Assert.AreEqual(12, inv.CountOf("coin"));
            CollectionAssert.AreEqual(new[] { 10, 2, 0 }, inv.Contents.Select(s => s.Count).ToArray());
            Assert.IsTrue(inv.TryAdd("key", 1));
            Assert.AreEqual(0, inv.RoomFor("key"), "One key per slot and no slot left");
        }

        [Test]
        public void AFullInventoryAddsNothingAtAll()
        {
            var inv = Inventory(2);
            var changes = 0;
            inv.Changed += () => changes++;
            Assert.IsTrue(inv.TryAdd("coin", 15));
            Assert.AreEqual(1, changes);
            Assert.IsFalse(inv.TryAdd("coin", 6), "Only 5 more fit");
            Assert.AreEqual(15, inv.CountOf("coin"), "Nothing of the 6 was added");
            Assert.AreEqual(1, changes);
            Assert.IsTrue(inv.TryAdd("coin", 5));
            Assert.IsFalse(inv.CanAdd("key", 1));
        }

        [Test]
        public void RefusesUnknownItemsAndBadCounts()
        {
            var inv = Inventory(4);
            LogAssert.Expect(LogType.Warning, new System.Text.RegularExpressions.Regex("does not know the item “sword”"));
            Assert.IsFalse(inv.TryAdd("sword", 1));
            Assert.IsFalse(inv.TryAdd("coin", 0));
            Assert.IsFalse(inv.TryAdd("coin", -3));
            Assert.IsTrue(inv.Contents.All(s => s.Empty));
        }

        [Test]
        public void RemovesAllOrNothing()
        {
            var inv = Inventory(3);
            inv.TryAdd("coin", 12);
            Assert.IsFalse(inv.TryRemove("coin", 13));
            Assert.AreEqual(12, inv.CountOf("coin"));
            Assert.IsTrue(inv.TryRemove("coin", 3));
            Assert.AreEqual(9, inv.CountOf("coin"));
            Assert.IsTrue(inv.TryRemove("coin", 9));
            Assert.IsTrue(inv.Contents.All(s => s.Empty));
        }

        PlannerPickup Pickup(string item, int count)
        {
            var p = Make<PlannerPlacement>("Pickup " + item);
            p.Role = PlannerPlacement.ItemRole;
            p.ItemId = item;
            p.ItemKey = "item." + item;
            p.Count = count;
            var pickup = p.gameObject.AddComponent<PlannerPickup>();
            pickup.DisplayName = item;
            return pickup;
        }

        [UnityTest]
        public IEnumerator APickupGoesIntoTheInventoryOrStaysWhenItIsFull()
        {
            var inv = Inventory(1);
            var interactor = Make<PlannerInteractor>("Interaction");
            var movement = Make<PlannerInteractionTests.MovementStub>("Movement");
            var runtime = new PlannerRuntime().Register(movement).Register(interactor).Register(inv);
            runtime.Start();
            var got = new List<PlannerItemAcquired>();
            runtime.Events.Subscribe<PlannerItemAcquired>(got.Add);
            try
            {
                var key = Pickup("key", 1);
                yield return null;
                Assert.IsTrue(interactor.TryInteract());
                Assert.AreEqual(1, inv.CountOf("key"));
                Assert.AreEqual(1, got.Count);

                var coins = Pickup("coin", 3);
                yield return null;
                interactor.Refresh();
                Assert.AreSame(coins, interactor.Current, "Still a target, to say why it cannot be taken");
                Assert.AreEqual("Inventory full: coin ×3", coins.Prompt);
                interactor.TryInteract();
                Assert.IsFalse(coins.Taken, "The coins stay on the ground");
                Assert.IsTrue(coins.gameObject.activeSelf);
                Assert.AreEqual(0, inv.CountOf("coin"));
                Assert.AreEqual(1, got.Count, "No item event for what was not taken");
                Assert.IsFalse(key.gameObject.activeSelf);
            }
            finally
            {
                runtime.Stop();
            }
        }

        [UnityTest]
        public IEnumerator TheHudShowsTheInventoryAndUpdatesWithIt()
        {
            var inv = Inventory(4);
            var settings = ScriptableObject.CreateInstance<PanelSettings>();
            made.Add(settings);
            var doc = Make<UIDocument>("HUD");
            doc.panelSettings = settings;
            yield return null;
            var grid = new VisualElement { name = PlannerHudBinding.InventoryElement };
            var counter = new VisualElement { name = PlannerHudBinding.ItemPrefix + "coin" };
            var other = new VisualElement { name = "bind-quest" };
            doc.rootVisualElement.Add(grid);
            doc.rootVisualElement.Add(counter);
            doc.rootVisualElement.Add(other);
            var binding = doc.gameObject.AddComponent<PlannerHudBinding>();
            binding.Document = doc;
            binding.Inventory = inv;
            binding.enabled = false;
            binding.enabled = true;

            Assert.AreEqual(4, grid.Query<Label>(className: PlannerHudBinding.SlotClass).ToList().Count, "One cell per planned slot");
            Assert.AreEqual("Coin: 0", counter.Q<Label>().text);
            inv.TryAdd("coin", 12);
            inv.TryAdd("key", 1);
            var cells = grid.Query<Label>(className: PlannerHudBinding.SlotClass).ToList().Select(l => l.text).ToArray();
            CollectionAssert.AreEqual(new[] { "Coin ×10", "Coin ×2", "Brass Key", "" }, cells);
            Assert.AreEqual("Coin: 12", counter.Q<Label>().text);
            Assert.AreEqual(0, other.childCount, "Other bindings are left alone");
        }
    }
}
