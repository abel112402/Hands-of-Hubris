using UnityEngine;

namespace HoHPlanner.Runtime
{
    /// <summary>The player went through a passage from one location to another (on the runtime's event bus).</summary>
    public readonly struct PlannerTravelled
    {
        public readonly string PassageId;
        public readonly string From;
        public readonly string To;

        public PlannerTravelled(string passageId, string from, string to)
        {
            PassageId = passageId;
            From = from;
            To = to;
        }
    }

    /// <summary>
    /// A passage of the plan (a map object that opens another location of the prototype, such as a door or stairs):
    /// interacting moves the player to <see cref="Arrival"/>, at the other location's way back, keeping the facing.
    /// The way back is its own passage there.
    /// </summary>
    [AddComponentMenu("Game Design Planner/Planner Passage")]
    public sealed class PlannerPassage : MonoBehaviour, IPlannerInteractable
    {
        [Tooltip("The map object's planner ID.")]
        public string PassageId;
        public string FromLocation;
        public string ToLocation;
        public string ToName;
        [Tooltip("Where the player arrives (on walkable ground next to the way back).")]
        public Transform Arrival;

        public Vector3 Position => transform.position;
        public string Prompt => $"Go to {(string.IsNullOrEmpty(ToName) ? ToLocation : ToName)}";

        void OnEnable() => PlannerInteractables.Add(this);
        void OnDisable() => PlannerInteractables.Remove(this);

        public bool CanInteract(PlannerInteractor who) => Arrival != null && who != null && who.Player != null && who.Player.GetComponent<PlannerPlayer>() != null;

        public void Interact(PlannerInteractor who)
        {
            if (!CanInteract(who)) return;
            var player = who.Player.GetComponent<PlannerPlayer>();
            player.Teleport(Arrival.position + new Vector3(0f, 0.05f, 0f), player.transform.eulerAngles.y);
            who.Runtime?.Events.Publish(new PlannerTravelled(PassageId, FromLocation, ToLocation));
        }
    }
}
