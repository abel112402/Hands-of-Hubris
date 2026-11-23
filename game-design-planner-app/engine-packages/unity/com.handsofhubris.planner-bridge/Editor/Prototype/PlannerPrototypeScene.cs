using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using HoHPlanner.Runtime;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.SceneManagement;
using UnityEngine.UIElements;

namespace HoHPlanner.Bridge.Editor
{
    public sealed class PrototypeResult
    {
        /// <summary>The scene asset path, when it was built or is up to date.</summary>
        public string Scene;
        public bool Built;
        public bool UpToDate;
        /// <summary>The scene was changed in Unity since the bridge built it (or is not the bridge's); nothing was written.</summary>
        public bool Conflict;
        /// <summary>Where the replaced scene was copied, when building over a changed one.</summary>
        public string Backup;
        public readonly List<string> Errors = new List<string>();
        public readonly List<string> Notes = new List<string>();

        public bool Ok => Errors.Count == 0 && !Conflict;

        public override string ToString()
        {
            var head = Conflict ? "stopped: the scene was changed by hand" : Errors.Count > 0 ? $"{Errors.Count} error(s)" : UpToDate ? $"{Scene} is up to date" : $"built {Scene}";
            var all = Errors.Concat(Notes).ToList();
            return head + (all.Count > 0 ? ". " + string.Join(" ", all) : "");
        }
    }

    /// <summary>
    /// The playable prototype's scene (plans/UNITY_PLAYABLE_GAME_GENERATION_PLAN.md, phase 8), built from the export:
    /// the IR's gameplay part (ir/engine-ir.json) names the planned scene and the location; the location's map
    /// (Maps/*.json, hoh-location) gives the level. The scene goes to &lt;root&gt;/Prototype/&lt;planned scene name&gt;.unity,
    /// so the planned scenes' Build Settings step (PlannerScenes) finds it by name, and carries the “PlannerPrototype” label.
    ///
    /// In the scene: a PlannerRuntimeHost with the plan's required modules; the level (floor, 2 m walls, doors, locks and
    /// keys, lights) at the planned map scale (map x east, map y south, in metres); a sun; the player (an instance of
    /// Prototype/Player.prefab) at the player start, with the planned speed and the generated input map; the third-person
    /// camera at the planned distance and height; a PlannerPlacement for the start, each item pickup (its visual is the
    /// item record's prefab when it has one, else Prototype/Prefabs/&lt;key&gt;.prefab) and every other spawn of the map.
    /// Materials are URP Lit when URP is installed.
    ///
    /// Ownership: the scene, its meshes and materials are the bridge's and are replaced on the next build, keeping their
    /// GUIDs. The prefabs are made once and are then yours: change them, or assign a prefab to the item record, and
    /// build again. A scene changed in Unity since the bridge built it stops the build (copy your work into a scene of
    /// your own first), unless you build with overwrite, which keeps a copy in &lt;root&gt;/.hoh-backup/. An unchanged
    /// plan and map build nothing.
    /// </summary>
    [InitializeOnLoad]
    public static class PlannerPrototypeScene
    {
        public const string Folder = "Prototype";
        public const string Label = "PlannerPrototype";
        public const string StateFile = ".prototype.json";
        /// <summary>Raised when what the builder makes changes, so an older build counts as out of date.</summary>
        public const int GeneratorVersion = 12;

        private const string UrpLit = "Universal Render Pipeline/Lit";

        static PlannerPrototypeScene()
        {
            PlannerImporter.AfterRecords += (root, manifest, result) =>
            {
                var stale = Status(root);
                if (stale != null) Debug.LogWarning($"[Planner bridge] {stale}");
            };
        }

        [MenuItem("Tools/Game Design Planner/Build prototype scene", priority = 41)]
        public static void Menu()
        {
            var root = PlannerBridgeSettings.instance.Root;
            var r = Build(root);
            if (r.Conflict && EditorUtility.DisplayDialog("Prototype scene changed", $"{r.Scene} was changed in Unity since the bridge built it. Building replaces it (a copy is kept in {root}/{PlannerOwnership.BackupDir}/).", "Overwrite (keep a backup)", "Cancel"))
                r = Build(root, overwrite: true);
            if (r.Ok) Debug.Log($"[Planner bridge] Prototype scene: {r}");
            else Debug.LogError($"[Planner bridge] Prototype scene: {r}");
            if (r.Scene != null) EditorGUIUtility.PingObject(AssetDatabase.LoadAssetAtPath<SceneAsset>(r.Scene));
        }

        /// <summary>
        /// -executeMethod HoHPlanner.Bridge.Editor.PlannerPrototypeScene.CI [-hohOverwrite]: builds the prototype scene.
        /// Exit code 0 (built or up to date), 1 errors, 3 stopped because the scene was changed by hand.
        /// </summary>
        public static void CI()
        {
            var r = Build(PlannerBridgeSettings.instance.Root, Environment.GetCommandLineArgs().Contains("-hohOverwrite"));
            Debug.Log($"[Planner bridge] Prototype scene: {r}");
            EditorApplication.Exit(r.Conflict ? 3 : r.Errors.Count > 0 ? 1 : 0);
        }

        // ---- reading the export ----

        /// <summary>A location of the prototype's world, laid out in the scene at <see cref="Offset"/>.</summary>
        private sealed class Loc
        {
            public string Id, Name, MapText;
            public JObject Map;
            public PlannerGreybox.Grid Grid;
            public float Mpu;
            public Vector3 Offset;
            public Vector2 Size;
        }

        private sealed class Plan
        {
            public List<Loc> Locations = new List<Loc>();
            public Loc LocOf(string id) => Locations.FirstOrDefault(l => l.Id == id);
            public bool Has(JToken x) => LocOf((string)x["location"]) != null;
            public string SceneName, SceneFile, LocationId, LocationName, MapText;
            public JObject Gameplay, Map, Start;
            public List<JObject> Items = new List<JObject>();
            public PlannerGreybox.Grid Grid;
            public float MetresPerUnit;
            public PlannerPlayerSettings Player;
            public float InteractRange;
            public bool Interaction;
            public string InteractKey;
            public Dictionary<string, string> ItemNames = new Dictionary<string, string>();
            public JObject Inventory;
            public List<PlannerQuestRule> Quests;
            public Type QuestGraph;
            public List<PlannerStateBinding> SaveParts;
            public List<PlannerRecipe> Recipes;
            public JObject Combat;
            public JObject Dialogue;
            public JObject Progression, Trade, Time;
            public Type DamageFormula;
            public string CraftingKey;
            public string QuickSaveKey, QuickLoadKey;
            public Type SaveSlice;
            public string HudUxml;
            public Vector2 UiSize = new Vector2(1920, 1080);
            public string[] Required;
            public string InputAsset, InputMap;
            public Type InputSource;
        }

        /// <summary>
        /// Files under <paramref name="root"/> that Unity imports, in ordinal order: hidden folders and files (a name
        /// starting with “.”, such as the import backups in .hoh-backup/) are left out.
        /// </summary>
        private static IEnumerable<string> ProjectFiles(string root, string pattern) =>
            (Directory.Exists(root) ? Directory.GetFiles(root, pattern, SearchOption.AllDirectories) : new string[0])
                .Select(f => f.Replace('\\', '/'))
                .Where(f => !f.Substring(root.Length).Split('/').Any(part => part.StartsWith(".", StringComparison.Ordinal)))
                .OrderBy(f => f, StringComparer.Ordinal);

        private static JObject ReadJson(string path)
        {
            try
            {
                return File.Exists(path) ? JObject.Parse(File.ReadAllText(path)) : null;
            }
            catch (JsonException)
            {
                return null;
            }
        }

        private static Plan Read(string root, PrototypeResult r)
        {
            var ir = ReadJson($"{root}/ir/engine-ir.json");
            if (ir == null)
            {
                r.Errors.Add($"No engine IR at {root}/ir/engine-ir.json: import the planner's engine export first.");
                return null;
            }
            var g = ir["gameplay"] as JObject;
            if (g == null)
            {
                r.Errors.Add("The plan asks for no playable prototype: choose its profile and systems in Technical Architecture › Playable prototype and export again.");
                return null;
            }
            var systems = (g["systems"] as JArray ?? new JArray()).Select(s => (string)s).ToArray();
            if (!systems.Contains("movement"))
            {
                r.Errors.Add("The prototype scene needs “Player movement and camera” (Technical Architecture › Playable prototype › Systems).");
                return null;
            }
            var where = g["scene"] as JObject;
            if (where == null)
            {
                r.Errors.Add("No player start: give a location map object the gameplay role “Player start” (World › Locations › map) and export again.");
                return null;
            }
            var planned = where["scene"] as JObject;
            if (planned == null) r.Errors.Add("Choose the Prototype scene in Technical Architecture › Playable prototype (one of the planned scenes) and export again.");
            var mapPath = $"{root}/{(string)where["map"]}";
            var mapText = File.Exists(mapPath) ? File.ReadAllText(mapPath) : null;
            JObject map = null;
            try
            {
                map = mapText != null ? JObject.Parse(mapText) : null;
            }
            catch (JsonException)
            {
            }
            if (map == null || (string)map["format"] != PlannerGreybox.Format)
            {
                r.Errors.Add($"The map of {(string)where["locationName"]} ({mapPath}) is missing or not a hoh-location map: export again.");
                return null;
            }
            if (planned == null) return null;

            var p = new Plan { Gameplay = g, Map = map, MapText = mapText, LocationId = (string)where["location"], LocationName = (string)where["locationName"], SceneName = (string)planned["name"] };
            p.SceneFile = string.Join("", p.SceneName.Split(Path.GetInvalidFileNameChars())).Trim();
            if (p.SceneFile.Length == 0) p.SceneFile = "Prototype";
            if (p.SceneFile != p.SceneName) r.Notes.Add($"The scene name “{p.SceneName}” has characters a file name cannot have, so the scene is {p.SceneFile}.unity and the planned scenes' Build Settings step will not find it: rename the scene in Technical Architecture › Scenes.");
            try
            {
                p.Grid = PlannerGreybox.Grid.Read(map);
            }
            catch (Exception e) when (e is InvalidDataException || e is FormatException)
            {
                r.Errors.Add($"The map of {p.LocationName}: {e.Message}.");
                return null;
            }
            var mpu = (float?)where["metresPerUnit"];
            p.MetresPerUnit = mpu > 0 ? mpu.Value : 1f / p.Grid.Cell;
            p.Locations.Add(new Loc { Id = p.LocationId, Name = p.LocationName, Map = map, MapText = mapText, Grid = p.Grid, Mpu = p.MetresPerUnit, Offset = Vector3.zero, Size = new Vector2(p.Grid.Cols * p.Grid.Cell * p.MetresPerUnit, p.Grid.Rows * p.Grid.Cell * p.MetresPerUnit) });
            // Phase 18: the other locations of the prototype's world, each from its own map, side by side in the one scene.
            foreach (var w in (g["world"]?["locations"] as JArray ?? new JArray()).OfType<JObject>())
            {
                var id = (string)w["location"];
                var at = new Vector3((float?)w["offset"]?["x"] ?? 0f, 0f, (float?)w["offset"]?["z"] ?? 0f);
                if (id == p.LocationId)
                {
                    p.Locations[0].Offset = at;
                    continue;
                }
                var path = $"{root}/{(string)w["map"]}";
                var text = File.Exists(path) ? File.ReadAllText(path) : null;
                JObject m = null;
                try
                {
                    m = text != null ? JObject.Parse(text) : null;
                }
                catch (JsonException)
                {
                }
                if (m == null || (string)m["format"] != PlannerGreybox.Format)
                {
                    r.Errors.Add($"The map of {(string)w["name"]} ({path}) is missing or not a hoh-location map: export again.");
                    continue;
                }
                try
                {
                    var grid = PlannerGreybox.Grid.Read(m);
                    var scale = (float?)w["metresPerUnit"] ?? 1f / grid.Cell;
                    p.Locations.Add(new Loc { Id = id, Name = (string)w["name"], Map = m, MapText = text, Grid = grid, Mpu = scale, Offset = at, Size = new Vector2(grid.Cols * grid.Cell * scale, grid.Rows * grid.Cell * scale) });
                }
                catch (Exception e) when (e is InvalidDataException || e is FormatException)
                {
                    r.Errors.Add($"The map of {(string)w["name"]}: {e.Message}.");
                }
            }

            var here = (g["placements"] as JArray ?? new JArray()).OfType<JObject>().Where(p.Has).ToList();
            p.Start = here.FirstOrDefault(x => (string)x["role"] == PlannerPlacement.PlayerRole && (string)x["location"] == p.LocationId);
            p.Items = here.Where(x => (string)x["role"] == PlannerPlacement.ItemRole).ToList();
            if (p.Start == null)
            {
                r.Errors.Add($"{p.LocationName} has no player start in the export: export again.");
                return null;
            }
            bool OnGround(JObject x)
            {
                var l = p.LocOf((string)x["location"]) ?? p.Locations[0];
                return l.Grid.Walkable((int)Math.Floor((float)x["x"] / l.Grid.Cell), (int)Math.Floor((float)x["y"] / l.Grid.Cell));
            }
            if (!OnGround(p.Start)) r.Errors.Add($"The player start of {p.LocationName} is not on walkable ground of the map; move it in the map editor.");
            foreach (var item in p.Items.Where(x => !OnGround(x)))
                r.Notes.Add($"The pickup {(string)item["key"] ?? (string)item["item"]} is not on walkable ground of the map; the player may not reach it.");

            var player = g["player"] as JObject ?? new JObject();
            p.Player = new PlannerPlayerSettings((float?)player["moveSpeed"] ?? 4f, (float?)player["cameraDistance"] ?? 5f, (float?)player["cameraHeight"] ?? 2f);
            // Modules of the chosen systems that the runtime has as services today.
            p.InteractRange = (float?)player["interactRange"] ?? 2f;
            p.Interaction = systems.Contains("interaction");
            p.InteractKey = (string)g["input"]?["interact"]?["key"];
            foreach (var rec in (ir["records"] as JArray ?? new JArray()).OfType<JObject>())
                if ((string)rec["plannerId"] is string id && (string)rec["name"] is string recName) p.ItemNames[id] = recName;
            p.Required = systems.Where(s => s == "movement" || s == "interaction" || s == "inventory" || s == "quests" || s == "crafting" || s == "combat" || s == "dialogue" || s == "progression" || s == "trade" || s == "time").Concat(systems.Contains("combat") ? new[] { "navigation" } : new string[0]).ToArray();
            // Phase 20: progression, trade, day and night, each from its part of the IR.
            foreach (var (system, label) in new[] { ("progression", "Player progression"), ("trade", "Trading"), ("time", "Day and night") })
            {
                if (!systems.Contains(system)) continue;
                var part = g[system] as JObject;
                if (part == null) r.Errors.Add($"The export has no data for the chosen {label}: export again.");
                else if (system == "progression") p.Progression = part;
                else if (system == "trade") p.Trade = part;
                else p.Time = part;
            }
            if (p.Trade != null && (!systems.Contains("interaction") || !systems.Contains("inventory"))) r.Errors.Add("Trading needs Interaction and the Inventory: choose them in Technical Architecture › Playable prototype.");
            if (systems.Contains("dialogue"))
            {
                p.Dialogue = g["dialogue"] as JObject;
                var lines = (p.Dialogue?["lines"] as JArray ?? new JArray()).OfType<JObject>().ToList();
                if (p.Dialogue == null) r.Errors.Add("The export has no dialogue data for the chosen NPC dialogue system: export again.");
                if (!systems.Contains("interaction")) r.Errors.Add("NPC dialogue needs Interaction (the player talks by interacting): choose it in Technical Architecture › Playable prototype.");
                if (lines.Any(l => l["choice"] != null) && !systems.Contains("quests")) r.Errors.Add("A dialogue option makes a story choice, so NPC dialogue needs Quests and rewards (the quest graph keeps the choices).");
                if (lines.Any(l => (l["give"] as JArray)?.Count > 0) && !systems.Contains("inventory")) r.Errors.Add("A dialogue option gives items, so NPC dialogue needs the Inventory.");
            }
            if (systems.Contains("combat"))
            {
                p.Combat = g["combat"] as JObject;
                if (p.Combat == null) r.Errors.Add("The export has no combat data for the chosen Combat system: export again.");
                else if (p.Combat["player"]?["weapon"] == null) r.Errors.Add("Combat needs a Player weapon with Damage (Technical Architecture › Playable prototype › Player weapon).");
                // The generated PlannerDamageFormula (the plan's damage formula), found by its runtime interface.
                p.DamageFormula = TypeCache.GetTypesDerivedFrom<IPlannerDamageFormula>()
                    .Where(t => typeof(MonoBehaviour).IsAssignableFrom(t) && !t.IsAbstract && !t.Assembly.GetName().Name.EndsWith(".Tests", StringComparison.Ordinal))
                    .OrderBy(t => t.FullName, StringComparer.Ordinal).FirstOrDefault();
                if (p.DamageFormula == null) r.Errors.Add("No generated PlannerDamageFormula: export the plan with Combat chosen, import it and let Unity compile, then build again.");
            }
            if (systems.Contains("crafting"))
            {
                PlannerItemAmount Amount(JToken a) => new PlannerItemAmount((string)a?["item"], (int?)a?["count"] ?? 0);
                p.Recipes = (g["crafting"]?["recipes"] as JArray ?? new JArray()).OfType<JObject>().Select(rec => new PlannerRecipe
                {
                    RecipeId = (string)rec["recipe"],
                    Key = (string)rec["key"],
                    Name = (string)rec["name"],
                    Inputs = (rec["inputs"] as JArray ?? new JArray()).Select(Amount).ToList(),
                    Output = Amount(rec["output"]),
                    UnlockQuests = (rec["unlockQuests"] as JArray ?? new JArray()).Select(q => (string)q).ToList(),
                }).ToList();
                p.CraftingKey = (string)g["input"]?["crafting"]?["key"];
                if (p.Recipes.Count == 0) r.Errors.Add("Crafting is chosen, but the export has no recipe the prototype can craft (Items & Crafting › Recipes).");
                if (!systems.Contains("inventory")) r.Errors.Add("Crafting needs the Inventory system: choose it in Technical Architecture › Playable prototype.");
                if (p.Recipes.Any(x => x.UnlockQuests.Count > 0) && !systems.Contains("quests")) r.Errors.Add("A recipe is unlocked by a quest, so Crafting needs Quests and rewards.");
            }
            if (systems.Contains("saveLoad"))
            {
                var kinds = new Dictionary<string, PlannerStateKind> { ["Player position"] = PlannerStateKind.PlayerPosition, ["Inventory"] = PlannerStateKind.Inventory, ["Quests"] = PlannerStateKind.Quests, ["Combat"] = PlannerStateKind.Combat, ["Dialogue"] = PlannerStateKind.Dialogue, ["Progression"] = PlannerStateKind.Progression, ["Trade"] = PlannerStateKind.Trade, ["Time"] = PlannerStateKind.Time };
                p.SaveParts = (g["save"]?["parts"] as JArray ?? new JArray()).OfType<JObject>()
                    .Where(x => kinds.ContainsKey((string)x["state"] ?? ""))
                    .Select(x => new PlannerStateBinding((string)x["key"], kinds[(string)x["state"]])).ToList();
                p.QuickSaveKey = (string)g["input"]?["quickSave"]?["key"];
                p.QuickLoadKey = (string)g["input"]?["quickLoad"]?["key"];
                if (p.SaveParts.Count == 0) r.Errors.Add("Save and load is chosen, but no saved part has a Runtime state (Technical › Save System › Saved parts).");
                foreach (var (system, kind) in new[] { ("inventory", PlannerStateKind.Inventory), ("quests", PlannerStateKind.Quests), ("combat", PlannerStateKind.Combat), ("dialogue", PlannerStateKind.Dialogue), ("progression", PlannerStateKind.Progression), ("trade", PlannerStateKind.Trade), ("time", PlannerStateKind.Time) })
                    if (p.SaveParts.Any(b => b.State == kind) && !systems.Contains(system)) r.Errors.Add($"A saved part holds {kind}, but the plan does not choose that system.");
                // The generated PlannerSaveSlice (over PlannerSave), found by its runtime interface.
                p.SaveSlice = TypeCache.GetTypesDerivedFrom<IPlannerSaveSystem>()
                    .Where(t => typeof(MonoBehaviour).IsAssignableFrom(t) && !t.IsAbstract && !t.Assembly.GetName().Name.EndsWith(".Tests", StringComparison.Ordinal))
                    .OrderBy(t => t.FullName, StringComparer.Ordinal).FirstOrDefault();
                if (p.SaveSlice == null) r.Errors.Add("No generated PlannerSaveSlice: export the plan with Save and load chosen, import it and let Unity compile, then build again.");
            }
            if (systems.Contains("quests"))
            {
                List<PlannerItemAmount> Amounts(JToken items) => (items as JArray ?? new JArray()).OfType<JObject>().Select(i => new PlannerItemAmount((string)i["item"], (int?)i["count"] ?? 0)).ToList();
                p.Quests = (g["quests"] as JArray ?? new JArray()).OfType<JObject>().Where(q => q["completeWhen"] != null).Select(q => new PlannerQuestRule
                {
                    QuestId = (string)q["quest"],
                    Name = (string)q["name"],
                    Goal = Amounts(q["completeWhen"]?["items"]),
                    Reward = (q["onComplete"] as JArray ?? new JArray()).SelectMany(a => Amounts(a["items"])).ToList(),
                    Money = (int?)q["money"] ?? 0,
                    Xp = (int?)q["xp"] ?? 0,
                }).ToList();
                // The generated PlannerQuestGraph (the plan's quest graph); found by its interface, so the bridge needs no reference to the game's code.
                p.QuestGraph = TypeCache.GetTypesDerivedFrom<IPlannerQuestGraph>()
                    .Where(t => typeof(MonoBehaviour).IsAssignableFrom(t) && !t.IsAbstract && !t.Assembly.GetName().Name.EndsWith(".Tests", StringComparison.Ordinal))
                    .OrderBy(t => t.FullName, StringComparer.Ordinal).FirstOrDefault();
                if (p.QuestGraph == null) r.Errors.Add("No generated PlannerQuestGraph: export the plan with Quests chosen, import it and let Unity compile, then build again.");
                if (!systems.Contains("inventory")) r.Errors.Add("Quests need the Inventory system (their goals are items to hold): choose it in Technical Architecture › Playable prototype.");
            }
            p.Inventory = systems.Contains("inventory") ? g["inventory"] as JObject : null;
            if (systems.Contains("inventory") && p.Inventory == null) r.Errors.Add("The export has no inventory data for the chosen Inventory system: export again.");
            p.UiSize = new Vector2((float?)ir["ui"]?["width"] ?? 1920f, (float?)ir["ui"]?["height"] ?? 1080f);
            // The planned HUD: the generated screen UXML with the HUD class (UI / UX › Screens, kind HUD).
            p.HudUxml = ProjectFiles(root, "*.uxml").FirstOrDefault(f => File.ReadAllText(f).Contains("planner-screen--hud"));

            // The generated input asset with the prototype's action map (unityGameplay.ts names it).
            var actions = ir["input"]?["actions"] as JArray ?? new JArray();
            p.InputMap = actions.Any(a => (string)a["category"] == "Prototype") ? "Planner prototype" : "Prototype";
            foreach (var file in ProjectFiles(root, "*.inputactions"))
            {
                var asset = ReadJson(file);
                if ((asset?["maps"] as JArray)?.Any(m => (string)m["name"] == p.InputMap) == true)
                {
                    p.InputAsset = file;
                    break;
                }
            }
            if (p.InputAsset == null) r.Errors.Add($"No generated input asset (.inputactions) in {root} has the action map “{p.InputMap}”: export again with Player movement chosen and Runtime actions on the controls (UI / UX › Controls).");
            p.InputSource = Type.GetType("HoHPlanner.Runtime.PlannerInputSystemSource, HoHPlanner.Runtime.InputSystem");
            if (p.InputSource == null) r.Errors.Add("The player reads its keys through the Input System: install the Input System package and set Project Settings › Player › Active Input Handling to “Input System Package” or “Both”.");
            return r.Errors.Count > 0 ? null : p;
        }

        // ---- what the scene is made from, and its state ----

        [Serializable]
        private sealed class State
        {
            public int generator;
            public string fingerprint;
            public string scene;
            public string sceneHash;
        }

        private static string Dir(string root) => $"{root}/{Folder}";
        private static string ScenePath(string root, Plan p) => $"{Dir(root)}/{p.SceneFile}.unity";
        private static string PlayerPrefab(string root) => $"{Dir(root)}/Player.prefab";

        private static State ReadState(string root)
        {
            var path = $"{Dir(root)}/{StateFile}";
            try
            {
                return File.Exists(path) ? JsonConvert.DeserializeObject<State>(File.ReadAllText(path)) : null;
            }
            catch (JsonException)
            {
                return null;
            }
        }

        private static string FileHash(string path) => File.Exists(path) ? PlannerOwnership.Fnv1a(File.ReadAllText(path)) : null;

        /// <summary>The prefab an item pickup shows: the first prefab field of its record that is set, else the bridge's placeholder.</summary>
        private static string ItemPrefab(string root, PlannerIndex index, JObject item, out GameObject recordPrefab)
        {
            recordPrefab = null;
            var entry = index != null ? index.FindByPlannerId((string)item["item"]) : null;
            if (entry?.asset != null)
                recordPrefab = entry.asset.GetType().GetFields(BindingFlags.Instance | BindingFlags.Public).Where(f => f.FieldType == typeof(GameObject)).Select(f => f.GetValue(entry.asset) as GameObject).FirstOrDefault(x => x != null);
            return recordPrefab != null ? AssetDatabase.GetAssetPath(recordPrefab) : $"{Dir(root)}/Prefabs/{PlannerGreybox.Safe((string)item["key"] ?? (string)item["item"])}.prefab";
        }

        private static string Fingerprint(string root, Plan p, PlannerIndex index)
        {
            var g = p.Gameplay;
            var parts = new List<string>
            {
                $"generator {GeneratorVersion}",
                $"scene {p.SceneName} {p.SceneFile}",
                g["systems"].ToString(Formatting.None),
                g["scene"].ToString(Formatting.None),
                (g["placements"] ?? new JArray()).ToString(Formatting.None),
                (g["player"] ?? new JObject()).ToString(Formatting.None),
                (g["input"] ?? new JObject()).ToString(Formatting.None),
                (p.Inventory ?? new JObject()).ToString(Formatting.None),
                (g["quests"] ?? new JArray()).ToString(Formatting.None),
                $"graph {p.QuestGraph?.AssemblyQualifiedName}",
                (g["save"] ?? new JObject()).ToString(Formatting.None),
                $"slice {p.SaveSlice?.AssemblyQualifiedName}",
                (g["combat"] ?? new JObject()).ToString(Formatting.None),
                $"formula {p.DamageFormula?.AssemblyQualifiedName}",
                (g["crafting"] ?? new JObject()).ToString(Formatting.None),
                $"hud {p.HudUxml} {(p.HudUxml != null ? AssetDatabase.AssetPathToGUID(p.HudUxml) : "")} {p.UiSize}",
                string.Join(";", p.Items.Select(i => p.ItemNames.TryGetValue((string)i["item"] ?? "", out var nm) ? nm : "")),
                $"input {p.InputAsset} {AssetDatabase.AssetPathToGUID(p.InputAsset)} {p.InputMap}",
                $"shader {(Shader.Find(UrpLit) != null ? UrpLit : "Standard")}",
                $"palette {string.Join(",", PlannerPlaceholders.Palette(root).Select(c => ColorUtility.ToHtmlStringRGB(c)))}",
                $"player {PlayerPrefab(root)}",
                string.Join(";", p.Items.Select(i => ItemPrefab(root, index, i, out _))),
                (g["world"] ?? new JObject()).ToString(Formatting.None),
                (g["dialogue"] ?? new JObject()).ToString(Formatting.None),
                (g["progression"] ?? new JObject()).ToString(Formatting.None),
                (g["trade"] ?? new JObject()).ToString(Formatting.None),
                (g["time"] ?? new JObject()).ToString(Formatting.None),
                string.Join("\n", p.Locations.Select(l => l.MapText.Replace("\r\n", "\n"))),
            };
            return PlannerOwnership.Fnv1a(string.Join("\n", parts));
        }

        private static PlannerIndex Index(string root) => AssetDatabase.LoadAssetAtPath<PlannerIndex>($"{root}/{PlannerImporter.IndexFile}");

        /// <summary>Null when the prototype scene is up to date or the plan wants none; else what to do.</summary>
        public static string Status(string root)
        {
            try
            {
                var r = new PrototypeResult();
                var p = Read(root, r);
                if (p == null) return null;
                var state = ReadState(root);
                var path = ScenePath(root, p);
                if (!File.Exists(path)) return $"The plan's prototype scene {path} is not built yet: Tools ▸ Game Design Planner ▸ Build prototype scene.";
                if (state == null || state.scene != path || state.generator != GeneratorVersion || state.fingerprint != Fingerprint(root, p, Index(root)))
                    return $"The prototype scene {path} is out of date with the plan: Tools ▸ Game Design Planner ▸ Build prototype scene.";
                return null;
            }
            catch (Exception e) when (e is IOException || e is InvalidDataException || e is FormatException || e is InvalidCastException)
            {
                return null;
            }
        }

        // ---- building ----

        public static PrototypeResult Build(string root, bool overwrite = false)
        {
            var r = new PrototypeResult();
            var p = Read(root, r);
            if (p == null) return r;
            var index = Index(root);
            var path = ScenePath(root, p);
            r.Scene = path;
            var state = ReadState(root);
            var fingerprint = Fingerprint(root, p, index);
            Directory.CreateDirectory(Dir(root));

            // The planned scene was renamed: move the bridge's old scene, so its GUID (and Build Settings entry) stays.
            if (state?.scene != null && state.scene != path && File.Exists(state.scene) && !File.Exists(path) && FileHash(state.scene) == state.sceneHash)
            {
                var moved = AssetDatabase.MoveAsset(state.scene, path);
                if (string.IsNullOrEmpty(moved))
                {
                    r.Notes.Add($"Renamed {state.scene} to {path}.");
                    state.scene = path;
                }
            }

            if (File.Exists(path))
            {
                var ours = state != null && state.scene == path && FileHash(path) == state.sceneHash;
                if (!ours)
                {
                    if (!overwrite)
                    {
                        r.Conflict = true;
                        r.Errors.Add($"{path} was changed in Unity since the bridge built it{(state?.scene == path ? "" : ", or the bridge did not build it")}. Move your work into a scene of your own, then build again with overwrite (Tools ▸ Game Design Planner ▸ Build prototype scene, or -hohOverwrite); a copy is kept.");
                        return r;
                    }
                    r.Backup = $"{root}/{PlannerOwnership.BackupDir}/{PlannerOwnership.Stamp(DateTime.UtcNow)}/{Folder}/{Path.GetFileName(path)}";
                    Directory.CreateDirectory(Path.GetDirectoryName(r.Backup));
                    File.Copy(path, r.Backup, true);
                    r.Notes.Add($"The changed scene was copied to {r.Backup}.");
                }
                else if (state.generator == GeneratorVersion && state.fingerprint == fingerprint)
                {
                    r.UpToDate = true;
                    return r;
                }
            }

            var setup = EditorSceneManager.GetSceneManagerSetup();
            if (!Application.isBatchMode && !EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo())
            {
                r.Errors.Add("Cancelled: the open scenes have unsaved changes.");
                return r;
            }
            try
            {
                Make(root, p, index, path, r);
            }
            finally
            {
                if (setup.Length > 0 && setup.All(s => !string.IsNullOrEmpty(s.path))) EditorSceneManager.RestoreSceneManagerSetup(setup);
                else EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            }
            AssetDatabase.SaveAssets();
            if (r.Errors.Count > 0) return r;

            var asset = AssetDatabase.LoadMainAssetAtPath(path);
            if (asset != null) AssetDatabase.SetLabels(asset, new[] { Label });
            File.WriteAllText($"{Dir(root)}/{StateFile}", JsonConvert.SerializeObject(new State { generator = GeneratorVersion, fingerprint = fingerprint, scene = path, sceneHash = FileHash(path) }, Formatting.Indented));
            r.Built = true;

            var others = AssetDatabase.FindAssets("t:Scene").Select(AssetDatabase.GUIDToAssetPath)
                .Where(s => s != path && string.Equals(Path.GetFileNameWithoutExtension(s), p.SceneFile, StringComparison.OrdinalIgnoreCase)).ToList();
            if (others.Count > 0) r.Notes.Add($"Another scene has the same name ({string.Join(", ", others)}); the planned scenes' Build Settings step may take that one. Rename one of them.");
            if (PlannerBuildScenes.ScenesType() == null) r.Notes.Add("No generated PlannerScenes yet: the scene is not added to the Build Settings until the plan's scenes are exported.");
            return r;
        }

        private static void Make(string root, Plan p, PlannerIndex index, string path, PrototypeResult r)
        {
            var dir = Dir(root);
            Directory.CreateDirectory($"{dir}/Materials");
            Directory.CreateDirectory($"{dir}/Meshes");
            Directory.CreateDirectory($"{dir}/Prefabs");
            var palette = PlannerPlaceholders.Palette(root);
            Color Pick(int i, Color fallback) => palette.Count > i ? palette[i] : fallback;
            if (Shader.Find(UrpLit) == null) r.Notes.Add("URP is not installed: the placeholder materials use the Standard shader and turn pink once URP is the render pipeline; build again after installing URP.");
            var style = new PlannerGreybox.LevelStyle
            {
                Floor = Material(dir, "Floor", Pick(3, new Color(0.7f, 0.7f, 0.7f))),
                Wall = Material(dir, "Wall", Pick(0, new Color(0.35f, 0.35f, 0.4f))),
                Door = Material(dir, "Door", PlannerGreybox.DoorColor),
                LockedDoor = Material(dir, "LockedDoor", PlannerGreybox.LockedColor),
                Key = Material(dir, "Key", PlannerGreybox.KeyColor),
                SaveMesh = (mesh, part) => SaveMesh(mesh, $"{dir}/Meshes/{PlannerGreybox.Safe(p.SceneFile)}_{part}.asset"),
            };
            // A point of a location's map in the scene: its offset, x east and y south at its scale.
            Vector3 At(JToken x, float height = 0f)
            {
                var l = p.LocOf((string)x["location"]) ?? p.Locations[0];
                return l.Offset + new Vector3((float)x["x"] * l.Mpu, height, -(float)x["y"] * l.Mpu);
            }

            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            var top = new GameObject($"Planner Prototype {p.SceneName}");
            SceneManager.MoveGameObjectToScene(top, scene);
            var host = top.AddComponent<PlannerRuntimeHost>();
            host.Required.Clear();
            host.Required.AddRange(p.Required);

            // One level per location (the start location's keeps the name “Level” and its mesh assets, as before).
            for (var i = 0; i < p.Locations.Count; i++)
            {
                var l = p.Locations[i];
                var level = PlannerGreybox.Child(top, i == 0 ? "Level" : $"Level: {l.Name}");
                var meshSuffix = i == 0 ? "" : "_" + PlannerGreybox.Safe(l.Id);
                var own = new PlannerGreybox.LevelStyle { Floor = style.Floor, Wall = style.Wall, Door = style.Door, LockedDoor = style.LockedDoor, Key = style.Key, SaveMesh = (mesh, part) => SaveMesh(mesh, $"{dir}/Meshes/{PlannerGreybox.Safe(p.SceneFile)}{meshSuffix}_{part}.asset") };
                PlannerGreybox.Geometry(level, l.Grid, own, l.Mpu * l.Grid.Cell);
                PlannerGreybox.Markers(level, l.Map, own, l.Mpu);
                PlannerGreybox.Lights(level, l.Map, l.Mpu, PlannerGreybox.WallHeight * 1.25f);
                level.transform.position = l.Offset;
                var location = level.AddComponent<PlannerLocation>();
                location.LocationId = l.Id;
                location.Name = l.Name;
                location.Size = l.Size;
            }
            var sun = PlannerGreybox.Child(top, "Sun");
            sun.transform.rotation = Quaternion.Euler(50, -30, 0);
            var sunLight = sun.AddComponent<Light>();
            sunLight.type = LightType.Directional;
            sunLight.shadows = LightShadows.Soft;
            AddUrpData(sun, "UniversalAdditionalLightData");

            // Day and night: the clock dims the sun by the planned day phases.
            PlannerClock clock = null;
            if (p.Time != null)
            {
                clock = PlannerGreybox.Child(top, "Clock").AddComponent<PlannerClock>();
                clock.DayMinutes = Mathf.Max(0.01f, (float?)p.Time["dayMinutes"] ?? 24f);
                clock.StartHour = (float?)p.Time["startHour"] ?? 8f;
                clock.Sun = sunLight;
                clock.Phases = (p.Time["phases"] as JArray ?? new JArray()).OfType<JObject>().Select(x => new PlannerDayPhase { PhaseId = (string)x["phase"], Name = (string)x["name"], Start = (float?)x["start"] ?? 0f, Duration = (float?)x["duration"] ?? 0f, Visibility = (float?)x["visibility"] ?? 100f, MonsterStrength = (float?)x["strength"] ?? 1f }).ToList();
            }
            // Player progression: the planned XP table, cap and points.
            PlannerProgression progression = null;
            if (p.Progression != null)
            {
                progression = PlannerGreybox.Child(top, "Progression").AddComponent<PlannerProgression>();
                progression.LevelCap = (int?)p.Progression["levelCap"] ?? 10;
                progression.XpToNext = (p.Progression["xpToNext"] as JArray ?? new JArray()).Select(x => (int)x).ToList();
                progression.SkillPointsPerLevel = (float?)p.Progression["skillPointsPerLevel"] ?? 0f;
                progression.StatPointsPerLevel = (float?)p.Progression["statPointsPerLevel"] ?? 0f;
                progression.StartSkillPoints = (float?)p.Progression["startSkillPoints"] ?? 0f;
            }

            // Placements: the start, the pickups, and the map's other spawns as markers.
            var placed = PlannerGreybox.Child(top, "Placements");
            var startPos = At(p.Start);
            var startGo = Place(placed, "Player start", startPos, PlannerPlacement.PlayerRole, (string)p.Start["object"], p.LocationId, null, null, 1);
            string LocIdOf(JToken x) => (string)x["location"] ?? p.LocationId;
            var itemMat = Material(dir, "Item", PlannerGreybox.KeyColor);
            foreach (var item in p.Items)
            {
                var key = (string)item["key"];
                var count = (int?)item["count"] ?? 1;
                var go = Place(placed, $"Item: {key ?? (string)item["item"]}" + (count > 1 ? $" ×{count}" : ""), At(item), PlannerPlacement.ItemRole, (string)item["object"], LocIdOf(item), (string)item["item"], key, count);
                if (p.Interaction) go.AddComponent<PlannerPickup>().DisplayName = p.ItemNames.TryGetValue((string)item["item"] ?? "", out var itemName) ? itemName : null;
                var trigger = go.AddComponent<SphereCollider>();
                trigger.isTrigger = true;
                trigger.radius = 0.75f;
                trigger.center = new Vector3(0f, 0.5f, 0f);
                var prefabPath = ItemPrefab(root, index, item, out var recordPrefab);
                var prefab = recordPrefab != null ? recordPrefab : AssetDatabase.LoadAssetAtPath<GameObject>(prefabPath) ?? ItemPlaceholder(prefabPath, itemMat);
                var visual = (GameObject)PrefabUtility.InstantiatePrefab(prefab, scene);
                visual.transform.SetParent(go.transform, false);
                visual.transform.localPosition = new Vector3(0f, 0.3f, 0f);
                if (key == null) r.Notes.Add($"The item {(string)item["item"]} has no data record (give it an Item schema in Data-driven Design), so its pickup has no record key.");
            }
            var spawnMat = Material(dir, "Spawn", Pick(1, new Color(0.95f, 0.6f, 0.3f)));
            foreach (var (l, s) in p.Locations.SelectMany(l => (l.Map["spawns"] as JArray ?? new JArray()).OfType<JObject>().Select(x => (l, x))))
            {
                s["location"] = l.Id;
                var role = (string)s["role"] ?? "spawn";
                if (role == PlannerPlacement.PlayerRole || role == PlannerPlacement.ItemRole || (role == "enemy" && p.Combat != null) || (role == "npc" && p.Dialogue != null) || (role == "merchant" && p.Trade != null)) continue;
                var label = (string)s["label"];
                var go = Place(placed, $"Spawn: {role}" + (string.IsNullOrEmpty(label) ? "" : $" ({label})"), At(s), role, (string)s["id"], l.Id, (string)s["refId"], null, (int?)s["count"] ?? 1);
                var marker = PlannerGreybox.Primitive(PrimitiveType.Capsule, go, "Marker", startPos, Vector3.one, spawnMat, false);
                marker.transform.localPosition = new Vector3(0f, 1f, 0f);
            }

            // The player and its camera.
            var playerPrefab = PlayerPrefabAsset(root, p, Material(dir, "Player", Pick(2, new Color(0.3f, 0.55f, 0.9f))), r);
            if (playerPrefab == null) return;
            var playerGo = (GameObject)PrefabUtility.InstantiatePrefab(playerPrefab, scene);
            playerGo.transform.SetParent(top.transform, false);
            playerGo.transform.position = startPos + new Vector3(0f, 0.05f, 0f);
            var player = playerGo.GetComponent<PlannerPlayer>();
            var movement = playerGo.GetComponent<PlannerMovement>();
            movement.MoveSpeed = p.Player.MoveSpeed;
            var source = playerGo.GetComponent(p.InputSource);
            var so = new SerializedObject(source);
            so.FindProperty("Actions").objectReferenceValue = AssetDatabase.LoadMainAssetAtPath(p.InputAsset);
            so.FindProperty("Map").stringValue = p.InputMap;
            so.ApplyModifiedPropertiesWithoutUndo();

            var camGo = new GameObject("Main Camera") { tag = "MainCamera" };
            camGo.transform.SetParent(top.transform, false);
            camGo.AddComponent<Camera>();
            camGo.AddComponent<AudioListener>();
            AddUrpData(camGo, "UniversalAdditionalCameraData");
            var follow = camGo.AddComponent<PlannerThirdPersonCamera>();
            follow.Target = playerGo.transform;
            follow.Distance = p.Player.CameraDistance;
            follow.Height = p.Player.CameraHeight;
            follow.Snap();
            movement.Camera = follow;
            player.Movement = movement;
            player.FollowCamera = follow;
            PrefabUtility.RecordPrefabInstancePropertyModifications(movement);
            PrefabUtility.RecordPrefabInstancePropertyModifications(player);

            // Interaction: a scene object (not part of your Player.prefab) that uses the nearest target in the planned range.
            if (p.Interaction)
            {
                var interaction = PlannerGreybox.Child(top, "Interaction");
                var interactor = interaction.AddComponent<PlannerInteractor>();
                interactor.Player = playerGo.transform;
                interactor.Range = p.InteractRange;
                var prompt = interaction.AddComponent<PlannerInteractionPrompt>();
                prompt.Interactor = interactor;
                prompt.KeyLabel = p.InteractKey ?? "";
            }

            // Passages between the locations (phase 18): interacting moves the player to the way back on the other map.
            var passages = (p.Gameplay["world"]?["passages"] as JArray ?? new JArray()).OfType<JObject>().Where(x => p.Has(x) && p.LocOf((string)x["to"]) != null).ToList();
            if (passages.Count > 0 && !p.Interaction) r.Errors.Add("The prototype has more than one location, and passages are used by interacting: choose Interaction (pick up, use).");
            if (p.Interaction)
            {
                var passageMat = Material(dir, "Passage", PlannerGreybox.DoorColor);
                foreach (var x in passages)
                {
                    var to = p.LocOf((string)x["to"]);
                    var go = Place(placed, $"Passage: to {to.Name}", At(x), "passage", (string)x["object"], LocIdOf(x), null, null, 1);
                    var arrival = new GameObject("Arrival");
                    arrival.transform.SetParent(go.transform, false);
                    var a = (JObject)x["arrival"];
                    arrival.transform.position = to.Offset + new Vector3((float)a["x"] * to.Mpu, 0f, -(float)a["y"] * to.Mpu);
                    var passage = go.AddComponent<PlannerPassage>();
                    passage.PassageId = (string)x["object"];
                    passage.FromLocation = LocIdOf(x);
                    passage.ToLocation = to.Id;
                    passage.ToName = to.Name;
                    passage.Arrival = arrival.transform;
                    var marker = PlannerGreybox.Primitive(PrimitiveType.Cylinder, go, "Marker", go.transform.position, new Vector3(0.9f, 0.05f, 0.9f), passageMat, false);
                    marker.transform.localPosition = new Vector3(0f, 0.05f, 0f);
                }
            }

            // Inventory: slots and the planned items with their stack sizes.
            PlannerInventory inventory = null;
            if (p.Inventory != null)
            {
                inventory = PlannerGreybox.Child(top, "Inventory").AddComponent<PlannerInventory>();
                inventory.Slots = Math.Max(1, (int?)p.Inventory["slots"] ?? 1);
                inventory.Items = (p.Inventory["items"] as JArray ?? new JArray()).OfType<JObject>()
                    .Select(i => new PlannerItemDef { ItemId = (string)i["item"], Key = (string)i["key"], Name = (string)i["name"], Stack = Math.Max(1, (int?)i["stack"] ?? 1) }).ToList();
            }

            // Quests: the generated quest graph and the quest module with the plan's typed rules.
            PlannerQuests quests = null;
            if (p.Quests != null && inventory != null && p.QuestGraph != null)
            {
                var questsGo = PlannerGreybox.Child(top, "Quests");
                var graph = (MonoBehaviour)questsGo.AddComponent(p.QuestGraph);
                quests = questsGo.AddComponent<PlannerQuests>();
                quests.Graph = graph;
                quests.Inventory = inventory;
                quests.Rules = p.Quests;
            }

            // Combat (the first supported model): the player's health, the combat module with the generated damage formula,
            // and each placed enemy with its planned values, its body (Prototype/Prefabs/<enemy>.prefab, made once, then
            // yours) and the loot it holds once defeated.
            PlannerCombat combat = null;
            if (p.Combat != null && p.DamageFormula != null)
            {
                var combatGo = PlannerGreybox.Child(top, "Combat");
                var playerHealth = combatGo.AddComponent<PlannerHealth>();
                playerHealth.Max = (float?)p.Combat["player"]?["hp"] ?? 100f;
                combat = combatGo.AddComponent<PlannerCombat>();
                combat.Player = player;
                combat.PlayerHealth = playerHealth;
                combat.Formula = (MonoBehaviour)combatGo.AddComponent(p.DamageFormula);
                combat.Respawn = startGo.transform;
                var weapon = p.Combat["player"]?["weapon"] as JObject;
                combat.WeaponId = (string)weapon?["item"];
                combat.WeaponDamage = (float?)weapon?["damage"] ?? 1f;
                combat.WeaponDamageType = (string)weapon?["damageType"];
                combat.WeaponRate = (float?)weapon?["attackRate"] ?? 1f;
                combat.AttackRange = (float?)p.Combat["player"]?["attackRange"] ?? 1.5f;
                combat.AggroRadius = (float?)p.Combat["aggroRadius"] ?? 8f;
                combat.EnemyReach = (float?)p.Combat["enemyReach"] ?? 1.5f;
                // Phase 19: the levels' navigation mesh, baked when the game starts, for the enemies' ways.
                var navigation = PlannerGreybox.Child(top, "Navigation").AddComponent<PlannerNavigation>();
                combat.Navigation = navigation;
                combat.Clock = clock;
                var forget = (float?)p.Combat["forgetAfter"] ?? 3f;
                var enemyMat = Material(dir, "Enemy", new Color(0.75f, 0.2f, 0.2f));
                var defs = (p.Combat["enemies"] as JArray ?? new JArray()).OfType<JObject>().ToList();
                foreach (var e in (p.Gameplay["placements"] as JArray ?? new JArray()).OfType<JObject>().Where(x => p.Has(x) && (string)x["role"] == "enemy"))
                {
                    var def = defs.FirstOrDefault(d => (string)d["enemy"] == (string)e["enemy"]);
                    if (def == null)
                    {
                        r.Notes.Add($"The enemy {(string)e["enemy"]} on the map is not one the prototype runs (see the export's diagnostics); it is left out.");
                        continue;
                    }
                    var go = Place(placed, $"Enemy: {(string)def["name"]}", At(e), "enemy", (string)e["object"], LocIdOf(e), null, null, 1);
                    var cc = go.AddComponent<CharacterController>();
                    cc.height = 1.6f;
                    cc.radius = 0.4f;
                    cc.center = new Vector3(0f, 0.8f, 0f);
                    go.AddComponent<PlannerHealth>().Max = (float?)def["hp"] ?? 1f;
                    var enemy = go.AddComponent<PlannerEnemy>();
                    enemy.Combat = combat;
                    enemy.EnemyId = (string)def["enemy"];
                    enemy.Name = (string)def["name"];
                    enemy.Damage = (float?)def["damage"] ?? 1f;
                    enemy.AttackRate = (float?)def["attackRate"] ?? 1f;
                    enemy.Armor = (float?)def["armor"] ?? 0f;
                    enemy.Speed = (float?)def["speed"] ?? 2f;
                    enemy.Passive = (bool?)def["passive"] ?? false;
                    enemy.Xp = (int?)def["xp"] ?? 0;
                    enemy.Navigation = navigation;
                    enemy.SightRange = (float?)def["sight"] ?? combat.AggroRadius;
                    enemy.GiveUp = (float?)def["giveUp"] ?? 0f;
                    enemy.ForgetAfter = forget;
                    enemy.Route = (e["route"] as JArray ?? new JArray()).OfType<JObject>().Select(pt => { pt["location"] = e["location"]; return At(pt); }).ToList();
                    enemy.Resistances = ((def["resistances"] as JObject)?.Properties() ?? Enumerable.Empty<JProperty>()).Select(x => new PlannerResistance { DamageType = x.Name, Percent = (float)x.Value }).ToList();
                    var loot = go.AddComponent<PlannerLoot>();
                    loot.Inventory = inventory;
                    loot.Items = (def["loot"] as JArray ?? new JArray()).OfType<JObject>().Select(x => new PlannerItemAmount((string)x["item"], (int?)x["count"] ?? 1)).ToList();
                    loot.enabled = false;
                    if (loot.Items.Count > 0 && inventory == null) r.Notes.Add($"{enemy.Name} drops loot, but the plan has no inventory to take it into.");
                    var bodyPath = $"{dir}/Prefabs/{PlannerGreybox.Safe((string)def["key"] ?? (string)def["enemy"])}.prefab";
                    var bodyPrefab = AssetDatabase.LoadAssetAtPath<GameObject>(bodyPath) ?? EnemyPlaceholder(bodyPath, enemyMat);
                    var body = (GameObject)PrefabUtility.InstantiatePrefab(bodyPrefab, scene);
                    body.transform.SetParent(go.transform, false);
                    body.transform.localPosition = new Vector3(0f, 0.8f, 0f);
                    enemy.Body = body;
                }
            }

            // NPC dialogue: the plan's typed Dialogue lines, the panel, and each placed NPC (spawn role “npc” with a character)
            // with its body (Prototype/Prefabs/Npc<name>.prefab, made once, then yours).
            PlannerDialogue dialogue = null;
            if (p.Dialogue != null && p.Interaction)
            {
                var dialogueGo = PlannerGreybox.Child(top, "Dialogue");
                dialogue = dialogueGo.AddComponent<PlannerDialogue>();
                dialogue.Quests = quests;
                dialogue.Inventory = inventory;
                dialogue.Lines = (p.Dialogue["lines"] as JArray ?? new JArray()).OfType<JObject>().Select(l => new PlannerDialogueLine
                {
                    LineId = (string)l["line"],
                    Speaker = (string)l["speaker"],
                    Text = (string)l["text"],
                    After = (string)l["after"],
                    Option = (string)l["option"],
                    ChoiceId = (string)l["choice"],
                    Give = (l["give"] as JArray ?? new JArray()).OfType<JObject>().Select(x => new PlannerItemAmount((string)x["item"], (int?)x["count"] ?? 1)).ToList(),
                }).ToList();
                var names = (p.Dialogue["characters"] as JArray ?? new JArray()).OfType<JObject>().ToDictionary(c => (string)c["character"], c => (string)c["name"] ?? (string)c["character"]);
                var panel = dialogueGo.AddComponent<PlannerDialoguePanel>();
                panel.Dialogue = dialogue;
                panel.SpeakerIds = names.Keys.ToList();
                panel.SpeakerNames = names.Values.ToList();
                var npcMat = Material(dir, "Npc", new Color(0.3f, 0.7f, 0.45f));
                foreach (var x in (p.Gameplay["placements"] as JArray ?? new JArray()).OfType<JObject>().Where(x => p.Has(x) && (string)x["role"] == "npc"))
                {
                    var character = (string)x["character"];
                    var name = names.TryGetValue(character ?? "", out var nm) ? nm : character;
                    var go = Place(placed, $"NPC: {name}", At(x), "npc", (string)x["object"], LocIdOf(x), null, null, 1);
                    var col = go.AddComponent<CapsuleCollider>();
                    col.height = 1.6f;
                    col.radius = 0.35f;
                    col.center = new Vector3(0f, 0.8f, 0f);
                    var npc = go.AddComponent<PlannerNpc>();
                    npc.Dialogue = dialogue;
                    npc.CharacterId = character;
                    npc.Name = name;
                    if (dialogue.StartLine(character) == null) r.Notes.Add($"{name} has no Dialogue line that starts a conversation (Story & Quests › Dialogue lines), so it does not talk.");
                    var bodyPath = $"{dir}/Prefabs/Npc{PlannerGreybox.Safe(name)}.prefab";
                    var bodyPrefab = AssetDatabase.LoadAssetAtPath<GameObject>(bodyPath) ?? EnemyPlaceholder(bodyPath, npcMat);
                    var body = (GameObject)PrefabUtility.InstantiatePrefab(bodyPrefab, scene);
                    body.transform.SetParent(go.transform, false);
                    body.transform.localPosition = new Vector3(0f, 0.8f, 0f);
                }
            }

            // Trading: the wallet, and each placed merchant with its planned offers and its body (Prototype/Prefabs/Merchant<name>.prefab, made once, then yours).
            PlannerTrade trade = null;
            if (p.Trade != null && inventory != null && p.Interaction)
            {
                trade = PlannerGreybox.Child(top, "Trade").AddComponent<PlannerTrade>();
                trade.Inventory = inventory;
                trade.StartMoney = (int?)p.Trade["startMoney"] ?? 0;
                trade.WalletCap = (int?)p.Trade["walletCap"] ?? 0;
                var defs = (p.Trade["merchants"] as JArray ?? new JArray()).OfType<JObject>().ToList();
                var merchantMat = Material(dir, "Merchant", new Color(0.85f, 0.65f, 0.25f));
                List<PlannerPrice> Prices(JToken t) => (t as JArray ?? new JArray()).OfType<JObject>().Select(x => new PlannerPrice((string)x["item"], (int?)x["price"] ?? 0)).ToList();
                foreach (var x in (p.Gameplay["placements"] as JArray ?? new JArray()).OfType<JObject>().Where(x => p.Has(x) && (string)x["role"] == "merchant"))
                {
                    var def = defs.FirstOrDefault(d => (string)d["merchant"] == (string)x["merchant"]);
                    if (def == null)
                    {
                        r.Notes.Add($"The merchant {(string)x["merchant"]} on the map is not one the prototype runs (see the export's diagnostics); it is left out.");
                        continue;
                    }
                    var name = (string)def["name"] ?? (string)def["merchant"];
                    var go = Place(placed, $"Merchant: {name}", At(x), "merchant", (string)x["object"], LocIdOf(x), null, null, 1);
                    var col = go.AddComponent<CapsuleCollider>();
                    col.height = 1.6f;
                    col.radius = 0.35f;
                    col.center = new Vector3(0f, 0.8f, 0f);
                    var m = go.AddComponent<PlannerMerchant>();
                    m.Trade = trade;
                    m.MerchantId = (string)def["merchant"];
                    m.Name = name;
                    m.Sells = Prices(def["sells"]);
                    m.Buys = Prices(def["buys"]);
                    m.StartGold = (int?)def["gold"] ?? -1;
                    var bodyPath = $"{dir}/Prefabs/Merchant{PlannerGreybox.Safe(name)}.prefab";
                    var bodyPrefab = AssetDatabase.LoadAssetAtPath<GameObject>(bodyPath) ?? EnemyPlaceholder(bodyPath, merchantMat);
                    var body = (GameObject)PrefabUtility.InstantiatePrefab(bodyPrefab, scene);
                    body.transform.SetParent(go.transform, false);
                    body.transform.localPosition = new Vector3(0f, 0.8f, 0f);
                }
            }

            // Crafting: the plan's recipes in the inventory, and the panel the planned control opens.
            if (p.Recipes != null && inventory != null)
            {
                var craftingGo = PlannerGreybox.Child(top, "Crafting");
                var crafting = craftingGo.AddComponent<PlannerCrafting>();
                crafting.Inventory = inventory;
                crafting.Quests = p.Recipes.Any(x => x.UnlockQuests.Count > 0) ? quests : null;
                crafting.Recipes = p.Recipes;
                var panel = craftingGo.AddComponent<PlannerCraftingPanel>();
                panel.Crafting = crafting;
                panel.Player = playerGo.transform;
                panel.KeyLabel = p.CraftingKey ?? "";
            }

            // Saving: the runtime state of the linked parts, and the generated save slice over PlannerSave.
            if (p.SaveParts != null && p.SaveSlice != null)
            {
                var saveGo = PlannerGreybox.Child(top, "Save");
                var state = saveGo.AddComponent<PlannerGameState>();
                state.Player = player;
                state.Inventory = inventory;
                state.Quests = quests;
                state.Combat = combat;
                state.Dialogue = dialogue;
                state.Progression = progression;
                state.Trade = trade;
                state.Clock = clock;
                state.Parts = p.SaveParts;
                var slice = saveGo.AddComponent(p.SaveSlice);
                var field = p.SaveSlice.GetField("State");
                if (field != null) field.SetValue(slice, state);
                else r.Errors.Add($"{p.SaveSlice.Name} has no State field; export again.");
                // Quick save and quick load while playing, with the planned controls, into the first manual slot.
                var quick = saveGo.AddComponent<PlannerQuickSave>();
                quick.SaveSystem = (MonoBehaviour)slice;
                quick.Player = playerGo.transform;
                quick.Slot = "manual-1";
                quick.SaveKeyLabel = p.QuickSaveKey ?? "";
                quick.LoadKeyLabel = p.QuickLoadKey ?? "";
                if (p.QuickSaveKey == null || p.QuickLoadKey == null) r.Notes.Add("The plan has no keyboard key for Quick save or Quick load (UI / UX › Controls › Runtime action), so the game saves and loads only from code.");
            }

            // The planned HUD, bound to the inventory.
            if (p.HudUxml != null)
            {
                var hud = PlannerGreybox.Child(top, "HUD");
                var document = hud.AddComponent<UIDocument>();
                document.panelSettings = PanelSettingsAsset(dir, p.UiSize);
                document.visualTreeAsset = AssetDatabase.LoadAssetAtPath<VisualTreeAsset>(p.HudUxml);
                if (document.visualTreeAsset == null) r.Errors.Add($"{p.HudUxml} is not an imported UXML asset; import the export again.");
                if (inventory != null)
                {
                    var binding = hud.AddComponent<PlannerHudBinding>();
                    binding.Document = document;
                    binding.Inventory = inventory;
                    binding.Quests = quests;
                    binding.PlayerHealth = combat != null ? combat.PlayerHealth : null;
                }
            }
            else if (inventory != null) r.Notes.Add("The plan has no HUD screen (UI / UX › Screens, kind HUD), so nothing shows the inventory.");

            if (!EditorSceneManager.SaveScene(scene, path)) r.Errors.Add($"Could not save {path}.");
        }

        /// <summary>Prototype/UI/PanelSettings.asset with Unity's default runtime theme: made once, then yours.</summary>
        private static PanelSettings PanelSettingsAsset(string dir, Vector2 size)
        {
            var path = $"{dir}/UI/PanelSettings.asset";
            var existing = AssetDatabase.LoadAssetAtPath<PanelSettings>(path);
            if (existing != null) return existing;
            Directory.CreateDirectory($"{dir}/UI");
            var themePath = $"{dir}/UI/PlannerRuntimeTheme.tss";
            if (!File.Exists(themePath))
            {
                File.WriteAllText(themePath, "@import url(\"unity-theme://default\");\n");
                AssetDatabase.ImportAsset(themePath);
            }
            var settings = ScriptableObject.CreateInstance<PanelSettings>();
            settings.themeStyleSheet = AssetDatabase.LoadAssetAtPath<ThemeStyleSheet>(themePath);
            settings.scaleMode = PanelScaleMode.ScaleWithScreenSize;
            settings.referenceResolution = new Vector2Int(Mathf.RoundToInt(size.x), Mathf.RoundToInt(size.y));
            AssetDatabase.CreateAsset(settings, path);
            return settings;
        }

        private static GameObject Place(GameObject parent, string name, Vector3 at, string role, string objectId, string location, string item, string key, int count)
        {
            var go = PlannerGreybox.Child(parent, name);
            go.transform.position = at;
            var pl = go.AddComponent<PlannerPlacement>();
            pl.Role = role;
            pl.ObjectId = objectId;
            pl.LocationId = location;
            pl.ItemId = item;
            pl.ItemKey = key;
            pl.Count = Math.Max(1, count);
            return go;
        }

        /// <summary>Prototype/Player.prefab: made when missing, then yours. It must keep a PlannerPlayer, a PlannerMovement and the input source.</summary>
        private static GameObject PlayerPrefabAsset(string root, Plan p, Material material, PrototypeResult r)
        {
            var path = PlayerPrefab(root);
            var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(path);
            if (prefab != null)
            {
                var missing = new[] { typeof(CharacterController), typeof(PlannerMovement), typeof(PlannerPlayer), p.InputSource }.Where(t => prefab.GetComponent(t) == null).Select(t => t.Name).ToList();
                if (missing.Count > 0) r.Errors.Add($"{path} is yours, but its root has no {string.Join(", ", missing)}: add them, or delete the prefab and build again for a new one.");
                return missing.Count > 0 ? null : prefab;
            }
            var go = new GameObject("Player");
            try
            {
                var cc = go.AddComponent<CharacterController>();
                cc.height = 2f;
                cc.radius = 0.4f;
                cc.center = new Vector3(0f, 1f, 0f);
                var movement = go.AddComponent<PlannerMovement>();
                go.AddComponent(p.InputSource);
                go.AddComponent<PlannerPlayer>().Movement = movement;
                var body = PlannerGreybox.Primitive(PrimitiveType.Capsule, go, "Body", new Vector3(0f, 1f, 0f), new Vector3(0.8f, 1f, 0.8f), material, false);
                var nose = PlannerGreybox.Primitive(PrimitiveType.Cube, body, "Facing", Vector3.zero, Vector3.one, material, false);
                nose.transform.localPosition = new Vector3(0f, 0.5f, 0.5f);
                nose.transform.localScale = new Vector3(0.3f, 0.15f, 0.4f);
                return PrefabUtility.SaveAsPrefabAsset(go, path);
            }
            finally
            {
                UnityEngine.Object.DestroyImmediate(go);
            }
        }

        /// <summary>Prototype/Prefabs/&lt;key&gt;.prefab for an item without a prefab: made when missing, then yours.</summary>
        /// <summary>Prototype/Prefabs/&lt;enemy&gt;.prefab for an enemy's (or an NPC's) body: a capsule, made when missing, then yours.</summary>
        private static GameObject EnemyPlaceholder(string path, Material material)
        {
            var go = GameObject.CreatePrimitive(PrimitiveType.Capsule);
            try
            {
                go.name = Path.GetFileNameWithoutExtension(path);
                go.transform.localScale = new Vector3(0.8f, 0.8f, 0.8f);
                UnityEngine.Object.DestroyImmediate(go.GetComponent<Collider>());
                go.GetComponent<Renderer>().sharedMaterial = material;
                return PrefabUtility.SaveAsPrefabAsset(go, path);
            }
            finally
            {
                UnityEngine.Object.DestroyImmediate(go);
            }
        }

        private static GameObject ItemPlaceholder(string path, Material material)
        {
            var go = GameObject.CreatePrimitive(PrimitiveType.Cube);
            try
            {
                go.name = Path.GetFileNameWithoutExtension(path);
                go.transform.localScale = Vector3.one * 0.4f;
                UnityEngine.Object.DestroyImmediate(go.GetComponent<Collider>());
                go.GetComponent<Renderer>().sharedMaterial = material;
                return PrefabUtility.SaveAsPrefabAsset(go, path);
            }
            finally
            {
                UnityEngine.Object.DestroyImmediate(go);
            }
        }

        /// <summary>A URP Lit material when URP is installed, else Standard; the bridge's, so it is updated in place (same GUID).</summary>
        private static Material Material(string dir, string name, Color color)
        {
            var path = $"{dir}/Materials/Prototype_{name}.mat";
            var shader = Shader.Find(UrpLit) ?? Shader.Find("Standard");
            var material = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (material == null)
            {
                material = new Material(shader);
                AssetDatabase.CreateAsset(material, path);
            }
            else if (material.shader != shader) material.shader = shader;
            if (material.HasProperty("_BaseColor")) material.SetColor("_BaseColor", color);
            if (material.HasProperty("_Color")) material.color = color;
            EditorUtility.SetDirty(material);
            return material;
        }

        /// <summary>Writes the mesh into the asset at <paramref name="path"/>, reusing the asset (and its GUID) when it exists.</summary>
        private static Mesh SaveMesh(Mesh mesh, string path)
        {
            var existing = AssetDatabase.LoadAssetAtPath<Mesh>(path);
            if (existing == null)
            {
                AssetDatabase.CreateAsset(mesh, path);
                return mesh;
            }
            existing.Clear();
            existing.indexFormat = mesh.indexFormat;
            existing.SetVertices(mesh.vertices);
            existing.SetNormals(mesh.normals);
            existing.SetTriangles(mesh.triangles, 0);
            existing.RecalculateBounds();
            EditorUtility.SetDirty(existing);
            UnityEngine.Object.DestroyImmediate(mesh);
            return existing;
        }

        /// <summary>URP's per-camera and per-light data, added now so opening the scene does not change it.</summary>
        private static void AddUrpData(GameObject go, string type)
        {
            var t = Type.GetType($"UnityEngine.Rendering.Universal.{type}, Unity.RenderPipelines.Universal.Runtime");
            if (t != null && go.GetComponent(t) == null) go.AddComponent(t);
        }
    }
}
