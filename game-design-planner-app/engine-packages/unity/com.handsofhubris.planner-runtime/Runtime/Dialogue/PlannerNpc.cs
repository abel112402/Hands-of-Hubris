using UnityEngine;

namespace HoHPlanner.Runtime
{
    /// <summary>
    /// An NPC placed from the plan (a map object with spawn role “npc” and a character): interacting starts its
    /// conversation. For custom behaviour, write your own <see cref="IPlannerInteractable"/>, or listen to
    /// <see cref="PlannerDialogueLineShown"/> for animation and voice.
    /// </summary>
    [AddComponentMenu("Game Design Planner/Planner NPC")]
    public sealed class PlannerNpc : MonoBehaviour, IPlannerInteractable
    {
        public PlannerDialogue Dialogue;
        [Tooltip("The character's planner ID (Story & Quests › Characters).")]
        public string CharacterId;
        public string Name;

        public Vector3 Position => transform.position;
        public string Prompt => $"Talk to {(string.IsNullOrEmpty(Name) ? CharacterId : Name)}";

        void OnEnable() => PlannerInteractables.Add(this);
        void OnDisable() => PlannerInteractables.Remove(this);

        public bool CanInteract(PlannerInteractor who) => Dialogue != null && !Dialogue.IsTalking && Dialogue.StartLine(CharacterId) != null;

        public void Interact(PlannerInteractor who)
        {
            if (CanInteract(who)) Dialogue.Start(CharacterId);
        }
    }
}
