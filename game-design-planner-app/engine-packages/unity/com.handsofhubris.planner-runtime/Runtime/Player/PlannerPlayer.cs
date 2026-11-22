using System;
using System.Collections.Generic;
using UnityEngine;

namespace HoHPlanner.Runtime
{
    /// <summary>The plan's player settings (Player Character › Controls and camera), in metres and metres per second.</summary>
    [Serializable]
    public struct PlannerPlayerSettings
    {
        public float MoveSpeed;
        public float CameraDistance;
        public float CameraHeight;

        public PlannerPlayerSettings(float moveSpeed, float cameraDistance, float cameraHeight)
        {
            MoveSpeed = moveSpeed;
            CameraDistance = cameraDistance;
            CameraHeight = cameraHeight;
        }
    }

    /// <summary>Where movement input comes from: the Input System (HoHPlanner.Runtime.InputSystem), a test, or your own code.</summary>
    public interface IPlannerMoveSource
    {
        /// <summary>x = right, y = forward, each −1…1.</summary>
        Vector2 Move { get; }

        bool InteractPressed { get; }
    }

    /// <summary>A player made from the plan's settings: CharacterController, movement and a third-person camera.</summary>
    [AddComponentMenu("Game Design Planner/Planner Player")]
    public sealed class PlannerPlayer : MonoBehaviour
    {
        public PlannerMovement Movement;
        public PlannerThirdPersonCamera FollowCamera;

        /// <summary>Makes the player at <paramref name="at"/> with a capsule body 2 m tall, and its camera.</summary>
        public static PlannerPlayer Create(Vector3 at, PlannerPlayerSettings settings, string name = "Player")
        {
            var go = new GameObject(name);
            go.transform.position = at;
            var cc = go.AddComponent<CharacterController>();
            cc.height = 2f;
            cc.radius = 0.4f;
            cc.center = new Vector3(0f, 1f, 0f);
            var movement = go.AddComponent<PlannerMovement>();
            movement.MoveSpeed = settings.MoveSpeed;

            var cam = new GameObject($"{name} Camera");
            cam.AddComponent<Camera>().tag = "MainCamera";
            var follow = cam.AddComponent<PlannerThirdPersonCamera>();
            follow.Target = go.transform;
            follow.Distance = settings.CameraDistance;
            follow.Height = settings.CameraHeight;
            follow.Snap();
            movement.Camera = follow;

            var player = go.AddComponent<PlannerPlayer>();
            player.Movement = movement;
            player.FollowCamera = follow;
            return player;
        }

        /// <summary>Puts the player at <paramref name="at"/> facing <paramref name="yaw"/> degrees (a loaded game), past the CharacterController.</summary>
        public void Teleport(Vector3 at, float yaw)
        {
            var cc = GetComponent<CharacterController>();
            var was = cc != null && cc.enabled;
            if (cc != null) cc.enabled = false;
            transform.SetPositionAndRotation(at, Quaternion.Euler(0f, yaw, 0f));
            if (cc != null) cc.enabled = was;
            if (FollowCamera != null) FollowCamera.Snap();
        }

        void OnDestroy()
        {
            if (FollowCamera != null) Destroy(FollowCamera.gameObject);
        }
    }
}
