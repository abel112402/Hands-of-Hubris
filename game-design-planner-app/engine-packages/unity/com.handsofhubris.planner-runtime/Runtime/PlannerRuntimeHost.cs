using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;

namespace HoHPlanner.Runtime
{
    /// <summary>
    /// Runs a <see cref="PlannerRuntime"/> in a scene: on Start it registers every service component on this object
    /// and its children (components implementing <see cref="IPlannerService"/>), starts them, and stops them when the
    /// object is destroyed or the application quits. A failure is logged as an error with every reason, and the
    /// host stays Failed instead of running half the game.
    /// </summary>
    [DisallowMultipleComponent]
    [AddComponentMenu("Game Design Planner/Planner Runtime Host")]
    public sealed class PlannerRuntimeHost : MonoBehaviour
    {
        [Tooltip("Service ids the plan needs (its chosen systems). Starting fails with a clear error when one is missing.")]
        [SerializeField] List<string> required = new List<string>();

        [Tooltip("Log a warning for each missing part of the URP + Input System profile when the runtime starts.")]
        [SerializeField] bool checkEnvironment = true;

        public PlannerRuntime Runtime { get; private set; }

        /// <summary>Raised after the runtime started (or failed: check <see cref="PlannerRuntime.State"/>).</summary>
        public event Action<PlannerRuntime> Started;

        public List<string> Required => required;

        void Start() => StartRuntime();

        /// <summary>Starts the runtime now (Start calls it; tests and bootstrap code may call it earlier). Does nothing when already started.</summary>
        public void StartRuntime()
        {
            if (Runtime != null) return;
            Runtime = new PlannerRuntime();
            foreach (var s in GetComponentsInChildren<MonoBehaviour>(true).OfType<IPlannerService>()) Runtime.Register(s);
            if (checkEnvironment)
                foreach (var p in PlannerEnvironment.ProblemsForUrpInputProfile()) Debug.LogWarning($"[Planner runtime] {p}", this);
            try
            {
                Runtime.Start(required);
            }
            catch (PlannerRuntimeException e)
            {
                Debug.LogError($"[Planner runtime] {e.Message}", this);
            }
            Started?.Invoke(Runtime);
        }

        void OnDestroy() => Runtime?.Stop();

        void OnApplicationQuit() => Runtime?.Stop();
    }
}
