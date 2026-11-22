using UnityEngine;
using UnityEngine.InputSystem;

namespace HoHPlanner.Runtime
{
    /// <summary>
    /// Movement input from the plan's Input System asset (the generated .inputactions): the map's Move action (a 2D vector
    /// from the planned keys) and Interact. Compiles only when the Input System package is installed.
    /// </summary>
    [AddComponentMenu("Game Design Planner/Planner Input System Source")]
    public sealed class PlannerInputSystemSource : MonoBehaviour, IPlannerMoveSource, IPlannerMenuSource
    {
        public InputActionAsset Actions;
        public string Map = "Prototype";
        public string MoveAction = "Move";
        public string InteractAction = "Interact";
        public string CraftingAction = "Crafting";

        InputAction move;
        InputAction interact;
        InputAction crafting;

        public Vector2 Move => move != null ? move.ReadValue<Vector2>() : Vector2.zero;
        public bool InteractPressed => interact != null && interact.WasPressedThisFrame();
        /// <summary>The map's Crafting action (only when the plan has a control whose Runtime action is Open crafting).</summary>
        public bool CraftingPressed => crafting != null && crafting.WasPressedThisFrame();

        /// <summary>Adds the source to <paramref name="player"/>, reading <paramref name="map"/> of <paramref name="actions"/>.</summary>
        public static PlannerInputSystemSource Attach(GameObject player, InputActionAsset actions, string map)
        {
            var s = player.AddComponent<PlannerInputSystemSource>();
            s.Actions = actions;
            s.Map = map;
            s.Bind();
            return s;
        }

        void OnEnable() => Bind();

        void OnDisable() => Actions?.FindActionMap(Map)?.Disable();

        void Bind()
        {
            if (Actions == null) return;
            var m = Actions.FindActionMap(Map);
            if (m == null)
            {
                Debug.LogError($"[Planner runtime] The input asset {Actions.name} has no action map “{Map}”. Export the plan again with player movement chosen.", this);
                return;
            }
            move = m.FindAction(MoveAction);
            interact = m.FindAction(InteractAction);
            crafting = m.FindAction(CraftingAction);
            m.Enable();
        }
    }
}
