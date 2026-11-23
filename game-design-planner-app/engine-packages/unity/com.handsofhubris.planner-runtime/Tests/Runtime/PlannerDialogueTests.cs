using System;
using System.Collections.Generic;
using System.Linq;
using NUnit.Framework;
using UnityEngine;

namespace HoHPlanner.Runtime.Tests
{
    /// <summary>The dialogue module: talking by interacting, options, a choice and items once, closed options, a save.</summary>
    public class PlannerDialogueTests
    {
        readonly List<GameObject> made = new List<GameObject>();
        readonly List<PlannerDialoguePicked> pickedEvents = new List<PlannerDialoguePicked>();
        PlannerRuntime runtime;
        PlannerPlayer player;
        PlannerInventory inventory;
        PlannerQuests quests;
        PlannerQuestsTests.GraphStub graph;
        PlannerInteractor interactor;
        PlannerDialogue dialogue;
        PlannerNpc npc;

        static PlannerDialogueLine Line(string id, string after, string option, string choice = null, params PlannerItemAmount[] give) =>
            new PlannerDialogueLine { LineId = id, Speaker = "keeper", Text = id + " text", After = after, Option = option, ChoiceId = choice, Give = give.ToList() };

        void Make(int slots = 4, Action<PlannerDialogue> edit = null)
        {
            player = PlannerPlayer.Create(new Vector3(0f, 0.1f, 0f), new PlannerPlayerSettings(4f, 4f, 2f));
            made.Add(player.gameObject);
            var go = new GameObject("Dialogue");
            made.Add(go);
            inventory = go.AddComponent<PlannerInventory>();
            inventory.Slots = slots;
            inventory.Items = new List<PlannerItemDef> { new PlannerItemDef { ItemId = "coin", Name = "Coin", Stack = 2 }, new PlannerItemDef { ItemId = "key", Name = "Key", Stack = 1 } };
            graph = go.AddComponent<PlannerQuestsTests.GraphStub>();
            quests = go.AddComponent<PlannerQuests>();
            quests.Graph = graph;
            quests.Inventory = inventory;
            interactor = go.AddComponent<PlannerInteractor>();
            interactor.Player = player.transform;
            dialogue = go.AddComponent<PlannerDialogue>();
            dialogue.Quests = quests;
            dialogue.Inventory = inventory;
            dialogue.Lines = new List<PlannerDialogueLine>
            {
                Line("greet", null, null),
                Line("help", "greet", "I will help.", "help", new PlannerItemAmount("coin", 2)),
                Line("refuse", "greet", "No.", "refuse"),
                Line("ask", "greet", "Who are you?"),
            };
            edit?.Invoke(dialogue);
            var body = new GameObject("Keeper");
            made.Add(body);
            body.transform.position = new Vector3(1f, 0f, 0f);
            npc = body.AddComponent<PlannerNpc>();
            npc.Dialogue = dialogue;
            npc.CharacterId = "keeper";
            npc.Name = "Keeper";
            runtime = new PlannerRuntime().Register(player.Movement).Register(inventory).Register(quests).Register(interactor).Register(dialogue);
            runtime.Start(new[] { "dialogue" });
            runtime.Events.Subscribe<PlannerDialoguePicked>(pickedEvents.Add);
        }

        [TearDown]
        public void TearDown()
        {
            runtime?.Stop();
            foreach (var go in made) if (go != null) UnityEngine.Object.DestroyImmediate(go);
            made.Clear();
            pickedEvents.Clear();
        }

        [Test]
        public void InteractingWithTheNpcStartsItsConversation()
        {
            Make();
            Assert.AreEqual(PlannerRuntimeState.Running, runtime.State, string.Join(" ", runtime.Errors));
            interactor.Refresh();
            Assert.AreSame(npc, interactor.Current);
            Assert.AreEqual("Talk to Keeper", npc.Prompt);
            Assert.IsTrue(interactor.TryInteract());
            Assert.AreEqual("greet", dialogue.Current.LineId);
            CollectionAssert.AreEqual(new[] { "help", "refuse", "ask" }, dialogue.Options.Select(o => o.Line.LineId).ToArray());
            Assert.IsFalse(npc.CanInteract(interactor), "Not again while talking");
        }

        [Test]
        public void PickingAnOptionMakesItsChoiceAndGivesItsItemsOnce()
        {
            Make();
            dialogue.Start("keeper");
            Assert.IsTrue(dialogue.Pick("help"));
            Assert.AreEqual("help", dialogue.Current.LineId);
            Assert.IsTrue(graph.HasChosen("help"));
            Assert.AreEqual(2, inventory.CountOf("coin"));
            Assert.AreEqual(1, pickedEvents.Count);
            dialogue.End();
            dialogue.Start("keeper");
            var refuse = dialogue.Options.First(o => o.Line.LineId == "refuse");
            Assert.IsFalse(refuse.Allowed, "One option per decision");
            Assert.AreEqual("already decided", refuse.Reason);
            Assert.IsFalse(dialogue.Pick("refuse"));
            Assert.IsTrue(dialogue.Pick("help"), "The picked option is shown again");
            Assert.AreEqual(2, inventory.CountOf("coin"), "Its items are not given again");
            Assert.AreEqual(1, pickedEvents.Count);
            Assert.IsTrue(dialogue.Pick("ask") == false, "Options belong to the current line");
        }

        [Test]
        public void AnOptionWhoseItemsDoNotFitCannotBePickedAndChangesNothing()
        {
            Make(slots: 1);
            inventory.TryAdd("key", 1);
            dialogue.Start("keeper");
            var help = dialogue.Options.First(o => o.Line.LineId == "help");
            Assert.IsFalse(help.Allowed);
            Assert.AreEqual("no room for the items", help.Reason);
            Assert.IsFalse(dialogue.Pick("help"));
            Assert.IsFalse(graph.HasChosen("help"), "The choice is not made either");
        }

        [Test]
        public void AnOptionWithoutConsequencesCanBePickedAnyTime()
        {
            Make();
            dialogue.Start("keeper");
            Assert.IsTrue(dialogue.Pick("ask"));
            Assert.AreEqual(0, dialogue.Options.Count);
            dialogue.End();
            Assert.IsFalse(dialogue.IsTalking);
        }

        [Test]
        public void ItDoesNotStartWithLinesThePlanDoesNotHave()
        {
            Assert.Throws<PlannerRuntimeException>(() => Make(edit: d =>
            {
                d.Lines.Add(Line("bad", "nowhere", "?", "betray", new PlannerItemAmount("gem", 1)));
            }));
            Assert.AreEqual(PlannerRuntimeState.Failed, runtime.State);
            var errors = string.Join(" ", runtime.Errors);
            StringAssert.Contains("answers “nowhere”", errors);
            StringAssert.Contains("makes “betray”", errors);
            StringAssert.Contains("gives “gem”", errors);
        }

        [Test]
        public void TheGameStateSavesAndRestoresThePickedOptions()
        {
            Make();
            var state = new GameObject("State").AddComponent<PlannerGameState>();
            made.Add(state.gameObject);
            state.Dialogue = dialogue;
            dialogue.Start("keeper");
            dialogue.Pick("help");
            var json = state.Capture(PlannerStateKind.Dialogue);
            StringAssert.Contains("help", json);
            dialogue.RestoreState(new string[0]);
            Assert.AreEqual(0, dialogue.Picked.Count);
            state.Restore(PlannerStateKind.Dialogue, json);
            CollectionAssert.AreEquivalent(new[] { "help" }, dialogue.Picked.ToArray());
            Assert.Throws<PlannerStateException>(() => state.Check(PlannerStateKind.Dialogue, "{\"picked\":[\"gone\"]}"));
            Assert.Throws<PlannerStateException>(() => state.Check(PlannerStateKind.Dialogue, "not json"));
        }
    }
}
