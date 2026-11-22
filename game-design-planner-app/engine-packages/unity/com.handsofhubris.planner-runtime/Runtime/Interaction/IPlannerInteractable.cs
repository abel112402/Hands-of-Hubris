using System.Collections.Generic;
using UnityEngine;

namespace HoHPlanner.Runtime
{
    /// <summary>
    /// Something the player can use with the Interact action: an item pickup, later a door, an NPC… Implement it on a
    /// MonoBehaviour and add it to <see cref="PlannerInteractables"/> while it is enabled; <see cref="PlannerInteractor"/>
    /// picks the nearest one in range that <see cref="CanInteract"/>.
    /// </summary>
    public interface IPlannerInteractable
    {
        /// <summary>Where the target is; the interaction range is measured to it on the ground plane.</summary>
        Vector3 Position { get; }

        /// <summary>What interacting does, for the on-screen prompt (“Pick up Brass Key”).</summary>
        string Prompt { get; }

        /// <summary>Whether it can be used now; a used-up or invalid target says no and is never chosen.</summary>
        bool CanInteract(PlannerInteractor who);

        /// <summary>Does it, once. Called only when <see cref="CanInteract"/> said yes this frame.</summary>
        void Interact(PlannerInteractor who);
    }

    /// <summary>The enabled interaction targets of the running game.</summary>
    public static class PlannerInteractables
    {
        static readonly List<IPlannerInteractable> all = new List<IPlannerInteractable>();

        public static IReadOnlyList<IPlannerInteractable> All => all;

        public static void Add(IPlannerInteractable target)
        {
            if (target != null && !all.Contains(target)) all.Add(target);
        }

        public static void Remove(IPlannerInteractable target) => all.Remove(target);

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        static void Reset() => all.Clear();
    }

    /// <summary>The player got items (gameplay event itemAcquired): from a pickup, a reward, crafting…</summary>
    public readonly struct PlannerItemAcquired
    {
        /// <summary>The planner ID of the item (stable).</summary>
        public readonly string ItemId;
        /// <summary>The item's record key (e.g. item.brass_key); empty when it has no data record.</summary>
        public readonly string ItemKey;
        public readonly int Count;
        /// <summary>Where it came from: the planner ID of the map object, quest…</summary>
        public readonly string Source;

        public PlannerItemAcquired(string itemId, string itemKey, int count, string source)
        {
            ItemId = itemId;
            ItemKey = itemKey;
            Count = count;
            Source = source;
        }
    }
}
