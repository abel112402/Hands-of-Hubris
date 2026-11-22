using UnityEngine;

namespace HoHPlanner.Runtime
{
    /// <summary>
    /// An item lying on the map (its <see cref="PlannerPlacement"/>: item ID, record key, count from the plan). Interacting
    /// gives the item once — <see cref="PlannerItemAcquired"/> on the runtime's event bus — and the pickup disappears.
    /// A placement without an item or with a count below 1 is not a target and gives nothing. With an inventory (an
    /// <see cref="IPlannerItemReceiver"/> service), it is taken only when everything fits; otherwise it stays, and its
    /// prompt says the inventory is full.
    /// </summary>
    [RequireComponent(typeof(PlannerPlacement))]
    [AddComponentMenu("Game Design Planner/Planner Pickup")]
    public sealed class PlannerPickup : MonoBehaviour, IPlannerInteractable
    {
        [Tooltip("The item's name in the prompt (from the plan); empty = its record key.")]
        public string DisplayName;

        PlannerPlacement placement;
        PlannerInteractor lastAsked;

        public PlannerPlacement Placement => placement != null ? placement : placement = GetComponent<PlannerPlacement>();
        /// <summary>Already picked up.</summary>
        public bool Taken { get; private set; }
        public bool IsValid => Placement != null && Placement.IsItem && !string.IsNullOrEmpty(Placement.ItemId) && Placement.Count >= 1;

        public Vector3 Position => transform.position;

        public string Prompt
        {
            get
            {
                var name = !string.IsNullOrEmpty(DisplayName) ? DisplayName : !string.IsNullOrEmpty(Placement.ItemKey) ? Placement.ItemKey : Placement.ItemId;
                var label = name + (Placement.Count > 1 ? $" ×{Placement.Count}" : "");
                var receiver = Receiver(lastAsked);
                return receiver != null && !receiver.CanAdd(Placement.ItemId, Placement.Count) ? $"Inventory full: {label}" : $"Pick up {label}";
            }
        }

        void OnEnable()
        {
            if (!IsValid) Debug.LogWarning($"[Planner runtime] {name}: this pickup has no item or a count below 1, so it gives nothing. Fix the map object in the plan and build the prototype scene again.", this);
            PlannerInteractables.Add(this);
        }

        void OnDisable() => PlannerInteractables.Remove(this);

        /// <summary>Taken or lying there again, as a loaded game says; a taken pickup is hidden.</summary>
        public void SetTaken(bool taken)
        {
            Taken = taken;
            gameObject.SetActive(!taken);
        }

        static IPlannerItemReceiver Receiver(PlannerInteractor who) => who != null && who.Runtime != null ? who.Runtime.Get<IPlannerItemReceiver>() : null;

        public bool CanInteract(PlannerInteractor who)
        {
            lastAsked = who;
            return !Taken && IsValid && isActiveAndEnabled;
        }

        public void Interact(PlannerInteractor who)
        {
            if (!CanInteract(who) || who == null || who.Runtime == null) return;
            var receiver = Receiver(who);
            if (receiver != null && !receiver.TryAdd(Placement.ItemId, Placement.Count)) return;
            Taken = true;
            who.Runtime.Events.Publish(new PlannerItemAcquired(Placement.ItemId, Placement.ItemKey, Placement.Count, Placement.ObjectId));
            gameObject.SetActive(false);
        }
    }
}
