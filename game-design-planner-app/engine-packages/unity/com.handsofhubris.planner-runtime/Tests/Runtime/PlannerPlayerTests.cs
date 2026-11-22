using System.Collections;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.TestTools;

namespace HoHPlanner.Runtime.Tests
{
    /// <summary>PlayMode: the movement module and the third-person camera, with input from a stand-in source.</summary>
    public class PlannerPlayerTests
    {
        public class StickSource : MonoBehaviour, IPlannerMoveSource
        {
            public Vector2 Stick;
            public Vector2 Move => Stick;
            public bool InteractPressed => false;
        }

        GameObject ground;
        PlannerPlayer player;

        [SetUp]
        public void SetUp()
        {
            ground = GameObject.CreatePrimitive(PrimitiveType.Plane);
            ground.transform.localScale = new Vector3(20f, 1f, 20f);
            player = PlannerPlayer.Create(new Vector3(0f, 0.1f, 0f), new PlannerPlayerSettings(4.5f, 4f, 2f));
        }

        [TearDown]
        public void TearDown()
        {
            Object.Destroy(player.gameObject);
            Object.Destroy(ground);
        }

        static IEnumerator Frames(int n)
        {
            for (var i = 0; i < n; i++) yield return null;
        }

        [UnityTest]
        public IEnumerator StandsStillWithoutInputAndWalksAwayFromTheCameraWhenPushedForward()
        {
            var source = player.gameObject.AddComponent<StickSource>();
            yield return Frames(10);
            var start = player.transform.position;
            Assert.Less(Vector3.Distance(new Vector3(start.x, 0f, start.z), Vector3.zero), 0.01f, "No input: no walking.");

            source.Stick = Vector2.up;
            var t0 = Time.time;
            yield return new WaitForSeconds(0.3f);
            var walked = player.transform.position - start;
            Assert.Greater(walked.z, 0.3f, "Forward is away from the camera (+Z at yaw 0).");
            Assert.Less(Mathf.Abs(walked.x), 0.05f);
            Assert.LessOrEqual(new Vector2(walked.x, walked.z).magnitude, 4.5f * (Time.time - t0) + 0.1f, "Never faster than the planned speed.");
            Assert.Greater(Vector3.Dot(player.transform.forward, Vector3.forward), 0.9f, "The body turns to where it walks.");
        }

        [UnityTest]
        public IEnumerator KeepsThePlannedSpeedOnADiagonal()
        {
            var source = player.gameObject.AddComponent<StickSource>();
            source.Stick = new Vector2(1f, 1f);
            yield return Frames(5);
            var start = player.transform.position;
            var t0 = Time.time;
            yield return new WaitForSeconds(0.3f);
            var walked = player.transform.position - start;
            Assert.LessOrEqual(new Vector2(walked.x, walked.z).magnitude, 4.5f * (Time.time - t0) + 0.1f);
            Assert.AreEqual(walked.x, walked.z, 0.05f);
        }

        [UnityTest]
        public IEnumerator TheCameraFollowsBehindAndAboveAtThePlannedDistance()
        {
            var source = player.gameObject.AddComponent<StickSource>();
            source.Stick = Vector2.up;
            yield return new WaitForSeconds(0.3f);
            var cam = player.FollowCamera.transform;
            // A coroutine resumes before LateUpdate, so the camera may be one frame behind the walking player.
            var flat = new Vector2(player.transform.position.x - cam.position.x, player.transform.position.z - cam.position.z);
            Assert.AreEqual(4f, flat.magnitude, 0.2f);
            Assert.AreEqual(2f, cam.position.y - player.transform.position.y, 0.2f);
            player.FollowCamera.Snap();
            Assert.AreEqual(4f, Vector2.Distance(new Vector2(player.transform.position.x, player.transform.position.z), new Vector2(cam.position.x, cam.position.z)), 0.001f);
            Assert.Less(cam.position.z, player.transform.position.z, "Behind the player at yaw 0.");
            Assert.Greater(Vector3.Dot(cam.forward, (player.transform.position - cam.position).normalized), 0.95f, "It looks at the player.");
            Assert.IsNotNull(cam.GetComponent<Camera>());
        }
    }
}
