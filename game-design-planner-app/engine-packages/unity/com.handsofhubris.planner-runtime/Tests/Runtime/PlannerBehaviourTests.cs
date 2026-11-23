using System.Collections;
using System.Collections.Generic;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.TestTools;

namespace HoHPlanner.Runtime.Tests
{
    /// <summary>
    /// The enemy behaviour template on a baked navigation mesh: a floor with a wall across part of it; patrol, sight
    /// (walls block it), chase, going back after losing sight or past the give-up range, passive enemies.
    /// </summary>
    public class PlannerBehaviourTests
    {
        readonly List<GameObject> made = new List<GameObject>();
        PlannerRuntime runtime;
        PlannerPlayer player;
        PlannerCombat combat;
        PlannerNavigation nav;
        GameObject level;

        GameObject Box(string name, Vector3 at, Vector3 size)
        {
            var go = GameObject.CreatePrimitive(PrimitiveType.Cube);
            go.name = name;
            go.transform.SetParent(level.transform, false);
            go.transform.position = at;
            go.transform.localScale = size;
            return go;
        }

        PlannerEnemy Enemy(Vector3 at, params Vector3[] route)
        {
            var go = new GameObject("Enemy");
            made.Add(go);
            go.transform.position = at;
            var cc = go.AddComponent<CharacterController>();
            cc.height = 1.6f;
            cc.radius = 0.4f;
            cc.center = new Vector3(0f, 0.8f, 0f);
            var placement = go.AddComponent<PlannerPlacement>();
            placement.Role = "enemy";
            placement.ObjectId = "rat-1";
            go.AddComponent<PlannerHealth>().Max = 100f;
            var e = go.AddComponent<PlannerEnemy>();
            e.Combat = combat;
            e.Navigation = nav;
            e.Name = "Rat";
            e.Damage = 0.01f;
            e.Speed = 3f;
            e.SightRange = 6f;
            e.ForgetAfter = 0.5f;
            e.Route = new List<Vector3>(route);
            return e;
        }

        void Start(params string[] extra)
        {
            runtime = new PlannerRuntime().Register(player.Movement).Register(nav).Register(combat);
            runtime.Start(new[] { "combat", "navigation" });
            Assert.AreEqual(PlannerRuntimeState.Running, runtime.State, string.Join(" ", runtime.Errors));
        }

        [SetUp]
        public void SetUp()
        {
            level = new GameObject("Level");
            made.Add(level);
            Box("Floor", new Vector3(0f, -0.5f, 0f), new Vector3(30f, 1f, 30f));
            // A wall from z = -2 to z = 10 at x = 0: the way round is at its south end.
            Box("Wall", new Vector3(0f, 1f, 4f), new Vector3(0.5f, 2f, 12f));
            player = PlannerPlayer.Create(new Vector3(-10f, 0.1f, -10f), new PlannerPlayerSettings(4f, 4f, 2f));
            made.Add(player.gameObject);
            var go = new GameObject("Combat");
            made.Add(go);
            var health = go.AddComponent<PlannerHealth>();
            health.Max = 1000f;
            combat = go.AddComponent<PlannerCombat>();
            combat.Player = player;
            combat.PlayerHealth = health;
            combat.Formula = go.AddComponent<PlannerCombatTests.DefaultFormula>();
            combat.WeaponDamage = 1f;
            nav = go.AddComponent<PlannerNavigation>();
            nav.Roots = new List<Transform> { level.transform };
            combat.Navigation = nav;
        }

        [TearDown]
        public void TearDown()
        {
            runtime?.Stop();
            foreach (var go in made) if (go != null) Object.DestroyImmediate(go);
            made.Clear();
        }

        IEnumerator Until(System.Func<bool> done, float seconds)
        {
            var t = Time.time + seconds;
            while (!done() && Time.time < t) yield return null;
        }

#if HOH_UNITY_AI
        [Test]
        public void BakesANavigationMeshAndFindsTheWayRoundAWall()
        {
            Start();
            Assert.IsTrue(nav.Available, nav.Problem);
            var corners = new List<Vector3>();
            Assert.IsTrue(nav.Path(new Vector3(-3f, 0f, 6f), new Vector3(3f, 0f, 6f), corners));
            Assert.Greater(corners.Count, 2, "Round the wall, not through it");
            Assert.IsTrue(corners.Exists(c => c.z < -1.5f || c.z > 9.5f), "by one of its ends");
        }

        [UnityTest]
        public IEnumerator WalksRoundTheWallToItsPost()
        {
            Start();
            var e = Enemy(new Vector3(-3f, 0.1f, 6f));
            e.Post = new GameObject("Post").transform;
            made.Add(e.Post.gameObject);
            e.Post.position = new Vector3(3f, 0f, 6f);
            yield return Until(() => Vector3.Distance(new Vector3(e.transform.position.x, 0f, e.transform.position.z), new Vector3(3f, 0f, 6f)) < 0.6f, 15f);
            Assert.Less(Vector3.Distance(new Vector3(e.transform.position.x, 0f, e.transform.position.z), new Vector3(3f, 0f, 6f)), 0.6f, "Reached its post on the other side of the wall");
        }
#endif

        [UnityTest]
        public IEnumerator PatrolsItsRoute()
        {
            Start();
            var e = Enemy(new Vector3(5f, 0.1f, -5f), new Vector3(5f, 0f, -5f), new Vector3(9f, 0f, -5f), new Vector3(9f, 0f, -8f));
            yield return null;
            Assert.AreEqual(PlannerEnemyState.Patrol, e.State);
            var seen = new HashSet<int>();
            var last = e.NextPoint;
            var t = Time.time + 15f;
            while (seen.Count < 3 && Time.time < t)
            {
                if (e.NextPoint != last)
                {
                    seen.Add(last);
                    last = e.NextPoint;
                }
                yield return null;
            }
            Assert.AreEqual(3, seen.Count, "Every point of the route, round and round");
        }

        [Test]
        public void SeesWithinRangeButNotThroughAWall()
        {
            Start();
            var e = Enemy(new Vector3(-2f, 0.1f, 5f));
            player.Teleport(new Vector3(-5f, 0.1f, 5f), 0f);
            Physics.SyncTransforms();
            Assert.IsTrue(e.Sees(player), "3 m away, nothing between");
            player.Teleport(new Vector3(2f, 0.1f, 5f), 0f);
            Physics.SyncTransforms();
            Assert.IsFalse(e.Sees(player), "Behind the wall");
            player.Teleport(new Vector3(-10f, 0.1f, 5f), 0f);
            Physics.SyncTransforms();
            Assert.IsFalse(e.Sees(player), "Beyond its sight range");
        }

        [UnityTest]
        public IEnumerator ChasesThenGoesBackWhenItLosesSight()
        {
            Start();
            var e = Enemy(new Vector3(-6f, 0.1f, -6f));
            player.Teleport(new Vector3(-6f, 0.1f, -2f), 0f);
            yield return Until(() => e.State == PlannerEnemyState.Chase, 2f);
            Assert.AreEqual(PlannerEnemyState.Chase, e.State, "Sees the player and chases");
            player.Teleport(new Vector3(12f, 0.1f, 12f), 0f);
            yield return Until(() => e.State == PlannerEnemyState.Return, 3f);
            Assert.AreEqual(PlannerEnemyState.Return, e.State, "Lost sight: goes back");
            yield return Until(() => e.State == PlannerEnemyState.Guard, 10f);
            Assert.AreEqual(PlannerEnemyState.Guard, e.State);
            Assert.Less(e.FromPost(e.transform.position), 0.6f, "At its post again");
        }

        [UnityTest]
        public IEnumerator GivesUpPastItsRangeAndDoesNotComeForAPlayerBeyondIt()
        {
            Start();
            var e = Enemy(new Vector3(-6f, 0.1f, -6f));
            e.GiveUp = 3f;
            e.SightRange = 20f;
            e.ForgetAfter = 30f;
            player.Teleport(new Vector3(-6f, 0.1f, -4f), 0f);
            yield return Until(() => e.State == PlannerEnemyState.Chase, 2f);
            Assert.AreEqual(PlannerEnemyState.Chase, e.State);
            // The player runs 9 m from the post, in plain sight: past the give-up range the enemy turns back.
            player.Teleport(new Vector3(-6f, 0.1f, 3f), 0f);
            yield return Until(() => e.State == PlannerEnemyState.Return, 5f);
            Assert.AreEqual(PlannerEnemyState.Return, e.State, "Gives up");
            yield return Until(() => e.State == PlannerEnemyState.Guard, 10f);
            Assert.AreEqual(PlannerEnemyState.Guard, e.State, "and stays at its post while the player is beyond its range");
        }

        [UnityTest]
        public IEnumerator APassiveEnemyPatrolsButNeverChases()
        {
            Start();
            var e = Enemy(new Vector3(5f, 0.1f, -5f), new Vector3(5f, 0f, -5f), new Vector3(9f, 0f, -5f));
            e.Passive = true;
            player.Teleport(new Vector3(6f, 0.1f, -5f), 0f);
            for (var i = 0; i < 30; i++)
            {
                yield return null;
                Assert.AreNotEqual(PlannerEnemyState.Chase, e.State);
            }
        }
    }
}
