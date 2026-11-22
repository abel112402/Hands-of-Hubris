using System.Collections;
using System.Collections.Generic;
using System.Text.RegularExpressions;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.TestTools;

namespace HoHPlanner.Runtime.Tests
{
    /// <summary>PlayMode: the host starts its services in a running scene and stops them when destroyed.</summary>
    public class PlannerRuntimeHostTests
    {
        public static readonly List<string> Log = new List<string>();

        public class Movement : MonoBehaviour, IPlannerService
        {
            public string Id => "movement";
            public IReadOnlyList<string> DependsOn => new string[0];
            public void Initialize(PlannerRuntime runtime) => Log.Add("start movement");
            public void Shutdown() => Log.Add("stop movement");
        }

        public class Interaction : MonoBehaviour, IPlannerService
        {
            public string Id => "interaction";
            public IReadOnlyList<string> DependsOn => new[] { "movement" };
            public void Initialize(PlannerRuntime runtime) => Log.Add("start interaction");
            public void Shutdown() => Log.Add("stop interaction");
        }

        [SetUp]
        public void Clear() => Log.Clear();

        [UnityTest]
        public IEnumerator StartsInPlayModeAndStopsWhenDestroyed()
        {
            var go = new GameObject("Runtime");
            go.SetActive(false);
            var host = go.AddComponent<PlannerRuntimeHost>();
            host.Required.Add("interaction");
            go.AddComponent<Interaction>();
            new GameObject("Player").AddComponent<Movement>().transform.SetParent(go.transform);
            go.SetActive(true);
            yield return null;

            Assert.AreEqual(PlannerRuntimeState.Running, host.Runtime.State, string.Join("; ", host.Runtime.Errors));
            CollectionAssert.AreEqual(new[] { "movement", "interaction" }, host.Runtime.StartOrder);
            Object.Destroy(go);
            yield return null;
            CollectionAssert.AreEqual(new[] { "start movement", "start interaction", "stop interaction", "stop movement" }, Log);
        }

        [UnityTest]
        public IEnumerator LogsAClearErrorWhenARequiredModuleIsMissing()
        {
            var go = new GameObject("Runtime");
            go.SetActive(false);
            var host = go.AddComponent<PlannerRuntimeHost>();
            host.Required.Add("inventory");
            go.AddComponent<Movement>();
            LogAssert.Expect(LogType.Error, new Regex("The plan needs the “inventory” module"));
            go.SetActive(true);
            yield return null;

            Assert.AreEqual(PlannerRuntimeState.Failed, host.Runtime.State);
            CollectionAssert.IsEmpty(Log);
            Object.Destroy(go);
        }
    }
}
