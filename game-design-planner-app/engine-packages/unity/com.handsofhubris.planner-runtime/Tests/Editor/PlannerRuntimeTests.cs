using System;
using System.Collections.Generic;
using NUnit.Framework;

namespace HoHPlanner.Runtime.Tests
{
    /// <summary>The lifecycle contract of PlannerRuntime (plans/UNITY_PLAYABLE_GAME_GENERATION_PLAN.md, phase 4).</summary>
    public class PlannerRuntimeTests
    {
        sealed class Fake : IPlannerService
        {
            readonly List<string> log;
            public string Id { get; }
            public IReadOnlyList<string> DependsOn { get; }
            public bool FailStart, FailStop;
            public Fake(List<string> log, string id, params string[] deps)
            {
                this.log = log;
                Id = id;
                DependsOn = deps;
            }
            public void Initialize(PlannerRuntime runtime)
            {
                if (FailStart) throw new InvalidOperationException("no save folder");
                log.Add("start " + Id);
            }
            public void Shutdown()
            {
                log.Add("stop " + Id);
                if (FailStop) throw new InvalidOperationException("disk full");
            }
        }

        [Test]
        public void StartsDependenciesFirstAndStopsInReverse()
        {
            var log = new List<string>();
            var rt = new PlannerRuntime()
                .Register(new Fake(log, "inventory", "interaction"))
                .Register(new Fake(log, "movement"))
                .Register(new Fake(log, "interaction", "movement"));
            rt.Start();
            Assert.AreEqual(PlannerRuntimeState.Running, rt.State);
            CollectionAssert.AreEqual(new[] { "movement", "interaction", "inventory" }, rt.StartOrder);
            Assert.AreEqual("interaction", rt.Get("interaction").Id);
            rt.Stop();
            rt.Stop();
            Assert.AreEqual(PlannerRuntimeState.Stopped, rt.State);
            CollectionAssert.AreEqual(new[] { "start movement", "start interaction", "start inventory", "stop inventory", "stop interaction", "stop movement" }, log);
        }

        [Test]
        public void ReportsEveryProblemBeforeStartingAnything()
        {
            var log = new List<string>();
            var rt = new PlannerRuntime()
                .Register(new Fake(log, "inventory", "interaction"))
                .Register(new Fake(log, "quests"))
                .Register(new Fake(log, "quests"));
            var e = Assert.Throws<PlannerRuntimeException>(() => rt.Start(new[] { "inventory", "saveLoad" }));
            StringAssert.Contains("Two services have the id “quests”", e.Message);
            StringAssert.Contains("The plan needs the “saveLoad” module", e.Message);
            StringAssert.Contains("Service “inventory” needs “interaction”", e.Message);
            Assert.AreEqual(PlannerRuntimeState.Failed, rt.State);
            Assert.IsEmpty(log);
        }

        [Test]
        public void FindsADependencyCycle()
        {
            var log = new List<string>();
            var rt = new PlannerRuntime().Register(new Fake(log, "a", "b")).Register(new Fake(log, "b", "a"));
            var e = Assert.Throws<PlannerRuntimeException>(() => rt.Start());
            StringAssert.Contains("Dependency cycle: a → b → a", e.Message);
            Assert.IsEmpty(log);
        }

        [Test]
        public void RollsBackWhenAServiceFailsToStart()
        {
            var log = new List<string>();
            var rt = new PlannerRuntime()
                .Register(new Fake(log, "movement"))
                .Register(new Fake(log, "saveLoad", "movement") { FailStart = true })
                .Register(new Fake(log, "quests", "saveLoad"));
            var e = Assert.Throws<PlannerRuntimeException>(() => rt.Start());
            StringAssert.Contains("Service “saveLoad” failed to start: no save folder", e.Message);
            Assert.AreEqual(PlannerRuntimeState.Failed, rt.State);
            CollectionAssert.AreEqual(new[] { "start movement", "stop movement" }, log);
            CollectionAssert.IsEmpty(rt.StartOrder);
        }

        [Test]
        public void StopsEveryServiceEvenWhenOneThrows()
        {
            var log = new List<string>();
            var rt = new PlannerRuntime().Register(new Fake(log, "a")).Register(new Fake(log, "b") { FailStop = true }).Register(new Fake(log, "c"));
            rt.Start();
            rt.Stop();
            CollectionAssert.AreEqual(new[] { "start a", "start b", "start c", "stop c", "stop b", "stop a" }, log);
            CollectionAssert.Contains(rt.Errors, "Service “b” failed to stop: disk full");
        }

        [Test]
        public void DeliversEventsAndIsolatesFailingHandlers()
        {
            var rt = new PlannerRuntime();
            rt.Start();
            var got = new List<int>();
            rt.Events.Subscribe<int>(_ => throw new InvalidOperationException("boom"));
            var token = rt.Events.Subscribe<int>(got.Add);
            rt.Events.Publish(1);
            token.Dispose();
            rt.Events.Publish(2);
            CollectionAssert.AreEqual(new[] { 1 }, got);
            CollectionAssert.Contains(rt.Errors, "A handler of Int32 failed: boom");
            rt.Stop();
            Assert.AreEqual(0, rt.Events.Count<int>());
        }

        [Test]
        public void DescribesTheUrpInputProfile()
        {
            var problems = PlannerEnvironment.ProblemsForUrpInputProfile();
            Assert.AreEqual(PlannerEnvironment.InputSystemInstalled && PlannerEnvironment.InputSystemActive && PlannerEnvironment.UrpInstalled && PlannerEnvironment.UrpActive, problems.Count == 0);
            foreach (var p in problems) StringAssert.Contains("›", p, "Each problem says where to fix it.");
        }

        [Test]
        public void VersionMatchesThePackage()
        {
            var info = UnityEditor.PackageManager.PackageInfo.FindForAssembly(typeof(PlannerRuntime).Assembly);
            Assert.IsNotNull(info, "The runtime is not loaded from its package.");
            Assert.AreEqual(PlannerRuntimeInfo.PackageName, info.name);
            Assert.AreEqual(PlannerRuntimeInfo.Version, info.version);
        }
    }
}
