using System.Collections;
using System.Collections.Generic;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.TestTools;

namespace HoHPlanner.Runtime.Tests
{
    /// <summary>Player progression, trading and the day-and-night clock (phase 20), each on its own, and their saves.</summary>
    public class PlannerEconomyTests
    {
        readonly List<GameObject> made = new List<GameObject>();
        PlannerRuntime runtime;

        T Make<T>(string name) where T : Component
        {
            var go = new GameObject(name);
            made.Add(go);
            return go.AddComponent<T>();
        }

        [TearDown]
        public void TearDown()
        {
            runtime?.Stop();
            runtime = null;
            foreach (var go in made) if (go != null) Object.DestroyImmediate(go);
            made.Clear();
        }

        // ---- progression ----

        PlannerProgression Progression()
        {
            var p = Make<PlannerProgression>("Progression");
            p.LevelCap = 4;
            p.XpToNext = new List<int> { 10, 20, 30 };
            p.SkillPointsPerLevel = 1;
            p.StatPointsPerLevel = 2;
            p.StartSkillPoints = 1;
            runtime = new PlannerRuntime().Register(p);
            runtime.Start(new[] { "progression" });
            return p;
        }

        [Test]
        public void XpFromQuestsAndEnemiesRaisesTheLevelByThePlannedTable()
        {
            var p = Progression();
            var ups = new List<PlannerLevelUp>();
            runtime.Events.Subscribe<PlannerLevelUp>(ups.Add);
            runtime.Events.Publish(new PlannerQuestCompleted("q", new PlannerItemAmount[0], 0, 8));
            Assert.AreEqual((1, 8), (p.Level, p.Xp));
            runtime.Events.Publish(new PlannerEnemyDefeated("rat", "rat-1", 5));
            Assert.AreEqual((2, 3, 13), (p.Level, p.Xp, p.TotalXp), "10 XP to level 2, 3 into it");
            Assert.AreEqual((2f, 2f), (p.SkillPoints, p.StatPoints));
            p.Add(100);
            Assert.AreEqual((4, 0), (p.Level, p.Xp), "Stops at the cap");
            Assert.AreEqual(new[] { 2, 3, 4 }, ups.ConvertAll(u => u.Level).ToArray());
        }

        [Test]
        public void TheSavedProgressionComesBackAndADamagedOneIsRefused()
        {
            var p = Progression();
            p.Add(15);
            var state = new GameObject("State").AddComponent<PlannerGameState>();
            made.Add(state.gameObject);
            state.Progression = p;
            var json = state.Capture(PlannerStateKind.Progression);
            p.Add(40);
            state.Restore(PlannerStateKind.Progression, json);
            Assert.AreEqual((2, 5, 15), (p.Level, p.Xp, p.TotalXp));
            Assert.Throws<PlannerStateException>(() => state.Check(PlannerStateKind.Progression, "{\"level\":9}"));
        }

        // ---- trade ----

        PlannerTrade trade;
        PlannerInventory inventory;
        PlannerMerchant merchant;

        void Trade(int startMoney = 10, int cap = 0, int gold = 5)
        {
            var go = new GameObject("Trade");
            made.Add(go);
            inventory = go.AddComponent<PlannerInventory>();
            inventory.Slots = 1;
            inventory.Items = new List<PlannerItemDef> { new PlannerItemDef { ItemId = "stick", Name = "Stick", Stack = 2 }, new PlannerItemDef { ItemId = "key", Name = "Key", Stack = 1 } };
            trade = go.AddComponent<PlannerTrade>();
            trade.Inventory = inventory;
            trade.StartMoney = startMoney;
            trade.WalletCap = cap;
            merchant = Make<PlannerMerchant>("Peddler");
            merchant.Trade = trade;
            merchant.MerchantId = "ped";
            merchant.Name = "Peddler";
            merchant.Sells = new List<PlannerPrice> { new PlannerPrice("stick", 6) };
            merchant.Buys = new List<PlannerPrice> { new PlannerPrice("stick", 2), new PlannerPrice("key", 4) };
            merchant.StartGold = gold;
            var player = PlannerPlayer.Create(Vector3.zero, new PlannerPlayerSettings(4f, 4f, 2f));
            made.Add(player.gameObject);
            var interactor = go.AddComponent<PlannerInteractor>();
            interactor.Player = player.transform;
            runtime = new PlannerRuntime().Register(player.Movement).Register(interactor).Register(inventory).Register(trade);
            runtime.Start(new[] { "trade" });
            Assert.AreEqual(PlannerRuntimeState.Running, runtime.State, string.Join(" ", runtime.Errors));
        }

        [Test]
        public void BuysAndSellsAtThePlannedPrices()
        {
            Trade();
            Assert.IsTrue(trade.Buy(merchant, "stick"));
            Assert.AreEqual((4, 1, 11), (trade.Money, inventory.CountOf("stick"), merchant.Gold));
            Assert.IsFalse(trade.CanBuy(merchant, "stick", out var why), "4 money left");
            StringAssert.Contains("needs 6 (have 4)", why);
            Assert.IsTrue(trade.Sell(merchant, "stick"));
            Assert.AreEqual((6, 0, 9), (trade.Money, inventory.CountOf("stick"), merchant.Gold));
            Assert.IsFalse(trade.CanSell(merchant, "key", out why));
            StringAssert.Contains("you have none", why);
            Assert.IsFalse(trade.Buy(merchant, "key"), "It does not sell keys");
        }

        [Test]
        public void TheMerchantsPurseAndTheWalletLimitHold()
        {
            Trade(startMoney: 0, cap: 5, gold: 3);
            inventory.TryAdd("key", 1);
            Assert.IsFalse(trade.CanSell(merchant, "key", out var why));
            StringAssert.Contains("has only 3", why);
            runtime.Events.Publish(new PlannerQuestCompleted("q", new PlannerItemAmount[0], 9, 0));
            Assert.AreEqual(5, trade.Money, "Quest money up to the wallet limit");
        }

        [Test]
        public void InteractingOpensThePanelAndTheTradeIsSaved()
        {
            Trade();
            Assert.AreEqual("Trade with Peddler", merchant.Prompt);
            merchant.Interact(null);
            Assert.AreSame(merchant, trade.Open);
            trade.Buy(merchant, "stick");
            var state = new GameObject("State").AddComponent<PlannerGameState>();
            made.Add(state.gameObject);
            state.Trade = trade;
            var json = state.Capture(PlannerStateKind.Trade);
            trade.Sell(merchant, "stick");
            state.Restore(PlannerStateKind.Trade, json);
            Assert.AreEqual((4, 11), (trade.Money, merchant.Gold));
            Assert.IsNull(trade.Open);
            Assert.Throws<PlannerStateException>(() => state.Check(PlannerStateKind.Trade, "{\"money\":3,\"merchants\":[{\"merchant\":\"ghost\",\"gold\":1}]}"));
        }

        // ---- time ----

        PlannerClock Clock(Light sun = null)
        {
            var c = Make<PlannerClock>("Clock");
            c.DayMinutes = 0.1f; // one in-game day in 6 real seconds
            c.StartHour = 8f;
            c.Sun = sun;
            c.Phases = new List<PlannerDayPhase>
            {
                new PlannerDayPhase { PhaseId = "day", Name = "Day", Start = 6f, Duration = 12f, Visibility = 100f, MonsterStrength = 1f },
                new PlannerDayPhase { PhaseId = "night", Name = "Night", Start = 18f, Duration = 12f, Visibility = 40f, MonsterStrength = 1.5f },
            };
            return c;
        }

        [UnityTest]
        public IEnumerator TheClockRunsAtThePlannedRateAndThePhasesSetTheLight()
        {
            var sun = Make<Light>("Sun");
            sun.intensity = 2f;
            var c = Clock(sun);
            runtime = new PlannerRuntime().Register(c);
            runtime.Start(new[] { "time" });
            var changes = new List<PlannerDayPhaseChanged>();
            runtime.Events.Subscribe<PlannerDayPhaseChanged>(changes.Add);
            Assert.AreEqual(("Day", 2f), (c.Phase.Name, sun.intensity));
            var t = Time.time;
            yield return new WaitForSeconds(1f);
            Assert.AreEqual(4f * (Time.time - t), c.Hour - 8f, 0.3f, "4 in-game hours per real second");
            c.Set(19f, 1);
            Assert.AreEqual(("Night", 0.8f, 1.5f), (c.Phase.Name, sun.intensity, c.MonsterStrength));
            Assert.AreEqual("night", changes[changes.Count - 1].PhaseId);
            c.Set(23.9f, 1);
            yield return new WaitForSeconds(0.2f);
            Assert.AreEqual(2, c.Day, "Past midnight: the next day");
        }

        [Test]
        public void TheNightMakesEnemiesHitHarderAndTheTimeIsSaved()
        {
            var c = Clock();
            var player = PlannerPlayer.Create(Vector3.zero, new PlannerPlayerSettings(4f, 4f, 2f));
            made.Add(player.gameObject);
            var combat = Make<PlannerCombat>("Combat");
            var health = combat.gameObject.AddComponent<PlannerHealth>();
            health.Max = 100f;
            combat.Player = player;
            combat.PlayerHealth = health;
            combat.Formula = combat.gameObject.AddComponent<PlannerCombatTests.DefaultFormula>();
            combat.Clock = c;
            combat.WeaponDamage = 1f;
            var enemy = Make<PlannerEnemy>("Rat");
            enemy.Damage = 4f;
            enemy.Passive = true;
            runtime = new PlannerRuntime().Register(player.Movement).Register(c).Register(combat);
            runtime.Start(new[] { "combat", "time" });
            combat.HitPlayer(enemy);
            Assert.AreEqual(96f, health.Current, 0.001f, "By day: the planned damage");
            c.Set(20f, 1);
            combat.HitPlayer(enemy);
            Assert.AreEqual(90f, health.Current, 0.001f, "By night: × 1.5");
            var state = new GameObject("State").AddComponent<PlannerGameState>();
            made.Add(state.gameObject);
            state.Clock = c;
            var json = state.Capture(PlannerStateKind.Time);
            c.Set(3f, 4);
            state.Restore(PlannerStateKind.Time, json);
            Assert.AreEqual((20f, 1), (c.Hour, c.Day));
            Assert.Throws<PlannerStateException>(() => state.Check(PlannerStateKind.Time, "{\"hour\":30,\"day\":1}"));
        }
    }
}
