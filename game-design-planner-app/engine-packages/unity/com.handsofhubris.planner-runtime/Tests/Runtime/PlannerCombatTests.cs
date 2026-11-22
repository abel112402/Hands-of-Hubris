using System.Collections;
using System.Collections.Generic;
using System.Linq;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.TestTools;

namespace HoHPlanner.Runtime.Tests
{
    /// <summary>The first combat model: melee hits by the formula, enemy chase and hits, death, respawn, loot, saving.</summary>
    public class PlannerCombatTests
    {
        /// <summary>The planner's default damage formula: attack * 100 / (100 + armor) * (1 - resist / 100) * crit.</summary>
        public class DefaultFormula : MonoBehaviour, IPlannerDamageFormula
        {
            public float Damage(float attack, float armor, float resist, float crit) => attack * 100f / (100f + armor) * (1f - resist / 100f) * crit;
        }

        readonly List<GameObject> made = new List<GameObject>();
        readonly List<PlannerEnemyDefeated> defeated = new List<PlannerEnemyDefeated>();
        readonly List<PlannerPlayerDefeated> playerDown = new List<PlannerPlayerDefeated>();
        PlannerRuntime runtime;
        PlannerPlayer player;
        PlannerCombat combat;
        PlannerInventory inventory;
        PlannerInteractor interactor;
        GameObject ground;
        Transform start;

        PlannerEnemy Enemy(Vector3 at, float hp = 20f, float damage = 3f, float rate = 1f, float armor = 10f, bool passive = true, float speed = 2f, string objectId = "rat-1")
        {
            var go = new GameObject("Enemy " + objectId);
            made.Add(go);
            go.transform.position = at;
            var placement = go.AddComponent<PlannerPlacement>();
            placement.Role = "enemy";
            placement.ObjectId = objectId;
            go.AddComponent<PlannerHealth>().Max = hp;
            var e = go.AddComponent<PlannerEnemy>();
            e.Combat = combat;
            e.EnemyId = "rat";
            e.Name = "Rat";
            e.Damage = damage;
            e.AttackRate = rate;
            e.Armor = armor;
            e.Passive = passive;
            e.Speed = speed;
            e.Xp = 5;
            var loot = go.AddComponent<PlannerLoot>();
            loot.Inventory = inventory;
            loot.Items = new List<PlannerItemAmount> { new PlannerItemAmount("coin", 1) };
            loot.enabled = false;
            return e;
        }

        [SetUp]
        public void SetUp()
        {
            ground = GameObject.CreatePrimitive(PrimitiveType.Plane);
            ground.transform.localScale = new Vector3(20f, 1f, 20f);
            made.Add(ground);
            player = PlannerPlayer.Create(new Vector3(0f, 0.1f, 0f), new PlannerPlayerSettings(4f, 4f, 2f));
            made.Add(player.gameObject);
            start = new GameObject("Start").transform;
            start.position = new Vector3(-5f, 0f, -5f);
            made.Add(start.gameObject);
            var go = new GameObject("Combat");
            made.Add(go);
            var formula = go.AddComponent<DefaultFormula>();
            var health = go.AddComponent<PlannerHealth>();
            health.Max = 30f;
            inventory = go.AddComponent<PlannerInventory>();
            inventory.Slots = 4;
            inventory.Items = new List<PlannerItemDef> { new PlannerItemDef { ItemId = "coin", Name = "Coin", Stack = 99 } };
            combat = go.AddComponent<PlannerCombat>();
            combat.Player = player;
            combat.PlayerHealth = health;
            combat.Formula = formula;
            combat.Respawn = start;
            combat.WeaponId = "stick";
            combat.WeaponDamage = 6f;
            combat.WeaponRate = 2f;
            combat.AttackRange = 1.5f;
            interactor = go.AddComponent<PlannerInteractor>();
            interactor.Player = player.transform;
            runtime = new PlannerRuntime().Register(player.Movement).Register(inventory).Register(combat).Register(interactor);
            runtime.Start(new[] { "combat", "interaction" });
            runtime.Events.Subscribe<PlannerEnemyDefeated>(defeated.Add);
            runtime.Events.Subscribe<PlannerPlayerDefeated>(playerDown.Add);
        }

        [TearDown]
        public void TearDown()
        {
            runtime.Stop();
            foreach (var go in made) if (go != null) Object.DestroyImmediate(go);
            made.Clear();
            defeated.Clear();
            playerDown.Clear();
        }

        [UnityTest]
        public IEnumerator EachHitIsThePlannedFormulaAtTheWeaponsRate()
        {
            var rat = Enemy(new Vector3(1f, 0f, 0f));
            var perHit = 6f * 100f / 110f;
            Assert.AreEqual(perHit, combat.PlayerHitOn(rat), 0.0001f);
            Assert.IsTrue(combat.TryAttack());
            Assert.AreEqual(20f - perHit, rat.Health.Current, 0.0001f);
            Assert.IsFalse(combat.TryAttack(), "Not before 1 / attacks per second");
            var hits = 1;
            while (!rat.Health.IsDead)
            {
                yield return null;
                if (combat.TryAttack()) hits++;
            }
            Assert.AreEqual(Mathf.CeilToInt(20f / perHit), hits);
            Assert.AreEqual(1, defeated.Count);
            Assert.AreEqual(("rat", "rat-1", 5), (defeated[0].EnemyId, defeated[0].ObjectId, defeated[0].Xp));
            Assert.IsFalse(combat.TryAttack(), "The defeated are no targets");
        }

        [Test]
        public void ResistanceToTheWeaponsTypeIsUsed()
        {
            combat.WeaponDamageType = "fire";
            var rat = Enemy(new Vector3(1f, 0f, 0f), armor: 0f);
            rat.Resistances.Add(new PlannerResistance { DamageType = "fire", Percent = 50f });
            Assert.AreEqual(3f, combat.PlayerHitOn(rat), 0.0001f);
            rat.Resistances[0] = new PlannerResistance { DamageType = "fire", Percent = -25f };
            Assert.AreEqual(7.5f, combat.PlayerHitOn(rat), 0.0001f, "A weakness takes extra");
        }

        [Test]
        public void NothingInReachIsNoAttack()
        {
            var rat = Enemy(new Vector3(3f, 0f, 0f));
            Assert.IsNull(combat.Target());
            Assert.IsFalse(combat.TryAttack());
            Assert.AreEqual(20f, rat.Health.Current);
        }

        [UnityTest]
        public IEnumerator AnEnemyChasesAndHitsAtItsRate()
        {
            var rat = Enemy(new Vector3(4f, 0.1f, 0f), damage: 3f, rate: 2f, passive: false, speed: 4f);
            rat.gameObject.AddComponent<CharacterController>();
            var t0 = Time.time;
            while (combat.PlayerHealth.Current >= 30f && Time.time - t0 < 3f) yield return null;
            Assert.Less(Vector3.Distance(rat.transform.position, player.transform.position), 2f, "It came to the player");
            Assert.AreEqual(27f, combat.PlayerHealth.Current, 0.0001f, "One hit of 3 (armor 0, resist 0)");
            yield return new WaitForSeconds(0.25f);
            Assert.AreEqual(27f, combat.PlayerHealth.Current, 0.0001f, "Not again before 1 / its rate");
            yield return new WaitForSeconds(0.35f);
            Assert.AreEqual(24f, combat.PlayerHealth.Current, 0.0001f);
        }

        [UnityTest]
        public IEnumerator APassiveEnemyNeverAttacks()
        {
            Enemy(new Vector3(1f, 0f, 0f), passive: true);
            yield return new WaitForSeconds(0.5f);
            Assert.AreEqual(30f, combat.PlayerHealth.Current);
        }

        [UnityTest]
        public IEnumerator ADefeatedPlayerIsBackAtTheStartWithFullHealth()
        {
            var rat = Enemy(new Vector3(1f, 0f, 0f), damage: 3f, passive: false);
            combat.PlayerHealth.Set(2f);
            var t0 = Time.time;
            while (playerDown.Count == 0 && Time.time - t0 < 3f) yield return null;
            Assert.AreEqual(1, playerDown.Count);
            Assert.AreEqual("rat", playerDown[0].ByEnemyId);
            Assert.AreEqual(30f, combat.PlayerHealth.Current);
            Assert.Less(Vector2.Distance(new Vector2(player.transform.position.x, player.transform.position.z), new Vector2(-5f, -5f)), 0.1f);
            Assert.IsFalse(rat.Health.IsDead);
        }

        [UnityTest]
        public IEnumerator TheLootIsTakenOnceByInteracting()
        {
            var rat = Enemy(new Vector3(1f, 0f, 0f), hp: 1f);
            Assert.IsTrue(combat.TryAttack());
            Assert.IsTrue(rat.Defeated);
            var loot = rat.GetComponent<PlannerLoot>();
            yield return null;
            Assert.AreEqual("Take Coin", loot.Prompt);
            Assert.IsTrue(interactor.TryInteract());
            Assert.AreEqual(1, inventory.CountOf("coin"));
            Assert.IsTrue(loot.Looted);
            Assert.IsFalse(interactor.TryInteract());
            Assert.AreEqual(1, inventory.CountOf("coin"));
        }

        [Test]
        public void TheFightIsSavedAndLoaded()
        {
            var a = Enemy(new Vector3(1f, 0f, 0f), hp: 1f, objectId: "a");
            var b = Enemy(new Vector3(10f, 0f, 0f), objectId: "b");
            combat.TryAttack();
            b.Health.Hit(5f);
            combat.PlayerHealth.Hit(4f);
            var go = made.First(x => x.name == "Combat");
            var state = go.AddComponent<PlannerGameState>();
            state.Combat = combat;
            var json = state.Capture(PlannerStateKind.Combat);

            a.SetState(1f, false, false);
            b.SetState(20f, false, false);
            combat.PlayerHealth.Restore();
            state.Restore(PlannerStateKind.Combat, json);
            Assert.IsTrue(a.Defeated);
            Assert.AreEqual(15f, b.Health.Current);
            Assert.AreEqual(26f, combat.PlayerHealth.Current);

            Assert.Throws<PlannerStateException>(() => state.Check(PlannerStateKind.Combat, "{\"playerHp\":10,\"enemies\":[{\"id\":\"ghost\",\"hp\":1}]}"));
            Assert.Throws<PlannerStateException>(() => state.Check(PlannerStateKind.Combat, "{\"playerHp\":99,\"enemies\":[]}"), "More than the plan's max health");
        }

        [Test]
        public void RefusesToStartWithoutTheFormula()
        {
            var go = new GameObject("Bad");
            made.Add(go);
            var c = go.AddComponent<PlannerCombat>();
            c.Player = player;
            c.PlayerHealth = go.AddComponent<PlannerHealth>();
            var rt = new PlannerRuntime().Register(player.Movement).Register(c);
            Assert.Throws<PlannerRuntimeException>(() => rt.Start(new[] { "combat" }));
            StringAssert.Contains("no damage formula", string.Join(" ", rt.Errors));
        }
    }
}
