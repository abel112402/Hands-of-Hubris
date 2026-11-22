using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;

namespace HoHPlanner.Runtime
{
    /// <summary>A recipe of the plan as a typed rule: item inputs, one output, and the quests that unlock it.</summary>
    [Serializable]
    public sealed class PlannerRecipe
    {
        public string RecipeId;
        public string Key;
        public string Name;
        public List<PlannerItemAmount> Inputs = new List<PlannerItemAmount>();
        public PlannerItemAmount Output;
        [Tooltip("Planner IDs of the quests that must all be done first.")]
        public List<string> UnlockQuests = new List<string>();
    }

    /// <summary>Something was crafted (on the runtime's event bus); a <see cref="PlannerItemAcquired"/> for the output follows.</summary>
    public readonly struct PlannerItemCrafted
    {
        public readonly string RecipeId;
        public readonly PlannerItemAmount Output;

        public PlannerItemCrafted(string recipeId, PlannerItemAmount output)
        {
            RecipeId = recipeId;
            Output = output;
        }
    }

    /// <summary>
    /// The “crafting” module (after “inventory”): crafts the plan's recipes in the inventory, all or nothing — the inputs
    /// are taken and the output given in one change (<see cref="PlannerInventory.TryExchange"/>), or nothing changes when
    /// an input is missing, the recipe is locked or the output does not fit. A recipe is unlocked when every quest under
    /// “Unlocked by” is done. Its only state is the inventory's, so a saved game is consistent by itself. Starting fails,
    /// with every reason, when a recipe names an item the inventory or a quest the quest graph does not know.
    /// </summary>
    [AddComponentMenu("Game Design Planner/Planner Crafting")]
    public sealed class PlannerCrafting : MonoBehaviour, IPlannerService
    {
        public PlannerInventory Inventory;
        [Tooltip("Needed when a recipe is unlocked by quests.")]
        public PlannerQuests Quests;
        public List<PlannerRecipe> Recipes = new List<PlannerRecipe>();

        PlannerRuntime runtime;

        public string Id => "crafting";
        public IReadOnlyList<string> DependsOn => Quests != null ? new[] { "inventory", "quests" } : new[] { "inventory" };

        /// <summary>Raised after each craft.</summary>
        public event Action<PlannerRecipe> Crafted;

        public void Initialize(PlannerRuntime runtime)
        {
            var problems = new List<string>();
            if (Inventory == null) problems.Add("no inventory to craft in");
            var graph = Quests != null ? Quests.Graph as IPlannerQuestGraph : null;
            foreach (var r in Recipes)
            {
                foreach (var a in r.Inputs.Append(r.Output))
                {
                    if (Inventory != null && Inventory.Def(a.ItemId) == null) problems.Add($"{r.Name} names the item “{a.ItemId}”, which the inventory does not know");
                    if (a.Count < 1) problems.Add($"{r.Name}: an amount below 1 for “{a.ItemId}”");
                }
                if (r.Inputs.Count == 0) problems.Add($"{r.Name} has no inputs");
                foreach (var q in r.UnlockQuests)
                    if (graph == null) problems.Add($"{r.Name} is unlocked by a quest, but there is no quest module");
                    else if (!graph.Knows(q)) problems.Add($"{r.Name} is unlocked by “{q}”, which is not in the plan's quest graph");
            }
            if (problems.Count > 0) throw new InvalidOperationException("Crafting cannot start: " + string.Join("; ", problems.Distinct()) + ".");
            this.runtime = runtime;
        }

        public void Shutdown() => runtime = null;

        public PlannerRecipe Recipe(string recipeId) => Recipes.FirstOrDefault(r => r.RecipeId == recipeId);

        string NameOf(string itemId) => Inventory.Def(itemId)?.Name ?? itemId;

        public bool IsUnlocked(PlannerRecipe r) => r.UnlockQuests.All(q => Quests != null && Quests.IsDone(q));

        /// <summary>Whether the recipe can be crafted now; when not, why (for the panel).</summary>
        public bool CanCraft(string recipeId, out string reason)
        {
            var r = Recipe(recipeId);
            if (runtime == null) reason = "the game is not running";
            else if (r == null) reason = $"“{recipeId}” is not a recipe of the plan";
            else if (!IsUnlocked(r)) reason = "locked: finish " + string.Join(", ", r.UnlockQuests.Where(q => !Quests.IsDone(q)).Select(q => Quests.Rule(q)?.Name ?? q));
            else
            {
                var missing = r.Inputs.GroupBy(a => a.ItemId).Select(g => (item: g.Key, need: g.Sum(a => a.Count))).Where(x => Inventory.CountOf(x.item) < x.need).ToList();
                reason = missing.Count > 0 ? "needs " + string.Join(", ", missing.Select(x => $"{x.need} × {NameOf(x.item)} (have {Inventory.CountOf(x.item)})")) : null;
                if (reason == null && !Fits(r)) reason = $"no room for {NameOf(r.Output.ItemId)}";
            }
            return reason == null;
        }

        /// <summary>Whether the output fits once the inputs are gone (checked on a copy of the slots).</summary>
        bool Fits(PlannerRecipe r)
        {
            var copy = Inventory.Contents.ToList();
            foreach (var a in r.Inputs)
            {
                var count = a.Count;
                for (var i = copy.Count - 1; i >= 0 && count > 0; i--)
                {
                    if (copy[i].ItemId != a.ItemId) continue;
                    var n = Math.Min(copy[i].Count, count);
                    count -= n;
                    copy[i] = copy[i].Count - n > 0 ? new PlannerInventory.Slot { ItemId = a.ItemId, Count = copy[i].Count - n } : default;
                }
            }
            var stack = Inventory.Def(r.Output.ItemId)?.Stack ?? 0;
            var room = copy.Sum(s => s.Empty ? stack : s.ItemId == r.Output.ItemId ? Math.Max(0, stack - s.Count) : 0);
            return room >= r.Output.Count;
        }

        /// <summary>Crafts the recipe once: true when it was crafted; false (and nothing changed) otherwise.</summary>
        public bool TryCraft(string recipeId)
        {
            if (!CanCraft(recipeId, out _)) return false;
            var r = Recipe(recipeId);
            if (!Inventory.TryExchange(r.Inputs, new[] { r.Output })) return false;
            runtime.Events.Publish(new PlannerItemCrafted(r.RecipeId, r.Output));
            runtime.Events.Publish(new PlannerItemAcquired(r.Output.ItemId, Inventory.Def(r.Output.ItemId)?.Key, r.Output.Count, "recipe:" + r.RecipeId));
            Crafted?.Invoke(r);
            return true;
        }
    }

    /// <summary>Menu input beside movement: the planned control whose Runtime action is Open crafting.</summary>
    public interface IPlannerMenuSource
    {
        bool CraftingPressed { get; }
    }
}
