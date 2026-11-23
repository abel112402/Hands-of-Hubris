using System.Collections.Generic;
using NUnit.Framework;
using UnityEngine;

namespace HoHPlanner.Runtime.Tests
{
    /// <summary>Several locations in one scene: which location a point is in, and passages there and back.</summary>
    public class PlannerWorldTests
    {
        readonly List<GameObject> made = new List<GameObject>();
        readonly List<PlannerTravelled> travelled = new List<PlannerTravelled>();
        PlannerRuntime runtime;
        PlannerPlayer player;
        PlannerInteractor interactor;
        PlannerLocation yard, cave;
        PlannerPassage down, up;

        PlannerLocation Location(string id, Vector3 at)
        {
            var go = new GameObject(id);
            made.Add(go);
            go.transform.position = at;
            var l = go.AddComponent<PlannerLocation>();
            l.LocationId = id;
            l.Name = id + " name";
            l.Size = new Vector2(20f, 10f);
            return l;
        }

        PlannerPassage Passage(string id, PlannerLocation from, PlannerLocation to, Vector3 at, Vector3 arrival)
        {
            var go = new GameObject("Passage " + id);
            made.Add(go);
            go.transform.position = at;
            var arrive = new GameObject("Arrival").transform;
            arrive.SetParent(go.transform, false);
            arrive.position = arrival;
            var ps = go.AddComponent<PlannerPassage>();
            ps.PassageId = id;
            ps.FromLocation = from.LocationId;
            ps.ToLocation = to.LocationId;
            ps.ToName = to.Name;
            ps.Arrival = arrive;
            return ps;
        }

        [SetUp]
        public void SetUp()
        {
            yard = Location("yard", Vector3.zero);
            cave = Location("cave", new Vector3(100f, 0f, 0f));
            down = Passage("stairs", yard, cave, new Vector3(5f, 0f, -5f), new Vector3(110f, 0f, -5f));
            up = Passage("way out", cave, yard, new Vector3(110f, 0f, -5f), new Vector3(5f, 0f, -5f));
            player = PlannerPlayer.Create(new Vector3(5.5f, 0.1f, -5f), new PlannerPlayerSettings(4f, 4f, 2f));
            made.Add(player.gameObject);
            interactor = player.gameObject.AddComponent<PlannerInteractor>();
            interactor.Player = player.transform;
            runtime = new PlannerRuntime().Register(player.Movement).Register(interactor);
            runtime.Start(new[] { "interaction" });
            runtime.Events.Subscribe<PlannerTravelled>(travelled.Add);
        }

        [TearDown]
        public void TearDown()
        {
            runtime?.Stop();
            foreach (var go in made) if (go != null) Object.DestroyImmediate(go);
            made.Clear();
            travelled.Clear();
        }

        [Test]
        public void KnowsWhichLocationAPointIsIn()
        {
            Assert.AreSame(yard, PlannerLocation.At(new Vector3(1f, 0f, -1f)));
            Assert.AreSame(cave, PlannerLocation.At(new Vector3(119f, 0f, -9f)));
            Assert.IsNull(PlannerLocation.At(new Vector3(50f, 0f, -5f)), "Between the locations");
            Assert.IsNull(PlannerLocation.At(new Vector3(5f, 0f, 1f)), "North of the map");
        }

        [Test]
        public void APassageTakesThePlayerThereAndTheWayBackReturns()
        {
            interactor.Refresh();
            Assert.AreSame(down, interactor.Current);
            Assert.AreEqual("Go to cave name", down.Prompt);
            Assert.IsTrue(interactor.TryInteract());
            Assert.AreSame(cave, PlannerLocation.At(player.transform.position), "In the cave");
            Assert.AreEqual(("stairs", "yard", "cave"), (travelled[0].PassageId, travelled[0].From, travelled[0].To));
            interactor.Refresh();
            Assert.AreSame(up, interactor.Current, "The way back is right there");
            Assert.IsTrue(interactor.TryInteract());
            Assert.AreSame(yard, PlannerLocation.At(player.transform.position), "Back in the yard");
            Assert.AreEqual(2, travelled.Count);
        }

        [Test]
        public void APassageWithoutAnArrivalCannotBeUsed()
        {
            down.Arrival = null;
            Assert.IsFalse(down.CanInteract(interactor));
            interactor.Refresh();
            Assert.IsNull(interactor.Current);
        }
    }
}
