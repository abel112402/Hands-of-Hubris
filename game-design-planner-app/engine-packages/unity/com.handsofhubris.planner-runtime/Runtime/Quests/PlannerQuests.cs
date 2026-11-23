using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;

namespace HoHPlanner.Runtime
{
    /// <summary>
    /// The plan's quest graph (the generated PlannerQuestLog, through the generated PlannerQuestGraph): which quests may
    /// start, and recording that one is done. The quest module asks it, so it never runs a quest the plan does not allow.
    /// </summary>
    public interface IPlannerQuestGraph
    {
        bool Knows(string questId);
        bool CanStart(string questId);
        bool IsDone(string questId);
        /// <summary>Records the quest as done; false when the plan does not allow it now.</summary>
        bool Complete(string questId);

        /// <summary>Whether the plan has this story choice (planner choice ID).</summary>
        bool KnowsChoice(string choiceId);
        /// <summary>Whether the choice can be made now (its quest done, its decision not yet made).</summary>
        bool CanChoose(string choiceId);
        bool HasChosen(string choiceId);
        /// <summary>Whether a choice of the same decision was already made.</summary>
        bool IsDecided(string choiceId);
        /// <summary>Records the choice; false when the plan does not allow it now.</summary>
        bool Choose(string choiceId);

        /// <summary>The graph's progress (done quests, choices made) as JSON, for a save.</summary>
        string SaveState();

        /// <summary>Replaces the progress with a saved one; throws when it is damaged, and then nothing changes.</summary>
        void LoadState(string json);
    }

    [Serializable]
    public struct PlannerItemAmount
    {
        public string ItemId;
        [Min(1)] public int Count;

        public PlannerItemAmount(string itemId, int count)
        {
            ItemId = itemId;
            Count = count;
        }
    }

    /// <summary>A quest's typed rule from the plan: done when the player holds every goal item; then the rewards.</summary>
    [Serializable]
    public sealed class PlannerQuestRule
    {
        public string QuestId;
        public string Name;
        public List<PlannerItemAmount> Goal = new List<PlannerItemAmount>();
        public List<PlannerItemAmount> Reward = new List<PlannerItemAmount>();
        public int Money;
        public int Xp;
    }

    public readonly struct PlannerQuestStarted
    {
        public readonly string QuestId;
        public PlannerQuestStarted(string questId) => QuestId = questId;
    }

    /// <summary>A quest is done and its reward given (items in the inventory; money and XP for the modules that keep them).</summary>
    public readonly struct PlannerQuestCompleted
    {
        public readonly string QuestId;
        public readonly IReadOnlyList<PlannerItemAmount> Items;
        public readonly int Money;
        public readonly int Xp;

        public PlannerQuestCompleted(string questId, IReadOnlyList<PlannerItemAmount> items, int money, int xp)
        {
            QuestId = questId;
            Items = items;
            Money = money;
            Xp = xp;
        }
    }

    /// <summary>A quest is done, but its item reward does not fit yet; it is given as soon as it does.</summary>
    public readonly struct PlannerQuestRewardWaiting
    {
        public readonly string QuestId;
        public PlannerQuestRewardWaiting(string questId) => QuestId = questId;
    }

    /// <summary>
    /// The “quests” module (after “inventory”). A quest with a typed rule starts when the plan's quest graph lets it;
    /// while active, its goal (hold these items: AND, items are not taken) is checked after every inventory change and
    /// when it starts. When it holds, the graph records the quest done, and the item reward goes into the inventory all
    /// or nothing — while it does not fit, the quest waits (<see cref="PlannerQuestRewardWaiting"/>) and the reward is
    /// given at the next change that makes room. Either way it is given exactly once. Starting fails, with every reason,
    /// when the graph is missing or a rule names a quest the graph or an item the inventory does not know.
    /// </summary>
    [AddComponentMenu("Game Design Planner/Planner Quests")]
    public sealed class PlannerQuests : MonoBehaviour, IPlannerService
    {
        [Tooltip("The generated PlannerQuestGraph (an IPlannerQuestGraph).")]
        public MonoBehaviour Graph;
        public PlannerInventory Inventory;
        public List<PlannerQuestRule> Rules = new List<PlannerQuestRule>();

        readonly HashSet<string> active = new HashSet<string>();
        readonly HashSet<string> rewarded = new HashSet<string>();
        readonly HashSet<string> waiting = new HashSet<string>();
        PlannerRuntime runtime;
        IDisposable subscription;
        bool refreshing;

        public string Id => "quests";
        public IReadOnlyList<string> DependsOn => new[] { "inventory" };

        IPlannerQuestGraph G => Graph as IPlannerQuestGraph;

        /// <summary>While true (a game is being loaded), nothing is checked or given.</summary>
        public bool Paused { get; set; }

        /// <summary>What a save holds of the quests: the graph's log and this module's sets.</summary>
        public sealed class State
        {
            public string Graph;
            public List<string> Active = new List<string>();
            public List<string> Rewarded = new List<string>();
            public List<string> Waiting = new List<string>();
        }

        public State CaptureState() => new State
        {
            Graph = G?.SaveState(),
            Active = Rules.Select(r => r.QuestId).Where(active.Contains).ToList(),
            Rewarded = Rules.Select(r => r.QuestId).Where(rewarded.Contains).ToList(),
            Waiting = Rules.Select(r => r.QuestId).Where(waiting.Contains).ToList(),
        };

        /// <summary>Checks a saved state: a graph log must be there; quests the plan no longer has are reported (and dropped on restore).</summary>
        public void CheckState(State state)
        {
            if (G == null) throw new PlannerStateException("The scene has no quest graph to restore.");
            if (string.IsNullOrEmpty(state.Graph)) throw new PlannerStateException("The saved quests have no quest-graph log.");
        }

        public void RestoreState(State state)
        {
            CheckState(state);
            G.LoadState(state.Graph);
            var known = new HashSet<string>(Rules.Select(r => r.QuestId));
            var gone = state.Active.Concat(state.Rewarded).Concat(state.Waiting).Where(id => !known.Contains(id)).Distinct().ToList();
            if (gone.Count > 0) Debug.LogWarning($"[Planner runtime] The save has quests this plan no longer runs: {string.Join(", ", gone)}; they are left out.", this);
            active.Clear();
            rewarded.Clear();
            waiting.Clear();
            active.UnionWith(state.Active.Where(known.Contains));
            rewarded.UnionWith(state.Rewarded.Where(known.Contains));
            waiting.UnionWith(state.Waiting.Where(known.Contains));
            Changed?.Invoke();
        }

        /// <summary>Raised after any quest starts, completes or waits for room for its reward.</summary>
        public event Action Changed;

        public bool IsActive(string questId) => active.Contains(questId);
        public bool IsDone(string questId) => G != null && G.IsDone(questId);
        public bool IsRewarded(string questId) => rewarded.Contains(questId);
        public bool IsWaitingForRoom(string questId) => waiting.Contains(questId);
        public PlannerQuestRule Rule(string questId) => Rules.FirstOrDefault(r => r.QuestId == questId);

        /// <summary>The quests that are active now, in plan order.</summary>
        public IEnumerable<PlannerQuestRule> Active => Rules.Where(r => active.Contains(r.QuestId));

        public void Initialize(PlannerRuntime runtime)
        {
            var problems = new List<string>();
            if (G == null) problems.Add("no quest graph: the scene needs the generated PlannerQuestGraph (export with Quests chosen and build the prototype scene again)");
            if (Inventory == null) problems.Add("no inventory to check the goals and give the rewards");
            foreach (var r in Rules)
            {
                if (G != null && !G.Knows(r.QuestId)) problems.Add($"the quest “{r.Name}” ({r.QuestId}) is not in the plan's quest graph");
                foreach (var a in r.Goal.Concat(r.Reward))
                {
                    if (Inventory != null && Inventory.Def(a.ItemId) == null) problems.Add($"{r.Name} names the item “{a.ItemId}”, which the inventory does not know");
                    if (a.Count < 1) problems.Add($"{r.Name}: an amount below 1 for “{a.ItemId}”");
                }
            }
            if (problems.Count > 0) throw new InvalidOperationException("The quests cannot start: " + string.Join("; ", problems) + ".");
            this.runtime = runtime;
            subscription = runtime.Events.Subscribe<PlannerInventoryChanged>(_ => Refresh());
            Refresh();
        }

        public void Shutdown()
        {
            subscription?.Dispose();
            subscription = null;
            runtime = null;
        }

        bool Holds(PlannerQuestRule r) => r.Goal.Count > 0 && r.Goal.All(a => Inventory.CountOf(a.ItemId) >= a.Count);

        /// <summary>Starts what may start, finishes what is reached and gives the rewards that fit. Safe to call any time.</summary>
        public void Refresh()
        {
            if (runtime == null || refreshing || Paused) return;
            refreshing = true;
            var changed = false;
            try
            {
                // Again while something changed: a reward can reach another quest's goal.
                var again = true;
                for (var pass = 0; again && pass < 10; pass++)
                {
                    again = false;
                    foreach (var r in Rules)
                    {
                        if (rewarded.Contains(r.QuestId)) continue;
                        if (!G.IsDone(r.QuestId))
                        {
                            if (!G.CanStart(r.QuestId)) continue;
                            if (active.Add(r.QuestId))
                            {
                                changed = true;
                                runtime.Events.Publish(new PlannerQuestStarted(r.QuestId));
                            }
                            if (!Holds(r) || !G.Complete(r.QuestId)) continue;
                            changed = again = true;
                        }
                        // Done before this module saw it (e.g. a loaded game): its reward is not given again.
                        else if (!waiting.Contains(r.QuestId)) continue;
                        // Done: give the reward once, all or nothing.
                        if (Inventory.TryAddAll(r.Reward))
                        {
                            active.Remove(r.QuestId);
                            waiting.Remove(r.QuestId);
                            rewarded.Add(r.QuestId);
                            changed = again = true;
                            runtime.Events.Publish(new PlannerQuestCompleted(r.QuestId, r.Reward.ToArray(), r.Money, r.Xp));
                        }
                        else if (waiting.Add(r.QuestId))
                        {
                            changed = true;
                            runtime.Events.Publish(new PlannerQuestRewardWaiting(r.QuestId));
                        }
                    }
                }
            }
            finally
            {
                refreshing = false;
            }
            if (changed) Changed?.Invoke();
        }
    }
}
