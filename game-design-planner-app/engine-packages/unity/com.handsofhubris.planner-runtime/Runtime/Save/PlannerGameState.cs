using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;

namespace HoHPlanner.Runtime
{
    /// <summary>The runtime state a saved part holds (Save System › Saved parts › Runtime state).</summary>
    public enum PlannerStateKind
    {
        PlayerPosition,
        Inventory,
        Quests,
        /// <summary>The player's health, and each enemy's health and whether it is defeated and looted.</summary>
        Combat,
        /// <summary>The dialogue options already picked (their consequences ran once); the choices they made are saved with the quests.</summary>
        Dialogue,
        /// <summary>XP, level, skill and stat points.</summary>
        Progression,
        /// <summary>The money, and what each merchant can still pay.</summary>
        Trade,
        /// <summary>The hour and the day.</summary>
        Time,
    }

    /// <summary>A saved part of the plan (its save key) and the runtime state it holds.</summary>
    [Serializable]
    public struct PlannerStateBinding
    {
        public string SaveKey;
        public PlannerStateKind State;

        public PlannerStateBinding(string saveKey, PlannerStateKind state)
        {
            SaveKey = saveKey;
            State = state;
        }
    }

    /// <summary>A part's saved state cannot be used: damaged, or it names what this build of the plan does not have.</summary>
    public sealed class PlannerStateException : Exception
    {
        public PlannerStateException(string message, Exception inner = null) : base(message, inner) { }
    }

    /// <summary>The game's save system as the runtime sees it: the export's generated PlannerSaveSlice over PlannerSave.</summary>
    public interface IPlannerSaveSystem
    {
        /// <summary>Saves every linked part into the slot.</summary>
        void Save(string slot);

        /// <summary>Loads the slot; false when it is empty. A save that cannot be used throws, and nothing changes.</summary>
        bool Load(string slot);

        /// <summary>Removes the slot's file, if there is one.</summary>
        void Delete(string slot);
    }

    /// <summary>
    /// The state of the running prototype, part by part, as JSON: the player's position and facing; the inventory with
    /// the map pickups already taken (they belong together: a taken pickup's item is in the inventory, so they are saved
    /// and restored as one); the dialogue options already picked; the quests with the quest graph's log and the rewards given. Restoring checks the whole part
    /// before changing anything: a damaged part, an unknown item, a count or slot the plan does not allow, or an unknown
    /// pickup throws <see cref="PlannerStateException"/>. While parts are restored (<see cref="BeginRestore"/> …
    /// <see cref="EndRestore"/>) the quests wait, so a restored inventory never completes a quest a second time.
    /// </summary>
    [AddComponentMenu("Game Design Planner/Planner Game State")]
    public sealed class PlannerGameState : MonoBehaviour
    {
        public PlannerPlayer Player;
        public PlannerInventory Inventory;
        public PlannerQuests Quests;
        public PlannerCombat Combat;
        public PlannerDialogue Dialogue;
        public PlannerProgression Progression;
        public PlannerTrade Trade;
        public PlannerClock Clock;
        [Tooltip("The plan's saved parts linked to a runtime state, in plan order.")]
        public List<PlannerStateBinding> Parts = new List<PlannerStateBinding>();

        [Serializable]
        sealed class PlayerJson
        {
            public float x, y, z, yaw;
        }

        [Serializable]
        sealed class SlotJson
        {
            public string item;
            public int count;
        }

        [Serializable]
        sealed class InventoryJson
        {
            public List<SlotJson> slots = new List<SlotJson>();
            public List<string> taken = new List<string>();
        }

        [Serializable]
        sealed class QuestsJson
        {
            public string graph;
            public List<string> active = new List<string>();
            public List<string> rewarded = new List<string>();
            public List<string> waiting = new List<string>();
        }

        [Serializable]
        sealed class DialogueJson
        {
            public List<string> picked = new List<string>();
        }

        [Serializable]
        sealed class EnemyJson
        {
            public string id;
            public float hp;
            public bool defeated;
            public bool looted;
        }

        [Serializable]
        sealed class CombatJson
        {
            public float playerHp;
            public List<EnemyJson> enemies = new List<EnemyJson>();
        }

        static PlannerEnemy[] AllEnemies() => FindObjectsByType<PlannerEnemy>(FindObjectsInactive.Include, FindObjectsSortMode.None);
        static string IdOf(PlannerEnemy e) => e.Placement != null ? e.Placement.ObjectId : e.name;

        static PlannerPickup[] Pickups() => FindObjectsByType<PlannerPickup>(FindObjectsInactive.Include, FindObjectsSortMode.None);

        public void BeginRestore()
        {
            if (Quests != null) Quests.Paused = true;
        }

        public void EndRestore()
        {
            if (Quests == null) return;
            Quests.Paused = false;
            Quests.Refresh();
        }

        public string Capture(PlannerStateKind kind)
        {
            switch (kind)
            {
                case PlannerStateKind.PlayerPosition:
                    var t = Need(Player, kind).transform;
                    return JsonUtility.ToJson(new PlayerJson { x = t.position.x, y = t.position.y, z = t.position.z, yaw = t.eulerAngles.y });
                case PlannerStateKind.Inventory:
                    var inv = new InventoryJson();
                    foreach (var s in Need(Inventory, kind).Contents) inv.slots.Add(s.Empty ? new SlotJson() : new SlotJson { item = s.ItemId, count = s.Count });
                    inv.taken = Pickups().Where(p => p.Taken).Select(p => p.Placement.ObjectId).OrderBy(x => x, StringComparer.Ordinal).ToList();
                    return JsonUtility.ToJson(inv);
                case PlannerStateKind.Combat:
                    var combat = Need(Combat, kind);
                    var cj = new CombatJson { playerHp = combat.PlayerHealth != null ? combat.PlayerHealth.Current : 0f };
                    foreach (var e in AllEnemies().OrderBy(IdOf, StringComparer.Ordinal))
                    {
                        var loot = e.GetComponent<PlannerLoot>();
                        cj.enemies.Add(new EnemyJson { id = IdOf(e), hp = e.Health.Current, defeated = e.Defeated, looted = loot != null && loot.Looted });
                    }
                    return JsonUtility.ToJson(cj);
                case PlannerStateKind.Dialogue:
                    return JsonUtility.ToJson(new DialogueJson { picked = Need(Dialogue, kind).CaptureState() });
                case PlannerStateKind.Progression:
                    return JsonUtility.ToJson(Need(Progression, kind).CaptureState());
                case PlannerStateKind.Trade:
                    return JsonUtility.ToJson(Need(Trade, kind).CaptureState());
                case PlannerStateKind.Time:
                    return JsonUtility.ToJson(Need(Clock, kind).CaptureState());
                default:
                    var q = Need(Quests, kind);
                    var state = q.CaptureState();
                    return JsonUtility.ToJson(new QuestsJson { graph = state.Graph, active = state.Active, rewarded = state.Rewarded, waiting = state.Waiting });
            }
        }

        /// <summary>Checks a part's saved state without changing anything (the loader checks every part first).</summary>
        public void Check(PlannerStateKind kind, string json) => Restore(kind, json, false);

        public void Restore(PlannerStateKind kind, string json) => Restore(kind, json, true);

        void Restore(PlannerStateKind kind, string json, bool apply)
        {
            switch (kind)
            {
                case PlannerStateKind.PlayerPosition:
                {
                    var p = Parse<PlayerJson>(json, kind);
                    var v = new Vector3(p.x, p.y, p.z);
                    if (float.IsNaN(v.x) || float.IsNaN(v.y) || float.IsNaN(v.z) || float.IsInfinity(v.sqrMagnitude)) throw new PlannerStateException("The saved player position is not a position.");
                    var player = Need(Player, kind);
                    if (apply) player.Teleport(v, p.yaw);
                    break;
                }
                case PlannerStateKind.Inventory:
                {
                    var inv = Parse<InventoryJson>(json, kind);
                    var inventory = Need(Inventory, kind);
                    var slots = (inv.slots ?? new List<SlotJson>()).Select(s => string.IsNullOrEmpty(s.item) ? default : new PlannerInventory.Slot { ItemId = s.item, Count = s.count }).ToList();
                    var pickups = Pickups();
                    var taken = new HashSet<string>(inv.taken ?? new List<string>());
                    var unknown = taken.Where(id => pickups.All(p => p.Placement.ObjectId != id)).ToList();
                    if (unknown.Count > 0) throw new PlannerStateException($"The save says pickups were taken that are not on this map: {string.Join(", ", unknown)}.");
                    inventory.Check(slots);
                    if (!apply) break;
                    inventory.Restore(slots);
                    foreach (var p in pickups) p.SetTaken(taken.Contains(p.Placement.ObjectId));
                    break;
                }
                case PlannerStateKind.Combat:
                {
                    var cj = Parse<CombatJson>(json, kind);
                    var combat = Need(Combat, kind);
                    var enemies = AllEnemies();
                    var unknown = (cj.enemies ?? new List<EnemyJson>()).Where(x => enemies.All(e => IdOf(e) != x.id)).Select(x => x.id).ToList();
                    if (unknown.Count > 0) throw new PlannerStateException($"The save has enemies that are not on this map: {string.Join(", ", unknown)}.");
                    if (float.IsNaN(cj.playerHp) || cj.playerHp <= 0f || (combat.PlayerHealth != null && cj.playerHp > combat.PlayerHealth.Max)) throw new PlannerStateException($"The saved player health {cj.playerHp} does not fit this plan.");
                    if (!apply) break;
                    combat.PlayerHealth.Set(cj.playerHp);
                    foreach (var e in enemies)
                    {
                        var saved = cj.enemies.FirstOrDefault(x => x.id == IdOf(e));
                        if (saved != null) e.SetState(saved.hp, saved.defeated, saved.looted);
                        else e.SetState(e.Health.Max, false, false);
                    }
                    break;
                }
                case PlannerStateKind.Progression:
                {
                    var s = Parse<PlannerProgression.State>(json, kind);
                    var progression = Need(Progression, kind);
                    progression.CheckState(s);
                    if (apply) progression.RestoreState(s);
                    break;
                }
                case PlannerStateKind.Trade:
                {
                    var s = Parse<PlannerTrade.State>(json, kind);
                    var trade = Need(Trade, kind);
                    trade.CheckState(s);
                    if (apply) trade.RestoreState(s);
                    break;
                }
                case PlannerStateKind.Time:
                {
                    var s = Parse<PlannerClock.State>(json, kind);
                    var clock = Need(Clock, kind);
                    clock.CheckState(s);
                    if (apply) clock.RestoreState(s);
                    break;
                }
                case PlannerStateKind.Dialogue:
                {
                    var d = Parse<DialogueJson>(json, kind);
                    var dialogue = Need(Dialogue, kind);
                    var picked = d.picked ?? new List<string>();
                    dialogue.CheckState(picked);
                    if (apply) dialogue.RestoreState(picked);
                    break;
                }
                default:
                {
                    var q = Parse<QuestsJson>(json, kind);
                    var state = new PlannerQuests.State { Graph = q.graph, Active = q.active ?? new List<string>(), Rewarded = q.rewarded ?? new List<string>(), Waiting = q.waiting ?? new List<string>() };
                    var quests = Need(Quests, kind);
                    quests.CheckState(state);
                    if (apply) quests.RestoreState(state);
                    break;
                }
            }
        }

        static T Need<T>(T module, PlannerStateKind kind) where T : UnityEngine.Object =>
            module != null ? module : throw new PlannerStateException($"The scene has no module for the saved state {kind}.");

        static T Parse<T>(string json, PlannerStateKind kind) where T : class
        {
            try
            {
                var v = JsonUtility.FromJson<T>(json);
                if (v == null) throw new ArgumentException("empty");
                return v;
            }
            catch (Exception e) when (!(e is PlannerStateException))
            {
                throw new PlannerStateException($"The saved {kind} is damaged: {e.Message}", e);
            }
        }
    }
}
