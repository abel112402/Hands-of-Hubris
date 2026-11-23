using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;

namespace HoHPlanner.Runtime
{
    /// <summary>A typed Dialogue line of the plan: said by Speaker; when it answers another line, the player picks it with Option.</summary>
    [Serializable]
    public sealed class PlannerDialogueLine
    {
        public string LineId;
        [Tooltip("The character's planner ID.")]
        public string Speaker;
        [TextArea] public string Text;
        [Tooltip("The line this one answers; empty: it starts the speaker's conversation.")]
        public string After;
        [Tooltip("What the player picks to get this line.")]
        public string Option;
        [Tooltip("The story choice picking it makes (planner ID), once.")]
        public string ChoiceId;
        [Tooltip("Items picking it gives, once.")]
        public List<PlannerItemAmount> Give = new List<PlannerItemAmount>();
    }

    /// <summary>An option of the current line: its line, the player's text, and whether (and why not) it can be picked now.</summary>
    public readonly struct PlannerDialogueOption
    {
        public readonly PlannerDialogueLine Line;
        public readonly bool Allowed;
        public readonly string Reason;

        public PlannerDialogueOption(PlannerDialogueLine line, bool allowed, string reason)
        {
            Line = line;
            Allowed = allowed;
            Reason = reason;
        }
    }

    /// <summary>A line was shown — the extension point for animation, voice and custom NPC behaviour.</summary>
    public readonly struct PlannerDialogueLineShown
    {
        public readonly string Speaker;
        public readonly string LineId;
        public readonly string Text;

        public PlannerDialogueLineShown(string speaker, string lineId, string text)
        {
            Speaker = speaker;
            LineId = lineId;
            Text = text;
        }
    }

    /// <summary>An option was picked for the first time and its consequences ran (the choice made, the items given).</summary>
    public readonly struct PlannerDialoguePicked
    {
        public readonly string LineId;
        public readonly string ChoiceId;

        public PlannerDialoguePicked(string lineId, string choiceId)
        {
            LineId = lineId;
            ChoiceId = choiceId;
        }
    }

    /// <summary>
    /// The “dialogue” module (after “interaction”): conversations from the plan's typed Dialogue lines. <see cref="Start"/>
    /// shows the line that starts a speaker's conversation; the lines that answer the current line are its
    /// <see cref="Options"/>. <see cref="Pick"/> shows the picked line and, the first time only, runs its consequences
    /// together: the story choice through the plan's quest graph (offered only while the graph allows it — one option per
    /// decision) and the items into the inventory (offered only when they fit). Which options were already picked is the
    /// module's saved state; the choices themselves are saved with the quest graph. Starting fails, with every reason, when
    /// a line names an item, choice or line the plan does not have.
    /// </summary>
    [AddComponentMenu("Game Design Planner/Planner Dialogue")]
    public sealed class PlannerDialogue : MonoBehaviour, IPlannerService
    {
        [Tooltip("Needed when an option makes a story choice (its quest graph).")]
        public PlannerQuests Quests;
        [Tooltip("Needed when an option gives items.")]
        public PlannerInventory Inventory;
        public List<PlannerDialogueLine> Lines = new List<PlannerDialogueLine>();

        readonly HashSet<string> picked = new HashSet<string>();
        PlannerRuntime runtime;

        public string Id => "dialogue";
        public IReadOnlyList<string> DependsOn => new[] { "interaction" }.Concat(Quests != null ? new[] { "quests" } : Array.Empty<string>()).Concat(Inventory != null ? new[] { "inventory" } : Array.Empty<string>()).ToList();

        IPlannerQuestGraph Graph => Quests != null ? Quests.Graph as IPlannerQuestGraph : null;

        /// <summary>The line shown now, or null when no one is talking.</summary>
        public PlannerDialogueLine Current { get; private set; }
        public bool IsTalking => Current != null;
        public IReadOnlyCollection<string> Picked => picked;

        /// <summary>After any change: a conversation started, an option was picked, or it ended.</summary>
        public event Action Changed;
        /// <summary>Each line shown (also on the event bus as <see cref="PlannerDialogueLineShown"/>).</summary>
        public event Action<PlannerDialogueLine> LineShown;

        public void Initialize(PlannerRuntime runtime)
        {
            var problems = new List<string>();
            var ids = new HashSet<string>(Lines.Select(l => l.LineId));
            foreach (var l in Lines)
            {
                if (!string.IsNullOrEmpty(l.After) && !ids.Contains(l.After)) problems.Add($"the line {l.LineId} answers “{l.After}”, which is not a line");
                if (!string.IsNullOrEmpty(l.ChoiceId) && Graph == null) problems.Add($"the line {l.LineId} makes a choice, but there is no quest graph");
                if (!string.IsNullOrEmpty(l.ChoiceId) && Graph != null && !Graph.KnowsChoice(l.ChoiceId)) problems.Add($"the line {l.LineId} makes “{l.ChoiceId}”, which is not a choice of the plan");
                foreach (var g in l.Give)
                {
                    if (Inventory == null) problems.Add($"the line {l.LineId} gives items, but there is no inventory");
                    else if (Inventory.Def(g.ItemId) == null) problems.Add($"the line {l.LineId} gives “{g.ItemId}”, which the inventory does not know");
                    if (g.Count < 1) problems.Add($"the line {l.LineId} gives an amount below 1");
                }
            }
            if (problems.Count > 0) throw new InvalidOperationException("Dialogue cannot start: " + string.Join("; ", problems.Distinct()) + ".");
            this.runtime = runtime;
        }

        public void Shutdown()
        {
            runtime = null;
            Current = null;
        }

        public PlannerDialogueLine StartLine(string speaker) => Lines.FirstOrDefault(l => l.Speaker == speaker && string.IsNullOrEmpty(l.After));

        /// <summary>Starts the speaker's conversation: false when it has none or the game is not running.</summary>
        public bool Start(string speaker)
        {
            var line = runtime != null ? StartLine(speaker) : null;
            if (line == null) return false;
            Show(line);
            return true;
        }

        public void End()
        {
            if (Current == null) return;
            Current = null;
            Changed?.Invoke();
        }

        /// <summary>The options of the current line, in plan order, with whether they can be picked now.</summary>
        public IReadOnlyList<PlannerDialogueOption> Options =>
            Current == null ? Array.Empty<PlannerDialogueOption>() : Lines.Where(l => l.After == Current.LineId).Select(l => new PlannerDialogueOption(l, Allowed(l, out var why), why)).ToList();

        bool Allowed(PlannerDialogueLine l, out string reason)
        {
            reason = null;
            if (picked.Contains(l.LineId)) return true; // shown again; its consequences do not run again
            if (!string.IsNullOrEmpty(l.ChoiceId))
            {
                if (Graph == null) reason = "no quest graph";
                else if (Graph.HasChosen(l.ChoiceId)) reason = "already decided";
                else if (!Graph.CanChoose(l.ChoiceId)) reason = Graph.IsDecided(l.ChoiceId) ? "already decided" : "not yet";
            }
            if (reason == null && l.Give.Count > 0 && (Inventory == null || !Inventory.CanAddAll(l.Give))) reason = "no room for the items";
            return reason == null;
        }

        /// <summary>Picks an option of the current line: shows it and, the first time, runs its consequences. False (nothing changes) when it cannot be picked now.</summary>
        public bool Pick(string lineId)
        {
            var option = Options.FirstOrDefault(o => o.Line.LineId == lineId);
            if (option.Line == null || !option.Allowed) return false;
            var l = option.Line;
            if (!picked.Contains(l.LineId))
            {
                // The choice and the items together: the room is checked first, the choice is made, then the items are given.
                if (l.Give.Count > 0 && !Inventory.CanAddAll(l.Give)) return false;
                if (!string.IsNullOrEmpty(l.ChoiceId) && !Graph.Choose(l.ChoiceId)) return false;
                if (l.Give.Count > 0) Inventory.TryAddAll(l.Give);
                picked.Add(l.LineId);
                runtime.Events.Publish(new PlannerDialoguePicked(l.LineId, l.ChoiceId));
                foreach (var g in l.Give) runtime.Events.Publish(new PlannerItemAcquired(g.ItemId, Inventory.Def(g.ItemId)?.Key, g.Count, "dialogue:" + l.LineId));
                Quests?.Refresh();
            }
            Show(l);
            return true;
        }

        void Show(PlannerDialogueLine line)
        {
            Current = line;
            runtime?.Events.Publish(new PlannerDialogueLineShown(line.Speaker, line.LineId, line.Text));
            LineShown?.Invoke(line);
            Changed?.Invoke();
        }

        /// <summary>The saved state: the options already picked.</summary>
        public List<string> CaptureState() => Lines.Where(l => picked.Contains(l.LineId)).Select(l => l.LineId).ToList();

        public void CheckState(IEnumerable<string> lineIds)
        {
            var unknown = lineIds.Where(id => Lines.All(l => l.LineId != id)).ToList();
            if (unknown.Count > 0) throw new PlannerStateException($"The save has dialogue lines this plan does not have: {string.Join(", ", unknown)}.");
        }

        public void RestoreState(IEnumerable<string> lineIds)
        {
            var ids = lineIds.ToList();
            CheckState(ids);
            picked.Clear();
            picked.UnionWith(ids);
            Current = null;
            Changed?.Invoke();
        }
    }
}
