using System;
using System.Collections.Generic;
using UnityEngine;

namespace HoHPlanner.Runtime
{
    /// <summary>
    /// The “movement” module: walks a CharacterController on the ground plane at the planned speed, relative to the
    /// third-person camera's yaw (forward = away from the camera), turns the body to where it walks, and keeps it on the
    /// ground with gravity. Input comes from an <see cref="IPlannerMoveSource"/> on the same object.
    /// </summary>
    [RequireComponent(typeof(CharacterController))]
    [AddComponentMenu("Game Design Planner/Planner Movement")]
    public sealed class PlannerMovement : MonoBehaviour, IPlannerService
    {
        public float MoveSpeed = 4f;
        public float Gravity = -20f;
        [Tooltip("Degrees per second the body turns towards where it walks.")]
        public float TurnSpeed = 720f;
        [Tooltip("Movement is relative to this yaw (the camera's); none = world axes.")]
        public PlannerThirdPersonCamera Camera;

        public IPlannerMoveSource Source { get; set; }
        public string Id => "movement";
        public IReadOnlyList<string> DependsOn => Array.Empty<string>();

        CharacterController controller;
        float fall;

        public void Initialize(PlannerRuntime runtime) { }
        public void Shutdown() { }

        void Awake() => controller = GetComponent<CharacterController>();

        void Update()
        {
            if (Source == null) Source = GetComponent<IPlannerMoveSource>();
            var input = Source?.Move ?? Vector2.zero;
            if (input.sqrMagnitude > 1f) input.Normalize();
            var yaw = Quaternion.Euler(0f, Camera != null ? Camera.Yaw : 0f, 0f);
            var dir = yaw * new Vector3(input.x, 0f, input.y);
            fall = controller.isGrounded ? -1f : fall + Gravity * Time.deltaTime;
            controller.Move((dir * MoveSpeed + Vector3.up * fall) * Time.deltaTime);
            if (dir.sqrMagnitude > 0.0001f)
                transform.rotation = Quaternion.RotateTowards(transform.rotation, Quaternion.LookRotation(dir), TurnSpeed * Time.deltaTime);
        }
    }
}
