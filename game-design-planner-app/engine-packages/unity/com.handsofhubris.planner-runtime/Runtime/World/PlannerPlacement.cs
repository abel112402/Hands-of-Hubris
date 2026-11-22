using UnityEngine;

namespace HoHPlanner.Runtime
{
    /// <summary>
    /// An object placed from a location map of the plan (the map object's gameplay role): where the player starts, or an
    /// item lying there to pick up, with its planner IDs. The bridge's prototype scene puts one on each placement; the
    /// interaction and inventory modules read it. Map coordinates become metres as x · scale east and y · scale south.
    /// </summary>
    [DisallowMultipleComponent]
    [AddComponentMenu("Game Design Planner/Planner Placement")]
    public sealed class PlannerPlacement : MonoBehaviour
    {
        public const string PlayerRole = "player";
        public const string ItemRole = "item";

        [Tooltip("The map object's gameplay role: player (start), item (pickup), or another spawn role.")]
        public string Role;
        [Tooltip("The planner ID of the map object (stable; never changes when it is renamed).")]
        public string ObjectId;
        [Tooltip("The planner ID of the location whose map it is on.")]
        public string LocationId;
        [Tooltip("For an item: the planner ID of the item.")]
        public string ItemId;
        [Tooltip("For an item: the record key of the item (e.g. item.brass_key), empty when it has no data record.")]
        public string ItemKey;
        [Min(1)] public int Count = 1;

        public bool IsItem => Role == ItemRole;
        public bool IsPlayerStart => Role == PlayerRole;
    }
}
