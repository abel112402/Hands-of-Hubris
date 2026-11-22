using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;

namespace HoHPlanner.Runtime
{
    /// <summary>An item the inventory knows: its stable planner ID, record key, name and stack size, all from the plan.</summary>
    [Serializable]
    public sealed class PlannerItemDef
    {
        public string ItemId;
        public string Key;
        public string Name;
        [Min(1)] public int Stack = 1;
    }

    /// <summary>Takes items before they count as acquired: a pickup only disappears when the receiver took everything.</summary>
    public interface IPlannerItemReceiver
    {
        bool CanAdd(string itemId, int count);
        bool TryAdd(string itemId, int count);
    }

    /// <summary>The inventory changed (on the runtime's event bus).</summary>
    public readonly struct PlannerInventoryChanged
    {
        public readonly PlannerInventory Inventory;
        public PlannerInventoryChanged(PlannerInventory inventory) => Inventory = inventory;
    }

    /// <summary>
    /// The “inventory” module: <see cref="Slots"/> slots, each holding one item up to its planned stack size. Items are
    /// matched by planner ID (never by name). Adding is all-or-nothing: an unknown item, a count below 1 or not enough
    /// room adds nothing and returns false. Weight is not limited.
    /// </summary>
    [AddComponentMenu("Game Design Planner/Planner Inventory")]
    public sealed class PlannerInventory : MonoBehaviour, IPlannerService, IPlannerItemReceiver
    {
        [Serializable]
        public struct Slot
        {
            public string ItemId;
            public int Count;
            public bool Empty => string.IsNullOrEmpty(ItemId) || Count <= 0;
        }

        [Tooltip("Items & Crafting › Inventory › Inventory slots.")]
        [Min(1)] public int Slots = 1;
        [Tooltip("The plan's items with their stack sizes.")]
        public List<PlannerItemDef> Items = new List<PlannerItemDef>();

        readonly List<Slot> slots = new List<Slot>();
        PlannerRuntime runtime;

        public string Id => "inventory";
        public IReadOnlyList<string> DependsOn => Array.Empty<string>();

        /// <summary>Raised after every change.</summary>
        public event Action Changed;

        /// <summary>The slots, in order; an empty slot has no item.</summary>
        public IReadOnlyList<Slot> Contents
        {
            get
            {
                Fit();
                return slots;
            }
        }

        public void Initialize(PlannerRuntime runtime)
        {
            this.runtime = runtime;
            Fit();
        }

        public void Shutdown() => runtime = null;

        void Fit()
        {
            while (slots.Count < Slots) slots.Add(default);
        }

        public PlannerItemDef Def(string itemId) => string.IsNullOrEmpty(itemId) ? null : Items.FirstOrDefault(i => i.ItemId == itemId);

        public int CountOf(string itemId) => Contents.Where(s => s.ItemId == itemId).Sum(s => s.Count);

        /// <summary>How many of the item still fit (0 for an unknown item).</summary>
        public int RoomFor(string itemId)
        {
            var def = Def(itemId);
            if (def == null || def.Stack < 1) return 0;
            return Contents.Sum(s => s.Empty ? def.Stack : s.ItemId == itemId ? Math.Max(0, def.Stack - s.Count) : 0);
        }

        public bool CanAdd(string itemId, int count) => count >= 1 && RoomFor(itemId) >= count;

        public bool TryAdd(string itemId, int count)
        {
            if (!CanAdd(itemId, count))
            {
                if (Def(itemId) == null) Debug.LogWarning($"[Planner runtime] The inventory does not know the item “{itemId}”: it is not an item of the plan.", this);
                return false;
            }
            var stack = Def(itemId).Stack;
            Fit();
            // Top up the item's slots first, then fill empty ones.
            for (var i = 0; i < slots.Count && count > 0; i++)
                if (slots[i].ItemId == itemId && slots[i].Count < stack) count = Put(i, itemId, count, stack);
            for (var i = 0; i < slots.Count && count > 0; i++)
                if (slots[i].Empty) count = Put(i, itemId, count, stack);
            Notify();
            return true;
        }

        /// <summary>
        /// Checks saved slots against the plan: no more filled slots than <see cref="Slots"/>, only known items, counts from
        /// 1 to the item's stack. Throws <see cref="PlannerStateException"/> naming the problem; changes nothing.
        /// </summary>
        public void Check(IReadOnlyList<Slot> saved)
        {
            var problems = new List<string>();
            for (var i = 0; i < saved.Count; i++)
            {
                var s = saved[i];
                if (s.Empty) continue;
                if (i >= Slots) problems.Add($"slot {i + 1} holds {s.ItemId}, but the plan has {Slots} slots");
                var def = Def(s.ItemId);
                if (def == null) problems.Add($"“{s.ItemId}” is not an item of the plan");
                else if (s.Count < 1 || s.Count > def.Stack) problems.Add($"{s.Count} × {def.Name} does not fit a slot (stack {def.Stack})");
            }
            if (problems.Count > 0) throw new PlannerStateException("The saved inventory does not fit this plan: " + string.Join("; ", problems) + ".");
        }

        /// <summary>Replaces the contents with saved slots (checked first; nothing changes when they do not fit).</summary>
        public void Restore(IReadOnlyList<Slot> saved)
        {
            Check(saved);
            slots.Clear();
            for (var i = 0; i < Slots; i++) slots.Add(i < saved.Count && !saved[i].Empty ? saved[i] : default);
            Notify();
        }

        /// <summary>
        /// Takes <paramref name="take"/> and gives <paramref name="give"/> as one change (crafting): when anything is
        /// missing, unknown or does not fit afterwards, nothing changes and it returns false. One change notice.
        /// </summary>
        public bool TryExchange(IEnumerable<PlannerItemAmount> take, IEnumerable<PlannerItemAmount> give)
        {
            var taking = take?.ToList() ?? new List<PlannerItemAmount>();
            var giving = give?.ToList() ?? new List<PlannerItemAmount>();
            if (taking.Any(a => a.Count < 1 || Def(a.ItemId) == null) || giving.Any(a => a.Count < 1 || Def(a.ItemId) == null)) return false;
            if (taking.GroupBy(a => a.ItemId).Any(g => CountOf(g.Key) < g.Sum(a => a.Count))) return false;
            Fit();
            var saved = slots.ToList();
            foreach (var a in taking)
            {
                var count = a.Count;
                for (var i = slots.Count - 1; i >= 0 && count > 0; i--)
                {
                    if (slots[i].ItemId != a.ItemId) continue;
                    var n = Math.Min(slots[i].Count, count);
                    count -= n;
                    slots[i] = slots[i].Count - n > 0 ? new Slot { ItemId = a.ItemId, Count = slots[i].Count - n } : default;
                }
            }
            foreach (var a in giving)
            {
                if (RoomFor(a.ItemId) < a.Count)
                {
                    slots.Clear();
                    slots.AddRange(saved);
                    return false;
                }
                var stack = Def(a.ItemId).Stack;
                var count = a.Count;
                for (var i = 0; i < slots.Count && count > 0; i++)
                    if (slots[i].ItemId == a.ItemId && slots[i].Count < stack) count = Put(i, a.ItemId, count, stack);
                for (var i = 0; i < slots.Count && count > 0; i++)
                    if (slots[i].Empty) count = Put(i, a.ItemId, count, stack);
            }
            Notify();
            return true;
        }

        /// <summary>Adds every amount or none of them (a quest reward of several items); one change notice.</summary>
        public bool TryAddAll(IEnumerable<PlannerItemAmount> amounts)
        {
            var list = amounts?.ToList() ?? new List<PlannerItemAmount>();
            if (list.Count == 0) return true;
            Fit();
            var saved = slots.ToList();
            foreach (var a in list)
            {
                if (a.Count < 1 || RoomFor(a.ItemId) < a.Count)
                {
                    slots.Clear();
                    slots.AddRange(saved);
                    return false;
                }
                var stack = Def(a.ItemId).Stack;
                var count = a.Count;
                for (var i = 0; i < slots.Count && count > 0; i++)
                    if (slots[i].ItemId == a.ItemId && slots[i].Count < stack) count = Put(i, a.ItemId, count, stack);
                for (var i = 0; i < slots.Count && count > 0; i++)
                    if (slots[i].Empty) count = Put(i, a.ItemId, count, stack);
            }
            Notify();
            return true;
        }

        int Put(int i, string itemId, int count, int stack)
        {
            var have = slots[i].Empty ? 0 : slots[i].Count;
            var n = Math.Min(stack - have, count);
            slots[i] = new Slot { ItemId = itemId, Count = have + n };
            return count - n;
        }

        /// <summary>Takes <paramref name="count"/> of the item, from the last slots first; all or nothing.</summary>
        public bool TryRemove(string itemId, int count)
        {
            if (count < 1 || CountOf(itemId) < count) return false;
            for (var i = slots.Count - 1; i >= 0 && count > 0; i--)
            {
                if (slots[i].ItemId != itemId) continue;
                var n = Math.Min(slots[i].Count, count);
                count -= n;
                slots[i] = slots[i].Count - n > 0 ? new Slot { ItemId = itemId, Count = slots[i].Count - n } : default;
            }
            Notify();
            return true;
        }

        void Notify()
        {
            Changed?.Invoke();
            runtime?.Events.Publish(new PlannerInventoryChanged(this));
        }
    }
}
