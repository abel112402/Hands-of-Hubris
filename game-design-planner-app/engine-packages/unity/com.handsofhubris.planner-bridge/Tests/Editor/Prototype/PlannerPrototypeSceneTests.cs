using System;
using System.IO;
using System.Linq;
using HoHPlanner.Bridge.Editor;
using HoHPlanner.Runtime;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace HoHPlanner.Bridge.Tests
{
    /// <summary>The prototype scene builder on a small export: a 6×4 map, a player start, one pickup, the input asset.</summary>
    public class PlannerPrototypeSceneTests
    {
        const string Root = "Assets/HoHPrototypeSceneTest";
        const string Scene = Root + "/Prototype/Test Yard.unity";

        static JObject Ir(double? metresPerUnit = null)
        {
            var where = new JObject { ["scene"] = new JObject { ["id"] = "sc1", ["name"] = "Test Yard" }, ["location"] = "loc1", ["locationName"] = "Yard", ["map"] = "Maps/loc1.json", ["cell"] = 10 };
            if (metresPerUnit != null) where["metresPerUnit"] = metresPerUnit;
            return new JObject
            {
                ["input"] = new JObject { ["actions"] = new JArray() },
                ["gameplay"] = new JObject
                {
                    ["systems"] = new JArray("movement"),
                    ["scene"] = where,
                    ["placements"] = new JArray(
                        new JObject { ["location"] = "loc1", ["object"] = "o1", ["role"] = "player", ["count"] = 1, ["x"] = 25, ["y"] = 15 },
                        new JObject { ["location"] = "loc1", ["object"] = "o2", ["role"] = "item", ["item"] = "itKey", ["key"] = "item.key", ["count"] = 2, ["x"] = 45, ["y"] = 25 }),
                    ["player"] = new JObject { ["moveSpeed"] = 3.5, ["cameraDistance"] = 4, ["cameraHeight"] = 1.5 },
                },
            };
        }

        static void Write(string path, string text)
        {
            Directory.CreateDirectory(Path.GetDirectoryName(path));
            File.WriteAllText(path, text);
        }

        static void Export(double? metresPerUnit = null)
        {
            Write($"{Root}/ir/engine-ir.json", Ir(metresPerUnit).ToString());
            Write($"{Root}/Maps/loc1.json", new JObject
            {
                ["format"] = "hoh-location",
                ["name"] = "Yard",
                ["spawns"] = new JArray(new JObject { ["id"] = "o3", ["role"] = "enemy", ["x"] = 15, ["y"] = 25, ["label"] = "Rat" }),
                ["lights"] = new JArray(new JObject { ["x"] = 30, ["y"] = 20, ["radius"] = 40, ["color"] = "#ffcc88", ["intensity"] = 1 }),
                ["nav"] = new JObject { ["cell"] = 10, ["cols"] = 6, ["rows"] = 4, ["cost"] = "24B", ["tags"] = "24A" },
            }.ToString());
            AssetDatabase.Refresh();
        }

        [SetUp]
        public void SetUp()
        {
            if (Type.GetType("HoHPlanner.Runtime.PlannerInputSystemSource, HoHPlanner.Runtime.InputSystem") == null) Assert.Ignore("Needs the Input System package.");
            AssetDatabase.DeleteAsset(Root);
            Write($"{Root}/Unity/Input/Test.inputactions", new JObject
            {
                ["name"] = "Test",
                ["maps"] = new JArray(new JObject { ["name"] = "Prototype", ["id"] = "6f2a5f0e-0000-4000-8000-000000000001", ["actions"] = new JArray(), ["bindings"] = new JArray() }),
                ["controlSchemes"] = new JArray(),
            }.ToString());
            Export();
        }

        [TearDown]
        public void TearDown()
        {
            EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            AssetDatabase.DeleteAsset(Root);
            var backup = $"{Root}/{PlannerOwnership.BackupDir}";
            if (Directory.Exists(Root)) Directory.Delete(Root, true);
            if (Directory.Exists(backup)) Directory.Delete(backup, true);
        }

        static T[] All<T>() where T : UnityEngine.Object => UnityEngine.Object.FindObjectsByType<T>(FindObjectsInactive.Include, FindObjectsSortMode.None);

        [Test]
        public void BuildsAPlayableSceneFromThePlan()
        {
            var r = PlannerPrototypeScene.Build(Root);
            Assert.IsTrue(r.Ok, r.ToString());
            Assert.IsTrue(r.Built);
            Assert.AreEqual(Scene, r.Scene);
            CollectionAssert.Contains(AssetDatabase.GetLabels(AssetDatabase.LoadMainAssetAtPath(Scene)), PlannerPrototypeScene.Label);

            EditorSceneManager.OpenScene(Scene);
            foreach (var go in All<GameObject>()) Assert.IsFalse(go.GetComponents<Component>().Any(c => c == null), $"{go.name} has a missing script");
            var host = All<PlannerRuntimeHost>().Single();
            CollectionAssert.AreEqual(new[] { "movement" }, host.Required);

            // Default scale: one nav cell (10 map units) per metre, map y south (−z).
            var player = All<PlannerPlayer>().Single();
            Assert.AreEqual(2.5f, player.transform.position.x, 0.001f);
            Assert.AreEqual(-1.5f, player.transform.position.z, 0.001f);
            Assert.IsTrue(PrefabUtility.IsPartOfPrefabInstance(player), "The player is an instance of Player.prefab");
            Assert.AreEqual(3.5f, player.Movement.MoveSpeed, 0.0001f);
            Assert.AreSame(player.FollowCamera, player.Movement.Camera);
            Assert.AreEqual(4f, player.FollowCamera.Distance, 0.0001f);
            Assert.AreEqual(1.5f, player.FollowCamera.Height, 0.0001f);
            Assert.AreSame(player.transform, player.FollowCamera.Target);
            Assert.AreEqual("MainCamera", player.FollowCamera.tag);
            var source = player.GetComponent(Type.GetType("HoHPlanner.Runtime.PlannerInputSystemSource, HoHPlanner.Runtime.InputSystem"));
            var so = new SerializedObject(source);
            Assert.IsNotNull(so.FindProperty("Actions").objectReferenceValue, "The generated input asset is assigned");
            Assert.AreEqual("Prototype", so.FindProperty("Map").stringValue);

            var placements = All<PlannerPlacement>();
            var item = placements.Single(x => x.IsItem);
            Assert.AreEqual(("itKey", "item.key", 2, "o2"), (item.ItemId, item.ItemKey, item.Count, item.ObjectId));
            Assert.AreEqual(new Vector3(4.5f, 0f, -2.5f), item.transform.position);
            Assert.IsTrue(item.GetComponent<SphereCollider>().isTrigger);
            Assert.AreEqual(1, item.transform.childCount, "The pickup shows its prefab");
            Assert.IsTrue(File.Exists($"{Root}/Prototype/Prefabs/item.key.prefab"));
            Assert.AreEqual("enemy", placements.Single(x => x.ObjectId == "o3").Role);
            Assert.IsTrue(placements.Single(x => x.IsPlayerStart).transform.position == new Vector3(2.5f, 0f, -1.5f));

            // The floor covers the walkable 6 × 4 m and has a collider; the point light's radius is in metres too.
            var floor = GameObject.Find("Floor");
            Assert.AreEqual(new Vector3(6f, 0f, 4f), floor.GetComponent<MeshFilter>().sharedMesh.bounds.size);
            Assert.IsNotNull(floor.GetComponent<MeshCollider>());
            Assert.AreEqual(4f, All<Light>().Single(l => l.type == LightType.Point).range, 0.001f);
        }

        [Test]
        public void AnUnchangedPlanBuildsNothingAndAChangedOneKeepsTheGuids()
        {
            Assert.IsTrue(PlannerPrototypeScene.Build(Root).Built);
            var sceneGuid = AssetDatabase.AssetPathToGUID(Scene);
            var meshGuid = AssetDatabase.FindAssets("t:Mesh", new[] { $"{Root}/Prototype/Meshes" }).OrderBy(g => g).ToArray();
            var text = File.ReadAllText(Scene);

            var again = PlannerPrototypeScene.Build(Root);
            Assert.IsTrue(again.UpToDate, again.ToString());
            Assert.AreEqual(text, File.ReadAllText(Scene));
            Assert.IsNull(PlannerPrototypeScene.Status(Root));

            Export(0.2);
            StringAssert.Contains("out of date", PlannerPrototypeScene.Status(Root));
            var changed = PlannerPrototypeScene.Build(Root);
            Assert.IsTrue(changed.Built, changed.ToString());
            Assert.AreEqual(sceneGuid, AssetDatabase.AssetPathToGUID(Scene));
            CollectionAssert.AreEqual(meshGuid, AssetDatabase.FindAssets("t:Mesh", new[] { $"{Root}/Prototype/Meshes" }).OrderBy(g => g).ToArray());
            EditorSceneManager.OpenScene(Scene);
            Assert.AreEqual(5f, All<PlannerPlayer>().Single().transform.position.x, 0.001f, "25 map units at 0.2 m per unit");
            Assert.AreEqual(1, All<PlannerPlayer>().Length, "Rebuilding does not duplicate the player");
            Assert.AreEqual(1, All<PlannerPlacement>().Count(x => x.IsItem), "nor the pickups");
        }

        [Test]
        public void ASceneChangedByHandStopsTheBuildUntilOverwritten()
        {
            Assert.IsTrue(PlannerPrototypeScene.Build(Root).Built);
            var scene = EditorSceneManager.OpenScene(Scene);
            new GameObject("My own work");
            EditorSceneManager.SaveScene(scene);
            EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            Export(0.5);
            var mine = File.ReadAllText(Scene);

            var stopped = PlannerPrototypeScene.Build(Root);
            Assert.IsTrue(stopped.Conflict, stopped.ToString());
            Assert.IsFalse(stopped.Built);
            Assert.AreEqual(mine, File.ReadAllText(Scene), "Nothing was written");

            var overwritten = PlannerPrototypeScene.Build(Root, overwrite: true);
            Assert.IsTrue(overwritten.Built, overwritten.ToString());
            Assert.AreEqual(mine, File.ReadAllText(overwritten.Backup), "A copy of the changed scene is kept");
            EditorSceneManager.OpenScene(Scene);
            Assert.IsNull(GameObject.Find("My own work"));
        }

        [Test]
        public void KeepsYourPrefabs()
        {
            Assert.IsTrue(PlannerPrototypeScene.Build(Root).Built);
            var path = $"{Root}/Prototype/Player.prefab";
            var guid = AssetDatabase.AssetPathToGUID(path);
            var contents = PrefabUtility.LoadPrefabContents(path);
            new GameObject("Hat").transform.SetParent(contents.transform, false);
            PrefabUtility.SaveAsPrefabAsset(contents, path);
            PrefabUtility.UnloadPrefabContents(contents);

            Export(0.3);
            Assert.IsTrue(PlannerPrototypeScene.Build(Root).Built);
            Assert.AreEqual(guid, AssetDatabase.AssetPathToGUID(path));
            Assert.IsNotNull(AssetDatabase.LoadAssetAtPath<GameObject>(path).transform.Find("Hat"), "Your change to the player prefab stays");
            EditorSceneManager.OpenScene(Scene);
            Assert.IsNotNull(All<PlannerPlayer>().Single().transform.Find("Hat"), "and the scene uses it");
        }

        [Test]
        public void SaysWhatIsMissing()
        {
            var ir = Ir();
            ((JObject)ir["gameplay"]["scene"]).Remove("scene");
            Write($"{Root}/ir/engine-ir.json", ir.ToString());
            var r = PlannerPrototypeScene.Build(Root);
            Assert.IsFalse(r.Ok);
            StringAssert.Contains("Prototype scene", string.Join(" ", r.Errors));
            Assert.IsFalse(File.Exists(Scene));

            ir["gameplay"]["systems"] = new JArray("quests");
            Write($"{Root}/ir/engine-ir.json", ir.ToString());
            StringAssert.Contains("Player movement and camera", string.Join(" ", PlannerPrototypeScene.Build(Root).Errors));

            Write($"{Root}/ir/engine-ir.json", new JObject().ToString());
            StringAssert.Contains("no playable prototype", string.Join(" ", PlannerPrototypeScene.Build(Root).Errors));
            Assert.IsNull(PlannerPrototypeScene.Status(Root), "No warning for plans without a prototype");
        }

        [Test]
        public void AddsTheInventoryAndShowsItOnThePlannedHud()
        {
            // An import backup (hidden folder, not imported by Unity) sorts first and must be ignored, as must its input asset copy.
            Write($"{Root}/{PlannerOwnership.BackupDir}/20260101-000000-000/Unity/UI/Screens/Hud.uxml", "<ui:UXML xmlns:ui=\"UnityEngine.UIElements\"><ui:VisualElement class=\"planner-screen--hud\" /></ui:UXML>");
            File.Copy($"{Root}/Unity/Input/Test.inputactions", $"{Root}/{PlannerOwnership.BackupDir}/20260101-000000-000/Unity/Test.inputactions");
            Write($"{Root}/Unity/UI/Screens/Hud.uxml", "<ui:UXML xmlns:ui=\"UnityEngine.UIElements\"><ui:VisualElement name=\"screen-Hud\" class=\"planner-screen planner-screen--hud\"><ui:VisualElement name=\"bind-inventory\" class=\"planner-grid\" /></ui:VisualElement></ui:UXML>");
            var ir = Ir();
            ir["gameplay"]["systems"] = new JArray("movement", "inventory");
            ir["gameplay"]["inventory"] = new JObject
            {
                ["slots"] = 6,
                ["items"] = new JArray(new JObject { ["item"] = "itKey", ["key"] = "item.key", ["name"] = "Old Key", ["stack"] = 3 }),
                ["shown"] = new JObject { ["grid"] = true, ["counters"] = new JArray() },
            };
            ir["ui"] = new JObject { ["width"] = 1280, ["height"] = 720 };
            Write($"{Root}/ir/engine-ir.json", ir.ToString());
            AssetDatabase.Refresh();
            var r = PlannerPrototypeScene.Build(Root);
            Assert.IsTrue(r.Built, r.ToString());

            EditorSceneManager.OpenScene(Scene);
            foreach (var go in All<GameObject>()) Assert.IsFalse(go.GetComponents<Component>().Any(c => c == null), $"{go.name} has a missing script");
            CollectionAssert.AreEquivalent(new[] { "movement", "inventory" }, All<PlannerRuntimeHost>().Single().Required);
            var inventory = All<PlannerInventory>().Single();
            Assert.AreEqual(6, inventory.Slots);
            Assert.AreEqual(("itKey", "item.key", "Old Key", 3), (inventory.Items[0].ItemId, inventory.Items[0].Key, inventory.Items[0].Name, inventory.Items[0].Stack));
            var doc = All<UnityEngine.UIElements.UIDocument>().Single();
            Assert.AreEqual($"{Root}/Unity/UI/Screens/Hud.uxml", AssetDatabase.GetAssetPath(doc.visualTreeAsset));
            Assert.IsNotNull(doc.panelSettings.themeStyleSheet, "The runtime theme, so text shows");
            Assert.AreEqual(new Vector2Int(1280, 720), doc.panelSettings.referenceResolution);
            var binding = All<PlannerHudBinding>().Single();
            Assert.AreSame(doc, binding.Document);
            Assert.AreSame(inventory, binding.Inventory);
            var source = new SerializedObject(All<PlannerPlayer>().Single().GetComponent(Type.GetType("HoHPlanner.Runtime.PlannerInputSystemSource, HoHPlanner.Runtime.InputSystem")));
            Assert.AreEqual($"{Root}/Unity/Input/Test.inputactions", AssetDatabase.GetAssetPath(source.FindProperty("Actions").objectReferenceValue), "Not the backup copy");
        }

        [Test]
        public void AddsTheQuestsWithThePlannedGraphAndRules()
        {
            if (!TypeCache.GetTypesDerivedFrom<IPlannerQuestGraph>().Any(t => typeof(MonoBehaviour).IsAssignableFrom(t) && !t.Assembly.GetName().Name.EndsWith(".Tests"))) Assert.Ignore("Needs a generated PlannerQuestGraph in the project (an export with Quests).");
            Write($"{Root}/Unity/UI/Screens/Hud.uxml", "<ui:UXML xmlns:ui=\"UnityEngine.UIElements\"><ui:VisualElement class=\"planner-screen planner-screen--hud\"><ui:VisualElement name=\"bind-quest\" /></ui:VisualElement></ui:UXML>");
            var ir = Ir();
            ir["gameplay"]["systems"] = new JArray("movement", "inventory", "quests");
            ir["gameplay"]["inventory"] = new JObject { ["slots"] = 4, ["items"] = new JArray(new JObject { ["item"] = "itKey", ["name"] = "Old Key", ["stack"] = 1 }, new JObject { ["item"] = "itCoin", ["name"] = "Coin", ["stack"] = 50 }) };
            ir["gameplay"]["quests"] = new JArray(
                new JObject
                {
                    ["quest"] = "q1",
                    ["name"] = "Find it",
                    ["completeWhen"] = new JObject { ["kind"] = "holdItems", ["items"] = new JArray(new JObject { ["item"] = "itKey", ["count"] = 1 }) },
                    ["onComplete"] = new JArray(new JObject { ["kind"] = "giveItems", ["items"] = new JArray(new JObject { ["item"] = "itCoin", ["count"] = 5 }) }),
                    ["money"] = 2,
                    ["xp"] = 3,
                },
                new JObject { ["quest"] = "q2", ["name"] = "Reward only", ["onComplete"] = new JArray(), ["money"] = 0, ["xp"] = 0 });
            Write($"{Root}/ir/engine-ir.json", ir.ToString());
            AssetDatabase.Refresh();
            var r = PlannerPrototypeScene.Build(Root);
            Assert.IsTrue(r.Built, r.ToString());

            EditorSceneManager.OpenScene(Scene);
            foreach (var go in All<GameObject>()) Assert.IsFalse(go.GetComponents<Component>().Any(c => c == null), $"{go.name} has a missing script");
            CollectionAssert.AreEquivalent(new[] { "movement", "inventory", "quests" }, All<PlannerRuntimeHost>().Single().Required);
            var quests = All<PlannerQuests>().Single();
            Assert.IsInstanceOf<IPlannerQuestGraph>(quests.Graph);
            Assert.AreSame(All<PlannerInventory>().Single(), quests.Inventory);
            Assert.AreEqual(1, quests.Rules.Count, "Only quests with a typed goal");
            var rule = quests.Rules[0];
            Assert.AreEqual(("q1", "Find it", 2, 3), (rule.QuestId, rule.Name, rule.Money, rule.Xp));
            Assert.AreEqual(("itKey", 1), (rule.Goal.Single().ItemId, rule.Goal.Single().Count));
            Assert.AreEqual(("itCoin", 5), (rule.Reward.Single().ItemId, rule.Reward.Single().Count));
            Assert.AreSame(quests, All<PlannerHudBinding>().Single().Quests);

            ir["gameplay"]["systems"] = new JArray("movement", "quests");
            Write($"{Root}/ir/engine-ir.json", ir.ToString());
            StringAssert.Contains("Quests need the Inventory system", string.Join(" ", PlannerPrototypeScene.Build(Root).Errors));
        }

        [Test]
        public void AddsTheSaveWithThePartsLinkedToRuntimeState()
        {
            var sliceType = TypeCache.GetTypesDerivedFrom<IPlannerSaveSystem>().FirstOrDefault(t => typeof(MonoBehaviour).IsAssignableFrom(t) && !t.Assembly.GetName().Name.EndsWith(".Tests"));
            if (sliceType == null) Assert.Ignore("Needs a generated PlannerSaveSlice in the project (an export with Save and load).");
            var ir = Ir();
            ir["gameplay"]["systems"] = new JArray("movement", "inventory", "saveLoad");
            ir["gameplay"]["inventory"] = new JObject { ["slots"] = 4, ["items"] = new JArray(new JObject { ["item"] = "itKey", ["name"] = "Old Key", ["stack"] = 1 }) };
            ir["gameplay"]["save"] = new JObject
            {
                ["parts"] = new JArray(
                    new JObject { ["part"] = "p1", ["key"] = "player", ["state"] = "Player position" },
                    new JObject { ["part"] = "p2", ["key"] = "inventory", ["state"] = "Inventory" }),
            };
            Write($"{Root}/ir/engine-ir.json", ir.ToString());
            var r = PlannerPrototypeScene.Build(Root);
            Assert.IsTrue(r.Built, r.ToString());

            EditorSceneManager.OpenScene(Scene);
            foreach (var go in All<GameObject>()) Assert.IsFalse(go.GetComponents<Component>().Any(c => c == null), $"{go.name} has a missing script");
            var state = All<PlannerGameState>().Single();
            Assert.AreSame(All<PlannerPlayer>().Single(), state.Player);
            Assert.AreSame(All<PlannerInventory>().Single(), state.Inventory);
            Assert.IsNull(state.Quests);
            CollectionAssert.AreEqual(new[] { ("player", PlannerStateKind.PlayerPosition), ("inventory", PlannerStateKind.Inventory) }, state.Parts.Select(b => (b.SaveKey, b.State)).ToArray());
            var slice = state.GetComponent(sliceType);
            Assert.IsNotNull(slice);
            Assert.AreSame(state, sliceType.GetField("State").GetValue(slice));

            ((JArray)ir["gameplay"]["save"]["parts"]).Add(new JObject { ["part"] = "p3", ["key"] = "quest_log", ["state"] = "Quests" });
            Write($"{Root}/ir/engine-ir.json", ir.ToString());
            StringAssert.Contains("holds Quests, but the plan does not choose that system", string.Join(" ", PlannerPrototypeScene.Build(Root).Errors));
        }

        [Test]
        public void AddsCombatWithThePlannedEnemiesAndFormula()
        {
            if (!TypeCache.GetTypesDerivedFrom<IPlannerDamageFormula>().Any(t => typeof(MonoBehaviour).IsAssignableFrom(t) && !t.Assembly.GetName().Name.EndsWith(".Tests"))) Assert.Ignore("Needs a generated PlannerDamageFormula in the project (an export with Combat).");
            var ir = Ir();
            ir["gameplay"]["systems"] = new JArray("movement", "interaction", "inventory", "combat");
            ir["gameplay"]["inventory"] = new JObject { ["slots"] = 4, ["items"] = new JArray(new JObject { ["item"] = "itKey", ["name"] = "Old Key", ["stack"] = 1 }) };
            ((JArray)ir["gameplay"]["placements"]).Add(new JObject { ["location"] = "loc1", ["object"] = "o4", ["role"] = "enemy", ["enemy"] = "en1", ["count"] = 1, ["x"] = 55, ["y"] = 35 });
            ir["gameplay"]["combat"] = new JObject
            {
                ["player"] = new JObject { ["hp"] = 30, ["attackRange"] = 1.25, ["weapon"] = new JObject { ["item"] = "itStick", ["damage"] = 6, ["damageType"] = "blunt", ["attackRate"] = 2 } },
                ["formula"] = "attack * 100 / (100 + armor) * (1 - resist / 100) * crit",
                ["enemies"] = new JArray(new JObject { ["enemy"] = "en1", ["name"] = "Rat", ["hp"] = 20, ["damage"] = 3, ["attackRate"] = 1, ["armor"] = 10, ["resistances"] = new JObject { ["blunt"] = 25 }, ["speed"] = 2, ["passive"] = false, ["xp"] = 5, ["loot"] = new JArray(new JObject { ["item"] = "itKey", ["count"] = 1 }) }),
                ["aggroRadius"] = 8,
                ["enemyReach"] = 1.5,
            };
            Write($"{Root}/ir/engine-ir.json", ir.ToString());
            var r = PlannerPrototypeScene.Build(Root);
            Assert.IsTrue(r.Built, r.ToString());

            EditorSceneManager.OpenScene(Scene);
            foreach (var go in All<GameObject>()) Assert.IsFalse(go.GetComponents<Component>().Any(c => c == null), $"{go.name} has a missing script");
            CollectionAssert.Contains(All<PlannerRuntimeHost>().Single().Required, "combat");
            var combat = All<PlannerCombat>().Single();
            Assert.IsInstanceOf<IPlannerDamageFormula>(combat.Formula);
            Assert.AreEqual((30f, 6f, "blunt", 2f, 1.25f), (combat.PlayerHealth.Max, combat.WeaponDamage, combat.WeaponDamageType, combat.WeaponRate, combat.AttackRange));
            Assert.AreSame(All<PlannerPlayer>().Single(), combat.Player);
            Assert.AreEqual("player", combat.Respawn.GetComponent<PlannerPlacement>().Role);
            var enemy = All<PlannerEnemy>().Single();
            Assert.AreEqual(("en1", 20f, 3f, 10f, 25f, false), (enemy.EnemyId, enemy.Health.Max, enemy.Damage, enemy.Armor, enemy.ResistanceTo("blunt"), enemy.Passive));
            Assert.AreEqual(new Vector3(5.5f, 0f, -3.5f), enemy.transform.position);
            Assert.AreEqual("o4", enemy.Placement.ObjectId);
            Assert.IsNotNull(enemy.Body);
            var loot = enemy.GetComponent<PlannerLoot>();
            Assert.IsFalse(loot.enabled, "Loot waits for the enemy to be defeated");
            Assert.AreEqual(("itKey", 1), (loot.Items.Single().ItemId, loot.Items.Single().Count));
            Assert.IsTrue(File.Exists($"{Root}/Prototype/Prefabs/en1.prefab"), "The enemy's body prefab, made once");
            Assert.AreEqual(1, All<PlannerPlacement>().Count(x => x.Role == "enemy"), "No extra marker for the enemy");
        }

        [Test]
        public void AddsInteractionWhenThePlanChoseIt()
        {
            Assert.IsTrue(PlannerPrototypeScene.Build(Root).Built);
            EditorSceneManager.OpenScene(Scene);
            Assert.AreEqual(0, All<PlannerInteractor>().Length, "No interaction without the system");
            Assert.AreEqual(0, All<PlannerPickup>().Length);
            EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);

            var ir = Ir();
            ir["gameplay"]["systems"] = new JArray("movement", "interaction");
            ir["gameplay"]["input"] = new JObject { ["interact"] = new JObject { ["control"] = "c1", ["name"] = "Use", ["key"] = "E" } };
            ir["gameplay"]["player"]["interactRange"] = 1.5;
            ir["records"] = new JArray(new JObject { ["plannerId"] = "itKey", ["key"] = "item.key", ["name"] = "Old Key" });
            Write($"{Root}/ir/engine-ir.json", ir.ToString());
            var r = PlannerPrototypeScene.Build(Root);
            Assert.IsTrue(r.Built, r.ToString());

            EditorSceneManager.OpenScene(Scene);
            foreach (var go in All<GameObject>()) Assert.IsFalse(go.GetComponents<Component>().Any(c => c == null), $"{go.name} has a missing script");
            CollectionAssert.AreEquivalent(new[] { "movement", "interaction" }, All<PlannerRuntimeHost>().Single().Required);
            var interactor = All<PlannerInteractor>().Single();
            Assert.AreSame(All<PlannerPlayer>().Single().transform, interactor.Player);
            Assert.AreEqual(1.5f, interactor.Range, 0.0001f);
            Assert.IsFalse(PrefabUtility.IsPartOfAnyPrefab(interactor), "Interaction is a scene object, not part of your Player.prefab");
            var prompt = All<PlannerInteractionPrompt>().Single();
            Assert.AreSame(interactor, prompt.Interactor);
            Assert.AreEqual("E", prompt.KeyLabel);
            var pickup = All<PlannerPickup>().Single();
            Assert.AreEqual("Old Key", pickup.DisplayName);
            Assert.IsTrue(pickup.IsValid);
            Assert.AreEqual("Pick up Old Key ×2", pickup.Prompt);
        }

        [Test]
        public void TheStartMustBeOnWalkableGround()
        {
            var ir = Ir();
            ir["gameplay"]["placements"][0]["x"] = 500;
            Write($"{Root}/ir/engine-ir.json", ir.ToString());
            StringAssert.Contains("not on walkable ground", string.Join(" ", PlannerPrototypeScene.Build(Root).Errors));
        }
    }
}
