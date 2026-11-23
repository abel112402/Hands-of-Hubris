using System.Collections.Generic;
using UnityEngine;

namespace HoHPlanner.Runtime
{
    /// <summary>
    /// A merchant of the plan placed on a map (spawn role “merchant”): interacting opens its trade panel in
    /// <see cref="PlannerTrade"/>. It sells <see cref="Sells"/> and buys <see cref="Buys"/> at the planned prices, and pays
    /// for what it buys from <see cref="Gold"/> (−1: no limit), which grows when it sells.
    /// </summary>
    [AddComponentMenu("Game Design Planner/Planner Merchant")]
    public sealed class PlannerMerchant : MonoBehaviour, IPlannerInteractable
    {
        public PlannerTrade Trade;
        [Tooltip("The merchant's planner ID (Trade & Economy › Merchants).")]
        public string MerchantId;
        public string Name;
        public List<PlannerPrice> Sells = new List<PlannerPrice>();
        public List<PlannerPrice> Buys = new List<PlannerPrice>();
        [Tooltip("Money for buying from the player at the start; −1: no limit.")]
        public int StartGold = -1;

        int gold = int.MinValue;
        /// <summary>What it can still pay; −1: no limit.</summary>
        public int Gold
        {
            get => gold == int.MinValue ? StartGold : gold;
            set => gold = StartGold < 0 ? -1 : Mathf.Max(0, value);
        }

        public Vector3 Position => transform.position;
        public string Prompt => $"Trade with {(string.IsNullOrEmpty(Name) ? MerchantId : Name)}";

        void OnEnable() => PlannerInteractables.Add(this);
        void OnDisable() => PlannerInteractables.Remove(this);

        public bool CanInteract(PlannerInteractor who) => Trade != null && Trade.Open == null;

        public void Interact(PlannerInteractor who)
        {
            if (CanInteract(who)) Trade.OpenPanel(this);
        }
    }
}
