using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace HoHPlanner.Runtime
{
    /// <summary>
    /// A self-test of a built player (the planner's Unity gate): start it with <c>-hohSelfTest</c> (and optionally
    /// <c>-hohSelfTestReport &lt;file&gt;</c> for a JSON report). It checks what the first scene has, and quits with 0 when
    /// everything passed, 1 otherwise:
    /// the runtime runs and no script is missing; each item pickup is taken once by the interaction module (and cannot
    /// be used again); every quest whose goal is then held is done and rewarded; each recipe that can be crafted then gives exactly its
    /// output for exactly its inputs; and, with a save system, a save made now
    /// loads into a fresh game (the scene again) with the same position, inventory, pickups and quests and no reward while
    /// loading. Without the argument it does nothing.
    /// </summary>
    public sealed class PlannerSelfTest : MonoBehaviour
    {
        public const string Argument = "-hohSelfTest";
        public const string ReportArgument = "-hohSelfTestReport";
        const string Slot = "hoh-selftest";

        [Serializable]
        sealed class Check
        {
            public string name;
            public bool passed;
            public string detail;
        }

        [Serializable]
        sealed class Report
        {
            public string scene;
            public string runtimeVersion;
            public string unityVersion;
            public bool passed;
            public List<Check> checks = new List<Check>();
        }

        readonly Report report = new Report();

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void Begin()
        {
            if (!Environment.GetCommandLineArgs().Contains(Argument)) return;
            var go = new GameObject("Planner self-test");
            DontDestroyOnLoad(go);
            go.AddComponent<PlannerSelfTest>();
        }

        void Add(string name, bool passed, string detail)
        {
            report.checks.Add(new Check { name = name, passed = passed, detail = detail });
            Debug.Log($"[Planner self-test] {(passed ? "PASS" : "FAIL")} {name}: {detail}");
        }

        IEnumerator Start()
        {
            report.scene = SceneManager.GetActiveScene().name;
            report.runtimeVersion = PlannerRuntimeInfo.Version;
            report.unityVersion = Application.unityVersion;
            yield return new WaitForSeconds(1f);
            try
            {
                Checks1();
                CraftingChecks();
            }
            catch (Exception e)
            {
                Add("no exception", false, e.ToString());
            }
            yield return Fights();
            yield return SaveAndLoad();
            report.passed = report.checks.Count > 0 && report.checks.All(c => c.passed);
            var json = JsonUtility.ToJson(report, true);
            var args = Environment.GetCommandLineArgs();
            var i = Array.IndexOf(args, ReportArgument);
            if (i >= 0 && i + 1 < args.Length) File.WriteAllText(args[i + 1], json);
            Debug.Log($"[Planner self-test] {(report.passed ? "PASSED" : "FAILED")}: {report.checks.Count(c => c.passed)}/{report.checks.Count} checks.");
            Application.Quit(report.passed ? 0 : 1);
        }

        static T One<T>() where T : UnityEngine.Object => FindFirstObjectByType<T>(FindObjectsInactive.Include);

        void Checks1()
        {
            var host = One<PlannerRuntimeHost>();
            Add("runtime runs", host != null && host.Runtime != null && host.Runtime.State == PlannerRuntimeState.Running,
                host == null ? "no PlannerRuntimeHost" : $"{host.Runtime?.State} ({string.Join(", ", host.Runtime?.StartOrder ?? new List<string>())}) {string.Join(" ", host.Runtime?.Errors ?? new string[0])}");
            var missing = FindObjectsByType<GameObject>(FindObjectsInactive.Include, FindObjectsSortMode.None).Where(g => g.GetComponents<Component>().Any(c => c == null)).Select(g => g.name).ToList();
            Add("no missing script", missing.Count == 0, missing.Count == 0 ? "none" : string.Join(", ", missing));
            if (host?.Runtime == null) return;

            var player = One<PlannerPlayer>();
            var interactor = One<PlannerInteractor>();
            var pickups = FindObjectsByType<PlannerPickup>(FindObjectsSortMode.None).Where(p => p.IsValid && !p.Taken).ToList();
            if (player == null || interactor == null || pickups.Count == 0) return;
            var got = new List<PlannerItemAcquired>();
            using (host.Runtime.Events.Subscribe<PlannerItemAcquired>(got.Add))
            {
                foreach (var p in pickups)
                {
                    player.Teleport(p.transform.position + new Vector3(0.3f, 0.05f, 0f), 0f);
                    var first = interactor.TryInteract();
                    var again = p.CanInteract(interactor);
                    Add($"pickup {p.Placement.ItemKey ?? p.Placement.ItemId}", first && p.Taken && !again && got.Count(g => g.Source == p.Placement.ObjectId) == 1,
                        $"taken {p.Taken}, usable again {again}, item events {got.Count(g => g.Source == p.Placement.ObjectId)}");
                }
            }

            var quests = One<PlannerQuests>();
            var inventory = One<PlannerInventory>();
            if (quests == null || inventory == null) return;
            foreach (var r in quests.Rules)
            {
                var held = r.Goal.All(a => inventory.CountOf(a.ItemId) >= a.Count);
                if (!held) continue;
                Add($"quest {r.Name}", quests.IsDone(r.QuestId) && quests.IsRewarded(r.QuestId) && r.Reward.All(a => inventory.CountOf(a.ItemId) >= a.Count),
                    $"done {quests.IsDone(r.QuestId)}, rewarded {quests.IsRewarded(r.QuestId)}");
            }
        }

        void CraftingChecks()
        {
            var crafting = One<PlannerCrafting>();
            if (crafting == null) return;
            var inv = crafting.Inventory;
            foreach (var r in crafting.Recipes)
            {
                if (!crafting.CanCraft(r.RecipeId, out var reason))
                {
                    Add($"recipe {r.Name} (not craftable now)", true, reason);
                    continue;
                }
                var before = inv.Items.ToDictionary(i => i.ItemId, i => inv.CountOf(i.ItemId));
                var crafted = crafting.TryCraft(r.RecipeId);
                var exact = inv.Items.All(i => inv.CountOf(i.ItemId) == before[i.ItemId] - r.Inputs.Where(a => a.ItemId == i.ItemId).Sum(a => a.Count) + (r.Output.ItemId == i.ItemId ? r.Output.Count : 0));
                Add($"craft {r.Name}", crafted && exact, $"crafted {crafted}, exact amounts {exact}");
            }
        }

        IEnumerator Fights()
        {
            var combat = One<PlannerCombat>();
            if (combat == null || combat.Player == null) yield break;
            var host = One<PlannerRuntimeHost>();
            foreach (var e in FindObjectsByType<PlannerEnemy>(FindObjectsSortMode.None).Where(x => !x.Health.IsDead).ToList())
            {
                var defeated = new List<PlannerEnemyDefeated>();
                var hits = 0;
                var expected = combat.PlayerHitOn(e);
                var exact = true;
                using (host.Runtime.Events.Subscribe<PlannerEnemyDefeated>(defeated.Add))
                {
                    combat.Player.Teleport(e.transform.position + new Vector3(0.8f, 0.05f, 0f), 0f);
                    var until = Time.time + 20f;
                    while (!e.Health.IsDead && Time.time < until)
                    {
                        if (combat.PlayerHealth.Current < combat.PlayerHealth.Max * 0.5f) combat.PlayerHealth.Restore();
                        var before = e.Health.Current;
                        if (combat.TryAttack())
                        {
                            hits++;
                            exact &= Mathf.Abs(before - e.Health.Current - Mathf.Min(before, expected)) < 0.001f;
                        }
                        yield return null;
                    }
                }
                var need = Mathf.CeilToInt(e.Health.Max / Mathf.Max(0.0001f, expected));
                Add($"fight {e.Name}", e.Health.IsDead && defeated.Count == 1 && defeated[0].Xp == e.Xp && exact && hits == need, $"defeated {e.Health.IsDead}, hits {hits} (planned {need}), {expected:0.###} per hit, XP {defeated.FirstOrDefault().Xp}");
                var loot = e.GetComponent<PlannerLoot>();
                var interactor = One<PlannerInteractor>();
                if (loot != null && loot.Items.Count > 0 && interactor != null)
                {
                    var inv = loot.Inventory;
                    var before = loot.Items.ToDictionary(i => i.ItemId, i => inv.CountOf(i.ItemId));
                    var took = interactor.TryInteract() && loot.Looted;
                    Add($"loot {e.Name}", took && loot.Items.All(i => inv.CountOf(i.ItemId) == before[i.ItemId] + loot.Items.Where(x => x.ItemId == i.ItemId).Sum(x => x.Count)), $"looted {loot.Looted}");
                }
            }
            if (combat.Respawn != null) combat.Player.Teleport(combat.Respawn.position + new Vector3(0f, 0.05f, 0f), 0f);
            combat.PlayerHealth.Restore();
            yield return null;
        }

        string Snapshot()
        {
            var player = One<PlannerPlayer>();
            var inventory = One<PlannerInventory>();
            var quests = One<PlannerQuests>();
            var pos = player != null ? player.transform.position : Vector3.zero;
            var parts = new List<string> { $"player {pos.x:0.0},{pos.z:0.0}" };
            if (inventory != null) parts.Add("inventory " + string.Join("|", inventory.Contents.Select(s => s.Empty ? "-" : $"{s.ItemId}x{s.Count}")));
            parts.Add("taken " + string.Join(",", FindObjectsByType<PlannerPickup>(FindObjectsInactive.Include, FindObjectsSortMode.None).Where(p => p.Taken).Select(p => p.Placement.ObjectId).OrderBy(x => x, StringComparer.Ordinal)));
            var combatState = One<PlannerCombat>();
            if (combatState != null) parts.Add($"health {combatState.PlayerHealth.Current:0.##}; enemies " + string.Join(",", FindObjectsByType<PlannerEnemy>(FindObjectsInactive.Include, FindObjectsSortMode.None).OrderBy(e => e.name, StringComparer.Ordinal).Select(e => $"{e.name}:{e.Health.Current:0.##}/{e.Defeated}")));
            if (quests != null) parts.Add("quests " + string.Join(",", quests.Rules.Select(r => $"{r.QuestId}:{quests.IsDone(r.QuestId)}/{quests.IsRewarded(r.QuestId)}")));
            return string.Join("; ", parts);
        }

        IEnumerator SaveAndLoad()
        {
            var save = FindObjectsByType<MonoBehaviour>(FindObjectsSortMode.None).OfType<IPlannerSaveSystem>().FirstOrDefault();
            if (save == null) yield break;
            var player = One<PlannerPlayer>();
            if (player != null) player.Teleport(player.transform.position + new Vector3(0.5f, 0f, 0.5f), 30f);
            yield return null;
            var before = Snapshot();
            string error = null;
            try
            {
                save.Save(Slot);
            }
            catch (Exception e)
            {
                error = e.Message;
            }
            if (error != null)
            {
                Add("save", false, error);
                yield break;
            }
            SceneManager.LoadScene(SceneManager.GetActiveScene().buildIndex);
            for (var i = 0; i < 5; i++) yield return null;
            var fresh = Snapshot();
            var rewards = 0;
            var host = One<PlannerRuntimeHost>();
            using (host?.Runtime?.Events.Subscribe<PlannerQuestCompleted>(_ => rewards++))
            {
                save = FindObjectsByType<MonoBehaviour>(FindObjectsSortMode.None).OfType<IPlannerSaveSystem>().FirstOrDefault();
                var loaded = false;
                try
                {
                    loaded = save != null && save.Load(Slot);
                }
                catch (Exception e)
                {
                    error = e.Message;
                }
                for (var i = 0; i < 5; i++) yield return null;
                var after = Snapshot();
                Add("save and load into a fresh game", loaded && error == null && after == before && rewards == 0,
                    $"saved [{before}]; fresh [{fresh}]; loaded [{after}]; rewards while loading {rewards}{(error != null ? "; " + error : "")}");
                save?.Delete(Slot);
            }
        }
    }
}
