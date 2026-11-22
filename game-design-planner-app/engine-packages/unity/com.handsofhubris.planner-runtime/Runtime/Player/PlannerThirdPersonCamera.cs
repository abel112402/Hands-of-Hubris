using UnityEngine;

namespace HoHPlanner.Runtime
{
    /// <summary>
    /// Third-person follow camera: stays <see cref="Distance"/> metres behind the target along a fixed <see cref="Yaw"/>,
    /// <see cref="Height"/> metres above its feet, and looks at its chest. A fixed yaw keeps camera-relative movement
    /// steady without mouse look (mouse look is a later module).
    /// </summary>
    [AddComponentMenu("Game Design Planner/Planner Third-Person Camera")]
    public sealed class PlannerThirdPersonCamera : MonoBehaviour
    {
        public Transform Target;
        public float Distance = 5f;
        public float Height = 2f;
        public float Yaw;
        [Tooltip("Height of the point the camera looks at, above the target's feet.")]
        public float LookHeight = 1.2f;

        void LateUpdate() => Snap();

        /// <summary>Puts the camera in place now (LateUpdate does it every frame).</summary>
        public void Snap()
        {
            if (Target == null) return;
            var back = Quaternion.Euler(0f, Yaw, 0f) * Vector3.back;
            transform.position = Target.position + back * Distance + Vector3.up * Height;
            transform.LookAt(Target.position + Vector3.up * LookHeight);
        }
    }
}
