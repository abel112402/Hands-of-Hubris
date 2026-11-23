using System.Collections.Generic;
using UnityEngine;

namespace HoHPlanner.Runtime
{
    /// <summary>
    /// A location of the plan laid out in the prototype scene (its level root): the planner location ID and name, and the
    /// ground it covers, from this object's position <see cref="Size"/> metres east (x) and south (−z), as the map lies.
    /// <see cref="At"/> says which location a point is in — for the HUD, quests and tests.
    /// </summary>
    [AddComponentMenu("Game Design Planner/Planner Location")]
    public sealed class PlannerLocation : MonoBehaviour
    {
        public string LocationId;
        public string Name;
        [Tooltip("Metres east (x) and south (−z) of this object's position that the location covers.")]
        public Vector2 Size;

        static readonly List<PlannerLocation> all = new List<PlannerLocation>();
        public static IReadOnlyList<PlannerLocation> All => all;

        void OnEnable()
        {
            if (!all.Contains(this)) all.Add(this);
        }

        void OnDisable() => all.Remove(this);

        public bool Contains(Vector3 p)
        {
            var o = transform.position;
            return p.x >= o.x && p.x <= o.x + Size.x && p.z <= o.z && p.z >= o.z - Size.y;
        }

        /// <summary>The location the point is in, or null.</summary>
        public static PlannerLocation At(Vector3 p)
        {
            foreach (var l in all)
                if (l != null && l.Contains(p))
                    return l;
            return null;
        }

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        static void ClearOnLoad() => all.Clear(); // not “Reset”: that name is a Unity message on MonoBehaviours
    }
}
