using System.Collections;
using System.Collections.Generic;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.TestTools;

namespace HoHPlanner.Runtime.Tests
{
    /// <summary>PlayMode: the interaction module and item pickups, with the Interact press from a stand-in source.</summary>
    public class PlannerInteractionTests
    {
        public class PressSource : MonoBehaviour, IPlannerMoveSource
        {
            int pressFrame = -1;
            public Vector2 Move => Vector2.zero;
            public bool InteractPressed => Time.frameCount == pressFrame;
            /// <summary>Presses Interact on the next frame only, as the Input System's WasPressedThisFrame.</summary>
            public void Press() => pressFrame = Time.frameCount + 1;
        }

        readonly List<GameObject> made = new List<GameObject>();
        readonly List<PlannerItemAcquired> got = new List<PlannerItemAcquired>();
        PlannerRuntime runtime;
        PlannerInteractor interactor;
        PressSource source;
        GameObject player;

        GameObject Make(string name)
        {
            var go = new GameObject(name);
            made.Add(go);
            return go;
        }

        PlannerPickup Pickup(Vector3 at, string item = "itKey", int count = 1, string key = "item.key")
        {
            var go = Make($"Pickup {item}");
            go.transform.position = at;
            var p = go.AddComponent<PlannerPlacement>();
            p.Role = PlannerPlacement.ItemRole;
            p.ItemId = item;
            p.ItemKey = key;
            p.Count = count;
            p.ObjectId = "obj-" + item;
            var pickup = go.AddComponent<PlannerPickup>();
            pickup.DisplayName = "Brass Key";
            return pickup;
        }

        [SetUp]
        public void SetUp()
        {
            got.Clear();
            player = Make("Player");
            source = player.AddComponent<PressSource>();
            var movement = Make("Movement").AddComponent<MovementStub>();
            interactor = Make("Interaction").AddComponent<PlannerInteractor>();
            interactor.Player = player.transform;
            interactor.Range = 2f;
            runtime = new PlannerRuntime().Register(movement).Register(interactor);
            runtime.Start(new[] { "interaction" });
            runtime.Events.Subscribe<PlannerItemAcquired>(got.Add);
        }

        [TearDown]
        public void TearDown()
        {
            runtime.Stop();
            foreach (var go in made) Object.Destroy(go);
            made.Clear();
        }

        public class MovementStub : MonoBehaviour, IPlannerService
        {
            public string Id => "movement";
            public IReadOnlyList<string> DependsOn => new string[0];
            public void Initialize(PlannerRuntime runtime) { }
            public void Shutdown() { }
        }

        static IEnumerator Frames(int n)
        {
            for (var i = 0; i < n; i++) yield return null;
        }

        [UnityTest]
        public IEnumerator APressInRangePicksTheItemUpOnce()
        {
            var pickup = Pickup(new Vector3(1.5f, 0f, 0f), count: 2);
            yield return Frames(2);
            Assert.AreSame(pickup, interactor.Current, "The pickup in range is the target");
            source.Press();
            yield return Frames(3);
            Assert.AreEqual(1, got.Count, "One item event");
            Assert.AreEqual(("itKey", "item.key", 2, "obj-itKey"), (got[0].ItemId, got[0].ItemKey, got[0].Count, got[0].Source));
            Assert.IsTrue(pickup.Taken);
            Assert.IsFalse(pickup.gameObject.activeSelf, "The pickup disappears");
            Assert.IsNull(interactor.Current);

            source.Press();
            yield return Frames(3);
            Assert.AreEqual(1, got.Count, "A second press gives nothing");
        }

        [UnityTest]
        public IEnumerator HoldingIsNotPressingAgain()
        {
            Pickup(new Vector3(0.5f, 0f, 0f), item: "a");
            Pickup(new Vector3(-0.5f, 0f, 0f), item: "b");
            source.Press();
            yield return Frames(5);
            Assert.AreEqual(1, got.Count, "One press, one interaction, though another target is in range");
            source.Press();
            yield return Frames(3);
            Assert.AreEqual(2, got.Count);
        }

        [UnityTest]
        public IEnumerator NothingOutOfRange()
        {
            var far = Pickup(new Vector3(2.5f, 0f, 0f));
            yield return Frames(2);
            Assert.IsNull(interactor.Current);
            source.Press();
            yield return Frames(3);
            Assert.AreEqual(0, got.Count);
            Assert.IsFalse(far.Taken);

            player.transform.position = new Vector3(1f, 0f, 0f);
            yield return Frames(2);
            Assert.AreSame(far, interactor.Current, "In range after walking closer");
        }

        [UnityTest]
        public IEnumerator InvalidPickupsAreNoTargets()
        {
            LogAssert.Expect(LogType.Warning, new System.Text.RegularExpressions.Regex("gives nothing"));
            Pickup(new Vector3(0.5f, 0f, 0f), item: "");
            LogAssert.Expect(LogType.Warning, new System.Text.RegularExpressions.Regex("gives nothing"));
            Pickup(new Vector3(-0.5f, 0f, 0f), count: 0);
            yield return Frames(2);
            Assert.IsNull(interactor.Current);
            source.Press();
            yield return Frames(3);
            Assert.AreEqual(0, got.Count);
        }

        [UnityTest]
        public IEnumerator TargetsTheNearestAndReportsChanges()
        {
            var changes = new List<IPlannerInteractable>();
            interactor.TargetChanged += changes.Add;
            var near = Pickup(new Vector3(0.5f, 0f, 0f), item: "near");
            Pickup(new Vector3(1.5f, 0f, 0f), item: "far");
            yield return Frames(2);
            Assert.AreSame(near, interactor.Current);
            Assert.AreEqual(new IPlannerInteractable[] { near }, changes.ToArray());

            var prompt = Make("Prompt").AddComponent<PlannerInteractionPrompt>();
            prompt.Interactor = interactor;
            prompt.KeyLabel = "E";
            Assert.AreEqual("[E] Pick up Brass Key", prompt.Text);
        }

        [UnityTest]
        public IEnumerator DoesNothingWhileTheRuntimeIsNotRunning()
        {
            var pickup = Pickup(new Vector3(0.5f, 0f, 0f));
            runtime.Stop();
            yield return Frames(2);
            Assert.IsNull(interactor.Current);
            Assert.IsFalse(interactor.TryInteract());
            Assert.IsFalse(pickup.Taken, "An item is never given without a running runtime to hear it");
        }
    }
}
