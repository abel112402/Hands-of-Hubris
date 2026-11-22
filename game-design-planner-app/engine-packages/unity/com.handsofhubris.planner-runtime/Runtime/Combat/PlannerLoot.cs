using System.Collections.Generic;
using System.Linq;
using UnityEngine;

namespace HoHPlanner.Runtime
{
    /// <summary>
    /// The loot a defeated enemy holds (the items its loot tables always drop): interacting takes all of it into the
    /// inventory at once, or nothing when it does not fit (the prompt says so).
    /// </summary>
    [AddComponentMenu("Game Design Planner/Planner Loot")]
    public sealed class PlannerLoot : MonoBehaviour, IPlannerInteractable
    {
        public PlannerInventory Inventory;
        public List<PlannerItemAmount> Items = new List<PlannerItemAmount>();
        public bool Looted { get; private set; }

        public Vector3 Position => transform.position;

        public string Prompt
        {
            get
            {
                var what = string.Join(", ", Items.Select(i => $"{Inventory?.Def(i.ItemId)?.Name ?? i.ItemId}{(i.Count > 1 ? $" ×{i.Count}" : "")}"));
                return Inventory != null && !Inventory.CanAddAll(Items) ? $"Inventory full: {what}" : $"Take {what}";
            }
        }

        void OnEnable() => PlannerInteractables.Add(this);
        void OnDisable() => PlannerInteractables.Remove(this);

        public bool CanInteract(PlannerInteractor who) => enabled && !Looted && Items.Count > 0;

        public void Interact(PlannerInteractor who)
        {
            if (!CanInteract(who) || Inventory == null || who?.Runtime == null) return;
            if (!Inventory.TryAddAll(Items)) return;
            Looted = true;
            foreach (var i in Items) who.Runtime.Events.Publish(new PlannerItemAcquired(i.ItemId, Inventory.Def(i.ItemId)?.Key, i.Count, "loot:" + (GetComponent<PlannerPlacement>()?.ObjectId ?? name)));
            enabled = false;
            gameObject.SetActive(false);
        }

        public void SetLooted(bool looted) => Looted = looted;
    }
}
