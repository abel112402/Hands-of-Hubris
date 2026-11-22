using System;
using System.Collections.Generic;
using UnityEngine;

namespace HoHPlanner.Runtime
{
    /// <summary>
    /// The “interaction” module: each frame it targets the nearest <see cref="IPlannerInteractable"/> within
    /// <see cref="Range"/> metres of the player (on the ground plane) that can be used, and uses it when the Interact
    /// action is pressed — once per press. It acts only while its runtime runs, so what an interaction gives always
    /// reaches the runtime's event bus (<see cref="PlannerItemAcquired"/>).
    /// </summary>
    [AddComponentMenu("Game Design Planner/Planner Interactor")]
    public sealed class PlannerInteractor : MonoBehaviour, IPlannerService
    {
        [Tooltip("The player; its IPlannerMoveSource gives the Interact action. None = this object.")]
        public Transform Player;
        [Tooltip("Metres from the player (Player Character › Interaction range).")]
        [Min(0.1f)] public float Range = 2f;

        public IPlannerMoveSource Source { get; set; }
        public PlannerRuntime Runtime { get; private set; }
        /// <summary>The target the next Interact uses, or null.</summary>
        public IPlannerInteractable Current { get; private set; }

        /// <summary>The target changed (null: nothing in range) — for prompts and highlights.</summary>
        public event Action<IPlannerInteractable> TargetChanged;

        public string Id => "interaction";
        public IReadOnlyList<string> DependsOn => new[] { "movement" };

        public void Initialize(PlannerRuntime runtime) => Runtime = runtime;

        public void Shutdown()
        {
            Runtime = null;
            SetCurrent(null);
        }

        Transform Body => Player != null ? Player : transform;
        bool Running => Runtime != null && Runtime.State == PlannerRuntimeState.Running;

        void Update()
        {
            if (Source == null) Source = Body.GetComponent<IPlannerMoveSource>();
            Refresh();
            if (Source != null && Source.InteractPressed) TryInteract();
        }

        /// <summary>Picks the nearest usable target in range (none while the runtime is not running).</summary>
        public void Refresh()
        {
            IPlannerInteractable best = null;
            var bestDistance = float.MaxValue;
            if (Running)
            {
                var at = Body.position;
                foreach (var t in PlannerInteractables.All)
                {
                    var d = Vector2.Distance(new Vector2(at.x, at.z), new Vector2(t.Position.x, t.Position.z));
                    if (d <= Range && d < bestDistance && t.CanInteract(this))
                    {
                        best = t;
                        bestDistance = d;
                    }
                }
            }
            SetCurrent(best);
        }

        /// <summary>Uses the current target, as the Interact action does. False when there is none in range.</summary>
        public bool TryInteract()
        {
            Refresh();
            var target = Current;
            if (target == null) return false;
            target.Interact(this);
            Refresh();
            return true;
        }

        void SetCurrent(IPlannerInteractable target)
        {
            if (ReferenceEquals(target, Current)) return;
            Current = target;
            TargetChanged?.Invoke(target);
        }
    }
}
