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
    /// output for exactly its inputs; each NPC talks when interacted with, and its first option that can be picked runs its
    /// consequences (choice, items) exactly once and closes the other options of that decision; every enemy patrols its route, sees and chases
    /// the player and goes back once the player is out of sight, on the level's navigation mesh; every passage takes the player
    /// to its location and the way back returns; and, with a save system (saving in the last location reached), a save made now
    /// loads into a fresh game (the scene again) with the same position, inventory, pickups, dialogue and quests and no reward while
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
                Talks();
            }
            catch (Exception e)
            {
                Add("no exception", false, e.ToString());
            }
            yield return Behaviours();
            yield return Fights();
            yield return Travels();
            yield return Economy();
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

        void Talks()
        {
            var dialogue = One<PlannerDialogue>();
            var player = One<PlannerPlayer>();
            var interactor = One<PlannerInteractor>();
            if (dialogue == null || player == null || interactor == null) return;
            var graph = dialogue.Quests != null ? dialogue.Quests.Graph as IPlannerQuestGraph : null;
            foreach (var npc in FindObjectsByType<PlannerNpc>(FindObjectsSortMode.None))
            {
                player.Teleport(npc.transform.position + new Vector3(0.8f, 0.05f, 0f), 0f);
                var started = interactor.TryInteract() && dialogue.IsTalking && dialogue.Current == dialogue.StartLine(npc.CharacterId);
                var option = dialogue.Options.FirstOrDefault(o => o.Allowed);
                if (!started || option.Line == null)
                {
                    Add($"talk to {npc.Name}", started, started ? "started; no option can be picked now" : "the conversation did not start");
                    dialogue.End();
                    continue;
                }
                var l = option.Line;
                var inv = dialogue.Inventory;
                var before = inv != null ? inv.Items.ToDictionary(i => i.ItemId, i => inv.CountOf(i.ItemId)) : new Dictionary<string, int>();
                var picked = dialogue.Pick(l.LineId);
                bool Gave(int times) => inv == null || inv.Items.All(i => inv.CountOf(i.ItemId) == before[i.ItemId] + times * l.Give.Where(g => g.ItemId == i.ItemId).Sum(g => g.Count));
                var gaveOnce = Gave(1);
                var chose = string.IsNullOrEmpty(l.ChoiceId) || (graph != null && graph.HasChosen(l.ChoiceId));
                dialogue.End();
                // Again: the same option is shown, nothing is given twice, and the other options of the decision are closed.
                dialogue.Start(npc.CharacterId);
                var closed = string.IsNullOrEmpty(l.ChoiceId) || dialogue.Options.Where(o => o.Line != l && !string.IsNullOrEmpty(o.Line.ChoiceId) && graph.IsDecided(o.Line.ChoiceId)).All(o => !o.Allowed);
                var again = dialogue.Pick(l.LineId);
                var stillOnce = Gave(1);
                dialogue.End();
                Add($"talk to {npc.Name}", picked && gaveOnce && chose && closed && again && stillOnce,
                    $"picked “{l.Option}” {picked}, choice made {chose}, items once {gaveOnce && stillOnce}, other options closed {closed}");
            }
        }

        /// <summary>The behaviour template of every living enemy: patrol, sight and chase, and going back.</summary>
        IEnumerator Behaviours()
        {
            var combat = One<PlannerCombat>();
            if (combat == null || combat.Player == null) yield break;
            var nav = One<PlannerNavigation>();
            var start = FindObjectsByType<PlannerPlacement>(FindObjectsSortMode.None).FirstOrDefault(x => x.IsPlayerStart);
            if (nav != null) Add("navigation mesh", nav.Available && start != null && nav.OnMesh(start.transform.position, out _), nav.Available ? "baked" : nav.Problem);
            var player = combat.Player;
            foreach (var e in FindObjectsByType<PlannerEnemy>(FindObjectsSortMode.None).Where(x => !x.Health.IsDead && !x.Passive).ToList())
            {
                var notes = new List<string>();
                var ok = true;
                if (start != null) player.Teleport(start.transform.position + new Vector3(0f, 0.05f, 0f), 0f);
                if (e.Route.Count > 1)
                {
                    var seen = new HashSet<int>();
                    var until = Time.time + 20f;
                    var last = e.NextPoint;
                    var from = e.transform.position;
                    var moved = 0f;
                    var prev = from;
                    // A point is reached when the enemy turns to the next one.
                    while (seen.Count < e.Route.Count && Time.time < until)
                    {
                        if (e.NextPoint != last)
                        {
                            seen.Add(last);
                            last = e.NextPoint;
                        }
                        moved += Vector3.Distance(prev, e.transform.position);
                        prev = e.transform.position;
                        yield return null;
                    }
                    ok &= seen.Count == e.Route.Count && e.State == PlannerEnemyState.Patrol;
                    var aim = e.Route[e.NextPoint];
                    notes.Add($"patrolled {seen.Count}/{e.Route.Count} points ({e.State}, walked {moved:0.0} m, now {Vector2.Distance(new Vector2(e.transform.position.x, e.transform.position.z), new Vector2(aim.x, aim.z)):0.00} m from point {e.NextPoint})");
                }
                // Within sight, no wall between: it chases.
                var near = e.transform.position + e.transform.forward * Mathf.Min(2f, e.SightRange * 0.5f);
                if (nav != null && nav.OnMesh(near, out var onMesh)) near = onMesh;
                player.Teleport(near + new Vector3(0f, 0.05f, 0f), 0f);
                var t = Time.time + 3f;
                while (e.State != PlannerEnemyState.Chase && Time.time < t) yield return null;
                ok &= e.State == PlannerEnemyState.Chase;
                notes.Add($"chases: {e.State == PlannerEnemyState.Chase}");
                // Out of sight: it goes back to its post or route.
                if (start != null) player.Teleport(start.transform.position + new Vector3(0f, 0.05f, 0f), 0f);
                combat.PlayerHealth.Restore();
                t = Time.time + e.ForgetAfter + 20f;
                while ((e.State == PlannerEnemyState.Chase || e.State == PlannerEnemyState.Return) && Time.time < t) yield return null;
                var back = e.FromPost(e.transform.position);
                ok &= (e.State == PlannerEnemyState.Guard || e.State == PlannerEnemyState.Patrol) && back < 1f;
                notes.Add($"went back: {e.State}, {back:0.0} m from its post or route");
                Add($"behaviour {e.Name}", ok, string.Join("; ", notes));
            }
            combat.PlayerHealth.Restore();
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

        /// <summary>Through every passage, checking where the player arrives; ends after one more trip through the first, so the save is made elsewhere.</summary>
        IEnumerator Travels()
        {
            var player = One<PlannerPlayer>();
            var interactor = One<PlannerInteractor>();
            var passages = FindObjectsByType<PlannerPassage>(FindObjectsSortMode.None).OrderBy(x => x.PassageId, StringComparer.Ordinal).ToList();
            if (player == null || interactor == null || passages.Count == 0) yield break;
            var host = One<PlannerRuntimeHost>();
            foreach (var ps in passages.Concat(passages.Take(1)))
            {
                var went = new List<PlannerTravelled>();
                using (host.Runtime.Events.Subscribe<PlannerTravelled>(went.Add))
                {
                    player.Teleport(ps.transform.position + new Vector3(0.3f, 0.05f, 0f), 0f);
                    yield return null;
                    var used = interactor.TryInteract();
                    yield return null;
                    var here = PlannerLocation.At(player.transform.position);
                    Add($"passage to {ps.ToName}", used && went.Count == 1 && here != null && here.LocationId == ps.ToLocation && went[0].To == ps.ToLocation,
                        $"travelled {went.Count}, now in {(here != null ? here.Name : "no location")}");
                }
            }
        }

        /// <summary>Progression, trading and the clock, each when the scene has it.</summary>
        IEnumerator Economy()
        {
            var progression = One<PlannerProgression>();
            if (progression != null)
            {
                // The XP so far must sit on the planned levels: replay it on the table.
                var level = 1;
                var xp = progression.TotalXp;
                for (var i = 0; i < progression.XpToNext.Count && level < progression.LevelCap && xp >= progression.XpToNext[i]; i++, level++) xp -= progression.XpToNext[i];
                var points = progression.StartSkillPoints + (level - 1) * progression.SkillPointsPerLevel;
                Add("progression", progression.TotalXp > 0 && progression.Level == level && Mathf.Approximately(progression.SkillPoints, points), $"{progression.TotalXp} XP: level {progression.Level} (planned {level}), {progression.SkillPoints} skill points (planned {points})");
            }
            var trade = One<PlannerTrade>();
            foreach (var m in FindObjectsByType<PlannerMerchant>(FindObjectsSortMode.None))
            {
                if (trade == null || m.Sells.Count == 0) continue;
                var offer = m.Sells[0];
                trade.AddMoney(offer.Price);
                var money = trade.Money;
                var have = trade.Inventory.CountOf(offer.ItemId);
                var bought = trade.Buy(m, offer.ItemId);
                var ok = bought && trade.Money == money - offer.Price && trade.Inventory.CountOf(offer.ItemId) == have + 1;
                var back = m.Buys.FirstOrDefault(b => b.ItemId == offer.ItemId);
                if (back.ItemId != null)
                {
                    var sold = trade.Sell(m, offer.ItemId);
                    ok &= sold && trade.Money == money - offer.Price + back.Price && trade.Inventory.CountOf(offer.ItemId) == have;
                }
                Add($"trade {m.Name}", ok, $"bought for {offer.Price} {bought}, money {money} → {trade.Money}");
                yield return null;
            }
            var clock = One<PlannerClock>();
            if (clock != null)
            {
                var from = clock.Hour;
                var t = Time.time;
                yield return new WaitForSeconds(1f);
                var rate = (clock.Hour - from + 24f) % 24f / Mathf.Max(0.0001f, Time.time - t);
                var night = clock.Phases.OrderBy(p => p.Visibility).FirstOrDefault();
                var lightOk = true;
                if (night != null && clock.Sun != null)
                {
                    var day = clock.Phases.OrderByDescending(p => p.Visibility).First();
                    clock.Set(day.Start + 0.1f, clock.Day);
                    var bright = clock.Sun.intensity;
                    clock.Set(night.Start + 0.1f, clock.Day);
                    lightOk = clock.Phase == night && Mathf.Abs(clock.Sun.intensity - bright * night.Visibility / day.Visibility) < 0.01f;
                    clock.Set(from, clock.Day);
                }
                Add("day and night", Mathf.Abs(rate - clock.HoursPerSecond) < clock.HoursPerSecond * 0.1f && lightOk, $"{rate:0.000} in-game hours per second (planned {clock.HoursPerSecond:0.000}); light by phase {lightOk}");
            }
        }

        string Snapshot()
        {
            var player = One<PlannerPlayer>();
            var inventory = One<PlannerInventory>();
            var quests = One<PlannerQuests>();
            var pos = player != null ? player.transform.position : Vector3.zero;
            var parts = new List<string> { $"player {pos.x:0.0},{pos.z:0.0} in {PlannerLocation.At(pos)?.LocationId ?? "-"}" };
            if (inventory != null) parts.Add("inventory " + string.Join("|", inventory.Contents.Select(s => s.Empty ? "-" : $"{s.ItemId}x{s.Count}")));
            parts.Add("taken " + string.Join(",", FindObjectsByType<PlannerPickup>(FindObjectsInactive.Include, FindObjectsSortMode.None).Where(p => p.Taken).Select(p => p.Placement.ObjectId).OrderBy(x => x, StringComparer.Ordinal)));
            var combatState = One<PlannerCombat>();
            if (combatState != null) parts.Add($"health {combatState.PlayerHealth.Current:0.##}; enemies " + string.Join(",", FindObjectsByType<PlannerEnemy>(FindObjectsInactive.Include, FindObjectsSortMode.None).OrderBy(e => e.name, StringComparer.Ordinal).Select(e => $"{e.name}:{e.Health.Current:0.##}/{e.Defeated}")));
            var progressionState = One<PlannerProgression>();
            if (progressionState != null) parts.Add($"level {progressionState.Level} {progressionState.Xp} xp");
            var tradeState = One<PlannerTrade>();
            if (tradeState != null) parts.Add($"money {tradeState.Money}");
            var dialogueState = One<PlannerDialogue>();
            if (dialogueState != null) parts.Add("dialogue " + string.Join(",", dialogueState.CaptureState()));
            if (quests != null) parts.Add("quests " + string.Join(",", quests.Rules.Select(r => $"{r.QuestId}:{quests.IsDone(r.QuestId)}/{quests.IsRewarded(r.QuestId)}")));
            if (quests != null) parts.Add("graph " + quests.CaptureState().Graph);
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
