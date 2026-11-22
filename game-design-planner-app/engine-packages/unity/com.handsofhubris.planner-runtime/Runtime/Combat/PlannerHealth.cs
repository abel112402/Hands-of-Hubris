using System;
using UnityEngine;

namespace HoHPlanner.Runtime
{
    /// <summary>Health of the player or an enemy: <see cref="Max"/> from the plan, never below 0; at 0 it is dead.</summary>
    [AddComponentMenu("Game Design Planner/Planner Health")]
    public sealed class PlannerHealth : MonoBehaviour
    {
        [Min(0.01f)] public float Max = 100f;
        [SerializeField] float current = -1f;

        /// <summary>Current health (Max until the first hit).</summary>
        public float Current
        {
            get => current < 0f ? Max : current;
            private set => current = value;
        }

        public bool IsDead => Current <= 0f;

        /// <summary>After any change: the new value.</summary>
        public event Action<PlannerHealth> Changed;
        /// <summary>Once, when it reaches 0.</summary>
        public event Action<PlannerHealth> Died;

        /// <summary>Takes <paramref name="amount"/> (≥ 0); returns what was taken. Nothing happens to the dead.</summary>
        public float Hit(float amount)
        {
            if (IsDead || amount <= 0f || float.IsNaN(amount)) return 0f;
            var before = Current;
            Current = Mathf.Max(0f, before - amount);
            Changed?.Invoke(this);
            if (Current <= 0f) Died?.Invoke(this);
            return before - Current;
        }

        /// <summary>Back to full health.</summary>
        public void Restore()
        {
            Current = Max;
            Changed?.Invoke(this);
        }

        /// <summary>Sets a saved value (clamped to 0…Max); no Died event.</summary>
        public void Set(float value)
        {
            Current = Mathf.Clamp(value, 0f, Max);
            Changed?.Invoke(this);
        }
    }
}
