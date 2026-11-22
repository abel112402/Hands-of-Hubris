using System.Collections;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.LowLevel;
using UnityEngine.TestTools;

namespace HoHPlanner.Runtime.Tests
{
    /// <summary>PlayMode with the Input System: a virtual keyboard drives the player through an action asset like the generated one.</summary>
    public class PlannerInputSystemSourceTests
    {
        const string Asset = @"{ ""name"": ""Test"", ""maps"": [ { ""name"": ""Prototype"", ""id"": ""00000000-0000-0000-0000-000000000001"",
            ""actions"": [ { ""name"": ""Move"", ""type"": ""Value"", ""id"": ""00000000-0000-0000-0000-000000000002"", ""expectedControlType"": ""Vector2"" },
                           { ""name"": ""Interact"", ""type"": ""Button"", ""id"": ""00000000-0000-0000-0000-000000000003"", ""expectedControlType"": ""Button"" } ],
            ""bindings"": [
              { ""name"": ""WASD"", ""id"": ""00000000-0000-0000-0000-000000000010"", ""path"": ""2DVector"", ""action"": ""Move"", ""isComposite"": true },
              { ""name"": ""up"", ""id"": ""00000000-0000-0000-0000-000000000011"", ""path"": ""<Keyboard>/w"", ""action"": ""Move"", ""isPartOfComposite"": true },
              { ""name"": ""down"", ""id"": ""00000000-0000-0000-0000-000000000012"", ""path"": ""<Keyboard>/s"", ""action"": ""Move"", ""isPartOfComposite"": true },
              { ""name"": ""left"", ""id"": ""00000000-0000-0000-0000-000000000013"", ""path"": ""<Keyboard>/a"", ""action"": ""Move"", ""isPartOfComposite"": true },
              { ""name"": ""right"", ""id"": ""00000000-0000-0000-0000-000000000014"", ""path"": ""<Keyboard>/d"", ""action"": ""Move"", ""isPartOfComposite"": true },
              { ""name"": """", ""id"": ""00000000-0000-0000-0000-000000000015"", ""path"": ""<Keyboard>/e"", ""action"": ""Interact"" } ] } ] }";

        Keyboard keyboard;
        GameObject ground;
        PlannerPlayer player;
        InputActionAsset actions;
        InputSettings saved;

        [SetUp]
        public void SetUp()
        {
            // Batch mode has no focused Game view: let every device's input reach the game, as InputTestFixture does.
            saved = InputSystem.settings;
            var settings = ScriptableObject.CreateInstance<InputSettings>();
            settings.backgroundBehavior = InputSettings.BackgroundBehavior.IgnoreFocus;
#if UNITY_EDITOR
            settings.editorInputBehaviorInPlayMode = InputSettings.EditorInputBehaviorInPlayMode.AllDeviceInputAlwaysGoesToGameView;
#endif
            InputSystem.settings = settings;
            keyboard = InputSystem.AddDevice<Keyboard>();
            ground = GameObject.CreatePrimitive(PrimitiveType.Plane);
            ground.transform.localScale = new Vector3(20f, 1f, 20f);
            player = PlannerPlayer.Create(new Vector3(0f, 0.1f, 0f), new PlannerPlayerSettings(4f, 5f, 2f));
            actions = InputActionAsset.FromJson(Asset);
            PlannerInputSystemSource.Attach(player.gameObject, actions, "Prototype");
        }

        [TearDown]
        public void TearDown()
        {
            Object.Destroy(player.gameObject);
            Object.Destroy(ground);
            Object.Destroy(actions);
            InputSystem.RemoveDevice(keyboard);
            var settings = InputSystem.settings;
            InputSystem.settings = saved;
            Object.Destroy(settings);
        }

        [UnityTest]
        public IEnumerator HoldingTheForwardKeyWalksForwardAndLettingGoStops()
        {
            for (var i = 0; i < 5; i++) yield return null;
            var start = player.transform.position;
            InputSystem.QueueStateEvent(keyboard, new KeyboardState(Key.W));
            yield return new WaitForSeconds(0.3f);
            var walked = player.transform.position - start;
            Assert.Greater(walked.z, 0.3f);
            Assert.Less(Mathf.Abs(walked.x), 0.05f);

            InputSystem.QueueStateEvent(keyboard, new KeyboardState(Key.A));
            yield return new WaitForSeconds(0.3f);
            Assert.Less(player.transform.position.x - start.x, -0.3f, "A walks left.");

            InputSystem.QueueStateEvent(keyboard, new KeyboardState());
            yield return null;
            var stop = player.transform.position;
            for (var i = 0; i < 10; i++) yield return null;
            Assert.Less(Vector2.Distance(new Vector2(stop.x, stop.z), new Vector2(player.transform.position.x, player.transform.position.z)), 0.01f);
        }

        [UnityTest]
        public IEnumerator ReportsInteractOnTheFrameTheKeyGoesDown()
        {
            var source = player.GetComponent<PlannerInputSystemSource>();
            yield return null;
            Assert.IsFalse(source.InteractPressed);
            InputSystem.QueueStateEvent(keyboard, new KeyboardState(Key.E));
            InputSystem.Update();
            Assert.IsTrue(source.InteractPressed);
        }
    }
}
